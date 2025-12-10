#!/usr/bin/env python3
"""Test Maya TTS with vLLM."""

print("Testing Maya with vLLM...")
from echo.maya_tts import MayaTTS

print("Creating engine...")
tts = MayaTTS(memory_util=0.8)  # Use 80% of VRAM

print("Loading model...")
tts._load_engine()

print("Generating test audio...")
audio_bytes = tts.generate("Hello! This is Maya speaking with vLLM.", voice="Female, warm and friendly")

print(f"Success! Generated {len(audio_bytes)} bytes of audio")

# Save to file
with open("test_output.wav", "wb") as f:
    f.write(audio_bytes)
print("Saved to test_output.wav")
