"""Nvim - neovim editor pane.

Usage:
    python -m brain.skills.nvim <file> [file2] [file3] ...
    python -m brain.skills.nvim IRIS.md
    python -m brain.skills.nvim src/main.py src/utils.py src/config.py
"""

from brain.skills.nvim.main import open_nvim

__all__ = ["open_nvim"]
