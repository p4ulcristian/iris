"""Push - automated git commit and push with smart message generation.

CRITICAL: This skill ONLY responds to "push" or "push IRO-XXX".
All other requests are refused.

Created: 2025-12-25
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


def run_git(args: list[str]) -> tuple[int, str, str]:
    """Run a git command and return (returncode, stdout, stderr)."""
    result = subprocess.run(
        ["git"] + args,
        capture_output=True,
        text=True
    )
    return result.returncode, result.stdout, result.stderr


def detect_module(file_paths: list[str]) -> str:
    """Detect module name from file paths.

    Args:
        file_paths: List of modified file paths

    Returns:
        Module name (e.g., "Flex", "Auth") or "Core" if unknown
    """
    # Common patterns
    patterns = {
        r"features/flex/": "Flex",
        r"features/auth/": "Auth",
        r"features/": lambda m: m.group(0).split("/")[1].title(),
        r"brain/": "Brain",
        r"brain/skills/": lambda m: m.group(0).split("/")[2].title() + " Skill",
        r"brain/cli/": "CLI",
        r"brain/hear/": "Hear",
        r"brain/speak/": "Speak",
        r"brain/wake/": "Wake",
        r"brain/express/": "Express",
        r"config/": "Config",
        r"shadows/": "Shadows",
        r"prompts/": "Prompts",
    }

    # Count matches per module
    module_counts: dict[str, int] = {}

    for path in file_paths:
        for pattern, module in patterns.items():
            if re.search(pattern, path):
                if callable(module):
                    module_name = module(re.search(pattern, path))
                else:
                    module_name = module
                module_counts[module_name] = module_counts.get(module_name, 0) + 1
                break

    if not module_counts:
        return "Core"

    # Return most common module
    return max(module_counts, key=module_counts.get)


def generate_commit_message(diff_stat: str, diff_content: str, issue_id: str | None = None) -> str:
    """Generate formatted commit message.

    Args:
        diff_stat: Output of git diff --cached --stat
        diff_content: Output of git diff --cached
        issue_id: Optional issue ID (e.g., "IRO-185")

    Returns:
        Formatted commit message
    """
    # Parse file paths from diff stat
    file_paths = []
    for line in diff_stat.split("\n"):
        if "|" in line:
            path = line.split("|")[0].strip()
            if path:
                file_paths.append(path)

    # Detect module
    module = detect_module(file_paths)

    # Parse changes from diff content
    changes = []
    current_file = None

    for line in diff_content.split("\n"):
        # Track current file
        if line.startswith("diff --git"):
            parts = line.split()
            if len(parts) >= 4:
                current_file = parts[3].replace("b/", "")

        # Look for added/modified function definitions, classes, etc.
        if line.startswith("+") and not line.startswith("+++"):
            # Skip simple additions like comments or whitespace
            stripped = line[1:].strip()
            if stripped and not stripped.startswith("#") and not stripped.startswith("//"):
                # Try to identify significant changes
                if any(keyword in stripped for keyword in ["def ", "class ", "function ", "const ", "let ", "var ", "import ", "export "]):
                    continue  # We'll summarize these generically

    # Generate header (max 50 chars)
    if issue_id:
        header = f"[{issue_id} | {module}] "
    else:
        header = f"[{module}] "

    # Generate description from file changes
    if len(file_paths) == 1:
        file_name = Path(file_paths[0]).name
        description = f"Update {file_name}"
    elif all("test" in p.lower() for p in file_paths):
        description = "Update tests"
    elif all(p.endswith(".md") for p in file_paths):
        description = "Update documentation"
    elif all(p.endswith((".yaml", ".json", ".toml")) for p in file_paths):
        description = "Update configuration"
    else:
        # Generic based on module
        description = f"Update {module.lower()} module"

    # Ensure header fits in 50 chars
    full_header = header + description
    if len(full_header) > 50:
        # Truncate description
        max_desc_len = 50 - len(header) - 3  # 3 for "..."
        description = description[:max_desc_len]
        full_header = header + description

    # Generate body - list of changed files
    body_lines = []
    for path in file_paths[:10]:  # Limit to 10 files
        file_name = Path(path).name
        body_lines.append(f"- Update {file_name}")

    if len(file_paths) > 10:
        body_lines.append(f"- ... and {len(file_paths) - 10} more files")

    body = "\n".join(body_lines)

    # Combine header and body
    return f"{full_header}\n\n{body}"


def push_changes(issue_id: str | None = None) -> bool:
    """Execute the push workflow.

    Args:
        issue_id: Optional issue ID (e.g., "IRO-185")

    Returns:
        True if successful, False otherwise
    """
    # Check for staged changes
    returncode, diff_stat, stderr = run_git(["diff", "--cached", "--stat"])
    if returncode != 0:
        print(f"\033[31mFailed to get staged changes: {stderr}\033[0m")
        return False

    if not diff_stat.strip():
        print("\033[33mNo staged changes to commit\033[0m")
        return False

    print("\033[36mStaged changes:\033[0m")
    print(diff_stat)

    # Get full diff
    returncode, diff_content, stderr = run_git(["diff", "--cached"])
    if returncode != 0:
        print(f"\033[31mFailed to get diff: {stderr}\033[0m")
        return False

    # Generate commit message
    commit_msg = generate_commit_message(diff_stat, diff_content, issue_id)

    print("\n\033[36mCommit message:\033[0m")
    print(commit_msg)
    print()

    # Commit
    returncode, stdout, stderr = run_git(["commit", "-m", commit_msg])
    if returncode != 0:
        print(f"\033[31mCommit failed: {stderr}\033[0m")
        return False

    # Get commit hash
    returncode, commit_hash, _ = run_git(["rev-parse", "HEAD"])
    commit_hash = commit_hash.strip()[:7]

    print(f"\033[32mCommitted: {commit_hash}\033[0m")

    # Push
    print("\n\033[36mPushing to remote...\033[0m")
    returncode, stdout, stderr = run_git(["push"])
    if returncode != 0:
        print(f"\033[31mPush failed: {stderr}\033[0m")
        return False

    print(f"\033[32m✓ Pushed successfully\033[0m")
    return True


def main():
    """Main entry point."""
    # Parse arguments
    args = sys.argv[1:]

    # Validate: only accept empty args or single issue ID
    if len(args) == 0:
        # Just "push"
        issue_id = None
    elif len(args) == 1 and re.match(r"^[A-Z]+-\d+$", args[0]):
        # "push IRO-XXX"
        issue_id = args[0]
    else:
        # Invalid usage
        print("\033[33mOnly 'push' is available. Stage your changes and say 'push' to commit.\033[0m")
        print("\nUsage:")
        print("  python -m brain.skills.push          # Commit without issue ID")
        print("  python -m brain.skills.push IRO-123  # Commit with issue ID")
        sys.exit(1)

    # Execute push
    result = push_changes(issue_id)
    sys.exit(0 if result else 1)
