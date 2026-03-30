#!/usr/bin/env node

import { Command } from 'commander';
import { Orchestrator } from '../orchestrator/index.js';
import ConfigLoader, { DEFAULT_CONFIG } from '../protocol/config.js';
import { Logger } from '../utils/logger.js';
import { HybridIndex } from '../indexer/hybrid-index.js';
import { AgentRegistry } from '../agents/index.js';
import { SessionMemoryManager } from '../memory/session-memory.js';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const logger = new Logger({ scope: 'cli' });
const VERSION = '1.0.0';

const banner = `
${chalk.cyan.bold('╔══════════════════════════════════════════════════════════════╗')}
${chalk.cyan.bold('║')}  ${chalk.white.bold('OpenCode Orchestrator')} ${chalk.gray(`v${VERSION}`)}                              ${chalk.cyan.bold('║')}
${chalk.cyan.bold('║')}  ${chalk.gray('Multi-Agent AI Coding System — 12+ Specialized Agents')}    ${chalk.cyan.bold('║')}
${chalk.cyan.bold('╚══════════════════════════════════════════════════════════════╝')}
`;

async function main() {
  const program = new Command();

  program
    .name('opencode-orchestrator')
    .alias('ocor')
    .description('Powerful multi-agent orchestrator for OpenCode')
    .version(VERSION);

  program
    .command('run')
    .description('Run a task through the orchestrator')
    .argument('<prompt>', 'Task description for the orchestrator')
    .option('-m, --mode <mode>', 'Orchestration mode: auto, supervised, specialist, swarm, review', 'auto')
    .option('-a, --agent <agent>', 'Specific agent to use (for specialist mode)')
    .option('-p, --project <path>', 'Project directory to work on', '.')
    .option('--no-heal', 'Disable self-healing loop')
    .option('--parallel <n>', 'Max parallel agents', '4')
    .option('--model <model>', 'Override model for all agents')
    .option('--verbose', 'Verbose output')
    .action(async (prompt: string, options: any) => {
      console.log(banner);
      const projectPath = resolve(options.project);

      const spinner = ora('Initializing orchestrator...').start();

      try {
        const configLoader = new ConfigLoader(projectPath);
        const config = await configLoader.load();
        const registry = new AgentRegistry();
        const index = new HybridIndex({
          rootDir: projectPath,
          watchFiles: false,
          excludePatterns: config.excludePatterns,
        });
        const memory = new SessionMemoryManager({ sessionId: 'cli-session' });

        spinner.text = 'Indexing project...';
        await index.indexAll();

        spinner.text = 'Starting orchestrator...';
        const orchestrator = new Orchestrator({
          mode: options.mode === 'auto' ? 'auto-pilot' : options.mode,
          maxConcurrentTasks: parseInt(options.parallel),
          healingEnabled: options.heal !== false,
        });

        spinner.text = 'Decomposing task...';
        spinner.stop();

        console.log(chalk.yellow('\n Task: ') + chalk.white(prompt));
        console.log(chalk.yellow(' Mode: ') + chalk.white(options.mode));
        console.log(chalk.yellow(' Project: ') + chalk.white(projectPath));
        console.log();

        const result = await orchestrator.orchestrate(prompt, {
          projectPath,
          preferredAgent: options.agent,
          modelOverride: options.model,
        });

        if (result.status === 'completed') {
          console.log(chalk.green.bold('\n Task completed successfully!'));
          console.log(chalk.gray(`  Session: ${result.id}`));
          console.log(chalk.gray(`  Progress: ${result.progress.completed}/${result.progress.total} tasks completed`));
        } else {
          console.log(chalk.red.bold('\n Task completed with errors'));
          console.log(chalk.red(`  Status: ${result.status}`));
          console.log(chalk.red(`  Failed: ${result.progress.failed} tasks`));
          process.exit(1);
        }
      } catch (error: any) {
        spinner.fail('Orchestration failed');
        console.error(chalk.red(error.message));
        if (options.verbose) console.error(error.stack);
        process.exit(1);
      }
    });

  program
    .command('agents')
    .description('List all available specialized agents')
    .option('-d, --domain <domain>', 'Filter by domain')
    .option('--json', 'Output as JSON')
    .action(async (options: any) => {
      console.log(banner);
      const registry = new AgentRegistry();
      const agents = options.domain
        ? registry.getByDomain(options.domain)
        : registry.getAll();

      if (options.json) {
        console.log(JSON.stringify(agents.map((a: any) => ({
          id: a.id,
          name: a.name,
          domain: a.domain,
          capabilities: a.capabilities,
        })), null, 2));
        return;
      }

      console.log(chalk.yellow.bold(' Available Agents:\n'));
      for (const agent of agents) {
        console.log(chalk.cyan(`  ${chalk.bold(agent.name)}`));
        console.log(chalk.gray(`     Domain: ${agent.domain}`));
        console.log(chalk.gray(`     Capabilities: ${agent.capabilities.map((c: any) => c.name || c).join(', ')}`));
        console.log();
      }
    });

  program
    .command('index')
    .description('Index a project for code intelligence')
    .argument('[path]', 'Project path to index', '.')
    .option('--watch', 'Watch for changes and re-index')
    .option('--stats', 'Show index statistics')
    .action(async (pathArg: string, options: any) => {
      const projectPath = resolve(pathArg);
      const spinner = ora(`Indexing ${projectPath}...`).start();

      try {
        const index = new HybridIndex({
          rootDir: projectPath,
          watchFiles: options.watch,
          excludePatterns: [],
        });
        await index.indexAll();
        spinner.succeed('Indexing complete');

        if (options.stats) {
          const stats = index.getStats();
          console.log(chalk.yellow('\n Index Statistics:\n'));
          console.log(chalk.gray(`  Files indexed: ${stats.files}`));
          console.log(chalk.gray(`  Symbols found: ${stats.symbols}`));
          console.log(chalk.gray(`  Vector chunks: ${stats.chunks}`));
          console.log(chalk.gray(`  Graph edges: ${stats.graph.edges}`));
        }

        if (options.watch) {
          console.log(chalk.cyan('\n Watching for changes... (Ctrl+C to stop)\n'));
        }
      } catch (error: any) {
        spinner.fail('Indexing failed');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  program
    .command('review')
    .description('Run multi-agent code review on current changes')
    .option('-p, --path <path>', 'Project path', '.')
    .option('--staged', 'Review staged changes only')
    .option('--branch <branch>', 'Compare against branch')
    .action(async (options: any) => {
      console.log(banner);
      console.log(chalk.yellow.bold(' Multi-Agent Code Review\n'));

      const projectPath = resolve(options.path);
      const configLoader = new ConfigLoader(projectPath);
      const config = await configLoader.load();
      const registry = new AgentRegistry();

      const spinner = ora('Analyzing changes...').start();

      try {
        const orchestrator = new Orchestrator({
          mode: 'review-crew',
          maxConcurrentTasks: 5,
          healingEnabled: false,
        });

        spinner.stop();
        const result = await orchestrator.orchestrate(
          'Review the current changes for code quality, security, performance, test coverage, and documentation',
          { projectPath }
        );

        if (result.status === 'completed') {
          console.log(chalk.green.bold('\n Review complete!'));
        }
      } catch (error: any) {
        spinner.fail('Review failed');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  program
    .command('config')
    .description('Manage orchestrator configuration')
    .option('--init', 'Create default config file')
    .option('--show', 'Show current configuration')
    .action(async (options: any) => {
      if (options.init) {
        const configPath = join(process.cwd(), '.opencode-orchestrator.json');
        if (existsSync(configPath)) {
          console.log(chalk.yellow('Config file already exists'));
          return;
        }
        const { writeFileSync } = await import('fs');
        writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
        console.log(chalk.green(` Created config at ${configPath}`));
        return;
      }

      if (options.show) {
        const configLoader = new ConfigLoader(process.cwd());
        const config = await configLoader.load();
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      program.commands.find(c => c.name() === 'config')?.help();
    });

  program
    .command('dashboard')
    .description('Launch the web monitoring dashboard')
    .option('-p, --port <port>', 'Port number', '3847')
    .action(async (options: any) => {
      console.log(banner);
      console.log(chalk.cyan(` Starting dashboard on port ${options.port}...`));
      const { startDashboard } = await import('../dashboard/server.js');
      await startDashboard(parseInt(options.port));
    });

  program
    .command('init')
    .description('Initialize orchestrator in current project')
    .option('-f, --force', 'Overwrite existing config')
    .action(async (options: any) => {
      const cwd = process.cwd();
      const configPath = join(cwd, '.opencode-orchestrator.json');
      const agentsPath = join(cwd, 'AGENTS.md');

      if (existsSync(configPath) && !options.force) {
        console.log(chalk.yellow('Already initialized. Use --force to overwrite.'));
        return;
      }

      const { writeFileSync } = await import('fs');
      writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log(chalk.green(' Created .opencode-orchestrator.json'));

      if (!existsSync(agentsPath) || options.force) {
        const agentsMd = generateAgentsMd();
        writeFileSync(agentsPath, agentsMd);
        console.log(chalk.green(' Created AGENTS.md'));
      }

      console.log(chalk.cyan.bold('\n OpenCode Orchestrator initialized!'));
      console.log(chalk.gray('  Run: opencode-orchestrator run "your task here"'));
    });

  program
    .command('status')
    .description('Show orchestrator and agent status')
    .action(async () => {
      console.log(banner);
      const registry = new AgentRegistry();
      const agents = registry.getAll();

      console.log(chalk.yellow.bold(' System Status\n'));
      console.log(chalk.gray(`  Version: ${VERSION}`));
      console.log(chalk.gray(`  Agents loaded: ${agents.length}`));
      console.log(chalk.gray(`  Node.js: ${process.version}`));
      console.log(chalk.gray(`  Platform: ${process.platform} ${process.arch}`));
      console.log();

      console.log(chalk.yellow.bold(' Agent Pool\n'));
      for (const agent of agents) {
        console.log(`  ${agent.name} — ${agent.domain}`);
      }
    });

  program.parse();
}

function generateAgentsMd(): string {
  return `# OpenCode Orchestrator — Agent Configuration

This project uses OpenCode Orchestrator with specialized AI agents.

## Available Agents

| Agent | Domain | Description |
|-------|--------|-------------|
| Frontend | frontend | React, Vue, Angular, Svelte, CSS, responsive design |
| Backend | backend | APIs, databases, auth, microservices, middleware |
| UI/UX | uiux | Design systems, accessibility, component architecture |
| Security | security | OWASP, SAST, DAST, dependency audit, secrets |
| DevOps | devops | Docker, K8s, CI/CD, Terraform, monitoring |
| Mobile | mobile | iOS, Android, Flutter, React Native |
| QA/Test | testing | Unit, integration, E2E, visual regression |
| ML/AI | ml | PyTorch, TensorFlow, data pipelines, MLOps |
| Docs | docs | API docs, README, changelogs, architecture |
| Performance | performance | Profiling, caching, optimization, Core Web Vitals |
| Database | database | Schema design, migrations, query optimization |
| Refactor | refactor | Code smells, patterns, tech debt, clean code |

## Usage

\`\`\`bash
# Auto mode — orchestrator picks agents automatically
opencode-orchestrator run "Add user authentication with JWT"

# Specialist mode — pick a specific agent
opencode-orchestrator run "Audit for vulnerabilities" --agent security

# Swarm mode — parallel micro-agents
opencode-orchestrator run "Refactor entire payment module" --mode swarm

# Review mode — 5-agent parallel review
opencode-orchestrator review --staged
\`\`\`

## Configuration

Edit \`.opencode-orchestrator.json\` to customize:
- Agent model assignments
- Parallel execution limits
- Self-healing behavior
- Indexing settings
`;
}

main().catch(err => {
  console.error(chalk.red('Fatal error:'), err.message);
  process.exit(1);
});
