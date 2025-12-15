# Wake Word Detection for Iris

## Quick Start

```bash
# Start the wake word detector
iris start wakeword

# Stop it
iris stop wakeword
```

## Custom Voice Verifier (Recommended)

Train a verifier with YOUR voice to reduce false positives. This adds a second layer that only responds to your voice.

### Step 1: Record Positive Samples

Record yourself saying "hey iris" 10-20 times:

```bash
cd /home/p4ulcristian/Work/iris

# Record one at a time (with spoken countdown)
brain/.venv/bin/python brain/wake/record_one.py positive

# Or record multiple in a loop
for i in {1..10}; do
  brain/.venv/bin/python brain/wake/record_one.py positive
  sleep 0.3
done
```

### Step 2: Record Negative Samples

Record yourself saying random phrases (NOT "hey iris"):

```bash
# Record 10-20 negative samples
for i in {1..10}; do
  brain/.venv/bin/python brain/wake/record_one.py negative
  sleep 0.3
done
```

Suggested phrases:
- "What's the weather like today"
- "Play some music please"
- "Hey Siri, what time is it"
- "Hey Google, remind me later"
- Any random speech

### Step 3: Train the Verifier

```bash
uv run \
    --with numpy --with onnxruntime --with scipy --with sounddevice \
    --with tqdm --with requests --with scikit-learn --with resampy \
    python brain/wake/train_verifier.py
```

### Step 4: Restart the Detector

```bash
iris stop wakeword && iris start wakeword
```

The detector will automatically use the verifier if `voice_samples/verifier.pkl` exists.

### Tips for Better Accuracy

- Record more samples (20+ each) for better accuracy
- Vary your tone, speed, and distance from mic
- Include some silence/background noise in negative samples
- Re-record if samples sound bad: check with `brain/.venv/bin/python brain/wake/record_one.py play <file>`

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
- `record_one.py` - Record single voice sample with countdown
- `record_samples.py` - Interactive recording session
- `train_verifier.py` - Train custom voice verifier
- `test_wakeword.py` - Simple test script
- `voice_samples/` - Your voice samples and trained verifier
- `train/hey_iris.yaml` - Base model training config
- `train/hey_iris_model/hey_iris.onnx` - Base trained model
