"""Canary-Qwen STT model wrapper."""

import os
import sys
import tempfile
import logging

# Must set before any nemo imports
os.environ['NEMO_LOG_LEVEL'] = 'ERROR'
os.environ['HYDRA_FULL_ERROR'] = '0'
logging.disable(logging.WARNING)

import warnings
warnings.filterwarnings('ignore')

# Suppress stdout/stderr spam during import
_stdout, _stderr = sys.stdout, sys.stderr
sys.stdout = sys.stderr = open(os.devnull, 'w')

import numpy as np
import soundfile as sf
from nemo.collections.speechlm2.models import SALM

sys.stdout, sys.stderr = _stdout, _stderr
logging.disable(logging.NOTSET)

MODEL_NAME = "nvidia/canary-qwen-2.5b"
SAMPLE_RATE = 16000


def _quiet():
    """Context manager to suppress stdout/stderr."""
    class Quiet:
        def __enter__(self):
            self._stdout, self._stderr = sys.stdout, sys.stderr
            sys.stdout = sys.stderr = open(os.devnull, 'w')
            return self
        def __exit__(self, *args):
            sys.stdout, sys.stderr = self._stdout, self._stderr
    return Quiet()


class SpeechToText:
    def __init__(self, model_name: str = MODEL_NAME):
        print("Listening...", flush=True)
        with _quiet():
            self.model = SALM.from_pretrained(model_name)
        print("Ready", flush=True)

    def transcribe(self, audio: np.ndarray) -> str:
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            sf.write(f.name, audio, SAMPLE_RATE)
            temp_path = f.name
        try:
            with _quiet():
                answer_ids = self.model.generate(
                    prompts=[[{
                        "role": "user",
                        "content": f"Transcribe the following: {self.model.audio_locator_tag}",
                        "audio": [temp_path]
                    }]],
                    max_new_tokens=128,
                )
            text = self.model.tokenizer.ids_to_text(answer_ids[0].cpu())
            return text.strip()
        finally:
            os.unlink(temp_path)
        return ""
