import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { TreeSitterIndexer } from './tree-sitter-indexer.js';
import { VectorStore, buildChunksFromSymbols, buildChunksFromContent } from './vector-store.js';
import { CodeGraph } from './code-graph.js';
import {
  IndexResult,
  IndexSymbol,
  IndexSymbolKind,
  VectorSearchResult,
  DependencyEdge,
  DependencyNode,
  ImpactAnalysis,
  CodeChunk,
} from '../protocol/types.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ scope: 'hybrid-index' });

export interface HybridIndexOptions {
  rootDir: string;
  watchFiles: boolean;
  excludePatterns: string[];
  chunkSize?: number;
  vectorDimension?: number;
}

export interface SearchOptions {
  semantic?: boolean;
  structural?: boolean;
  kind?: IndexSymbolKind;
  file?: string;
  limit?: number;
}

export interface HybridSearchResult {
  symbol?: IndexSymbol;
  chunk?: CodeChunk;
  score: number;
  source: 'ast' | 'vector' | 'graph';
}

// ============================================================
// DEFAULT EXCLUDE PATTERNS
// ============================================================

const DEFAULT_EXCLUDES = [
  'node_modules', '.git', 'dist', 'build', '__pycache__', '.venv',
  'vendor', 'target', '.next', '.nuxt', 'coverage', '.cache',
  'bin', 'obj', 'out', '.output',
];

// ============================================================
// HYBRID INDEX
// ============================================================

export class HybridIndex extends EventEmitter {
  private astIndex: TreeSitterIndexer;
  private vectorStore: VectorStore;
  private graph: CodeGraph;
  private rootDir: string;
  private excludePatterns: string[];
  private watchMode: boolean;
  private watcher: fs.FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private indexed = false;

  constructor(options: HybridIndexOptions) {
    super();
    this.rootDir = path.resolve(options.rootDir);
    this.excludePatterns = [...DEFAULT_EXCLUDES, ...options.excludePatterns];
    this.watchMode = options.watchFiles;

    this.astIndex = new TreeSitterIndexer(this.rootDir);
    this.vectorStore = new VectorStore(options.vectorDimension ?? 256);
    this.graph = new CodeGraph();

    logger.info(`HybridIndex created for ${this.rootDir}`);
  }

  // ============================================================
  // INDEXING
  // ============================================================

  async indexAll(): Promise<{ files: number; symbols: number; chunks: number; edges: number }> {
    const start = Date.now();
    logger.info('Starting full index...');

    // 1. AST indexing
    const indexResults = await this.astIndex.indexDirectory(this.rootDir);

    // 2. Vector store: build chunks from all symbols
    const allChunks: CodeChunk[] = [];
    for (const [file, result] of indexResults) {
      const absPath = path.resolve(this.rootDir, file);
      let content: string;
      try {
        content = await fs.promises.readFile(absPath, 'utf-8');
      } catch {
        continue;
      }

      const symbolChunks = buildChunksFromSymbols(result.symbols, content);
      allChunks.push(...symbolChunks);

      // Add sliding window chunks for any large uncovered sections
      if (result.symbols.length === 0) {
        const windowChunks = buildChunksFromContent(content, file);
        allChunks.push(...windowChunks);
      }
    }

    this.vectorStore.clear();
    this.vectorStore.addBatch(allChunks);
    this.vectorStore.rebuild();

    // 3. Build dependency graph
    const allResults = Array.from(indexResults.values());
    this.graph.buildFromIndexResults(allResults);

    this.indexed = true;
    const duration = Date.now() - start;

    const stats = {
      files: indexResults.size,
      symbols: allResults.reduce((sum, r) => sum + r.symbols.length, 0),
      chunks: allChunks.length,
      edges: this.graph.getEdges().length,
    };

    logger.info(`Index complete in ${duration}ms: ${stats.files} files, ${stats.symbols} symbols, ${stats.chunks} chunks, ${stats.edges} edges`);

    if (this.watchMode) {
      this.startWatching();
    }

    this.emit('indexed', stats);
    return stats;
  }

  async indexFile(filePath: string): Promise<IndexResult | null> {
    const absPath = path.resolve(this.rootDir, filePath);
    const relPath = path.relative(this.rootDir, absPath);

    if (this.isExcluded(absPath)) return null;

    // Remove old index for this file
    this.astIndex.removeFile(relPath);
    this.vectorStore.removeByFile(relPath);

    // Re-index
    const result = await this.astIndex.indexFile(absPath);

    // Update vector store
    let content: string;
    try {
      content = await fs.promises.readFile(absPath, 'utf-8');
    } catch {
      return result;
    }

    const chunks = buildChunksFromSymbols(result.symbols, content);
    this.vectorStore.addBatch(chunks);
    this.vectorStore.rebuild();

    // Rebuild graph (full rebuild for correctness)
    const allResults: IndexResult[] = [];
    for (const file of this.astIndex.getAllFiles()) {
      const r = this.astIndex.getSymbolsForFile(file);
      const imp = this.astIndex.getImportsForFile(file);
      const exp = this.astIndex.getExportsForFile(file);
      allResults.push({
        file,
        language: result.language,
        symbols: r,
        imports: imp,
        exports: exp,
        dependencies: [],
        errors: [],
        parseTime: 0,
        indexedAt: 0,
      });
    }
    this.graph.buildFromIndexResults(allResults);

    this.emit('file-indexed', { file: relPath, symbolCount: result.symbols.length });
    return result;
  }

  removeFile(filePath: string): void {
    const relPath = path.relative(this.rootDir, path.resolve(this.rootDir, filePath));
    this.astIndex.removeFile(relPath);
    this.vectorStore.removeByFile(relPath);
    this.emit('file-removed', { file: relPath });
  }

  // ============================================================
  // SEARCH
  // ============================================================

  search(query: string, options: SearchOptions = {}): HybridSearchResult[] {
    this.ensureIndexed();

    const results: HybridSearchResult[] = [];
    const limit = options.limit ?? 20;

    // Structural search via AST
    if (options.structural !== false) {
      const symbols = this.astIndex.searchSymbols(query, options.kind);
      for (const sym of symbols) {
        if (options.file && sym.file !== options.file) continue;
        results.push({
          symbol: sym,
          score: 1.0 - (results.length * 0.01), // slight decay for ordering
          source: 'ast',
        });
      }
    }

    // Semantic search via vector store
    if (options.semantic !== false) {
      const vectorResults = this.vectorStore.search(query, limit);
      for (const vr of vectorResults) {
        if (options.file && vr.chunk.file !== options.file) continue;
        if (options.kind && vr.chunk.kind !== options.kind) continue;
        results.push({
          chunk: vr.chunk,
          score: vr.score,
          source: 'vector',
        });
      }
    }

    // Deduplicate and sort
    const seen = new Set<string>();
    const deduped: HybridSearchResult[] = [];
    for (const r of results) {
      const key = r.symbol
        ? `${r.symbol.file}:${r.symbol.line}`
        : `${r.chunk!.file}:${r.chunk!.startLine}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(r);
      }
    }

    deduped.sort((a, b) => b.score - a.score);
    return deduped.slice(0, limit);
  }

  semanticSearch(query: string, limit = 10): VectorSearchResult[] {
    this.ensureIndexed();
    return this.vectorStore.search(query, limit);
  }

  structuralSearch(name: string, kind?: IndexSymbolKind): IndexSymbol[] {
    this.ensureIndexed();
    return this.astIndex.searchSymbols(name, kind);
  }

  // ============================================================
  // DEPENDENCY QUERIES
  // ============================================================

  whatCalls(symbolName: string): DependencyNode[] {
    this.ensureIndexed();
    return this.graph.whatCalls(symbolName);
  }

  whatDoesXCall(symbolName: string): DependencyNode[] {
    this.ensureIndexed();
    return this.graph.whatDoesXCall(symbolName);
  }

  whatDependsOn(symbolName: string): string[] {
    this.ensureIndexed();
    return this.graph.whatDependsOn(symbolName);
  }

  whatDoesXDependOn(symbolName: string): string[] {
    this.ensureIndexed();
    return this.graph.whatDoesXDependOn(symbolName);
  }

  analyzeImpact(symbolName: string): ImpactAnalysis {
    this.ensureIndexed();
    return this.graph.analyzeImpact(symbolName);
  }

  findCycles(): string[][] {
    this.ensureIndexed();
    return this.graph.findCycles();
  }

  getDependencyGraph(): CodeGraph {
    this.ensureIndexed();
    return this.graph;
  }

  exportDOT(label?: string): string {
    this.ensureIndexed();
    return this.graph.toDOT(label);
  }

  // ============================================================
  // FILE SYSTEM WATCHING
  // ============================================================

  private startWatching(): void {
    if (this.watcher) return;

    logger.info(`Starting file watcher on ${this.rootDir}`);

    try {
      this.watcher = fs.watch(this.rootDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.join(this.rootDir, filename);

        if (this.isExcluded(fullPath)) return;

        const ext = path.extname(filename).toLowerCase();
        if (!this.astIndex.getSupportedExtensions().includes(ext)) return;

        // Debounce: wait 300ms after last change
        const existing = this.debounceTimers.get(filename);
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(filename, setTimeout(async () => {
          this.debounceTimers.delete(filename);

          try {
            const stat = await fs.promises.stat(fullPath);
            if (stat.isFile()) {
              logger.debug(`File changed: ${filename}`);
              await this.indexFile(filename);
              this.emit('file-changed', { file: filename, type: eventType });
            }
          } catch {
            // File was deleted
            this.removeFile(filename);
            this.emit('file-deleted', { file: filename });
          }
        }, 300));
      });

      this.watcher.on('error', (err) => {
        logger.error('File watcher error', { error: err });
      });
    } catch (err) {
      logger.error('Failed to start file watcher', { error: err as Error });
    }
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  // ============================================================
  // ACCESSORS
  // ============================================================

  getASTIndex(): TreeSitterIndexer {
    return this.astIndex;
  }

  getVectorStore(): VectorStore {
    return this.vectorStore;
  }

  getGraph(): CodeGraph {
    return this.graph;
  }

  isIndexed(): boolean {
    return this.indexed;
  }

  getStats(): {
    indexed: boolean;
    files: number;
    symbols: number;
    chunks: number;
    graph: { nodes: number; edges: number; files: number; maxDepth: number };
  } {
    const allFiles = this.astIndex.getAllFiles();
    let totalSymbols = 0;
    for (const symbols of this.astIndex.getAllSymbols().values()) {
      totalSymbols += symbols.length;
    }

    return {
      indexed: this.indexed,
      files: allFiles.length,
      symbols: totalSymbols,
      chunks: this.vectorStore.size(),
      graph: this.graph.getStats(),
    };
  }

  async destroy(): Promise<void> {
    this.stopWatching();
    this.astIndex.clear();
    this.vectorStore.clear();
    this.graph.clear();
    this.indexed = false;
    this.removeAllListeners();
  }

  // ============================================================
  // INTERNALS
  // ============================================================

  private ensureIndexed(): void {
    if (!this.indexed) {
      throw new Error('Index not built. Call indexAll() first.');
    }
  }

  private isExcluded(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    for (const pattern of this.excludePatterns) {
      if (normalized.includes(pattern)) return true;
    }
    return false;
  }
}

export default HybridIndex;
