"""Theme management for Iris."""

import sys
from . import config, tmux


def list_themes():
    """List available themes."""
    themes = config.get_theme_names()
    current = config.get_current_theme()

    print("Available themes:")
    for theme in themes:
        marker = " *" if theme == current else ""
        print(f"  {theme}{marker}")


def apply_theme(theme_name: str = None):
    """Apply a theme to all panes.

    If theme_name is provided, switches to that theme first.
    Then reapplies colors to all existing panes.
    """
    if theme_name:
        if not config.set_current_theme(theme_name):
            print(f"Unknown theme: {theme_name}")
            print(f"Available: {', '.join(config.get_theme_names())}")
            return False

    current = config.get_current_theme()
    theme = config.get_theme()

    if not theme:
        print(f"Theme '{current}' not found")
        return False

    shade_list = theme.get("shades", [])
    if not shade_list:
        print(f"Theme '{current}' has no shades defined")
        return False

    # Apply to all panes - cycle through theme colors
    panes = tmux.list_panes()
    shade_panes = [p for p in panes if p.is_shade]

    for i, pane in enumerate(shade_panes):
        # Cycle through available colors
        colors = shade_list[i % len(shade_list)]
        tmux.set_pane_style(pane.pane_id, colors["bg"], colors.get("fg", "#ffffff"))

    # Apply border colors
    border = theme.get("border", config.get_border_colors())
    tmux.run("set-option", "-t", config.SESSION, "pane-border-style", f"fg={border['bg']},bg={border['bg']}")
    tmux.run("set-option", "-t", config.SESSION, "pane-active-border-style", f"fg={border['bg']},bg={border['bg']}")
    tmux.run("set-option", "-t", config.SESSION, "pane-border-format", f"#[bg={border['bg']},fg={border['fg']},bold] #{{pane_title}} ")

    print(f"Applied theme: {current}")
    return True


def next_theme():
    """Cycle to the next theme."""
    themes = config.get_theme_names()
    current = config.get_current_theme()

    try:
        idx = themes.index(current)
        next_idx = (idx + 1) % len(themes)
        next_name = themes[next_idx]
    except ValueError:
        next_name = themes[0] if themes else None

    if next_name:
        apply_theme(next_name)


def main():
    """CLI entry point."""
    args = sys.argv[1:]

    if not args or args[0] == "list":
        list_themes()
    elif args[0] == "apply":
        theme_name = args[1] if len(args) > 1 else None
        apply_theme(theme_name)
    elif args[0] == "next":
        next_theme()
    elif args[0] == "current":
        print(config.get_current_theme())
    else:
        # Treat as theme name
        apply_theme(args[0])


if __name__ == "__main__":
    main()
