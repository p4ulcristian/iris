#!/usr/bin/env python3
"""Download comprehensive datasets for OpenWakeWord training."""

import os
import sys
import subprocess
from pathlib import Path
import urllib.request
import zipfile
import shutil

TRAIN_DIR = Path(__file__).parent
DOWNLOADS_DIR = TRAIN_DIR / "downloads"

# Datasets to download
DATASETS = {
    "rirs_noises": {
        "url": "https://www.openslr.org/resources/28/rirs_noises.zip",
        "size": "1.3 GB",
        "description": "OpenSLR Room Impulse Responses and Noise",
        "extract_to": "rirs_noises"
    },
    "fma_small": {
        "url": "https://os.unil.cloud.switch.ch/fma/fma_small.zip",
        "size": "7.2 GB",
        "description": "Free Music Archive - 8000 tracks, 30s each",
        "extract_to": "fma_small"
    },
    "librispeech_dev": {
        "url": "https://www.openslr.org/resources/12/dev-clean.tar.gz",
        "size": "337 MB",
        "description": "LibriSpeech dev-clean - conversational speech",
        "extract_to": "librispeech"
    }
}

def download_with_progress(url: str, dest: Path) -> bool:
    """Download file with progress using curl."""
    print(f"\nDownloading: {dest.name}")
    print(f"  From: {url}")
    print(f"  To: {dest}")

    try:
        result = subprocess.run(
            ["curl", "-L", "-C", "-", "-o", str(dest), url, "--progress-bar"],
            check=True
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"  ERROR: Download failed: {e}")
        return False
    except FileNotFoundError:
        print("  ERROR: curl not found, trying urllib...")
        try:
            urllib.request.urlretrieve(url, dest)
            return True
        except Exception as e:
            print(f"  ERROR: {e}")
            return False

def extract_archive(archive: Path, dest_dir: Path) -> bool:
    """Extract zip or tar.gz archive."""
    print(f"\nExtracting: {archive.name}")
    dest_dir.mkdir(parents=True, exist_ok=True)

    try:
        if archive.suffix == ".zip":
            with zipfile.ZipFile(archive, 'r') as zf:
                zf.extractall(dest_dir)
        elif archive.name.endswith(".tar.gz"):
            subprocess.run(["tar", "-xzf", str(archive), "-C", str(dest_dir)], check=True)
        print(f"  Extracted to: {dest_dir}")
        return True
    except Exception as e:
        print(f"  ERROR extracting: {e}")
        return False

def setup_mit_irs():
    """Download MIT environmental impulse responses via HuggingFace datasets."""
    print("\n=== Setting up MIT Environmental Impulse Responses ===")
    dest_dir = TRAIN_DIR / "mit_irs_full"

    if dest_dir.exists() and any(dest_dir.iterdir()):
        print(f"  Already exists: {dest_dir}")
        return True

    try:
        from datasets import load_dataset
        print("  Loading from HuggingFace: davidscripka/MIT_environmental_impulse_responses")
        ds = load_dataset("davidscripka/MIT_environmental_impulse_responses", split="train")

        dest_dir.mkdir(parents=True, exist_ok=True)
        import soundfile as sf

        for i, item in enumerate(ds):
            audio = item["audio"]
            out_path = dest_dir / f"mit_ir_{i:04d}.wav"
            sf.write(str(out_path), audio["array"], audio["sampling_rate"])
            if i % 50 == 0:
                print(f"  Saved {i} impulse responses...")

        print(f"  Saved {len(ds)} impulse responses to {dest_dir}")
        return True

    except ImportError:
        print("  ERROR: 'datasets' package not installed")
        print("  Run: pip install datasets soundfile")
        return False
    except Exception as e:
        print(f"  ERROR: {e}")
        return False

def organize_for_training():
    """Organize downloaded data into training structure."""
    print("\n=== Organizing data for training ===")

    # Create directories
    rir_dir = TRAIN_DIR / "room_impulse_responses"
    bg_dir = TRAIN_DIR / "background_audio"

    rir_dir.mkdir(exist_ok=True)
    bg_dir.mkdir(exist_ok=True)

    # 1. Copy RIRs from OpenSLR
    openslr_rirs = DOWNLOADS_DIR / "rirs_noises" / "RIRS_NOISES"
    if openslr_rirs.exists():
        print(f"  Organizing OpenSLR RIRs...")
        rir_count = 0
        for wav in openslr_rirs.rglob("*.wav"):
            if "RIR" in str(wav) or "impulse" in str(wav).lower():
                dest = rir_dir / f"openslr_{rir_count:04d}.wav"
                shutil.copy2(wav, dest)
                rir_count += 1
        print(f"    Copied {rir_count} RIR files")

        # Also copy noise files to background
        noise_count = 0
        for wav in openslr_rirs.rglob("*.wav"):
            if "noise" in str(wav).lower():
                dest = bg_dir / f"openslr_noise_{noise_count:04d}.wav"
                shutil.copy2(wav, dest)
                noise_count += 1
        print(f"    Copied {noise_count} noise files to background")

    # 2. Sample FMA music for background
    fma_dir = DOWNLOADS_DIR / "fma_small"
    if fma_dir.exists():
        print(f"  Sampling FMA music for background...")
        import random
        mp3_files = list(fma_dir.rglob("*.mp3"))
        sample_size = min(500, len(mp3_files))  # Use up to 500 tracks
        sampled = random.sample(mp3_files, sample_size)

        for i, mp3 in enumerate(sampled):
            dest = bg_dir / f"fma_music_{i:04d}.mp3"
            shutil.copy2(mp3, dest)
            if i % 100 == 0:
                print(f"    Copied {i}/{sample_size} music files...")
        print(f"    Copied {sample_size} music files")

    # 3. Copy LibriSpeech for conversational background
    libri_dir = DOWNLOADS_DIR / "librispeech"
    if libri_dir.exists():
        print(f"  Organizing LibriSpeech speech samples...")
        flac_files = list(libri_dir.rglob("*.flac"))
        sample_size = min(500, len(flac_files))
        import random
        sampled = random.sample(flac_files, sample_size) if len(flac_files) > sample_size else flac_files

        for i, flac in enumerate(sampled):
            dest = bg_dir / f"speech_{i:04d}.flac"
            shutil.copy2(flac, dest)
        print(f"    Copied {len(sampled)} speech files")

    print(f"\n  RIR directory: {rir_dir}")
    print(f"  Background directory: {bg_dir}")
    print(f"  RIR count: {len(list(rir_dir.glob('*')))}")
    print(f"  Background count: {len(list(bg_dir.glob('*')))}")

def main():
    print("=" * 60)
    print("OpenWakeWord Training Data Downloader")
    print("=" * 60)

    DOWNLOADS_DIR.mkdir(exist_ok=True)
    os.chdir(DOWNLOADS_DIR)

    # Download each dataset
    for name, info in DATASETS.items():
        print(f"\n{'='*60}")
        print(f"Dataset: {name}")
        print(f"Description: {info['description']}")
        print(f"Size: {info['size']}")
        print("=" * 60)

        # Determine file extension
        url = info["url"]
        if url.endswith(".tar.gz"):
            filename = f"{name}.tar.gz"
        else:
            filename = f"{name}.zip"

        archive_path = DOWNLOADS_DIR / filename
        extract_dir = DOWNLOADS_DIR / info["extract_to"]

        # Check if already extracted
        if extract_dir.exists() and any(extract_dir.iterdir()):
            print(f"  Already extracted: {extract_dir}")
            continue

        # Download if needed
        if not archive_path.exists():
            if not download_with_progress(url, archive_path):
                continue
        else:
            print(f"  Archive exists: {archive_path}")

        # Extract
        extract_archive(archive_path, extract_dir)

    # Setup MIT IRs from HuggingFace
    setup_mit_irs()

    # Organize for training
    organize_for_training()

    print("\n" + "=" * 60)
    print("DONE! Next steps:")
    print("=" * 60)
    print("1. Update hey_iris.yaml with new paths:")
    print("   rir_paths:")
    print("     - ./room_impulse_responses")
    print("     - ./mit_irs_full")
    print("   background_paths:")
    print("     - ./background_audio")
    print("")
    print("2. Run training:")
    print("   ./train_hey_iris.sh")
    print("=" * 60)

if __name__ == "__main__":
    main()
