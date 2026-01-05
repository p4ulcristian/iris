"""Async WebSocket client for Iris MCP server."""

import asyncio
import json
import uuid
from typing import Any

import websockets


class IrisClient:
    """Async client for communicating with Iris WebSocket server."""

    def __init__(self, host: str = "127.0.0.1", port: int = 9999):
        self.host = host
        self.port = port
        self.url = f"ws://{host}:{port}"

    async def send_and_wait(
        self,
        message: dict,
        response_event: str,
        timeout: float = 30.0,
        match_field: str = None,
        match_value: str = None
    ) -> dict | None:
        """Send a message and wait for a specific response event.

        Args:
            message: Dict to send as JSON
            response_event: Event name to wait for
            timeout: Timeout in seconds
            match_field: Optional field to match in response
            match_value: Value that match_field should equal

        Returns:
            Response dict if successful, None otherwise
        """
        try:
            async with websockets.connect(self.url) as ws:
                # Send message
                await ws.send(json.dumps(message))

                # Wait for matching response
                while True:
                    try:
                        response = await asyncio.wait_for(ws.recv(), timeout=timeout)
                        data = json.loads(response)

                        # Check if this is the response we want
                        if data.get("event") == response_event:
                            if match_field and match_value:
                                if data.get(match_field) == match_value:
                                    return data
                            else:
                                return data

                        # Also check for state:sync which contains entity info
                        if data.get("event") == "state:sync":
                            # Store state for later use
                            self._last_state = data
                            continue

                    except asyncio.TimeoutError:
                        return None

        except Exception as e:
            print(f"WebSocket error: {e}")
            return None

    async def send_fire_and_forget(self, message: dict) -> bool:
        """Send a message without waiting for response.

        Args:
            message: Dict to send as JSON

        Returns:
            True if sent successfully
        """
        try:
            async with websockets.connect(self.url) as ws:
                await ws.send(json.dumps(message))
                # Wait briefly for state sync to confirm
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    return True
                except asyncio.TimeoutError:
                    return True
        except Exception as e:
            print(f"WebSocket error: {e}")
            return False

    async def run_in_terminal(
        self,
        command: str,
        god_name: str,
        terminal_name: str,
        timeout: float = 60.0
    ) -> str:
        """Run a command in a god's dedicated terminal.

        This sends an mcp:run event to Iris which handles:
        - Finding/creating the terminal for this god
        - Running the command
        - Returning output

        Args:
            command: Command to execute
            god_name: God name for terminal ownership
            terminal_name: Display name for the terminal
            timeout: Max time to wait for output

        Returns:
            Command output
        """
        request_id = str(uuid.uuid4())

        message = {
            "event": "mcp:run",
            "requestId": request_id,
            "godName": god_name,
            "terminalName": terminal_name,
            "command": command
        }

        response = await self.send_and_wait(
            message,
            "mcp:run:response",
            timeout=timeout,
            match_field="requestId",
            match_value=request_id
        )

        if response:
            if response.get("error"):
                return f"Error: {response['error']}"
            return response.get("output", "")

        return "Error: Timeout waiting for command output. Command may still be running in Iris."

    async def spawn_god(self, god_name: str = None, task: str = "") -> str:
        """Spawn a new god in Iris.

        Args:
            god_name: Optional god name
            task: Task description

        Returns:
            Confirmation message
        """
        message = {
            "event": "god:spawn",
            "task": task
        }
        if god_name:
            message["name"] = god_name.capitalize()

        success = await self.send_fire_and_forget(message)

        if success:
            name = god_name.capitalize() if god_name else "a god"
            return f"Spawned {name} in Iris with task: {task}"
        return "Failed to spawn god - is Iris running?"

    async def peek_god(self, god_name: str, lines: int = 50) -> str:
        """Get recent output from a god's terminal.

        Args:
            god_name: God name to peek at
            lines: Number of lines

        Returns:
            Terminal output
        """
        message = {
            "event": "entity:peek",
            "godName": god_name.capitalize(),
            "lines": lines
        }

        response = await self.send_and_wait(
            message,
            "entity:peek:response",
            timeout=5.0,
            match_field="entityId",
            match_value=god_name.capitalize()
        )

        if response:
            return response.get("output", "No output available")
        return f"Could not peek at {god_name} - entity may not exist"

    async def push_to_god(self, god_name: str, text: str) -> str:
        """Send text input to a god's terminal.

        Args:
            god_name: God to send to
            text: Text to send

        Returns:
            Confirmation
        """
        message = {
            "event": "pty:input",
            "godName": god_name.capitalize(),
            "data": text + "\n"
        }

        success = await self.send_fire_and_forget(message)

        if success:
            return f"Sent input to {god_name.capitalize()}"
        return f"Failed to send input to {god_name}"

    async def list_entities(self) -> str:
        """List all entities in Iris.

        Returns:
            JSON string of entities
        """
        try:
            async with websockets.connect(self.url) as ws:
                # Just connect and get state:sync
                response = await asyncio.wait_for(ws.recv(), timeout=5.0)
                data = json.loads(response)

                if data.get("event") == "state:sync":
                    entities = data.get("entities", {})
                    result = []
                    for entity_id, entity in entities.items():
                        result.append({
                            "id": entity_id,
                            "type": entity.get("type"),
                            "name": entity.get("name"),
                            "title": entity.get("title"),
                            "status": entity.get("status"),
                            "readyState": entity.get("readyState")
                        })
                    return json.dumps(result, indent=2)

                return "Could not get entity list"
        except Exception as e:
            return f"Error: {e}"
