"""Push-to-talk listener using evdev with modifier support.

Listens for CapsLock press/release and mouse side buttons without grabbing,
so normal input continues to work.

Triggers:
- CapsLock (hold) -> PTT recording
- Mouse side button (hold) -> PTT recording (same behavior)

Modes:
- "paste": CapsLock/mouse alone -> paste at cursor via wtype
- "iris": Shift+CapsLock -> send to focused god

Tap vs Hold:
- Quick tap (< 300ms) -> triggers on_tap callback (skip TTS)
- Longer hold -> triggers on_press/on_release (PTT recording)
"""

import time
import threading
from evdev import InputDevice, ecodes, list_devices

# Tap threshold in seconds
TAP_THRESHOLD = 0.3

# Key states
KEY_UP = 0
KEY_DOWN = 1
KEY_HOLD = 2

# Mouse side buttons (button 8 and 9 on most mice)
BTN_SIDE = ecodes.BTN_SIDE      # 0x113 = 275 - typically "back" button
BTN_EXTRA = ecodes.BTN_EXTRA    # 0x114 = 276 - typically "forward" button
MOUSE_PTT_BUTTONS = {BTN_SIDE, BTN_EXTRA}


def find_keyboards():
    """Find all keyboard devices."""
    keyboards = []
    for path in list_devices():
        try:
            dev = InputDevice(path)
            caps = dev.capabilities()
            # Check if device has EV_KEY capability with actual keys
            if ecodes.EV_KEY in caps:
                keys = caps[ecodes.EV_KEY]
                # Look for common keyboard keys (not just mouse buttons)
                if ecodes.KEY_A in keys or ecodes.KEY_CAPSLOCK in keys:
                    keyboards.append(dev)
                else:
                    dev.close()
            else:
                dev.close()
        except Exception:
            pass
    return keyboards


def find_mice():
    """Find all mouse devices with side buttons."""
    mice = []
    for path in list_devices():
        try:
            dev = InputDevice(path)
            caps = dev.capabilities()
            # Check if device has EV_KEY capability with mouse side buttons
            if ecodes.EV_KEY in caps:
                keys = caps[ecodes.EV_KEY]
                # Look for side buttons
                if BTN_SIDE in keys or BTN_EXTRA in keys:
                    mice.append(dev)
                else:
                    dev.close()
            else:
                dev.close()
        except Exception:
            pass
    return mice


class PTTListener:
    """Listens for push-to-talk triggers (CapsLock + mouse side buttons).

    Supports tap vs hold detection:
    - Quick tap (< TAP_THRESHOLD) -> on_tap callback
    - Longer hold -> on_press at press time, on_release at release time
    """

    def __init__(self, on_press=None, on_release=None, on_tap=None, key=ecodes.KEY_CAPSLOCK):
        self.on_press = on_press
        self.on_release = on_release
        self.on_tap = on_tap  # Called on quick tap (< TAP_THRESHOLD)
        self.key = key
        self._running = False
        self._threads = []
        self._devices = []
        self._mice = []
        self._shift_held = False
        self._ptt_held = False  # Either CapsLock or mouse button
        self._current_mode = None  # Track mode during press-release cycle
        self._press_time = None  # Track when PTT was pressed
        self._press_handled = False  # Whether on_press was called (for hold)
        self._lock = threading.Lock()  # Protect state across devices

    def _start_delayed_press(self):
        """Start timer to trigger on_press after TAP_THRESHOLD."""
        def delayed_press():
            time.sleep(TAP_THRESHOLD)
            # Only fire if key is still held and we haven't handled it
            with self._lock:
                if self._ptt_held and not self._press_handled:
                    self._press_handled = True
                    if self.on_press:
                        self.on_press(self._current_mode)

        threading.Thread(target=delayed_press, daemon=True).start()

    def start(self):
        """Start listening on all keyboards and mice."""
        self._running = True
        self._devices = find_keyboards()
        self._mice = find_mice()

        if not self._devices and not self._mice:
            print("Warning: No keyboard or mouse devices found for PTT")
            return

        print(f"PTT listening on {len(self._devices)} keyboard(s), {len(self._mice)} mouse/mice")
        print("  CapsLock or mouse side button = record and paste")
        print("  Shift+CapsLock = send to focused god")

        for dev in self._devices:
            t = threading.Thread(target=self._listen_keyboard, args=(dev,), daemon=True)
            t.start()
            self._threads.append(t)

        for dev in self._mice:
            t = threading.Thread(target=self._listen_mouse, args=(dev,), daemon=True)
            t.start()
            self._threads.append(t)

    def _listen_keyboard(self, device):
        """Listen for keyboard events (CapsLock + Shift tracking)."""
        try:
            for event in device.read_loop():
                if not self._running:
                    break

                # Track Shift key state
                if event.type == ecodes.EV_KEY and event.code in (ecodes.KEY_LEFTSHIFT, ecodes.KEY_RIGHTSHIFT):
                    if event.value == KEY_DOWN:
                        self._shift_held = True
                    elif event.value == KEY_UP:
                        self._shift_held = False
                    continue

                # Track CapsLock state and handle PTT with tap detection
                if event.type == ecodes.EV_KEY and event.code == self.key:
                    self._handle_ptt_event(event.value, "capslock")

        except Exception as e:
            print(f"PTT keyboard listener error on {device.path}: {e}")

    def _listen_mouse(self, device):
        """Listen for mouse side button events."""
        try:
            for event in device.read_loop():
                if not self._running:
                    break

                # Track mouse side buttons
                if event.type == ecodes.EV_KEY and event.code in MOUSE_PTT_BUTTONS:
                    self._handle_ptt_event(event.value, "mouse")

        except Exception as e:
            print(f"PTT mouse listener error on {device.path}: {e}")

    def _handle_ptt_event(self, value, source):
        """Handle PTT press/release from any source (keyboard or mouse)."""
        with self._lock:
            if value == KEY_DOWN:
                # Only start if not already held (prevent double-trigger)
                if self._ptt_held:
                    return
                self._ptt_held = True
                self._press_time = time.monotonic()
                self._press_handled = False
                # Mouse always uses paste mode, keyboard can use shift for iris
                self._current_mode = "iris" if (source == "capslock" and self._shift_held) else "paste"
                # Start delayed press timer
                self._start_delayed_press()

            elif value == KEY_UP:
                # Only release if we're the one holding
                if not self._ptt_held:
                    return
                self._ptt_held = False
                duration = time.monotonic() - self._press_time if self._press_time else 0

                if duration < TAP_THRESHOLD and not self._press_handled:
                    # Quick tap - just stop TTS
                    if self.on_tap:
                        self.on_tap()
                elif self._press_handled:
                    # Normal hold release - stop recording
                    if self.on_release:
                        self.on_release(self._current_mode or "paste")

                self._current_mode = None
                self._press_time = None

    def stop(self):
        """Stop listening."""
        self._running = False
        for dev in self._devices + self._mice:
            try:
                dev.close()
            except Exception:
                pass


if __name__ == "__main__":
    # Test the listener
    def on_press(mode):
        print(f"PTT HOLD (mode={mode}) - start recording")

    def on_release(mode):
        print(f"PTT RELEASED (mode={mode}) - stop recording")

    def on_tap():
        print("PTT TAP - skip TTS!")

    print("Testing PTT listener (Ctrl+C to exit)")
    print(f"Triggers: CapsLock or mouse side button")
    print(f"Quick tap (<{TAP_THRESHOLD}s) = skip TTS")
    print(f"Hold (>{TAP_THRESHOLD}s) = PTT recording")

    listener = PTTListener(on_press=on_press, on_release=on_release, on_tap=on_tap)
    listener.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        listener.stop()
        print("\nStopped")
