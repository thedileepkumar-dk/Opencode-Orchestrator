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

const DEVOPS_SYSTEM_PROMPT = `You are a Senior DevOps/Platform Engineer with 13+ years of experience building infrastructure, CI/CD pipelines, and cloud-native platforms.

## Your Expertise
You have deep mastery across the infrastructure stack:
- Containers: Docker (multi-stage builds, distroless, BuildKit), Podman, containerd
- Orchestration: Kubernetes (EKS/GKE/AKS), Helm charts, Kustomize, ArgoCD, Flux
- IaC: Terraform (modules, workspaces, state management), Pulumi, CloudFormation, CDK
- CI/CD: GitHub Actions, GitLab CI, CircleCI, Jenkins, Tekton, Dagger
- Cloud: AWS (primary), GCP, Azure — networking, compute, storage, IAM
- Monitoring: Prometheus, Grafana, Datadog, New Relic, OpenTelemetry
- Service mesh: Istio, Linkerd, Consul Connect
- Secrets: HashiCorp Vault, AWS Secrets Manager, SOPS, sealed-secrets

## Your Philosophy
You build infrastructure with these principles:
1. Everything as code: version-controlled, reviewed, tested, automated
2. Immutable infrastructure: never patch in place; replace containers/nodes
3. GitOps: desired state in Git, reconciliation loop applies changes
4. Observability first: metrics, logs, traces from day one
5. Security by default: least privilege, network policies, image scanning
6. Cost awareness: right-sizing, spot instances, reserved capacity analysis

## Pipeline Design
You create CI/CD pipelines with:
- Parallelized stages: lint -> test -> build -> scan -> deploy
- Caching strategies: Docker layer cache, dependency cache, build artifact cache
- Security gates: SAST, dependency audit, container scanning, secret detection
- Progressive delivery: canary, blue-green, feature flags
- Rollback automation: one-click rollback, automated health check rollback
- Environment promotion: dev -> staging -> production with approval gates

## Kubernetes Best Practices
- Resource requests and limits on every container
- Pod disruption budgets for high-availability workloads
- Network policies to restrict pod-to-pod communication
- Horizontal Pod Autoscaler with custom metrics
- Liveness, readiness, and startup probes configured correctly
- Init containers for dependency readiness checks
- ConfigMaps and Secrets for configuration management
- RBAC with service accounts following least privilege
- Pod security standards (restricted profile)

## Terraform Patterns
- Module composition: small, reusable, versioned modules
- Remote state with locking (S3 + DynamoDB, GCS)
- Workspaces for environment separation
- Data sources for existing resource references
- Dynamic blocks for conditional resource creation
- TFLint and Checkov for policy-as-code validation
- Plan output review in CI before apply

## Monitoring & Alerting
- SLI/SLO-based alerting (not threshold-based noise)
- Four golden signals: latency, traffic, errors, saturation
- Alert runbooks linked in every alert
- Dashboard hierarchy: overview -> service -> instance
- Log aggregation with structured logging
- Distributed tracing with OpenTelemetry SDK
- On-call rotation and incident management integration

## Dockerfile Best Practices
- Multi-stage builds for minimal final images
- Non-root user in final stage
- COPY package files before source for cache optimization
- .dockerignore to exclude unnecessary files
- HEALTHCHECK instruction for container orchestration
- Pin base image versions; never use :latest in production
- Distroless or Alpine base images for minimal attack surface

You never hardcode secrets in infrastructure code. You always use variable injection at deploy time.`;

export class DevOpsAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'devops-agent',
      name: 'DevOps Agent',
      domain: 'devops',
      version: '1.0.0',
      maxConcurrentTasks: 2,
      timeoutMs: 150_000,
      retryAttempts: 2,
      temperature: 0.15,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'pipeline_generation',
        description: 'Generate CI/CD pipeline configurations (GitHub Actions, GitLab CI, etc.)',
        confidence: 0.94,
        requiredTools: ['read_file', 'write_file', 'list_files'],
      },
      {
        name: 'iac',
        description: 'Write Infrastructure as Code (Terraform, Pulumi, CloudFormation)',
        confidence: 0.92,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'containerization',
        description: 'Create Dockerfiles, docker-compose configs, and container optimization',
        confidence: 0.93,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'kubernetes',
        description: 'Generate Kubernetes manifests, Helm charts, and Kustomize overlays',
        confidence: 0.91,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'monitoring',
        description: 'Set up monitoring, alerting rules, dashboards, and log aggregation',
        confidence: 0.88,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'deployment',
        description: 'Design deployment strategies (canary, blue-green) and rollback procedures',
        confidence: 0.89,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'security_hardening',
        description: 'Apply infrastructure security hardening (network policies, IAM, image scanning)',
        confidence: 0.86,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'cost_optimization',
        description: 'Analyze and optimize cloud resource costs and right-sizing',
        confidence: 0.82,
        requiredTools: ['read_file', 'run_command'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read existing infrastructure and pipeline configurations',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write pipeline, IaC, and configuration files',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'list_files',
        description: 'List infrastructure files to understand project structure',
        parameters: { pattern: 'string' },
        required: false,
      },
      {
        name: 'run_command',
        description: 'Run terraform plan, kubectl, docker, or helm commands',
        parameters: { command: 'string', timeout: 'number' },
        required: true,
      },
    ];
  }

  getSystemPrompt(): string {
    return DEVOPS_SYSTEM_PROMPT;
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
    const desc = task.description.toLowerCase();

    artifacts.push({
      type: 'config',
      name: 'devops-output',
      content: `# DevOps output for: ${task.description}\n# Approach: ${approach}`,
      language: 'yaml',
    });

    if (desc.includes('docker') || desc.includes('container')) {
      artifacts.push({
        type: 'file',
        name: 'Dockerfile',
        content: '# Multi-stage Dockerfile\nFROM node:20-alpine AS builder\n# ... build stage',
        language: 'dockerfile',
      });
    }

    if (desc.includes('pipeline') || desc.includes('ci') || desc.includes('cd')) {
      artifacts.push({
        type: 'config' as const,
        name: 'ci-pipeline',
        content: 'name: CI Pipeline\non: [push, pull_request]\n# ... pipeline stages',
        language: 'yaml',
      });
    }

    return {
      success: true,
      output: `DevOps task completed: ${approach}`,
      artifacts,
      tokensUsed: 2800,
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

      if (artifact.language === 'dockerfile' && !content.includes('USER')) {
        issues.push({
          severity: 'warning',
          message: 'Dockerfile runs as root; add USER directive for security',
          location: artifact.name,
          fix: 'Add USER nonroot or create a dedicated user',
        });
      }
      if (artifact.language === 'dockerfile' && content.includes(':latest')) {
        issues.push({
          severity: 'warning',
          message: 'Using :latest tag; pin to specific version for reproducibility',
          location: artifact.name,
          fix: 'Use specific version tags (e.g., node:20.11-alpine)',
        });
      }
      if (content.includes('password') && content.match(/password\s*[:=]\s*['"][^'"]+['"]/i)) {
        issues.push({
          severity: 'critical',
          message: 'Hardcoded credential in infrastructure config',
          location: artifact.name,
          fix: 'Use variable references or secrets manager',
        });
      }
      if (artifact.language === 'yaml' && !content.includes('resource') && content.includes('container')) {
        suggestions.push('Consider adding resource requests and limits for containers');
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.5, 1 - issues.length * 0.12) : 0.2;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const keywords = [
      'docker', 'container', 'kubernetes', 'k8s', 'helm', 'kustomize',
      'terraform', 'pulumi', 'cloudformation', 'cdk', 'iac', 'infrastructure',
      'pipeline', 'ci', 'cd', 'github actions', 'gitlab ci', 'jenkins',
      'deploy', 'deployment', 'release', 'rollback', 'canary', 'blue-green',
      'monitor', 'alert', 'prometheus', 'grafana', 'datadog',
      'nginx', 'load balancer', 'cdn', 'dns', 'ssl', 'certificate',
      'aws', 'gcp', 'azure', 'cloud',
      'devops', 'platform', 'sre', 'argocd', 'flux',
    ];

    const desc = task.description.toLowerCase();
    const matches = keywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 3, 1.0);

    if (task.domain === 'devops' || task.domain === 'infrastructure') return Math.max(base, 0.7);
    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('platform') || desc.includes('full') || desc.includes('migration')) return 'critical';
    if (desc.includes('kubernetes') || desc.includes('terraform') || desc.includes('cluster')) return 'complex';
    if (desc.includes('pipeline') || desc.includes('deploy') || desc.includes('docker')) return 'moderate';
    if (desc.includes('config') || desc.includes('script') || desc.includes('action')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['read_file', 'write_file'];
    const desc = task.description.toLowerCase();
    if (desc.includes('find') || desc.includes('existing') || desc.includes('review')) tools.push('list_files');
    if (desc.includes('test') || desc.includes('plan') || desc.includes('lint')) tools.push('run_command');
    return tools;
  }

  private estimateTime(complexity: string, task: TaskContext): number {
    const base: Record<string, number> = {
      trivial: 5_000, simple: 15_000, moderate: 45_000, complex: 90_000, critical: 180_000,
    };
    return base[complexity] || 30_000;
  }

  private suggestApproach(task: TaskContext): string {
    const desc = task.description.toLowerCase();
    if (desc.includes('docker')) return 'Create multi-stage Dockerfile with non-root user, .dockerignore, and health check';
    if (desc.includes('pipeline') || desc.includes('ci')) return 'Build CI/CD pipeline with parallel stages, caching, security gates, and deployment automation';
    if (desc.includes('terraform') || desc.includes('iac')) return 'Write modular Terraform with remote state, workspaces for environments, and policy-as-code';
    if (desc.includes('kubernetes') || desc.includes('k8s')) return 'Generate Kubernetes manifests with resource limits, probes, network policies, and HPA';
    if (desc.includes('monitor')) return 'Set up OpenTelemetry instrumentation with Prometheus metrics, Grafana dashboards, and SLO-based alerts';
    if (desc.includes('deploy')) return 'Implement progressive delivery: canary deployment with automated rollback on health check failure';
    return 'Apply infrastructure-as-code principles with version control, automated testing, and GitOps reconciliation';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('production') || desc.includes('deploy')) risks.push('Production deployment requires staging validation first');
    if (desc.includes('terraform') || desc.includes('state')) risks.push('State file corruption risk; ensure remote state with locking');
    if (desc.includes('kubernetes') || desc.includes('cluster')) risks.push('Cluster changes may cause pod restarts; plan maintenance windows');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('terraform')) deps.push('Terraform installed and cloud provider credentials configured');
    if (desc.includes('kubernetes') || desc.includes('kubectl')) deps.push('kubectl configured with cluster access');
    if (desc.includes('docker')) deps.push('Docker daemon running');
    if (desc.includes('aws')) deps.push('AWS CLI configured with appropriate IAM permissions');
    return deps;
  }
}
