"""
Iris Bridge Events - Type definitions and helper functions.
"""

from dataclasses import dataclass
from typing import Literal
from .client import emit_sync


# Event types
GodStatus = Literal["laboring", "dormant", "fulfilled", "scattered"]
VoiceState = Literal["ready", "listening", "processing"]


@dataclass
class GodInfo:
    name: str
    uuid: str
    color: str


# God events
def god_spawned(name: str, uuid: str, color: str):
    """Notify that a god was spawned."""
    emit_sync("god:spawned", {"name": name, "uuid": uuid, "color": color})


def god_status(uuid: str, status: GodStatus):
    """Update a god's status."""
    emit_sync("god:status", {"uuid": uuid, "status": status})


def god_banished(uuid: str):
    """Notify that a god was banished."""
    emit_sync("god:banished", {"uuid": uuid})


def god_speaking(uuid: str, text: str):
    """Notify that a god is speaking (TTS)."""
    emit_sync("god:speaking", {"uuid": uuid, "text": text})


# Voice events
def voice_listening():
    """Notify that voice input started."""
    emit_sync("voice:listening", {})


def voice_processing():
    """Notify that voice is being processed."""
    emit_sync("voice:processing", {})


def voice_ready():
    """Notify that voice system is ready."""
    emit_sync("voice:ready", {})


# Focus events
def focus_changed(uuid: str):
    """Notify that the focused god changed."""
    emit_sync("focus:changed", {"uuid": uuid})
