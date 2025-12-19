#!/usr/bin/env python3
"""
Linear import skill for migrating vision/todo tasks.

Usage:
    python -m brain.skills.linear import <project_dir>
    python -m brain.skills.linear preview <project_dir>

This generates a Linear import manifest that can be used with
the Linear MCP tools to create issues.
"""

import sys
import json
import subprocess
from pathlib import Path


def preview_import(project_dir: Path):
    """Preview what would be imported."""
    todo_dir = project_dir / "vision" / "todo"
    sync_script = todo_dir / "sync-to-linear.py"

    if not sync_script.exists():
        print(f"Error: sync-to-linear.py not found in {todo_dir}")
        sys.exit(1)

    result = subprocess.run(
        ["python", str(sync_script), "--dry"],
        capture_output=True,
        text=True
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)


def generate_import_manifest(project_dir: Path):
    """Generate JSON manifest for Linear import."""
    todo_dir = project_dir / "vision" / "todo"
    sync_script = todo_dir / "sync-to-linear.py"

    if not sync_script.exists():
        print(f"Error: sync-to-linear.py not found in {todo_dir}")
        sys.exit(1)

    result = subprocess.run(
        ["python", str(sync_script)],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"Error running sync script: {result.stderr}")
        sys.exit(1)

    data = json.loads(result.stdout)
    tasks = data["tasks"]

    # Group by priority for batch import
    by_priority = {1: [], 2: [], 3: [], 4: []}
    for task in tasks:
        by_priority[task["priority"]].append(task)

    print("=" * 60)
    print("LINEAR IMPORT MANIFEST")
    print("=" * 60)
    print(f"\nTotal tasks to import: {len(tasks)}")
    print(f"  Urgent (P0): {len(by_priority[1])}")
    print(f"  High (P1):   {len(by_priority[2])}")
    print(f"  Medium:      {len(by_priority[3])}")
    print(f"  Low (P2):    {len(by_priority[4])}")

    print("\n" + "-" * 60)
    print("INSTRUCTIONS FOR CLAUDE WITH LINEAR MCP:")
    print("-" * 60)
    print("""
1. First, use `linear_list_teams` to find the team ID
2. Use `linear_list_projects` to find or create an "Iron Rainbow" project
3. For each priority level, batch create issues:

   For URGENT tasks (P0 - create as high priority):
""")
    for i, task in enumerate(by_priority[1][:5]):
        print(f"   - {task['title'][:60]}")
    if len(by_priority[1]) > 5:
        print(f"   ... and {len(by_priority[1]) - 5} more")

    print("\n   For HIGH tasks (P1):")
    for i, task in enumerate(by_priority[2][:5]):
        print(f"   - {task['title'][:60]}")
    if len(by_priority[2]) > 5:
        print(f"   ... and {len(by_priority[2]) - 5} more")

    # Output manifest file
    manifest_path = project_dir / "vision" / "linear-import-manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"\n\nFull manifest written to: {manifest_path}")
    print("\nTo import, open Claude Code with Linear MCP and run:")
    print(f"  'Import tasks from {manifest_path} to Linear'")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]
    project_dir = Path(sys.argv[2]).resolve()

    if not project_dir.exists():
        print(f"Error: Project directory not found: {project_dir}")
        sys.exit(1)

    if command == "preview":
        preview_import(project_dir)
    elif command == "import":
        generate_import_manifest(project_dir)
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
