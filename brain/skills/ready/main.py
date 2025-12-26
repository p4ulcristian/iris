"""Ready - update god's visual state in Iris."""

import sys
from brain.skills.ws import update_ready

STATES = ('working', 'done', 'stuck')


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.ready <state>")
        print(f"States: {', '.join(STATES)}")
        print()
        print("Examples:")
        print("  python -m brain.skills.ready working  # Default state - actively working")
        print("  python -m brain.skills.ready done     # Green glow - task complete")
        print("  python -m brain.skills.ready stuck    # Red pulse - needs help")
        sys.exit(1)

    state = sys.argv[1].lower()

    if state not in STATES:
        print(f"Invalid state: {state}")
        print(f"Must be one of: {', '.join(STATES)}")
        sys.exit(1)

    result = update_ready(state)
    sys.exit(0 if result else 1)
