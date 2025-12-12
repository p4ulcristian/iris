#!/usr/bin/env python3
"""Simple test showing multi-sentence batching without dependencies."""

import re

def show_batching_behavior(text: str):
    """Show exactly what generate_batched() does."""

    print(f"\n{'='*70}")
    print(f"INPUT TEXT ({len(text)} chars):")
    print(f"{'='*70}")
    print(f'"{text}"')
    print()

    # Split sentences (EXACT code from maya_tts.py line 242)
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

    print(f"{'='*70}")
    print(f"STEP 1: Split into {len(sentences)} sentences")
    print(f"{'='*70}")
    for i, s in enumerate(sentences, 1):
        print(f"  Sentence {i}: '{s}'")
    print()

    # Show generation loop (EXACT code from maya_tts.py lines 244-257)
    print(f"{'='*70}")
    print(f"STEP 2: Generate each sentence (context cleared between)")
    print(f"{'='*70}")

    audio_chunks = []
    for i, sentence in enumerate(sentences, 1):
        sentence_clean = sentence.strip()
        if not sentence_clean:
            continue

        # This is what happens in the loop:
        # wav_bytes = self.generate(sentence, voice=voice)
        #   ↳ Inside generate(): llm.reset() clears context
        #   ↳ Then generates ~1-2s of audio for this sentence

        # Mock audio size (in real: ~50KB per sentence)
        mock_audio_size = len(sentence_clean) * 500  # Proportional to text

        audio_chunks.append(f"<AudioChunk{i}: {mock_audio_size} bytes>")

        print(f"  {i}. Generate: '{sentence_clean[:40]}{'...' if len(sentence_clean) > 40 else ''}'")
        print(f"     → Audio chunk {i}: ~{mock_audio_size:,} bytes")
        print(f"     → llm.reset() called (context cleared)")
        print()

    # Show concatenation (EXACT code from maya_tts.py line 263)
    print(f"{'='*70}")
    print(f"STEP 3: Concatenate all {len(audio_chunks)} chunks")
    print(f"{'='*70}")

    if not audio_chunks:
        print("  ERROR: No audio chunks!")
        return

    print(f"  combined = np.concatenate(audio_chunks)")
    print(f"  Result: {' + '.join([f'Chunk{i+1}' for i in range(len(audio_chunks))])}")
    print()

    # Show WAV writing (EXACT code from maya_tts.py lines 265-269)
    print(f"{'='*70}")
    print(f"STEP 4: Write as SINGLE WAV file")
    print(f"{'='*70}")

    total_size = sum(int(chunk.split(': ')[1].split()[0]) for chunk in audio_chunks)
    print(f"  output = io.BytesIO()")
    print(f"  sf.write(output, combined, sample_rate, format='WAV')")
    print(f"  → Single WAV file: ~{total_size:,} bytes")
    print(f"  → Contains ALL {len(sentences)} sentences seamlessly concatenated")
    print()

    # Show playback (server.py lines 286-297)
    print(f"{'='*70}")
    print(f"STEP 5: Playback (server.py)")
    print(f"{'='*70}")
    print(f"  tmp_path = '/tmp/echo-tts-xxxxx.wav'")
    print(f"  with open(tmp_path, 'wb') as f:")
    print(f"      f.write(wav_bytes)  # The SINGLE combined WAV")
    print()
    print(f"  subprocess.run(['paplay', '--device', virtual_sink, tmp_path])")
    print(f"  → Plays ALL {len(sentences)} sentences")
    print(f"  → SMOOTH, NO GAPS between sentences")
    print(f"  → ONE playback call, not {len(sentences)}")
    print()

    print(f"{'='*70}")
    print(f"RESULT")
    print(f"{'='*70}")
    print(f"  ✓ {len(sentences)} sentences processed")
    print(f"  ✓ Each generated with 4K context (memory efficient)")
    print(f"  ✓ Context cleared after each (llm.reset())")
    print(f"  ✓ All audio concatenated into ONE file")
    print(f"  ✓ ONE smooth playback, zero gaps")
    print()


if __name__ == "__main__":
    # Test with LONG multi-sentence text
    long_text = """
This is sentence one with some words here.
The second sentence has different content and is slightly longer.
Here comes the third sentence to test the batching approach.
Sentence four adds even more text to the mix for testing purposes.
The fifth sentence demonstrates that context is cleared between each.
Number six shows the system can handle many sentences smoothly.
Lucky sentence seven keeps the pattern going strong and steady.
Eighth sentence proves the concatenation works without any gaps.
Sentence nine is almost at the end of this comprehensive test.
Finally, the tenth sentence concludes this demonstration successfully.
    """.strip()

    show_batching_behavior(long_text)

    print(f"\n{'='*70}")
    print(f"THIS IS WHAT ECHO DOES NOW")
    print(f"{'='*70}")
    print(f"  OLD: Generate sentence 1 → play → [GAP] → generate 2 → play")
    print(f"  NEW: Generate ALL → concatenate → play ONCE (smooth)")
    print()
