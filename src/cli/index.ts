#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

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
    .description('OpenCode Orchestrator - Initialize and update specialized agents for OpenCode')
    .version(VERSION);

  program
    .command('init')
    .description('Initialize OpenCode Orchestrator agents in current project')
    .option('-f, --force', 'Overwrite existing agents')
    .action(async (options: any) => {
      console.log(banner);
      const cwd = process.cwd();
      const opencodeDir = join(cwd, '.opencode', 'agents');
      const agentsMdPath = join(cwd, 'AGENTS.md');

      if (!existsSync(join(cwd, '.opencode'))) {
        mkdirSync(join(cwd, '.opencode'), { recursive: true });
      }

      if (!existsSync(opencodeDir)) {
        mkdirSync(opencodeDir, { recursive: true });
      }

      console.log(chalk.cyan('\n Creating OpenCode Orchestrator agents...\n'));

      createOrchestratorAgent(opencodeDir, options.force);
      createSubagents(opencodeDir, options.force);

      console.log(chalk.green(' ✓ Created .opencode/agents/orchestrator.md (Primary Agent)'));
      
      if (!existsSync(agentsMdPath) || options.force) {
        writeFileSync(agentsMdPath, generateProjectAgentsMd());
        console.log(chalk.green(' ✓ Created AGENTS.md'));
      }

      console.log(chalk.cyan.bold('\n OpenCode Orchestrator initialized!'));
      console.log(chalk.gray('  Start OpenCode and use:'));
      console.log(chalk.white('    @orchestrator   - Main orchestrator (replaces Build)'));
      console.log(chalk.white('    @frontend      - Frontend expert'));
      console.log(chalk.white('    @backend       - Backend expert'));
      console.log(chalk.white('    @security      - Security expert'));
      console.log(chalk.white('    @devops        - DevOps expert'));
      console.log(chalk.white('    ...and 8 more'));
      console.log();
    });

  program
    .command('update')
    .description('Update OpenCode Orchestrator agents to latest version')
    .option('--check', 'Only check for updates')
    .option('--force', 'Force update')
    .action(async (options: any) => {
      console.log(banner);
      const { execSync } = await import('child_process');

      try {
        const latestVersion = execSync('npm view ocor-cli version', {
          encoding: 'utf-8',
          timeout: 15000,
        }).trim();

        console.log(chalk.yellow('  Current version: ') + chalk.white(VERSION));
        console.log(chalk.yellow('  Latest version:  ') + chalk.white(latestVersion));
        console.log();

        if (VERSION === latestVersion && !options.force) {
          console.log(chalk.green.bold(' You are on the latest version!'));
          return;
        }

        if (options.check) {
          console.log(chalk.yellow.bold(` Update available: ${VERSION} → ${latestVersion}`));
          return;
        }

        console.log(chalk.cyan.bold(` Updating to v${latestVersion}...\n`));

        const cwd = process.cwd();
        const opencodeDir = join(cwd, '.opencode', 'agents');
        const agentsMdPath = join(cwd, 'AGENTS.md');

        if (!existsSync(opencodeDir)) {
          console.log(chalk.yellow(' Not initialized. Run: ocor init'));
          return;
        }

        createOrchestratorAgent(opencodeDir, true);
        createSubagents(opencodeDir, true);

        if (existsSync(agentsMdPath)) {
          writeFileSync(agentsMdPath, generateProjectAgentsMd());
        }

        console.log(chalk.green.bold(' Agents updated!'));
        console.log(chalk.gray('  Restart OpenCode to use updated agents'));
        console.log();

      } catch (error: any) {
        console.log(chalk.red(' Update check failed'));
        console.log(chalk.gray('  Run: ocor init --force to reinitialize'));
      }
    });

  program.parse();
}

function createOrchestratorAgent(dir: string, force: boolean) {
  const content = `---
description: OpenCode Orchestrator - Coordinates 12 specialized AI agents for multi-agent coding workflows
mode: primary
color: "#00d4ff"
permission:
  edit: allow
  bash: allow
  webfetch: allow
  task: allow
---

# OpenCode Orchestrator

You are **OpenCode Orchestrator**, a powerful multi-agent AI coding system that coordinates 12 specialized domain experts. You replace the default "Build" agent in OpenCode.

## Your Role

As Orchestrator, you analyze user requests and coordinate the appropriate specialized agents to complete tasks efficiently. You can invoke subagents using the @mention syntax.

## Available Specialized Agents

| Agent | Command | Expertise |
|-------|---------|-----------|
| Frontend | @frontend | React, Vue, Angular, Svelte, CSS, responsive design |
| Backend | @backend | APIs, databases, auth, microservices, middleware |
| UI/UX | @uiux | Design systems, accessibility, component architecture |
| Security | @security | OWASP, SAST, DAST, dependency audit, secrets |
| DevOps | @devops | Docker, K8s, CI/CD, Terraform, monitoring |
| Mobile | @mobile | iOS, Android, Flutter, React Native |
| QA | @qa | Unit, integration, E2E, visual regression |
| ML/AI | @ml | PyTorch, TensorFlow, data pipelines, MLOps |
| Docs | @docs | API docs, README, changelogs, architecture |
| Performance | @performance | Profiling, caching, optimization, Core Web Vitals |
| Database | @database | Schema design, migrations, query optimization |
| Refactor | @refactor | Code smells, patterns, tech debt, clean code |

## How to Use

1. **Direct Task**: For simple tasks, handle them directly
2. **Invoke Subagent**: For complex tasks, @mention the appropriate specialist
3. **Multi-Agent**: For large features, coordinate multiple agents in sequence or parallel

## Workflow Examples

- "@frontend create a login form with validation"
- "@backend design a REST API for user management"
- "@security audit this code for XSS vulnerabilities"
- "@devops add Docker configuration for this Node.js app"
- "@performance optimize database queries on the dashboard"

## Guidelines

- Always use the most appropriate agent for each subtask
- When tasks span multiple domains, coordinate multiple agents
- Provide clear context when invoking subagents
- Synthesize results from multiple agents into cohesive solutions
`;

  writeFileSync(join(dir, 'orchestrator.md'), content);
}

function createSubagents(dir: string, force: boolean) {
  const agents = [
    {
      name: 'frontend',
      color: '#61dafb',
      description: 'Frontend expert - React, Vue, Angular, Svelte, styling, responsive design',
      expertise: `React, Vue, Angular, Svelte, Next.js, Nuxt, Tailwind CSS, CSS-in-JS, responsive design, accessibility (WCAG), component architecture, state management (Redux, Vuex, Pinia), SSR/SSG, animation (Framer Motion), routing, form validation, testing (Jest, Vitest, Testing Library)`,
      tasks: 'Building UI components, pages, forms, implementing designs, adding styles, responsive layouts, component libraries'
    },
    {
      name: 'backend',
      color: '#68a063',
      description: 'Backend expert - APIs, databases, auth, microservices, server architecture',
      expertise: `Node.js, Python, Go, Java, REST APIs, GraphQL, gRPC, Express, Fastify, Django, Flask, Spring, databases (PostgreSQL, MySQL, MongoDB, Redis), authentication (JWT, OAuth, SSO), authorization, middleware, caching, message queues (RabbitMQ, Kafka), microservices, API design, data validation`,
      tasks: 'Creating APIs, database schemas, authentication systems, middleware, microservices, server configuration'
    },
    {
      name: 'uiux',
      color: '#ff6b6b',
      description: 'UI/UX expert - Design systems, accessibility, component libraries, user experience',
      expertise: `Design systems, Figma, Storybook, component libraries, design tokens, WCAG 2.1 accessibility, responsive layouts, user experience patterns, interaction design, typography, color theory, animation principles, design handoff`,
      tasks: 'Creating design systems, component APIs, accessibility audits, design token implementation, design documentation'
    },
    {
      name: 'security',
      color: '#ff4757',
      description: 'Security expert - OWASP, vulnerability assessment, secure coding, audit',
      expertise: `OWASP Top 10, SAST, DAST, security auditing, vulnerability assessment, penetration testing, secret scanning, dependency CVEs, input validation, XSS, CSRF, SQL injection, authentication hardening, authorization, encryption, secure coding practices, threat modeling, container security`,
      tasks: 'Security audits, vulnerability scanning, code hardening, dependency audits, security documentation, threat modeling'
    },
    {
      name: 'devops',
      color: '#7bed9f',
      description: 'DevOps expert - Docker, Kubernetes, CI/CD, infrastructure as code',
      expertise: `Docker, Kubernetes, Helm, Docker Compose, Terraform, Pulumi, AWS, GCP, Azure, GitHub Actions, GitLab CI, Jenkins, CircleCI, monitoring (Prometheus, Grafana), logging, alerting, deployment strategies, infrastructure as code, serverless, networking`,
      tasks: 'Containerization, CI/CD pipelines, infrastructure setup, deployment configurations, monitoring, Kubernetes manifests'
    },
    {
      name: 'mobile',
      color: '#a55eea',
      description: 'Mobile expert - iOS, Android, Flutter, React Native, cross-platform development',
      expertise: `Swift, Kotlin, Flutter, Dart, React Native, Expo, iOS development, Android development, app store guidelines, push notifications, deep linking, offline storage, biometric authentication, mobile UI patterns, native modules, performance optimization`,
      tasks: 'Building mobile apps, native integrations, app store submissions, push notification setup, mobile-specific features'
    },
    {
      name: 'qa',
      color: '#2ed573',
      description: 'QA expert - Testing, test automation, quality assurance, test strategies',
      expertise: `Jest, Vitest, Mocha, Jasmine, pytest, Go testing, Playwright, Cypress, Selenium, E2E testing, unit testing, integration testing, test-driven development, mutation testing, test coverage, visual regression testing, API testing, test automation frameworks`,
      tasks: 'Writing tests, test strategies, test automation, coverage analysis, debugging test failures'
    },
    {
      name: 'ml',
      color: '#ffa502',
      description: 'ML/AI expert - Machine learning, data pipelines, AI integration, MLOps',
      expertise: `PyTorch, TensorFlow, scikit-learn, Hugging Face, LangChain, pandas, NumPy, data preprocessing, feature engineering, model training, model evaluation, LLM integration, RAG, embeddings, MLOps, ML pipelines, experiment tracking (MLflow, Weights & Biases), model serving`,
      tasks: 'ML model development, data pipeline creation, AI integration, model training, MLOps setup'
    },
    {
      name: 'docs',
      color: '#70a1ff',
      description: 'Documentation expert - API docs, README, architecture docs, technical writing',
      expertise: `API documentation (OpenAPI, Swagger), README creation, architecture documentation, changelogs, Markdown, Mermaid diagrams, code comments, docstrings (JSDoc, Sphinx), architectural decision records, migration guides, user guides, tutorials`,
      tasks: 'Writing documentation, API docs, README files, architecture diagrams, changelog management'
    },
    {
      name: 'performance',
      color: '#ff7f50',
      description: 'Performance expert - Profiling, optimization, caching, Core Web Vitals',
      expertise: `Chrome DevTools, Lighthouse, Web Vitals, profiling, performance optimization, caching strategies, CDN, bundle optimization, query optimization, memory profiling, CPU profiling, load testing (k6, wrk), database indexing, Redis optimization, image optimization`,
      tasks: 'Performance audits, optimization, profiling, caching strategies, bundle analysis, query optimization'
    },
    {
      name: 'database',
      color: '#1e90ff',
      description: 'Database expert - Schema design, migrations, query optimization, data modeling',
      expertise: `PostgreSQL, MySQL, MongoDB, Redis, DynamoDB, SQLite, database design, ERD, schema migrations, indexes, query optimization, ORM (Prisma, TypeORM, SQLAlchemy), data modeling, replication, sharding, backup strategies, SQL, NoSQL patterns`,
      tasks: 'Database design, migrations, query optimization, schema changes, ORM configuration'
    },
    {
      name: 'refactor',
      color: '#747d8c',
      description: 'Refactor expert - Code quality, design patterns, tech debt, clean code',
      expertise: `SOLID principles, design patterns (GoF, GRASP), clean code, refactoring, code smells, tech debt assessment, dependency analysis, architectural patterns, code metrics, static analysis, linters, naming conventions, code organization, abstraction, modularization`,
      tasks: 'Refactoring, code quality improvements, pattern application, tech debt reduction, code reviews'
    }
  ];

  for (const agent of agents) {
    const content = `---
description: ${agent.description}
mode: subagent
color: "${agent.color}"
permission:
  edit: allow
  bash: allow
  webfetch: allow
---

# ${agent.name.charAt(0).toUpperCase() + agent.name.slice(1)} Agent

You are a Senior ${agent.name.charAt(0).toUpperCase() + agent.name.slice(1)} Expert specializing in ${agent.description}.

## Expertise

${agent.expertise}

## When to Use

Use this agent for: ${agent.tasks}

## Guidelines

- Provide production-ready, maintainable code
- Follow best practices and industry standards
- Consider performance, security, and accessibility
- Write clean, well-documented code
- Use appropriate testing strategies
`;

    writeFileSync(join(dir, `${agent.name}.md`), content);
  }
}

function generateProjectAgentsMd(): string {
  const at = '@';
  const codeBlock = '```bash\n# Start OpenCode\nopencode\n\n# Use Orchestrator (replaces default Build agent)\n' + at + 'orchestrator help me build a login system\n\n# Or invoke specific agents directly\n' + at + 'frontend create a navbar component\n' + at + 'backend create user API endpoints\n' + at + 'security audit for vulnerabilities\n' + at + 'devops add Docker configuration\n```';
  
  return `# OpenCode Orchestrator Agents

This project uses OpenCode Orchestrator with 13 specialized AI agents.

## Available Agents

| Agent | Type | Description |
|-------|------|-------------|
| orchestrator | primary | Main orchestrator - coordinates all agents (replaces Build) |
| frontend | subagent | React, Vue, Angular, Svelte, CSS, responsive design |
| backend | subagent | APIs, databases, auth, microservices, middleware |
| uiux | subagent | Design systems, accessibility, component architecture |
| security | subagent | OWASP, SAST, DAST, dependency audit, secrets |
| devops | subagent | Docker, K8s, CI/CD, Terraform, monitoring |
| mobile | subagent | iOS, Android, Flutter, React Native |
| qa | subagent | Unit, integration, E2E, visual regression |
| ml | subagent | PyTorch, TensorFlow, data pipelines, MLOps |
| docs | subagent | API docs, README, changelogs, architecture |
| performance | subagent | Profiling, caching, optimization, Core Web Vitals |
| database | subagent | Schema design, migrations, query optimization |
| refactor | subagent | Code smells, patterns, tech debt, clean code |

## Usage

${codeBlock}

## For More Information

See: https://github.com/thedileepkumar-dk/Opencode-Orchestrator
`;
}

main().catch(err => {
  console.error(chalk.red('Fatal error:'), err.message);
  process.exit(1);
});
