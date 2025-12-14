# Wakeword Training Setup for Iris

This directory contains scripts to generate training samples and train a custom wakeword model using openWakeWord.

## Overview

The training pipeline uses:
1. **piper-sample-generator** - Generates diverse audio samples using Piper TTS
2. **openWakeWord** - Trains the actual wakeword detection model

## Model Requirements

**IMPORTANT**: piper-sample-generator requires PyTorch `.pt` generator models, NOT ONNX models.

### Available Pre-built .pt Models (v2.0.0)

| Model | Language | URL |
|-------|----------|-----|
| en_US-libritts_r-medium.pt | English | https://github.com/rhasspy/piper-sample-generator/releases/download/v2.0.0/en_US-libritts_r-medium.pt |
| de_DE-mls-medium.pt | German | https://github.com/rhasspy/piper-sample-generator/releases/download/v2.0.0/de_DE-mls-medium.pt |
| fr_FR-mls-medium.pt | French | https://github.com/rhasspy/piper-sample-generator/releases/download/v2.0.0/fr_FR-mls-medium.pt |
| nl_NL-mls-medium.pt | Dutch | https://github.com/rhasspy/piper-sample-generator/releases/download/v2.0.0/nl_NL-mls-medium.pt |

### Converting Checkpoints to .pt (Optional)

If you need a specific voice like `en_US-lessac-medium`, you must convert from checkpoint:

1. Download checkpoint from HuggingFace:
   ```bash
   wget https://huggingface.co/datasets/rhasspy/piper-checkpoints/resolve/main/en/en_US/lessac/medium/epoch=2164-step=1355540.ckpt
   ```

2. Convert using piper_train:
   ```bash
   python -m piper_train.export_generator epoch=2164-step=1355540.ckpt en_US-lessac-medium.pt
   ```

## Setup

Run the setup script to download models and install dependencies:

```bash
./setup.sh
```

## Generating Samples

```bash
./generate_samples.sh "hey iris"
```

## Training

See openWakeWord documentation for training instructions after sample generation.

## References

- [piper-sample-generator](https://github.com/rhasspy/piper-sample-generator)
- [openWakeWord](https://github.com/dscripka/openWakeWord)
- [Piper Checkpoints (HuggingFace)](https://huggingface.co/datasets/rhasspy/piper-checkpoints)
