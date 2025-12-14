"""
Iris Brain - Modular AI assistant architecture

Components:
  cli/      - Python CLI for orchestration (spawn, kill, list, send, peek)
  wake/     - Attention coordinator (CapsLock listener, orchestrates other servers)
  hear/     - Speech-to-text server (Parakeet)
  speak/    - Text-to-speech server (VibeVoice)
  express/  - Visual UI server (GTK4 bubble overlay)
  remember/ - Memory and context storage
  say.py    - Speech utility module
"""

__version__ = "2.0.0"
