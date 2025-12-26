"""Push-to-talk listener using evdev with modifier support.

Listens for CapsLock press/release without grabbing the device,
so normal keyboard input continues to work.

Modes:
- "paste": CapsLock alone -> paste at cursor via wtype
- "iris": Shift+CapsLock -> paste at cursor (same behavior)

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


class PTTListener:
    """Listens for push-to-talk key (CapsLock) with modifier detection.

    Supports tap vs hold detection:
    - Quick tap (< TAP_THRESHOLD) -> on_tap callback
    - Longer hold -> on_press at press time, on_release at release time
    """

    def __init__(self, on_press=None, on_release=None, on_enter=None, on_tap=None, key=ecodes.KEY_CAPSLOCK):
        self.on_press = on_press
        self.on_release = on_release
        self.on_enter = on_enter  # Called when CapsLock+Enter is pressed
        self.on_tap = on_tap  # Called on quick tap (< TAP_THRESHOLD)
        self.key = key
        self._running = False
        self._threads = []
        self._devices = []
        self._shift_held = False
        self._capslock_held = False
        self._current_mode = None  # Track mode during press-release cycle
        self._press_time = None  # Track when CapsLock was pressed
        self._press_handled = False  # Whether on_press was called (for hold)

    def _start_delayed_press(self):
        """Start timer to trigger on_press after TAP_THRESHOLD."""
        def delayed_press():
            time.sleep(TAP_THRESHOLD)
            # Only fire if key is still held and we haven't handled it
            if self._capslock_held and not self._press_handled:
                self._press_handled = True
                if self.on_press:
                    self.on_press(self._current_mode)

        threading.Thread(target=delayed_press, daemon=True).start()

    def start(self):
        """Start listening on all keyboards."""
        self._running = True
        self._devices = find_keyboards()

        if not self._devices:
            print("Warning: No keyboard devices found for PTT")
            return

        print(f"PTT listening on {len(self._devices)} device(s) for CapsLock")
        print("  CapsLock = paste at cursor")
        print("  Shift+CapsLock = paste at cursor (alternate mode)")

        for dev in self._devices:
            t = threading.Thread(target=self._listen, args=(dev,), daemon=True)
            t.start()
            self._threads.append(t)

    def _listen(self, device):
        """Listen for key events on a device (no grab!)."""
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
                    if event.value == KEY_DOWN:
                        self._capslock_held = True
                        self._press_time = time.monotonic()
                        self._press_handled = False
                        # Determine mode based on shift state at press time
                        self._current_mode = "iris" if self._shift_held else "paste"
                        # Start delayed press timer
                        self._start_delayed_press()
                    elif event.value == KEY_UP:
                        self._capslock_held = False
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
                    # Ignore KEY_HOLD (repeat) events
                    continue

                # CapsLock+Enter combo
                if event.type == ecodes.EV_KEY and event.code == ecodes.KEY_ENTER:
                    if event.value == KEY_DOWN and self._capslock_held:
                        if self.on_enter:
                            self.on_enter()
                    continue

        except Exception as e:
            print(f"PTT listener error on {device.path}: {e}")

    def stop(self):
        """Stop listening."""
        self._running = False
        for dev in self._devices:
            try:
                dev.close()
            except Exception:
                pass


if __name__ == "__main__":
    # Test the listener
    def on_press(mode):
        print(f"CapsLock HOLD (mode={mode}) - start recording")

    def on_release(mode):
        print(f"CapsLock RELEASED (mode={mode}) - stop recording")

    def on_tap():
        print("CapsLock TAP - skip TTS!")

    print("Testing PTT listener (Ctrl+C to exit)")
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
