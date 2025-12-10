"""Maya TTS engine wrapper using GGUF/llama.cpp (memory-efficient)."""

from echo.maya_gguf import MayaGGUF


class MayaTTS:
    """Wrapper for Maya TTS with GGUF/llama.cpp backend."""

    # Default voice description
    DEFAULT_VOICE = "Female, in her 30s with an American accent, warm timbre, conversational pacing"

    def __init__(self, memory_util: float = 0.4, tp: int = 1):
        """Initialize Maya TTS (model loads on first use).

        Args:
            memory_util: Ignored (kept for backward compatibility)
            tp: Ignored (kept for backward compatibility)
        """
        self.memory_util = memory_util
        self._engine = MayaGGUF(n_gpu_layers=-1)  # Use all GPU layers

    def _load_engine(self):
        """Load the TTS engine (called lazily)."""
        self._engine._load_engine()

    def load_async(self):
        """Start loading the engine in background."""
        self._engine.load_async()

    def wait_ready(self, timeout: float = 120) -> bool:
        """Wait for engine to be ready."""
        return self._engine.wait_ready(timeout=timeout)

    @property
    def is_ready(self) -> bool:
        """Check if engine is loaded and ready."""
        return self._engine.is_ready

    def generate(self, text: str, voice: str = None, speed: float = 1.0) -> bytes:
        """Generate speech from text.

        Args:
            text: Text to speak
            voice: Voice description (natural language)
            speed: Speech speed multiplier

        Returns:
            WAV audio bytes at 24kHz
        """
        return self._engine.generate(text, voice=voice, speed=speed)
