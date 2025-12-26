"""Focus - update god's status in the Iris v2 Electron app."""

import sys
from brain.skills.ws import update_status


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.focus <status>")
        print("Example: python -m brain.skills.focus 'reading tests'")
        print("Example: python -m brain.skills.focus 'fixing auth bug'")
        sys.exit(1)

    status = " ".join(sys.argv[1:])
    result = update_status(status)
    sys.exit(0 if result else 1)
