#!/usr/bin/env python3
"""Test real Maya TTS with batch-then-concatenate approach."""

import sys
sys.path.insert(0, '/home/paul/Iris/echo')

from echo.maya_tts import MayaTTS
import subprocess

def test_batched_tts():
    """Test the actual generate_batched() method with real TTS."""

    print("\n" + "="*70)
    print("Loading Maya TTS...")
    print("="*70)

    # Initialize Maya TTS
    tts = MayaTTS(
        device="cuda",
        voice="Female voice in the 20s, american accent, energetic, fast pacing.",
        temperature=0.4
    )

    # Load the model
    tts._load_engine()

    print("\n" + "="*70)
    print("Testing batch-then-concatenate with real speech")
    print("="*70)

    # Multi-sentence test text
    test_text = "Hello there. This is sentence two. And here is sentence three."

    print(f"\nInput text: '{test_text}'")
    print("\nGenerating (this will batch all sentences, then concatenate)...")

    # Call generate_batched (the NEW method)
    wav_bytes = tts.generate_batched(test_text)

    print(f"\nGenerated: {len(wav_bytes):,} bytes")
    print("This is ONE WAV file containing ALL sentences concatenated.")

    # Write to file
    output_file = "/tmp/test-real-tts-batched.wav"
    with open(output_file, 'wb') as f:
        f.write(wav_bytes)

    print(f"Wrote: {output_file}")

    # Play it
    print("\n" + "="*70)
    print("PLAYING NOW - Listen for smooth speech with no gaps!")
    print("="*70 + "\n")

    subprocess.run(['paplay', output_file])

    print("\n" + "="*70)
    print("DONE - You should have heard smooth speech!")
    print("="*70)
    print("If it was smooth with no gaps, the implementation works!")
    print()

    # Cleanup
    tts.cleanup()


if __name__ == "__main__":
    test_batched_tts()
