import {
  DependencyEdge,
  DependencyNode,
  ImpactAnalysis,
  IndexSymbol,
  IndexSymbolKind,
  IndexResult,
} from '../protocol/types.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ scope: 'code-graph' });

// ============================================================
// CODE GRAPH
// ============================================================

export class CodeGraph {
  private nodes: Map<string, DependencyNode> = new Map();
  private edgeList: DependencyEdge[] = [];
  private adjacency: Map<string, Set<string>> = new Map();
  private reverseAdjacency: Map<string, Set<string>> = new Map();

  constructor() {}

  // ============================================================
  // NODE MANAGEMENT
  // ============================================================

  addNode(id: string, name: string, file: string, kind: IndexSymbolKind): void {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, {
        id,
        name,
        file,
        kind,
        incoming: [],
        outgoing: [],
      });
      this.adjacency.set(id, new Set());
      this.reverseAdjacency.set(id, new Set());
    }
  }

  removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Remove edges
    this.edgeList = this.edgeList.filter((e) => e.from !== id && e.to !== id);

    // Update adjacency
    const out = this.adjacency.get(id);
    if (out) {
      for (const target of out) {
        this.reverseAdjacency.get(target)?.delete(id);
      }
    }
    const incoming = this.reverseAdjacency.get(id);
    if (incoming) {
      for (const source of incoming) {
        this.adjacency.get(source)?.delete(id);
      }
    }

    this.adjacency.delete(id);
    this.reverseAdjacency.delete(id);
    this.nodes.delete(id);
  }

  getNode(id: string): DependencyNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(): DependencyNode[] {
    return Array.from(this.nodes.values());
  }

  getNodesByFile(file: string): DependencyNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.file === file);
  }

  getNodesByKind(kind: IndexSymbolKind): DependencyNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.kind === kind);
  }

  // ============================================================
  // EDGE MANAGEMENT
  // ============================================================

  addEdge(from: string, to: string, type: DependencyEdge['type'], file: string, line: number): void {
    // Ensure nodes exist
    if (!this.nodes.has(from)) return;
    if (!this.nodes.has(to)) return;

    // Avoid duplicate edges
    const exists = this.edgeList.some((e) => e.from === from && e.to === to && e.type === type);
    if (exists) return;

    const edge: DependencyEdge = { from, to, type, file, line };
    this.edgeList.push(edge);

    // Update adjacency
    this.adjacency.get(from)?.add(to);
    this.reverseAdjacency.get(to)?.add(from);

    // Update node references
    const fromNode = this.nodes.get(from)!;
    const toNode = this.nodes.get(to)!;
    if (!fromNode.outgoing.includes(to)) fromNode.outgoing.push(to);
    if (!toNode.incoming.includes(from)) toNode.incoming.push(from);
  }

  removeEdge(from: string, to: string): void {
    this.edgeList = this.edgeList.filter((e) => !(e.from === from && e.to === to));
    this.adjacency.get(from)?.delete(to);
    this.reverseAdjacency.get(to)?.delete(from);

    const fromNode = this.nodes.get(from);
    const toNode = this.nodes.get(to);
    if (fromNode) fromNode.outgoing = fromNode.outgoing.filter((t) => t !== to);
    if (toNode) toNode.incoming = toNode.incoming.filter((f) => f !== from);
  }

  getEdges(): DependencyEdge[] {
    return [...this.edgeList];
  }

  getEdgesFrom(id: string): DependencyEdge[] {
    return this.edgeList.filter((e) => e.from === id);
  }

  getEdgesTo(id: string): DependencyEdge[] {
    return this.edgeList.filter((e) => e.to === id);
  }

  // ============================================================
  // GRAPH CONSTRUCTION FROM INDEX
  // ============================================================

  buildFromIndexResults(results: IndexResult[]): void {
    this.clear();

    // Create nodes from all symbols
    for (const result of results) {
      for (const sym of result.symbols) {
        const id = `${sym.file}:${sym.name}`;
        this.addNode(id, sym.name, sym.file, sym.kind);
      }
    }

    // Create import/dependency edges
    for (const result of results) {
      for (const imp of result.imports) {
        for (const specifier of imp.specifiers) {
          const fromId = `${result.file}:${specifier}`;
          // Try to find the target in our index
          for (const other of results) {
            if (other.file === imp.source || other.file.endsWith(imp.source)) {
              for (const sym of other.symbols) {
                if (sym.name === specifier) {
                  const toId = `${other.file}:${sym.name}`;
                  this.addEdge(fromId, toId, 'import', result.file, imp.line);
                }
              }
            }
          }
        }
      }

      // Type hierarchy edges (extends, implements)
      for (const sym of result.symbols) {
        if (sym.signature?.includes('extends') || sym.signature?.includes('implements')) {
          const extendsMatch = sym.signature.match(/extends\s+(\w+)/);
          const implementsMatch = sym.signature.match(/implements\s+([\w\s,]+)/);

          if (extendsMatch) {
            const parentId = this.findSymbolId(extendsMatch[1], results);
            if (parentId) {
              this.addEdge(`${sym.file}:${sym.name}`, parentId, 'extends', sym.file, sym.line);
            }
          }

          if (implementsMatch) {
            const ifaces = implementsMatch[1].split(',').map((s) => s.trim());
            for (const iface of ifaces) {
              const ifaceId = this.findSymbolId(iface, results);
              if (ifaceId) {
                this.addEdge(`${sym.file}:${sym.name}`, ifaceId, 'implements', sym.file, sym.line);
              }
            }
          }
        }
      }

      // Contains edges (class contains methods)
      for (const sym of result.symbols) {
        if (sym.kind === IndexSymbolKind.Method && sym.scope !== 'global') {
          const classId = this.findSymbolId(sym.scope, results);
          if (classId) {
            this.addEdge(classId, `${sym.file}:${sym.name}`, 'contains', sym.file, sym.line);
          }
        }
      }
    }

    // Call graph: detect function calls in code
    this.buildCallGraph(results);

    logger.info(`Graph built: ${this.nodes.size} nodes, ${this.edgeList.length} edges`);
  }

  private buildCallGraph(results: IndexResult[]): void {
    // Collect all function/method names for reference
    const functionNames = new Set<string>();
    for (const result of results) {
      for (const sym of result.symbols) {
        if (sym.kind === IndexSymbolKind.Function || sym.kind === IndexSymbolKind.Method) {
          functionNames.add(sym.name);
        }
      }
    }

    // For each function, scan its body for calls to other functions
    for (const result of results) {
      for (const sym of result.symbols) {
        if (sym.kind !== IndexSymbolKind.Function && sym.kind !== IndexSymbolKind.Method) continue;

        // Get references (calls) from the symbol
        for (const ref of sym.references) {
          if (functionNames.has(ref.line)) {
            const targetId = this.findSymbolId(ref.line, results);
            if (targetId) {
              this.addEdge(`${sym.file}:${sym.name}`, targetId, 'call', sym.file, sym.line);
            }
          }
        }
      }
    }
  }

  private findSymbolId(name: string, results: IndexResult[]): string | null {
    for (const result of results) {
      for (const sym of result.symbols) {
        if (sym.name === name) {
          return `${sym.file}:${sym.name}`;
        }
      }
    }
    return null;
  }

  // ============================================================
  // QUERY METHODS
  // ============================================================

  whatCalls(symbolName: string): DependencyNode[] {
    const callers: DependencyNode[] = [];
    for (const [id, node] of this.nodes) {
      if (node.name === symbolName) {
        for (const callerId of node.incoming) {
          const caller = this.nodes.get(callerId);
          if (caller) callers.push(caller);
        }
      }
    }
    return callers;
  }

  whatDoesXCall(symbolName: string): DependencyNode[] {
    const callees: DependencyNode[] = [];
    for (const [id, node] of this.nodes) {
      if (node.name === symbolName) {
        for (const calleeId of node.outgoing) {
          const callee = this.nodes.get(calleeId);
          if (callee) callees.push(callee);
        }
      }
    }
    return callees;
  }

  whatDependsOn(symbolName: string): string[] {
    const visited = new Set<string>();
    const deps: string[] = [];

    for (const [id, node] of this.nodes) {
      if (node.name === symbolName) {
        this.bfsReverse(id, visited, deps);
      }
    }

    return deps.filter((d) => {
      const n = this.nodes.get(d);
      return n && n.name !== symbolName;
    });
  }

  whatDoesXDependOn(symbolName: string): string[] {
    const visited = new Set<string>();
    const deps: string[] = [];

    for (const [id, node] of this.nodes) {
      if (node.name === symbolName) {
        this.bfsForward(id, visited, deps);
      }
    }

    return deps.filter((d) => {
      const n = this.nodes.get(d);
      return n && n.name !== symbolName;
    });
  }

  analyzeImpact(symbolName: string): ImpactAnalysis {
    const directDependents: string[] = [];
    const directDependencies: string[] = [];
    const affectedFiles = new Set<string>();
    const targetIds: string[] = [];

    for (const [id, node] of this.nodes) {
      if (node.name === symbolName) {
        targetIds.push(id);
        directDependents.push(...node.incoming);
        directDependencies.push(...node.outgoing);
        affectedFiles.add(node.file);
      }
    }

    // Transitive dependents (what could break)
    const visited = new Set<string>();
    const transitiveDependents: string[] = [];
    for (const id of targetIds) {
      this.bfsReverse(id, visited, transitiveDependents);
    }

    // Transitive dependencies (what we need)
    const visited2 = new Set<string>();
    const transitiveDependencies: string[] = [];
    for (const id of targetIds) {
      this.bfsForward(id, visited2, transitiveDependencies);
    }

    // Collect affected files
    for (const depId of transitiveDependents) {
      const dep = this.nodes.get(depId);
      if (dep) affectedFiles.add(dep.file);
    }

    const directCount = directDependents.length;
    const transitiveCount = transitiveDependents.length;

    let riskLevel: ImpactAnalysis['riskLevel'] = 'low';
    if (transitiveCount > 20) riskLevel = 'critical';
    else if (transitiveCount > 10) riskLevel = 'high';
    else if (transitiveCount > 3) riskLevel = 'medium';

    return {
      target: symbolName,
      directDependents: [...new Set(directDependents)],
      transitiveDependents: [...new Set(transitiveDependents)].filter((d) => !targetIds.includes(d)),
      directDependencies: [...new Set(directDependencies)],
      transitiveDependencies: [...new Set(transitiveDependencies)].filter((d) => !targetIds.includes(d)),
      affectedFiles: Array.from(affectedFiles),
      riskLevel,
    };
  }

  findCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = this.adjacency.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          cycles.push(path.slice(cycleStart));
        }
      }

      recStack.delete(node);
    };

    for (const id of this.nodes.keys()) {
      if (!visited.has(id)) {
        dfs(id, []);
      }
    }

    return cycles;
  }

  topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    for (const id of this.nodes.keys()) {
      inDegree.set(id, 0);
    }
    for (const edge of this.edgeList) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);

      for (const neighbor of this.adjacency.get(node) || new Set()) {
        const deg = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0) queue.push(neighbor);
      }
    }

    return sorted;
  }

  // ============================================================
  // EXPORT FORMATS
  // ============================================================

  toAdjacencyList(): Record<string, string[]> {
    const list: Record<string, string[]> = {};
    for (const [id, neighbors] of this.adjacency) {
      list[id] = Array.from(neighbors);
    }
    return list;
  }

  toDOT(label?: string): string {
    const lines: string[] = [
      `digraph "${label || 'CodeGraph'}" {`,
      '  rankdir=LR;',
      '  node [shape=box, fontname="Courier"];',
    ];

    // Group nodes by file
    const fileGroups = new Map<string, DependencyNode[]>();
    for (const node of this.nodes.values()) {
      const group = fileGroups.get(node.file) || [];
      group.push(node);
      fileGroups.set(node.file, group);
    }

    // Create subgraphs per file
    let clusterIdx = 0;
    for (const [file, nodes] of fileGroups) {
      lines.push(`  subgraph cluster_${clusterIdx} {`);
      lines.push(`    label="${file}";`);
      lines.push('    style=dashed;');

      for (const node of nodes) {
        const shape = node.kind === IndexSymbolKind.Class ? 'box' :
                      node.kind === IndexSymbolKind.Interface ? 'diamond' :
                      node.kind === IndexSymbolKind.Function ? 'ellipse' : 'box';
        lines.push(`    "${node.id}" [label="${node.name}", shape=${shape}];`);
      }

      lines.push('  }');
      clusterIdx++;
    }

    // Edges
    for (const edge of this.edgeList) {
      const style = edge.type === 'call' ? 'dashed' :
                    edge.type === 'extends' ? 'bold' :
                    edge.type === 'import' ? 'dotted' : 'solid';
      const color = edge.type === 'call' ? 'blue' :
                    edge.type === 'extends' ? 'green' :
                    edge.type === 'import' ? 'gray' : 'black';
      lines.push(`  "${edge.from}" -> "${edge.to}" [label="${edge.type}", style=${style}, color=${color}];`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  toJSON(): { nodes: DependencyNode[]; edges: DependencyEdge[] } {
    return {
      nodes: this.getNodes(),
      edges: this.getEdges(),
    };
  }

  getStats(): { nodes: number; edges: number; files: number; maxDepth: number } {
    const files = new Set<string>();
    for (const node of this.nodes.values()) {
      files.add(node.file);
    }

    // Calculate max depth via BFS from root nodes (no incoming)
    let maxDepth = 0;
    const roots = Array.from(this.nodes.keys()).filter(
      (id) => (this.reverseAdjacency.get(id)?.size || 0) === 0
    );

    for (const root of roots) {
      const depth = this.bfsDepth(root);
      maxDepth = Math.max(maxDepth, depth);
    }

    return {
      nodes: this.nodes.size,
      edges: this.edgeList.length,
      files: files.size,
      maxDepth,
    };
  }

  clear(): void {
    this.nodes.clear();
    this.edgeList = [];
    this.adjacency.clear();
    this.reverseAdjacency.clear();
  }

  // ============================================================
  // BFS HELPERS
  // ============================================================

  private bfsForward(start: string, visited: Set<string>, result: string[]): void {
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      result.push(current);

      const neighbors = this.adjacency.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }

  private bfsReverse(start: string, visited: Set<string>, result: string[]): void {
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      result.push(current);

      const neighbors = this.reverseAdjacency.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }

  private bfsDepth(start: string): number {
    const visited = new Map<string, number>();
    const queue: Array<{ node: string; depth: number }> = [{ node: start, depth: 0 }];
    let maxDepth = 0;

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      if (visited.has(node)) continue;
      visited.set(node, depth);
      maxDepth = Math.max(maxDepth, depth);

      const neighbors = this.adjacency.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ node: neighbor, depth: depth + 1 });
        }
      }
    }

    return maxDepth;
  }
}

export default CodeGraph;
