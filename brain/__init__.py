"""
Iris Brain - Modular AI assistant architecture

Components:
  wake/     - Attention coordinator (CapsLock listener, orchestrates other servers)
  hear/     - Speech-to-text server (Parakeet)
  speak/    - Text-to-speech server (Maya TTS)
  express/  - Visual UI server (GTK4 bubble overlay)
  remember/ - Memory and context storage
  do/       - Action scripts (non-tmux commands)
  oversee/  - Tmux orchestration scripts
"""

__version__ = "2.0.0"
