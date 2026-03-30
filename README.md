# OpenCode Orchestrator

**A powerful multi-agent orchestrator for OpenCode — 12+ specialized AI agents that collaborate to build, review, and ship code faster than ever.**

[![npm version](https://img.shields.io/npm/v/opencode-orchestrator)](https://www.npmjs.com/package/opencode-orchestrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178C6)](https://www.typescriptlang.org/)

---

## What is OpenCode Orchestrator?

OpenCode Orchestrator is a **multi-agent AI coding system** that extends [OpenCode](https://github.com/anomalyco/opencode) with a team of 12+ specialized domain experts. Instead of one generalist AI agent, you get a coordinated crew where each agent is an expert in its field — a frontend agent handles React components, a security agent audits for vulnerabilities, a DevOps agent writes your Dockerfile — and they all work **in parallel**.

### Why not just use a single agent?

| Problem | Single Agent | OpenCode Orchestrator |
|---------|-------------|----------------------|
| Complex features | One agent tries to do everything | 6 agents work in parallel on their specialty |
| Code review | Surface-level review | 5 agents review from security, performance, test, docs, and code quality angles |
| Framework knowledge | Jack of all trades | Deep expertise per domain (React, K8s, PostgreSQL, etc.) |
| Large refactors | Context overload, missed files | AST-aware indexing + dependency graph + conflict resolution |
| Self-healing | Gives you broken code, hopes for the best | Auto-runs tests, detects failures, routes fixes to the right agent |

---

## Architecture

```
                         ┌─────────────────────────────────┐
                         │        ORCHESTRATOR CORE        │
                         │  Task Decomposer → Agent Router │
                         │  Message Bus → Conflict Resolver│
                         │  Self-Healing → Result Composer │
                         └──────────┬──────────────────────┘
                                    │
          ┌─────────────┬───────────┼───────────┬─────────────┐
          │             │           │           │             │
    ┌─────┴─────┐ ┌─────┴─────┐ ┌──┴──┐ ┌─────┴─────┐ ┌────┴────┐
    │ FRONTEND  │ │ BACKEND   │ │ ... │ │ SECURITY  │ │ DEVOPS  │
    │ React     │ │ APIs      │ │     │ │ OWASP     │ │ Docker  │
    │ Vue       │ │ Auth      │ │     │ │ SAST      │ │ K8s     │
    │ Angular   │ │ DB        │ │     │ │ CVE Scan  │ │ CI/CD   │
    └───────────┘ └───────────┘ └─────┘ └───────────┘ └─────────┘
          │             │           │           │             │
          └─────────────┴───────────┼───────────┴─────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
             ┌──────┴──────┐ ┌─────┴─────┐ ┌───────┴──────┐
             │ HYBRID      │ │ MEMORY    │ │ GIT          │
             │ INDEXER     │ │ STORE     │ │ INTEGRATION  │
             │ AST+Vector  │ │ Session+  │ │ Worktrees+   │
             │ +Graph      │ │ Persistent│ │ Branches     │
             └─────────────┘ └───────────┘ └──────────────┘
```

---

## Installation

### Option 1: Single Command (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/thedileepkumar-dk/Opencode-Orchestrator/main/scripts/install.sh | bash
```

### Option 2: npm

```bash
npm install -g opencode-orchestrator
```

### Option 3: From Source

```bash
git clone https://github.com/thedileepkumar-dk/Opencode-Orchestrator.git
cd Opencode-Orchestrator
npm install
npm run build
npm link
```

### Verify Installation

```bash
opencode-orchestrator --version
# or use the short alias:
ocor --version
```

---

## Quick Start

### 1. Initialize in Your Project

```bash
cd your-project
opencode-orchestrator init
```

This creates:
- `.opencode-orchestrator.json` — Configuration file
- `AGENTS.md` — Agent definitions for your project

### 2. Run Your First Task

```bash
# Let the orchestrator pick the right agents automatically
opencode-orchestrator run "Add user authentication with JWT tokens and refresh flow"

# Or use the short alias:
ocor run "Build a REST API for user management with pagination and filtering"
```

### 3. Review Your Code

```bash
# 5 specialized agents review your code in parallel
opencode-orchestrator review

# Review only staged changes
opencode-orchestrator review --staged
```

---

## All Commands

| Command | Description | Example |
|---------|-------------|---------|
| `ocor run <task>` | Run a task through the orchestrator | `ocor run "Add dark mode toggle"` |
| `ocor agents` | List all available agents and their capabilities | `ocor agents --domain security` |
| `ocor index` | Index project for code intelligence | `ocor index ./my-app --watch --stats` |
| `ocor review` | Multi-agent parallel code review | `ocor review --staged` |
| `ocor dashboard` | Launch real-time web monitoring dashboard | `ocor dashboard -p 3847` |
| `ocor init` | Initialize orchestrator in current project | `ocor init` |
| `ocor config` | Manage configuration | `ocor config --show` |
| `ocor status` | Show system and agent status | `ocor status` |
| `ocor update` | Update to the latest version | `ocor update` |

### Command Options

#### `ocor run <task>`

| Option | Description | Default |
|--------|-------------|---------|
| `-m, --mode <mode>` | Orchestration mode | `auto` |
| `-a, --agent <agent>` | Specific agent (specialist mode) | — |
| `-p, --project <path>` | Project directory | `.` |
| `--no-heal` | Disable self-healing | — |
| `--parallel <n>` | Max parallel agents | `4` |
| `--model <model>` | Override model for all agents | — |
| `--verbose` | Verbose output | — |

#### `ocor agents`

| Option | Description |
|--------|-------------|
| `-d, --domain <domain>` | Filter by domain (frontend, backend, security, etc.) |
| `--json` | Output as JSON |

#### `ocor index [path]`

| Option | Description |
|--------|-------------|
| `--watch` | Watch for changes and re-index |
| `--stats` | Show index statistics |

#### `ocor review`

| Option | Description |
|--------|-------------|
| `-p, --path <path>` | Project path |
| `--staged` | Review staged changes only |
| `--branch <branch>` | Compare against branch |

---

## Orchestration Modes

OpenCode Orchestrator supports 5 orchestration modes, each designed for different workflows:

### Auto-Pilot (Default)

```bash
ocor run "Implement shopping cart with add/remove/update and checkout flow"
```

The orchestrator automatically decomposes your task, selects the best agents, and executes in parallel. You get the result.

**Best for:** Feature development, bug fixes, general tasks.

### Supervised

```bash
ocor run "Migrate from REST to GraphQL" --mode supervised
```

The orchestrator proposes a plan with agent assignments. You review and approve before execution. Checkpoints let you review progress.

**Best for:** High-risk changes, migrations, unfamiliar codebases.

### Specialist

```bash
ocor run "Find and fix all XSS vulnerabilities" --agent security
ocor run "Optimize database queries for dashboard" --agent database
ocor run "Add comprehensive test coverage for auth module" --agent qa
```

A single domain expert handles the task with deep expertise.

**Best for:** Domain-specific work, focused improvements.

### Swarm

```bash
ocor run "Refactor entire payment module for new provider" --mode swarm
```

The orchestrator spawns 5-10 micro-agents, each tackling a small piece. Results are composed into a cohesive output.

**Best for:** Large refactors, multi-file changes, parallelizable work.

### Review Crew

```bash
ocor review
ocor review --staged
ocor review --branch main
```

5 agents review your code simultaneously:
- **Security Agent** — Vulnerabilities, OWASP, secrets
- **Performance Agent** — Bottlenecks, N+1 queries, caching
- **QA Agent** — Test coverage, edge cases, flaky tests
- **Docs Agent** — Missing documentation, outdated comments
- **Refactor Agent** — Code smells, patterns, tech debt

**Best for:** Pre-merge reviews, code quality audits.

---

## The 12 Specialized Agents

### Frontend Agent
- **Expertise:** React, Vue, Angular, Svelte, Next.js, Nuxt, Tailwind CSS, CSS-in-JS
- **Capabilities:** Component generation, state management, responsive design, accessibility (WCAG), SSR/SSG, animation, routing
- **Model Tier:** Mid (fast iteration)

### Backend Agent
- **Expertise:** Node.js, Python, Go, Java, REST, GraphQL, gRPC, microservices
- **Capabilities:** API design, schema design, middleware, caching, queue processing, auth flows, data validation
- **Model Tier:** High (complex reasoning)

### UI/UX Agent
- **Expertise:** Design systems, Figma-to-code, Storybook, component libraries, WCAG 2.1
- **Capabilities:** Design tokens, component API design, accessibility audit, interaction design, responsive layouts
- **Model Tier:** Mid

### Security Agent
- **Expertise:** OWASP Top 10, SAST, DAST, dependency audit, secret scanning, threat modeling
- **Capabilities:** Vulnerability scanning, security review, CVE checking, secret detection, hardening, container security, auth review
- **Model Tier:** High (precision critical)

### DevOps Agent
- **Expertise:** Docker, Kubernetes, Terraform, Pulumi, GitHub Actions, GitLab CI, AWS/GCP/Azure
- **Capabilities:** Pipeline generation, IaC, containerization, K8s manifests, monitoring, deployment, cost optimization
- **Model Tier:** Mid

### Mobile Agent
- **Expertise:** Swift, Kotlin, Flutter, Dart, React Native, Expo
- **Capabilities:** Cross-platform, native modules, app store compliance, push notifications, offline sync, deep linking, biometric auth
- **Model Tier:** Mid

### QA/Test Agent
- **Expertise:** Jest, Vitest, Playwright, Cypress, pytest, Go testing, mutation testing
- **Capabilities:** Test generation, coverage analysis, flaky test detection, E2E testing, API testing, visual regression, test strategy
- **Model Tier:** Low (volume tasks)

### ML/AI Agent
- **Expertise:** PyTorch, TensorFlow, scikit-learn, pandas, Hugging Face, LangChain
- **Capabilities:** Model design, data preprocessing, experiment tracking, model serving, LLM integration, MLOps, evaluation
- **Model Tier:** High

### Documentation Agent
- **Expertise:** API docs, architecture docs, Mermaid diagrams, OpenAPI/Swagger, changelogs
- **Capabilities:** Doc generation, docstring enforcement, diagram generation, changelog management, migration guides
- **Model Tier:** Low

### Performance Agent
- **Expertise:** Profiling, Core Web Vitals, caching, CDN, database optimization, load testing
- **Capabilities:** Benchmarking, bottleneck detection, query optimization, bundle analysis, memory optimization, CDN setup
- **Model Tier:** Mid

### Database Agent
- **Expertise:** PostgreSQL, MySQL, MongoDB, Redis, DynamoDB, schema design, migrations
- **Capabilities:** ERD generation, index optimization, migration planning, data modeling, query analysis, ORM design, replication
- **Model Tier:** High

### Refactor Agent
- **Expertise:** Design patterns, SOLID principles, clean code, tech debt, code smells
- **Capabilities:** Dead code detection, pattern application, migration planning, dependency analysis, type improvements, naming
- **Model Tier:** High

---

## Configuration

### Create Config

```bash
ocor init           # Creates .opencode-orchestrator.json + AGENTS.md
ocor config --init  # Creates config only
```

### Configuration File

`.opencode-orchestrator.json`:

```json
{
  "version": 1,
  "agents": {
    "enabled": ["frontend", "backend", "security", "devops", "qa"],
    "modelTiers": {
      "low": "gpt-4o-mini",
      "mid": "gpt-4o",
      "high": "claude-sonnet-4-20250514",
      "critical": "claude-opus-4-20250514"
    },
    "agentModels": {
      "frontend": "mid",
      "backend": "high",
      "security": "high",
      "qa": "low"
    },
    "maxRetries": 3,
    "timeoutMs": 120000
  },
  "orchestrator": {
    "maxParallel": 4,
    "selfHealing": true,
    "healingMaxRounds": 3,
    "conflictResolution": "ast-merge",
    "verbose": false
  },
  "indexing": {
    "enabled": true,
    "watchFiles": true,
    "vectorSearch": true,
    "astParsing": true,
    "codeGraph": true,
    "ignorePatterns": [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".git/**"
    ],
    "maxFileSizeKb": 500
  },
  "selfHealing": {
    "enabled": true,
    "runTests": true,
    "runLinter": true,
    "runTypeCheck": true,
    "testCommands": {
      "default": "npm test",
      "vitest": "npx vitest run",
      "jest": "npx jest --passWithNoTests",
      "pytest": "python -m pytest",
      "go": "go test ./..."
    }
  },
  "git": {
    "autoBranch": true,
    "branchPrefix": "ocor/",
    "worktreeIsolation": true,
    "autoCommit": false
  }
}
```

### Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `agents.enabled` | `string[]` | All 12 | Which agents to load |
| `agents.modelTiers` | `object` | See above | Model assignments per tier |
| `agents.agentModels` | `object` | See above | Which tier each agent uses |
| `agents.maxRetries` | `number` | `3` | Max retries per agent task |
| `agents.timeoutMs` | `number` | `120000` | Agent task timeout (ms) |
| `orchestrator.maxParallel` | `number` | `4` | Max concurrent agents |
| `orchestrator.selfHealing` | `boolean` | `true` | Enable auto-fix on failures |
| `orchestrator.healingMaxRounds` | `number` | `3` | Max self-healing iterations |
| `orchestrator.conflictResolution` | `string` | `"ast-merge"` | Conflict strategy |
| `indexing.enabled` | `boolean` | `true` | Enable code indexing |
| `indexing.vectorSearch` | `boolean` | `true` | Enable semantic search |
| `indexing.astParsing` | `boolean` | `true` | Enable AST parsing |
| `indexing.codeGraph` | `boolean` | `true` | Enable dependency graph |
| `selfHealing.enabled` | `boolean` | `true` | Enable self-healing |
| `selfHealing.runTests` | `boolean` | `true` | Run tests after changes |
| `selfHealing.runLinter` | `boolean` | `true` | Run linter after changes |
| `selfHealing.runTypeCheck` | `boolean` | `true` | Run type checker after changes |
| `git.autoBranch` | `boolean` | `true` | Auto-create branches |
| `git.branchPrefix` | `string` | `"ocor/"` | Branch name prefix |
| `git.worktreeIsolation` | `boolean` | `true` | Isolate agents in worktrees |

---

## How It Works

### 1. Task Decomposition

When you run a task, the orchestrator analyzes your prompt and breaks it into subtasks:

```
"Add user auth with JWT and a settings page"
          │
          ▼
┌─────────────────────────────────────────────────┐
│ Decomposer detects:                             │
│  - Domain: backend (JWT auth), frontend (settings)│
│  - Frameworks: React, Express                   │
│  - Patterns: authentication, CRUD, routing      │
│  - Dependencies: settings depends on auth       │
└─────────────────────────────────────────────────┘
          │
          ▼
  Task Plan: [auth-api] → [auth-middleware] → [settings-ui] → [tests]
```

### 2. Agent Routing

Each subtask is scored against all available agents:

```
"Create JWT auth endpoint"
  → Backend Agent:  score 95 (API design + auth expertise)
  → Security Agent: score 72 (auth review capability)
  → Frontend Agent: score 15 (not relevant)
```

The best agent is selected based on domain match, capability overlap, success history, and current workload.

### 3. Parallel Execution

Independent tasks run simultaneously:

```
Agent 1 (Backend)  ─── [auth-api.ts] ────────────────┐
Agent 2 (Frontend) ─── [settings.tsx] ────────────────┤──→ Merge
Agent 3 (QA)       ─── [auth.test.ts] ────────────────┤
Agent 4 (Docs)     ─── [api-docs.md] ─────────────────┘
```

### 4. Conflict Resolution

When agents modify the same files, the orchestrator uses AST-aware merging:

```
Agent 1 modifies: src/routes/index.ts (adds auth routes)
Agent 2 modifies: src/routes/index.ts (adds settings routes)
          │
          ▼
  Conflict Resolver: AST-merge both changes correctly
```

### 5. Self-Healing

After agents complete, the orchestrator automatically:

1. Runs the test suite
2. Runs the linter
3. Runs the type checker
4. If any fail → analyzes the error → routes back to the right agent → retries

```
Agent output → npm test → FAIL → Error: "Cannot find module './utils/auth'"
          │
          ▼
  Self-Healing: Routes to Backend Agent with error context
          │
          ▼
  Backend Agent: Creates missing utils/auth.ts
          │
          ▼
  npm test → PASS
```

---

## Web Dashboard

Launch a real-time monitoring dashboard:

```bash
ocor dashboard
ocor dashboard -p 3847  # Custom port
```

The dashboard shows:
- **Agent Pool** — Live status of all agents (idle, busy, error)
- **Metrics** — Tasks total, active, completed, failed, files modified, avg duration
- **Task History** — Recent tasks with status
- **Live Activity Log** — Real-time event stream

Access at: `http://localhost:3847`

---

## Updating

### For Existing Users

```bash
# Update to the latest version
opencode-orchestrator update

# Or use the short alias
ocor update

# Or update manually via npm
npm update -g opencode-orchestrator
```

The `update` command:
1. Checks for the latest version on npm
2. Compares with your installed version
3. Downloads and installs the update if available
4. Shows a changelog of what's new

---

## Project Structure

```
opencode-orchestrator/
├── src/
│   ├── orchestrator/              Core orchestration engine
│   │   ├── decomposer.ts          Task analysis and breakdown
│   │   ├── router.ts              Agent selection and routing
│   │   ├── message-bus.ts         Inter-agent communication
│   │   ├── conflict-resolver.ts   File conflict resolution
│   │   ├── self-healing.ts        Auto-fix on test failures
│   │   └── index.ts               Main orchestrator class
│   │
│   ├── agents/                    12+ specialized agents
│   │   ├── base.ts                Abstract agent class
│   │   ├── frontend.ts            React/Vue/Angular expert
│   │   ├── backend.ts             API/DB/auth expert
│   │   ├── security.ts            OWASP/SAST/DAST expert
│   │   ├── devops.ts              Docker/K8s/CI-CD expert
│   │   ├── uiux.ts                Design systems expert
│   │   ├── qa.ts                  Testing expert
│   │   ├── mobile.ts              iOS/Android/Flutter expert
│   │   ├── ml.ts                  ML/AI expert
│   │   ├── docs.ts                Documentation expert
│   │   ├── performance.ts         Optimization expert
│   │   ├── database.ts            Data architecture expert
│   │   ├── refactor.ts            Code quality expert
│   │   └── index.ts               Agent registry
│   │
│   ├── indexer/                   Code intelligence
│   │   ├── tree-sitter-indexer.ts AST parsing (6 languages)
│   │   ├── vector-store.ts        Semantic search (TF-IDF)
│   │   ├── code-graph.ts          Dependency graph
│   │   └── hybrid-index.ts        Combined indexer
│   │
│   ├── memory/                    Context management
│   │   ├── context-store.ts       Persistent storage
│   │   └── session-memory.ts      Session context
│   │
│   ├── protocol/                  Types and config
│   │   ├── types.ts               All TypeScript types
│   │   ├── config.ts              Configuration loader
│   │   └── mcp-client.ts          MCP integration
│   │
│   ├── utils/                     Utilities
│   │   ├── logger.ts              Structured logging
│   │   ├── process.ts             Process management
│   │   └── git.ts                 Git operations
│   │
│   ├── cli/
│   │   └── index.ts               CLI entry point (9 commands)
│   │
│   ├── dashboard/
│   │   └── server.ts              Real-time web dashboard
│   │
│   └── index.ts                   Main exports
│
├── scripts/
│   └── install.sh                 Single-command installer
│
├── AGENTS.md                      Agent configuration
├── README.md                      This file
├── LICENSE                        MIT License
├── package.json                   npm package config
└── tsconfig.json                  TypeScript config
```

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a PR.

```bash
# Clone and setup
git clone https://github.com/thedileepkumar-dk/Opencode-Orchestrator.git
cd Opencode-Orchestrator
npm install

# Development
npm run dev          # Run with tsx (hot reload)
npm run typecheck    # Type check
npm run build        # Build to dist/

# Test your changes
npm run dev -- run "test task" --verbose
```

---

## License

[MIT](LICENSE)
