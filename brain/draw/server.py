#!/usr/bin/env python3
"""
Draw Service - StarVector SVG Generation Server

Provides AI-powered SVG generation via HTTP endpoints.

Run setup.sh first to install StarVector dependencies.
"""

import logging
import sys
import os
from pathlib import Path

# Check for local venv (created by setup.sh)
SCRIPT_DIR = Path(__file__).parent
VENV_SITE_PACKAGES = SCRIPT_DIR / ".venv" / "lib" / "python3.11" / "site-packages"

if VENV_SITE_PACKAGES.exists():
    sys.path.insert(0, str(VENV_SITE_PACKAGES))
    # Also add star-vector source if installed in editable mode
    STAR_VECTOR_DIR = SCRIPT_DIR / "star-vector"
    if STAR_VECTOR_DIR.exists():
        sys.path.insert(0, str(STAR_VECTOR_DIR))

# Add sibling modules to path
sys.path.insert(0, str(SCRIPT_DIR))

from flask import Flask, request, jsonify
from flask_cors import CORS

from model import load_model
from svg import make_monochrome, clean_svg

# Configuration
HOST = "127.0.0.1"
PORT = 8768

# Global state
model = None
is_ready = False

# Flask app
app = Flask(__name__)
CORS(app)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


def init_model():
    """Initialize the StarVector model on startup."""
    global model, is_ready

    logger.info("Initializing StarVector model...")
    model = load_model()
    is_ready = True
    logger.info("Draw service ready!")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"ready": is_ready})


@app.route('/text2svg', methods=['POST'])
def text2svg():
    """Generate SVG from text prompt.

    Request JSON:
        prompt: str - Text description of the icon
        mono: bool - Convert to monochrome (optional, default false)
        color: str - Monochrome color (optional, default #ffffff)
        max_length: int - Max token length (optional, default 4000)

    Returns JSON:
        svg: str - Generated SVG content
        prompt: str - Original prompt
    """
    if not is_ready:
        return jsonify({"error": "Model not ready"}), 503

    data = request.get_json() or {}
    prompt = data.get('prompt', '')
    mono = data.get('mono', False)
    color = data.get('color', '#ffffff')
    max_length = data.get('max_length', 4000)

    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    try:
        svg = model.text_to_svg(prompt, max_length=max_length)
        svg = clean_svg(svg)

        if mono:
            svg = make_monochrome(svg, color)

        return jsonify({
            "svg": svg,
            "prompt": prompt
        })

    except Exception as e:
        logger.error(f"Generation error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/image2svg', methods=['POST'])
def image2svg():
    """Generate SVG from uploaded image.

    Request:
        multipart/form-data with 'image' file
        mono: bool - Convert to monochrome (optional)
        color: str - Monochrome color (optional)
        max_length: int - Max token length (optional)

    Returns JSON:
        svg: str - Generated SVG content
    """
    if not is_ready:
        return jsonify({"error": "Model not ready"}), 503

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files['image']
    mono = request.form.get('mono', 'false').lower() == 'true'
    color = request.form.get('color', '#ffffff')
    max_length = int(request.form.get('max_length', 4000))

    try:
        image_bytes = image_file.read()
        svg = model.image_to_svg(image_bytes, max_length=max_length)
        svg = clean_svg(svg)

        if mono:
            svg = make_monochrome(svg, color)

        return jsonify({"svg": svg})

    except Exception as e:
        logger.error(f"Image conversion error: {e}")
        return jsonify({"error": str(e)}), 500


def main():
    """Start the Draw service."""
    logger.info(f"Starting Draw service on {HOST}:{PORT}")
    init_model()
    app.run(host=HOST, port=PORT, debug=False, threaded=True)


if __name__ == '__main__':
    main()
