#!/usr/bin/env python3
"""Echo floating bubble overlay using GTK4 + layer-shell."""

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Gtk4LayerShell', '1.0')

from gi.repository import Gtk, Gdk, GLib, Gtk4LayerShell as LayerShell
from pathlib import Path
import math
import os
import signal
import threading
from evdev import InputDevice, ecodes, list_devices

# Bubble settings
BUBBLE_SIZE = 120  # Bigger for label space
MARGIN_TOP = 20
MARGIN_RIGHT = 20

# State file for communication with server
STATE_FILE = Path("/tmp/echo-state")

# Worker sessions directory (shades managed by Iris orchestrator)
WORKERS_DIR = Path.home() / "Iris" / "shadows"

# Worker colors (hex to RGB)
WORKER_COLORS = {
    "red": (1.0, 0.42, 0.42),
    "teal": (0.31, 0.80, 0.77),
    "yellow": (1.0, 0.90, 0.43),
    "mint": (0.58, 0.88, 0.83),
    "plum": (0.87, 0.63, 0.87),
    "sky": (0.53, 0.81, 0.92),
    "orange": (0.95, 0.61, 0.07),
    "lavender": (0.64, 0.61, 1.0),
    "coral": (1.0, 0.50, 0.31),
    "lime": (0.20, 0.80, 0.20),
    "pink": (1.0, 0.41, 0.71),
    "gold": (1.0, 0.84, 0.0),
    "cyan": (0.0, 0.81, 0.82),
    "peach": (1.0, 0.85, 0.73),
    "violet": (0.93, 0.51, 0.93),
    "seafoam": (0.13, 0.70, 0.67),
}

# Colors (RGB 0-1)
NEON_CYAN = (0.0, 1.0, 1.0)
NEON_MAGENTA = (1.0, 0.0, 0.8)
NEON_PINK = (1.0, 0.2, 0.6)
ELECTRIC_BLUE = (0.1, 0.5, 1.0)
DARK_PURPLE = (0.15, 0.05, 0.2)
GOLD = (1.0, 0.85, 0.0)
GOLD_DARK = (0.8, 0.6, 0.0)
WARM_ORANGE = (1.0, 0.6, 0.2)
GRAY_LIGHT = (0.5, 0.5, 0.55)
GRAY_MID = (0.35, 0.35, 0.4)
GRAY_DARK = (0.25, 0.25, 0.3)
WARNING_RED = (1.0, 0.1, 0.1)
WARNING_DARK = (0.9, 0.0, 0.0)
WARNING_ACCENT = (1.0, 0.2, 0.1)

# X button settings
X_SIZE = 12
X_MARGIN = 8
X_HIT_RADIUS = 15

# Volume button settings
VOL_SIZE = 14
VOL_MARGIN_TOP = 35  # Below X button
VOL_HIT_RADIUS = 15

# Mute button settings
MUTE_SIZE = 14
MUTE_MARGIN_TOP = 58  # Below volume button
MUTE_HIT_RADIUS = 15

# Position button settings
POS_SIZE = 14
POS_MARGIN_TOP = 81  # Below mute button
POS_HIT_RADIUS = 15

# Speaker/device button settings
SPK_SIZE = 14
SPK_MARGIN_TOP = 104  # Below position button
SPK_HIT_RADIUS = 15


def find_keyboard():
    """Find a keyboard device."""
    for path in list_devices():
        try:
            device = InputDevice(path)
            caps = device.capabilities()
            if ecodes.EV_KEY in caps:
                keys = caps[ecodes.EV_KEY]
                if ecodes.KEY_CAPSLOCK in keys:
                    return device
        except Exception:
            pass
    return None


class EchoBubble(Gtk.Application):
    def __init__(self):
        super().__init__(application_id='com.echo.bubble')
        self.window = None
        self.drawing_area = None
        self.pulse_phase = 0.0
        self.loading_dots = 0      # For "Loading..." animation
        self.dot_counter = 0       # Frame counter for dot animation
        self.is_listening = False  # User speaking (CapsLock)
        self.is_speaking = False   # Echo speaking (TTS)
        self.is_loading = True     # Model loading
        self.loading_what = ""     # What's being loaded (tts, stt)
        self.animation_id = None
        self.evdev_thread = None
        self.state_thread = None
        # Mouse tracking for X button
        self.mouse_x = -1
        self.mouse_y = -1
        self.x_hovered = False
        # Volume button
        self.vol_hovered = False
        self.volume = 100  # Current volume (0-100, steps of 10)
        # Mute button
        self.mute_hovered = False
        self.muted = False  # Mute state (separate from volume)
        # Position button
        self.pos_hovered = False
        self.position_index = 0  # Current position
        self.position_overlay = None  # Overlay window for position selection
        # Speaker/device button
        self.spk_hovered = False
        self.audio_device = "auto"  # Current audio device
        self.audio_devices = []  # List of (id, name) tuples
        self.device_overlay = None  # Overlay window for device selection
        # Worker tracking
        self.workers = []  # List of {"id": "red", "status": "idle|working|done|error"}

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

        # Mouse tracking
        motion_controller = Gtk.EventControllerMotion()
        motion_controller.connect('motion', self.on_mouse_motion)
        motion_controller.connect('leave', self.on_mouse_leave)
        self.drawing_area.add_controller(motion_controller)

        click_controller = Gtk.GestureClick()
        click_controller.connect('pressed', self.on_click)
        self.drawing_area.add_controller(click_controller)

        self.load_css()
        self.start_evdev_listener()
        self.start_state_listener()
        self.start_worker_listener()
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

    def get_x_center(self):
        return (BUBBLE_SIZE - X_MARGIN - X_SIZE // 2, X_MARGIN + X_SIZE // 2)

    def get_vol_center(self):
        return (BUBBLE_SIZE - X_MARGIN - VOL_SIZE // 2, VOL_MARGIN_TOP + VOL_SIZE // 2)

    def get_mute_center(self):
        return (BUBBLE_SIZE - X_MARGIN - MUTE_SIZE // 2, MUTE_MARGIN_TOP + MUTE_SIZE // 2)

    def get_pos_center(self):
        return (BUBBLE_SIZE - X_MARGIN - POS_SIZE // 2, POS_MARGIN_TOP + POS_SIZE // 2)

    def get_spk_center(self):
        return (BUBBLE_SIZE - X_MARGIN - SPK_SIZE // 2, SPK_MARGIN_TOP + SPK_SIZE // 2)

    def on_mouse_motion(self, controller, x, y):
        self.mouse_x = x
        self.mouse_y = y
        # X button hover
        x_cx, x_cy = self.get_x_center()
        dist = math.sqrt((x - x_cx) ** 2 + (y - x_cy) ** 2)
        self.x_hovered = dist <= X_HIT_RADIUS
        # Volume button hover
        v_cx, v_cy = self.get_vol_center()
        dist_vol = math.sqrt((x - v_cx) ** 2 + (y - v_cy) ** 2)
        self.vol_hovered = dist_vol <= VOL_HIT_RADIUS
        # Mute button hover
        m_cx, m_cy = self.get_mute_center()
        dist_mute = math.sqrt((x - m_cx) ** 2 + (y - m_cy) ** 2)
        self.mute_hovered = dist_mute <= MUTE_HIT_RADIUS
        # Position button hover
        p_cx, p_cy = self.get_pos_center()
        dist_pos = math.sqrt((x - p_cx) ** 2 + (y - p_cy) ** 2)
        self.pos_hovered = dist_pos <= POS_HIT_RADIUS
        # Speaker button hover
        s_cx, s_cy = self.get_spk_center()
        dist_spk = math.sqrt((x - s_cx) ** 2 + (y - s_cy) ** 2)
        self.spk_hovered = dist_spk <= SPK_HIT_RADIUS

    def on_mouse_leave(self, controller):
        self.mouse_x = -1
        self.mouse_y = -1
        self.x_hovered = False
        self.vol_hovered = False
        self.mute_hovered = False
        self.pos_hovered = False
        self.spk_hovered = False

    def on_click(self, gesture, n_press, x, y):
        # X button
        x_cx, x_cy = self.get_x_center()
        dist = math.sqrt((x - x_cx) ** 2 + (y - x_cy) ** 2)
        if dist <= X_HIT_RADIUS:
            print("X clicked - shutting down Echo", flush=True)
            os.kill(os.getppid(), signal.SIGTERM)
            return
        # Volume button
        v_cx, v_cy = self.get_vol_center()
        dist_vol = math.sqrt((x - v_cx) ** 2 + (y - v_cy) ** 2)
        if dist_vol <= VOL_HIT_RADIUS:
            self.cycle_volume()
            return
        # Mute button
        m_cx, m_cy = self.get_mute_center()
        dist_mute = math.sqrt((x - m_cx) ** 2 + (y - m_cy) ** 2)
        if dist_mute <= MUTE_HIT_RADIUS:
            self.toggle_mute()
            return
        # Position button
        p_cx, p_cy = self.get_pos_center()
        dist_pos = math.sqrt((x - p_cx) ** 2 + (y - p_cy) ** 2)
        if dist_pos <= POS_HIT_RADIUS:
            self.show_position_overlay()
            return
        # Speaker/device button
        s_cx, s_cy = self.get_spk_center()
        dist_spk = math.sqrt((x - s_cx) ** 2 + (y - s_cy) ** 2)
        if dist_spk <= SPK_HIT_RADIUS:
            self.show_device_overlay()

    def cycle_volume(self):
        """Cycle through volume 0-100 in steps of 10."""
        self.volume = (self.volume + 10) % 110  # 0, 10, 20, ... 100, 0, ...
        print(f"Volume: {self.volume}%", flush=True)
        # Update server volume (send actual volume, or 0 if muted)
        self._send_volume_to_server()

    def toggle_mute(self):
        """Toggle mute state."""
        self.muted = not self.muted
        print(f"Muted: {self.muted}", flush=True)
        # Update server volume
        self._send_volume_to_server()

    def _send_volume_to_server(self):
        """Send current volume to server (0 if muted)."""
        import requests
        effective_volume = 0 if self.muted else self.volume
        try:
            requests.post("http://127.0.0.1:8765/volume", json={"volume": effective_volume}, timeout=1)
        except Exception:
            pass

    def set_position(self, pos_index):
        """Set bubble to specific position index."""
        display = self.window.get_display()
        monitors = display.get_monitors()
        n_monitors = monitors.get_n_items()

        monitor_idx = pos_index // 4
        corner = pos_index % 4

        if monitor_idx >= n_monitors:
            monitor_idx = 0

        # Set monitor
        monitor = monitors.get_item(monitor_idx)
        LayerShell.set_monitor(self.window, monitor)

        # Set corner anchors
        # 0: top-right, 1: bottom-right, 2: bottom-left, 3: top-left
        top = corner in [0, 3]
        bottom = corner in [1, 2]
        left = corner in [2, 3]
        right = corner in [0, 1]

        LayerShell.set_anchor(self.window, LayerShell.Edge.TOP, top)
        LayerShell.set_anchor(self.window, LayerShell.Edge.BOTTOM, bottom)
        LayerShell.set_anchor(self.window, LayerShell.Edge.LEFT, left)
        LayerShell.set_anchor(self.window, LayerShell.Edge.RIGHT, right)

        # Set margins for the active edges
        margin = MARGIN_TOP
        LayerShell.set_margin(self.window, LayerShell.Edge.TOP, margin if top else 0)
        LayerShell.set_margin(self.window, LayerShell.Edge.BOTTOM, margin if bottom else 0)
        LayerShell.set_margin(self.window, LayerShell.Edge.LEFT, margin if left else 0)
        LayerShell.set_margin(self.window, LayerShell.Edge.RIGHT, margin if right else 0)

        self.position_index = pos_index
        corner_names = ["top-right", "bottom-right", "bottom-left", "top-left"]
        print(f"Position: monitor {monitor_idx + 1}, {corner_names[corner]}", flush=True)

    def show_position_overlay(self):
        """Show fullscreen overlay for position selection."""
        if self.position_overlay:
            self.position_overlay.destroy()

        self.position_overlay = Gtk.Window()
        self.position_overlay.set_default_size(800, 400)

        # Make it a layer-shell overlay
        LayerShell.init_for_window(self.position_overlay)
        LayerShell.set_layer(self.position_overlay, LayerShell.Layer.OVERLAY)
        LayerShell.set_anchor(self.position_overlay, LayerShell.Edge.TOP, True)
        LayerShell.set_anchor(self.position_overlay, LayerShell.Edge.BOTTOM, True)
        LayerShell.set_anchor(self.position_overlay, LayerShell.Edge.LEFT, True)
        LayerShell.set_anchor(self.position_overlay, LayerShell.Edge.RIGHT, True)
        LayerShell.set_keyboard_mode(self.position_overlay, LayerShell.KeyboardMode.EXCLUSIVE)

        # Drawing area for the overlay
        drawing = Gtk.DrawingArea()
        drawing.set_draw_func(self.draw_position_overlay)
        self.position_overlay.set_child(drawing)

        # Click handler
        click = Gtk.GestureClick()
        click.connect('pressed', self.on_overlay_click)
        drawing.add_controller(click)

        # Escape to close
        key = Gtk.EventControllerKey()
        key.connect('key-pressed', self.on_overlay_key)
        self.position_overlay.add_controller(key)

        self.position_overlay.present()

    def draw_position_overlay(self, area, cr, width, height):
        """Draw the position selection overlay."""
        import cairo

        # Semi-transparent dark background
        cr.set_source_rgba(0, 0, 0, 0.85)
        cr.paint()

        # Get monitors
        display = self.window.get_display()
        monitors = display.get_monitors()
        n_monitors = monitors.get_n_items()

        # Calculate layout for monitor rectangles
        padding = 40
        gap = 30
        available_w = width - padding * 2 - gap * (n_monitors - 1)
        mon_w = min(400, available_w // n_monitors)
        mon_h = int(mon_w * 0.6)  # 16:10 aspect ratio
        total_w = mon_w * n_monitors + gap * (n_monitors - 1)
        start_x = (width - total_w) // 2
        start_y = (height - mon_h) // 2

        cr.select_font_face("Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)

        for i in range(n_monitors):
            mx = start_x + i * (mon_w + gap)
            my = start_y

            # Monitor outline
            cr.set_source_rgba(0.3, 0.3, 0.35, 1)
            cr.rectangle(mx, my, mon_w, mon_h)
            cr.fill()

            cr.set_source_rgba(0.5, 0.5, 0.55, 1)
            cr.set_line_width(2)
            cr.rectangle(mx, my, mon_w, mon_h)
            cr.stroke()

            # Monitor label
            cr.set_font_size(14)
            label = f"Monitor {i + 1}"
            ext = cr.text_extents(label)
            cr.set_source_rgba(0.7, 0.7, 0.7, 1)
            cr.move_to(mx + (mon_w - ext.width) / 2, my + mon_h + 25)
            cr.show_text(label)

            # Corner circles
            corner_r = 20
            corners = [
                (mx + corner_r + 10, my + corner_r + 10, "TL"),  # top-left
                (mx + mon_w - corner_r - 10, my + corner_r + 10, "TR"),  # top-right
                (mx + corner_r + 10, my + mon_h - corner_r - 10, "BL"),  # bottom-left
                (mx + mon_w - corner_r - 10, my + mon_h - corner_r - 10, "BR"),  # bottom-right
            ]

            for cx, cy, label in corners:
                # Highlight current position
                corner_idx = {"TR": 0, "BR": 1, "BL": 2, "TL": 3}[label]
                is_current = (i * 4 + corner_idx) == self.position_index

                if is_current:
                    cr.set_source_rgba(*NEON_CYAN, 0.8)
                else:
                    cr.set_source_rgba(0.4, 0.4, 0.45, 1)
                cr.arc(cx, cy, corner_r, 0, 2 * math.pi)
                cr.fill()

                # Corner label
                cr.set_font_size(11)
                ext = cr.text_extents(label)
                cr.set_source_rgba(1, 1, 1, 0.9)
                cr.move_to(cx - ext.width / 2, cy + ext.height / 2 - 1)
                cr.show_text(label)

        # Instructions
        cr.set_font_size(16)
        text = "Click a corner to move Echo • Press Escape to cancel"
        ext = cr.text_extents(text)
        cr.set_source_rgba(0.6, 0.6, 0.6, 1)
        cr.move_to((width - ext.width) / 2, height - 30)
        cr.show_text(text)

    def on_overlay_click(self, gesture, n_press, x, y):
        """Handle click on position overlay."""
        display = self.window.get_display()
        monitors = display.get_monitors()
        n_monitors = monitors.get_n_items()

        # Get overlay size
        width = self.position_overlay.get_width()
        height = self.position_overlay.get_height()

        # Same layout calculation as drawing
        padding = 40
        gap = 30
        available_w = width - padding * 2 - gap * (n_monitors - 1)
        mon_w = min(400, available_w // n_monitors)
        mon_h = int(mon_w * 0.6)
        total_w = mon_w * n_monitors + gap * (n_monitors - 1)
        start_x = (width - total_w) // 2
        start_y = (height - mon_h) // 2

        corner_r = 20

        for i in range(n_monitors):
            mx = start_x + i * (mon_w + gap)
            my = start_y

            corners = [
                (mx + corner_r + 10, my + corner_r + 10, 3),  # TL
                (mx + mon_w - corner_r - 10, my + corner_r + 10, 0),  # TR
                (mx + corner_r + 10, my + mon_h - corner_r - 10, 2),  # BL
                (mx + mon_w - corner_r - 10, my + mon_h - corner_r - 10, 1),  # BR
            ]

            for cx, cy, corner_idx in corners:
                dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
                if dist <= corner_r + 5:
                    pos_index = i * 4 + corner_idx
                    self.set_position(pos_index)
                    self.position_overlay.destroy()
                    self.position_overlay = None
                    return

    def on_overlay_key(self, controller, keyval, keycode, state):
        """Handle key press on overlay."""
        if keyval == Gdk.KEY_Escape:
            self.position_overlay.destroy()
            self.position_overlay = None
            return True
        return False

    def get_audio_devices(self):
        """Get list of available audio devices (pro-audio mode)."""
        import subprocess
        import re
        try:
            # Pro-audio output mapping (discovered via testing)
            PRO_OUTPUT_NAMES = {
                'alsa_output.pci-0000_0a_00.1.pro-output-3': 'LG 5K (Ultrawide)',
                'alsa_output.pci-0000_0a_00.1.pro-output-7': 'LG TV',
            }

            devices = [('auto', 'Autoselect device')]

            # Get all active sinks
            sinks_result = subprocess.run(
                ['pactl', 'list', 'sinks'],
                capture_output=True, text=True, timeout=5
            )

            for sink_block in re.split(r'\nSink #\d+\n', sinks_result.stdout):
                name_match = re.search(r'Name: (\S+)', sink_block)
                desc_match = re.search(r'Description: (.+)', sink_block)

                if name_match and desc_match:
                    sink_name = name_match.group(1)
                    sink_desc = desc_match.group(1).strip()

                    # Skip echo-cancel and echo virtual sink
                    if 'echo' in sink_name.lower():
                        continue

                    # Use custom name if available, otherwise use description
                    display_name = PRO_OUTPUT_NAMES.get(sink_name, sink_desc)
                    devices.append((sink_name, display_name))

            return devices if len(devices) > 1 else [('auto', 'Autoselect device')]
        except Exception as e:
            print(f"Error getting audio devices: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return [('auto', 'Autoselect device')]

    def show_device_overlay(self):
        """Show overlay for audio device selection."""
        if self.device_overlay:
            self.device_overlay.destroy()

        # Get available devices
        self.audio_devices = self.get_audio_devices()

        self.device_overlay = Gtk.Window()
        self.device_overlay.set_default_size(600, 400)

        # Make it a layer-shell overlay
        LayerShell.init_for_window(self.device_overlay)
        LayerShell.set_layer(self.device_overlay, LayerShell.Layer.OVERLAY)
        LayerShell.set_anchor(self.device_overlay, LayerShell.Edge.TOP, True)
        LayerShell.set_anchor(self.device_overlay, LayerShell.Edge.BOTTOM, True)
        LayerShell.set_anchor(self.device_overlay, LayerShell.Edge.LEFT, True)
        LayerShell.set_anchor(self.device_overlay, LayerShell.Edge.RIGHT, True)
        LayerShell.set_keyboard_mode(self.device_overlay, LayerShell.KeyboardMode.EXCLUSIVE)

        # Drawing area for the overlay
        drawing = Gtk.DrawingArea()
        drawing.set_draw_func(self.draw_device_overlay)
        self.device_overlay.set_child(drawing)

        # Click handler
        click = Gtk.GestureClick()
        click.connect('pressed', self.on_device_overlay_click)
        drawing.add_controller(click)

        # Escape to close
        key = Gtk.EventControllerKey()
        key.connect('key-pressed', self.on_device_overlay_key)
        self.device_overlay.add_controller(key)

        self.device_overlay.present()

    def draw_device_overlay(self, area, cr, width, height):
        """Draw the audio device selection overlay."""
        import cairo

        # Semi-transparent dark background
        cr.set_source_rgba(0, 0, 0, 0.85)
        cr.paint()

        cr.select_font_face("Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)

        # Title
        cr.set_font_size(24)
        title = "Select Audio Output"
        ext = cr.text_extents(title)
        cr.set_source_rgba(1, 1, 1, 0.95)
        cr.move_to((width - ext.width) / 2, 60)
        cr.show_text(title)

        # Calculate layout for device list
        item_height = 50
        item_width = min(500, width - 100)
        start_x = (width - item_width) // 2
        start_y = 100

        cr.set_font_size(14)

        for i, (device_id, device_name) in enumerate(self.audio_devices):
            y = start_y + i * (item_height + 10)

            # Check if this is the current device
            is_current = device_id == self.audio_device

            # Background rectangle
            if is_current:
                cr.set_source_rgba(*NEON_CYAN, 0.3)
            else:
                cr.set_source_rgba(0.3, 0.3, 0.35, 0.8)

            # Rounded rectangle
            radius = 10
            cr.new_path()
            cr.arc(start_x + radius, y + radius, radius, math.pi, 1.5 * math.pi)
            cr.arc(start_x + item_width - radius, y + radius, radius, 1.5 * math.pi, 2 * math.pi)
            cr.arc(start_x + item_width - radius, y + item_height - radius, radius, 0, 0.5 * math.pi)
            cr.arc(start_x + radius, y + item_height - radius, radius, 0.5 * math.pi, math.pi)
            cr.close_path()
            cr.fill()

            # Border for current
            if is_current:
                cr.set_source_rgba(*NEON_CYAN, 0.8)
                cr.set_line_width(2)
                cr.new_path()
                cr.arc(start_x + radius, y + radius, radius, math.pi, 1.5 * math.pi)
                cr.arc(start_x + item_width - radius, y + radius, radius, 1.5 * math.pi, 2 * math.pi)
                cr.arc(start_x + item_width - radius, y + item_height - radius, radius, 0, 0.5 * math.pi)
                cr.arc(start_x + radius, y + item_height - radius, radius, 0.5 * math.pi, math.pi)
                cr.close_path()
                cr.stroke()

            # Device name
            cr.set_source_rgba(1, 1, 1, 0.95)
            ext = cr.text_extents(device_name)
            cr.move_to(start_x + 20, y + (item_height + ext.height) / 2)
            cr.show_text(device_name)

            # Checkmark for current
            if is_current:
                cr.set_source_rgba(*NEON_CYAN, 1)
                check_x = start_x + item_width - 30
                check_y = y + item_height / 2
                cr.set_line_width(3)
                cr.move_to(check_x - 8, check_y)
                cr.line_to(check_x - 3, check_y + 5)
                cr.line_to(check_x + 8, check_y - 6)
                cr.stroke()

        # Instructions
        cr.set_font_size(14)
        text = "Click a device to select • Press Escape to cancel"
        ext = cr.text_extents(text)
        cr.set_source_rgba(0.6, 0.6, 0.6, 1)
        cr.move_to((width - ext.width) / 2, height - 30)
        cr.show_text(text)

    def on_device_overlay_click(self, gesture, n_press, x, y):
        """Handle click on device overlay."""
        # Get overlay size
        width = self.device_overlay.get_width()

        # Same layout calculation as drawing
        item_height = 50
        item_width = min(500, width - 100)
        start_x = (width - item_width) // 2
        start_y = 100

        for i, (device_id, device_name) in enumerate(self.audio_devices):
            item_y = start_y + i * (item_height + 10)
            if start_x <= x <= start_x + item_width and item_y <= y <= item_y + item_height:
                self.set_audio_device(device_id)
                self.device_overlay.destroy()
                self.device_overlay = None
                return

    def on_device_overlay_key(self, controller, keyval, keycode, state):
        """Handle key press on device overlay."""
        if keyval == Gdk.KEY_Escape:
            self.device_overlay.destroy()
            self.device_overlay = None
            return True
        return False

    def set_audio_device(self, device_id):
        """Set audio device and update server (pro-audio mode - no profile switching)."""
        import requests

        self.audio_device = device_id
        print(f"Audio device set to: {device_id}", flush=True)

        # Update server with the sink name
        try:
            requests.post("http://127.0.0.1:8765/device", json={"device": device_id}, timeout=1)
        except Exception as e:
            print(f"Error updating server: {e}", flush=True)

    def start_evdev_listener(self):
        """Listen for CapsLock (user speaking)."""
        def listener():
            device = find_keyboard()
            if not device:
                print("No keyboard found for evdev!", flush=True)
                return
            print(f"Listening on {device.name}", flush=True)
            try:
                for event in device.read_loop():
                    if event.type == ecodes.EV_KEY and event.code == ecodes.KEY_CAPSLOCK:
                        # value: 0=release, 1=press, 2=repeat (ignore repeat)
                        if event.value == 1:
                            self.is_listening = True
                        elif event.value == 0:
                            self.is_listening = False
            except Exception as e:
                print(f"Evdev error: {e}", flush=True)

        self.evdev_thread = threading.Thread(target=listener, daemon=True)
        self.evdev_thread.start()

    def start_state_listener(self):
        """Poll state file for server status."""
        def poll_state():
            import time
            while True:
                try:
                    if STATE_FILE.exists():
                        state = STATE_FILE.read_text().strip()
                        if state.startswith("loading:"):
                            self.is_loading = True
                            self.loading_what = state.split(":")[1].upper()
                        else:
                            self.is_loading = state == "loading"
                            self.loading_what = ""
                        self.is_speaking = state == "speaking"
                    else:
                        self.is_loading = True
                        self.loading_what = ""
                except Exception:
                    pass
                time.sleep(0.1)

        self.state_thread = threading.Thread(target=poll_state, daemon=True)
        self.state_thread.start()

    def start_worker_listener(self):
        """Poll worker session files for status."""
        def poll_workers():
            import time
            import json
            while True:
                try:
                    workers = []
                    if WORKERS_DIR.exists():
                        for f in WORKERS_DIR.glob("worker-*.json"):
                            try:
                                data = json.loads(f.read_text())
                                worker_id = data.get("id", f.stem.replace("worker-", ""))
                                status = data.get("status", "idle")
                                workers.append({"id": worker_id, "status": status})
                            except Exception:
                                pass
                    self.workers = workers
                except Exception:
                    pass
                time.sleep(1)  # Poll every second

        self.worker_thread = threading.Thread(target=poll_workers, daemon=True)
        self.worker_thread.start()

    def animate(self):
        # Pulse animation for all active states (loading, listening, speaking)
        if self.is_listening or self.is_speaking or self.is_loading:
            self.pulse_phase += 0.1 if self.is_loading else 0.15
            if self.pulse_phase > 2 * math.pi:
                self.pulse_phase -= 2 * math.pi
        else:
            if self.pulse_phase > 0:
                self.pulse_phase = max(0, self.pulse_phase - 0.08)

        # Animate loading dots (cycle every ~500ms at 60fps)
        if self.is_loading:
            self.dot_counter += 1
            if self.dot_counter >= 30:  # ~500ms
                self.dot_counter = 0
                self.loading_dots = (self.loading_dots + 1) % 4  # 0, 1, 2, 3 dots

        self.drawing_area.queue_draw()
        return True

    def draw_bubble(self, area, cr, width, height):
        import cairo
        cx, cy = width / 2, height / 2 - 10  # Shift up to make room for label
        radius = 25

        # Clear background
        cr.set_operator(0)
        cr.paint()
        cr.set_operator(1)

        # Determine colors based on state
        if self.is_listening and self.is_loading:
            # Warning: trying to record while STT not ready
            primary = WARNING_RED
            secondary = WARNING_DARK
            accent = WARNING_ACCENT
        elif self.is_listening:
            primary = NEON_CYAN
            secondary = ELECTRIC_BLUE
            accent = NEON_MAGENTA
        elif self.is_speaking:
            primary = GOLD
            secondary = GOLD_DARK
            accent = WARM_ORANGE
        elif self.is_loading:
            primary = GRAY_LIGHT
            secondary = GRAY_MID
            accent = GRAY_DARK
        else:
            primary = NEON_MAGENTA
            secondary = DARK_PURPLE
            accent = NEON_PINK

        # === ACTIVE STATE (listening, speaking, or loading) ===
        if self.is_listening or self.is_speaking or self.is_loading or self.pulse_phase > 0:
            pulse = (math.sin(self.pulse_phase) + 1) / 2
            pulse2 = (math.sin(self.pulse_phase * 2) + 1) / 2

            # Outer glow
            glow_r = radius + 15 + pulse * 5
            pattern = cairo.RadialGradient(cx, cy, radius, cx, cy, glow_r)
            pattern.add_color_stop_rgba(0, *accent, 0.6 * pulse + 0.2)
            pattern.add_color_stop_rgba(0.5, *primary, 0.3 * pulse)
            pattern.add_color_stop_rgba(1, *accent, 0)
            cr.set_source(pattern)
            cr.arc(cx, cy, glow_r, 0, 2 * math.pi)
            cr.fill()

            # Inner glow ring
            glow_r2 = radius + 10 + pulse2 * 4
            pattern = cairo.RadialGradient(cx, cy, radius * 0.8, cx, cy, glow_r2)
            pattern.add_color_stop_rgba(0, *primary, 0.7 * pulse + 0.3)
            pattern.add_color_stop_rgba(0.6, *secondary, 0.4 * pulse)
            pattern.add_color_stop_rgba(1, *primary, 0)
            cr.set_source(pattern)
            cr.arc(cx, cy, glow_r2, 0, 2 * math.pi)
            cr.fill()

            # Core base
            cr.set_source_rgba(*DARK_PURPLE, 1.0)
            cr.arc(cx, cy, radius, 0, 2 * math.pi)
            cr.fill()

            # Core gradient
            pattern = cairo.RadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius)
            if self.is_listening and self.is_loading:
                pattern.add_color_stop_rgba(0, 1.0, 0.7, 0.6, 1.0)  # Warning center
            elif self.is_speaking:
                pattern.add_color_stop_rgba(0, 1.0, 0.95, 0.7, 1.0)  # Warm center
            elif self.is_loading:
                pattern.add_color_stop_rgba(0, 0.6, 0.6, 0.65, 1.0)  # Gray center
            else:
                pattern.add_color_stop_rgba(0, 0.7, 0.9, 1.0, 1.0)  # Cool center
            pattern.add_color_stop_rgba(0.3, *primary, 1.0)
            pattern.add_color_stop_rgba(0.7, *accent, 1.0)
            pattern.add_color_stop_rgba(1, *DARK_PURPLE, 1.0)
            cr.set_source(pattern)
            cr.arc(cx, cy, radius, 0, 2 * math.pi)
            cr.fill()

            # Inner shine
            if self.is_listening and self.is_loading:
                shine_color = (1.0, 0.8, 0.7)  # Warning
            elif self.is_speaking:
                shine_color = (1.0, 0.95, 0.8)  # Warm
            elif self.is_loading:
                shine_color = (0.8, 0.8, 0.85)  # Gray
            else:
                shine_color = (0.8, 0.95, 1.0)  # Cool
            cr.set_source_rgba(*shine_color, 0.5 + pulse * 0.3)
            cr.arc(cx - radius * 0.25, cy - radius * 0.25, radius * 0.2, 0, 2 * math.pi)
            cr.fill()

        else:
            # === IDLE STATE ===
            # Subtle outer glow
            pattern = cairo.RadialGradient(cx, cy, radius, cx, cy, radius + 12)
            pattern.add_color_stop_rgba(0, *NEON_MAGENTA, 0.3)
            pattern.add_color_stop_rgba(1, *DARK_PURPLE, 0)
            cr.set_source(pattern)
            cr.arc(cx, cy, radius + 12, 0, 2 * math.pi)
            cr.fill()

            # Base circle
            cr.set_source_rgba(*DARK_PURPLE, 1.0)
            cr.arc(cx, cy, radius, 0, 2 * math.pi)
            cr.fill()

            # Core gradient
            pattern = cairo.RadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius)
            pattern.add_color_stop_rgba(0, 0.5, 0.3, 0.6, 1.0)
            pattern.add_color_stop_rgba(1, *DARK_PURPLE, 1.0)
            cr.set_source(pattern)
            cr.arc(cx, cy, radius, 0, 2 * math.pi)
            cr.fill()

            # Highlight
            cr.set_source_rgba(1, 1, 1, 0.25)
            cr.arc(cx - radius * 0.2, cy - radius * 0.2, radius * 0.2, 0, 2 * math.pi)
            cr.fill()

        # === LABEL with dark background ===
        if self.is_listening and self.is_loading:
            label_text = "Wait" + "." * self.loading_dots
        elif self.is_listening:
            label_text = "Listening"
        elif self.is_speaking:
            label_text = "Speaking"
        elif self.is_loading:
            if self.loading_what:
                label_text = f"{self.loading_what}" + "." * self.loading_dots
            else:
                label_text = "Loading" + "." * self.loading_dots
        else:
            label_text = "Idle"
        label_y = cy + radius + 28  # Lower position

        cr.select_font_face("Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        cr.set_font_size(13)
        extents = cr.text_extents(label_text)
        text_x = cx - extents.width / 2 - extents.x_bearing
        text_y = label_y

        # Dark background pill
        padding_x = 12
        padding_y = 6
        bg_x = text_x - padding_x
        bg_y = text_y - extents.height - padding_y + 2
        bg_w = extents.width + padding_x * 2
        bg_h = extents.height + padding_y * 2
        bg_radius = bg_h / 2

        cr.set_source_rgba(0, 0, 0, 0.25)
        # Draw rounded rectangle
        cr.new_path()
        cr.arc(bg_x + bg_radius, bg_y + bg_radius, bg_radius, math.pi, 1.5 * math.pi)
        cr.arc(bg_x + bg_w - bg_radius, bg_y + bg_radius, bg_radius, 1.5 * math.pi, 2 * math.pi)
        cr.arc(bg_x + bg_w - bg_radius, bg_y + bg_h - bg_radius, bg_radius, 0, 0.5 * math.pi)
        cr.arc(bg_x + bg_radius, bg_y + bg_h - bg_radius, bg_radius, 0.5 * math.pi, math.pi)
        cr.close_path()
        cr.fill()

        # Label color based on state
        if self.is_listening and self.is_loading:
            label_color = WARNING_RED
        elif self.is_speaking:
            label_color = GOLD
        elif self.is_loading:
            label_color = GRAY_LIGHT
        else:
            label_color = NEON_CYAN

        # Main text (no glow for cleaner look)
        cr.set_source_rgba(*label_color, 0.95)
        cr.move_to(text_x, text_y)
        cr.show_text(label_text)

        # === X BUTTON ===
        x_cx, x_cy = self.get_x_center()
        half = X_SIZE // 2
        x_alpha = 0.9 if self.x_hovered else 0.4

        if self.x_hovered:
            cr.set_source_rgba(*NEON_MAGENTA, 0.4)
            cr.arc(x_cx, x_cy, X_HIT_RADIUS, 0, 2 * math.pi)
            cr.fill()

        cr.set_line_width(2.5 if self.x_hovered else 2.0)
        cr.set_line_cap(1)
        cr.set_source_rgba(1, 1, 1, x_alpha)
        cr.move_to(x_cx - half, x_cy - half)
        cr.line_to(x_cx + half, x_cy + half)
        cr.stroke()
        cr.move_to(x_cx + half, x_cy - half)
        cr.line_to(x_cx - half, x_cy + half)
        cr.stroke()

        # === VOLUME BUTTON (shows number) ===
        v_cx, v_cy = self.get_vol_center()
        vol_alpha = 0.9 if self.vol_hovered else 0.4

        # Hover highlight
        if self.vol_hovered:
            cr.set_source_rgba(*NEON_CYAN, 0.4)
            cr.arc(v_cx, v_cy, VOL_HIT_RADIUS, 0, 2 * math.pi)
            cr.fill()

        # Draw volume number
        cr.select_font_face("Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        cr.set_font_size(11)
        vol_text = str(self.volume)
        ext = cr.text_extents(vol_text)
        cr.set_source_rgba(1, 1, 1, vol_alpha)
        cr.move_to(v_cx - ext.width / 2 - ext.x_bearing, v_cy - ext.height / 2 - ext.y_bearing)
        cr.show_text(vol_text)

        # === MUTE BUTTON ===
        m_cx, m_cy = self.get_mute_center()
        mute_alpha = 0.9 if self.mute_hovered else 0.4

        # Hover highlight
        if self.mute_hovered:
            cr.set_source_rgba(*NEON_CYAN, 0.4)
            cr.arc(m_cx, m_cy, MUTE_HIT_RADIUS, 0, 2 * math.pi)
            cr.fill()

        cr.set_line_width(1.5 if self.mute_hovered else 1.2)
        cr.set_source_rgba(1, 1, 1, mute_alpha)

        # Draw speaker icon
        spk_w = 6
        spk_h = 8
        spk_x = m_cx - 7

        # Speaker body (rectangle)
        cr.rectangle(spk_x, m_cy - spk_h / 4, spk_w / 2, spk_h / 2)
        cr.fill()

        # Speaker cone (triangle)
        cr.move_to(spk_x + spk_w / 2, m_cy - spk_h / 4)
        cr.line_to(spk_x + spk_w, m_cy - spk_h / 2)
        cr.line_to(spk_x + spk_w, m_cy + spk_h / 2)
        cr.line_to(spk_x + spk_w / 2, m_cy + spk_h / 4)
        cr.close_path()
        cr.fill()

        # Draw X if muted, or sound wave if not
        wave_x = spk_x + spk_w + 2
        if self.muted:
            # Draw X for mute
            cr.set_source_rgba(1, 0.3, 0.3, mute_alpha)  # Red-ish for muted
            cr.set_line_width(2.0)
            cr.move_to(wave_x, m_cy - 4)
            cr.line_to(wave_x + 6, m_cy + 4)
            cr.stroke()
            cr.move_to(wave_x + 6, m_cy - 4)
            cr.line_to(wave_x, m_cy + 4)
            cr.stroke()
        else:
            # Draw single sound wave
            cr.set_line_width(1.5)
            cr.arc(wave_x + 2, m_cy, 4, -0.5, 0.5)
            cr.stroke()

        # === POSITION BUTTON ===
        p_cx, p_cy = self.get_pos_center()
        pos_alpha = 0.9 if self.pos_hovered else 0.4

        # Hover highlight
        if self.pos_hovered:
            cr.set_source_rgba(*NEON_CYAN, 0.4)
            cr.arc(p_cx, p_cy, POS_HIT_RADIUS, 0, 2 * math.pi)
            cr.fill()

        cr.set_line_width(1.5 if self.pos_hovered else 1.2)
        cr.set_source_rgba(1, 1, 1, pos_alpha)

        # Draw move/grid icon (4 arrows pointing outward)
        arr_len = 5
        arr_gap = 3
        # Up arrow
        cr.move_to(p_cx, p_cy - arr_gap)
        cr.line_to(p_cx, p_cy - arr_gap - arr_len)
        cr.stroke()
        cr.move_to(p_cx - 2, p_cy - arr_gap - arr_len + 2)
        cr.line_to(p_cx, p_cy - arr_gap - arr_len)
        cr.line_to(p_cx + 2, p_cy - arr_gap - arr_len + 2)
        cr.stroke()
        # Down arrow
        cr.move_to(p_cx, p_cy + arr_gap)
        cr.line_to(p_cx, p_cy + arr_gap + arr_len)
        cr.stroke()
        cr.move_to(p_cx - 2, p_cy + arr_gap + arr_len - 2)
        cr.line_to(p_cx, p_cy + arr_gap + arr_len)
        cr.line_to(p_cx + 2, p_cy + arr_gap + arr_len - 2)
        cr.stroke()
        # Left arrow
        cr.move_to(p_cx - arr_gap, p_cy)
        cr.line_to(p_cx - arr_gap - arr_len, p_cy)
        cr.stroke()
        cr.move_to(p_cx - arr_gap - arr_len + 2, p_cy - 2)
        cr.line_to(p_cx - arr_gap - arr_len, p_cy)
        cr.line_to(p_cx - arr_gap - arr_len + 2, p_cy + 2)
        cr.stroke()
        # Right arrow
        cr.move_to(p_cx + arr_gap, p_cy)
        cr.line_to(p_cx + arr_gap + arr_len, p_cy)
        cr.stroke()
        cr.move_to(p_cx + arr_gap + arr_len - 2, p_cy - 2)
        cr.line_to(p_cx + arr_gap + arr_len, p_cy)
        cr.line_to(p_cx + arr_gap + arr_len - 2, p_cy + 2)
        cr.stroke()

        # === SPEAKER/DEVICE BUTTON ===
        s_cx, s_cy = self.get_spk_center()
        spk_alpha = 0.9 if self.spk_hovered else 0.4

        # Hover highlight
        if self.spk_hovered:
            cr.set_source_rgba(*NEON_CYAN, 0.4)
            cr.arc(s_cx, s_cy, SPK_HIT_RADIUS, 0, 2 * math.pi)
            cr.fill()

        cr.set_line_width(1.5 if self.spk_hovered else 1.2)
        cr.set_source_rgba(1, 1, 1, spk_alpha)

        # Draw headphones/output icon
        # Headband arc
        cr.arc(s_cx, s_cy - 1, 6, math.pi, 2 * math.pi)
        cr.stroke()
        # Left ear cup
        cr.rectangle(s_cx - 8, s_cy - 1, 4, 7)
        cr.fill()
        # Right ear cup
        cr.rectangle(s_cx + 4, s_cy - 1, 4, 7)
        cr.fill()

        # === WORKER DOTS ===
        if self.workers:
            dot_radius = 5
            dot_spacing = 14
            num_workers = len(self.workers)
            # Center the dots below the label
            dots_width = (num_workers - 1) * dot_spacing
            dot_start_x = cx - dots_width / 2
            dot_y = label_y + 18  # Below the label

            for i, worker in enumerate(self.workers):
                dot_x = dot_start_x + i * dot_spacing
                worker_id = worker.get("id", "")
                status = worker.get("status", "idle")

                # Get color for this worker
                color = WORKER_COLORS.get(worker_id, (0.5, 0.5, 0.5))

                # Determine visual based on status
                if status == "working":
                    # Pulsing glow for working
                    pulse = (math.sin(self.pulse_phase * 2) + 1) / 2
                    glow_r = dot_radius + 3 + pulse * 2
                    pattern = cairo.RadialGradient(dot_x, dot_y, dot_radius * 0.5, dot_x, dot_y, glow_r)
                    pattern.add_color_stop_rgba(0, *color, 0.9)
                    pattern.add_color_stop_rgba(0.5, *color, 0.4 * pulse + 0.2)
                    pattern.add_color_stop_rgba(1, *color, 0)
                    cr.set_source(pattern)
                    cr.arc(dot_x, dot_y, glow_r, 0, 2 * math.pi)
                    cr.fill()
                elif status == "done":
                    # Bright solid for done
                    cr.set_source_rgba(*color, 1.0)
                    cr.arc(dot_x, dot_y, dot_radius + 1, 0, 2 * math.pi)
                    cr.fill()
                elif status == "error":
                    # Red flashing for error
                    flash = (math.sin(self.pulse_phase * 4) + 1) / 2
                    cr.set_source_rgba(1.0, 0.2, 0.2, 0.6 + flash * 0.4)
                    cr.arc(dot_x, dot_y, dot_radius + 1, 0, 2 * math.pi)
                    cr.fill()
                else:
                    # Dim for idle
                    cr.set_source_rgba(*color, 0.4)
                    cr.arc(dot_x, dot_y, dot_radius, 0, 2 * math.pi)
                    cr.fill()

                # Core dot
                cr.set_source_rgba(*color, 0.9 if status in ("working", "done") else 0.5)
                cr.arc(dot_x, dot_y, dot_radius - 1, 0, 2 * math.pi)
                cr.fill()


def main():
    app = EchoBubble()
    app.run()


if __name__ == '__main__':
    main()
