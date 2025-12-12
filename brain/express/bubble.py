#!/usr/bin/env python3
"""Iris Express Bubble - Simplified visual UI overlay using GTK4 + layer-shell."""

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Gtk4LayerShell', '1.0')

from gi.repository import Gtk, Gdk, GLib, Gtk4LayerShell as LayerShell
import math

# Bubble settings
BUBBLE_SIZE = 100
MARGIN_TOP = 20
MARGIN_RIGHT = 20

# Colors (RGB 0-1)
NEON_CYAN = (0.0, 1.0, 1.0)
NEON_PINK = (1.0, 0.2, 0.6)
GOLD = (1.0, 0.85, 0.0)
GRAY_MID = (0.35, 0.35, 0.4)


class BubbleApp(Gtk.Application):
    def __init__(self):
        super().__init__(application_id='com.iris.bubble')
        self.window = None
        self.drawing_area = None
        self.pulse_phase = 0.0
        self.state = "ready"  # ready, listening, speaking, loading
        self.animation_id = None

    def do_activate(self):
        self.window = Gtk.ApplicationWindow(application=self)
        self.window.set_default_size(BUBBLE_SIZE, BUBBLE_SIZE)

        # Set up layer shell
        LayerShell.init_for_window(self.window)
        LayerShell.set_layer(self.window, LayerShell.Layer.OVERLAY)
        LayerShell.set_anchor(self.window, LayerShell.Edge.TOP, True)
        LayerShell.set_anchor(self.window, LayerShell.Edge.RIGHT, True)
        LayerShell.set_margin(self.window, LayerShell.Edge.TOP, MARGIN_TOP)
        LayerShell.set_margin(self.window, LayerShell.Edge.RIGHT, MARGIN_RIGHT)
        LayerShell.set_exclusive_zone(self.window, 0)

        self.window.add_css_class('transparent-window')

        self.drawing_area = Gtk.DrawingArea()
        self.drawing_area.set_size_request(BUBBLE_SIZE, BUBBLE_SIZE)
        self.drawing_area.set_draw_func(self.draw_bubble)
        self.window.set_child(self.drawing_area)

        self.load_css()
        self.animation_id = GLib.timeout_add(16, self.animate)

        self.window.present()

    def load_css(self):
        css = b".transparent-window { background: transparent; }"
        provider = Gtk.CssProvider()
        provider.load_from_data(css)
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

    def set_state(self, state):
        """Update the bubble state (called from server)"""
        self.state = state
        if self.drawing_area:
            self.drawing_area.queue_draw()

    def animate(self):
        self.pulse_phase += 0.05
        if self.pulse_phase > 2 * math.pi:
            self.pulse_phase -= 2 * math.pi

        if self.drawing_area:
            self.drawing_area.queue_draw()

        return True  # Keep animating

    def draw_bubble(self, area, cr, width, height):
        """Draw the bubble based on current state"""
        cr.set_operator(1)  # CAIRO_OPERATOR_SOURCE
        cr.set_source_rgba(0, 0, 0, 0)
        cr.paint()

        cx = width / 2
        cy = height / 2
        radius = min(width, height) / 2.5

        # State-based colors and effects
        if self.state == "listening":
            # Pulsing cyan for listening
            pulse = 0.5 + 0.5 * math.sin(self.pulse_phase * 2)
            r, g, b = NEON_CYAN
            cr.set_source_rgba(r, g, b, 0.8 + 0.2 * pulse)
            cr.arc(cx, cy, radius * (0.9 + 0.1 * pulse), 0, 2 * math.pi)
            cr.fill()

        elif self.state == "speaking":
            # Pulsing pink for speaking
            pulse = 0.5 + 0.5 * math.sin(self.pulse_phase * 3)
            r, g, b = NEON_PINK
            cr.set_source_rgba(r, g, b, 0.8 + 0.2 * pulse)
            cr.arc(cx, cy, radius * (0.9 + 0.1 * pulse), 0, 2 * math.pi)
            cr.fill()

        elif self.state == "loading":
            # Spinning gold for loading
            r, g, b = GOLD
            cr.set_source_rgba(r, g, b, 0.7)
            cr.arc(cx, cy, radius, 0, 2 * math.pi)
            cr.fill()

            # Spinning arc
            cr.set_source_rgba(r, g, b, 1.0)
            cr.set_line_width(3)
            cr.arc(cx, cy, radius + 5, self.pulse_phase, self.pulse_phase + math.pi / 2)
            cr.stroke()

        else:  # ready
            # Gray circle when ready
            r, g, b = GRAY_MID
            cr.set_source_rgba(r, g, b, 0.5)
            cr.arc(cx, cy, radius, 0, 2 * math.pi)
            cr.fill()

    def run(self):
        """Run the GTK application"""
        super().run(None)


if __name__ == '__main__':
    app = BubbleApp()
    app.run()
