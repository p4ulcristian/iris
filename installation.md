# Installation

## Quick Start (App Only)

Run the Electron app to spawn and manage gods.

### Requirements

```bash
sudo pacman -S bun
```

### Claude CLI

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

### Setup

```bash
git clone https://github.com/p4ulcristian/iris.git ~/Work/iris
cd ~/Work/iris
bun run install:app
```

### Run

```bash
bun run dev
```

---

## Full Installation (Voice)

Complete setup with speech-to-text, text-to-speech, and push-to-talk.

### Requirements

```bash
sudo pacman -S bun uv wtype gtk4-layer-shell
```

| Package | Purpose |
|---------|---------|
| `bun` | JS package manager / runtime |
| `uv` | Python package manager |
| `wtype` | Wayland keyboard input (PTT) |
| `gtk4-layer-shell` | Speech bubble overlay |

### Claude CLI

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

### GPU (Optional)

For faster TTS/STT:

```bash
sudo pacman -S cuda cudnn
```

### Input Group

CapsLock detection needs `/dev/input/` access:

```bash
sudo usermod -aG input $USER
```

**Log out and back in** for this to take effect.

### Audio Device

Edit `config/settings.json`:

```json
{
  "audio": {
    "input_device": "Your Microphone Name"
  }
}
```

Find your device:

```bash
python -c "import sounddevice; print(sounddevice.query_devices())"
```

### First Run

```bash
bun run dev
```

Services can be started from the status bar (click the service icons).

### Verify Services

When running, you should see in the status bar:
- `speak` (port 8765) - green when running
- `hear` (port 8766) - green when running
- `express` (port 8767) - green when running
- `wake` - green when running

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+N` | Summon new god |
| `Ctrl+K` | Banish focused god |
| `Ctrl+R` | Spawn raw terminal |
| `Ctrl+F` | Toggle fullscreen |
| `Ctrl+L` | Rotate grid layout |
| `Ctrl+D` | Toggle dev panel |
| `Alt+N` | New tab |
| `Alt+K` | Close tab |
| `Alt+,/.` | Previous/next tab |
| `Alt+1-9` | Go to tab N |

---

## Troubleshooting

### "Not in input group"

```bash
sudo usermod -aG input $USER
# Log out and back in
```

### Services won't start

Click the service icon in the status bar to start it. Check terminal for errors.

### No audio input

1. Check device name in `config/settings.json`
2. Run `python -c "import sounddevice; print(sounddevice.query_devices())"`

### CUDA errors

```bash
python -c "import torch; print(torch.cuda.is_available())"
```

### Gods don't persist after restart

Gods use Zellij sessions which persist across app restarts. Check `zellij list-sessions | grep iris-` to see active sessions.

---

## Uninstall

```bash
# Kill any running gods
rm -rf ~/.local/share/iris/sockets/*.sock

# Remove the project
rm -rf ~/Work/iris
```
