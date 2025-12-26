"""Allow running as: python -m brain.skills.nvim-highlight <file> <line>"""

# Import using importlib since folder has hyphen
import importlib
main_module = importlib.import_module("brain.skills.nvim-highlight.main")

if __name__ == "__main__":
    main_module.main()
