# /// script
# requires-python = ">=3.11"
# dependencies = ["mcp", "httpx"]
# ///
"""
Iris MCP Server - wraps HTTP API for Claude tools.

Tools:
  - spawn_god: Summon a new god
  - peek_god: View god's terminal output
  - run_terminal: Run command in god's terminal
  - push_to_god: Send input to god
  - list_entities: List all active entities
"""

import os
import httpx
from mcp.server.fastmcp import FastMCP

API_BASE = "http://127.0.0.1:9998/api"
WS_PORT = 9999

mcp = FastMCP("iris")


def api_post(endpoint: str, data: dict) -> dict:
    """POST to HTTP API."""
    try:
        r = httpx.post(f"{API_BASE}/{endpoint}", json=data, timeout=5)
        return r.json() if r.status_code == 200 else {"error": r.text}
    except Exception as e:
        return {"error": str(e)}


def ws_send(event: str, data: dict) -> dict:
    """Send WebSocket message via HTTP wrapper (simplified)."""
    # For spawn/peek, we use WebSocket - but let's proxy through a simple HTTP call
    # The server will need an HTTP endpoint for these
    return api_post("ws", {"event": event, **data})


@mcp.tool()
def spawn_god(task: str, god_name: str = None, project: str = None) -> str:
    """
    Summon a new god (Claude instance) in Iris to work on a task.

    Args:
        task: Description of what the god should work on
        god_name: Optional god name (random if not specified)
        project: Optional project name to work in (e.g., "ironrainbow")
    """
    # Check if Iris is running
    try:
        r = httpx.get(f"{API_BASE}/health", timeout=2)
        if r.status_code != 200:
            return "Failed to spawn god - is Iris running?"
    except:
        return "Failed to spawn god - is Iris running?"

    # Send spawn request via WebSocket (simplified - POST to spawn endpoint)
    data = {"event": "god:spawn", "task": task}
    if god_name:
        data["name"] = god_name
    if project:
        data["project"] = project

    result = api_post("spawn", data)
    if "error" in result:
        return f"Failed to spawn god: {result['error']}"

    return f"Summoned {result.get('name', 'god')} to work on: {task}"


@mcp.tool()
def peek_god(god_name: str, lines: int = 50) -> str:
    """
    View recent terminal output from a god.

    Args:
        god_name: The god to peek at
        lines: Number of lines to retrieve (default: 50)
    """
    result = api_post("peek", {"god": god_name, "lines": lines})
    if "error" in result:
        return f"Failed to peek: {result['error']}"
    return result.get("output", "No output")


@mcp.tool()
def run_terminal(command: str, god_name: str = "Hermes") -> str:
    """
    Run a command in a god's dedicated terminal tab in Iris.

    Args:
        command: The shell command to execute
        god_name: Which god's terminal to use (default: Hermes)
    """
    result = api_post("run", {"god": god_name, "command": command})
    if "error" in result:
        return f"Failed to run: {result['error']}"
    return result.get("output", "Command executed")


@mcp.tool()
def push_to_god(god_name: str, text: str) -> str:
    """
    Send text input to a god's terminal.

    Args:
        god_name: The god to send input to
        text: Text to send (will be followed by Enter)
    """
    result = api_post("push", {"god": god_name, "text": text})
    if "error" in result:
        return f"Failed to push: {result['error']}"
    return f"Sent to {god_name}: {text}"


@mcp.tool()
def list_entities() -> str:
    """
    List all active entities (gods, terminals, browsers, etc.) in Iris.
    """
    result = api_post("entities", {})
    if "error" in result:
        return f"Failed to list: {result['error']}"

    entities = result.get("entities", [])
    if not entities:
        return "No active entities"

    lines = []
    for e in entities:
        status = e.get("readyState", "unknown")
        lines.append(f"- {e.get('name', 'Unknown')} ({e.get('type', 'entity')}): {status}")

    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run()
