#!/bin/bash
# Download vendored binaries for all platforms
# Run this before creating a release

set -e
cd "$(dirname "$0")"

FZF_VERSION="0.56.0"
GLOW_VERSION="2.0.0"

mkdir -p bin

echo "Downloading fzf v${FZF_VERSION}..."

# fzf - note: fzf uses different naming convention
curl -sL "https://github.com/junegunn/fzf/releases/download/v${FZF_VERSION}/fzf-${FZF_VERSION}-linux_amd64.tar.gz" | tar xz -C bin
mv bin/fzf bin/fzf-linux-amd64

curl -sL "https://github.com/junegunn/fzf/releases/download/v${FZF_VERSION}/fzf-${FZF_VERSION}-linux_arm64.tar.gz" | tar xz -C bin
mv bin/fzf bin/fzf-linux-arm64

curl -sL "https://github.com/junegunn/fzf/releases/download/v${FZF_VERSION}/fzf-${FZF_VERSION}-darwin_amd64.tar.gz" | tar xz -C bin
mv bin/fzf bin/fzf-darwin-amd64

curl -sL "https://github.com/junegunn/fzf/releases/download/v${FZF_VERSION}/fzf-${FZF_VERSION}-darwin_arm64.tar.gz" | tar xz -C bin
mv bin/fzf bin/fzf-darwin-arm64

echo "Downloading glow v${GLOW_VERSION}..."

# glow - extracts to subdirectory, so we extract then move the binary
curl -sL "https://github.com/charmbracelet/glow/releases/download/v${GLOW_VERSION}/glow_${GLOW_VERSION}_Linux_x86_64.tar.gz" | tar xz
mv "glow_${GLOW_VERSION}_Linux_x86_64/glow" bin/glow-linux-amd64
rm -rf "glow_${GLOW_VERSION}_Linux_x86_64"

curl -sL "https://github.com/charmbracelet/glow/releases/download/v${GLOW_VERSION}/glow_${GLOW_VERSION}_Linux_arm64.tar.gz" | tar xz
mv "glow_${GLOW_VERSION}_Linux_arm64/glow" bin/glow-linux-arm64
rm -rf "glow_${GLOW_VERSION}_Linux_arm64"

curl -sL "https://github.com/charmbracelet/glow/releases/download/v${GLOW_VERSION}/glow_${GLOW_VERSION}_Darwin_x86_64.tar.gz" | tar xz
mv "glow_${GLOW_VERSION}_Darwin_x86_64/glow" bin/glow-darwin-amd64
rm -rf "glow_${GLOW_VERSION}_Darwin_x86_64"

curl -sL "https://github.com/charmbracelet/glow/releases/download/v${GLOW_VERSION}/glow_${GLOW_VERSION}_Darwin_arm64.tar.gz" | tar xz
mv "glow_${GLOW_VERSION}_Darwin_arm64/glow" bin/glow-darwin-arm64
rm -rf "glow_${GLOW_VERSION}_Darwin_arm64"

# Make all binaries executable
chmod +x bin/*

echo "Done! Binaries downloaded to vendor/bin/"
ls -la bin/
