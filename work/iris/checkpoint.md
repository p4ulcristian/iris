# Iris Checkpoint

## Status: Waiting for logout/login

Paul is in `input` group, but current session doesn't have it. **Need to logout and login!**

## What we did

1. Created Iris PTT app in `~/Work/iris`
2. STT model: NVIDIA Parakeet TDT 0.6B v2 (working!)
3. Switched from keyd to **evdev** for true push-to-talk (press/release)
4. Added `iris/hotkey.py` - evdev listener for CapsLock
5. Added flush=True to all prints for real-time logging

## Confirmed working

- User `paul` is in `input` group (verified with `id paul`)
- STT model loads and runs correctly
- Daemon starts and shows "Hold CapsLock to record..."

## What's left

1. **Logout/login** (or reboot) to apply `input` group to session
2. Test:
   ```bash
   cd ~/Work/iris
   ./iris.sh
   ```
3. Hold CapsLock and speak - should transcribe and paste

## Files

- `~/Work/iris/` - main project
- `iris/daemon.py` - evdev PTT daemon
- `iris/hotkey.py` - evdev keyboard listener
- `iris/stt.py` - Parakeet STT wrapper
- `iris/audio.py` - PipeWire audio recorder
- `iris/output.py` - wtype/wl-clipboard paster

## Notes

- keyd not needed anymore
- Daemon shows "No keyboard found!" until you re-login
