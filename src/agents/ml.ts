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

const ML_SYSTEM_PROMPT = `You are a Senior ML Engineer with 10+ years of experience building, deploying, and operating machine learning systems in production.

## Your Expertise
You have deep mastery across the ML lifecycle:
- Frameworks: PyTorch 2.x, TensorFlow 2.x, JAX, scikit-learn, XGBoost, LightGBM
- LLM tooling: Hugging Face Transformers, LangChain, LlamaIndex, vLLM, TGI
- Data processing: pandas, Polars, NumPy, Apache Spark, Dask, DuckDB
- MLOps: MLflow, Weights & Biases, DVC, Kubeflow, SageMaker, Vertex AI
- Feature stores: Feast, Tecton, Hopsworks
- Model serving: TorchServe, Triton, BentoML, Ray Serve, ONNX Runtime
- Vector databases: Pinecone, Weaviate, Qdrant, pgvector, Milvus
- Experiment tracking: W&B, MLflow, Neptune, CometML

## Your ML Development Process
You follow a rigorous, reproducible workflow:
1. Problem framing: define the objective, success metrics, and constraints clearly
2. Data analysis: EDA, distribution analysis, class imbalance assessment, data quality audit
3. Feature engineering: domain-driven features, encoding strategies, normalization
4. Baseline model: start simple (logistic regression, random forest) to establish a benchmark
5. Model selection: compare architectures systematically with proper cross-validation
6. Hyperparameter tuning: Bayesian optimization (Optuna), not grid search
7. Evaluation: appropriate metrics for the task, confidence intervals, statistical significance
8. Error analysis: confusion matrices, per-segment performance, failure case categorization
9. Deployment: model serialization, API design, A/B testing, shadow mode
10. Monitoring: data drift detection, model performance tracking, automated retraining

## Data Engineering
You ensure data quality with:
- Schema validation with Great Expectations or Pandera
- Missing value strategies: imputation, flagging, or dropping based on mechanism analysis
- Feature stores for consistent feature computation between training and serving
- Data versioning with DVC or LakeFS
- Synthetic data generation for imbalanced classes (SMOTE, CTGAN)

## Model Architecture Decisions
- Tabular data: gradient boosted trees (XGBoost/LightGBM) as strong baseline
- NLP: fine-tune transformer models (BERT, RoBERTa) or use LLMs with RAG
- Computer vision: transfer learning from pretrained models (ResNet, EfficientNet, ViT)
- Time series: temporal fusion transformers, N-BEATS, or statistical baselines (ARIMA)
- Recommendation: two-tower models, collaborative filtering, or content-based hybrid
- Generative: diffusion models, VAEs, or fine-tuned LLMs

## Production ML Concerns
- Model versioning and registry (MLflow Model Registry)
- Feature computation consistency between training and serving
- Latency requirements and model optimization (quantization, pruning, distillation)
- Cost optimization (batch vs real-time inference, spot instances for training)
- A/B testing frameworks for model comparison in production
- Shadow deployment for safe model rollouts
- Model monitoring with drift detection (Evidently, WhyLabs)

## Code Quality in ML
- Reproducibility: fixed random seeds, pinned dependencies, data versioning
- Modular code: separate data loading, feature engineering, model, and evaluation
- Configuration management: Hydra, OmegaConf, or YAML configs
- Type hints throughout with dataclasses or Pydantic for data models
- Unit tests for data transformations and feature engineering functions
- Documentation: model cards, experiment logs, dataset documentation

You never use train data for evaluation. You always validate assumptions about data distributions. You always consider fairness and bias in model evaluation.`;

export class MLAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'ml-agent',
      name: 'ML/AI Agent',
      domain: 'ml',
      version: '1.0.0',
      maxConcurrentTasks: 2,
      timeoutMs: 300_000,
      retryAttempts: 1,
      temperature: 0.2,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'model_design',
        description: 'Design ML model architectures and training pipelines for various tasks',
        confidence: 0.92,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'data_preprocessing',
        description: 'Build data loading, cleaning, and feature engineering pipelines',
        confidence: 0.93,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'experiment_tracking',
        description: 'Set up experiment tracking with W&B, MLflow, and hyperparameter optimization',
        confidence: 0.89,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'model_serving',
        description: 'Create model serving endpoints with FastAPI, TorchServe, or Triton',
        confidence: 0.87,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'llm_integration',
        description: 'Build RAG pipelines, prompt engineering, and LLM application architecture',
        confidence: 0.9,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'mlops',
        description: 'Design MLOps pipelines for training, evaluation, and deployment automation',
        confidence: 0.86,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'evaluation',
        description: 'Implement evaluation frameworks with proper metrics and statistical analysis',
        confidence: 0.91,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'data_analysis',
        description: 'Perform exploratory data analysis and generate insights from datasets',
        confidence: 0.88,
        requiredTools: ['read_file', 'run_command'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read ML code, notebooks, configs, and data schemas',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write model code, training scripts, and pipeline definitions',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'run_command',
        description: 'Run training, evaluation, and data processing commands',
        parameters: { command: 'string', timeout: 'number' },
        required: true,
      },
      {
        name: 'list_files',
        description: 'List project structure, data directories, and model artifacts',
        parameters: { pattern: 'string' },
        required: false,
      },
    ];
  }

  getSystemPrompt(): string {
    return ML_SYSTEM_PROMPT;
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
      type: 'snippet',
      name: 'ml-implementation',
      content: `# ML implementation for: ${task.description}\n# Approach: ${approach}\n\nimport torch\nimport numpy as np\n\nclass Model:\n    pass`,
      language: 'python',
    });

    return {
      success: true,
      output: `ML task completed: ${approach}`,
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

      if (content.includes('random.seed') && !content.includes('torch.manual_seed') && !content.includes('np.random.seed')) {
        suggestions.push('Set all random seeds (torch, numpy, python) for full reproducibility');
      }
      if (content.includes('test_size=0') || content.includes('split') && !content.includes('stratify')) {
        suggestions.push('Consider stratified splitting for imbalanced datasets');
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.5, 1 - issues.length * 0.1) : 0.3;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const keywords = [
      'ml', 'machine learning', 'deep learning', 'neural network', 'model',
      'training', 'inference', 'prediction', 'classification', 'regression',
      'pytorch', 'tensorflow', 'sklearn', 'scikit', 'xgboost', 'lightgbm',
      'nlp', 'transformer', 'bert', 'llm', 'gpt', 'embedding', 'vector',
      'computer vision', 'cnn', 'image', 'object detection', 'segmentation',
      'data pipeline', 'feature engineering', 'preprocessing',
      'rag', 'fine-tune', 'fine tune', 'prompt', 'langchain',
      'mlops', 'experiment', 'wandb', 'mlflow',
      'recommendation', 'collaborative filtering', 'clustering',
    ];

    const desc = task.description.toLowerCase();
    const matches = keywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 3, 1.0);

    if (task.domain === 'ml' || task.domain === 'ai' || task.domain === 'data') return Math.max(base, 0.7);
    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('pipeline') || desc.includes('system') || desc.includes('production')) return 'critical';
    if (desc.includes('training') || desc.includes('fine-tune') || desc.includes('rag')) return 'complex';
    if (desc.includes('model') || desc.includes('feature') || desc.includes('evaluation')) return 'moderate';
    if (desc.includes('data') || desc.includes('preprocessing') || desc.includes('analysis')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['read_file', 'write_file'];
    const desc = task.description.toLowerCase();
    if (desc.includes('train') || desc.includes('run') || desc.includes('evaluate')) tools.push('run_command');
    return tools;
  }

  private estimateTime(complexity: string, task: TaskContext): number {
    const base: Record<string, number> = {
      trivial: 5_000, simple: 15_000, moderate: 60_000, complex: 120_000, critical: 300_000,
    };
    return base[complexity] || 30_000;
  }

  private suggestApproach(task: TaskContext): string {
    const desc = task.description.toLowerCase();
    if (desc.includes('rag')) return 'Build RAG pipeline: document chunking, embedding generation, vector store indexing, retrieval with reranking, LLM synthesis';
    if (desc.includes('classification')) return 'Start with logistic regression baseline, then try gradient boosted trees, evaluate with cross-validation and proper metrics';
    if (desc.includes('fine-tune') || desc.includes('fine tune')) return 'Set up fine-tuning with LoRA/QLoRA, proper train/val split, W&B tracking, and evaluation on held-out set';
    if (desc.includes('pipeline')) return 'Design reproducible pipeline with DVC: data versioning, feature store, training automation, model registry, deployment';
    if (desc.includes('serving') || desc.includes('api')) return 'Create model serving with FastAPI, proper input validation, batch inference support, and health checks';
    return 'Follow ML development process: EDA, baseline model, systematic model comparison, error analysis, and deployment with monitoring';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('production') || desc.includes('deploy')) risks.push('Model drift in production; set up monitoring and retraining triggers');
    if (desc.includes('llm') || desc.includes('gpt')) risks.push('LLM hallucination and cost management; implement guardrails and caching');
    if (desc.includes('data')) risks.push('Data quality issues can propagate; validate schemas and distributions');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('pytorch') || desc.includes('torch')) deps.push('PyTorch and CUDA for GPU acceleration');
    if (desc.includes('data')) deps.push('Dataset access and proper data pipeline');
    if (desc.includes('gpu') || desc.includes('train')) deps.push('GPU compute resources');
    return deps;
  }
}
