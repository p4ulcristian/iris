"""Maya TTS using PyTorch/transformers (fast, works with CUDA 13)."""

import io
import threading
import warnings
import torch
import numpy as np
import soundfile as sf
from transformers import AutoModelForCausalLM, AutoTokenizer
from snac import SNAC

warnings.filterwarnings('ignore')


class MayaPyTorch:
    """Maya TTS with PyTorch backend (fast, CUDA 13 compatible)."""

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
    TEXT_EOT_ID = 128009

    def __init__(self, gpu_memory_utilization: float = 0.4):
        """Initialize Maya with PyTorch backend.

        Args:
            gpu_memory_utilization: Ignored (kept for compatibility)
        """
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = None
        self.tokenizer = None
        self.snac = None
        self._ready = threading.Event()

    def _load_engine(self):
        """Load Maya model and SNAC decoder."""
        print(f"Loading Maya TTS with PyTorch on {self.device}...", flush=True)

        # Load Maya model
        print("Loading Maya model...", flush=True)
        self.model = AutoModelForCausalLM.from_pretrained(
            "maya-research/maya1",
            torch_dtype=torch.bfloat16 if self.device == "cuda" else torch.float32,
            device_map="auto",
            trust_remote_code=True
        )

        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(
            "maya-research/maya1",
            trust_remote_code=True
        )

        # Load SNAC decoder
        print("Loading SNAC audio decoder...", flush=True)
        self.snac = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval()
        if self.device == "cuda":
            self.snac = self.snac.to(self.device)

        print("Maya TTS ready (PyTorch)", flush=True)
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
        return self.model is not None

    def _build_prompt(self, text: str, voice: str) -> str:
        """Build Maya prompt."""
        soh = self.tokenizer.decode([self.SOH_ID])
        eoh = self.tokenizer.decode([self.EOH_ID])
        soa = self.tokenizer.decode([self.SOA_ID])
        sos = self.tokenizer.decode([self.CODE_START_TOKEN_ID])
        eot = self.tokenizer.decode([self.TEXT_EOT_ID])
        bos = self.tokenizer.bos_token

        formatted_text = f'<description="{voice}"> {text}'
        prompt = soh + bos + formatted_text + eot + eoh + soa + sos

        return prompt

    def _extract_snac_codes(self, token_ids):
        """Extract SNAC codes from generated tokens."""
        try:
            eos_idx = token_ids.index(self.CODE_END_TOKEN_ID)
        except ValueError:
            eos_idx = len(token_ids)

        snac_codes = [
            tid for tid in token_ids[:eos_idx]
            if self.SNAC_MIN_ID <= tid <= self.SNAC_MAX_ID
        ]
        return snac_codes

    def _unpack_snac_from_7(self, snac_tokens):
        """Unpack 7-token SNAC frames to 3 hierarchical levels."""
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

    def _decode_audio(self, token_ids):
        """Decode SNAC tokens to audio."""
        snac_tokens = self._extract_snac_codes(token_ids)
        levels = self._unpack_snac_from_7(snac_tokens)

        codes_tensor = [
            torch.tensor(level, dtype=torch.long, device=self.device).unsqueeze(0)
            for level in levels
        ]

        with torch.inference_mode():
            z_q = self.snac.quantizer.from_codes(codes_tensor)
            audio = self.snac.decoder(z_q)[0, 0].cpu().numpy()

        # Trim warmup
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

        # Build prompt
        prompt = self._build_prompt(text, voice)

        # Tokenize
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)

        # Generate
        with torch.inference_mode():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=2048,
                temperature=0.5,
                top_p=0.9,
                repetition_penalty=1.1,
                do_sample=True,
                eos_token_id=self.CODE_END_TOKEN_ID,
                pad_token_id=self.tokenizer.eos_token_id,
            )

        # Extract token IDs
        token_ids = outputs[0].tolist()

        # Decode to audio
        audio = self._decode_audio(token_ids)

        # Convert to WAV bytes
        buffer = io.BytesIO()
        sf.write(buffer, audio, 24000, format='WAV')
        buffer.seek(0)
        return buffer.read()
