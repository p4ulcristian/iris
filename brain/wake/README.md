# Wake Word Detection for Iris

## Current Status (2025-12-14)

Training a new "hey iris" wake word model with higher quality settings. Training is running in background.

## Check Training Progress

```bash
# Check if still running
tail -50 /tmp/claude/tasks/bd4137c.output

# If training finished, the model will be at:
ls -la brain/wake/train/hey_iris_model/hey_iris.onnx
```

## If Training Finished Successfully

Test the new model:

```bash
cd /home/p4ulcristian/Work/iris/brain/wake
uv run --with numpy --with onnxruntime --with scipy --with pyaudio python test_wakeword.py
```

## If Training Failed or Need to Restart

Run the full training (3 steps):

```bash
cd /home/p4ulcristian/Work/iris/brain/wake/train

# Step 1: Generate clips (skip if already done - check hey_iris_model/hey_iris/positive_train/)
PYTHONPATH=./openwakeword:./piper-sample-generator uv run --python 3.11 \
  --with 'torch==2.0.1' --with 'torchaudio==2.0.2' \
  --with torchinfo --with torchmetrics \
  --with piper-phonemize --with webrtcvad --with mutagen \
  --with audiomentations --with torch-audiomentations --with acoustics \
  --with pronouncing --with datasets --with scipy --with numpy \
  --with pyyaml --with tqdm --with onnx --with onnxruntime \
  --with 'speechbrain==0.5.14' --with espeak-phonemizer \
  python openwakeword/openwakeword/train.py --training_config hey_iris.yaml --generate_clips

# Step 2: Augment clips
PYTHONPATH=./openwakeword:./piper-sample-generator uv run --python 3.11 \
  --with 'torch==2.0.1' --with 'torchaudio==2.0.2' \
  --with torchinfo --with torchmetrics \
  --with piper-phonemize --with webrtcvad --with mutagen \
  --with audiomentations --with torch-audiomentations --with acoustics \
  --with pronouncing --with datasets --with scipy --with numpy \
  --with pyyaml --with tqdm --with onnx --with onnxruntime \
  --with 'speechbrain==0.5.14' --with espeak-phonemizer \
  python openwakeword/openwakeword/train.py --training_config hey_iris.yaml --augment_clips

# Step 3: Train model
PYTHONPATH=./openwakeword:./piper-sample-generator uv run --python 3.11 \
  --with 'torch==2.0.1' --with 'torchaudio==2.0.2' \
  --with torchinfo --with torchmetrics \
  --with piper-phonemize --with webrtcvad --with mutagen \
  --with audiomentations --with torch-audiomentations --with acoustics \
  --with pronouncing --with datasets --with scipy --with numpy \
  --with pyyaml --with tqdm --with onnx --with onnxruntime \
  --with 'speechbrain==0.5.14' --with espeak-phonemizer \
  python openwakeword/openwakeword/train.py --training_config hey_iris.yaml --train_model
```

## Run Wake Word Detector

After model is trained:

```bash
cd /home/p4ulcristian/Work/iris/brain/wake
uv run --with numpy --with onnxruntime --with scipy --with pyaudio python detector.py
```

This will:
- Listen for "hey iris"
- Show green "Hey Iris!" on bubble when detected
- Say "Iris here!"

## Start Bubble UI (if needed)

```bash
cd /home/p4ulcristian/Work/iris
LD_PRELOAD=/usr/lib/libgtk4-layer-shell.so python3 brain/express/bubble.py &
```

## Training Config

The improved config (`brain/wake/train/hey_iris.yaml`) has:
- 12 adversarial negatives (hey siri, hey google, etc.)
- 15,000 samples (was 10,000)
- Bigger model (64 neurons vs 32)
- 100,000 training steps (was 50,000)
- 0.05 false positives/hour target (was 0.2)

## Files

- `detector.py` - Wake word detector (listens for "hey iris")
- `test_wakeword.py` - Simple test script
- `train/hey_iris.yaml` - Training config
- `train/hey_iris_model/hey_iris.onnx` - Trained model
