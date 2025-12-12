#!/usr/bin/env python3
"""Quick test showing multi-sentence batching behavior."""

import re
import io
import numpy as np
import soundfile as sf

def generate_batched_mock(text: str):
    """Mock of generate_batched() showing what happens."""

    print(f"\n{'='*60}")
    print(f"INPUT TEXT:")
    print(f"{'='*60}")
    print(f'"{text}"')
    print()

    # Split sentences (exact same logic as maya_tts.py)
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

    print(f"{'='*60}")
    print(f"STEP 1: Split into {len(sentences)} sentences")
    print(f"{'='*60}")
    for i, s in enumerate(sentences, 1):
        print(f"  {i}. '{s}'")
    print()

    # Mock generation for each sentence
    print(f"{'='*60}")
    print(f"STEP 2: Generate each sentence")
    print(f"{'='*60}")

    sample_rate = 24000
    audio_chunks = []

    for i, sentence in enumerate(sentences, 1):
        sentence = sentence.strip()
        if not sentence:
            continue

        # Mock: create simple audio chunk (sine wave)
        # In real code: wav_bytes = self.generate(sentence, voice=voice)
        duration = 0.5 + (len(sentence) * 0.02)  # Proportional to length
        t = np.linspace(0, duration, int(sample_rate * duration))
        freq = 440 + (i * 50)  # Different frequency per sentence
        audio = (np.sin(2 * np.pi * freq * t) * 0.3).astype(np.float32)

        audio_chunks.append(audio)
        print(f"  {i}. '{sentence[:30]}...' → {len(audio)} samples ({duration:.2f}s)")
        print(f"     [Context cleared via llm.reset()]")

    print()

    # Concatenate (exact same logic as maya_tts.py)
    print(f"{'='*60}")
    print(f"STEP 3: Concatenate all audio")
    print(f"{'='*60}")

    if not audio_chunks:
        print("  No audio chunks!")
        return None

    combined = np.concatenate(audio_chunks)
    print(f"  Combined: {len(combined)} samples")
    print(f"  Duration: {len(combined) / sample_rate:.2f} seconds")
    print()

    # Write as WAV (exact same logic as maya_tts.py)
    print(f"{'='*60}")
    print(f"STEP 4: Write as single WAV file")
    print(f"{'='*60}")

    output = io.BytesIO()
    sf.write(output, combined, sample_rate, format='WAV', subtype='PCM_16')
    output.seek(0)
    wav_bytes = output.read()

    print(f"  WAV file size: {len(wav_bytes):,} bytes")
    print(f"  This is ONE file containing ALL {len(sentences)} sentences")
    print()

    print(f"{'='*60}")
    print(f"STEP 5: Playback")
    print(f"{'='*60}")
    print(f"  paplay /tmp/echo-tts-xxxxx.wav")
    print(f"  → Plays ALL sentences smoothly, NO gaps")
    print()

    return wav_bytes


if __name__ == "__main__":
    # Test with long multi-sentence text
    long_text = """
Hello world. This is the first sentence.
Here comes the second sentence with more words.
The third sentence is even longer than the previous ones.
Fourth sentence keeps the pattern going strong.
And finally, the fifth sentence concludes this test.
    """.strip()

    result = generate_batched_mock(long_text)

    if result:
        print(f"\n{'='*60}")
        print(f"✓ SUCCESS")
        print(f"{'='*60}")
        print(f"Generated single WAV file with 5 sentences concatenated.")
        print(f"Total size: {len(result):,} bytes")
        print(f"\nThis is what Echo will do when you send multi-sentence text.")
        print()
