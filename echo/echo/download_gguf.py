#!/usr/bin/env python3
"""Download Maya GGUF model."""

from pathlib import Path
import shutil
import sys

DEFAULT_MODEL_CACHE = Path.home() / ".cache" / "maya"
MODEL_FILENAME = "maya1-q5_k_m.gguf"


def download_gguf_model(cache_dir: Path = None) -> Path:
    """Download/copy GGUF model to cache directory.

    Args:
        cache_dir: Directory to store model (default: ~/.cache/maya)

    Returns:
        Path to downloaded model

    Raises:
        RuntimeError: If model cannot be found or downloaded
    """
    if cache_dir is None:
        cache_dir = DEFAULT_MODEL_CACHE

    cache_dir.mkdir(parents=True, exist_ok=True)
    dest = cache_dir / MODEL_FILENAME

    if dest.exists():
        print(f"✓ Model already exists: {dest}")
        print(f"  Size: {dest.stat().st_size / (1024**3):.2f} GB")
        return dest

    print(f"Downloading Maya GGUF model to {dest}...")
    print("This is ~2.4GB, may take a few minutes.\n")

    # Try to copy from maya-demo if available
    maya_demo_path = Path("/home/paul/Work/maya-demo/models/maya1-q5_k_m.gguf")
    if maya_demo_path.exists():
        print(f"Found local copy at {maya_demo_path}")
        print(f"Copying to {dest}...")
        shutil.copy(maya_demo_path, dest)
        print(f"✓ Model ready at: {dest}")
        print(f"  Size: {dest.stat().st_size / (1024**3):.2f} GB")
        return dest

    # TODO: Add HuggingFace download if GGUF is available
    # try:
    #     from huggingface_hub import hf_hub_download
    #     model_path = hf_hub_download(
    #         repo_id="MaggieAppleton/maya1-gguf",  # Adjust if different
    #         filename=MODEL_FILENAME,
    #         cache_dir=cache_dir,
    #     )
    #     print(f"✓ Downloaded to: {model_path}")
    #     return Path(model_path)
    # except Exception as e:
    #     print(f"HuggingFace download failed: {e}")

    raise RuntimeError(
        f"GGUF model not found. Please manually download maya1-q5_k_m.gguf\n"
        f"and place it at: {dest}"
    )


def main():
    """CLI entry point."""
    try:
        model_path = download_gguf_model()
        print(f"\n✓ Success! Model ready at: {model_path}")
        print("\nYou can now use echo with the GGUF backend.")
        return 0
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
