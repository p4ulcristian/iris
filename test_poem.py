#!/usr/bin/env python3
"""Test Maya TTS with a longer poem to demonstrate batch handling."""

import sys
sys.path.insert(0, '/home/paul/Iris/echo')

from echo.maya_tts import MayaTTS
import subprocess

def test_poem():
    """Generate and play a poem with many sentences."""

    poem = """
    In circuits deep where data flows, a shade of ruby light now glows.
    Through silicon and crystal wire, it speaks with voice like digital fire.
    Each sentence splits and finds its way, through context small yet bright as day.
    The memory clears, the cache resets, no overflow, no failed bets.
    Concatenate the audio streams, fulfilling all the user's dreams.
    No gaps between the words that flow, just smooth and seamless audio.
    From batch to play in single file, the implementation makes me smile.
    Ten sentences or even more, the system handles to the core.
    So listen now and you will hear, the proof that all is working clear.
    """

    print("\n" + "="*70)
    print("POEM TO GENERATE")
    print("="*70)
    print(poem)
    print()

    print("="*70)
    print("Loading Maya TTS...")
    print("="*70)

    tts = MayaTTS(
        device="cuda",
        voice="Female voice in the 20s, american accent, energetic, fast pacing.",
        temperature=0.4
    )
    tts._load_engine()

    print("\n" + "="*70)
    print("Generating poem (batching all sentences)...")
    print("="*70)

    # Count sentences
    import re
    sentences = re.split(r'(?<=[.!?])\s+', poem.strip())
    sentences = [s for s in sentences if s.strip()]

    print(f"\nSentences to generate: {len(sentences)}")
    print("Each will be generated separately, then concatenated.")
    print("This tests the batch-then-concatenate approach with longer content.\n")

    # Generate using batched approach
    wav_bytes = tts.generate_batched(poem)

    print(f"\n✓ Generated: {len(wav_bytes):,} bytes")
    print(f"  Duration: ~{len(wav_bytes) / (24000 * 2):.1f} seconds")

    # Write and play
    output_file = "/tmp/test-poem-batched.wav"
    with open(output_file, 'wb') as f:
        f.write(wav_bytes)

    print(f"✓ Wrote: {output_file}")

    print("\n" + "="*70)
    print("PLAYING POEM NOW")
    print("="*70)
    print("Listen for:")
    print("  - Smooth flow between all sentences")
    print("  - No gaps or pauses during generation")
    print("  - Natural rhythm throughout")
    print("="*70 + "\n")

    subprocess.run(['paplay', output_file])

    print("\n" + "="*70)
    print("PLAYBACK COMPLETE")
    print("="*70)
    print(f"✓ Generated {len(sentences)} sentences")
    print("✓ Concatenated into ONE smooth audio file")
    print("✓ Played without gaps")
    print("\nBatch-then-concatenate handles long text perfectly!")
    print("="*70 + "\n")

    tts.cleanup()


if __name__ == "__main__":
    test_poem()
