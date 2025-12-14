#!/usr/bin/env python3
"""
Iris Express Server - Visual UI HTTP API

Endpoints:
  GET  /health - Health check
  POST /state  - Update visual state
"""

import sys
import os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from flask import Flask, request, jsonify
import logging

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

    # Write to state file for bubble to read
    update_state_file(state)

    return jsonify({"status": "ok", "state": state})


import subprocess
import signal
from pathlib import Path

# Bubble process and state file for communication
bubble_process = None
STATE_FILE = Path("/tmp/iris/express-state")
BUBBLE_SCRIPT = Path(__file__).parent / "bubble.py"


def start_bubble():
    """Start the bubble overlay as separate process"""
    global bubble_process
    try:
        logger.info("Starting bubble overlay...")
        env = os.environ.copy()
        env['LD_PRELOAD'] = '/usr/lib/libgtk4-layer-shell.so'
        # Use venv python
        venv_python = Path(__file__).parent.parent / ".venv" / "bin" / "python"
        python_cmd = str(venv_python) if venv_python.exists() else sys.executable
        bubble_process = subprocess.Popen(
            [python_cmd, str(BUBBLE_SCRIPT)],
            start_new_session=True,
            env=env
        )
        logger.info(f"Bubble overlay started (PID: {bubble_process.pid})")
    except Exception as e:
        logger.warning(f"Could not start bubble UI: {e}")
        logger.warning("Running in headless mode (API only)")


def stop_bubble():
    """Stop the bubble overlay"""
    global bubble_process
    if bubble_process is not None:
        try:
            import os
            os.killpg(os.getpgid(bubble_process.pid), signal.SIGTERM)
        except Exception:
            pass
        bubble_process = None


def update_state_file(state):
    """Write state to file for bubble to read"""
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(state)
    except Exception:
        pass


def main():
    """Start the server"""
    logger.info(f"Starting Iris Express server on {HOST}:{PORT}")

    # Start bubble as separate process
    start_bubble()

    # Handle shutdown
    def shutdown(signum, frame):
        stop_bubble()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    # Start Flask server (blocks)
    app.run(
        host=HOST,
        port=PORT,
        debug=False,
        threaded=True
    )


if __name__ == '__main__':
    main()
