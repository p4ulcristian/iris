"""Theme management for Iris."""

import sys
from . import config, tmux


def darken_color(hex_color: str, factor: float = 0.5) -> str:
    """Darken a hex color by a factor (0-1)."""
    hex_color = hex_color.lstrip('#')
    r = int(int(hex_color[0:2], 16) * factor)
    g = int(int(hex_color[2:4], 16) * factor)
    b = int(int(hex_color[4:6], 16) * factor)
    return f"#{r:02x}{g:02x}{b:02x}"


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
    god_panes = [p for p in panes if p.is_god]

    for i, pane in enumerate(god_panes):
        # Cycle through available colors
        colors = shade_list[i % len(shade_list)]
        tmux.set_pane_style(pane.pane_id, colors["bg"], colors.get("fg", "#ffffff"))

    # Apply border colors (active = bright, inactive = muted)
    border = theme.get("border", config.get_border_colors())
    active_border = theme.get("active_border", border)  # Use active_border if defined
    inactive_color = darken_color(border['bg'], 0.4)  # Muted version for inactive

    tmux.run("set-option", "-t", config.SESSION, "pane-border-style", f"fg={inactive_color},bg={inactive_color}")
    tmux.run("set-option", "-t", config.SESSION, "pane-active-border-style", f"fg={active_border['bg']},bg={active_border['bg']}")
    # Title bar: active pane gets active_border color, inactive gets muted border
    tmux.run("set-option", "-t", config.SESSION, "pane-border-format",
             f"#{{?pane_active,#[bg={active_border['bg']}],#[bg={inactive_color}]}}#[fg={border['fg']},bold] #{{pane_title}} ")

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
