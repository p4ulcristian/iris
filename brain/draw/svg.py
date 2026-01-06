"""
SVG processing utilities for the Draw service.
"""

import re


def make_monochrome(svg: str, color: str = "#ffffff") -> str:
    """Convert all colors in SVG to a single color (white by default).

    Args:
        svg: The SVG string to process
        color: The target color (hex format)

    Returns:
        SVG string with all colors replaced
    """
    # Replace fill colors (but keep 'none')
    svg = re.sub(r'fill\s*[:=]\s*["\']?(?!none)[#\w]+["\']?', f'fill="{color}"', svg)
    # Replace stroke colors
    svg = re.sub(r'stroke\s*[:=]\s*["\']?(?!none)[#\w]+["\']?', f'stroke="{color}"', svg)
    # Replace style fill/stroke
    svg = re.sub(r'fill\s*:\s*(?!none)[#\w]+', f'fill:{color}', svg)
    svg = re.sub(r'stroke\s*:\s*(?!none)[#\w]+', f'stroke:{color}', svg)
    return svg


def clean_svg(raw_svg: str) -> str:
    """Clean and validate SVG output.

    Args:
        raw_svg: Raw SVG string from model

    Returns:
        Cleaned SVG string
    """
    if not raw_svg:
        return ""

    # Find the SVG element
    svg_match = re.search(r'<svg[^>]*>.*</svg>', raw_svg, re.DOTALL)
    if svg_match:
        return svg_match.group(0)

    return raw_svg


def add_viewbox(svg: str, size: int = 100) -> str:
    """Add viewBox attribute if missing.

    Args:
        svg: SVG string
        size: ViewBox size (creates 0 0 size size)

    Returns:
        SVG with viewBox
    """
    if 'viewBox' not in svg and '<svg' in svg:
        svg = svg.replace('<svg', f'<svg viewBox="0 0 {size} {size}"', 1)
    return svg
