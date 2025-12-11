"""VibeVoice TTS engine wrapper for Echo."""

import os
import io
import copy
import threading
from pathlib import Path
from typing import Iterator, Optional, Dict, Any

import torch
import numpy as np
import soundfile as sf

from vibevoice.modular.modeling_vibevoice_streaming_inference import (
    VibeVoiceStreamingForConditionalGenerationInference,
)
from vibevoice.processor.vibevoice_streaming_processor import (
    VibeVoiceStreamingProcessor,
)
from vibevoice.modular.streamer import AudioStreamer


# Model paths
REALTIME_MODEL = "microsoft/VibeVoice-Realtime-0.5B"
QUALITY_MODEL = "microsoft/VibeVoice-1.5B"  # Not yet supported

# Voices directory (relative to vibevoice package)
VOICES_DIR = Path("/home/paul/Work/vibevoice/demo/voices/streaming_model")

# Sample rate
SAMPLE_RATE = 24000

# Default settings
DEFAULT_VOICE = "en-Emma_woman"
DEFAULT_CFG_SCALE = 1.5
DEFAULT_INFERENCE_STEPS = 5

# Sentinel for stream end detection (must be unique object, not None)
_STREAM_END = object()


class VibeVoiceTTS:
    """VibeVoice TTS engine for Echo.

    Currently supports the 0.5B Realtime model for streaming generation.
    """

    def __init__(
        self,
        model_type: str = "realtime",
        device: str = "cuda",
        inference_steps: int = DEFAULT_INFERENCE_STEPS,
    ):
        """Initialize VibeVoice TTS.

        Args:
            model_type: "realtime" (0.5B) or "quality" (1.5B, not yet supported)
            device: "cuda" or "cpu"
            inference_steps: Number of diffusion steps (default 5)
        """
        self.model_type = model_type
        self.device = device
        self.inference_steps = inference_steps
        self.sample_rate = SAMPLE_RATE

        self.processor: Optional[VibeVoiceStreamingProcessor] = None
        self.model: Optional[VibeVoiceStreamingForConditionalGenerationInference] = None
        self._voice_cache: Dict[str, Any] = {}
        self._torch_device = torch.device(device)
        self._ready = False

        if model_type == "quality":
            print("Warning: 1.5B quality model not yet supported, using realtime model", flush=True)
            self.model_type = "realtime"

    @property
    def is_ready(self) -> bool:
        """Check if the engine is loaded and ready."""
        return self._ready

    def _load_engine(self):
        """Load the TTS model (blocking)."""
        model_path = REALTIME_MODEL if self.model_type == "realtime" else QUALITY_MODEL

        print(f"Loading VibeVoice TTS ({self.model_type})...", flush=True)

        # Load processor
        self.processor = VibeVoiceStreamingProcessor.from_pretrained(model_path)

        # Determine dtype and attention implementation
        if self.device == "cuda":
            load_dtype = torch.bfloat16
            device_map = "cuda"
            attn_impl = "flash_attention_2"
        else:
            load_dtype = torch.float32
            device_map = "cpu"
            attn_impl = "sdpa"

        # Load model with fallback to SDPA
        try:
            self.model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
                model_path,
                torch_dtype=load_dtype,
                device_map=device_map,
                attn_implementation=attn_impl,
            )
        except Exception as e:
            if attn_impl == "flash_attention_2":
                print("Falling back to SDPA attention...", flush=True)
                self.model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
                    model_path,
                    torch_dtype=load_dtype,
                    device_map=device_map,
                    attn_implementation="sdpa",
                )
            else:
                raise e

        self.model.eval()

        # Configure noise scheduler
        self.model.model.noise_scheduler = self.model.model.noise_scheduler.from_config(
            self.model.model.noise_scheduler.config,
            algorithm_type="sde-dpmsolver++",
            beta_schedule="squaredcos_cap_v2",
        )
        self.model.set_ddpm_inference_steps(num_steps=self.inference_steps)

        # Preload default voice
        self._get_voice_preset(DEFAULT_VOICE)

        self._ready = True
        print("VibeVoice TTS ready", flush=True)

    def _get_voice_preset(self, voice_name: str) -> Any:
        """Load a voice preset, caching for reuse."""
        if voice_name not in self._voice_cache:
            # Try exact match first
            preset_path = VOICES_DIR / f"{voice_name}.pt"

            if not preset_path.exists():
                # Try partial match
                for pt_file in VOICES_DIR.glob("*.pt"):
                    if voice_name.lower() in pt_file.stem.lower():
                        preset_path = pt_file
                        break

            if not preset_path.exists():
                # Fall back to default
                preset_path = VOICES_DIR / f"{DEFAULT_VOICE}.pt"
                print(f"Voice '{voice_name}' not found, using {DEFAULT_VOICE}", flush=True)

            self._voice_cache[voice_name] = torch.load(
                preset_path,
                map_location=self._torch_device,
                weights_only=False,
            )

        return self._voice_cache[voice_name]

    def stream(
        self,
        text: str,
        voice: str = DEFAULT_VOICE,
        cfg_scale: float = DEFAULT_CFG_SCALE,
        stop_event: Optional[threading.Event] = None,
    ) -> Iterator[np.ndarray]:
        """Generate speech, yielding audio chunks.

        Args:
            text: Text to synthesize
            voice: Voice preset name
            cfg_scale: Classifier-free guidance scale
            stop_event: Event to signal early stopping

        Yields:
            numpy arrays of float32 audio samples at 24kHz
        """
        if not text.strip():
            return

        text = text.replace("'", "'")
        prefilled_outputs = self._get_voice_preset(voice)

        # Prepare inputs
        inputs = self.processor.process_input_with_cached_prompt(
            text=text.strip(),
            cached_prompt=prefilled_outputs,
            padding=True,
            return_tensors="pt",
            return_attention_mask=True,
        )

        # Move to device
        for k, v in inputs.items():
            if hasattr(v, "to"):
                inputs[k] = v.to(self._torch_device)

        # Set up streaming (use sentinel object for stop signal, not None)
        audio_streamer = AudioStreamer(batch_size=1, stop_signal=_STREAM_END, timeout=None)
        stop_signal = stop_event or threading.Event()
        errors = []

        def run_generation():
            try:
                self.model.generate(
                    **inputs,
                    max_new_tokens=None,
                    cfg_scale=cfg_scale,
                    tokenizer=self.processor.tokenizer,
                    generation_config={"do_sample": False},
                    audio_streamer=audio_streamer,
                    stop_check_fn=stop_signal.is_set,
                    verbose=False,
                    all_prefilled_outputs=copy.deepcopy(prefilled_outputs),
                )
            except Exception as e:
                errors.append(e)
                audio_streamer.end()

        thread = threading.Thread(target=run_generation, daemon=True)
        thread.start()

        try:
            stream = audio_streamer.get_stream(0)
            for chunk in stream:
                if torch.is_tensor(chunk):
                    chunk = chunk.detach().cpu().to(torch.float32).numpy()
                else:
                    chunk = np.asarray(chunk, dtype=np.float32)

                if chunk.ndim > 1:
                    chunk = chunk.reshape(-1)

                # Normalize to prevent clipping
                peak = np.max(np.abs(chunk)) if chunk.size else 0.0
                if peak > 1.0:
                    chunk = chunk / peak

                yield chunk.astype(np.float32, copy=False)
        finally:
            stop_signal.set()
            audio_streamer.end()
            thread.join(timeout=5.0)
            if errors:
                raise errors[0]

    def generate(
        self,
        text: str,
        voice: str = DEFAULT_VOICE,
        speed: float = 1.0,  # Ignored for now, kept for API compatibility
    ) -> bytes:
        """Generate speech and return WAV bytes.

        This is the main API for Echo compatibility with MayaTTS interface.

        Args:
            text: Text to synthesize
            voice: Voice preset name
            speed: Speech speed (currently ignored)

        Returns:
            WAV audio bytes at 24kHz
        """
        # Collect all audio chunks
        chunks = list(self.stream(text, voice=voice))

        if not chunks:
            # Return silent audio if nothing generated
            return self._empty_wav()

        # Concatenate all chunks
        audio = np.concatenate(chunks)

        # Convert to WAV bytes
        buffer = io.BytesIO()
        sf.write(buffer, audio, self.sample_rate, format='WAV', subtype='PCM_16')
        buffer.seek(0)
        return buffer.read()

    def _empty_wav(self) -> bytes:
        """Return empty WAV file bytes."""
        buffer = io.BytesIO()
        sf.write(buffer, np.zeros(1000, dtype=np.float32), self.sample_rate, format='WAV', subtype='PCM_16')
        buffer.seek(0)
        return buffer.read()

    def cleanup(self):
        """Release model and free GPU memory."""
        if self.model is not None:
            del self.model
            self.model = None
        if self.processor is not None:
            del self.processor
            self.processor = None
        self._voice_cache.clear()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        self._ready = False
