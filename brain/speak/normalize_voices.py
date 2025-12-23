#!/usr/bin/env python3
"""
Voice Sample Normalizer

Analyzes voice samples, extracts the clearest 15-second segment,
and normalizes to consistent format.

Target spec:
- Duration: 15 seconds
- Sample rate: 24kHz
- Channels: Mono
- Volume: -23 LUFS
- Format: WAV (PCM 16-bit)
"""

import os
import shutil
from pathlib import Path
from datetime import datetime

import numpy as np
import librosa
import soundfile as sf
import pyloudnorm as pyln

# Configuration
TARGET_DURATION = 15.0  # seconds
TARGET_SR = 24000
TARGET_LUFS = -23.0
VOICES_DIR = Path(__file__).parent / "voices"
BACKUP_DIR = VOICES_DIR / "originals_backup"


def analyze_segment_quality(audio: np.ndarray, sr: int, start: float, duration: float) -> dict:
    """
    Analyze quality metrics for an audio segment.

    Returns dict with:
    - energy: RMS energy (higher = louder, more speech)
    - silence_ratio: Ratio of silent frames (lower = better)
    - spectral_centroid: Brightness (moderate = natural speech)
    - zero_crossing_rate: Speech activity indicator
    """
    start_sample = int(start * sr)
    end_sample = int((start + duration) * sr)
    segment = audio[start_sample:end_sample]

    if len(segment) < sr:  # Less than 1 second
        return {"score": 0}

    # RMS energy
    rms = np.sqrt(np.mean(segment ** 2))

    # Silence detection (frames below threshold)
    frame_length = int(0.025 * sr)  # 25ms frames
    hop_length = int(0.010 * sr)    # 10ms hop

    frames = librosa.util.frame(segment, frame_length=frame_length, hop_length=hop_length)
    frame_rms = np.sqrt(np.mean(frames ** 2, axis=0))
    silence_threshold = 0.01
    silence_ratio = np.mean(frame_rms < silence_threshold)

    # Spectral centroid (brightness)
    spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=segment, sr=sr))

    # Zero crossing rate (speech activity)
    zcr = np.mean(librosa.feature.zero_crossing_rate(segment))

    # Composite score: high energy, low silence, moderate spectral centroid
    # Penalize very high or very low spectral centroid (noise or muffled)
    centroid_score = 1.0 - abs(spectral_centroid - 2000) / 4000  # Ideal around 2kHz
    centroid_score = max(0, min(1, centroid_score))

    score = (
        rms * 10 +                    # Prefer louder segments
        (1 - silence_ratio) * 5 +     # Penalize silence
        centroid_score * 2 +          # Prefer natural speech spectrum
        min(zcr * 100, 1) * 1         # Some zero crossings indicate speech
    )

    return {
        "score": score,
        "energy": rms,
        "silence_ratio": silence_ratio,
        "spectral_centroid": spectral_centroid,
        "zcr": zcr
    }


def find_best_segment(audio: np.ndarray, sr: int, target_duration: float = 15.0) -> tuple:
    """
    Find the best segment of target_duration seconds.

    Returns (start_time, metrics)
    """
    total_duration = len(audio) / sr

    if total_duration <= target_duration:
        # Audio is already short enough
        return 0.0, {"score": 1.0, "note": "full_audio"}

    # Slide window and find best segment
    step = 1.0  # 1 second steps
    best_start = 0.0
    best_metrics = {"score": 0}

    start = 0.0
    while start + target_duration <= total_duration:
        metrics = analyze_segment_quality(audio, sr, start, target_duration)
        if metrics["score"] > best_metrics["score"]:
            best_metrics = metrics
            best_start = start
        start += step

    return best_start, best_metrics


def normalize_loudness(audio: np.ndarray, sr: int, target_lufs: float = -23.0) -> np.ndarray:
    """Normalize audio to target LUFS."""
    meter = pyln.Meter(sr)

    # Measure current loudness
    current_lufs = meter.integrated_loudness(audio)

    if not np.isfinite(current_lufs):
        print(f"    Warning: Could not measure loudness, skipping normalization")
        return audio

    # Calculate and apply gain
    gain_db = target_lufs - current_lufs
    gain_linear = 10.0 ** (gain_db / 20.0)

    normalized = audio * gain_linear

    # Prevent clipping
    peak = np.max(np.abs(normalized))
    if peak > 0.99:
        normalized = normalized * (0.99 / peak)

    return normalized


def process_voice(wav_path: Path, backup_dir: Path) -> dict:
    """
    Process a single voice file.

    1. Load audio
    2. Find best 15-second segment
    3. Extract and normalize
    4. Save (backup original first)
    """
    print(f"\n{'='*60}")
    print(f"Processing: {wav_path.name}")
    print(f"{'='*60}")

    # Load audio
    audio, sr = librosa.load(wav_path, sr=None, mono=True)
    original_duration = len(audio) / sr
    original_sr = sr

    print(f"  Original: {original_duration:.1f}s @ {sr}Hz")

    # Find best segment
    best_start, metrics = find_best_segment(audio, sr, TARGET_DURATION)
    print(f"  Best segment: {best_start:.1f}s - {best_start + TARGET_DURATION:.1f}s (score: {metrics['score']:.2f})")

    if "note" in metrics and metrics["note"] == "full_audio":
        print(f"  Audio already <= {TARGET_DURATION}s, using full audio")
        segment = audio
    else:
        # Extract segment
        start_sample = int(best_start * sr)
        end_sample = int((best_start + TARGET_DURATION) * sr)
        segment = audio[start_sample:end_sample]

    # Resample to target sample rate
    if sr != TARGET_SR:
        print(f"  Resampling: {sr}Hz -> {TARGET_SR}Hz")
        segment = librosa.resample(segment, orig_sr=sr, target_sr=TARGET_SR)

    # Normalize loudness
    print(f"  Normalizing to {TARGET_LUFS} LUFS")
    segment = normalize_loudness(segment, TARGET_SR, TARGET_LUFS)

    final_duration = len(segment) / TARGET_SR
    print(f"  Final: {final_duration:.1f}s @ {TARGET_SR}Hz")

    # Backup original
    backup_path = backup_dir / wav_path.name
    if not backup_path.exists():
        print(f"  Backing up to: {backup_path.name}")
        shutil.copy2(wav_path, backup_path)
    else:
        print(f"  Backup already exists")

    # Save normalized version
    sf.write(wav_path, segment, TARGET_SR, subtype='PCM_16')

    new_size = wav_path.stat().st_size / 1024 / 1024
    print(f"  Saved: {new_size:.2f}MB")

    return {
        "name": wav_path.stem,
        "original_duration": original_duration,
        "original_sr": original_sr,
        "segment_start": best_start,
        "score": metrics["score"],
        "final_duration": final_duration,
        "final_size_mb": new_size
    }


def main():
    print("Voice Sample Normalizer")
    print(f"Target: {TARGET_DURATION}s @ {TARGET_SR}Hz, {TARGET_LUFS} LUFS")
    print(f"Voices directory: {VOICES_DIR}")

    # Create backup directory
    BACKUP_DIR.mkdir(exist_ok=True)
    print(f"Backup directory: {BACKUP_DIR}")

    # Find all voice files
    voice_files = sorted(VOICES_DIR.glob("*.wav"))
    print(f"\nFound {len(voice_files)} voice files")

    results = []
    for wav_path in voice_files:
        try:
            result = process_voice(wav_path, BACKUP_DIR)
            results.append(result)
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
            results.append({"name": wav_path.stem, "error": str(e)})

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"{'Voice':<15} {'Original':>10} {'Final':>10} {'Size':>10}")
    print(f"{'-'*15} {'-'*10} {'-'*10} {'-'*10}")

    for r in results:
        if "error" in r:
            print(f"{r['name']:<15} ERROR: {r['error']}")
        else:
            print(f"{r['name']:<15} {r['original_duration']:>9.1f}s {r['final_duration']:>9.1f}s {r['final_size_mb']:>9.2f}MB")

    total_size = sum(r.get("final_size_mb", 0) for r in results)
    print(f"\nTotal size: {total_size:.1f}MB")
    print("\nDone! Originals backed up to 'originals_backup/' folder.")


if __name__ == "__main__":
    main()
