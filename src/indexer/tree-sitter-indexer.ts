import * as fs from 'fs';
import * as path from 'path';
import {
  IndexSymbol,
  IndexSymbolKind,
  IndexResult,
  ImportStatement,
  ExportStatement,
  SymbolReference,
} from '../protocol/types.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ scope: 'tree-sitter-indexer' });

// ============================================================
// LANGUAGE DEFINITIONS
// ============================================================

interface LanguageConfig {
  name: string;
  extensions: string[];
  lineComment: string;
  blockComment?: { start: string; end: string };
  patterns: LanguagePatterns;
}

interface LanguagePatterns {
  functionDef: RegExp;
  classDef: RegExp;
  interfaceDef: RegExp;
  typeDef: RegExp;
  enumDef: RegExp;
  importStatement: RegExp;
  exportStatement: RegExp;
  methodDef: RegExp;
  decoratorDef: RegExp;
  variableDef: RegExp;
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  typescript: {
    name: 'TypeScript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    patterns: {
      functionDef: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\{]+))?/,
      classDef: /^(?:export\s+)?(?:(?:abstract|export)\s+)*class\s+(\w+)(?:\s+(?:extends|implements)\s+(\w+))?/,
      interfaceDef: /^(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([\w\s,]+))?/,
      typeDef: /^(?:export\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=/,
      enumDef: /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/,
      importStatement: /^import\s+(?:type\s+)?(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))?\s*(?:,\s*(\{[^}]+\}))?\s*from\s+['"]([^'"]+)['"]/,
      exportStatement: /^export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/,
      methodDef: /^\s+(?:public|private|protected|static|readonly|async|override|\s)*\s*(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\{;]+))?/,
      decoratorDef: /^@(\w+(?:\.\w+)?)(?:\(([^)]*)\))?/,
      variableDef: /^(?:export\s+)?(?:const|let|var)\s+(\w+)(?:\s*:\s*([^=]+))?/,
    },
  },
  javascript: {
    name: 'JavaScript',
    extensions: ['', '.jsx', '.mjs', '.cjs'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    patterns: {
      functionDef: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
      classDef: /^(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/,
      interfaceDef: /^$/, // JS doesn't have interfaces
      typeDef: /^$/,
      enumDef: /^$/,
      importStatement: /^import\s+(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))?\s*(?:,\s*(\{[^}]+\}))?\s*from\s+['"]([^'"]+)['"]/,
      exportStatement: /^export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/,
      methodDef: /^\s+(?:static\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)/,
      decoratorDef: /^$/,
      variableDef: /^(?:export\s+)?(?:const|let|var)\s+(\w+)(?:\s*=\s*)?/,
    },
  },
  python: {
    name: 'Python',
    extensions: ['.py', '.pyw', '.pyi'],
    lineComment: '#',
    patterns: {
      functionDef: /^(?:@\w+(?:\([^)]*\))?\s*\n\s*)*(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^\:]+))?/,
      classDef: /^class\s+(\w+)(?:\(([^)]*)\))?:/,
      interfaceDef: /^$/, // Python uses Protocol/ABC
      typeDef: /^(?:class|TypeAlias)\s+(\w+)|^(\w+)\s*:\s*TypeAlias/,
      enumDef: /^class\s+(\w+)\s*\(\s*Enum\s*\)/,
      importStatement: /^(?:from\s+([^\s]+)\s+)?import\s+(.+)$/,
      exportStatement: /^__all__\s*=\s*\[([^\]]+)\]/,
      methodDef: /^\s+(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^\:]+))?/,
      decoratorDef: /^@(\w+(?:\.\w+)?)(?:\(([^)]*)\))?/,
      variableDef: /^(\w+)\s*(?::\s*([^=]+))?=/,
    },
  },
  go: {
    name: 'Go',
    extensions: ['.go'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    patterns: {
      functionDef: /^func\s+(?:\(([^)]+)\)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*(\S+))?/,
      classDef: /^type\s+(\w+)\s+struct\s*\{/,
      interfaceDef: /^type\s+(\w+)\s+interface\s*\{/,
      typeDef: /^type\s+(\w+)\s+(\S+)/,
      enumDef: /^$/, // Go uses const iota
      importStatement: /^import\s+(?:"([^"]+)"|(\w+)\s+"([^"]+)"|\(([\s\S]*?)\))/,
      exportStatement: /^$/, // Go uses capitalization
      methodDef: /^func\s+\(([^)]+)\)\s+(\w+)\s*\(([^)]*)\)(?:\s*(\S+))?/,
      decoratorDef: /^$/, // Go doesn't have decorators
      variableDef: /^(?:var|const)\s+(\w+)\s+([^=]+)?/,
    },
  },
  rust: {
    name: 'Rust',
    extensions: ['.rs'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    patterns: {
      functionDef: /^(?:pub\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*->\s*([^\{]+))?/,
      classDef: /^(?:pub\s+)?struct\s+(\w+)(?:<[^>]*>)?/,
      interfaceDef: /^(?:pub\s+)?trait\s+(\w+)(?:<[^>]*>)?(?:\s*:\s*([^\{]+))?/,
      typeDef: /^(?:pub\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=/,
      enumDef: /^(?:pub\s+)?enum\s+(\w+)/,
      importStatement: /^use\s+([^;]+);/,
      exportStatement: /^pub\s+(?:fn|struct|enum|type|trait|mod|const|static)\s+(\w+)/,
      methodDef: /^\s+(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^\{]+))?/,
      decoratorDef: /^#\[([^\]]+)\]/,
      variableDef: /^(?:pub\s+)?(?:const|static|let)\s+(?:mut\s+)?(\w+)\s*(?::\s*([^=]+))?/,
    },
  },
  java: {
    name: 'Java',
    extensions: ['.java'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    patterns: {
      functionDef: /^\s*(?:public|private|protected|static|final|abstract|synchronized|\s)*\s*(?:<[^>]*>\s+)?(\w+)\s+(\w+)\s*\(([^)]*)\)(?:\s*throws\s+([^\{]+))?/,
      classDef: /^\s*(?:public|private|protected|abstract|final|\s)*\s*class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w\s,]+))?/,
      interfaceDef: /^\s*(?:public|\s)*\s*interface\s+(\w+)(?:\s+extends\s+([\w\s,]+))?/,
      typeDef: /^$/,
      enumDef: /^\s*(?:public|\s)*\s*enum\s+(\w+)/,
      importStatement: /^import\s+(?:static\s+)?([^;]+);/,
      exportStatement: /^$/,
      methodDef: /^\s*(?:@\w+\s*)*(?:public|private|protected|static|final|abstract|synchronized|native|\s)*\s*(?:<[^>]*>\s+)?(\w+)\s+(\w+)\s*\(([^)]*)\)/,
      decoratorDef: /^@(\w+(?:\.\w+)?)(?:\(([^)]*)\))?/,
      variableDef: /^\s*(?:public|private|protected|static|final|volatile|transient|\s)*\s*(\w+)\s+(\w+)\s*(?:=\s*([^;]+))?;/,
    },
  },
};

// ============================================================
// FILE -> LANGUAGE MAPPING
// ============================================================

const EXT_TO_LANG: Record<string, string> = {};
for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
  for (const ext of config.extensions) {
    EXT_TO_LANG[ext] = lang;
  }
}

// ============================================================
// INDEXER
// ============================================================

export class TreeSitterIndexer {
  private fileIndex: Map<string, IndexResult> = new Map();
  private symbolTable: Map<string, IndexSymbol[]> = new Map();
  private scopeStack: string[] = [];

  constructor(private rootDir: string) {}

  detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    return EXT_TO_LANG[ext] ?? null;
  }

  getSupportedExtensions(): string[] {
    return Object.keys(EXT_TO_LANG);
  }

  async indexFile(filePath: string): Promise<IndexResult> {
    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.rootDir, filePath);
    const relPath = path.relative(this.rootDir, absPath);

    const language = this.detectLanguage(absPath);
    if (!language) {
      return {
        file: relPath,
        language: 'unknown',
        symbols: [],
        imports: [],
        exports: [],
        dependencies: [],
        errors: ['Unsupported file type'],
        parseTime: 0,
        indexedAt: Date.now(),
      };
    }

    const start = Date.now();
    let content: string;

    try {
      content = await fs.promises.readFile(absPath, 'utf-8');
    } catch (err) {
      return {
        file: relPath,
        language,
        symbols: [],
        imports: [],
        exports: [],
        dependencies: [],
        errors: [`Failed to read file: ${(err as Error).message}`],
        parseTime: 0,
        indexedAt: Date.now(),
      };
    }

    const config = LANGUAGE_CONFIGS[language];
    const result = this.parseContent(content, config, relPath);
    result.parseTime = Date.now() - start;
    result.indexedAt = Date.now();

    // Update caches
    this.fileIndex.set(relPath, result);
    this.updateSymbolTable(result);

    return result;
  }

  async indexFiles(filePaths: string[]): Promise<IndexResult[]> {
    const results = await Promise.all(filePaths.map((f) => this.indexFile(f)));
    return results;
  }

  async indexDirectory(dir?: string): Promise<Map<string, IndexResult>> {
    const targetDir = dir ?? this.rootDir;
    const files = await this.walkDirectory(targetDir);

    const indexable = files.filter((f) => this.detectLanguage(f) !== null);
    logger.info(`Indexing ${indexable.length} files in ${targetDir}`);

    const BATCH_SIZE = 50;
    for (let i = 0; i < indexable.length; i += BATCH_SIZE) {
      const batch = indexable.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((f) => this.indexFile(f)));
    }

    logger.info(`Indexed ${this.fileIndex.size} files, ${this.symbolTable.size} unique symbols`);
    return new Map(this.fileIndex);
  }

  getSymbol(name: string): IndexSymbol[] {
    return this.symbolTable.get(name) ?? [];
  }

  getSymbolsForFile(file: string): IndexSymbol[] {
    const result = this.fileIndex.get(file);
    return result?.symbols ?? [];
  }

  getImportsForFile(file: string): ImportStatement[] {
    const result = this.fileIndex.get(file);
    return result?.imports ?? [];
  }

  getExportsForFile(file: string): ExportStatement[] {
    const result = this.fileIndex.get(file);
    return result?.exports ?? [];
  }

  getAllSymbols(): Map<string, IndexSymbol[]> {
    return new Map(this.symbolTable);
  }

  getAllFiles(): string[] {
    return Array.from(this.fileIndex.keys());
  }

  searchSymbols(query: string, kind?: IndexSymbolKind): IndexSymbol[] {
    const lower = query.toLowerCase();
    const results: IndexSymbol[] = [];

    for (const symbols of this.symbolTable.values()) {
      for (const sym of symbols) {
        if (kind && sym.kind !== kind) continue;
        if (sym.name.toLowerCase().includes(lower) ||
            sym.signature?.toLowerCase().includes(lower) ||
            sym.docstring?.toLowerCase().includes(lower)) {
          results.push(sym);
        }
      }
    }

    return results;
  }

  removeFile(filePath: string): void {
    const relPath = path.relative(this.rootDir, path.isAbsolute(filePath) ? filePath : path.resolve(this.rootDir, filePath));
    const result = this.fileIndex.get(relPath);
    if (result) {
      for (const sym of result.symbols) {
        const entries = this.symbolTable.get(sym.name);
        if (entries) {
          const filtered = entries.filter((e) => e.file !== relPath);
          if (filtered.length > 0) {
            this.symbolTable.set(sym.name, filtered);
          } else {
            this.symbolTable.delete(sym.name);
          }
        }
      }
      this.fileIndex.delete(relPath);
    }
  }

  clear(): void {
    this.fileIndex.clear();
    this.symbolTable.clear();
  }

  // ============================================================
  // PARSING ENGINE
  // ============================================================

  private parseContent(content: string, config: LanguageConfig, file: string): IndexResult {
    const lines = content.split('\n');
    const symbols: IndexSymbol[] = [];
    const imports: ImportStatement[] = [];
    const exports: ExportStatement[] = [];
    const dependencies: string[] = [];
    const errors: string[] = [];

    this.scopeStack = ['global'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith(config.lineComment)) continue;
      if (config.blockComment) {
        if (trimmed.startsWith(config.blockComment.start)) {
          while (i < lines.length && !lines[i].includes(config.blockComment!.end)) {
            i++;
          }
          continue;
        }
      }

      // Empty line
      if (trimmed === '') continue;

      try {
        // Imports
        const importMatch = trimmed.match(config.patterns.importStatement);
        if (importMatch) {
          const imp = this.parseImport(importMatch, config.name, i, file);
          imports.push(imp);
          if (imp.source && !dependencies.includes(imp.source)) {
            dependencies.push(imp.source);
          }
          continue;
        }

        // Exports
        const exportMatch = trimmed.match(config.patterns.exportStatement);
        if (exportMatch && config.patterns.exportStatement.source !== '^$') {
          const exp = this.parseExport(exportMatch, i, file, trimmed);
          exports.push(exp);
          continue;
        }

        // Decorator detection (before class/method/function)
        let decorator: string | undefined;
        if (i > 0) {
          const prevLine = lines[i - 1].trim();
          const decMatch = prevLine.match(config.patterns.decoratorDef);
          if (decMatch) {
            decorator = decMatch[1];
          }
        }

        // Functions
        const funcMatch = trimmed.match(config.patterns.functionDef);
        if (funcMatch) {
          const sym = this.parseFunction(funcMatch, config.name, i, file, lines, decorator);
          symbols.push(sym);
          // Also add as a reference in the symbol table
          this.addReference(sym, file, i, line);
          continue;
        }

        // Methods
        const methodMatch = trimmed.match(config.patterns.methodDef);
        if (methodMatch && this.scopeStack.length > 1) {
          const sym = this.parseMethod(methodMatch, config.name, i, file, lines);
          symbols.push(sym);
          this.addReference(sym, file, i, line);
          continue;
        }

        // Classes
        const classMatch = trimmed.match(config.patterns.classDef);
        if (classMatch) {
          const sym = this.parseClass(classMatch, config.name, i, file, lines);
          symbols.push(sym);
          this.scopeStack.push(classMatch[1]);
          continue;
        }

        // Interfaces
        const ifaceMatch = trimmed.match(config.patterns.interfaceDef);
        if (ifaceMatch && config.patterns.interfaceDef.source !== '^$') {
          const sym = this.parseInterface(ifaceMatch, i, file, lines);
          symbols.push(sym);
          this.scopeStack.push(ifaceMatch[1]);
          continue;
        }

        // Types
        const typeMatch = trimmed.match(config.patterns.typeDef);
        if (typeMatch && config.patterns.typeDef.source !== '^$') {
          const sym = this.parseType(typeMatch, i, file);
          symbols.push(sym);
          continue;
        }

        // Enums
        const enumMatch = trimmed.match(config.patterns.enumDef);
        if (enumMatch && config.patterns.enumDef.source !== '^$') {
          const sym = this.parseEnum(enumMatch, i, file, lines);
          symbols.push(sym);
          this.scopeStack.push(enumMatch[1]);
          continue;
        }

        // Variables
        const varMatch = trimmed.match(config.patterns.variableDef);
        if (varMatch) {
          const sym = this.parseVariable(varMatch, config.name, i, file);
          if (sym) symbols.push(sym);
          continue;
        }

        // Detect scope closing
        if (trimmed === '}' || trimmed === '});' || trimmed === 'end') {
          if (this.scopeStack.length > 1) {
            this.scopeStack.pop();
          }
        }
      } catch (err) {
        errors.push(`Line ${i + 1}: ${(err as Error).message}`);
      }
    }

    return {
      file,
      language: config.name,
      symbols,
      imports,
      exports,
      dependencies,
      errors,
      parseTime: 0,
      indexedAt: 0,
    };
  }

  private parseImport(match: RegExpMatchArray, lang: string, line: number, file: string): ImportStatement {
    let source = '';
    let specifiers: string[] = [];
    let isDefault = false;
    let isNamespace = false;

    if (lang === 'Python') {
      source = match[1] || '';
      const names = (match[2] || '').split(',').map((s) => s.trim());
      specifiers = names;
      isDefault = names.length === 1 && !names[0].startsWith('{');
    } else {
      // JS/TS
      source = match[5] || '';
      if (match[2]) {
        // * as name
        isNamespace = true;
        specifiers = [match[2].replace(/\*\s+as\s+/, '').trim()];
      } else if (match[1] || match[4]) {
        // { named }
        const braces = match[1] || match[4];
        specifiers = braces
          .replace(/[{}]/g, '')
          .split(',')
          .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);
      } else if (match[3]) {
        // default import
        isDefault = true;
        specifiers = [match[3].trim()];
      }
    }

    return {
      source,
      specifiers,
      isDefault,
      isNamespace,
      isDynamic: false,
      line: line + 1,
      file,
    };
  }

  private parseExport(match: RegExpMatchArray, line: number, file: string, rawLine: string): ExportStatement {
    const name = match[1] || '';
    const isDefault = rawLine.includes('default');
    return {
      name,
      isDefault,
      isReExport: rawLine.includes('from'),
      line: line + 1,
      file,
    };
  }

  private parseFunction(
    match: RegExpMatchArray, lang: string, line: number, file: string, lines: string[], decorator?: string
  ): IndexSymbol {
    let name: string;
    let params: string;
    let returnType: string | undefined;

    if (lang === 'Go') {
      // func (receiver) Name(params) returnType
      name = match[2] || match[1];
      params = match[3] || '';
      returnType = match[4];
    } else if (lang === 'Java') {
      name = match[2];
      params = match[3] || '';
      returnType = match[1]; // Java: returnType Name
    } else {
      name = match[1];
      params = match[2] || '';
      returnType = match[3];
    }

    const endLine = this.findBlockEnd(lines, line);
    const signature = `${name}(${params})${returnType ? ': ' + returnType.trim() : ''}`;
    const docstring = this.extractDocstring(lines, line);

    return {
      name,
      kind: IndexSymbolKind.Function,
      file,
      line: line + 1,
      endLine: endLine + 1,
      column: 0,
      endColumn: 0,
      signature,
      docstring,
      scope: this.scopeStack[this.scopeStack.length - 1],
      references: [],
      exports: false,
    };
  }

  private parseMethod(
    match: RegExpMatchArray, lang: string, line: number, file: string, lines: string[]
  ): IndexSymbol {
    let name: string;
    let params: string;
    let returnType: string | undefined;

    if (lang === 'Go') {
      // func (receiver) Name(params) returnType
      name = match[2];
      params = match[3] || '';
      returnType = match[4];
    } else {
      name = match[1];
      params = match[2] || '';
      returnType = match[3];
    }

    const endLine = this.findBlockEnd(lines, line);
    const signature = `${name}(${params})${returnType ? ': ' + returnType.trim() : ''}`;

    return {
      name,
      kind: IndexSymbolKind.Method,
      file,
      line: line + 1,
      endLine: endLine + 1,
      column: 0,
      endColumn: 0,
      signature,
      scope: this.scopeStack[this.scopeStack.length - 1],
      references: [],
      exports: false,
    };
  }

  private parseClass(match: RegExpMatchArray, lang: string, line: number, file: string, lines: string[]): IndexSymbol {
    const name = match[1];
    const parent = match[2];
    const endLine = this.findBlockEnd(lines, line);
    const docstring = this.extractDocstring(lines, line);

    return {
      name,
      kind: IndexSymbolKind.Class,
      file,
      line: line + 1,
      endLine: endLine + 1,
      column: 0,
      endColumn: 0,
      signature: parent ? `class ${name} extends ${parent}` : `class ${name}`,
      docstring,
      scope: this.scopeStack[this.scopeStack.length - 1],
      references: [],
      exports: false,
    };
  }

  private parseInterface(match: RegExpMatchArray, line: number, file: string, lines: string[]): IndexSymbol {
    const name = match[1];
    const parent = match[2];
    const endLine = this.findBlockEnd(lines, line);
    const docstring = this.extractDocstring(lines, line);

    return {
      name,
      kind: IndexSymbolKind.Interface,
      file,
      line: line + 1,
      endLine: endLine + 1,
      column: 0,
      endColumn: 0,
      signature: parent ? `interface ${name} extends ${parent}` : `interface ${name}`,
      docstring,
      scope: this.scopeStack[this.scopeStack.length - 1],
      references: [],
      exports: false,
    };
  }

  private parseType(match: RegExpMatchArray, line: number, file: string): IndexSymbol {
    const name = match[1] || match[2];
    return {
      name,
      kind: IndexSymbolKind.Type,
      file,
      line: line + 1,
      endLine: line + 1,
      column: 0,
      endColumn: 0,
      signature: `type ${name}`,
      scope: this.scopeStack[this.scopeStack.length - 1],
      references: [],
      exports: false,
    };
  }

  private parseEnum(match: RegExpMatchArray, line: number, file: string, lines: string[]): IndexSymbol {
    const name = match[1];
    const endLine = this.findBlockEnd(lines, line);
    return {
      name,
      kind: IndexSymbolKind.Enum,
      file,
      line: line + 1,
      endLine: endLine + 1,
      column: 0,
      endColumn: 0,
      signature: `enum ${name}`,
      scope: this.scopeStack[this.scopeStack.length - 1],
      references: [],
      exports: false,
    };
  }

  private parseVariable(match: RegExpMatchArray, lang: string, line: number, file: string): IndexSymbol | null {
    const name = match[1];
    if (!name || name.length > 100) return null;

    let typeAnnotation = match[2];
    if (lang === 'Java') {
      typeAnnotation = match[1]; // Java: Type name
    }

    return {
      name,
      kind: IndexSymbolKind.Variable,
      file,
      line: line + 1,
      endLine: line + 1,
      column: 0,
      endColumn: 0,
      signature: typeAnnotation ? `${name}: ${typeAnnotation.trim()}` : name,
      scope: this.scopeStack[this.scopeStack.length - 1],
      references: [],
      exports: false,
    };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private findBlockEnd(lines: string[], startLine: number): number {
    let depth = 0;
    let started = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') { depth--; }
        if (ch === '(') depth++;
        if (ch === ')') depth--;
      }
      if (started && depth <= 0) return i;

      // Python-style: look for next def/class at same indent
      if (i > startLine && depth === 0 && started) {
        const indent = lines[startLine].match(/^(\s*)/)?.[1].length ?? 0;
        const curIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
        if (line.trim() && curIndent <= indent && !line.trim().startsWith('#')) {
          return i - 1;
        }
      }
    }

    return Math.min(startLine + 50, lines.length - 1);
  }

  private extractDocstring(lines: string[], line: number): string | undefined {
    // Look for docstring or JSDoc before the function
    const docs: string[] = [];
    let i = line - 1;

    // Check for JSDoc / Python docstring / Rust doc comment
    while (i >= 0) {
      const prev = lines[i].trim();
      if (prev.startsWith('/**') || prev.startsWith('"""') || prev.startsWith("'''")) break;
      if (prev.startsWith('* ') || prev.startsWith(' *') || prev.startsWith('#') || prev.startsWith('//')) {
        docs.unshift(prev.replace(/^[\s*#\/]+/, '').trim());
        i--;
      } else if (prev === '') {
        i--;
      } else {
        break;
      }
    }

    if (docs.length === 0) {
      // Check for Python docstring after def
      const nextLine = lines[line + 1]?.trim();
      if (nextLine?.startsWith('"""') || nextLine?.startsWith("'''")) {
        const quote = nextLine.slice(0, 3);
        let j = line + 1;
        while (j < lines.length) {
          const l = lines[j].trim();
          if (j > line + 1 && l.endsWith(quote)) {
            docs.push(l.slice(0, -3).trim());
            break;
          }
          if (j === line + 1) {
            docs.push(l.slice(3).trim());
          } else {
            docs.push(l);
          }
          j++;
        }
      }
    }

    return docs.length > 0 ? docs.join('\n') : undefined;
  }

  private addReference(symbol: IndexSymbol, file: string, line: number, content: string): void {
    const existing = this.symbolTable.get(symbol.name);
    if (existing) {
      for (const sym of existing) {
        sym.references.push({
          file,
          line: content.trim(),
          lineNum: line + 1,
          context: this.scopeStack.join('::'),
        });
      }
    }
  }

  private updateSymbolTable(result: IndexResult): void {
    // Remove old entries for this file
    for (const [name, symbols] of this.symbolTable) {
      const filtered = symbols.filter((s) => s.file !== result.file);
      if (filtered.length > 0) {
        this.symbolTable.set(name, filtered);
      } else {
        this.symbolTable.delete(name);
      }
    }

    // Add new entries
    for (const sym of result.symbols) {
      const existing = this.symbolTable.get(sym.name) || [];
      // Preserve references from other files
      const otherRefs = existing
        .filter((e) => e.file !== result.file)
        .flatMap((e) => e.references);

      sym.references.push(...otherRefs.filter(
        (ref) => !sym.references.some((r) => r.file === ref.file && r.lineNum === ref.lineNum)
      ));

      existing.push(sym);
      this.symbolTable.set(sym.name, existing);
    }

    // Mark exports
    for (const exp of result.exports) {
      const symbols = this.symbolTable.get(exp.name);
      if (symbols) {
        for (const sym of symbols) {
          if (sym.file === result.file) {
            sym.exports = true;
          }
        }
      }
    }
  }

  private async walkDirectory(dir: string): Promise<string[]> {
    const results: string[] = [];
    const supported = new Set(Object.keys(EXT_TO_LANG));

    const walk = async (current: string) => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(current, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);

        if (entry.isDirectory()) {
          // Skip common non-source directories
          if (['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'vendor', 'target'].includes(entry.name)) {
            continue;
          }
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (supported.has(ext)) {
            results.push(fullPath);
          }
        }
      }
    };

    await walk(dir);
    return results;
  }
}

export default TreeSitterIndexer;
