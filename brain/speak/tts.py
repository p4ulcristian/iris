"""VibeVoice TTS model wrapper."""

import copy
import os
import sys
import logging
from pathlib import Path
from typing import Dict, Iterator, Optional
import threading

# Must set before any torch imports
os.environ.setdefault("CUDA_DEVICE_ORDER", "PCI_BUS_ID")
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")  # RTX 3080

import warnings
warnings.filterwarnings('ignore')

import numpy as np
import torch

MODEL_PATH = "microsoft/VibeVoice-Realtime-0.5B"
GPU_INDEX = 0  # After CUDA_VISIBLE_DEVICES=1, the 3080 becomes device 0
SAMPLE_RATE = 24000
INFERENCE_STEPS = 50

# Voices directory - look in vibevoice project
VOICES_DIR = Path("/home/p4ulcristian/Work/vibevoice/demo/voices/streaming_model")


class TextToSpeech:
    """Text-to-Speech using VibeVoice model."""

    def __init__(self, model_path: str = MODEL_PATH):
        print("[TTS] Loading model...", flush=True)

        # Import vibevoice modules
        sys.path.insert(0, str(Path("/home/p4ulcristian/Work/vibevoice")))
        from vibevoice.modular.modeling_vibevoice_streaming_inference import (
            VibeVoiceStreamingForConditionalGenerationInference,
        )
        from vibevoice.processor.vibevoice_streaming_processor import (
            VibeVoiceStreamingProcessor,
        )
        from vibevoice.modular.streamer import AudioStreamer
        self._AudioStreamer = AudioStreamer

        self.sample_rate = SAMPLE_RATE

        # Load processor
        self.processor = VibeVoiceStreamingProcessor.from_pretrained(model_path)

        # Determine device and dtype
        if torch.cuda.is_available():
            self.device = "cuda"
            self._torch_device = torch.device(f"cuda:{GPU_INDEX}")
            load_dtype = torch.bfloat16
            device_map = f"cuda:{GPU_INDEX}"
            attn_impl = "flash_attention_2"
        else:
            self.device = "cpu"
            self._torch_device = torch.device("cpu")
            load_dtype = torch.float32
            device_map = "cpu"
            attn_impl = "sdpa"

        print(f"[TTS] Using device={self.device}, dtype={load_dtype}", flush=True)

        # Load model
        try:
            self.model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
                model_path,
                torch_dtype=load_dtype,
                device_map=device_map,
                attn_implementation=attn_impl,
            )
        except Exception as e:
            if attn_impl == "flash_attention_2":
                print("[TTS] Flash attention failed, falling back to SDPA", flush=True)
                self.model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
                    model_path,
                    torch_dtype=load_dtype,
                    device_map=device_map,
                    attn_implementation="sdpa",
                )
            else:
                raise e

        self.model.eval()
        self.model.model.noise_scheduler = self.model.model.noise_scheduler.from_config(
            self.model.model.noise_scheduler.config,
            algorithm_type="sde-dpmsolver++",
            beta_schedule="squaredcos_cap_v2",
        )
        self.model.set_ddpm_inference_steps(num_steps=INFERENCE_STEPS)

        # Compile model
        try:
            self.model = torch.compile(self.model, mode="reduce-overhead")
            print("[TTS] Model compiled with torch.compile()", flush=True)
        except Exception as e:
            print(f"[TTS] torch.compile() failed: {e}", flush=True)

        # Load voice presets
        self.voice_presets: Dict[str, Path] = {}
        self._voice_cache: Dict[str, object] = {}
        self.default_voice: Optional[str] = None
        self._load_voice_presets()

        print("[TTS] Model ready", flush=True)

    def _load_voice_presets(self) -> None:
        """Load available voice presets."""
        if not VOICES_DIR.exists():
            print(f"[TTS] Warning: Voices directory not found: {VOICES_DIR}", flush=True)
            return

        for pt_path in VOICES_DIR.glob("*.pt"):
            self.voice_presets[pt_path.stem] = pt_path

        if self.voice_presets:
            self.voice_presets = dict(sorted(self.voice_presets.items()))
            if "en-Emma_woman" in self.voice_presets:
                self.default_voice = "en-Emma_woman"
            else:
                self.default_voice = next(iter(self.voice_presets))
            print(f"[TTS] Found {len(self.voice_presets)} voice presets", flush=True)

    def _get_voice(self, voice_name: Optional[str] = None) -> object:
        """Get cached voice preset data."""
        if not voice_name or voice_name not in self.voice_presets:
            voice_name = self.default_voice

        if voice_name is None:
            raise RuntimeError("No voice presets available")

        if voice_name not in self._voice_cache:
            preset_path = self.voice_presets[voice_name]
            self._voice_cache[voice_name] = torch.load(
                preset_path,
                map_location=self._torch_device,
                weights_only=False,
            )

        return self._voice_cache[voice_name]

    def synthesize(
        self,
        text: str,
        voice: Optional[str] = None,
        cfg_scale: float = 1.5,
    ) -> np.ndarray:
        """
        Synthesize speech from text.

        Args:
            text: Text to synthesize
            voice: Voice preset name (uses default if None)
            cfg_scale: Classifier-free guidance scale

        Returns:
            Audio as float32 numpy array (values in [-1, 1])
        """
        text = text.strip().replace("'", "'")
        if not text:
            return np.array([], dtype=np.float32)

        prefilled_outputs = self._get_voice(voice)

        inputs = self.processor.process_input_with_cached_prompt(
            text=text,
            cached_prompt=prefilled_outputs,
            padding=True,
            return_tensors="pt",
            return_attention_mask=True,
        )

        for k, v in inputs.items():
            if hasattr(v, "to"):
                inputs[k] = v.to(self._torch_device)

        outputs = self.model.generate(
            **inputs,
            max_new_tokens=None,
            cfg_scale=cfg_scale,
            tokenizer=self.processor.tokenizer,
            generation_config={"do_sample": False},
            verbose=False,
            all_prefilled_outputs=copy.deepcopy(prefilled_outputs),
        )

        if outputs.speech_outputs and outputs.speech_outputs[0] is not None:
            audio = outputs.speech_outputs[0]
            if torch.is_tensor(audio):
                audio = audio.detach().cpu().to(torch.float32).numpy()
            else:
                audio = np.asarray(audio, dtype=np.float32)

            if audio.ndim > 1:
                audio = audio.reshape(-1)

            peak = np.max(np.abs(audio)) if audio.size else 0.0
            if peak > 1.0:
                audio = audio / peak

            return audio

        return np.array([], dtype=np.float32)

    def synthesize_stream(
        self,
        text: str,
        voice: Optional[str] = None,
        cfg_scale: float = 1.5,
    ) -> Iterator[np.ndarray]:
        """
        Synthesize speech from text, yielding audio chunks for streaming playback.

        Args:
            text: Text to synthesize
            voice: Voice preset name (uses default if None)
            cfg_scale: Classifier-free guidance scale

        Yields:
            Audio chunks as float32 numpy arrays (values in [-1, 1])
        """
        text = text.strip().replace("'", "'")
        if not text:
            return

        prefilled_outputs = self._get_voice(voice)

        inputs = self.processor.process_input_with_cached_prompt(
            text=text,
            cached_prompt=prefilled_outputs,
            padding=True,
            return_tensors="pt",
            return_attention_mask=True,
        )

        for k, v in inputs.items():
            if hasattr(v, "to"):
                inputs[k] = v.to(self._torch_device)

        audio_streamer = self._AudioStreamer(batch_size=1, stop_signal=None, timeout=None)

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

                peak = np.max(np.abs(chunk)) if chunk.size else 0.0
                if peak > 1.0:
                    chunk = chunk / peak

                yield chunk
        finally:
            audio_streamer.end()
            thread.join()
            if errors:
                raise errors[0]

    def get_voices(self) -> list:
        """Get list of available voice preset names."""
        return list(self.voice_presets.keys())
