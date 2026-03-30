# AGENTS.md — OpenCode Orchestrator Agent Configuration

This file defines the specialized agents available in this project.
The orchestrator reads this to understand which agents to load and how to route tasks.

## Agent Definitions

### frontend
- **Domain:** UI Development
- **Expertise:** React, Vue, Angular, Svelte, Next.js, Nuxt, Tailwind CSS, CSS-in-JS, responsive design, accessibility
- **Model Tier:** mid
- **Capabilities:** component generation, state management, styling, responsive design, a11y, SSR/SSG, animation
- **File Patterns:** `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.module.css`

### backend
- **Domain:** Server-Side Engineering
- **Expertise:** Node.js, Python, Go, REST, GraphQL, gRPC, databases, auth, middleware, queues, microservices
- **Model Tier:** high
- **Capabilities:** API design, schema design, middleware, caching, queue processing, auth flows, integrations
- **File Patterns:** `*.ts`, `*.py`, `*.go`, `*.java`, `*/api/*`, `*/routes/*`, `*/controllers/*`

### uiux
- **Domain:** Design Engineering
- **Expertise:** Design systems, component libraries, Figma, Storybook, WCAG 2.1, design tokens, animation
- **Model Tier:** mid
- **Capabilities:** design token generation, component API design, accessibility audit, design system management
- **File Patterns:** `*.stories.*`, `*/design-system/*`, `*/components/*`, `*/tokens/*`

### security
- **Domain:** Application Security
- **Expertise:** OWASP Top 10, SAST, DAST, dependency audit, secret scanning, penetration testing, hardening
- **Model Tier:** high
- **Capabilities:** vulnerability scanning, security review, CVE checking, secret detection, hardening recommendations
- **File Patterns:** `*auth*`, `*security*`, `*crypto*`, `*.env*`, `*config*`, `*secret*`

### devops
- **Domain:** Platform Engineering
- **Expertise:** Docker, Kubernetes, Terraform, Pulumi, GitHub Actions, GitLab CI, Prometheus, Grafana, AWS/GCP/Azure
- **Model Tier:** mid
- **Capabilities:** pipeline generation, IaC, deployment configs, monitoring setup, alerting rules
- **File Patterns:** `Dockerfile*`, `docker-compose*`, `.github/workflows/*`, `*.tf`, `*.yml`, `*.yaml`, `k8s/*`

### mobile
- **Domain:** Mobile Development
- **Expertise:** Swift, Kotlin, Flutter, Dart, React Native, Expo, app store guidelines, push notifications
- **Model Tier:** mid
- **Capabilities:** native module integration, app store compliance, push notifications, deep linking, offline support
- **File Patterns:** `*.swift`, `*.kt`, `*.dart`, `*.mobile.*`, `*/ios/*`, `*/android/*`

### qa
- **Domain:** Quality Assurance
- **Expertise:** Jest, Vitest, Playwright, Cypress, pytest, Go testing, mutation testing, visual regression
- **Model Tier:** low
- **Capabilities:** test generation, coverage analysis, flaky test detection, E2E test writing, visual regression
- **File Patterns:** `*.test.*`, `*.spec.*`, `*/__tests__/*`, `*/tests/*`, `*.test.py`, `*_test.go`

### ml
- **Domain:** Machine Learning / AI
- **Expertise:** PyTorch, TensorFlow, scikit-learn, pandas, data pipelines, MLOps, model serving, fine-tuning
- **Model Tier:** high
- **Capabilities:** model architecture design, data preprocessing, experiment tracking, model deployment
- **File Patterns:** `*.ipynb`, `*/models/*`, `*/training/*`, `*/data/*`, `*.py` (ML contexts)

### docs
- **Domain:** Technical Documentation
- **Expertise:** API documentation, architecture docs, README, changelogs, Mermaid diagrams, OpenAPI/Swagger
- **Model Tier:** low
- **Capabilities:** doc generation, docstring enforcement, diagram generation, changelog management
- **File Patterns:** `*.md`, `*.mdx`, `*/docs/*`, `CHANGELOG*`, `README*`, `*.openapi.*`

### performance
- **Domain:** Performance Engineering
- **Expertise:** Profiling, Core Web Vitals, caching strategies, CDN, database optimization, load testing
- **Model Tier:** mid
- **Capabilities:** benchmarking, bottleneck detection, query optimization, bundle analysis, caching strategies
- **File Patterns:** `*perf*`, `*benchmark*`, `*cache*`, `*.config.*`, `webpack*`, `vite*`

### database
- **Domain:** Data Architecture
- **Expertise:** PostgreSQL, MySQL, MongoDB, Redis, DynamoDB, schema design, migrations, query optimization
- **Model Tier:** high
- **Capabilities:** ERD generation, index optimization, migration planning, data modeling, query analysis
- **File Patterns:** `*/migrations/*`, `*/schema/*`, `*.sql`, `*.prisma`, `*.entity.*`, `*/models/*`

### refactor
- **Domain:** Code Quality
- **Expertise:** Design patterns, SOLID principles, clean code, tech debt, dead code, code smells, migrations
- **Model Tier:** high
- **Capabilities:** dead code detection, pattern application, migration planning, tech debt assessment
- **File Patterns:** All source files (applies broadly)

## Workflow Templates

### full-stack-feature
Agents: [frontend, backend, database, qa, devops, docs]
Description: Build an end-to-end feature from API to UI with tests, deployment config, and docs.

### security-audit
Agents: [security, backend, frontend, devops]
Description: Comprehensive security review across the entire stack.

### performance-optimization
Agents: [performance, frontend, backend, database]
Description: Identify and fix performance bottlenecks across the application.

### codebase-review
Agents: [security, performance, qa, docs, refactor]
Description: 5-agent parallel review covering all quality dimensions.

### mobile-feature
Agents: [mobile, backend, qa, docs]
Description: Build a mobile feature with API integration, tests, and documentation.

### ml-pipeline
Agents: [ml, backend, devops, performance]
Description: Build, deploy, and optimize an ML pipeline.
