"""
Local LLM client using vLLM for running Qwen3 with tool use support.
Ultra-fast inference: 80-120 tok/s (2-3x faster than Ollama).
"""

import json
import os
import subprocess
from typing import Any, Optional, Iterator


class LocalBrain:
    """Client for interacting with local LLMs via vLLM."""

    def __init__(
        self,
        model: str = "Qwen/Qwen3-8B-FP8",
        use_server: bool = True,
        server_url: str = "http://localhost:8000"
    ):
        """
        Initialize LocalBrain client with vLLM.

        Args:
            model: The vLLM model to use (default: Qwen/Qwen3-8B-FP8)
            use_server: Use vLLM server mode (recommended, more stable)
            server_url: vLLM server URL (default: http://localhost:8000)
        """
        self.model = model
        self.use_server = use_server
        self.server_url = server_url
        self.llm = None
        self.client = None

    def is_vllm_server_running(self) -> bool:
        """Check if vLLM server is running."""
        try:
            from openai import OpenAI
            client = OpenAI(
                api_key="EMPTY",
                base_url=f"{self.server_url}/v1"
            )
            client.models.list()
            return True
        except Exception:
            return False

    def start_server(
        self,
        gpu_id: int = 1,
        gpu_memory_utilization: float = 0.75,
        max_model_len: int = 4096,
        port: int = 8000
    ) -> subprocess.Popen:
        """
        Start vLLM server in background.

        Args:
            gpu_id: GPU device ID (default: 1 for RTX 5060 Ti)
            gpu_memory_utilization: GPU memory utilization (default: 0.75)
            max_model_len: Maximum context length (default: 4096)
            port: Server port (default: 8000)

        Returns:
            Subprocess handle
        """
        env = os.environ.copy()
        env['CUDA_VISIBLE_DEVICES'] = str(gpu_id)

        cmd = [
            'vllm', 'serve', self.model,
            '--gpu-memory-utilization', str(gpu_memory_utilization),
            '--max-model-len', str(max_model_len),
            '--port', str(port),
            '--trust-remote-code',
            '--enable-auto-tool-choice',
            '--tool-call-parser', 'hermes'
        ]

        print(f"Starting vLLM server on GPU {gpu_id}...")
        process = subprocess.Popen(cmd, env=env)
        return process

    def list_models(self) -> list[dict[str, Any]]:
        """
        List available vLLM models.

        Returns:
            List of model information dictionaries
        """
        if self.use_server and self.is_vllm_server_running():
            try:
                from openai import OpenAI
                client = OpenAI(
                    api_key="EMPTY",
                    base_url=f"{self.server_url}/v1"
                )
                models = client.models.list()
                return [{"name": model.id} for model in models.data]
            except Exception as e:
                print(f"Error listing models: {e}")
                return []
        else:
            return [{"name": self.model}]

    def _init_vllm_direct(self):
        """Initialize vLLM in direct mode (loads model in-process)."""
        if self.llm is not None:
            return

        from vllm import LLM

        # Set GPU device
        os.environ['CUDA_VISIBLE_DEVICES'] = '1'
        os.environ['VLLM_USE_V1'] = '0'  # Use V0 engine for stability

        self.llm = LLM(
            model=self.model,
            gpu_memory_utilization=0.75,
            max_model_len=4096,
            trust_remote_code=True,
        )

    def _init_vllm_server(self):
        """Initialize vLLM in server mode (connects to vLLM server)."""
        if self.client is not None:
            return

        from openai import OpenAI

        self.client = OpenAI(
            api_key="EMPTY",
            base_url=f"{self.server_url}/v1"
        )

    def chat(
        self,
        message: str,
        system_prompt: Optional[str] = None,
        tools: Optional[list[dict]] = None,
        stream: bool = False,
        temperature: float = 0.7,
        max_tokens: int = 2048
    ) -> str | Iterator[str]:
        """
        Send a chat message to the local LLM.

        Args:
            message: User message
            system_prompt: Optional system prompt
            tools: Optional list of tool definitions for function calling
            stream: Whether to stream the response
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate

        Returns:
            Model response (string or iterator if streaming)
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": message})

        if self.use_server:
            return self._chat_server(messages, tools, stream, temperature, max_tokens)
        else:
            return self._chat_direct(messages, tools, stream, temperature, max_tokens)

    def _chat_server(
        self,
        messages: list[dict],
        tools: Optional[list[dict]],
        stream: bool,
        temperature: float,
        max_tokens: int
    ) -> str | Iterator[str]:
        """Chat using vLLM server mode."""
        self._init_vllm_server()

        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream
        }
        if tools:
            kwargs["tools"] = tools

        response = self.client.chat.completions.create(**kwargs)

        if stream:
            def stream_generator():
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            return stream_generator()
        else:
            return response.choices[0].message.content

    def _chat_direct(
        self,
        messages: list[dict],
        tools: Optional[list[dict]],
        stream: bool,
        temperature: float,
        max_tokens: int
    ) -> str | Iterator[str]:
        """Chat using direct vLLM mode."""
        self._init_vllm_direct()

        from vllm import SamplingParams
        from transformers import AutoTokenizer

        # Load tokenizer
        tokenizer = AutoTokenizer.from_pretrained(self.model, trust_remote_code=True)

        # Format prompt
        kwargs = {"tokenize": False, "add_generation_prompt": True}
        if tools:
            kwargs["tools"] = tools

        prompt = tokenizer.apply_chat_template(messages, **kwargs)

        # Sampling parameters
        sampling_params = SamplingParams(
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream
        )

        # Generate
        if stream:
            def stream_generator():
                for output in self.llm.generate([prompt], sampling_params, use_tqdm=False):
                    if output.outputs:
                        yield output.outputs[0].text
            return stream_generator()
        else:
            output = self.llm.generate([prompt], sampling_params, use_tqdm=False)
            return output[0].outputs[0].text

    def interactive_chat(self) -> None:
        """
        Start an interactive chat session with the model.

        Note: This mode is not recommended for vLLM.
        Use the TUI instead: python -m brain.local_brain tui
        """
        print(f"Interactive mode not available for vLLM.")
        print(f"Use the TUI instead: python -m brain.local_brain tui")
        print(f"\nOr use single messages: python -m brain.local_brain chat \"your message\"")
