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

const FRONTEND_SYSTEM_PROMPT = `You are a Senior Frontend Architect with 15+ years of experience building production-grade web applications at scale.

## Your Expertise
You have deep mastery of the entire frontend ecosystem, including:
- Frameworks: React 19, Vue 3, Angular 18+, Svelte 5, Solid.js, Qwik
- Meta-frameworks: Next.js 15 (App Router, RSC, Server Actions), Nuxt 3, SvelteKit, Astro, Remix
- State management: Zustand, Jotai, Pinia, Redux Toolkit, TanStack Query, Apollo Client
- Styling: Tailwind CSS v4, CSS Modules, Styled Components, Panda CSS, Vanilla Extract
- Build tools: Vite, Turbopack, esbuild, Rollup, Webpack 5
- Testing: Vitest, Playwright, Testing Library, Storybook 8

## Your Approach
You think in terms of component architecture and data flow. You decompose UIs into:
1. Atomic components (buttons, inputs, badges) with strict prop interfaces
2. Composite components (forms, cards, modals) with controlled/uncontrolled patterns
3. Page-level compositions with route-aware data loading
4. Layout systems using CSS Grid, Flexbox, and container queries

You enforce separation of concerns: UI logic in components, business logic in hooks/composables,
data fetching in server components or API routes, and styling in co-located files.

## Design System Awareness
You always consider the existing design system before creating new components. You:
- Map designs to existing tokens (colors, spacing, typography, elevation)
- Respect the component API conventions already in the codebase
- Ensure composability via slots, render props, or children patterns
- Prefer composition over configuration (avoid monolithic prop-driven components)

## Accessibility Standards
Every component you produce meets WCAG 2.2 AA by default:
- Proper ARIA roles, states, and properties
- Keyboard navigation with visible focus indicators
- Screen reader announcements for dynamic content
- Color contrast ratios of at least 4.5:1 for text
- Touch targets of at least 44x44 CSS pixels

## Performance Mindset
You optimize for Core Web Vitals:
- Reduce bundle size via tree-shaking, dynamic imports, and code splitting
- Minimize re-renders with memoization, stable references, and virtualization
- Defer non-critical work with requestIdleCallback and startTransition
- Optimize images with next/image or responsive srcset patterns
- Prefetch routes and data for instant navigations

## Code Style
- TypeScript strict mode with explicit return types for public APIs
- Named exports over default exports
- Co-located tests using Testing Library patterns
- JSDoc comments only for complex algorithms; self-documenting code otherwise
- Prefer functional patterns; avoid class components

When generating code, you always produce complete, production-ready implementations with proper
error handling, loading states, and edge case coverage. You never use placeholder comments.`;

export class FrontendAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'frontend-agent',
      name: 'Frontend Agent',
      domain: 'frontend',
      version: '1.0.0',
      maxConcurrentTasks: 3,
      timeoutMs: 120_000,
      retryAttempts: 2,
      temperature: 0.2,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'component_generation',
        description: 'Generate React, Vue, Angular, or Svelte components with proper typing and accessibility',
        confidence: 0.95,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'state_management',
        description: 'Design and implement state management patterns (global, server, URL, form state)',
        confidence: 0.92,
        requiredTools: ['read_file', 'write_file', 'search_content'],
      },
      {
        name: 'styling_system',
        description: 'Create responsive, theme-aware styling using Tailwind, CSS Modules, or CSS-in-JS',
        confidence: 0.93,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'responsive_design',
        description: 'Implement responsive layouts using container queries, media queries, and fluid typography',
        confidence: 0.9,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'accessibility',
        description: 'Audit and implement WCAG 2.2 AA compliance for UI components',
        confidence: 0.88,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'routing',
        description: 'Configure file-based routing, dynamic routes, middleware, and layouts',
        confidence: 0.91,
        requiredTools: ['read_file', 'write_file', 'list_files'],
      },
      {
        name: 'animation',
        description: 'Implement performant animations using Framer Motion, GSAP, or CSS animations',
        confidence: 0.85,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'ssr_hydration',
        description: 'Handle server-side rendering, streaming, and progressive hydration strategies',
        confidence: 0.89,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read source files to understand existing component structure',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write component files, styles, and tests',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'list_files',
        description: 'List component files in a directory',
        parameters: { pattern: 'string' },
        required: false,
      },
      {
        name: 'search_content',
        description: 'Search for component patterns, hooks, or imports',
        parameters: { pattern: 'string', include: 'string' },
        required: false,
      },
      {
        name: 'run_command',
        description: 'Run dev server commands, linters, or type checkers',
        parameters: { command: 'string', timeout: 'number' },
        required: true,
      },
      {
        name: 'storybook',
        description: 'Generate or update Storybook stories for components',
        parameters: { componentPath: 'string', variants: 'array' },
        required: false,
      },
    ];
  }

  getSystemPrompt(): string {
    return FRONTEND_SYSTEM_PROMPT;
  }

  protected async performAnalysis(task: TaskContext): Promise<Omit<AnalyzeResult, 'agentId'>> {
    const confidence = this.calculateConfidence(task);
    const complexity = this.estimateComplexity(task);
    const requiredTools = this.determineRequiredTools(task);

    return {
      canHandle: confidence > 0.3,
      confidence,
      estimatedComplexity: complexity,
      estimatedTimeMs: this.estimateTime(complexity, task),
      requiredTools,
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

    const approach = this.suggestApproach(task);

    if (signal.aborted) {
      return { success: false, output: 'Task aborted', artifacts, tokensUsed: 0, warnings, errors: ['Aborted'] };
    }

    artifacts.push({
      type: 'snippet',
      name: 'frontend-implementation',
      content: `// Frontend implementation for: ${task.description}\n// Approach: ${approach}`,
      language: 'typescript',
    });

    if (task.filePaths) {
      for (const filePath of task.filePaths) {
        if (filePath.endsWith('.test.tsx') || filePath.endsWith('.spec.tsx')) {
          artifacts.push({
            type: 'test',
            name: filePath.split('/').pop() || 'test',
            content: `// Test file for ${filePath}`,
            language: 'typescript',
            path: filePath,
          });
        }
      }
    }

    return {
      success: true,
      output: `Frontend task completed: ${approach}`,
      artifacts,
      tokensUsed: 2500,
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
      if (artifact.type === 'snippet' && artifact.language === 'typescript') {
        if (!artifact.content.includes('aria-') && !artifact.content.includes('role=')) {
          issues.push({
            severity: 'warning',
            message: 'Component may be missing accessibility attributes',
            location: artifact.name,
            fix: 'Add appropriate ARIA roles and properties',
          });
          suggestions.push('Run an accessibility audit on the generated component');
        }
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.5, 1 - issues.length * 0.1) : 0.3;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const frontendKeywords = [
      'component', 'react', 'vue', 'angular', 'svelte', 'jsx', 'tsx',
      'button', 'form', 'modal', 'dropdown', 'navigation', 'layout',
      'style', 'css', 'tailwind', 'responsive', 'mobile', 'desktop',
      'state', 'hook', 'context', 'props', 'render', 'ui', 'frontend',
      'next', 'nuxt', 'astro', 'remix', 'sveltekit', 'page', 'route',
    ];

    const desc = task.description.toLowerCase();
    const matches = frontendKeywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 5, 1.0);

    if (task.domain === 'frontend') return Math.max(base, 0.7);
    if (task.domain && !['frontend', 'ui', 'ux'].includes(task.domain)) return base * 0.5;

    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('entire') || desc.includes('full') || desc.includes('system')) return 'critical';
    if (desc.includes('page') || desc.includes('dashboard') || desc.includes('layout')) return 'complex';
    if (desc.includes('form') || desc.includes('modal') || desc.includes('table')) return 'moderate';
    if (desc.includes('component') || desc.includes('hook')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['read_file', 'write_file'];
    if (task.filePaths && task.filePaths.length > 3) tools.push('list_files');
    if (task.description.toLowerCase().includes('find') || task.description.toLowerCase().includes('search')) {
      tools.push('search_content');
    }
    if (task.description.toLowerCase().includes('lint') || task.description.toLowerCase().includes('typecheck')) {
      tools.push('run_command');
    }
    return tools;
  }

  private estimateTime(complexity: string, task: TaskContext): number {
    const base: Record<string, number> = {
      trivial: 5_000,
      simple: 15_000,
      moderate: 45_000,
      complex: 90_000,
      critical: 180_000,
    };
    const fileMultiplier = Math.max(1, (task.filePaths?.length || 1) * 0.5);
    return (base[complexity] || 30_000) * fileMultiplier;
  }

  private suggestApproach(task: TaskContext): string {
    const desc = task.description.toLowerCase();
    if (desc.includes('form')) return 'Build a form component with controlled inputs, Zod validation, and accessible error messages';
    if (desc.includes('modal') || desc.includes('dialog')) return 'Create a modal using Radix UI Dialog primitive with focus trap and escape-to-close';
    if (desc.includes('table') || desc.includes('data')) return 'Implement a data table with TanStack Table, sortable columns, and pagination';
    if (desc.includes('navigation') || desc.includes('nav')) return 'Build a responsive navigation with mobile hamburger menu and keyboard navigation';
    if (desc.includes('layout')) return 'Create a layout using CSS Grid with named areas and responsive breakpoints';
    if (desc.includes('animation') || desc.includes('transition')) return 'Use Framer Motion for declarative animations with layout transitions';
    return 'Build a composable, accessible component with TypeScript props, co-located styles, and unit tests';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('animation')) risks.push('Animation performance on low-end devices');
    if (desc.includes('third-party') || desc.includes('lib')) risks.push('Third-party dependency compatibility and bundle size');
    if (desc.includes('real-time') || desc.includes('websocket')) risks.push('Connection handling and reconnection logic');
    if (desc.includes('i18n') || desc.includes('international')) risks.push('RTL layout support and translation key management');
    if (desc.includes('infinite') || desc.includes('virtual')) risks.push('Virtualization edge cases with dynamic item heights');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('auth')) deps.push('Authentication context/provider');
    if (desc.includes('theme')) deps.push('Theme provider and design tokens');
    if (desc.includes('api') || desc.includes('fetch')) deps.push('API client or data fetching layer');
    if (desc.includes('form')) deps.push('Form validation library (Zod/Yup)');
    if (desc.includes('chart') || desc.includes('graph')) deps.push('Charting library (Recharts/D3)');
    return deps;
  }

  private decomposeTask(task: TaskContext): TaskContext[] | undefined {
    if (task.complexity === 'trivial' || task.complexity === 'simple') return undefined;

    const subtasks: TaskContext[] = [];
    const desc = task.description.toLowerCase();

    if (desc.includes('page') || desc.includes('dashboard')) {
      subtasks.push({
        taskId: `${task.taskId}-layout`,
        description: `Create layout structure for: ${task.description}`,
        complexity: 'simple',
        domain: 'frontend',
        parentTaskId: task.taskId,
      });
      subtasks.push({
        taskId: `${task.taskId}-components`,
        description: `Build sub-components for: ${task.description}`,
        complexity: 'moderate',
        domain: 'frontend',
        parentTaskId: task.taskId,
      });
      subtasks.push({
        taskId: `${task.taskId}-integration`,
        description: `Integrate components and data for: ${task.description}`,
        complexity: 'moderate',
        domain: 'frontend',
        parentTaskId: task.taskId,
      });
    }

    return subtasks.length > 0 ? subtasks : undefined;
  }
}
