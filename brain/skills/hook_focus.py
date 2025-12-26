"""PostToolUse hook - update god focus based on tool usage."""

import os
import sys
import json

from brain.skills.ws import update_status


def main():
    tool_name = os.environ.get('TOOL_NAME', '')
    tool_input = os.environ.get('TOOL_INPUT', '{}')

    try:
        data = json.loads(tool_input)
    except:
        data = {}

    # Extract meaningful info based on tool type
    if tool_name in ('Read', 'Edit', 'Write'):
        file_path = data.get('file_path', '')
        filename = file_path.split('/')[-1] if file_path else tool_name
        status = filename
    elif tool_name == 'Bash':
        cmd = data.get('command', '')[:50]
        status = cmd if cmd else 'Bash'
    elif tool_name == 'Grep':
        pattern = data.get('pattern', '')[:30]
        status = f"grep: {pattern}" if pattern else 'Grep'
    elif tool_name == 'Glob':
        pattern = data.get('pattern', '')[:30]
        status = f"glob: {pattern}" if pattern else 'Glob'
    else:
        status = tool_name

    if status:
        update_status(status)


if __name__ == '__main__':
    main()
