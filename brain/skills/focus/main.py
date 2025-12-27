"""Focus - update god's title (goal) in the Iris v2 Electron app."""

import sys
from brain.skills.ws import update_title


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.focus <title>")
        print("Example: python -m brain.skills.focus 'iris/app: fixing auth bug'")
        print("Example: python -m brain.skills.focus 'elevathor: payment flow'")
        sys.exit(1)

    title = " ".join(sys.argv[1:])
    result = update_title(title)
    sys.exit(0 if result else 1)
