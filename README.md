# OpenCode Orchestrator

**A powerful multi-agent orchestrator for OpenCode — 12+ specialized AI agents that work together to build, review, and ship code.**

## What is this?

OpenCode Orchestrator extends OpenCode with a team of specialized AI agents. Instead of one generalist agent, you get 12+ domain experts that collaborate on your tasks — a frontend agent handles React components, a security agent audits for vulnerabilities, a DevOps agent writes your Dockerfile, and they all work in parallel.

```
┌─────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR CORE                     │
│  (Task Decomposer + Agent Router + Conflict Resolver)   │
├─────────┬─────────┬──────────┬──────────┬───────────────┤
│Frontend │Backend  │Security  │DevOps    │QA/Test        │
│React    │APIs     │OWASP     │Docker    │Jest/Vitest    │
│Vue      │Auth     │SAST/DAST │K8s       │Playwright     │
│Angular  │DB       │CVE Scan  │Terraform │E2E/Visual     │
├─────────┼─────────┼──────────┼──────────┼───────────────┤
│UI/UX    │Database │Mobile    │ML/AI     │Performance    │
│Design   │Schema   │iOS       │PyTorch   │Profiling      │
│A11y     │Migrate  │Android   │Data Eng  │Optimization   │
│Tokens   │Optimize │Flutter   │MLOps     │Caching        │
├─────────┴─────────┴──────────┴──────────┴───────────────┤
│Docs Agent │Refactor Agent │ Hybrid Indexer │ Memory     │
└─────────────────────────────────────────────────────────┘
```

## Single-Command Install

```bash
curl -fsSL https://raw.githubusercontent.com/opencode-orchestrator/opencode-orchestrator/main/scripts/install.sh | bash
```

Or with npm:

```bash
npm install -g opencode-orchestrator
```

## Quick Start

```bash
# Initialize in your project
opencode-orchestrator init

# Run a task — orchestrator picks the right agents automatically
opencode-orchestrator run "Add user authentication with JWT tokens and refresh flow"

# Run with a specific agent
opencode-orchestrator run "Audit this codebase for security vulnerabilities" --agent security

# Run multi-agent code review
opencode-orchestrator review

# Launch the monitoring dashboard
opencode-orchestrator dashboard

# List all available agents
opencode-orchestrator agents
```

## Orchestration Modes

| Mode | Command | Description |
|------|---------|-------------|
| **Auto** (default) | `run "task"` | Orchestrator decomposes task and assigns agents automatically |
| **Supervised** | `run "task" --mode supervised` | You approve the plan before agents execute |
| **Specialist** | `run "task" --agent security` | Single domain expert handles the task |
| **Swarm** | `run "task" --mode swarm` | Many micro-agents tackle pieces in parallel |
| **Review Crew** | `review` | 5 agents review your code in parallel (security + perf + test + docs + refactor) |

## The 12 Specialized Agents

| Agent | Domain | Expertise |
|-------|--------|-----------|
| **Frontend** | UI Development | React, Vue, Angular, Svelte, Next.js, Tailwind, CSS |
| **Backend** | Server-Side | Node.js, Python, Go, APIs, auth, middleware, queues |
| **UI/UX** | Design | Design systems, Figma-to-code, WCAG, component architecture |
| **Security** | AppSec | OWASP, SAST, DAST, dependency audit, secret scanning |
| **DevOps** | Infrastructure | Docker, K8s, Terraform, CI/CD, GitHub Actions, monitoring |
| **Mobile** | Mobile Dev | iOS, Android, Flutter, React Native, Expo |
| **QA/Test** | Quality | Jest, Vitest, Playwright, Cypress, mutation testing |
| **ML/AI** | Machine Learning | PyTorch, TensorFlow, scikit-learn, data pipelines |
| **Docs** | Documentation | API docs, README, changelogs, architecture diagrams |
| **Performance** | Optimization | Profiling, caching, Core Web Vitals, query optimization |
| **Database** | Data | PostgreSQL, MongoDB, Redis, schema design, migrations |
| **Refactor** | Code Quality | Design patterns, dead code, tech debt, clean code |

## How It Works

1. **Task Decomposition** — Your prompt is analyzed and broken into subtasks by domain
2. **Agent Routing** — Each subtask is assigned to the best-fit specialist agent
3. **Parallel Execution** — Agents work simultaneously in isolated worktrees
4. **Conflict Resolution** — AST-aware merging when agents touch the same files
5. **Self-Healing** — Tests run automatically, failures get routed back for fixes
6. **Result Composition** — All agent outputs are merged into a cohesive result

## Architecture

```
src/
├── orchestrator/     Core orchestration engine
│   ├── decomposer.ts    Task analysis and breakdown
│   ├── router.ts        Agent selection and routing
│   ├── message-bus.ts   Inter-agent communication
│   ├── conflict-resolver.ts  File conflict resolution
│   ├── self-healing.ts  Auto-fix on test failures
│   └── index.ts         Main orchestrator class
├── agents/           12+ specialized agents
│   ├── base.ts          Abstract agent class
│   ├── frontend.ts      React/Vue/Angular expert
│   ├── backend.ts       API/DB/auth expert
│   ├── security.ts      OWASP/SAST/DAST expert
│   ├── ...              (and 9 more)
│   └── index.ts         Agent registry
├── indexer/          Code intelligence
│   ├── tree-sitter-indexer.ts  AST parsing
│   ├── vector-store.ts  Semantic search
│   ├── code-graph.ts    Dependency graph
│   └── hybrid-index.ts  Combined indexer
├── memory/           Context management
│   ├── context-store.ts Persistent storage
│   └── session-memory.ts  Session context
├── protocol/         Types and config
│   ├── types.ts         All TypeScript types
│   ├── config.ts        Configuration loader
│   └── mcp-client.ts    MCP integration
├── utils/            Utilities
│   ├── logger.ts        Structured logging
│   ├── process.ts       Process management
│   └── git.ts           Git operations
├── cli/              Command-line interface
│   └── index.ts         CLI entry point
├── dashboard/        Web monitoring
│   └── server.ts        Real-time dashboard
└── index.ts          Main exports
```

## Configuration

Create `.opencode-orchestrator.json` in your project root:

```json
{
  "agents": {
    "enabled": ["frontend", "backend", "security", "devops", "qa"],
    "modelTiers": {
      "low": "gpt-4o-mini",
      "mid": "gpt-4o",
      "high": "claude-sonnet-4-20250514"
    }
  },
  "orchestrator": {
    "maxParallel": 4,
    "selfHealing": true
  },
  "indexing": {
    "enabled": true,
    "vectorSearch": true,
    "astParsing": true
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `ocor run "task"` | Run a task through the orchestrator |
| `ocor agents` | List all available agents |
| `ocor index [--watch]` | Index project for code intelligence |
| `ocor review [--staged]` | Multi-agent code review |
| `ocor dashboard [-p port]` | Launch web monitoring dashboard |
| `ocor config --init` | Create default configuration |
| `ocor init` | Initialize orchestrator in project |
| `ocor status` | Show system and agent status |

## Inspired By

- [OpenCode](https://github.com/anomalyco/opencode) — The open source coding agent
- [Gas Town](https://github.com/steveyegge/gastown) — Multi-agent workspace manager
- [Kilo Code](https://kilo.ai) — AI coding assistant with repo-aware agentic architecture

## License

MIT
