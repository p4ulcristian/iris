#!/usr/bin/env python3
"""Simple OpenGL test with GTK4 layer-shell."""

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Gtk4LayerShell', '1.0')

from gi.repository import Gtk, Gdk, GLib, Gtk4LayerShell as LayerShell
from OpenGL.GL import *
import math

WINDOW_SIZE = 200

class GLTest(Gtk.Application):
    def __init__(self):
        super().__init__(application_id='com.iris.gl-test')
        self.time = 0.0

    def do_activate(self):
        window = Gtk.ApplicationWindow(application=self)
        window.set_default_size(WINDOW_SIZE, WINDOW_SIZE)

        LayerShell.init_for_window(window)
        LayerShell.set_layer(window, LayerShell.Layer.OVERLAY)
        LayerShell.set_anchor(window, LayerShell.Edge.TOP, True)
        LayerShell.set_anchor(window, LayerShell.Edge.RIGHT, True)
        LayerShell.set_margin(window, LayerShell.Edge.TOP, 20)
        LayerShell.set_margin(window, LayerShell.Edge.RIGHT, 20)
        LayerShell.set_exclusive_zone(window, 0)

        window.add_css_class('transparent-window')
        css = b".transparent-window { background: transparent; }"
        provider = Gtk.CssProvider()
        provider.load_from_data(css)
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

        self.gl_area = Gtk.GLArea()
        self.gl_area.set_size_request(WINDOW_SIZE, WINDOW_SIZE)
        self.gl_area.set_has_depth_buffer(True)
        self.gl_area.connect('render', self.on_render)
        window.set_child(self.gl_area)

        GLib.timeout_add(16, self.animate)
        window.present()
        print("GL Test window opened", flush=True)

    def on_render(self, gl_area, context):
        glViewport(0, 0, gl_area.get_width(), gl_area.get_height())

        # Rotating color
        r = (math.sin(self.time) + 1) / 2
        g = (math.sin(self.time + 2) + 1) / 2
        b = (math.sin(self.time + 4) + 1) / 2

        # Clear with color so we can see something
        glClearColor(r, g, b, 1.0)
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)

        # Draw a simple white triangle using old-school GL
        glMatrixMode(GL_PROJECTION)
        glLoadIdentity()
        glMatrixMode(GL_MODELVIEW)
        glLoadIdentity()

        glBegin(GL_TRIANGLES)
        glColor3f(1.0, 1.0, 1.0)
        glVertex2f(0.0, 0.5)
        glVertex2f(-0.5, -0.5)
        glVertex2f(0.5, -0.5)
        glEnd()

        return True

    def animate(self):
        self.time += 0.05
        self.gl_area.queue_render()
        return True

def main():
    print("Starting GL Test...", flush=True)
    app = GLTest()
    app.run()

if __name__ == '__main__':
    main()
