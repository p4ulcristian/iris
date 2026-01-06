"""PostToolUse hook - update god focus based on tool usage."""

import os
import sys
import json

from brain.skills.ws import update_status, update_ready


def extract_project_area(file_path: str, cwd: str = None) -> tuple:
    """Extract project name and area from file path.

    /home/user/Work/iris/app/server/handlers.js -> ('iris', 'server', 'handlers.js')
    """
    cwd = cwd or os.getcwd()
    project = cwd.rstrip('/').split('/')[-1]

    # Get relative path from cwd
    rel_path = file_path
    if file_path.startswith(cwd):
        rel_path = file_path[len(cwd):].lstrip('/')

    parts = rel_path.split('/')
    if len(parts) >= 3:
        # app/server/handlers.js -> area='server'
        area = parts[1]
        filename = parts[-1]
    elif len(parts) == 2:
        area = parts[0]
        filename = parts[1]
    else:
        area = ''
        filename = parts[0] if parts else ''

    return project, area, filename


def format_status(tool_name: str, tool_input: dict, cwd: str = None) -> str:
    """Generate a verbose status string from tool usage."""
    cwd = cwd or os.getcwd()
    project = cwd.rstrip('/').split('/')[-1]

    if tool_name == 'Read':
        file_path = tool_input.get('file_path', '')
        proj, area, filename = extract_project_area(file_path, cwd)
        if area:
            return f"{proj}/{area}: reading {filename}"
        return f"{proj}: reading {filename}"

    elif tool_name == 'Edit':
        file_path = tool_input.get('file_path', '')
        proj, area, filename = extract_project_area(file_path, cwd)
        if area:
            return f"{proj}/{area}: editing {filename}"
        return f"{proj}: editing {filename}"

    elif tool_name == 'Write':
        file_path = tool_input.get('file_path', '')
        proj, area, filename = extract_project_area(file_path, cwd)
        if area:
            return f"{proj}/{area}: writing {filename}"
        return f"{proj}: writing {filename}"

    elif tool_name == 'Bash':
        # Prefer description if available, otherwise use command preview
        description = tool_input.get('description', '')
        if description:
            return f"{project}: {description}"
        cmd = tool_input.get('command', '')
        # Extract first meaningful part of command
        cmd_preview = cmd.split('&&')[0].split('|')[0].strip()[:40]
        if cmd_preview:
            return f"{project}: $ {cmd_preview}"
        return f"{project}: running command"

    elif tool_name == 'Grep':
        pattern = tool_input.get('pattern', '')[:25]
        path = tool_input.get('path', '')
        if path:
            search_area = path.split('/')[-1] if '/' in path else path
            return f"{project}: searching '{pattern}' in {search_area}"
        return f"{project}: searching '{pattern}'"

    elif tool_name == 'Glob':
        pattern = tool_input.get('pattern', '')[:30]
        return f"{project}: finding {pattern}"

    elif tool_name == 'Task':
        # Subagent spawned
        desc = tool_input.get('description', 'subagent')
        return f"{project}: {desc}"

    elif tool_name == 'WebSearch':
        query = tool_input.get('query', '')[:30]
        return f"searching: {query}"

    elif tool_name == 'WebFetch':
        url = tool_input.get('url', '')
        # Extract domain
        domain = url.split('//')[1].split('/')[0] if '//' in url else url[:30]
        return f"fetching: {domain}"

    elif tool_name in ('LSP', 'NotebookEdit'):
        return f"{project}: {tool_name.lower()}"

    # Skip noisy tools that don't indicate meaningful work
    elif tool_name == 'TodoWrite':
        return ''

    # AskUserQuestion handled specially in main() for ready state
    elif tool_name == 'AskUserQuestion':
        return ''

    else:
        return f"{project}: {tool_name.lower()}"


def main():
    # Read hook data from stdin (Claude Code passes JSON)
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        # No input or invalid JSON - try env vars as fallback
        tool_name = os.environ.get('TOOL_NAME', '')
        tool_input_str = os.environ.get('TOOL_INPUT', '{}')
        try:
            tool_input = json.loads(tool_input_str)
        except:
            tool_input = {}
        cwd = os.getcwd()
    else:
        tool_name = data.get('tool_name', '')
        tool_input = data.get('tool_input', {})
        cwd = data.get('cwd', os.getcwd())

    if not tool_name:
        return

    # AskUserQuestion triggers question state
    if tool_name == 'AskUserQuestion':
        if not update_ready('question'):
            print("[hook_focus] Failed to set ready state to 'question'", file=sys.stderr)
        return

    status = format_status(tool_name, tool_input, cwd)

    if status:
        update_status(status)
        # Reset ready state to working when actively using tools
        # (implies user responded if we were in question state)
        if not update_ready('working'):
            # Silent fail for 'working' - happens on every tool call, too noisy
            pass


if __name__ == '__main__':
    main()
