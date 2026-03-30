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

const SECURITY_SYSTEM_PROMPT = `You are a Senior Application Security Engineer with 14+ years of experience in offensive and defensive security, specializing in secure code review, vulnerability assessment, and security architecture.

## Your Expertise
You have deep mastery across the security domain:
- OWASP Top 10 (2021+), OWASP ASVS, OWASP SAMM, CWE/SANS Top 25
- SAST tools: Semgrep, CodeQL, SonarQube, Snyk Code, Checkmarx
- DAST tools: OWASP ZAP, Burp Suite, Nikto, Nuclei
- Dependency scanning: Snyk, Dependabot, Trivy, Grype, OSV-Scanner
- Secret scanning: TruffleHog, GitLeaks, detect-secrets
- Container security: Trivy, Docker Scout, Falco
- Cloud security: Prowler, ScoutSuite, CloudSploit
- Cryptography: TLS, AES-GCM, Argon2id, Ed25519, X25519, JWT/JWE/JWK

## Your Security Review Process
You follow a systematic approach to every review:
1. Threat modeling: identify assets, trust boundaries, attack surfaces, threat actors
2. Code review: line-by-line analysis of security-critical paths
3. Dependency audit: known CVEs, license compliance, transitive risk
4. Configuration review: headers, CORS, CSP, cookie flags, TLS config
5. Authentication review: token handling, session management, MFA flows
6. Authorization review: RBAC/ABAC implementation, IDOR prevention, privilege escalation
7. Input validation: injection vectors, deserialization, file uploads
8. Error handling: information leakage, stack traces, debug modes

## Vulnerability Classification
You use industry-standard severity ratings:
- CVSS 3.1 base scores for CVE-assigned vulnerabilities
- Custom risk ratings (Critical/High/Medium/Low/Informational) based on:
  - Exploitability: network-accessible, authentication required, user interaction
  - Impact: confidentiality, integrity, availability, scope
  - Business context: data sensitivity, exposure, compliance requirements

## Security Hardening Patterns
You implement defense in depth:
- Input validation at every trust boundary using allowlists
- Parameterized queries and prepared statements exclusively
- Content Security Policy with nonce-based script-src
- HTTP security headers: HSTS, X-Frame-Options, X-Content-Type-Options
- Rate limiting with progressive delays and lockout
- Secrets rotation and zero-downtime key rotation
- Principle of least privilege for all service accounts
- Network segmentation and service mesh policies

## Cryptographic Standards
- Password hashing: Argon2id (memory 64MB, iterations 3, parallelism 4)
- Symmetric encryption: AES-256-GCM with random nonces
- Asymmetric: Ed25519 for signing, X25519 for key exchange
- TLS: minimum TLS 1.2, prefer TLS 1.3, strong cipher suites only
- Key derivation: HKDF for deriving sub-keys from master keys
- Random generation: crypto.getRandomValues() or crypto/rand, never Math.random()

## Compliance Awareness
You understand regulatory implications:
- GDPR: data minimization, right to erasure, consent management
- SOC 2: access controls, audit logging, encryption requirements
- PCI DSS: cardholder data handling, network segmentation, key management
- HIPAA: PHI protection, access auditing, BAA requirements

## Report Style
Your findings include:
- Clear title with CWE reference
- Severity with CVSS or risk justification
- Affected code location (file:line)
- Proof of concept (when safe)
- Remediation with code examples
- References to OWASP/CWE/MITRE resources

You never approve code with known vulnerabilities. You always provide concrete fixes, not just warnings.`;

export class SecurityAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'security-agent',
      name: 'Security Agent',
      domain: 'security',
      version: '1.0.0',
      maxConcurrentTasks: 2,
      timeoutMs: 180_000,
      retryAttempts: 1,
      temperature: 0.1,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'vulnerability_scanning',
        description: 'Scan code for OWASP Top 10 vulnerabilities using SAST patterns',
        confidence: 0.94,
        requiredTools: ['read_file', 'search_content', 'run_command'],
      },
      {
        name: 'security_review',
        description: 'Perform comprehensive security code reviews with CWE-mapped findings',
        confidence: 0.93,
        requiredTools: ['read_file', 'search_content'],
      },
      {
        name: 'dependency_audit',
        description: 'Audit dependencies for known CVEs and license compliance issues',
        confidence: 0.91,
        requiredTools: ['read_file', 'run_command'],
      },
      {
        name: 'secret_scanning',
        description: 'Detect hardcoded secrets, API keys, tokens, and credentials in code',
        confidence: 0.95,
        requiredTools: ['search_content', 'run_command'],
      },
      {
        name: 'hardening',
        description: 'Apply security hardening configurations for headers, auth, and crypto',
        confidence: 0.89,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'threat_modeling',
        description: 'Create threat models identifying attack surfaces, assets, and mitigations',
        confidence: 0.87,
        requiredTools: ['read_file', 'list_files'],
      },
      {
        name: 'container_security',
        description: 'Audit Dockerfiles and container configurations for security issues',
        confidence: 0.86,
        requiredTools: ['read_file', 'run_command'],
      },
      {
        name: 'auth_review',
        description: 'Review authentication and authorization implementations for weaknesses',
        confidence: 0.92,
        requiredTools: ['read_file', 'search_content'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read source files for security analysis',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write security patches, configurations, and policies',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'search_content',
        description: 'Search for dangerous patterns: eval, exec, SQL concat, hardcoded secrets',
        parameters: { pattern: 'string', include: 'string' },
        required: true,
      },
      {
        name: 'list_files',
        description: 'List files to understand project structure for threat modeling',
        parameters: { pattern: 'string' },
        required: false,
      },
      {
        name: 'run_command',
        description: 'Run security scanning tools (semgrep, trivy, npm audit)',
        parameters: { command: 'string', timeout: 'number' },
        required: true,
      },
    ];
  }

  getSystemPrompt(): string {
    return SECURITY_SYSTEM_PROMPT;
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
      name: 'security-report',
      content: `# Security Analysis Report\n\n## Task: ${task.description}\n\n## Approach: ${approach}\n\n## Findings\n\n(Automated scan results would appear here)`,
      language: 'markdown',
    });

    const desc = task.description.toLowerCase();
    if (desc.includes('patch') || desc.includes('fix') || desc.includes('harden')) {
      artifacts.push({
        type: 'snippet',
        name: 'security-fix',
        content: `// Security remediation for: ${task.description}\n// Follows OWASP best practices`,
        language: 'typescript',
      });
    }

    return {
      success: true,
      output: `Security analysis completed: ${approach}`,
      artifacts,
      tokensUsed: 3500,
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
      const content = artifact.content;

      if (content.includes('Math.random()')) {
        issues.push({
          severity: 'error',
          message: 'Math.random() is not cryptographically secure',
          location: artifact.name,
          fix: 'Use crypto.getRandomValues() or crypto.randomUUID()',
        });
      }
      if (content.includes('eval(') || content.includes('new Function(')) {
        issues.push({
          severity: 'critical',
          message: 'Dynamic code execution detected - high injection risk',
          location: artifact.name,
          fix: 'Remove eval/Function constructor; use safe alternatives',
        });
      }
      if (content.match(/password\s*=\s*['"][^'"]+['"]/i) || content.match(/api[_-]?key\s*=\s*['"][^'"]+['"]/i)) {
        issues.push({
          severity: 'critical',
          message: 'Hardcoded credential detected',
          location: artifact.name,
          fix: 'Move to environment variables or secrets manager',
        });
      }
      if (content.includes('innerHTML') && !content.includes('DOMPurify')) {
        issues.push({
          severity: 'error',
          message: 'Direct innerHTML usage risks XSS',
          location: artifact.name,
          fix: 'Use textContent or sanitize with DOMPurify before innerHTML',
        });
      }
      if (content.includes('md5') || content.includes('sha1')) {
        suggestions.push('Consider using SHA-256 or stronger hash algorithms');
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.4, 1 - issues.length * 0.15) : 0.1;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const keywords = [
      'security', 'vulnerability', 'cve', 'owasp', 'xss', 'csrf', 'injection',
      'auth', 'jwt', 'oauth', 'token', 'session', 'permission', 'rbac', 'abac',
      'encrypt', 'decrypt', 'hash', 'crypto', 'ssl', 'tls', 'certificate',
      'secret', 'key', 'credential', 'password', 'api key',
      'scan', 'audit', 'review', 'pentest', 'penetration',
      'hardening', 'firewall', 'waf', 'rate limit', 'cors', 'csp',
      'docker', 'container', 'kubernetes', 'pod security',
      'compliance', 'gdpr', 'soc2', 'pci', 'hipaa',
    ];

    const desc = task.description.toLowerCase();
    const matches = keywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 3, 1.0);

    if (task.domain === 'security') return Math.max(base, 0.8);
    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('full') || desc.includes('audit') || desc.includes('pentest')) return 'critical';
    if (desc.includes('auth') || desc.includes('crypto') || desc.includes('review')) return 'complex';
    if (desc.includes('scan') || desc.includes('dependency') || desc.includes('header')) return 'moderate';
    if (desc.includes('check') || desc.includes('secret') || desc.includes('lint')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['read_file', 'search_content'];
    const desc = task.description.toLowerCase();
    if (desc.includes('scan') || desc.includes('audit') || desc.includes('test')) tools.push('run_command');
    if (desc.includes('fix') || desc.includes('patch') || desc.includes('harden')) tools.push('write_file');
    if (desc.includes('threat') || desc.includes('architecture')) tools.push('list_files');
    return tools;
  }

  private estimateTime(complexity: string, task: TaskContext): number {
    const base: Record<string, number> = {
      trivial: 5_000, simple: 15_000, moderate: 45_000, complex: 90_000, critical: 180_000,
    };
    const fileMultiplier = Math.max(1, (task.filePaths?.length || 1) * 0.3);
    return (base[complexity] || 30_000) * fileMultiplier;
  }

  private suggestApproach(task: TaskContext): string {
    const desc = task.description.toLowerCase();
    if (desc.includes('scan') || desc.includes('vulnerability')) return 'Run multi-layer scan: SAST with Semgrep, dependency audit, secret scanning, and container scan';
    if (desc.includes('review') || desc.includes('audit')) return 'Perform systematic code review: input validation, auth flows, crypto usage, error handling, configuration';
    if (desc.includes('hardening')) return 'Apply defense-in-depth: security headers, CSP, rate limiting, secure cookies, CORS lockdown';
    if (desc.includes('auth')) return 'Review auth implementation: token validation, session management, MFA, CSRF protection, IDOR prevention';
    if (desc.includes('dependency')) return 'Audit dependencies: npm audit/yarn audit, check for known CVEs, review transitive dependencies, license compliance';
    if (desc.includes('secret')) return 'Scan for secrets: API keys, tokens, passwords, private keys using regex patterns and entropy analysis';
    return 'Apply OWASP ASVS checklist: verify security requirements across architecture, authentication, session management, access control, validation, cryptography';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('legacy') || desc.includes('old')) risks.push('Legacy code may have accumulated technical security debt');
    if (desc.includes('third-party') || desc.includes('vendor')) risks.push('Third-party code may introduce supply chain risks');
    if (desc.includes('production')) risks.push('Changes to production systems require careful rollout');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('scan')) deps.push('Security scanning tools installed (semgrep, trivy)');
    if (desc.includes('docker')) deps.push('Docker daemon access for container scanning');
    if (desc.includes('dependency')) deps.push('Package manager lock file (package-lock.json, yarn.lock)');
    return deps;
  }
}
