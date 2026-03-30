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

const MOBILE_SYSTEM_PROMPT = `You are a Senior Mobile Developer with 12+ years of experience shipping production apps on iOS, Android, and cross-platform frameworks.

## Your Expertise
You have deep mastery across the mobile ecosystem:
- iOS: Swift 5.9, SwiftUI, UIKit, Combine, async/await, Core Data, CloudKit
- Android: Kotlin 2.0, Jetpack Compose, Room, Coroutines/Flow, Material 3, Hilt
- Cross-platform: React Native 0.74+, Expo SDK 51+, Flutter 3.22+, Dart
- Native modules: bridging native code to JS/Dart, platform channels, turbo modules
- App lifecycle: background tasks, deep linking, universal links, app clips
- Performance: startup optimization, memory management, battery efficiency
- Distribution: App Store Connect, Google Play Console, CI/CD (Fastlane, EAS Build)

## Your Architecture Approach
You design mobile apps with:
1. Feature-based architecture: each feature is a self-contained module
2. Clean architecture layers: presentation -> domain -> data
3. State management: unidirectional data flow (Redux/MobX for RN, Riverpod/BLoC for Flutter)
4. Dependency injection: Hilt (Android), Swinject (iOS), GetIt (Flutter)
5. Navigation: type-safe routing with deep link support
6. Offline-first: local database sync, conflict resolution, queue for pending operations

## React Native / Expo Best Practices
- Expo Router for file-based navigation with typed routes
- Expo modules API for custom native functionality
- react-native-reanimated 3 for 60fps animations
- React Native MMKV for fast key-value storage
- React Query / TanStack Query for server state management
- Expo EAS Build and Submit for app store deployment
- OTA updates with expo-updates for JS bundle patches

## Flutter Best Practices
- Widget composition over inheritance
- State management with Riverpod (code generation)
- GoRouter for declarative routing with deep links
- Isar or Drift for local database
- Freezed + json_serializable for immutable data classes
- flutter_native_splash and flutter_launcher_icons

## Platform-Specific Considerations
- iOS: Human Interface Guidelines compliance, Dynamic Type, haptic feedback
- Android: Material Design 3, adaptive layouts, predictive back gesture
- Push notifications: FCM/APNs with proper permission handling
- Biometric auth: LocalAuthentication (iOS), BiometricPrompt (Android)
- In-app purchases: StoreKit 2 (iOS), Google Play Billing Library 7
- Accessibility: VoiceOver/TalkBack, dynamic font sizes, semantic labels

## App Store Compliance
- Privacy nutrition labels accurately reflecting data usage
- ATT (App Tracking Transparency) for iOS 14.5+
- Data safety section for Google Play
- Proper permission request flows with rationale screens
- Content rating requirements
- Export compliance for encryption usage

## Performance Optimization
- Lazy loading for screens and heavy resources
- Image optimization: WebP, progressive loading, memory cache
- List virtualization: FlashList (RN), SliverLazyList (Flutter)
- Startup time: deferred initialization, code splitting
- Memory: proper disposal of subscriptions, controllers, listeners
- Network: request deduplication, caching, retry with backoff

You produce production-ready mobile code that handles edge cases, respects platform conventions, and passes app store review.`;

export class MobileAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: 'mobile-agent',
      name: 'Mobile Agent',
      domain: 'mobile',
      version: '1.0.0',
      maxConcurrentTasks: 2,
      timeoutMs: 120_000,
      retryAttempts: 2,
      temperature: 0.2,
    };
    super(config);
  }

  protected defineCapabilities(): AgentCapability[] {
    return [
      {
        name: 'cross_platform',
        description: 'Build React Native / Expo / Flutter cross-platform mobile applications',
        confidence: 0.93,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'native_module',
        description: 'Create native module bridges for platform-specific functionality',
        confidence: 0.88,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'app_store_compliance',
        description: 'Ensure compliance with App Store and Google Play guidelines',
        confidence: 0.86,
        requiredTools: ['read_file'],
      },
      {
        name: 'push_notifications',
        description: 'Implement push notification handling with FCM/APNs',
        confidence: 0.87,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'offline_sync',
        description: 'Design offline-first data synchronization with conflict resolution',
        confidence: 0.85,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'deep_linking',
        description: 'Configure deep linking, universal links, and app routing',
        confidence: 0.89,
        requiredTools: ['read_file', 'write_file'],
      },
      {
        name: 'mobile_performance',
        description: 'Optimize startup time, memory usage, and rendering performance',
        confidence: 0.9,
        requiredTools: ['read_file', 'write_file', 'run_command'],
      },
      {
        name: 'biometric_auth',
        description: 'Implement biometric authentication flows with fallback strategies',
        confidence: 0.84,
        requiredTools: ['read_file', 'write_file'],
      },
    ];
  }

  protected defineTools(): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read mobile project files and native modules',
        parameters: { path: 'string' },
        required: true,
      },
      {
        name: 'write_file',
        description: 'Write screens, components, and native module code',
        parameters: { path: 'string', content: 'string' },
        required: true,
      },
      {
        name: 'list_files',
        description: 'List mobile project structure and platform directories',
        parameters: { pattern: 'string' },
        required: false,
      },
      {
        name: 'run_command',
        description: 'Run mobile build, lint, and test commands',
        parameters: { command: 'string', timeout: 'number' },
        required: true,
      },
    ];
  }

  getSystemPrompt(): string {
    return MOBILE_SYSTEM_PROMPT;
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
      name: 'mobile-implementation',
      content: `// Mobile implementation for: ${task.description}\n// Approach: ${approach}`,
      language: 'typescript',
    });

    return {
      success: true,
      output: `Mobile task completed: ${approach}`,
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
      if (artifact.content.includes('console.log') && !artifact.content.includes('__DEV__')) {
        issues.push({
          severity: 'warning',
          message: 'Console.log outside __DEV__ guard may leak info in production',
          location: artifact.name,
          fix: 'Wrap debug logs in __DEV__ check or use a logging library',
        });
      }
    }

    const passed = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length === 0;
    const score = passed ? Math.max(0.5, 1 - issues.length * 0.1) : 0.3;

    return { passed, score, issues, suggestions };
  }

  private calculateConfidence(task: TaskContext): number {
    const keywords = [
      'mobile', 'ios', 'android', 'react native', 'expo', 'flutter', 'dart',
      'swift', 'kotlin', 'swiftui', 'compose', 'jetpack',
      'app store', 'play store', 'push notification', 'deep link',
      'native', 'bridge', 'module', 'screen', 'navigation',
      'biometric', 'face id', 'touch id', 'offline',
    ];

    const desc = task.description.toLowerCase();
    const matches = keywords.filter((kw) => desc.includes(kw)).length;
    const base = Math.min(matches / 3, 1.0);

    if (task.domain === 'mobile') return Math.max(base, 0.7);
    return base;
  }

  private estimateComplexity(task: TaskContext): TaskContext['complexity'] {
    const desc = task.description.toLowerCase();
    if (desc.includes('app') || desc.includes('full') || desc.includes('architecture')) return 'critical';
    if (desc.includes('native module') || desc.includes('bridge') || desc.includes('sync')) return 'complex';
    if (desc.includes('screen') || desc.includes('feature') || desc.includes('notification')) return 'moderate';
    if (desc.includes('component') || desc.includes('widget')) return 'simple';
    return 'trivial';
  }

  private determineRequiredTools(task: TaskContext): string[] {
    const tools = ['read_file', 'write_file'];
    const desc = task.description.toLowerCase();
    if (desc.includes('build') || desc.includes('test') || desc.includes('lint')) tools.push('run_command');
    if (desc.includes('find') || desc.includes('existing')) tools.push('list_files');
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
    if (desc.includes('react native') || desc.includes('expo')) return 'Build with Expo Router, React Query for server state, and react-native-reanimated for animations';
    if (desc.includes('flutter')) return 'Use Flutter with Riverpod state management, GoRouter for navigation, and Drift for local database';
    if (desc.includes('native module')) return 'Create platform-specific native module with TypeScript bridge interface and proper error handling';
    if (desc.includes('notification')) return 'Implement push notifications with expo-notifications or native FCM/APNs integration';
    if (desc.includes('offline')) return 'Design offline-first with local database, sync queue, and conflict resolution strategy';
    return 'Follow platform conventions with clean architecture, proper state management, and comprehensive error handling';
  }

  private identifyRisks(task: TaskContext): string[] {
    const risks: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('native module')) risks.push('Native module changes require testing on both platforms and may need Objective-C/Swift or Java/Kotlin knowledge');
    if (desc.includes('app store') || desc.includes('review')) risks.push('App store review rejection risk; follow guidelines strictly');
    if (desc.includes('notification')) risks.push('Push notification permissions vary by platform and OS version');
    return risks;
  }

  private identifyDependencies(task: TaskContext): string[] {
    const deps: string[] = [];
    const desc = task.description.toLowerCase();
    if (desc.includes('expo')) deps.push('Expo SDK and EAS CLI installed');
    if (desc.includes('ios')) deps.push('Xcode and iOS simulator/device');
    if (desc.includes('android')) deps.push('Android Studio and Android SDK');
    if (desc.includes('flutter')) deps.push('Flutter SDK and Dart');
    return deps;
  }
}
