#!/usr/bin/env python3
"""Test Maya TTS standalone."""

import warnings
warnings.filterwarnings('ignore')

print("Importing Maya...")
from Maya1.tts_engine import TTSEngine

print("Initializing engine with low memory settings...")
engine = TTSEngine(memory_util=0.15, tp=1, enable_prefix_caching=False, quant_policy=8)

print("Generating test audio...")
audio = engine.generate("Hello, this is a test.", "Female, warm voice")

print(f"Generated audio: {len(audio)} samples")
print("Success!")
