#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; exit 1; }

# Banner
echo -e "${CYAN}"
echo "  ╦┬─┐┬┌─┐"
echo "  ║├┬┘│└─┐"
echo "  ╩┴└─┴└─┘"
echo -e "${NC}"
echo "Voice assistant for summoning the Greek pantheon"
echo ""

# Detect OS
detect_os() {
  case "$(uname -s)" in
    Linux*)  OS=linux ;;
    Darwin*) OS=macos ;;
    *)       error "Unsupported OS: $(uname -s)" ;;
  esac
  info "Detected OS: $OS"
}

# Detect package manager
detect_package_manager() {
  if [[ "$OS" == "macos" ]]; then
    if ! command -v brew &>/dev/null; then
      error "Homebrew not found. Install from https://brew.sh"
    fi
    PM=brew
  elif command -v pacman &>/dev/null; then
    PM=pacman
  elif command -v apt &>/dev/null; then
    PM=apt
  else
    error "No supported package manager found (pacman, apt, or brew)"
  fi
  info "Using package manager: $PM"
}

# Install system packages
install_system_packages() {
  info "Installing system dependencies..."

  case "$PM" in
    pacman)
      sudo pacman -S --needed --noconfirm dtach wtype
      ;;
    apt)
      sudo apt update
      sudo apt install -y dtach
      if ! command -v wtype &>/dev/null; then
        warn "wtype not available via apt. Install manually for Wayland support."
      fi
      ;;
    brew)
      brew install dtach
      ;;
  esac

  success "System packages installed"
}

# Install bun
install_bun() {
  if command -v bun &>/dev/null; then
    success "bun already installed: $(bun --version)"
  else
    info "Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    success "bun installed"
  fi
}

# Install Claude CLI
install_claude() {
  if command -v claude &>/dev/null; then
    success "claude already installed"
  else
    info "Installing Claude Code CLI..."
    bun install -g @anthropic-ai/claude-code
    success "Claude Code CLI installed"
  fi
}

# Create directories
create_directories() {
  info "Creating directories..."
  mkdir -p ~/.local/share/iris/sockets
  success "Created ~/.local/share/iris/sockets"
}

# Install Node dependencies
install_node_deps() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  info "Installing Node dependencies..."
  cd "$SCRIPT_DIR/app"
  bun install
  cd "$SCRIPT_DIR"
  success "Node dependencies installed"
}

# Main
main() {
  detect_os
  detect_package_manager
  install_system_packages
  install_bun
  install_claude
  create_directories
  install_node_deps

  echo ""
  echo -e "${GREEN}Installation complete!${NC}"
  echo ""
  echo "To run Iris:"
  echo -e "  ${CYAN}cd app && bun run dev${NC}"
  echo ""
}

main "$@"
