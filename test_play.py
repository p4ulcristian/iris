#!/usr/bin/env python3
"""Create and play concatenated audio to demonstrate smooth playback."""

import numpy as np
import wave
import subprocess

def create_test_audio():
    """Create test audio: 5 'sentences' as different tones, concatenated."""

    sample_rate = 24000

    print("\n" + "="*60)
    print("Creating test audio (5 sentences as different tones)")
    print("="*60)

    chunks = []

    # 5 sentences = 5 different frequencies
    frequencies = [440, 554, 659, 784, 880]  # A, C#, E, G#, A (musical notes)

    for i, freq in enumerate(frequencies, 1):
        duration = 0.8  # Each sentence ~0.8 seconds
        t = np.linspace(0, duration, int(sample_rate * duration))

        # Create sine wave with envelope (fade in/out for smoothness)
        audio = np.sin(2 * np.pi * freq * t)

        # Apply fade in/out to make it smooth
        fade_samples = int(0.05 * sample_rate)  # 50ms fade
        fade_in = np.linspace(0, 1, fade_samples)
        fade_out = np.linspace(1, 0, fade_samples)
        audio[:fade_samples] *= fade_in
        audio[-fade_samples:] *= fade_out

        audio = (audio * 0.3).astype(np.float32)

        chunks.append(audio)
        print(f"  Sentence {i}: {freq}Hz tone, {duration}s ({len(audio)} samples)")

    print("\nConcatenating all chunks...")
    combined = np.concatenate(chunks)

    print(f"  Combined: {len(combined)} samples = {len(combined)/sample_rate:.2f}s")
    print(f"  If this was progressive playback, you'd hear gaps.")
    print(f"  With concatenation: SMOOTH, NO GAPS")

    return combined, sample_rate


def write_wav(audio, sample_rate, filename):
    """Write audio to WAV file."""
    # Convert float32 to int16
    audio_int16 = (audio * 32767).astype(np.int16)

    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_int16.tobytes())

    print(f"\nWrote: {filename}")


if __name__ == "__main__":
    # Create test audio
    combined, sample_rate = create_test_audio()

    # Write to file
    output_file = "/tmp/test-concatenated.wav"
    write_wav(combined, sample_rate, output_file)

    # Play it
    print("\n" + "="*60)
    print("PLAYING NOW - Listen for smooth transitions!")
    print("="*60)
    print("You should hear 5 tones (A C# E G# A) flowing smoothly.")
    print("NO GAPS = concatenation works correctly.")
    print("="*60 + "\n")

    subprocess.run(['paplay', output_file])

    print("\n" + "="*60)
    print("That's what your TTS will sound like:")
    print("  - Each tone = one sentence of speech")
    print("  - Smooth flow = no gaps between sentences")
    print("  - ONE playback call = efficient")
    print("="*60 + "\n")
