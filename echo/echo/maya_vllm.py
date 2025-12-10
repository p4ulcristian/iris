"""Maya TTS using vLLM instead of lmdeploy."""

import io
import threading
import warnings
import torch
import numpy as np
import soundfile as sf
from snac import SNAC

warnings.filterwarnings('ignore')


class MayaVLLM:
    """Maya TTS with vLLM backend (Blackwell-compatible)."""

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

    def __init__(self, gpu_memory_utilization: float = 0.4):
        """Initialize Maya with vLLM backend.

        Args:
            gpu_memory_utilization: Fraction of GPU memory to use (0.0-1.0)
        """
        self.gpu_memory_utilization = gpu_memory_utilization
        self._llm = None
        self._tokenizer = None
        self._snac_model = None
        self._ready = threading.Event()

    def _load_engine(self):
        """Load Maya model and SNAC decoder."""
        from vllm import LLM, SamplingParams
        from transformers import AutoTokenizer

        print("Loading Maya TTS model with vLLM (this may take 1-2 minutes)...", flush=True)

        # Load LLM
        self._llm = LLM(
            model="maya-research/maya1",
            gpu_memory_utilization=self.gpu_memory_utilization,
            max_model_len=2048,
            tensor_parallel_size=1,
            trust_remote_code=True,
        )

        # Load tokenizer
        self._tokenizer = AutoTokenizer.from_pretrained(
            "maya-research/maya1",
            trust_remote_code=True
        )

        # Load SNAC decoder
        print("Loading SNAC audio decoder...", flush=True)
        self._snac_model = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval()
        if torch.cuda.is_available():
            self._snac_model = self._snac_model.to("cuda")

        print("Maya TTS ready", flush=True)
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

    def _build_prompt(self, text: str, voice: str) -> str:
        """Build Maya prompt format."""
        soh_token = self._tokenizer.decode([self.SOH_ID])
        eoh_token = self._tokenizer.decode([self.EOH_ID])
        soa_token = self._tokenizer.decode([self.SOA_ID])
        sos_token = self._tokenizer.decode([self.CODE_START_TOKEN_ID])
        eot_token = self._tokenizer.decode([self.TEXT_EOT_ID])
        bos_token = self._tokenizer.bos_token

        formatted_text = f'<description="{voice}"> {text}'

        prompt = (
            soh_token + bos_token + formatted_text + eot_token +
            eoh_token + soa_token + sos_token
        )
        return prompt

    def _extract_snac_codes(self, token_ids: list) -> list:
        """Extract SNAC codes from generated tokens."""
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

    def _decode_audio(self, token_ids: list) -> np.ndarray:
        """Decode SNAC tokens to audio."""
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

        from vllm import SamplingParams

        # Build prompt
        prompt = self._build_prompt(text, voice)

        # Generate tokens
        sampling_params = SamplingParams(
            temperature=0.4,
            top_p=0.9,
            max_tokens=2048,
            repetition_penalty=1.1,
            stop_token_ids=[self.CODE_END_TOKEN_ID],
        )

        outputs = self._llm.generate([prompt], sampling_params, use_tqdm=False)
        token_ids = outputs[0].outputs[0].token_ids

        # Decode to audio
        audio = self._decode_audio(token_ids)

        # Convert to WAV bytes
        buffer = io.BytesIO()
        sf.write(buffer, audio, 24000, format='WAV')
        buffer.seek(0)
        return buffer.read()
