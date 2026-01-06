"""
StarVector model wrapper for SVG generation.
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Disable flash attention (not compatible with RTX 50 series yet)
os.environ["TRANSFORMERS_NO_FLASH_ATTENTION"] = "1"


class StarVectorModel:
    """Wrapper for StarVector-1B model."""

    def __init__(self, model_name: str = "starvector/starvector-1b-im2svg"):
        """Initialize and load the StarVector model.

        Args:
            model_name: HuggingFace model identifier
        """
        self.model = None
        self.model_name = model_name
        self._load_model()

    def _load_model(self):
        """Load the StarVector model onto GPU."""
        import torch
        from transformers import AutoModelForCausalLM

        logger.info(f"Loading StarVector model: {self.model_name}")
        logger.info("This may take a minute on first run...")

        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_name,
            torch_dtype=torch.float16,
            trust_remote_code=True,
            attn_implementation="eager"  # Use standard attention
        )

        self.model.cuda()
        self.model.eval()

        import torch
        logger.info(f"Model loaded! Using GPU: {torch.cuda.get_device_name(0)}")

    def text_to_svg(self, prompt: str, max_length: int = 4000) -> str:
        """Generate SVG from text prompt.

        Note: The im2svg model doesn't support text-to-SVG well.
        This returns an info message. Use image_to_svg instead.

        Args:
            prompt: Text description of the icon
            max_length: Maximum token length for generation

        Returns:
            SVG string with info message
        """
        logger.warning("text_to_svg not supported by im2svg model")
        return f'''<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="100" fill="#1a1a2e"/>
  <text x="100" y="40" text-anchor="middle" fill="#e94560" font-size="12" font-family="sans-serif">
    Text-to-SVG not supported
  </text>
  <text x="100" y="60" text-anchor="middle" fill="#888" font-size="10" font-family="sans-serif">
    Use image-to-SVG instead
  </text>
  <text x="100" y="80" text-anchor="middle" fill="#555" font-size="8" font-family="sans-serif">
    "{prompt[:30]}..."
  </text>
</svg>'''

    def image_to_svg(self, image_bytes: bytes, max_length: int = 4000) -> str:
        """Generate SVG from image.

        Args:
            image_bytes: Image file bytes
            max_length: Maximum token length for generation

        Returns:
            Raw SVG string
        """
        from PIL import Image
        from starvector.data.util import process_and_rasterize_svg
        import io

        logger.info("Converting image to SVG")

        # Load image from bytes
        image_pil = Image.open(io.BytesIO(image_bytes))
        # Processor is on model.model (StarVectorStarCoder)
        processor = self.model.model.processor

        image = processor(image_pil, return_tensors="pt")['pixel_values']
        # Ensure batch dimension: [C, H, W] -> [1, C, H, W]
        if len(image.shape) == 3:
            image = image.unsqueeze(0)
        image = image.cuda().half()  # Move to GPU and convert to fp16

        batch = {"image": image}
        # generate_im2svg is on the outer model
        raw_svg = self.model.generate_im2svg(batch, max_length=max_length)[0]

        svg, _ = process_and_rasterize_svg(raw_svg)
        return svg


# Fallback dummy model for when dependencies aren't installed
class DummyStarVectorModel:
    """Dummy model that returns placeholder SVG."""

    def text_to_svg(self, prompt: str, max_length: int = 4000) -> str:
        return f'''<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="80" height="80" fill="none" stroke="#888" stroke-width="2"/>
  <text x="50" y="55" text-anchor="middle" fill="#888" font-size="8">
    StarVector not installed
  </text>
</svg>'''

    def image_to_svg(self, image_bytes: bytes, max_length: int = 4000) -> str:
        return self.text_to_svg("placeholder")


def load_model() -> StarVectorModel:
    """Load StarVector model with fallback to dummy.

    Returns:
        StarVectorModel or DummyStarVectorModel
    """
    try:
        import torch
        import transformers
        from starvector.data.util import process_and_rasterize_svg
        return StarVectorModel()
    except ImportError as e:
        logger.warning(f"StarVector dependencies not available: {e}")
        logger.warning("Using dummy model - install torch, transformers, starvector")
        return DummyStarVectorModel()
