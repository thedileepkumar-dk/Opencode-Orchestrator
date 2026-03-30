#!/usr/bin/env bash
set -euo pipefail

# OpenCode Orchestrator — Single-Command Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/thedileepkumar-dk/Opencode-Orchestrator/main/scripts/install.sh | bash

REPO="thedileepkumar-dk/Opencode-Orchestrator"
INSTALL_DIR="${OPENCODE_ORCHESTRATOR_DIR:-$HOME/.opencode-orchestrator}"
BIN_DIR="$INSTALL_DIR/bin"
VERSION="latest"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info() { echo -e "${CYAN} $*${NC}"; }
success() { echo -e "${GREEN} $*${NC}"; }
warn() { echo -e "${YELLOW}  $*${NC}"; }
error() { echo -e "${RED} $*${NC}" >&2; exit 1; }

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  OpenCode Orchestrator Installer                        ║"
echo "║  Multi-Agent AI Coding System — 12+ Specialized Agents  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
check_prereqs() {
  info "Checking prerequisites..."

  if ! command -v node &>/dev/null; then
    error "Node.js is required (>= 18.0.0). Install from https://nodejs.org"
  fi

  NODE_VERSION=$(node -e "console.log(process.versions.node.split('.')[0])")
  if [ "$NODE_VERSION" -lt 18 ]; then
    error "Node.js >= 18 required (found $(node -v))"
  fi
  success "Node.js $(node -v)"

  if ! command -v npm &>/dev/null && ! command -v npx &>/dev/null; then
    error "npm or npx is required"
  fi
  success "npm $(npm -v)"

  if ! command -v git &>/dev/null; then
    warn "Git not found — some features will be limited"
  else
    success "Git $(git --version | head -1)"
  fi
}

# Get npm global bin directory
get_npm_global_bin() {
  npm config get prefix 2>/dev/null && echo "/bin" || echo ""
}

# Install from npm (primary method)
install_npm() {
  info "Installing ocor-cli (OpenCode Orchestrator) via npm..."
  if npm install -g ocor-cli@latest 2>/dev/null; then
    return 0
  fi
  return 1
}

# Install from source (fallback)
install_source() {
  info "Installing from source..."

  if [ -d "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR/.git" ]; then
    info "Updating existing installation..."
    cd "$INSTALL_DIR" && git pull --quiet 2>/dev/null || true
  else
    rm -rf "$INSTALL_DIR" 2>/dev/null || true
    info "Cloning repository..."
    if git clone --quiet "https://github.com/${REPO}.git" "$INSTALL_DIR" 2>/dev/null; then
      true
    else
      mkdir -p "$INSTALL_DIR"
      create_local_install
      return
    fi
  fi

  cd "$INSTALL_DIR"
  info "Installing dependencies..."
  npm install --quiet 2>/dev/null || npm install
  info "Building..."
  npm run build 2>/dev/null || npx tsc 2>/dev/null || true

  # Link globally
  npm link --force 2>/dev/null || true
}

# Create a minimal local installation
create_local_install() {
  info "Creating local installation..."

  mkdir -p "$BIN_DIR"

  cat > "$BIN_DIR/opencode-orchestrator" << 'WRAPPER'
#!/usr/bin/env bash
# OpenCode Orchestrator wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCH_DIR="$(dirname "$SCRIPT_DIR")"

# Try npm global first
if command -v npx &>/dev/null && npx --no-install opencode-orchestrator --version &>/dev/null 2>&1; then
  exec npx --no-install opencode-orchestrator "$@"
fi

# Local install
if [ -f "$ORCH_DIR/dist/cli/index.js" ]; then
  exec node "$ORCH_DIR/dist/cli/index.js" "$@"
elif [ -f "$ORCH_DIR/src/cli/index.ts" ]; then
  exec npx tsx "$ORCH_DIR/src/cli/index.ts" "$@"
else
  echo "Error: OpenCode Orchestrator not properly installed."
  echo "Try: npm install -g ocor-cli"
  exit 1
fi
WRAPPER

  chmod +x "$BIN_DIR/opencode-orchestrator"
  ln -sf "$BIN_DIR/opencode-orchestrator" "$BIN_DIR/ocor" 2>/dev/null || true

  success "Created wrapper at $BIN_DIR/opencode-orchestrator"
}

# Setup shell PATH
setup_path() {
  info "Configuring PATH..."

  # Find npm global bin
  NPM_GLOBAL_BIN="$(npm config get prefix 2>/dev/null)/bin"

  # Determine shell config file
  SHELL_CONFIG=""
  if [ -n "${ZSH_VERSION:-}" ] || [ -f "$HOME/.zshrc" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
  elif [ -n "${BASH_VERSION:-}" ] || [ -f "$HOME/.bashrc" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
  elif [ -f "$HOME/.profile" ]; then
    SHELL_CONFIG="$HOME/.profile"
  fi

  # Check if npm global bin is already in PATH
  if echo "$PATH" | grep -q "$NPM_GLOBAL_BIN" 2>/dev/null; then
    success "npm global bin already in PATH"
    return
  fi

  # Add npm global bin to PATH
  if [ -n "$SHELL_CONFIG" ] && [ -f "$SHELL_CONFIG" ]; then
    if ! grep -q "$NPM_GLOBAL_BIN" "$SHELL_CONFIG" 2>/dev/null; then
      echo "" >> "$SHELL_CONFIG"
      echo "# OpenCode Orchestrator" >> "$SHELL_CONFIG"
      echo "export PATH=\"\$PATH:$NPM_GLOBAL_BIN\"" >> "$SHELL_CONFIG"
      success "Added to PATH in $SHELL_CONFIG"
      warn "Run: source $SHELL_CONFIG  (or open a new terminal)"
    else
      success "Already in PATH config"
    fi
  else
    warn "Add this to your shell config:"
    echo "  export PATH=\"\$PATH:$NPM_GLOBAL_BIN\""
  fi

  # Also add to current session
  export PATH="$PATH:$NPM_GLOBAL_BIN"
}

# Verify installation works
verify_install() {
  # Try command directly
  if command -v opencode-orchestrator &>/dev/null; then
    opencode-orchestrator --version &>/dev/null && return 0
  fi

  # Try via npm global bin
  NPM_BIN="$(npm config get prefix 2>/dev/null)/bin"
  if [ -f "$NPM_BIN/opencode-orchestrator" ]; then
    "$NPM_BIN/opencode-orchestrator" --version &>/dev/null && return 0
  fi

  # Try via npx
  if npx --no-install opencode-orchestrator --version &>/dev/null 2>&1; then
    return 0
  fi

  return 1
}

# Main installation flow
main() {
  check_prereqs
  echo

  INSTALLED=false

  # Try npm first
  if install_npm; then
    success "Installed via npm"
    INSTALLED=true
  else
    warn "npm install failed, trying source..."
    install_source
    INSTALLED=true
  fi

  echo
  setup_path
  echo

  # Verify
  if [ "$INSTALLED" = true ]; then
    if verify_install; then
      success "OpenCode Orchestrator installed successfully!"
      echo
      info "Quick start:"
      echo -e "  ${BOLD}opencode-orchestrator init${NC}           Initialize in current project"
      echo -e "  ${BOLD}opencode-orchestrator run \"task\"${NC}     Run a task with agents"
      echo -e "  ${BOLD}opencode-orchestrator agents${NC}         List available agents"
      echo -e "  ${BOLD}opencode-orchestrator review${NC}         Run multi-agent review"
      echo -e "  ${BOLD}opencode-orchestrator status${NC}         Show system status"
      echo -e "  ${BOLD}opencode-orchestrator update${NC}         Update to latest version"
      echo
      info "Aliases: ${BOLD}ocor${NC} (short for opencode-orchestrator)"
      echo
    else
      # npm installed but not in PATH yet
      success "Installed successfully via npm!"
      echo
      warn "The command is not available in your current shell session."
      warn "Run this to activate it:"
      echo
      NPM_BIN="$(npm config get prefix 2>/dev/null)/bin"
      echo -e "  ${BOLD}source ~/.zshrc${NC}   (or open a new terminal)"
      echo
      info "Quick start (after reloading shell):"
      echo -e "  ${BOLD}opencode-orchestrator init${NC}"
      echo -e "  ${BOLD}opencode-orchestrator run \"your task\"${NC}"
      echo
      info "Or run directly:"
      echo -e "  ${BOLD}$NPM_BIN/opencode-orchestrator --version${NC}"
      echo
    fi
  fi
}

main "$@"
