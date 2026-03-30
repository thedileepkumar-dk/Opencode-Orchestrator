import {
  CodeChunk,
  VectorSearchResult,
  IndexSymbolKind,
  IndexSymbol,
} from '../protocol/types.js';
import { Logger } from '../utils/logger.js';
import * as crypto from 'crypto';

const logger = new Logger({ scope: 'vector-store' });

// ============================================================
// TF-IDF EMBEDDING ENGINE
// ============================================================

class TFIDFEmbedder {
  private documentFrequency: Map<string, number> = new Map();
  private documentCount = 0;
  private vocabulary: Map<string, number> = new Map();
  private dimension: number;

  constructor(dimension = 256) {
    this.dimension = dimension;
  }

  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && t.length < 50)
      .map((t) => t.trim());
  }

  fit(documents: string[]): void {
    this.documentCount = documents.length;
    this.documentFrequency.clear();

    // Count document frequency
    for (const doc of documents) {
      const tokens = new Set(this.tokenize(doc));
      for (const token of tokens) {
        this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
      }
    }

    // Build vocabulary from top terms by TF-IDF
    const scores: Array<{ term: string; score: number }> = [];
    for (const [term, df] of this.documentFrequency) {
      const idf = Math.log((this.documentCount + 1) / (df + 1)) + 1;
      scores.push({ term, score: idf * df });
    }

    scores.sort((a, b) => b.score - a.score);
    this.vocabulary.clear();

    const dim = Math.min(this.dimension, scores.length);
    for (let i = 0; i < dim; i++) {
      this.vocabulary.set(scores[i].term, i);
    }
  }

  embed(text: string): number[] {
    const tokens = this.tokenize(text);
    const vector = new Array(this.dimension).fill(0);

    if (tokens.length === 0) return vector;

    // Term frequency
    const tf: Map<string, number> = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // TF-IDF weighting
    for (const [term, freq] of tf) {
      const idx = this.vocabulary.get(term);
      if (idx !== undefined) {
        const df = this.documentFrequency.get(term) || 1;
        const idf = Math.log((this.documentCount + 1) / (df + 1)) + 1;
        vector[idx] = (freq / tokens.length) * idf;
      }
    }

    // Add n-gram features for terms not in vocabulary
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      const hash = this.hashToIndex(bigram);
      vector[hash] += 0.5 / tokens.length;
    }

    // Normalize
    return this.normalize(vector);
  }

  private hashToIndex(term: string): number {
    let hash = 0;
    for (let i = 0; i < term.length; i++) {
      hash = ((hash << 5) - hash + term.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % this.dimension;
  }

  private normalize(vector: number[]): number[] {
    let magnitude = 0;
    for (const v of vector) magnitude += v * v;
    magnitude = Math.sqrt(magnitude);
    if (magnitude === 0) return vector;
    return vector.map((v) => v / magnitude);
  }
}

// ============================================================
// VECTOR STORE
// ============================================================

export class VectorStore {
  private chunks: Map<string, CodeChunk> = new Map();
  private embedder: TFIDFEmbedder;
  private dirty = true;

  constructor(private dimension = 256) {
    this.embedder = new TFIDFEmbedder(dimension);
  }

  add(chunk: CodeChunk): void {
    this.chunks.set(chunk.id, chunk);
    this.dirty = true;
  }

  addBatch(chunks: CodeChunk[]): void {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
    this.dirty = true;
  }

  remove(id: string): boolean {
    this.dirty = true;
    return this.chunks.delete(id);
  }

  removeByFile(file: string): number {
    let count = 0;
    for (const [id, chunk] of this.chunks) {
      if (chunk.file === file) {
        this.chunks.delete(id);
        count++;
      }
    }
    if (count > 0) this.dirty = true;
    return count;
  }

  get(id: string): CodeChunk | undefined {
    return this.chunks.get(id);
  }

  getByFile(file: string): CodeChunk[] {
    return Array.from(this.chunks.values()).filter((c) => c.file === file);
  }

  size(): number {
    return this.chunks.size;
  }

  search(query: string, limit = 10, minScore = 0.01): VectorSearchResult[] {
    if (this.chunks.size === 0) return [];
    this.ensureTrained();

    const queryEmbedding = this.embedder.embed(query);
    const results: VectorSearchResult[] = [];

    for (const chunk of this.chunks.values()) {
      if (!chunk.embedding) {
        chunk.embedding = this.embedder.embed(this.chunkToText(chunk));
      }

      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= minScore) {
        results.push({ chunk, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  searchBySymbol(symbolName: string, limit = 10): VectorSearchResult[] {
    return this.search(symbolName, limit, 0.1);
  }

  searchByCode(codeSnippet: string, limit = 10): VectorSearchResult[] {
    return this.search(codeSnippet, limit, 0.05);
  }

  rebuild(): void {
    this.dirty = true;
    this.ensureTrained();
    for (const chunk of this.chunks.values()) {
      chunk.embedding = this.embedder.embed(this.chunkToText(chunk));
    }
    this.dirty = false;
  }

  clear(): void {
    this.chunks.clear();
    this.dirty = true;
  }

  getAll(): CodeChunk[] {
    return Array.from(this.chunks.values());
  }

  getStats(): { totalChunks: number; files: number; withEmbeddings: number; avgChunkSize: number } {
    const files = new Set<string>();
    let withEmbeddings = 0;
    let totalSize = 0;

    for (const chunk of this.chunks.values()) {
      files.add(chunk.file);
      if (chunk.embedding) withEmbeddings++;
      totalSize += chunk.content.length;
    }

    return {
      totalChunks: this.chunks.size,
      files: files.size,
      withEmbeddings,
      avgChunkSize: this.chunks.size > 0 ? totalSize / this.chunks.size : 0,
    };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private ensureTrained(): void {
    if (this.dirty || this.chunks.size === 0) {
      const texts = Array.from(this.chunks.values()).map((c) => this.chunkToText(c));
      if (texts.length > 0) {
        this.embedder.fit(texts);
        // Re-embed all chunks after retraining
        for (const chunk of this.chunks.values()) {
          chunk.embedding = this.embedder.embed(this.chunkToText(chunk));
        }
      }
      this.dirty = false;
    }
  }

  private chunkToText(chunk: CodeChunk): string {
    const parts = [chunk.symbolName, chunk.kind, chunk.content];
    if (chunk.metadata.signature) parts.push(chunk.metadata.signature as string);
    if (chunk.metadata.docstring) parts.push(chunk.metadata.docstring as string);
    return parts.join(' ');
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }
}

// ============================================================
// CHUNK BUILDER
// ============================================================

export function buildChunksFromSymbols(
  symbols: IndexSymbol[],
  fileContent: string
): CodeChunk[] {
  const lines = fileContent.split('\n');
  const chunks: CodeChunk[] = [];

  for (const sym of symbols) {
    const startLine = Math.max(0, sym.line - 1);
    const endLine = Math.min(lines.length, sym.endLine);
    const content = lines.slice(startLine, endLine).join('\n');

    if (content.trim().length === 0) continue;

    chunks.push({
      id: crypto.createHash('md5').update(`${sym.file}:${sym.line}:${sym.name}`).digest('hex').slice(0, 12),
      content,
      file: sym.file,
      startLine: sym.line,
      endLine: sym.endLine,
      kind: sym.kind,
      symbolName: sym.name,
      metadata: {
        scope: sym.scope,
        signature: sym.signature,
        docstring: sym.docstring,
        exports: sym.exports,
      },
    });
  }

  return chunks;
}

export function buildChunksFromContent(
  fileContent: string,
  file: string,
  chunkSize = 50,
  overlap = 5
): CodeChunk[] {
  const lines = fileContent.split('\n');
  const chunks: CodeChunk[] = [];
  let idCounter = 0;

  for (let start = 0; start < lines.length; start += chunkSize - overlap) {
    const end = Math.min(start + chunkSize, lines.length);
    const content = lines.slice(start, end).join('\n').trim();

    if (content.length === 0) continue;

    chunks.push({
      id: crypto.createHash('md5').update(`${file}:${start}:${end}`).digest('hex').slice(0, 12),
      content,
      file,
      startLine: start + 1,
      endLine: end,
      kind: IndexSymbolKind.Variable,
      symbolName: `chunk_${idCounter++}`,
      metadata: {
        type: 'sliding_window',
      },
    });

    if (end >= lines.length) break;
  }

  return chunks;
}

export default VectorStore;
