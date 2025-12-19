#!/usr/bin/env python3
"""
Chat TUI with copy support
- Mouse selection to copy text
- Ctrl+C to copy focused message
- Click message to focus and show copy option
"""

from textual.app import App, ComposeResult
from textual.containers import Container, Vertical, Horizontal
from textual.widgets import Header, Footer, Static, Input, RichLog
from textual.binding import Binding
from rich.text import Text
from rich.panel import Panel
from datetime import datetime
import subprocess
import shutil


def copy_to_clipboard(text: str) -> bool:
    """Copy text to clipboard using available system tools."""
    # Try wl-copy (Wayland)
    if shutil.which("wl-copy"):
        try:
            subprocess.run(["wl-copy"], input=text.encode(), check=True)
            return True
        except subprocess.CalledProcessError:
            pass

    # Try xclip (X11)
    if shutil.which("xclip"):
        try:
            subprocess.run(["xclip", "-selection", "clipboard"],
                         input=text.encode(), check=True)
            return True
        except subprocess.CalledProcessError:
            pass

    # Try xsel (X11 alternative)
    if shutil.which("xsel"):
        try:
            subprocess.run(["xsel", "--clipboard", "--input"],
                         input=text.encode(), check=True)
            return True
        except subprocess.CalledProcessError:
            pass

    return False


class Message(Static):
    """A single chat message that can be copied."""

    def __init__(self, author: str, content: str, timestamp: str = None):
        super().__init__()
        self.author = author
        self.message_content = content
        self.timestamp = timestamp or datetime.now().strftime("%H:%M:%S")
        self.can_focus = True

    def render(self) -> Panel:
        """Render the message as a panel."""
        text = Text()
        text.append(f"{self.author}", style="bold cyan")
        text.append(f" [{self.timestamp}]\n", style="dim")
        text.append(self.message_content)

        border_style = "green" if self.has_focus else "dim"
        return Panel(text, border_style=border_style)

    def on_click(self) -> None:
        """Focus this message when clicked."""
        self.focus()


class ChatView(Vertical):
    """Container for chat messages with scrolling."""

    def add_message(self, author: str, content: str) -> None:
        """Add a new message to the chat."""
        message = Message(author, content)
        self.mount(message)
        message.scroll_visible()


class ChatTUI(App):
    """A TUI chat application with copy support."""

    CSS = """
    Screen {
        background: $surface;
    }

    ChatView {
        height: 1fr;
        overflow-y: auto;
        border: solid $primary;
        padding: 1;
    }

    Message {
        margin: 1 0;
        height: auto;
    }

    Message:focus {
        border: heavy $success;
    }

    #input-container {
        height: 3;
        dock: bottom;
    }

    Input {
        width: 100%;
    }
    """

    BINDINGS = [
        Binding("y,cmd+c", "copy_focused", "Copy Message", show=True),
        Binding("ctrl+c,ctrl+q,cmd+q", "quit", "Quit", show=True),
        ("escape", "blur_input", "Unfocus input"),
    ]

    def compose(self) -> ComposeResult:
        """Create child widgets."""
        yield Header()
        yield ChatView(id="chat-view")
        with Horizontal(id="input-container"):
            yield Input(placeholder="Type a message (Enter to send, 'y' or Cmd+C to copy focused message)")
        yield Footer()

    def on_mount(self) -> None:
        """Initialize the app with some example messages."""
        chat_view = self.query_one(ChatView)

        # Add some example messages
        chat_view.add_message("System", "Welcome to Chat TUI! You can:")
        chat_view.add_message("System", "• Select text with your mouse and copy with Ctrl+Shift+C (terminal)")
        chat_view.add_message("System", "• Click a message to focus it, then press 'y' or Cmd+C to copy")
        chat_view.add_message("System", "• Use Tab/Shift+Tab to navigate between messages")
        chat_view.add_message("System", "• Press Ctrl+C to quit")
        chat_view.add_message("Alice", "Hey! This is a sample message.")
        chat_view.add_message("Bob", "You can copy any of these messages by clicking them and pressing 'y'")
        chat_view.add_message("Alice", "Or just select text with your mouse like in any terminal!")

        # Focus the input
        self.query_one(Input).focus()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        """Handle message submission."""
        message = event.value.strip()
        if message:
            chat_view = self.query_one(ChatView)
            chat_view.add_message("You", message)
            event.input.value = ""

            # Simulate a response
            self.set_timer(1, lambda: chat_view.add_message("Bot", f"Echo: {message}"))

    def action_copy_focused(self) -> None:
        """Copy the currently focused message to clipboard."""
        focused = self.focused

        if isinstance(focused, Message):
            # Copy the full message content
            text_to_copy = f"[{focused.timestamp}] {focused.author}: {focused.message_content}"
            if copy_to_clipboard(text_to_copy):
                self.notify(f"✓ Copied message from {focused.author}", severity="information")
            else:
                self.notify("✗ No clipboard tool found (install wl-copy, xclip, or xsel)", severity="error")
        else:
            self.notify("No message focused. Click a message first or use Tab to navigate.", severity="warning")

    def action_blur_input(self) -> None:
        """Unfocus the input to allow message navigation."""
        chat_view = self.query_one(ChatView)
        messages = chat_view.query(Message)
        if messages:
            messages[-1].focus()


if __name__ == "__main__":
    app = ChatTUI()
    app.run()
