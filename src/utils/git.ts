import { execCommand } from './process.js';
import { GitStatus, GitDiff, GitDiff as GitDiffType, DiffHunk, DiffLine, PRConfig, WorktreeInfo } from '../protocol/types.js';
import { Logger } from './logger.js';

const logger = new Logger({ scope: 'git' });

export class GitHelper {
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  private async run(args: string[], stdin?: string): Promise<string> {
    const result = await execCommand({
      command: 'git',
      args,
      cwd: this.cwd,
      timeout: 30000,
      stdin,
    });
    if (result.exitCode !== 0) {
      throw new Error(`git ${args[0]} failed: ${result.stderr}`);
    }
    return result.stdout;
  }

  async status(): Promise<GitStatus> {
    const porcelain = await this.run(['status', '--porcelain=v2', '--branch']);
    const lines = porcelain.split('\n').filter(Boolean);

    const status: GitStatus = {
      branch: '',
      ahead: 0,
      behind: 0,
      staged: [],
      modified: [],
      untracked: [],
      deleted: [],
      renamed: [],
      conflicted: [],
    };

    for (const line of lines) {
      if (line.startsWith('# branch.head')) {
        status.branch = line.split(' ').pop()!;
      } else if (line.startsWith('# branch.ab')) {
        const parts = line.split(' ');
        status.ahead = parseInt(parts[2], 10) || 0;
        status.behind = Math.abs(parseInt(parts[3], 10)) || 0;
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        const parts = line.split(' ');
        const xy = parts[1];
        const file = parts.slice(8).join(' ');
        const x = xy[0];
        const y = xy[1];

        if (x !== '.' && x !== '?' && y === 'M') status.staged.push(file);
        else if (y === 'M' || y === 'D') status.modified.push(file);
        else if (x === 'A') status.staged.push(file);
        else if (x === 'D') status.deleted.push(file);
        else if (x === 'R') {
          const arrowIdx = file.indexOf(' -> ');
          if (arrowIdx >= 0) {
            status.renamed.push({
              from: file.slice(0, arrowIdx),
              to: file.slice(arrowIdx + 4),
            });
          }
        }
      } else if (line.startsWith('? ')) {
        status.untracked.push(line.slice(2));
      } else if (line.startsWith('u ')) {
        const parts = line.split(' ');
        status.conflicted.push(parts.slice(8).join(' '));
      }
    }

    return status;
  }

  async diff(ref?: string, files?: string[]): Promise<GitDiff[]> {
    const args = ['diff', '--no-color', '-U3'];
    if (ref) args.push(ref);
    if (files?.length) args.push('--', ...files);

    const output = await this.run(args);
    return this.parseDiff(output);
  }

  async diffStaged(files?: string[]): Promise<GitDiff[]> {
    const args = ['diff', '--cached', '--no-color', '-U3'];
    if (files?.length) args.push('--', ...files);
    const output = await this.run(args);
    return this.parseDiff(output);
  }

  async stage(files: string[]): Promise<void> {
    await this.run(['add', ...files]);
  }

  async stageAll(): Promise<void> {
    await this.run(['add', '-A']);
  }

  async commit(message: string, allowEmpty = false): Promise<string> {
    const args = ['commit', '-m', message];
    if (allowEmpty) args.push('--allow-empty');
    const output = await this.run(args);
    const match = output.match(/\[[\w\s]+ ([\w]+)\]/);
    return match ? match[1] : output;
  }

  async createBranch(name: string, startPoint?: string): Promise<void> {
    const args = ['checkout', '-b', name];
    if (startPoint) args.push(startPoint);
    await this.run(args);
  }

  async switchBranch(name: string): Promise<void> {
    await this.run(['checkout', name]);
  }

  async deleteBranch(name: string, force = false): Promise<void> {
    await this.run(['branch', force ? '-D' : '-d', name]);
  }

  async listBranches(pattern?: string): Promise<string[]> {
    const args = ['branch', '--format=%(refname:short)'];
    if (pattern) args.push(`--list`, pattern);
    const output = await this.run(args);
    return output.split('\n').filter(Boolean);
  }

  async currentBranch(): Promise<string> {
    return (await this.run(['branch', '--show-current'])).trim();
  }

  async merge(branch: string, message?: string): Promise<{ success: boolean; conflicts: string[] }> {
    const args = ['merge', '--no-ff'];
    if (message) args.push('-m', message);
    args.push(branch);

    try {
      await this.run(args);
      return { success: true, conflicts: [] };
    } catch {
      const status = await this.status();
      await this.run(['merge', '--abort']);
      return { success: false, conflicts: status.conflicted };
    }
  }

  async rebase(branch: string): Promise<{ success: boolean; conflicts: string[] }> {
    try {
      await this.run(['rebase', branch]);
      return { success: true, conflicts: [] };
    } catch {
      const status = await this.status();
      await this.run(['rebase', '--abort']);
      return { success: false, conflicts: status.conflicted };
    }
  }

  async pull(remote = 'origin', branch?: string): Promise<void> {
    const args = ['pull', remote];
    if (branch) args.push(branch);
    await this.run(args);
  }

  async push(remote = 'origin', branch?: string, setUpstream = false): Promise<void> {
    const args = ['push'];
    if (setUpstream) args.push('-u');
    args.push(remote);
    if (branch) args.push(branch);
    await this.run(args);
  }

  async stash(message?: string): Promise<void> {
    const args = ['stash'];
    if (message) args.push('-m', message);
    await this.run(args);
  }

  async stashPop(): Promise<void> {
    await this.run(['stash', 'pop']);
  }

  // Worktree management
  async addWorktree(path: string, branch: string, newBranch = false): Promise<void> {
    const args = ['worktree', 'add'];
    if (newBranch) args.push('-b');
    args.push(path, branch);
    await this.run(args);
  }

  async removeWorktree(path: string): Promise<void> {
    await this.run(['worktree', 'remove', '--force', path]);
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    const output = await this.run(['worktree', 'list', '--porcelain']);
    const worktrees: WorktreeInfo[] = [];
    const blocks = output.split('\n\n').filter(Boolean);

    for (const block of blocks) {
      const lines = block.split('\n');
      const info: WorktreeInfo = { path: '', branch: '', head: '', locked: false };
      for (const line of lines) {
        const [key, ...rest] = line.split(' ');
        const value = rest.join(' ');
        if (key === 'worktree') info.path = value;
        else if (key === 'branch') info.branch = value.replace('refs/heads/', '');
        else if (key === 'HEAD') info.head = value;
        else if (key === 'locked') info.locked = true;
      }
      if (info.path) worktrees.push(info);
    }

    return worktrees;
  }

  // Conflict detection
  async hasConflicts(): Promise<boolean> {
    const status = await this.status();
    return status.conflicted.length > 0;
  }

  async getConflictedFiles(): Promise<string[]> {
    const status = await this.status();
    return status.conflicted;
  }

  async getConflictMarkers(file: string): Promise<{ ours: string[]; theirs: string[] }> {
    const output = await this.run(['show', `:${file}`]);
    const lines = output.split('\n');
    const ours: string[] = [];
    const theirs: string[] = [];
    let section: 'none' | 'ours' | 'theirs' = 'none';

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) { section = 'ours'; continue; }
      if (line.startsWith('=======')) { section = 'theirs'; continue; }
      if (line.startsWith('>>>>>>>')) { section = 'none'; continue; }
      if (section === 'ours') ours.push(line);
      if (section === 'theirs') theirs.push(line);
    }

    return { ours, theirs };
  }

  // Log helpers
  async log(limit = 50, file?: string): Promise<Array<{ hash: string; author: string; date: string; message: string }>> {
    const args = ['log', `--max-count=${limit}`, '--format=%H%n%an%n%ai%n%s%n---'];
    if (file) args.push('--', file);
    const output = await this.run(args);
    const entries = output.split('\n---\n').filter(Boolean);

    return entries.map((entry) => {
      const [hash, author, date, message] = entry.split('\n');
      return { hash, author, date, message };
    });
  }

  async blame(file: string, line?: number): Promise<Array<{ hash: string; author: string; line: number; content: string }>> {
    const args = ['blame', '--porcelain'];
    if (line) args.push(`-L${line},${line}`);
    args.push(file);

    const output = await this.run(args);
    const result: Array<{ hash: string; author: string; line: number; content: string }> = [];
    const lines = output.split('\n');
    let current: { hash: string; author: string; line: number; content: string } | null = null;

    for (const l of lines) {
      if (/^[0-9a-f]{40} \d+ \d+/.test(l)) {
        const parts = l.split(' ');
        if (current) result.push(current);
        current = { hash: parts[0].slice(0, 8), author: '', line: parseInt(parts[2], 10), content: '' };
      } else if (l.startsWith('author ') && current) {
        current.author = l.slice(7);
      } else if (l.startsWith('\t') && current) {
        current.content = l.slice(1);
      }
    }
    if (current) result.push(current);

    return result;
  }

  async revParse(ref: string): Promise<string> {
    return (await this.run(['rev-parse', ref])).trim();
  }

  async remoteUrl(name = 'origin'): Promise<string> {
    return (await this.run(['remote', 'get-url', name])).trim();
  }

  // Diff parsing
  private parseDiff(output: string): GitDiff[] {
    if (!output.trim()) return [];

    const diffs: GitDiff[] = [];
    const fileDiffs = output.split(/^diff --git /m).filter(Boolean);

    for (const fileDiff of fileDiffs) {
      const lines = fileDiff.split('\n');
      const headerLine = lines[0];
      const fileMatch = headerLine.match(/b\/(.+)$/);
      if (!fileMatch) continue;

      const file = fileMatch[1];
      let additions = 0;
      let deletions = 0;
      let binary = false;
      const hunks: DiffHunk[] = [];
      let currentHunk: DiffHunk | null = null;

      for (const line of lines) {
        if (line.startsWith('Binary files')) {
          binary = true;
          break;
        }

        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
        if (hunkMatch) {
          currentHunk = {
            header: hunkMatch[5].trim(),
            oldStart: parseInt(hunkMatch[1], 10),
            oldLines: parseInt(hunkMatch[2] || '1', 10),
            newStart: parseInt(hunkMatch[3], 10),
            newLines: parseInt(hunkMatch[4] || '1', 10),
            lines: [],
          };
          hunks.push(currentHunk);
          continue;
        }

        if (currentHunk) {
          if (line.startsWith('+')) {
            additions++;
            currentHunk.lines.push({
              type: 'add',
              content: line.slice(1),
              newLineNum: currentHunk.newStart + currentHunk.lines.filter((l) => l.type !== 'remove').length,
            });
          } else if (line.startsWith('-')) {
            deletions++;
            currentHunk.lines.push({
              type: 'remove',
              content: line.slice(1),
              oldLineNum: currentHunk.oldStart + currentHunk.lines.filter((l) => l.type !== 'add').length,
            });
          } else if (line.startsWith(' ')) {
            currentHunk.lines.push({
              type: 'context',
              content: line.slice(1),
            });
          }
        }
      }

      diffs.push({ file, additions, deletions, hunks, binary });
    }

    return diffs;
  }
}

export async function createPR(config: PRConfig): Promise<string> {
  const args = [
    'pr', 'create',
    '--title', config.title,
    '--body', config.body,
    '--head', config.head,
    '--base', config.base,
  ];
  if (config.draft) args.push('--draft');
  if (config.reviewers) {
    for (const r of config.reviewers) args.push('--reviewer', r);
  }
  if (config.labels) {
    for (const l of config.labels) args.push('--label', l);
  }

  const result = await execCommand({
    command: 'gh',
    args,
    cwd: process.cwd(),
    timeout: 30000,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create PR: ${result.stderr}`);
  }

  return result.stdout.trim();
}
