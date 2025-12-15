#!/usr/bin/env python3
"""Train custom voice verifier for wake word detection."""

import sys
from pathlib import Path

# Add openwakeword to path
sys.path.insert(0, str(Path(__file__).parent / 'train' / 'openwakeword'))

from openwakeword.custom_verifier_model import train_custom_verifier

SAMPLES_DIR = Path(__file__).parent / 'voice_samples'
MODEL_PATH = Path(__file__).parent / 'train' / 'hey_iris_model' / 'hey_iris.onnx'
OUTPUT_PATH = Path(__file__).parent / 'voice_samples' / 'verifier.pkl'


def main():
    # Get positive samples
    positive_dir = SAMPLES_DIR / 'positive'
    positive_clips = sorted(positive_dir.glob('*.wav'))
    print(f"Found {len(positive_clips)} positive samples")

    # Get negative samples
    negative_dir = SAMPLES_DIR / 'negative'
    negative_clips = sorted(negative_dir.glob('*.wav'))
    print(f"Found {len(negative_clips)} negative samples")

    if len(positive_clips) < 3:
        print("Error: Need at least 3 positive samples")
        return

    if len(negative_clips) < 3:
        print("Error: Need at least 3 negative samples")
        return

    print(f"\nTraining verifier using model: {MODEL_PATH}")
    print(f"Output will be saved to: {OUTPUT_PATH}")
    print()

    # Train the verifier
    train_custom_verifier(
        positive_reference_clips=[str(p) for p in positive_clips],
        negative_reference_clips=[str(n) for n in negative_clips],
        output_path=str(OUTPUT_PATH),
        model_name=str(MODEL_PATH),
        inference_framework='onnx'
    )

    print(f"\nVerifier saved to: {OUTPUT_PATH}")


if __name__ == '__main__':
    main()
