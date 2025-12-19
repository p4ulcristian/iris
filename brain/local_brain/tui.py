"""
TUI (Text User Interface) for local_brain chat with vLLM.
Ultra-fast streaming chat interface with tool support.
"""

import subprocess
import json
from textual.app import App, ComposeResult
from textual.containers import Container, VerticalScroll
from textual.widgets import Header, Footer, Input, Static
from textual.binding import Binding
from textual import work
from rich.markdown import Markdown
from rich.panel import Panel
from rich.text import Text
from datetime import datetime
from .client import LocalBrain


class Message(Static):
    """A single message in the chat."""

    def __init__(self, role: str, content: str = "", timestamp: str = None):
        super().__init__()
        self.role = role
        self.content = content
        self.timestamp = timestamp or datetime.now().strftime("%H:%M:%S")

    def append_content(self, text: str):
        """Append text to message content (for streaming)."""
        self.content += text
        self.refresh()

    def render(self):
        """Render the message with styling."""
        if self.role == "user":
            style = "bold cyan"
            prefix = "You"
        elif self.role == "assistant":
            style = "bold green"
            prefix = "Qwen3 (vLLM)"
        elif self.role == "system":
            style = "bold magenta"
            prefix = "System"
        else:
            style = "bold white"
            prefix = self.role

        # Create header
        header = Text()
        header.append(f"{prefix}", style=style)
        header.append(f" [{self.timestamp}]", style="dim")

        # Render content
        if self.role == "assistant" and self.content:
            content_renderable = Markdown(self.content)
        else:
            content_renderable = self.content if self.content else "..."

        return Panel(
            content_renderable,
            title=header,
            border_style=style,
            padding=(0, 1)
        )


class ToolCallMessage(Static):
    """Display for tool calls."""

    def __init__(self, tool_name: str, arguments: dict):
        super().__init__()
        self.tool_name = tool_name
        self.arguments = arguments

    def render(self):
        """Render the tool call."""
        content = Text()
        content.append(f"🔧 Tool: ", style="bold yellow")
        content.append(f"{self.tool_name}\n", style="yellow")
        content.append(f"Arguments: ", style="bold yellow")
        content.append(f"{self.arguments}", style="yellow")

        return Panel(
            content,
            title="Tool Call",
            border_style="yellow",
            padding=(0, 1)
        )


class ChatHistory(VerticalScroll):
    """Container for chat messages."""

    def add_message(self, role: str, content: str = ""):
        """Add a new message to the chat."""
        message = Message(role, content)
        self.mount(message)
        self.scroll_end(animate=False)
        return message

    def add_tool_call(self, tool_name: str, arguments: dict):
        """Add a tool call indicator."""
        tool_msg = ToolCallMessage(tool_name, arguments)
        self.mount(tool_msg)
        self.scroll_end(animate=False)


class ChatApp(App):
    """Ultra-fast Qwen3 chat with vLLM."""

    CSS = """
    Screen {
        background: $surface;
    }

    ChatHistory {
        height: 1fr;
        background: $surface;
        padding: 1;
    }

    #input-container {
        height: auto;
        background: $panel;
        padding: 1;
        dock: bottom;
    }

    Input {
        width: 100%;
    }

    Message {
        margin: 0 0 1 0;
    }

    ToolCallMessage {
        margin: 0 0 1 0;
    }
    """

    BINDINGS = [
        Binding("ctrl+c", "quit", "Quit", show=True),
        Binding("ctrl+d", "quit", "Quit", show=False),
    ]

    def __init__(self, model: str = "Qwen/Qwen3-8B-FP8"):
        super().__init__()
        self.model = model
        self.brain = LocalBrain(model=model)
        self.messages = []

        # Define available tools
        self.tools = [{
            'type': 'function',
            'function': {
                'name': 'speak',
                'description': 'Speak text aloud using the brain.say module. Use this to greet the user, announce important information, or add personality to responses.',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'text': {
                            'type': 'string',
                            'description': 'The text to speak aloud'
                        },
                        'voice': {
                            'type': 'string',
                            'description': 'Voice to use: emma, indian, french, german, italian, japanese, spanish, etc. Default is emma.',
                            'default': 'emma'
                        }
                    },
                    'required': ['text']
                }
            }
        }]

    def compose(self) -> ComposeResult:
        """Create the UI layout."""
        yield Header()
        yield ChatHistory(id="chat-history")
        with Container(id="input-container"):
            yield Input(placeholder="Type your message... (Ctrl+C to quit)", id="input")
        yield Footer()

    def on_mount(self):
        """Initialize the app."""
        self.title = "Qwen3 (vLLM) - Ultra Fast"
        self.sub_title = "80-120 tok/s streaming"

        # Welcome message
        chat = self.query_one(ChatHistory)
        chat.add_message(
            "system",
            "🚀 **Qwen3-8B-FP8 with vLLM**\n\n"
            "Ultra-fast streaming chat (80-120 tok/s)\n\n"
            "🔧 Qwen3 can use the `speak` tool to talk to you.\n\n"
            "Start chatting!"
        )

        # Focus input
        self.query_one(Input).focus()

    async def on_input_submitted(self, event: Input.Submitted):
        """Handle user input submission."""
        user_input = event.value.strip()
        if not user_input:
            return

        # Clear input
        event.input.value = ""

        # Add user message to chat
        chat = self.query_one(ChatHistory)
        chat.add_message("user", user_input)

        # Add to message history
        self.messages.append({
            'role': 'user',
            'content': user_input
        })

        # Stream response
        self.stream_response()

    @work(exclusive=True, thread=True)
    def stream_response(self):
        """Stream response from vLLM with tool support."""
        chat = self.query_one(ChatHistory)

        try:
            # Create streaming message
            current_message = self.call_from_thread(chat.add_message, "assistant", "")
            full_content = ""
            tool_calls_list = []

            # Build conversation
            from openai import OpenAI
            import json

            client = OpenAI(
                api_key="EMPTY",
                base_url=f"{self.brain.server_url}/v1"
            )

            # Stream from vLLM server with tools
            stream = client.chat.completions.create(
                model=self.model,
                messages=self.messages,
                tools=self.tools,
                temperature=0.7,
                top_p=0.9,
                max_tokens=2048,
                stream=True
            )

            for chunk in stream:
                if chunk.choices[0].delta.content:
                    delta = chunk.choices[0].delta.content
                    full_content += delta
                    self.call_from_thread(current_message.append_content, delta)
                    self.call_from_thread(chat.scroll_end, animate=False)

                # Check for tool calls
                if chunk.choices[0].delta.tool_calls:
                    for tool_call in chunk.choices[0].delta.tool_calls:
                        if tool_call.function:
                            tool_calls_list.append(tool_call)

            # If tool calls were made, handle them
            if tool_calls_list:
                # Remove streaming message
                self.call_from_thread(current_message.remove)

                # Execute each tool and collect results
                tool_results = []
                for tool_call in tool_calls_list:
                    function_name = tool_call.function.name
                    try:
                        arguments = json.loads(tool_call.function.arguments)
                    except:
                        arguments = {}

                    # Show tool call in UI
                    self.call_from_thread(chat.add_tool_call, function_name, arguments)

                    # Execute tool
                    if function_name == 'speak':
                        result = self.execute_speak(
                            arguments.get('text', ''),
                            arguments.get('voice', 'emma')
                        )
                        tool_results.append(result)
                        self.call_from_thread(chat.add_message, "system", result)

                # Add simple acknowledgment to history instead of tool calls
                # This avoids format compatibility issues
                if tool_results:
                    self.messages.append({
                        'role': 'assistant',
                        'content': f"[Used tools: {', '.join([tc.function.name for tc in tool_calls_list])}]"
                    })
                    for result in tool_results:
                        self.messages.append({
                            'role': 'user',
                            'content': f"Tool result: {result}"
                        })

                # Get final response after tool execution
                final_message = self.call_from_thread(chat.add_message, "assistant", "")
                final_content = ""

                final_stream = client.chat.completions.create(
                    model=self.model,
                    messages=self.messages,
                    temperature=0.7,
                    top_p=0.9,
                    max_tokens=2048,
                    stream=True
                )

                for final_chunk in final_stream:
                    if final_chunk.choices[0].delta.content:
                        delta = final_chunk.choices[0].delta.content
                        final_content += delta
                        self.call_from_thread(final_message.append_content, delta)
                        self.call_from_thread(chat.scroll_end, animate=False)

                # Add to message history
                self.messages.append({
                    'role': 'assistant',
                    'content': final_content
                })
            else:
                # No tool calls, just add the message
                self.messages.append({
                    'role': 'assistant',
                    'content': full_content
                })

        except Exception as e:
            self.call_from_thread(
                chat.add_message,
                "system",
                f"❌ **Error:** {str(e)}\n\n"
                f"Make sure vLLM server is running:\n"
                f"python -m brain.local_brain server status"
            )

    def execute_speak(self, text: str, voice: str = 'emma') -> str:
        """Execute the brain.say command."""
        try:
            cmd = ['python', '-m', 'brain.say', text]
            if voice and voice != 'emma':
                cmd.extend(['--voice', voice])

            subprocess.run(cmd, check=True)
            return f"✅ Spoke: '{text}' (voice: {voice})"
        except Exception as e:
            return f"❌ Error speaking: {str(e)}"


def run_tui(model: str = "Qwen/Qwen3-8B-FP8"):
    """Run the TUI chat application."""
    app = ChatApp(model=model)
    app.run()
