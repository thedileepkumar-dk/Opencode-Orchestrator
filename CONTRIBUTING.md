# Contributing to OpenCode Orchestrator

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/thedileepkumar-dk/Opencode-Orchestrator.git
cd Opencode-Orchestrator

# Install dependencies
npm install

# Build the project
npm run build

# Link for local development
npm link
```

## Development Workflow

```bash
# Run with hot reload (uses tsx)
npm run dev -- run "test task" --verbose

# Type check
npm run typecheck

# Build for production
npm run build

# Test your changes
npm run dev -- status
npm run dev -- agents
npm run dev -- init
```

## Project Structure

- `src/orchestrator/` — Core orchestration engine
- `src/agents/` — Specialized agent implementations
- `src/indexer/` — Code intelligence (AST, vector, graph)
- `src/memory/` — Context and session management
- `src/protocol/` — Types, config, MCP client
- `src/utils/` — Logger, process, git utilities
- `src/cli/` — Command-line interface
- `src/dashboard/` — Web monitoring dashboard

## Adding a New Agent

1. Create `src/agents/your-agent.ts` extending `BaseAgent`
2. Implement `defineCapabilities()`, `defineTools()`, `getSystemPrompt()`
3. Register in `src/agents/index.ts`
4. Add to `src/protocol/default-config.json`
5. Update `AGENTS.md` and `README.md`

## Adding a New Command

1. Add the command in `src/cli/index.ts` using Commander.js
2. Follow the existing command patterns
3. Update `README.md` commands table

## Code Style

- TypeScript with strict mode
- No comments unless critical
- Use existing patterns and conventions
- Follow the file structure already established

## Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run typecheck: `npm run typecheck`
5. Commit: `git commit -m "Add your feature"`
6. Push and create a PR

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
