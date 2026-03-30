# OpenCode Orchestrator

**A powerful multi-agent orchestrator for OpenCode — 12 specialized AI agents that you can invoke with @mentions.**

[![npm version](https://img.shields.io/npm/v/ocor-cli)](https://www.npmjs.com/package/ocor-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## What is OpenCode Orchestrator?

OpenCode Orchestrator replaces OpenCode's default **Build** agent with a powerful orchestrator that coordinates **13 specialized AI agents**. Instead of one generalist AI, you get a team of domain experts.

### How It Works

```
OpenCode Session
       │
       ▼
┌──────────────────┐
│  @orchestrator   │ ← Primary agent (replaces Build)
│  (you type this)│
└────────┬─────────┘
         │
         ▼ Invokes specialized agents
┌────────┬────────┬────────┬────────┬─────────┐
│frontend│backend│security│ devops │  ...    │
│  @     │  @    │   @    │   @    │   @     │
└────────┴────────┴────────┴────────┴─────────┘
```

### Why @Mentions?

| Method | Example | When to Use |
|--------|---------|-------------|
| Orchestrator | `@orchestrator build a login system` | Complex tasks - orchestrator picks agents |
| Direct | `@frontend create a navbar component` | Known domain - use specific agent |

---

## Installation

### Option 1: Single Command (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/thedileepkumar-dk/Opencode-Orchestrator/main/scripts/install.sh | bash
```

### Option 2: npm

```bash
npm install -g ocor-cli
```

---

## Quick Start

### 1. Initialize in Your Project

```bash
cd your-project
ocor init
```

This creates:
- `.opencode/agents/` — 13 agent configuration files
- `AGENTS.md` — Agent documentation

### 2. Start OpenCode

```bash
opencode
```

### 3. Use Orchestrator (Replaces Build)

Press **Tab** to cycle agents → select **Orchestrator**

```
@orchestrator help me build a user authentication system
```

### 4. Or Use Specific Agents Directly

```
@frontend create a login form with email and password
@backend create user registration API endpoint
@security audit the authentication code for vulnerabilities
@devops add Docker configuration for this app
@qa write tests for the auth module
```

---

## The 13 Agents

| Agent | Command | Expertise |
|-------|---------|-----------|
| **Orchestrator** | `@orchestrator` | Coordinates all agents (primary agent) |
| **Frontend** | `@frontend` | React, Vue, Angular, Svelte, CSS, responsive |
| **Backend** | `@backend` | APIs, databases, auth, microservices |
| **UI/UX** | `@uiux` | Design systems, accessibility, component architecture |
| **Security** | `@security` | OWASP, SAST, DAST, vulnerability scanning |
| **DevOps** | `@devops` | Docker, K8s, CI/CD, Terraform |
| **Mobile** | `@mobile` | iOS, Android, Flutter, React Native |
| **QA** | `@qa` | Unit, integration, E2E testing |
| **ML/AI** | `@ml` | PyTorch, TensorFlow, data pipelines |
| **Docs** | `@docs` | API docs, README, architecture |
| **Performance** | `@performance` | Profiling, caching, optimization |
| **Database** | `@database` | Schema, migrations, query optimization |
| **Refactor** | `@refactor` | Code smells, patterns, tech debt |

---

## Commands

| Command | Description |
|---------|-------------|
| `ocor init` | Initialize orchestrator agents in current project |
| `ocor update` | Update agents to latest version |

---

## Configuration

Agents are configured via Markdown files in `.opencode/agents/`:

```
.opencode/agents/
├── orchestrator.md   # Primary agent (replaces Build)
├── frontend.md       # @frontend
├── backend.md        # @backend
├── security.md       # @security
└── ... (10 more)
```

Each agent file defines:
- Description and color
- Mode (primary or subagent)
- Permissions (edit, bash, webfetch access)
- System prompt with domain expertise

---

## Updating

```bash
# Check for updates
ocor update --check

# Update to latest
ocor update
```

Or reinstall:

```bash
curl -fsSL https://raw.githubusercontent.com/thedileepkumar-dk/Opencode-Orchestrator/main/scripts/install.sh | bash
```

---

## Project Structure

```
opencode-orchestrator/
├── src/
│   ├── cli/                # CLI (init + update commands)
│   ├── orchestrator/       # Core orchestration engine
│   ├── agents/             # 12 specialized agent implementations
│   ├── indexer/            # Code intelligence (AST, vector, graph)
│   ├── memory/             # Context and session management
│   ├── protocol/           # Types, config, MCP client
│   └── utils/             # Logger, process, git utilities
├── scripts/
│   └── install.sh         # Single-command installer
├── AGENTS.md              # Project agent documentation
├── README.md              # This file
└── package.json           # npm package
```

---

## Examples

### Build a Full Feature

```
@orchestrator build a complete user management system with registration, login, and profile pages
```

The orchestrator will:
1. Invoke @backend for API endpoints
2. Invoke @frontend for UI components
3. Invoke @database for schema
4. Invoke @qa for tests
5. Compose all results

### Security Audit

```
@security audit this codebase for XSS and SQL injection vulnerabilities
```

### Performance Optimization

```
@performance optimize the dashboard page for faster load times
```

### Add Infrastructure

```
@devops add Kubernetes deployment manifests with auto-scaling
```

---

## License

[MIT](LICENSE)
