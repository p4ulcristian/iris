"""Push-to-talk listener using evdev with modifier support.

Listens for CapsLock press/release without grabbing the device,
so normal keyboard input continues to work.

Modes:
- "paste": CapsLock alone -> paste at cursor
- "iris": Shift+CapsLock -> send to master Iris tmux pane

Combos:
- CapsLock+Enter -> push Enter in master Iris pane
"""

import threading
from evdev import InputDevice, ecodes, list_devices

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
    """Listens for push-to-talk key (CapsLock) with modifier detection."""

    def __init__(self, on_press=None, on_release=None, on_enter=None, key=ecodes.KEY_CAPSLOCK):
        self.on_press = on_press
        self.on_release = on_release
        self.on_enter = on_enter  # Called when CapsLock+Enter is pressed
        self.key = key
        self._running = False
        self._threads = []
        self._devices = []
        self._shift_held = False
        self._capslock_held = False
        self._current_mode = None  # Track mode during press-release cycle

    def start(self):
        """Start listening on all keyboards."""
        self._running = True
        self._devices = find_keyboards()

        if not self._devices:
            print("Warning: No keyboard devices found for PTT")
            return

        print(f"PTT listening on {len(self._devices)} device(s) for CapsLock")
        print("  CapsLock = paste at cursor")
        print("  Shift+CapsLock = send to Iris")
        print("  CapsLock+Enter = submit to Iris")

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

                # Track CapsLock state and handle PTT
                if event.type == ecodes.EV_KEY and event.code == self.key:
                    if event.value == KEY_DOWN:
                        self._capslock_held = True
                        # Determine mode based on shift state at press time
                        self._current_mode = "iris" if self._shift_held else "paste"
                        if self.on_press:
                            self.on_press(self._current_mode)
                    elif event.value == KEY_UP:
                        self._capslock_held = False
                        if self.on_release:
                            self.on_release(self._current_mode or "paste")
                        self._current_mode = None
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
        print(f"CapsLock PRESSED (mode={mode}) - start recording")

    def on_release(mode):
        print(f"CapsLock RELEASED (mode={mode}) - stop recording")

    def on_enter():
        print("CapsLock+Enter - submit to Iris!")

    print("Testing PTT listener (Ctrl+C to exit)")
    print("Press CapsLock, Shift+CapsLock, or CapsLock+Enter...")

    listener = PTTListener(on_press=on_press, on_release=on_release, on_enter=on_enter)
    listener.start()

    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        listener.stop()
        print("\nStopped")
