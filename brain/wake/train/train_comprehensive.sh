#!/bin/bash
# Train "hey iris" wake word model - COMPREHENSIVE SETUP
# Uses: OpenSLR RIRs, FMA music, LibriSpeech speech
# Estimated time: 8-12 hours on GPU

set -e

cd /home/p4ulcristian/Work/iris/brain/wake/train

echo "=============================================="
echo "COMPREHENSIVE Wake Word Training"
echo "=============================================="
echo ""

# Check required files exist
echo "Checking required data..."

if [ ! -f "openwakeword_features_ACAV100M_2000_hrs_16bit.npy" ]; then
    echo "ERROR: Missing ACAV100M features file"
    echo "Download from: https://huggingface.co/datasets/davidscripka/openwakeword_features"
    exit 1
fi

if [ ! -d "room_impulse_responses" ] || [ -z "$(ls -A room_impulse_responses 2>/dev/null)" ]; then
    echo "WARNING: room_impulse_responses directory is empty"
    echo "Run: python download_datasets.py first"
fi

if [ ! -d "background_audio" ] || [ -z "$(ls -A background_audio 2>/dev/null)" ]; then
    echo "WARNING: background_audio directory is empty"
    echo "Run: python download_datasets.py first"
fi

echo "Data check complete."
echo ""

export PYTHONPATH=./openwakeword:./piper-sample-generator

DEPS="--with torch==2.0.1 --with torchaudio==2.0.2 \
  --with torchinfo --with torchmetrics --with piper-phonemize \
  --with webrtcvad --with mutagen --with audiomentations \
  --with torch-audiomentations --with acoustics --with pronouncing \
  --with datasets --with scipy --with numpy --with pyyaml \
  --with tqdm --with onnx --with onnxruntime \
  --with speechbrain==0.5.14 --with espeak-phonemizer"

echo "=============================================="
echo "Step 1/3: Generating 50,000 synthetic clips"
echo "Estimated time: 1-2 hours"
echo "=============================================="
uv run --python 3.11 $DEPS python openwakeword/openwakeword/train.py \
    --training_config hey_iris_comprehensive.yaml \
    --generate_clips || exit 1

echo ""
echo "=============================================="
echo "Step 2/3: Augmenting clips (5 rounds)"
echo "Estimated time: 2-3 hours"
echo "=============================================="
uv run --python 3.11 $DEPS python openwakeword/openwakeword/train.py \
    --training_config hey_iris_comprehensive.yaml \
    --augment_clips || exit 1

echo ""
echo "=============================================="
echo "Step 3/3: Training model (500,000 steps)"
echo "Estimated time: 5-7 hours"
echo "=============================================="
uv run --python 3.11 $DEPS python openwakeword/openwakeword/train.py \
    --training_config hey_iris_comprehensive.yaml \
    --train_model || exit 1

echo ""
echo "=============================================="
echo "TRAINING COMPLETE!"
echo "=============================================="
echo ""
echo "Model saved to: hey_iris_model_comprehensive/hey_iris.onnx"
echo ""
echo "To use the new model, copy it:"
echo "  cp hey_iris_model_comprehensive/hey_iris.onnx hey_iris_model/hey_iris.onnx"
echo ""
echo "Then restart the wake word detector:"
echo "  iris stop wakeword && iris start wakeword"
echo ""
