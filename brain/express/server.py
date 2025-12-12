#!/usr/bin/env python3
"""
Iris Express Server - Visual UI HTTP API

Endpoints:
  GET  /health - Health check
  POST /state  - Update visual state
"""

from flask import Flask, request, jsonify
import logging
import threading

app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

logger = logging.getLogger(__name__)

# Config
HOST = "127.0.0.1"
PORT = 8767

# State
current_state = "ready"
is_ready = True
bubble_instance = None


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"ready": is_ready})


@app.route('/state', methods=['POST'])
def update_state():
    """Update visual state"""
    global current_state, bubble_instance

    data = request.get_json()
    if not data or 'state' not in data:
        return jsonify({"error": "No state provided"}), 400

    state = data['state']
    valid_states = ['ready', 'listening', 'speaking', 'loading']

    if state not in valid_states:
        return jsonify({"error": f"Invalid state. Must be one of: {valid_states}"}), 400

    logger.info(f"State change: {current_state} -> {state}")
    current_state = state

    # Update bubble if it exists
    if bubble_instance:
        bubble_instance.set_state(state)

    return jsonify({"status": "ok", "state": state})


def start_bubble():
    """Start the GTK bubble in a separate thread"""
    global bubble_instance

    try:
        from .bubble import BubbleApp
        bubble_instance = BubbleApp()
        bubble_instance.run()
    except ImportError as e:
        logger.warning(f"Could not start bubble UI: {e}")
        logger.warning("Running in headless mode (API only)")
    except Exception as e:
        logger.error(f"Bubble UI error: {e}")


def main():
    """Start the server"""
    logger.info(f"Starting Iris Express server on {HOST}:{PORT}")

    # Start bubble UI in background thread
    bubble_thread = threading.Thread(target=start_bubble, daemon=True)
    bubble_thread.start()

    # Start Flask server
    app.run(
        host=HOST,
        port=PORT,
        debug=False,
        threaded=True
    )


if __name__ == '__main__':
    main()
