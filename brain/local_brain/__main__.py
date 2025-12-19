"""
Command-line interface for local_brain (vLLM).

Usage:
    python -m brain.local_brain server start     # Start vLLM server
    python -m brain.local_brain server stop      # Stop vLLM server
    python -m brain.local_brain server status    # Check server status
    python -m brain.local_brain list             # List available models
    python -m brain.local_brain chat "message"   # Single message chat
    python -m brain.local_brain tui              # TUI chat interface (recommended)
"""

import sys
import subprocess
import time
from .client import LocalBrain


def start_server(gpu_id: int = 1, port: int = 8000):
    """Start vLLM server in background."""
    brain = LocalBrain()

    if brain.is_vllm_server_running():
        print(f"✅ vLLM server already running at {brain.server_url}")
        return True

    print(f"🚀 Starting vLLM server on GPU {gpu_id}...")
    print(f"   Model: {brain.model}")
    print(f"   Port: {port}")
    print(f"   This will download ~5GB on first run...")
    print()

    process = brain.start_server(gpu_id=gpu_id, port=port)

    # Wait for server to start
    print("⏳ Waiting for server to start (this may take a minute)...")
    for i in range(60):
        time.sleep(2)
        if brain.is_vllm_server_running():
            print(f"✅ vLLM server ready at {brain.server_url}")
            print(f"   PID: {process.pid}")
            print()
            print("Use 'python -m brain.local_brain tui' to start chatting!")
            return True

    print("❌ Server failed to start within timeout")
    process.kill()
    return False


def stop_server():
    """Stop vLLM server."""
    print("Stopping vLLM server...")
    try:
        result = subprocess.run(
            ["pkill", "-f", "vllm serve"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("✅ vLLM server stopped")
        else:
            print("⚠️  No vLLM server found running")
    except Exception as e:
        print(f"❌ Error stopping server: {e}")


def server_status():
    """Check vLLM server status."""
    brain = LocalBrain()
    if brain.is_vllm_server_running():
        print(f"✅ vLLM server is running at {brain.server_url}")
        models = brain.list_models()
        if models:
            print("\nAvailable models:")
            for model in models:
                print(f"  • {model['name']}")
    else:
        print(f"❌ vLLM server is not running")
        print()
        print("Start it with: python -m brain.local_brain server start")


def main():
    """Main CLI entry point."""
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]

    if command == "server":
        if len(sys.argv) < 3:
            print("Usage: python -m brain.local_brain server [start|stop|status]")
            sys.exit(1)

        subcommand = sys.argv[2]
        if subcommand == "start":
            gpu_id = int(sys.argv[3]) if len(sys.argv) > 3 else 1
            port = int(sys.argv[4]) if len(sys.argv) > 4 else 8000
            start_server(gpu_id=gpu_id, port=port)
        elif subcommand == "stop":
            stop_server()
        elif subcommand == "status":
            server_status()
        else:
            print(f"Unknown server command: {subcommand}")
            sys.exit(1)

    elif command == "list":
        brain = LocalBrain()
        models = brain.list_models()
        if models:
            print("\nAvailable models:")
            for model in models:
                print(f"  • {model['name']}")
        else:
            print("No models available")
            print("Start vLLM server: python -m brain.local_brain server start")

    elif command == "chat":
        if len(sys.argv) < 3:
            print("Usage: python -m brain.local_brain chat \"your message\"")
            sys.exit(1)

        message = sys.argv[2]
        brain = LocalBrain()

        if not brain.is_vllm_server_running():
            print("❌ vLLM server is not running")
            print("Start it with: python -m brain.local_brain server start")
            sys.exit(1)

        print("Generating response...")
        response = brain.chat(message, max_tokens=512)
        print()
        print(response)

    elif command == "tui":
        from .tui import run_tui
        brain = LocalBrain()

        if not brain.is_vllm_server_running():
            print("❌ vLLM server is not running")
            print("Start it with: python -m brain.local_brain server start")
            sys.exit(1)

        run_tui(model=brain.model)

    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
