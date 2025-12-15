#!/usr/bin/env python3
"""Record voice samples for custom wake word verifier training."""

import sys
import json
import wave
import numpy as np
import sounddevice as sd
from pathlib import Path
from datetime import datetime

CONFIG_FILE = Path(__file__).parent.parent.parent / 'config' / 'settings.json'
SAMPLES_DIR = Path(__file__).parent / 'voice_samples'
SAMPLE_RATE = 16000  # Required by openWakeWord


def get_input_device():
    """Get configured input device from settings."""
    try:
        if CONFIG_FILE.exists():
            settings = json.loads(CONFIG_FILE.read_text())
            device_name = settings.get("audio", {}).get("input_device")
            if device_name:
                devices = sd.query_devices()
                for i, d in enumerate(devices):
                    if device_name in d["name"] and d["max_input_channels"] > 0:
                        return i, int(d["default_samplerate"])
    except Exception as e:
        print(f'Error reading audio config: {e}')
    return None, SAMPLE_RATE


def record_sample(duration: float, device: int, native_rate: int) -> np.ndarray:
    """Record a single audio sample."""
    print(f"Recording for {duration} seconds...", end=" ", flush=True)

    # Record at native rate
    audio = sd.rec(
        int(duration * native_rate),
        samplerate=native_rate,
        channels=1,
        dtype=np.float32,
        device=device
    )
    sd.wait()
    print("Done!")

    # Resample to 16kHz if needed
    if native_rate != SAMPLE_RATE:
        import resampy
        audio = resampy.resample(audio.flatten(), native_rate, SAMPLE_RATE)
    else:
        audio = audio.flatten()

    # Convert to int16
    audio_int16 = (audio * 32767).astype(np.int16)
    return audio_int16


def save_wav(audio: np.ndarray, filepath: Path):
    """Save audio as 16-bit 16kHz mono WAV."""
    with wave.open(str(filepath), 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio.tobytes())


def play_sample(filepath: Path):
    """Play back a recorded sample."""
    with wave.open(str(filepath), 'rb') as wf:
        audio = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
        sd.play(audio.astype(np.float32) / 32767, SAMPLE_RATE)
        sd.wait()


def record_session(sample_type: str, count: int = 10, duration: float = 2.0):
    """Record multiple samples of a given type."""
    device, native_rate = get_input_device()
    print(f"Using device at {native_rate}Hz, will resample to {SAMPLE_RATE}Hz")

    # Create output directory
    output_dir = SAMPLES_DIR / sample_type
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    print(f"\n=== Recording {count} {sample_type} samples ===\n")

    for i in range(count):
        input(f"[{i+1}/{count}] Press Enter to start recording...")

        audio = record_sample(duration, device, native_rate)

        filename = f"{sample_type}_{timestamp}_{i+1:02d}.wav"
        filepath = output_dir / filename
        save_wav(audio, filepath)
        print(f"Saved: {filepath}")

        # Play back
        response = input("Play back? (y/n/r to re-record): ").strip().lower()
        if response == 'y':
            play_sample(filepath)
        elif response == 'r':
            print("Re-recording...")
            audio = record_sample(duration, device, native_rate)
            save_wav(audio, filepath)
            print(f"Saved: {filepath}")
            play_sample(filepath)

        print()

    print(f"\nAll {count} {sample_type} samples saved to: {output_dir}")


def list_samples():
    """List all recorded samples."""
    if not SAMPLES_DIR.exists():
        print("No samples recorded yet.")
        return

    for sample_type in ['positive', 'negative']:
        dir_path = SAMPLES_DIR / sample_type
        if dir_path.exists():
            files = sorted(dir_path.glob("*.wav"))
            print(f"\n{sample_type.upper()} samples ({len(files)}):")
            for f in files:
                print(f"  {f.name}")


def play_all(sample_type: str):
    """Play all samples of a given type."""
    dir_path = SAMPLES_DIR / sample_type
    if not dir_path.exists():
        print(f"No {sample_type} samples found.")
        return

    files = sorted(dir_path.glob("*.wav"))
    print(f"\nPlaying {len(files)} {sample_type} samples...")

    for f in files:
        print(f"  Playing: {f.name}")
        play_sample(f)
        response = input("  (Enter to continue, 'd' to delete, 'q' to quit): ").strip().lower()
        if response == 'd':
            f.unlink()
            print(f"  Deleted: {f.name}")
        elif response == 'q':
            break


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python record_samples.py positive    - Record 'hey iris' samples")
        print("  python record_samples.py negative    - Record negative samples")
        print("  python record_samples.py list        - List all samples")
        print("  python record_samples.py play positive/negative - Play samples")
        return

    cmd = sys.argv[1].lower()

    if cmd == 'positive':
        print("\n" + "="*50)
        print("Say 'HEY IRIS' for each recording")
        print("Vary your tone, speed, and distance from mic")
        print("="*50)
        record_session('positive', count=10, duration=2.0)

    elif cmd == 'negative':
        print("\n" + "="*50)
        print("Say ANYTHING EXCEPT 'hey iris'")
        print("Include: random speech, similar phrases, silence")
        print("="*50)
        record_session('negative', count=10, duration=3.0)

    elif cmd == 'list':
        list_samples()

    elif cmd == 'play':
        if len(sys.argv) < 3:
            print("Specify: play positive OR play negative")
            return
        play_all(sys.argv[2].lower())

    else:
        print(f"Unknown command: {cmd}")


if __name__ == '__main__':
    main()
