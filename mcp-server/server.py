"""Iris MCP Server - Exposes Iris terminal capabilities to Claude Code."""

import asyncio
import json
import os
import sys
import uuid

from mcp.server.fastmcp import FastMCP

# Add parent dir to path for brain.skills.ws
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from iris_client import IrisClient

server = FastMCP("iris")
iris = IrisClient()

# Track god terminals: god_name -> terminal_entity_id
god_terminals: dict[str, str] = {}


@server.tool()
async def run_terminal(command: str, god_name: str = "Hermes") -> str:
    """Run a command in a god's dedicated terminal tab in Iris.

    Each god gets their own persistent terminal named "Terminal of {GodName}".
    Commands run visibly in the Iris UI.

    Args:
        command: The shell command to execute
        god_name: Which god's terminal to use (default: Hermes)

    Returns:
        Command output from the terminal
    """
    god_name = god_name.capitalize()
    terminal_name = f"Terminal of {god_name}"

    result = await iris.run_in_terminal(
        command=command,
        god_name=god_name,
        terminal_name=terminal_name
    )

    return result


@server.tool()
async def spawn_god(task: str, god_name: str = None) -> str:
    """Summon a new god (Claude instance) in Iris to work on a task.

    Args:
        task: Description of what the god should work on
        god_name: Optional god name (random if not specified)

    Returns:
        Confirmation message
    """
    result = await iris.spawn_god(god_name=god_name, task=task)
    return result


@server.tool()
async def peek_god(god_name: str, lines: int = 50) -> str:
    """View recent terminal output from a god.

    Args:
        god_name: The god to peek at
        lines: Number of lines to retrieve (default: 50)

    Returns:
        Recent terminal output
    """
    result = await iris.peek_god(god_name=god_name, lines=lines)
    return result


@server.tool()
async def list_entities() -> str:
    """List all active entities (gods, terminals, browsers, etc.) in Iris.

    Returns:
        JSON list of entities with their types and status
    """
    result = await iris.list_entities()
    return result


@server.tool()
async def push_to_god(god_name: str, text: str) -> str:
    """Send text input to a god's terminal.

    Args:
        god_name: The god to send input to
        text: Text to send (will be followed by Enter)

    Returns:
        Confirmation message
    """
    result = await iris.push_to_god(god_name=god_name, text=text)
    return result


if __name__ == "__main__":
    server.run()
