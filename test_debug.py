#!/usr/bin/env python3
"""Test with debug logging to see what's failing."""

import sys
sys.path.insert(0, '/home/paul/Iris/echo')

from echo.maya_tts import MayaTTS

def test_with_logging():
    """Generate short poem with full logging."""

    # Shorter poem to iterate faster
    poem = """
    First sentence here to test the system.
    Second sentence should also work fine.
    Third sentence might fail who knows.
    Fourth sentence to see the pattern.
    Fifth and final sentence to conclude.
    """

    print("\n" + "="*70)
    print("Loading Maya TTS...")
    print("="*70)

    tts = MayaTTS(
        device="cuda",
        voice="Female voice in the 20s, american accent, energetic.",
        temperature=0.4
    )
    tts._load_engine()

    print("\n" + "="*70)
    print("Generating with debug logging...")
    print("="*70 + "\n")

    # Generate using batched approach - this will show logs for each sentence
    wav_bytes = tts.generate_batched(poem)

    print("\n" + "="*70)
    print(f"DONE: Generated {len(wav_bytes):,} bytes")
    print("="*70)

    # Write and check
    output_file = "/tmp/test-debug.wav"
    with open(output_file, 'wb') as f:
        f.write(wav_bytes)

    print(f"\nWrote: {output_file}")
    print("Check logs above to see which sentences failed and why.")

    tts.cleanup()


if __name__ == "__main__":
    test_with_logging()
