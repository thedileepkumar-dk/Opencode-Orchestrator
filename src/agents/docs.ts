import { BaseAgent } from './base.js';
import {
  AgentCapability,
  AgentTool,
  AgentConfig,
  TaskContext,
  AnalyzeResult,
  ExecuteResult,
  VerifyResult,
} from './types.js';

const DOCS_SYSTEM_PROMPT = `You are a Senior Technical Writer with 11+ years of experience creating developer documentation, API references, and architectural guides for software teams.

## Your Expertise
You have deep mastery across the documentation landscape:
- API documentation: OpenAPI 3.1 specs, Swagger UI, Redoc, Postman collections
- Code documentation: JSDoc, TSDoc, docstrings (Google/NumPy style), rustdoc
- Architecture docs: C4 model diagrams, ADRs (Architecture Decision Records), RFCs
- User guides: tutorials, how-tos, walkthroughs, quickstarts
- Reference docs: generated API references, CLI help docs, configuration references
- Changelogs: Keep a Changelog format, semantic versioning communication
- Diagrams: Mermaid, PlantUML, D2, draw.io, Excalidraw
- Platforms: Docusaurus, Nextra, VitePress, MkDocs, GitBook, Confluence

## Your Documentation Philosophy
You believe good documentation is:
1. Audience-aware: different content for different readers (users, developers, operators)
2. Task-oriented: organized around what people want to do, not what the system does
3. Tested: code examples are runnable, outputs are verified, links are checked
4. Versioned: documentation lives with the code it describes
5. Discoverable: proper navigation, search optimization, cross-linking
6. Maintainable: single source of truth, auto-generated where possible

## Documentation Types You Create
### README
- Project description with clear value proposition
- Quick start with copy-pasteable commands
- Installation options (npm, docker, source)
- Basic usage examples
- Links to detailed documentation
- Badges for build status, coverage, version

### API Documentation
- OpenAPI spec with complete endpoint definitions
- Request/response examples for every endpoint
- Error response documentation with error codes
- Authentication guide
- Rate limiting information
- SDK usage examples in multiple languages

### Architecture Documentation
- System context diagram (C4 Level 1)
- Container diagram (C4 Level 2)
- Component diagram (C4 Level 3) for complex services
- ADRs for every significant technical decision
- Data flow diagrams
- Deployment diagrams

### Changelog
- Grouped by version with release dates
- Categories: Added, Changed, Deprecated, Removed, Fixed, Security
- Links to relevant PRs and issues
- Migration guides for breaking changes
- Clear, user-facing language

### Code Documentation
- Module/file level: purpose, dependencies, usage
- Function level: parameters, return values, exceptions, examples
- Class level: responsibility, relationships, usage patterns
- Inline comments for non-obvious logic only

## Writing Style
- Active voice: "The function returns..." not "The value is returned by..."
- Present tense: "The API returns..." not "The API will return..."
- Concise: one idea per paragraph, short sentences
- Scannable: headings, bullet points, code blocks, tables
- Inclusive: avoid jargon without explanation, define acronyms on first use
- Consistent: use the same term for the same concept throughout

## Diagram Standards
- C4 model for architecture diagrams
- Sequence diagrams for interaction flows
- ER diagrams for data models
- State diagrams for complex state machines
- All diagrams generated from text (Mermaid/PlantUML) for version control

You never write documentation that goes stale. You design systems that keep docs in sync with code through automation, generation, and testing.`;

export class DocsAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'docs-agent',
      name: 'Documentation Agent',
      domain: 'docs',
      version: '1.0.0',
      maxConcurrentTasks: 3,
      timeoutMs: 90_000,
      retryAttempts: 2,
      temperature: 0.3,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'doc_generation',
        description: 'Generate README, API docs, architecture docs, and guides from code',
        confidence: 0.94,
        requiredTools: ['read_file', 'write_file', 'list_files'],
      },
      {
        name: 'docstring_enforcement',
        description: 'Add or enforce docstring/documentation coverage for functions and classes',
        confidence: 0.9,
        requiredTools: ['read_file', 'write_file', 'search_content'],
      },
      {
        name: 'diagram_generation',
        description: 'Generate Mermaid, PlantUML, or C4 diagrams from code or descriptions',
        confidence: 0.88,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'changelog',
        description: 'Generate changelogs from git history, PRs, and conventional commits',
        confidence: 0.87,
        requiredTools: ['run_command', 'write_file'],
      },
      {
        name: 'api_docs',
        description: 'Generate or update OpenAPI specifications from code or routes',
        confidence: 0.91,
        requiredTools: ['read_file', 'write_file', 'search_content'],
      },
      {
        name: 'architecture_docs',
        description: 'Create architecture documentation with C4 diagrams and ADRs',
        confidence: 0.86,
        requiredTools: ['read_file', 'write_file', 'list_files'],
      },
      {
        name: 'readme',
        description: 'Generate comprehensive README files with quickstart, usage, and badges',
        confidence: 0.93,
        requiredTools: ['read_file', 'write_file', 'list_files'],
      },
      {
        name: 'migration_guide',
        description: 'Write migration guides for breaking changes between versions',
        confidence: 0.84,
        requiredTools: ['read_file', 'write_file'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read source code, configs, and existing documentation',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write documentation files, diagrams, and specs',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'list_files',
        description: 'List project structure to understand what to document',
        parameters: { pattern: 'string' },
        required: false,
      },
      {
        name: 'search_content',
        description: 'Search for exported functions, classes, and APIs to document',
        parameters: { pattern: 'string', include: 'string' },
        required: true,
      },
      {
        name: 'run_command',
        description: 'Run git log for changelog generation or doc build commands',
        parameters: { command: 'string', timeout: 'number' },
        required: false,
      },
    ];
  }

  getSystemPrompt(): string {
    return DOCS_SYSTEM_PROMPT;
  }

  protected async performAnalysis(task: TaskContext): Promise<Omit<AnalyzeResult, 'agentId'>> {
    const confidence = this.calculateConfidence(task);
    const complexity = this.estimateComplexity(task);

    return {
      canHandle: confidence > 0.3,
      confidence,
      estimatedComplexity: complexity,
      estimatedTimeMs: this.estimateTime(complexity, task),
      requiredTools: this.determineRequiredTools(task),
      suggestedApproach: this.suggestApproach(task),
      risks: this.identifyRisks(task),
      dependencies: this.identifyDependencies(task),
    };
  }

  protected async performExecution(
    task: TaskContext,
    signal: AbortSignal
  ): Promise<Omit<ExecuteResult, 'agentId' | 'taskId' | 'executionTimeMs'>> {
    const artifacts: ExecuteResult['artifacts'] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    if (signal.aborted) {
      return { success: false, output: 'Task aborted', artifacts, tokensUsed: 0, warnings, errors: ['Aborted'] };
    }

    const approach = this.suggestApproach(task);

    artifacts.push({
      type: 'documentation',
      name: 'documentation',
      content: `# Documentation for: ${task.description}\n\n<!-- Approach: ${approach} -->`,
      language: 'markdown',
    });

    const desc = task.description.toLowerCase();
    if (desc.includes('diagram') || desc.includes('architecture')) {
      artifacts.push({
        type: 'diagram',
        name: 'architecture-diagram',
        content: '```mermaid\ngraph TD\n  A[Client] --> B[API]\n  B --> C[Database]\n```',
        language: 'mermaid',
      });
    }

    return {
      success: true,
      output: `Documentation task completed: ${approach}`,
      artifacts,
      tokensUsed: 2000,
      warnings,
      errors,
    };
  }

  protected async performVerification(
    result: ExecuteResult
  ): Promise<Omit<VerifyResult, 'agentId' | 'taskId' | 'verifiedAt'>> {
    const issues: VerifyResult['issues'] = [];
    const suggestions: string[] = [];

    for (const artifact of result.artifacts) {
      if (artifact.language === 'markdown') {
        if (!artifact.content.includes('# ')) {
          issues.push({
            severity: 'warning',
            message: 'Markdown document missing top-level heading',
            location: artifact.name,
            fix: 'Add a # heading as the document title',
          });
        }
        if (artifact.content.includes('TODO') || artifact.content.includes('FIXME')) {
          suggestions.push(`Documentation in ${artifact.name} contains TODO/FIXME markers`);
        }
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.6, 1 - issues.length * 0.1) : 0.3;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const keywords = [
      'document', 'docs', 'readme', 'changelog', 'guide', 'tutorial',
      'api doc', 'swagger', 'openapi', 'spec',
      'diagram', 'architecture', 'c4', 'adr', 'rfc',
      'docstring', 'comment', 'jsdoc', 'tsdoc',
      'migration guide', 'release notes', 'wiki',
    ];

    const desc = task.description.toLowerCase();
    const matches = keywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 3, 1.0);

    if (task.domain === 'docs' || task.domain === 'documentation') return Math.max(base, 0.7);
    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('full') || desc.includes('system') || desc.includes('architecture')) return 'critical';
    if (desc.includes('api') || desc.includes('guide') || desc.includes('migration')) return 'complex';
    if (desc.includes('readme') || desc.includes('changelog') || desc.includes('diagram')) return 'moderate';
    if (desc.includes('docstring') || desc.includes('comment') || desc.includes('function')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['read_file', 'write_file'];
    const desc = task.description.toLowerCase();
    if (desc.includes('changelog') || desc.includes('git') || desc.includes('history')) tools.push('run_command');
    if (desc.includes('api') || desc.includes('export') || desc.includes('function')) tools.push('search_content');
    if (desc.includes('project') || desc.includes('structure')) tools.push('list_files');
    return tools;
  }

  private estimateTime(complexity: string, task: TaskContext): number {
    const base: Record<string, number> = {
      trivial: 3_000, simple: 10_000, moderate: 25_000, complex: 50_000, critical: 100_000,
    };
    return base[complexity] || 20_000;
  }

  private suggestApproach(task: TaskContext): string {
    const desc = task.description.toLowerCase();
    if (desc.includes('readme')) return 'Generate README with project description, quickstart, installation, usage examples, and links to detailed docs';
    if (desc.includes('api')) return 'Create OpenAPI 3.1 spec from route analysis with request/response examples, error codes, and auth documentation';
    if (desc.includes('changelog')) return 'Generate changelog from git conventional commits, grouped by type with PR links and breaking change highlights';
    if (desc.includes('diagram')) return 'Generate Mermaid diagrams from code analysis: system context, component relationships, data flow, and sequence diagrams';
    if (desc.includes('architecture')) return 'Create C4 model documentation with context, container, and component diagrams plus ADRs for key decisions';
    if (desc.includes('docstring')) return 'Add comprehensive docstrings to all exported functions and classes following the project style (JSDoc/Google/NumPy)';
    return 'Analyze codebase, identify documentation gaps, and generate appropriate documentation for the target audience';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('auto')) risks.push('Auto-generated docs may miss context that only humans can provide');
    if (desc.includes('example')) risks.push('Code examples may become stale; prefer tested, executable examples');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('api')) deps.push('API route definitions and handler code');
    if (desc.includes('changelog')) deps.push('Git repository with conventional commit history');
    return deps;
  }
}
