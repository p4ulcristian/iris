#!/usr/bin/env python3
"""Download LibriTTS voice samples from HuggingFace for god voices.

Usage:
    uv run --with huggingface_hub --with pandas python download_voices.py
    uv run --with huggingface_hub --with pandas python download_voices.py list F
    uv run --with huggingface_hub --with pandas python download_voices.py preview 19 nyx
"""

import csv
from pathlib import Path
from huggingface_hub import hf_hub_download, list_repo_files

VOICES_DIR = Path(__file__).parent / "voices"
REPO_ID = "sdialog/voices-libritts"

# God -> LibriTTS speaker ID mapping
# Female: 19, 40, 84, 103
# Male: 61, 87, 118, 127
GODS = {
    # Female
    # nyx = nocturna (already have)
    # selene = luisa (already have)
    "hera": 103,        # Karen Savage - commanding
    "athena": 57,       # Ophelia Darcy - elegant
    # Male
    "prometheus": 118,  # Alex Buie
    "morpheus": 61,     # Paul-Gabriel Wiener
    "poseidon": 55,     # David Jaquay - deep
    "zeus": 127,        # John Hicken - authoritative
}


def get_metadata():
    """Download and parse metadata.csv."""
    meta_path = hf_hub_download(REPO_ID, "metadata.csv", repo_type="dataset")
    speakers = {}
    with open(meta_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            speakers[int(row["identifier"])] = {
                "gender": row["gender"],
                "name": row["name"],
                "file": row["file_name"],  # e.g. "audio/14_Kristin_LeMoine.wav"
            }
    return speakers


def download_voices():
    """Download voice samples for all gods."""
    print("Fetching metadata...")
    speakers = get_metadata()
    print(f"Found {len(speakers)} speakers")

    VOICES_DIR.mkdir(exist_ok=True)

    for god_name, speaker_id in GODS.items():
        out_path = VOICES_DIR / f"{god_name}.wav"

        if out_path.exists():
            print(f"  {god_name}: already exists, skipping")
            continue

        if speaker_id not in speakers:
            print(f"  {god_name}: speaker {speaker_id} not found!")
            continue

        info = speakers[speaker_id]
        file_name = info["file"]

        # Download the wav file (file_name already includes "audio/" prefix)
        wav_path = hf_hub_download(REPO_ID, file_name, repo_type="dataset")

        # Copy to voices dir with god name
        import shutil
        shutil.copy(wav_path, out_path)

        print(f"  {god_name}: downloaded (speaker {speaker_id}, {info['gender']})")

    print("\nDone!")
    print(f"Voice files in: {VOICES_DIR}")


def list_speakers(gender_filter=None, limit=50):
    """List available speakers for auditioning."""
    print("Fetching metadata...")
    speakers = get_metadata()

    print(f"\nAvailable speakers (first {limit}):\n")
    print(f"{'ID':>6}  {'Gender':>6}  {'Name':<20}")
    print("-" * 40)

    count = 0
    for speaker_id, info in sorted(speakers.items()):
        if gender_filter and info["gender"] != gender_filter:
            continue
        print(f"{speaker_id:>6}  {info['gender']:>6}  {info['name']:<20}")
        count += 1
        if count >= limit:
            break


def preview_speaker(speaker_id: int, god_name: str = None):
    """Download a single speaker for preview."""
    print(f"Fetching speaker {speaker_id}...")
    speakers = get_metadata()

    if speaker_id not in speakers:
        print(f"Speaker {speaker_id} not found!")
        return

    info = speakers[speaker_id]
    file_name = info["file"]

    # Download
    wav_path = hf_hub_download(REPO_ID, file_name, repo_type="dataset")

    name = god_name or f"preview_{speaker_id}"
    out_path = VOICES_DIR / f"{name}.wav"

    import shutil
    shutil.copy(wav_path, out_path)

    print(f"Saved: {out_path}")
    print(f"Gender: {info['gender']}, Name: {info['name']}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        cmd = sys.argv[1]

        if cmd == "list":
            gender = sys.argv[2] if len(sys.argv) > 2 else None
            list_speakers(gender_filter=gender)

        elif cmd == "preview":
            if len(sys.argv) < 3:
                print("Usage: python download_voices.py preview <speaker_id> [god_name]")
                sys.exit(1)
            speaker_id = int(sys.argv[2])
            god_name = sys.argv[3] if len(sys.argv) > 3 else None
            preview_speaker(speaker_id, god_name)

        else:
            print("Unknown command. Use: list, preview, or no args to download all")
    else:
        download_voices()
