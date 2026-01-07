# /// script
# requires-python = ">=3.11"
# dependencies = ["mcp", "httpx"]
# ///
"""Run the Iris MCP server."""

from . import mcp

if __name__ == "__main__":
    mcp.run()
