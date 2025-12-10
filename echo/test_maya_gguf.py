#!/usr/bin/env python3
"""Test Maya TTS with GGUF backend."""

import sys
import os

# Add echo to path
sys.path.insert(0, os.path.dirname(__file__))

print("Testing Maya TTS with GGUF/llama.cpp backend...")
print("=" * 60)

from echo.maya_tts import MayaTTS

print("\n[1/4] Creating Maya TTS instance...")
tts = MayaTTS()

print("[2/4] Loading GGUF model (this may take 30-60 seconds)...")
tts._load_engine()

print("[3/4] Generating test audio...")
test_text = "Hello! This is Maya speaking with the GGUF backend. How do I sound?"
audio_bytes = tts.generate(test_text)

print(f"[4/4] Success! Generated {len(audio_bytes)} bytes of audio")

# Save to file
output_file = "/home/paul/Iris/echo/test_gguf_output.wav"
with open(output_file, "wb") as f:
    f.write(audio_bytes)
print(f"\n✓ Audio saved to: {output_file}")
print(f"  Play with: mpv {output_file}")

print("\n" + "=" * 60)
print("GGUF backend test completed successfully!")
print("\nNext steps:")
print("  1. Listen to the audio to verify quality")
print("  2. Compare with vLLM output if available")
print("  3. Test with emotion tags: <laugh>, <whisper>, etc.")
