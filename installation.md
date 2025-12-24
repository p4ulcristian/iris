# Installation

## CLI Only (Minimal)

Just the tmux orchestration - spawn and manage gods without voice.

### Requirements

```bash
sudo pacman -S uv tmux
```

### Claude CLI

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

### Setup

```bash
git clone https://github.com/yourusername/iris.git ~/Work/iris

# Add to PATH
mkdir -p ~/.local/bin
ln -s ~/Work/iris/iris ~/.local/bin/iris
```

### Usage

```bash
# Start tmux session (no servers)
iris --no-servers

# Spawn a god
iris spawn "fix the login bug"

# List gods
iris list

# Kill a god
iris kill apollo
```

---

## Full Installation (Voice)

Complete setup with speech-to-text, text-to-speech, and push-to-talk.

### Requirements

```bash
sudo pacman -S uv tmux wtype gtk4-layer-shell
```

| Package | Purpose |
|---------|---------|
| `uv` | Python package manager |
| `tmux` | Session management |
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

### Setup

```bash
git clone https://github.com/yourusername/iris.git ~/Work/iris

# Add to PATH
mkdir -p ~/.local/bin
ln -s ~/Work/iris/iris ~/.local/bin/iris
```

### Input Group

CapsLock detection needs `/dev/input/` access:

```bash
sudo usermod -aG input $USER
```

**Log out and back in** for this to take effect.

### Audio Device

Edit `config/settings.yaml`:

```yaml
audio:
  input_device: "Your Microphone Name"
```

Find your device:

```bash
python -c "import sounddevice; print(sounddevice.query_devices())"
```

### First Run

```bash
iris
```

This starts all servers and the tmux session.

### Verify

```bash
iris status
```

You should see:
- `speak` on port 8765
- `hear` on port 8766
- `express` on port 8767
- `wake` running

---

## CLI Commands

### Session

| Command | Description |
|---------|-------------|
| `iris` | Start Iris (servers + tmux) |
| `iris --no-servers` | Start tmux only |
| `iris stop` | Stop servers |
| `iris stop all` | Stop everything |
| `iris status` | Show server status |
| `iris logs` | Tail server logs |

### Gods

| Command | Description |
|---------|-------------|
| `iris spawn "<task>"` | Summon a god |
| `iris spawn --god zeus "<task>"` | Summon specific god |
| `iris spawn --project ir "<task>"` | God with project context |
| `iris list` | List active gods |
| `iris peek <name>` | View god's output |
| `iris send <name> "<msg>"` | Message a god |
| `iris kill <name>` | Banish a god |
| `iris kill all` | Banish all gods |

### Hotkeys (inside tmux)

| Key | Action |
|-----|--------|
| `Ctrl+n` | Summon new god |
| `Ctrl+k` | Kill current pane |
| `Ctrl+t` | Change theme |
| `Ctrl+h` | Show hotkeys |
| `Alt+l` | List gods |
| `Alt+k` | Banish by name |

---

## Troubleshooting

### "Not in input group"

```bash
sudo usermod -aG input $USER
# Log out and back in
```

### Servers won't start

```bash
iris logs
# Or specific server:
tail -f ~/.local/state/iris/logs/speak.log
```

### No audio input

1. Check device name in `config/settings.yaml`
2. Run `python -c "import sounddevice; print(sounddevice.query_devices())"`

### CUDA errors

```bash
python -c "import torch; print(torch.cuda.is_available())"
```

---

## Uninstall

```bash
iris stop all
rm ~/.local/bin/iris
rm -rf ~/Work/iris
```
