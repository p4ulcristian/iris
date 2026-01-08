"""
Shared infrastructure for Iris power services.

Provides common Flask app setup, logging configuration, and server lifecycle management.

Usage:
    from base import setup_logging, create_app, run_server

    logger = setup_logging("myservice")
    app = create_app()

    @app.route('/health')
    def health():
        return {"ready": True}

    if __name__ == '__main__':
        run_server(app, 8765, init_fn=my_init)
"""

from flask import Flask, jsonify
from flask_cors import CORS
import logging
import signal
import os
import threading
from pathlib import Path


# Project paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent  # powers -> iris
LOGS_DIR = PROJECT_ROOT / 'logs'
IS_DEV = 'iris/powers' in str(Path(__file__).resolve())

# Shutdown flag
_shutdown_event = threading.Event()


def setup_logging(service_name: str) -> logging.Logger:
    """Configure logging with console + file output.

    Args:
        service_name: Name used in log prefix (e.g., "speak", "hear")

    Returns:
        Configured logger instance
    """
    # Console logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # File logging (dev mode only)
    if IS_DEV and LOGS_DIR.exists():
        log_file = LOGS_DIR / 'backend.txt'
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(logging.Formatter(
            f'[%(asctime)s] [{service_name}] %(levelname)s: %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        ))
        logging.getLogger().addHandler(file_handler)

    return logging.getLogger(service_name)


def create_app(cors: bool = True) -> Flask:
    """Create Flask app with standard configuration.

    Args:
        cors: Enable CORS (default True)

    Returns:
        Configured Flask application
    """
    app = Flask(__name__)

    if cors:
        CORS(app)

    # Add shutdown endpoint
    @app.route('/shutdown', methods=['POST'])
    def shutdown():
        """Gracefully shutdown the server."""
        _shutdown_event.set()
        return jsonify({"status": "shutting down"})

    return app


def run_server(
    app: Flask,
    port: int,
    host: str = "127.0.0.1",
    init_fn=None,
    cleanup_fn=None,
    logger=None
):
    """Run Flask server with lifecycle hooks.

    Args:
        app: Flask application
        port: Port to listen on
        host: Host to bind to (default localhost)
        init_fn: Function to call before starting server
        cleanup_fn: Function to call on shutdown
        logger: Logger instance for status messages
    """
    log = logger or logging.getLogger(__name__)

    log.info(f"Starting server on {host}:{port}")

    # Run initialization
    if init_fn:
        init_fn()

    # Run Flask in a thread so we can monitor shutdown event
    from werkzeug.serving import make_server

    server = make_server(host, port, app, threaded=True)
    server_thread = threading.Thread(target=server.serve_forever)
    server_thread.daemon = True
    server_thread.start()

    log.info(f"Server running on {host}:{port}")

    # Wait for shutdown signal (from /shutdown endpoint or Ctrl+C)
    try:
        while not _shutdown_event.is_set():
            _shutdown_event.wait(timeout=1.0)
    except KeyboardInterrupt:
        log.info("Keyboard interrupt received")

    log.info("Shutting down...")

    # Stop the server
    server.shutdown()

    # Run cleanup
    if cleanup_fn:
        cleanup_fn()

    log.info("Server stopped")
