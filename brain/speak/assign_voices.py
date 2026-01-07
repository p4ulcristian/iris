#!/usr/bin/env python3
"""
Assign LibriTTS-R voices to gods based on gender.
Keeps Zeus's current voice.
"""

import os
import shutil
from pathlib import Path
import subprocess

# Paths
LIBRITTS_DIR = Path("/tmp/libritts/LibriTTS_R/dev-clean")
VOICES_DIR = Path(__file__).parent / "voices"
BACKUP_DIR = VOICES_DIR / "pre_libritts_backup"

# God assignments: god_name -> (gender, speaker_id)
# Male gods get male speakers, female gods get female speakers
ASSIGNMENTS = {
    # Zeus - KEEP CURRENT (don't touch)

    # Male gods (M)
    "apollo": ("M", 174),       # Peter Eastman
    "ares": ("M", 251),         # Mark Nelson
    "hades": ("M", 1272),       # John Rose
    "hermes": ("M", 2086),      # Nicodemus
    "poseidon": ("M", 2428),    # Stephen Kinford
    "dionysus": ("M", 2803),    # aquielisunari
    "hephaestus": ("M", 3000),  # Brian von Dedenroth

    # Female gods (F)
    "artemis": ("F", 1462),     # E. Tavano
    "athena": ("F", 1673),      # Tonia
    "aphrodite": ("F", 1988),   # Ransom
    "demeter": ("F", 2035),     # Sharon Bautista
    "hera": ("F", 2078),        # Kathy Caver
    "nocturna": ("F", 403),     # LibriTTS speaker 403
}

def get_speaker_wavs(speaker_id: int, min_duration: float = 20.0) -> list:
    """Get WAV files from a speaker until we have enough duration."""
    speaker_dir = LIBRITTS_DIR / str(speaker_id)
    if not speaker_dir.exists():
        print(f"  Warning: Speaker {speaker_id} not found")
        return []

    wavs = []
    total_duration = 0.0

    # Find all wav files for this speaker
    for chapter_dir in sorted(speaker_dir.iterdir()):
        if not chapter_dir.is_dir():
            continue
        for wav_file in sorted(chapter_dir.glob("*.wav")):
            # Get duration using ffprobe
            try:
                result = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries",
                     "format=duration", "-of", "default=noprint_wrappers=1:nokey=1",
                     str(wav_file)],
                    capture_output=True, text=True
                )
                duration = float(result.stdout.strip()) if result.returncode == 0 else 5.0
            except:
                duration = 5.0  # Estimate

            wavs.append(wav_file)
            total_duration += duration

            if total_duration >= min_duration:
                return wavs

    return wavs

def concatenate_wavs(wav_files: list, output_path: Path):
    """Concatenate WAV files using ffmpeg."""
    if not wav_files:
        return False

    # Create file list for ffmpeg concat
    list_path = output_path.parent / "concat_list.txt"
    with open(list_path, "w") as f:
        for wav in wav_files:
            f.write(f"file '{wav}'\n")

    # Use ffmpeg to concatenate
    cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(list_path), "-c", "copy", str(output_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    list_path.unlink()  # Clean up
    return result.returncode == 0

def main():
    print("Assigning LibriTTS-R voices to gods")
    print(f"Source: {LIBRITTS_DIR}")
    print(f"Target: {VOICES_DIR}")
    print()

    # Create backup
    BACKUP_DIR.mkdir(exist_ok=True)

    for god_name, (gender, speaker_id) in ASSIGNMENTS.items():
        print(f"\n{god_name.upper()} ({gender}) <- Speaker {speaker_id}")

        voice_path = VOICES_DIR / f"{god_name}.wav"

        # Backup existing
        if voice_path.exists():
            backup_path = BACKUP_DIR / f"{god_name}.wav"
            if not backup_path.exists():
                print(f"  Backing up existing voice...")
                shutil.copy2(voice_path, backup_path)

        # Get speaker WAVs
        wavs = get_speaker_wavs(speaker_id)
        if not wavs:
            print(f"  ERROR: No WAVs found for speaker {speaker_id}")
            continue

        print(f"  Found {len(wavs)} WAV files")

        # Concatenate to temp file
        temp_path = VOICES_DIR / f"{god_name}_raw.wav"
        if concatenate_wavs(wavs, temp_path):
            # Move to final location
            shutil.move(temp_path, voice_path)
            print(f"  Created {voice_path.name}")
        else:
            print(f"  ERROR: Failed to concatenate")

    print("\n" + "="*50)
    print("Done! Now run normalize_voices.py to process them.")
    print("Zeus was NOT modified.")

if __name__ == "__main__":
    main()
