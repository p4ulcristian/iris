"""
Local LLM brain module using vLLM for ultra-fast inference.

Default model: Qwen3-8B-FP8 (80-120 tok/s)
Backend: vLLM with PagedAttention (2-3x faster than Ollama)
"""

from .client import LocalBrain

__all__ = ["LocalBrain"]
