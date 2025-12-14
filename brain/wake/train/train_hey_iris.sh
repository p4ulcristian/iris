#!/bin/bash
# Train "hey iris" wake word model - MAXIMUM QUALITY
# Estimated time: 6-7 hours on GPU

cd /home/p4ulcristian/Work/iris/brain/wake/train

export PYTHONPATH=./openwakeword:./piper-sample-generator

DEPS="--with torch==2.0.1 --with torchaudio==2.0.2 \
  --with torchinfo --with torchmetrics --with piper-phonemize \
  --with webrtcvad --with mutagen --with audiomentations \
  --with torch-audiomentations --with acoustics --with pronouncing \
  --with datasets --with scipy --with numpy --with pyyaml \
  --with tqdm --with onnx --with onnxruntime \
  --with speechbrain==0.5.14 --with espeak-phonemizer"

echo "=== Step 1/3: Generating clips ==="
uv run --python 3.11 $DEPS python openwakeword/openwakeword/train.py --training_config hey_iris.yaml --generate_clips || exit 1

echo "=== Step 2/3: Augmenting clips ==="
uv run --python 3.11 $DEPS python openwakeword/openwakeword/train.py --training_config hey_iris.yaml --augment_clips || exit 1

echo "=== Step 3/3: Training model ==="
uv run --python 3.11 $DEPS python openwakeword/openwakeword/train.py --training_config hey_iris.yaml --train_model || exit 1

echo "=== DONE! Model at: hey_iris_model/hey_iris.onnx ==="
