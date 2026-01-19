#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "ctranslate2>=4.0",
#     "transformers[torch]>=4.23",
#     "torch",
#     "huggingface_hub",
# ]
# ///
"""Convert Whisper large-v3-hu to CTranslate2 format for faster-whisper."""

from pathlib import Path

MODEL_NAME = "Trendency/whisper-large-v3-hu"
OUTPUT_DIR = Path(__file__).parent / "models" / "whisper-large-v3-hu-ct2"

def main():
    import ctranslate2
    print(f"CTranslate2 version: {ctranslate2.__version__}")
    print(f"Converting {MODEL_NAME} to CTranslate2 format...")
    print(f"Output directory: {OUTPUT_DIR}")

    OUTPUT_DIR.parent.mkdir(parents=True, exist_ok=True)

    converter = ctranslate2.converters.TransformersConverter(MODEL_NAME)
    converter.convert(
        str(OUTPUT_DIR),
        quantization="float16",
        force=True
    )

    # Copy additional files
    from huggingface_hub import hf_hub_download
    import shutil

    for filename in ["tokenizer.json", "preprocessor_config.json", "vocab.json", "merges.txt"]:
        try:
            src = hf_hub_download(MODEL_NAME, filename)
            shutil.copy(src, OUTPUT_DIR / filename)
            print(f"Copied {filename}")
        except Exception as e:
            print(f"Could not copy {filename}: {e}")

    print(f"\nConversion complete! Model saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
