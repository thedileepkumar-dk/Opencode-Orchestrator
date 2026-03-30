import { randomUUID } from 'crypto';
import type {
  TaskPlan,
  SubTask,
  TaskDomain,
  TaskPriority,
  TaskStatus,
  ModelTier,
  FrameworkDetection,
  LanguageDetection,
  TaskDependency,
  OrchestratorMode,
} from './types.js';

interface DomainKeyword {
  domain: TaskDomain;
  keywords: RegExp;
  priority: TaskPriority;
}

interface PatternRule {
  pattern: RegExp;
  extract: (match: RegExpMatchArray, prompt: string) => Partial<SubTask>;
}

const DOMAIN_RULES: DomainKeyword[] = [
  { domain: 'frontend', keywords: /\b(ui|component|react|vue|angular|css|html|jsx|tsx|styled|tailwind|layout|responsive|button|form|modal|page|view|widget|dom|render)\b/i, priority: 'medium' },
  { domain: 'backend', keywords: /\b(api|endpoint|route|server|express|fastify|graphql|rest|middleware|controller|service|handler|request|response|auth|jwt|session)\b/i, priority: 'high' },
  { domain: 'database', keywords: /\b(database|sql|postgres|mysql|mongo|redis|schema|migration|query|model|prisma|sequelize|typeorm|knex|index|table|collection)\b/i, priority: 'high' },
  { domain: 'security', keywords: /\b(security|vulnerability|xss|csrf|injection|encrypt|decrypt|hash|salt|oauth|cors|csp|sanitize|validate|escape|permission|rbac|acl)\b/i, priority: 'critical' },
  { domain: 'devops', keywords: /\b(docker|kubernetes|k8s|ci\/cd|pipeline|deploy|terraform|ansible|nginx|aws|gcp|azure|helm|container|pod|cluster|infrastructure)\b/i, priority: 'medium' },
  { domain: 'testing', keywords: /\b(test|jest|mocha|vitest|cypress|playwright|spec|assert|expect|mock|stub|coverage|e2e|unit test|integration test|snapshot)\b/i, priority: 'medium' },
  { domain: 'docs', keywords: /\b(document|readme|docs|jsdoc|tsdoc|comment|changelog|guide|tutorial|api doc|swagger|openapi)\b/i, priority: 'low' },
  { domain: 'performance', keywords: /\b(performance|optimize|cache|lazy|memo|debounce|throttle|bundle|webpack|vite|tree.?shak|code.?split|lighthouse|speed|memory leak|profil)\b/i, priority: 'high' },
  { domain: 'refactor', keywords: /\b(refactor|clean|reorganize|extract|rename|move|split|consolidate|simplify|duplicat|DRY|readability|maintainability)\b/i, priority: 'medium' },
  { domain: 'uiux', keywords: /\b(design|theme|color|font|spacing|animation|transition|accessibility|a11y|aria|contrast|usability|wireframe|prototype)\b/i, priority: 'medium' },
  { domain: 'ml', keywords: /\b(machine learning|ml|model|train|predict|tensor|pytorch|tensorflow|inference|dataset|feature|embed|vector|neural|llm|transformer)\b/i, priority: 'high' },
  { domain: 'mobile', keywords: /\b(mobile|react.?native|flutter|ios|android|swift|kotlin|expo|app.?store|play.?store|push.?notification)\b/i, priority: 'medium' },
];

const FRAMEWORK_DETECTORS: { name: string; patterns: RegExp[]; configFiles: string[] }[] = [
  { name: 'react', patterns: [/\breact\b/i, /\bjsx\b/, /\btsx\b/], configFiles: ['package.json', '.babelrc', 'webpack.config'] },
  { name: 'vue', patterns: [/\bvue\b/i, /\bvue\s*3\b/i, /\bnuxt\b/i], configFiles: ['vue.config', 'nuxt.config.ts'] },
  { name: 'angular', patterns: [/\bangular\b/i, /\b@NgModule\b/], configFiles: ['angular.json', 'tsconfig.app.json'] },
  { name: 'next', patterns: [/\bnext\.?js\b/i, /\bnext\s*1[34]\b/i], configFiles: ['next.config', 'next.config.mjs'] },
  { name: 'svelte', patterns: [/\bsvelte\b/i, /\bsveltekit\b/i], configFiles: ['svelte.config', 'svelte.config.ts'] },
  { name: 'express', patterns: [/\bexpress\b/i], configFiles: ['app', 'server'] },
  { name: 'fastify', patterns: [/\bfastify\b/i], configFiles: [] },
  { name: 'nestjs', patterns: [/\bnest\.?js\b/i, /\bNestFactory\b/], configFiles: ['nest-cli.json'] },
  { name: 'prisma', patterns: [/\bprisma\b/i], configFiles: ['prisma/schema.prisma'] },
  { name: 'tailwind', patterns: [/\btailwind\b/i], configFiles: ['tailwind.config', 'tailwind.config.ts'] },
  { name: 'typescript', patterns: [/\btypescript\b/i, /\b\.tsx?\b/], configFiles: ['tsconfig.json'] },
];

const LANGUAGE_DETECTORS: { language: string; patterns: RegExp[] }[] = [
  { language: 'typescript', patterns: [/\btypescript\b/i, /\.tsx?\b/, /\binterface\b/, /\btype\s+\w+\s*=/] },
  { language: 'javascript', patterns: [/\bjavascript\b/i, /\.jsx?\b/, /\bconst\s+\w+/] },
  { language: 'python', patterns: [/\bpython\b/i, /\.py\b/, /\bdef\s+\w+/, /\bimport\s+\w+/] },
  { language: 'rust', patterns: [/\brust\b/i, /\.rs\b/, /\bfn\s+\w+/, /\blet\s+mut\b/] },
  { language: 'go', patterns: [/\bgo\b(?!od)|\bgolang\b/i, /\.go\b/, /\bfunc\s+\w+/] },
  { language: 'java', patterns: [/\bjava\b(?!script)/i, /\.java\b/, /\bpublic\s+class\b/] },
];

const PATTERN_RULES: PatternRule[] = [
  {
    pattern: /create\s+(?:a\s+)?(?:new\s+)?(?:component|page|view)\s+(?:called\s+|named\s+)?(\w+)/i,
    extract: (m) => ({
      title: `Create ${m[1]} component`,
      domain: 'frontend' as TaskDomain,
      priority: 'medium' as TaskPriority,
      estimatedComplexity: 3,
    }),
  },
  {
    pattern: /add\s+(?:a\s+)?(?:new\s+)?(?:api|endpoint|route)\s+(?:for\s+|to\s+)?(.+?)(?:\.|$)/i,
    extract: (m) => ({
      title: `Add API endpoint for ${m[1].trim()}`,
      domain: 'backend' as TaskDomain,
      priority: 'high' as TaskPriority,
      estimatedComplexity: 4,
    }),
  },
  {
    pattern: /fix\s+(?:the\s+)?(?:bug|issue|error|problem)\s+(?:in\s+|with\s+)?(.+?)(?:\.|$)/i,
    extract: (m) => ({
      title: `Fix bug: ${m[1].trim()}`,
      domain: 'general' as TaskDomain,
      priority: 'high' as TaskPriority,
      estimatedComplexity: 5,
    }),
  },
  {
    pattern: /write\s+(?:unit\s+|integration\s+|e2e\s+)?tests?\s+(?:for\s+)?(.+?)(?:\.|$)/i,
    extract: (m) => ({
      title: `Write tests for ${m[1].trim()}`,
      domain: 'testing' as TaskDomain,
      priority: 'medium' as TaskPriority,
      estimatedComplexity: 4,
    }),
  },
  {
    pattern: /refactor\s+(?:the\s+)?(.+?)(?:\s+to\s+(.+?))?(?:\.|$)/i,
    extract: (m) => ({
      title: `Refactor ${m[1].trim()}${m[2] ? ` to ${m[2].trim()}` : ''}`,
      domain: 'refactor' as TaskDomain,
      priority: 'medium' as TaskPriority,
      estimatedComplexity: 5,
    }),
  },
  {
    pattern: /optimize\s+(?:the\s+)?(.+?)(?:\s+for\s+(.+?))?(?:\.|$)/i,
    extract: (m) => ({
      title: `Optimize ${m[1].trim()}${m[2] ? ` for ${m[2].trim()}` : ''}`,
      domain: 'performance' as TaskDomain,
      priority: 'high' as TaskPriority,
      estimatedComplexity: 6,
    }),
  },
  {
    pattern: /(?:set\s+up|configure|add)\s+(docker|ci\/cd|pipeline|nginx|deploy)/i,
    extract: (m) => ({
      title: `Set up ${m[1]}`,
      domain: 'devops' as TaskDomain,
      priority: 'medium' as TaskPriority,
      estimatedComplexity: 5,
    }),
  },
  {
    pattern: /(?:secure|harden|fix\s+security)\s+(?:the\s+)?(.+?)(?:\.|$)/i,
    extract: (m) => ({
      title: `Security hardening: ${m[1].trim()}`,
      domain: 'security' as TaskDomain,
      priority: 'critical' as TaskPriority,
      estimatedComplexity: 7,
    }),
  },
  {
    pattern: /(?:add|write|generate)\s+(?:documentation|docs|readme)\s+(?:for\s+)?(.+?)(?:\.|$)/i,
    extract: (m) => ({
      title: `Write documentation for ${m[1].trim()}`,
      domain: 'docs' as TaskDomain,
      priority: 'low' as TaskPriority,
      estimatedComplexity: 2,
    }),
  },
  {
    pattern: /(?:migrate|move)\s+(?:from\s+)?(.+?)\s+to\s+(.+?)(?:\.|$)/i,
    extract: (m) => ({
      title: `Migrate from ${m[1].trim()} to ${m[2].trim()}`,
      domain: 'general' as TaskDomain,
      priority: 'high' as TaskPriority,
      estimatedComplexity: 8,
    }),
  },
];

const TASK_SPLITTERS = [
  /\band\s+(?:also\s+)?/i,
  /\bthen\s+/i,
  /\balso\s+/i,
  /\bplus\s+/i,
  /\badditionally\s*,?\s*/i,
  /\b(?:first|second|third|finally)\s*,?\s*/i,
  /\bnext\s*,?\s*/i,
  /;\s*/,
  /\n\s*[-*•]\s*/,
  /\n{2,}/,
];

function splitIntoSegments(prompt: string): string[] {
  let segments = [prompt];
  for (const splitter of TASK_SPLITTERS) {
    const next: string[] = [];
    for (const seg of segments) {
      next.push(...seg.split(splitter).map((s) => s.trim()).filter(Boolean));
    }
    segments = next;
  }
  return segments.length > 0 ? segments : [prompt];
}

function detectDomains(text: string): { domain: TaskDomain; confidence: number }[] {
  const scores = new Map<TaskDomain, number>();
  for (const rule of DOMAIN_RULES) {
    const matches = text.match(new RegExp(rule.keywords.source, 'gi'));
    if (matches) {
      scores.set(rule.domain, (scores.get(rule.domain) || 0) + matches.length);
    }
  }
  if (scores.size === 0) return [{ domain: 'general', confidence: 0.3 }];
  const maxScore = Math.max(...scores.values());
  return [...scores.entries()]
    .map(([domain, score]) => ({ domain, confidence: Math.min(score / maxScore, 1) }))
    .sort((a, b) => b.confidence - a.confidence);
}

function detectFrameworks(prompt: string): FrameworkDetection[] {
  const detected: FrameworkDetection[] = [];
  for (const fw of FRAMEWORK_DETECTORS) {
    for (const pattern of fw.patterns) {
      const match = prompt.match(pattern);
      if (match) {
        const existing = detected.find((d) => d.name === fw.name);
        if (!existing) {
          detected.push({
            name: fw.name,
            confidence: 0.8,
            configFiles: fw.configFiles,
          });
        }
      }
    }
  }
  return detected;
}

function detectLanguages(prompt: string): LanguageDetection[] {
  const detected: LanguageDetection[] = [];
  for (const lang of LANGUAGE_DETECTORS) {
    for (const pattern of lang.patterns) {
      if (pattern.test(prompt)) {
        const existing = detected.find((d) => d.language === lang.language);
        if (!existing) {
          detected.push({ language: lang.language, confidence: 0.7, files: [] });
        }
        break;
      }
    }
  }
  if (detected.length === 0) {
    detected.push({ language: 'typescript', confidence: 0.4, files: [] });
  }
  return detected;
}

function matchPattern(segment: string): Partial<SubTask> | null {
  for (const rule of PATTERN_RULES) {
    const match = segment.match(rule.pattern);
    if (match) {
      return rule.extract(match, segment);
    }
  }
  return null;
}

function selectModelTier(complexity: number, domain: TaskDomain): ModelTier {
  if (domain === 'security' || domain === 'ml') return 'powerful';
  if (complexity <= 3) return 'cheap';
  if (complexity <= 6) return 'standard';
  if (complexity <= 8) return 'powerful';
  return 'reasoning';
}

function inferFilesToModify(segment: string, domain: TaskDomain): string[] {
  const filePatterns = [
    /(?:in|from|to|of)\s+[`'"]?([\w\-./]+\.\w{1,6})[`'"]?/gi,
    /[`'"]([\w\-./]+\.\w{1,6})[`'"]+/g,
  ];
  const files = new Set<string>();
  for (const pattern of filePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(segment)) !== null) {
      files.add(match[1]);
    }
  }
  if (files.size === 0) {
    const domainFileHints: Record<TaskDomain, string[]> = {
      frontend: ['src/components/', 'src/pages/', 'src/styles/'],
      backend: ['src/api/', 'src/routes/', 'src/controllers/'],
      database: ['prisma/schema.prisma', 'src/models/', 'migrations/'],
      security: ['src/middleware/auth.ts', 'src/utils/validation.ts'],
      devops: ['Dockerfile', '.github/workflows/', 'docker-compose.yml'],
      testing: ['tests/', '__tests__/', 'src/**/*.test.ts'],
      docs: ['README.md', 'docs/'],
      performance: ['webpack.config', 'vite.config.ts'],
      refactor: ['src/'],
      uiux: ['src/styles/', 'src/theme/'],
      ml: ['models/', 'src/training/'],
      mobile: ['src/screens/', 'app/'],
      general: ['src/'],
    };
    return domainFileHints[domain] || ['src/'];
  }
  return [...files];
}

function buildDependencyGraph(subtasks: SubTask[]): TaskDependency[][] {
  const deps: TaskDependency[][] = subtasks.map(() => []);
  for (let i = 0; i < subtasks.length; i++) {
    for (let j = 0; j < i; j++) {
      const sharedFiles = subtasks[i].filesToModify.filter((f) =>
        subtasks[j].filesToModify.some((jf) => f.startsWith(jf) || jf.startsWith(f))
      );
      if (sharedFiles.length > 0) {
        deps[i].push({ taskId: subtasks[j].id, type: 'blocks' });
      }
      if (subtasks[i].domain === 'testing' && subtasks[j].domain !== 'testing') {
        deps[i].push({ taskId: subtasks[j].id, type: 'soft' });
      }
      if (subtasks[i].domain === 'docs' && subtasks[j].domain !== 'docs') {
        deps[i].push({ taskId: subtasks[j].id, type: 'soft' });
      }
    }
  }
  return deps;
}

function topologicalSort(subtasks: SubTask[]): string[][] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const task of subtasks) {
    inDegree.set(task.id, 0);
    adjList.set(task.id, []);
  }
  for (const task of subtasks) {
    for (const dep of task.dependencies) {
      if (dep.type === 'blocks' && adjList.has(dep.taskId)) {
        adjList.get(dep.taskId)!.push(task.id);
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
      }
    }
  }

  const waves: string[][] = [];
  const visited = new Set<string>();

  while (visited.size < subtasks.length) {
    const wave: string[] = [];
    for (const task of subtasks) {
      if (visited.has(task.id)) continue;
      const deg = [...task.dependencies]
        .filter((d) => d.type === 'blocks')
        .filter((d) => !visited.has(d.taskId)).length;
      if (deg === 0) {
        wave.push(task.id);
      }
    }
    if (wave.length === 0) {
      const remaining = subtasks.filter((t) => !visited.has(t.id)).map((t) => t.id);
      waves.push(remaining);
      break;
    }
    for (const id of wave) visited.add(id);
    waves.push(wave);
  }

  return waves;
}

function extractFilesFromPrompt(prompt: string): string[] {
  const fileRegex = /[`'"]?([\w\-./]+\.\w{1,6})[`'"]?/g;
  const files = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = fileRegex.exec(prompt)) !== null) {
    if (!match[1].startsWith('http')) {
      files.add(match[1]);
    }
  }
  return [...files];
}

export class TaskDecomposer {
  decompose(prompt: string, mode: OrchestratorMode = 'auto-pilot'): TaskPlan {
    const segments = splitIntoSegments(prompt);
    const frameworks = detectFrameworks(prompt);
    const languages = detectLanguages(prompt);
    const promptFiles = extractFilesFromPrompt(prompt);

    const subtasks: SubTask[] = segments.map((segment, index) => {
      const domains = detectDomains(segment);
      const primaryDomain = domains[0].domain;
      const patternMatch = matchPattern(segment);
      const complexity = patternMatch?.estimatedComplexity ?? this.estimateComplexity(segment, primaryDomain);
      const files = inferFilesToModify(segment, primaryDomain);

      const subtask: SubTask = {
        id: `task-${randomUUID().slice(0, 8)}`,
        title: patternMatch?.title || this.generateTitle(segment, primaryDomain),
        description: segment.trim(),
        domain: patternMatch?.domain || primaryDomain,
        priority: patternMatch?.priority || this.inferPriority(segment, primaryDomain),
        status: 'pending' as TaskStatus,
        dependencies: [],
        filesToModify: promptFiles.length > 0 && index === 0 ? [...new Set([...files, ...promptFiles])] : files,
        estimatedComplexity: complexity,
        requiredModelTier: selectModelTier(complexity, primaryDomain),
        metadata: {
          detectedDomains: domains,
          segmentIndex: index,
          frameworkHints: frameworks.map((f) => f.name),
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return subtask;
    });

    if (subtasks.length === 0) {
      const domain = detectDomains(prompt)[0]?.domain || 'general';
      const complexity = this.estimateComplexity(prompt, domain);
      subtasks.push({
        id: `task-${randomUUID().slice(0, 8)}`,
        title: this.generateTitle(prompt, domain),
        description: prompt.trim(),
        domain,
        priority: this.inferPriority(prompt, domain),
        status: 'pending',
        dependencies: [],
        filesToModify: promptFiles.length > 0 ? promptFiles : inferFilesToModify(prompt, domain),
        estimatedComplexity: complexity,
        requiredModelTier: selectModelTier(complexity, domain),
        metadata: { detectedDomains: [{ domain, confidence: 1 }] },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const depGraph = buildDependencyGraph(subtasks);
    for (let i = 0; i < subtasks.length; i++) {
      subtasks[i].dependencies = depGraph[i];
    }

    const executionOrder = topologicalSort(subtasks);

    return {
      id: `plan-${randomUUID().slice(0, 8)}`,
      originalPrompt: prompt,
      subtasks,
      detectedFrameworks: frameworks,
      detectedLanguages: languages,
      executionOrder,
      mode,
      createdAt: Date.now(),
    };
  }

  private estimateComplexity(text: string, domain: TaskDomain): number {
    let score = 3;
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 30) score += 1;
    if (wordCount > 60) score += 1;
    if (wordCount > 100) score += 1;
    const complexWords = ['integrate', 'migrate', 'refactor', 'optimize', 'architect', 'design', 'implement', 'comprehensive'];
    for (const w of complexWords) {
      if (text.toLowerCase().includes(w)) score += 1;
    }
    if (domain === 'security' || domain === 'ml') score += 2;
    if (domain === 'database') score += 1;
    const multiStepIndicators = [/\bthen\b/i, /\bafter\s+that\b/i, /\bfinally\b/i, /\n/];
    for (const indicator of multiStepIndicators) {
      if (indicator.test(text)) score += 1;
    }
    return Math.min(Math.max(score, 1), 10);
  }

  private generateTitle(text: string, domain: TaskDomain): string {
    const cleaned = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const truncated = cleaned.length > 80 ? cleaned.slice(0, 77) + '...' : cleaned;
    return `[${domain}] ${truncated.charAt(0).toUpperCase() + truncated.slice(1)}`;
  }

  private inferPriority(text: string, domain: TaskDomain): TaskPriority {
    const lower = text.toLowerCase();
    if (/\burgent\b|\bcritical\b|\bblocker\b|\basap\b|\bsecurity\b.*\bfix\b/.test(lower)) return 'critical';
    if (/\bimportant\b|\bhigh\b|\bpriority\b|\bbug\b|\bfix\b|\bbroken\b/.test(lower)) return 'high';
    if (/\bnice.to.have\b|\blow\b|\bminor\b|\bsuggestion\b/.test(lower)) return 'low';
    if (domain === 'security') return 'critical';
    if (domain === 'testing' || domain === 'docs') return 'medium';
    return 'medium';
  }
}
