"""Maya TTS using GGUF/llama.cpp for lower VRAM usage."""

import io
import os
import threading
import warnings
import torch
import numpy as np
import soundfile as sf
from snac import SNAC
from pathlib import Path

warnings.filterwarnings('ignore')


class MayaGGUF:
    """Maya TTS with GGUF/llama.cpp backend (memory-efficient)."""

    DEFAULT_VOICE = "Female, in her 30s with an American accent, warm timbre, conversational pacing"

    # Maya special tokens
    CODE_START_TOKEN_ID = 128257
    CODE_END_TOKEN_ID = 128258
    CODE_TOKEN_OFFSET = 128266
    SNAC_MIN_ID = 128266
    SNAC_MAX_ID = 156937
    SNAC_TOKENS_PER_FRAME = 7
    SOH_ID = 128259
    EOH_ID = 128260
    SOA_ID = 128261
    BOS_ID = 128000
    TEXT_EOT_ID = 128009

    def __init__(self, model_path: str = None, n_gpu_layers: int = -1):
        """Initialize Maya with GGUF/llama.cpp backend.

        Args:
            model_path: Path to GGUF model file (auto-detected if None)
            n_gpu_layers: Number of layers to offload to GPU (-1 = all, 0 = CPU only)
        """
        self.model_path = model_path
        self.n_gpu_layers = n_gpu_layers
        self._llm = None
        self._snac_model = None
        self._ready = threading.Event()

    def _default_model_path(self) -> Path:
        """Find GGUF model path (check env, cache, maya-demo)."""
        # 1. Environment variable
        if "MAYA_GGUF_PATH" in os.environ:
            path = Path(os.environ["MAYA_GGUF_PATH"])
            if path.exists():
                return path

        # 2. Cache directory
        cache_path = Path.home() / ".cache" / "maya" / "maya1-q5_k_m.gguf"
        if cache_path.exists():
            return cache_path

        # 3. maya-demo directory
        demo_path = Path("/home/paul/Work/maya-demo/models/maya1-q5_k_m.gguf")
        if demo_path.exists():
            return demo_path

        raise FileNotFoundError(
            "Maya GGUF model not found. Run: python -m echo.download_gguf"
        )

    def _load_engine(self):
        """Load Maya GGUF model and SNAC decoder."""
        from llama_cpp import Llama

        # Resolve model path
        if self.model_path is None:
            self.model_path = self._default_model_path()

        print(f"Loading Maya GGUF from {self.model_path} (this may take 30-60 seconds)...", flush=True)

        # Load GGUF model with llama.cpp
        self._llm = Llama(
            model_path=str(self.model_path),
            n_ctx=4096,
            n_gpu_layers=self.n_gpu_layers,
            verbose=False,
        )

        # Load SNAC decoder (same as vLLM version)
        print("Loading SNAC audio decoder...", flush=True)
        self._snac_model = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval()
        if torch.cuda.is_available():
            self._snac_model = self._snac_model.to("cuda")

        print("Maya TTS ready (GGUF)", flush=True)
        self._ready.set()

    def load_async(self):
        """Start loading in background."""
        thread = threading.Thread(target=self._load_engine, daemon=True)
        thread.start()

    def wait_ready(self, timeout: float = 120) -> bool:
        """Wait for model to be ready."""
        return self._ready.wait(timeout=timeout)

    @property
    def is_ready(self) -> bool:
        """Check if ready."""
        return self._llm is not None

    def _build_prompt_tokens(self, text: str, voice: str) -> list:
        """Build Maya prompt as token IDs (llama.cpp approach).

        Args:
            text: Text to convert to speech
            voice: Voice description

        Returns:
            List of token IDs for the prompt
        """
        # Format text with voice description
        formatted_text = f'<description="{voice}"> {text}'

        # Tokenize the text content
        text_tokens = self._llm.tokenize(formatted_text.encode(), add_bos=False)

        # Build full prompt with special token IDs
        # Structure: SOH + BOS + text + TEXT_EOT + EOH + SOA + CODE_START
        prompt_tokens = [
            self.SOH_ID,
            self.BOS_ID,
        ] + text_tokens + [
            self.TEXT_EOT_ID,
            self.EOH_ID,
            self.SOA_ID,
            self.CODE_START_TOKEN_ID,
        ]

        return prompt_tokens

    def _extract_snac_codes(self, token_ids: list) -> list:
        """Extract SNAC codes from generated tokens (same as vLLM version)."""
        try:
            eos_idx = token_ids.index(self.CODE_END_TOKEN_ID)
        except ValueError:
            eos_idx = len(token_ids)

        snac_codes = [
            token_id for token_id in token_ids[:eos_idx]
            if self.SNAC_MIN_ID <= token_id <= self.SNAC_MAX_ID
        ]
        return snac_codes

    def _unpack_snac_from_7(self, snac_tokens: list) -> list:
        """Unpack 7-token SNAC frames to 3 hierarchical levels (same as vLLM version)."""
        if snac_tokens and snac_tokens[-1] == self.CODE_END_TOKEN_ID:
            snac_tokens = snac_tokens[:-1]

        frames = len(snac_tokens) // self.SNAC_TOKENS_PER_FRAME
        snac_tokens = snac_tokens[:frames * self.SNAC_TOKENS_PER_FRAME]

        if frames == 0:
            return [[], [], []]

        l1, l2, l3 = [], [], []

        for i in range(frames):
            slots = snac_tokens[i*7:(i+1)*7]
            l1.append((slots[0] - self.CODE_TOKEN_OFFSET) % 4096)
            l2.extend([
                (slots[1] - self.CODE_TOKEN_OFFSET) % 4096,
                (slots[4] - self.CODE_TOKEN_OFFSET) % 4096,
            ])
            l3.extend([
                (slots[2] - self.CODE_TOKEN_OFFSET) % 4096,
                (slots[3] - self.CODE_TOKEN_OFFSET) % 4096,
                (slots[5] - self.CODE_TOKEN_OFFSET) % 4096,
                (slots[6] - self.CODE_TOKEN_OFFSET) % 4096,
            ])

        return [l1, l2, l3]

    def _decode_audio(self, token_ids: list) -> np.ndarray:
        """Decode SNAC tokens to audio (same as vLLM version)."""
        snac_tokens = self._extract_snac_codes(token_ids)
        levels = self._unpack_snac_from_7(snac_tokens)

        device = "cuda" if torch.cuda.is_available() else "cpu"
        codes_tensor = [
            torch.tensor(level, dtype=torch.long, device=device).unsqueeze(0)
            for level in levels
        ]

        with torch.inference_mode():
            z_q = self._snac_model.quantizer.from_codes(codes_tensor)
            audio = self._snac_model.decoder(z_q)[0, 0].cpu().numpy()

        # Trim initial samples
        if len(audio) > 2048:
            audio = audio[2048:]

        return audio

    def generate(self, text: str, voice: str = None, speed: float = 1.0) -> bytes:
        """Generate speech from text.

        Args:
            text: Text to speak
            voice: Voice description (natural language)
            speed: Speed multiplier (not used, for compatibility)

        Returns:
            WAV audio bytes at 24kHz
        """
        if not self._ready.wait(timeout=120):
            raise RuntimeError("Maya TTS not ready")

        if voice is None:
            voice = self.DEFAULT_VOICE

        # Build prompt as token IDs
        prompt_tokens = self._build_prompt_tokens(text, voice)

        # Generate tokens using llama.cpp
        generated_tokens = []
        for token in self._llm.generate(
            prompt_tokens,
            top_p=0.9,
            temp=0.4,
            repeat_penalty=1.1,
        ):
            generated_tokens.append(token)
            if token == self.CODE_END_TOKEN_ID or len(generated_tokens) > 2048:
                break

        # Decode to audio
        audio = self._decode_audio(generated_tokens)

        # Convert to WAV bytes
        buffer = io.BytesIO()
        sf.write(buffer, audio, 24000, format='WAV')
        buffer.seek(0)
        return buffer.read()
