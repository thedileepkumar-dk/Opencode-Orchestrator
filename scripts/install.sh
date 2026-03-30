#!/usr/bin/env bash
set -euo pipefail

# OpenCode Orchestrator — Single-Command Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/opencode-orchestrator/opencode-orchestrator/main/scripts/install.sh | bash

REPO="opencode-orchestrator/opencode-orchestrator"
INSTALL_DIR="${OPENCODE_ORCHESTRATOR_DIR:-$HOME/.opencode-orchestrator}"
BIN_DIR="$INSTALL_DIR/bin"
VERSION="latest"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info() { echo -e "${CYAN}${NC} $*"; }
success() { echo -e "${GREEN}${NC} $*"; }
warn() { echo -e "${YELLOW}${NC} $*"; }
error() { echo -e "${RED}${NC} $*" >&2; exit 1; }

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

# Install from npm (primary method)
install_npm() {
  info "Installing opencode-orchestrator via npm..."
  npm install -g opencode-orchestrator@latest 2>/dev/null && return 0
  return 1
}

# Install from source (fallback)
install_source() {
  info "Installing from source..."

  if [ -d "$INSTALL_DIR" ]; then
    info "Updating existing installation..."
    cd "$INSTALL_DIR" && git pull --quiet 2>/dev/null || true
  else
    info "Cloning repository..."
    git clone --quiet "https://github.com/${REPO}.git" "$INSTALL_DIR" 2>/dev/null || {
      # Fallback: create local installation
      mkdir -p "$INSTALL_DIR"
      create_local_install
      return
    }
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

  # Create a wrapper script that works with npx
  cat > "$BIN_DIR/opencode-orchestrator" << 'WRAPPER'
#!/usr/bin/env bash
# OpenCode Orchestrator wrapper
# Runs the orchestrator from any directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCH_DIR="$(dirname "$SCRIPT_DIR")"

# If installed via npm, use that
if command -v npx &>/dev/null && npx --no-install opencode-orchestrator --version &>/dev/null 2>&1; then
  exec npx --no-install opencode-orchestrator "$@"
fi

# Otherwise use local install
if [ -f "$ORCH_DIR/dist/cli/index.js" ]; then
  exec node "$ORCH_DIR/dist/cli/index.js" "$@"
elif [ -f "$ORCH_DIR/src/cli/index.ts" ]; then
  exec npx tsx "$ORCH_DIR/src/cli/index.ts" "$@"
else
  echo "Error: OpenCode Orchestrator not properly installed."
  echo "Try: npm install -g opencode-orchestrator"
  exit 1
fi
WRAPPER

  chmod +x "$BIN_DIR/opencode-orchestrator"

  # Create alias
  ln -sf "$BIN_DIR/opencode-orchestrator" "$BIN_DIR/ocor" 2>/dev/null || true

  success "Created wrapper at $BIN_DIR/opencode-orchestrator"
}

# Setup shell PATH
setup_path() {
  info "Configuring PATH..."

  # Determine shell config file
  SHELL_CONFIG=""
  if [ -n "${BASH_VERSION:-}" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
  elif [ -n "${ZSH_VERSION:-}" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
  elif [ -f "$HOME/.zshrc" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
  elif [ -f "$HOME/.bashrc" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
  elif [ -f "$HOME/.profile" ]; then
    SHELL_CONFIG="$HOME/.profile"
  fi

  # Add to PATH if not already there
  PATH_LINE="export PATH=\"\$PATH:$BIN_DIR\""

  if [ -n "$SHELL_CONFIG" ] && [ -f "$SHELL_CONFIG" ]; then
    if ! grep -q "$BIN_DIR" "$SHELL_CONFIG" 2>/dev/null; then
      echo "" >> "$SHELL_CONFIG"
      echo "# OpenCode Orchestrator" >> "$SHELL_CONFIG"
      echo "$PATH_LINE" >> "$SHELL_CONFIG"
      success "Added to PATH in $SHELL_CONFIG"
      warn "Run: source $SHELL_CONFIG  (or open a new terminal)"
    else
      success "Already in PATH"
    fi
  else
    warn "Add this to your shell config:"
    echo "  $PATH_LINE"
  fi

  # Also add to current session
  export PATH="$PATH:$BIN_DIR"
}

# Initialize in current directory
init_project() {
  if [ -f ".opencode-orchestrator.json" ]; then
    info "Project already initialized"
    return
  fi

  info "Initializing in current directory..."
  if command -v opencode-orchestrator &>/dev/null; then
    opencode-orchestrator init 2>/dev/null || true
  elif [ -f "$BIN_DIR/opencode-orchestrator" ]; then
    "$BIN_DIR/opencode-orchestrator" init 2>/dev/null || true
  fi
}

# Main installation flow
main() {
  check_prereqs
  echo

  # Try npm first, fall back to source
  if install_npm; then
    success "Installed via npm"
  else
    warn "npm install failed, trying source..."
    install_source
  fi

  echo
  setup_path
  echo

  # Verify installation
  if command -v opencode-orchestrator &>/dev/null; then
    success "OpenCode Orchestrator installed successfully!"
    echo
    info "Quick start:"
    echo -e "  ${BOLD}opencode-orchestrator init${NC}           Initialize in current project"
    echo -e "  ${BOLD}opencode-orchestrator run \"task\"${NC}     Run a task with agents"
    echo -e "  ${BOLD}opencode-orchestrator agents${NC}         List available agents"
    echo -e "  ${BOLD}opencode-orchestrator review${NC}         Run multi-agent review"
    echo -e "  ${BOLD}opencode-orchestrator status${NC}         Show system status"
    echo
    info "Aliases: ${BOLD}ocor${NC} (short for opencode-orchestrator)"
    echo
  elif [ -f "$BIN_DIR/opencode-orchestrator" ]; then
    success "Installed to $BIN_DIR/opencode-orchestrator"
    echo
    info "Run: $BIN_DIR/opencode-orchestrator init"
    echo
  else
    error "Installation failed. Try manually: npm install -g opencode-orchestrator"
  fi
}

main "$@"
