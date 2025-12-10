"""Evdev-based hotkey listener for true PTT with modifier support."""

import atexit
import signal
import threading
from evdev import InputDevice, UInput, ecodes, list_devices

# Global reference for cleanup
_grabbed_device = None
_uinput = None


def _cleanup():
    """Release grabbed keyboard device."""
    global _grabbed_device, _uinput
    if _grabbed_device:
        try:
            _grabbed_device.ungrab()
        except Exception:
            pass
        _grabbed_device = None
    if _uinput:
        try:
            _uinput.close()
        except Exception:
            pass
        _uinput = None


# Register cleanup for normal exit
atexit.register(_cleanup)


def find_keyboard():
    """Find a keyboard device."""
    for path in list_devices():
        device = InputDevice(path)
        caps = device.capabilities()
        if ecodes.EV_KEY in caps:
            keys = caps[ecodes.EV_KEY]
            if ecodes.KEY_CAPSLOCK in keys:
                return device
    return None


def listen_hotkey(key_code, on_press, on_release):
    """
    Listen for key press/release events.
    Grabs keyboard exclusively and forwards all keys except the hotkey.

    Callbacks receive a mode parameter:
    - on_press(mode): mode is "paste" (CapsLock) or "iris" (Shift+CapsLock)
    - on_release(mode): same mode as the corresponding press
    """
    global _grabbed_device, _uinput

    device = find_keyboard()
    if not device:
        print("No keyboard found!", flush=True)
        return

    # Create virtual keyboard to forward events
    caps = device.capabilities()
    # Remove EV_SYN from capabilities (uinput adds it automatically)
    caps.pop(ecodes.EV_SYN, None)
    ui = UInput(caps, name="echo-keyboard")

    # Store globally for cleanup
    _grabbed_device = device
    _uinput = ui

    # Grab device exclusively - blocks keys from reaching other apps
    device.grab()

    # CapsLock scancode
    CAPSLOCK_SCAN = 58

    # Track modifier state
    shift_held = False
    current_mode = None  # Track mode during press-release cycle

    try:
        for event in device.read_loop():
            # Track Shift key state
            if event.type == ecodes.EV_KEY and event.code in (ecodes.KEY_LEFTSHIFT, ecodes.KEY_RIGHTSHIFT):
                if event.value == 1:
                    shift_held = True
                elif event.value == 0:
                    shift_held = False
                # Forward shift events
                try:
                    ui.write_event(event)
                    ui.syn()
                except Exception as e:
                    print(f"Forward error: {e}", flush=True)
                continue

            # Block hotkey key events
            if event.type == ecodes.EV_KEY and event.code == key_code:
                try:
                    if event.value == 1:
                        # Determine mode based on shift state at press time
                        current_mode = "iris" if shift_held else "paste"
                        on_press(current_mode)
                    elif event.value == 0:
                        # Use the mode from when we pressed
                        on_release(current_mode or "paste")
                        current_mode = None
                except Exception as e:
                    print(f"Callback error: {e}", flush=True)
                continue

            # Block hotkey scancode events
            if event.type == ecodes.EV_MSC and event.value == CAPSLOCK_SCAN:
                continue

            # Forward everything else
            try:
                ui.write_event(event)
                # Only sync for non-SYN events (SYN events sync themselves)
                if event.type != ecodes.EV_SYN:
                    ui.syn()
            except Exception as e:
                print(f"Forward error: {e}", flush=True)
    except Exception as e:
        print(f"Hotkey listener error: {e}", flush=True)
    finally:
        _cleanup()


def _make_signal_handler(original):
    """Create a signal handler that cleans up before calling original."""
    def handler(signum, frame):
        _cleanup()
        if callable(original) and original not in (signal.SIG_IGN, signal.SIG_DFL):
            original(signum, frame)
        elif original == signal.SIG_DFL:
            raise KeyboardInterrupt
    return handler


def start_hotkey_thread(key_code, on_press, on_release):
    """Start hotkey listener in background thread."""
    # Set up signal handlers for cleanup (only works in main thread)
    try:
        orig_sigterm = signal.signal(signal.SIGTERM, _make_signal_handler(signal.getsignal(signal.SIGTERM)))
        orig_sigint = signal.signal(signal.SIGINT, _make_signal_handler(signal.getsignal(signal.SIGINT)))
    except ValueError:
        pass  # Not in main thread, skip signal setup

    thread = threading.Thread(
        target=listen_hotkey,
        args=(key_code, on_press, on_release),
        daemon=True
    )
    thread.start()
    return thread
