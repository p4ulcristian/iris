# Wake Word Training: Next Steps

**Shade:** Indigo
**Date:** 2025-12-16
**Status:** Training in progress

---

## After Training Completes

### 1. Copy the New Model

```bash
cp /home/p4ulcristian/Work/iris/brain/wake/train/hey_iris_model_comprehensive/hey_iris.onnx \
   /home/p4ulcristian/Work/iris/brain/wake/train/hey_iris_model/hey_iris.onnx
```

### 2. Restart Wake Word Detector

```bash
# If using Iris system:
iris stop wakeword && iris start wakeword

# Or manually:
pkill -f "run_detector"
cd /home/p4ulcristian/Work/iris/brain/wake && ./run_detector.sh
```

### 3. Test the New Model

Say "Hey Iris" several times and check:
- Does it detect your voice?
- Are there false positives from noise/music/TV?

### 4. If Too Many False Positives

Retrain the voice verifier with more samples:

```bash
cd /home/p4ulcristian/Work/iris/brain/wake

# Record more positive samples (say "hey iris")
brain/.venv/bin/python brain/wake/record_one.py positive

# Record more negative samples (other phrases, noises)
brain/.venv/bin/python brain/wake/record_one.py negative

# Retrain verifier
uv run --with numpy --with onnxruntime --with scipy \
  --with sounddevice --with tqdm --with requests \
  --with scikit-learn --with resampy \
  python brain/wake/train_verifier.py
```

### 5. If Too Many False Negatives (Not Detecting)

- Lower the threshold in `detector.py` (currently 0.5)
- Or lower the verifier threshold (currently 0.3)

---

## Training Details

| Setting | Value |
|---------|-------|
| Config | `hey_iris_comprehensive.yaml` |
| Samples | 50,000 |
| RIRs | 1,353 rooms |
| Background audio | 1,192 files |
| Model neurons | 256 |
| Training steps | 500,000 |
| Target FP/hour | 0.005 |
| Estimated time | 8-12 hours |

---

## Files Created

```
brain/wake/train/
├── hey_iris_model_comprehensive/
│   ├── hey_iris.onnx          # The trained model
│   ├── hey_iris/              # Training artifacts
│   └── ...
```

---

## Command Used

```bash
cd /home/p4ulcristian/Work/iris/brain/wake/train
CUDA_VISIBLE_DEVICES=0 ./train_comprehensive.sh
```

GPU: RTX 3080 (GPU 0)
