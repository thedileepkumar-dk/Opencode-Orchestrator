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

const UIUX_SYSTEM_PROMPT = `You are a Senior Product Designer with 12+ years of experience bridging design and engineering, specializing in design systems, component API design, and accessibility.

## Your Expertise
You operate at the intersection of design and code:
- Design systems: Figma Tokens, Style Dictionary, design-to-code pipelines
- Component API design: prop interfaces, slot patterns, compound components
- Accessibility: WCAG 2.2 AA/AAA, ARIA Authoring Practices, assistive technology testing
- Design tokens: color (OKLCH), typography (fluid scales), spacing (4px grid), elevation, motion
- Information architecture: navigation patterns, content hierarchy, progressive disclosure
- Interaction design: micro-interactions, state transitions, gesture patterns
- Responsive design: mobile-first, container queries, adaptive vs responsive strategies

## Your Design System Philosophy
You believe design systems are living code, not static documentation:
1. Single source of truth: design tokens in code, synced with Figma via API
2. Composable primitives: atomic components that combine into complex patterns
3. Theming via CSS custom properties: light/dark/high-contrast modes
4. Versioned and published: semver, changelogs, migration guides
5. Tested: visual regression (Chromatic), accessibility (axe), interaction (Testing Library)

## Token Architecture
You structure design tokens in three tiers:
- Global tokens: raw values (--color-blue-500: oklch(0.55 0.15 250))
- Alias tokens: semantic meaning (--color-action-primary: var(--color-blue-500))
- Component tokens: scoped overrides (--button-bg: var(--color-action-primary))

## Component API Design
You design component APIs that are:
- Predictable: consistent naming across all components
- Composable: slots and render props over monolithic props
- Accessible: built-in ARIA, keyboard handling, focus management
- Themeable: CSS custom property hooks for every visual aspect
- Documented: Storybook stories covering all states and variants

## Accessibility Audit Process
When auditing, you check systematically:
1. Semantic HTML: correct element usage (button vs div, nav vs div)
2. ARIA: roles, states, properties, and live regions
3. Keyboard: tab order, focus visible, skip links, keyboard traps
4. Screen reader: announcements, labels, descriptions, landmarks
5. Visual: contrast ratios, text resizing, zoom to 200%, reduced motion
6. Touch: target sizes (44x44px), gesture alternatives

## Visual QA Checklist
- Consistent spacing using the defined scale (4, 8, 12, 16, 24, 32, 48, 64)
- Typography following the modular scale with proper line-height
- Color usage respecting semantic mappings (not raw hex values)
- Responsive behavior tested at 320px, 768px, 1024px, 1440px, 1920px
- Dark mode that adjusts contrast ratios, not just inverts colors

## Code Output Style
When you output code, you produce:
- CSS custom property definitions for all tokens
- Component interfaces (TypeScript) that enforce accessibility
- Storybook stories covering all variants and states
- Documentation for designers explaining how to use each component

You never produce generic placeholder styles. Every value is deliberate, token-based, and systematic.`;

export class UIUXAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'uiux-agent',
      name: 'UI/UX Agent',
      domain: 'uiux',
      version: '1.0.0',
      maxConcurrentTasks: 2,
      timeoutMs: 90_000,
      retryAttempts: 2,
      temperature: 0.3,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'design_token_generation',
        description: 'Generate design token systems (colors, typography, spacing, elevation) as CSS custom properties',
        confidence: 0.94,
        requiredTools: ['write_file'],
      },
      {
        name: 'component_api_design',
        description: 'Design component prop interfaces, slot patterns, and compound component architectures',
        confidence: 0.92,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'accessibility_audit',
        description: 'Perform WCAG 2.2 compliance audits with remediation recommendations',
        confidence: 0.93,
        requiredTools: ['read_file', 'search_content', 'run_command'],
      },
      {
        name: 'responsive_layout',
        description: 'Design responsive layout systems using CSS Grid, Flexbox, and container queries',
        confidence: 0.9,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'interaction_design',
        description: 'Design micro-interactions, transitions, and animation choreography',
        confidence: 0.85,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'design_documentation',
        description: 'Generate component documentation, usage guidelines, and design specs',
        confidence: 0.88,
        requiredTools: ['write_file'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read existing components and styles for analysis',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write design tokens, styles, and documentation',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'search_content',
        description: 'Search for existing design tokens, color usage, or component patterns',
        parameters: { pattern: 'string', include: 'string' },
        required: false,
      },
      {
        name: 'run_command',
        description: 'Run accessibility linting tools (axe, eslint-jsx-a11y)',
        parameters: { command: 'string', timeout: 'number' },
        required: false,
      },
      {
        name: 'screenshot',
        description: 'Capture component screenshots for visual comparison',
        parameters: { url: 'string', viewport: 'object' },
        required: false,
      },
    ];
  }

  getSystemPrompt(): string {
    return UIUX_SYSTEM_PROMPT;
  }

  protected async performAnalysis(task: TaskContext): Promise<Omit<AnalyzeResult, 'agentId'>> {
    const confidence = this.calculateConfidence(task);
    const complexity = this.estimateComplexity(task);

    return {
      canHandle: confidence > 0.3,
      confidence,
      estimatedComplexity: complexity,
      estimatedTimeMs: this.estimateTime(complexity),
      requiredTools: this.determineRequiredTools(task),
      suggestedApproach: this.suggestApproach(task),
      risks: this.identifyRisks(task),
      dependencies: this.identifyDependencies(task),
      subtasks: this.decomposeTask(task),
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
      type: 'snippet',
      name: 'uiux-output',
      content: `/* UI/UX output for: ${task.description}\n * Approach: ${approach} */`,
      language: 'css',
    });

    const desc = task.description.toLowerCase();
    if (desc.includes('token') || desc.includes('theme') || desc.includes('color')) {
      artifacts.push({
        type: 'config',
        name: 'design-tokens',
        content: ':root {\n  /* Generated design tokens */\n}',
        language: 'css',
      });
    }

    return {
      success: true,
      output: `UI/UX task completed: ${approach}`,
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
      if (artifact.language === 'css' && artifact.content.includes('!important')) {
        issues.push({
          severity: 'warning',
          message: '!important detected; prefer specificity management over force',
          location: artifact.name,
          fix: 'Restructure CSS specificity or use CSS layers',
        });
      }
      if (artifact.content.includes('px') && !artifact.content.includes('rem') && !artifact.content.includes('em')) {
        suggestions.push('Consider using relative units (rem/em) for better scalability');
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.6, 1 - issues.length * 0.1) : 0.3;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const keywords = [
      'design', 'ui', 'ux', 'component', 'style', 'css', 'token', 'theme',
      'color', 'typography', 'spacing', 'layout', 'responsive', 'mobile',
      'accessibility', 'a11y', 'wcag', 'aria', 'screen reader',
      'animation', 'transition', 'interaction', 'gesture',
      'figma', 'design system', 'button', 'form', 'modal', 'card',
    ];

    const desc = task.description.toLowerCase();
    const matches = keywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 4, 1.0);

    if (task.domain === 'uiux' || task.domain === 'design') return Math.max(base, 0.7);
    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('design system') || desc.includes('full') || desc.includes('audit')) return 'critical';
    if (desc.includes('theme') || desc.includes('token') || desc.includes('a11y')) return 'complex';
    if (desc.includes('component') || desc.includes('layout')) return 'moderate';
    if (desc.includes('style') || desc.includes('css')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['write_file'];
    if (task.filePaths && task.filePaths.length > 0) tools.push('read_file');
    const desc = task.description.toLowerCase();
    if (desc.includes('audit') || desc.includes('review') || desc.includes('find')) tools.push('search_content');
    if (desc.includes('test') || desc.includes('lint')) tools.push('run_command');
    return tools;
  }

  private estimateTime(complexity: string): number {
    const base: Record<string, number> = {
      trivial: 3_000, simple: 10_000, moderate: 30_000, complex: 60_000, critical: 120_000,
    };
    return base[complexity] || 20_000;
  }

  private suggestApproach(task: TaskContext): string {
    const desc = task.description.toLowerCase();
    if (desc.includes('token')) return 'Create a three-tier token system (global, alias, component) with CSS custom properties and dark mode support';
    if (desc.includes('a11y') || desc.includes('accessibility')) return 'Perform systematic WCAG 2.2 audit: semantic HTML, ARIA, keyboard nav, contrast, screen reader testing';
    if (desc.includes('component')) return 'Design composable component API with slots, proper TypeScript interfaces, and built-in accessibility';
    if (desc.includes('theme')) return 'Build theme system using CSS custom properties with light/dark/high-contrast modes';
    if (desc.includes('layout')) return 'Create responsive layout using CSS Grid with named areas, container queries, and fluid spacing';
    return 'Apply systematic design thinking: research existing patterns, define requirements, create solution, validate accessibility';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('token') || desc.includes('theme')) risks.push('Breaking existing styles if tokens change globally');
    if (desc.includes('animation')) risks.push('Motion sensitivity concerns; respect prefers-reduced-motion');
    if (desc.includes('color')) risks.push('Contrast ratio failures in certain color combinations');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('figma')) deps.push('Figma API access and design file structure');
    if (desc.includes('component')) deps.push('Existing component library and framework choice');
    if (desc.includes('theme')) deps.push('Existing color palette and brand guidelines');
    return deps;
  }

  private decomposeTask(task: TaskContext): TaskContext[] | undefined {
    if (task.complexity === 'trivial' || task.complexity === 'simple') return undefined;
    const subtasks: TaskContext[] = [];

    if (task.description.toLowerCase().includes('design system')) {
      subtasks.push(
        { taskId: `${task.taskId}-tokens`, description: 'Define design token taxonomy and values', complexity: 'moderate', domain: 'uiux', parentTaskId: task.taskId },
        { taskId: `${task.taskId}-primitives`, description: 'Design primitive component APIs', complexity: 'complex', domain: 'uiux', parentTaskId: task.taskId },
        { taskId: `${task.taskId}-a11y`, description: 'Audit all components for WCAG compliance', complexity: 'moderate', domain: 'uiux', parentTaskId: task.taskId },
      );
    }

    return subtasks.length > 0 ? subtasks : undefined;
  }
}
