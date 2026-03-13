import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { TEAM_PATHS } from './paths';
import { Stewards } from './stewards';

export interface TodoItem {
  scope: 'team' | 'personal';
  priority: 'P0' | 'P1' | 'P2';
  description: string;
  assignee: string | null;
  domain: string | null;
  completed: boolean;
  labels?: string[];
}

/**
 * Each TODO line format:
 *   ## {scope}: [{priority}] {description} — @{assignee} ({domain}) [label1, label2]
 * Completed items are prefixed with "~~" and suffixed with "~~":
 *   ## ~~{scope}: [{priority}] {description} — @{assignee} ({domain}) [label1, label2]~~
 *
 * Labels are an optional trailing bracket group after the assignee/domain section.
 */
const TODO_LINE_RE =
  /^##\s+(?:~~)?(\w+):\s+\[(P[012])\]\s+(.+?)(?:\s+—\s+@([\w-]+)(?:\s+\(([^)]+)\))?)?(?:\s+\[([^\]]*)\])?(?:~~)?$/;

function parseLine(line: string): TodoItem | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('##')) {
    return null;
  }

  const completed = trimmed.includes('~~');
  const match = TODO_LINE_RE.exec(trimmed);
  if (!match) {
    return null;
  }

  const scope = match[1];
  if (scope !== 'team' && scope !== 'personal') {
    return null;
  }

  const priority = match[2];
  if (priority !== 'P0' && priority !== 'P1' && priority !== 'P2') {
    return null;
  }

  const description = (match[3] ?? '').trim();
  const assignee = match[4] ?? null;
  const domain = match[5] ?? null;

  let labels: string[] | undefined;
  const labelsStr = match[6];
  if (labelsStr !== undefined) {
    const parsed = labelsStr
      .split(',')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (parsed.length > 0) {
      labels = parsed;
    }
  }

  return {
    scope,
    priority,
    description,
    assignee,
    domain,
    completed,
    ...(labels !== undefined ? { labels } : {}),
  };
}

function serializeItem(item: TodoItem): string {
  let line = `## ${item.scope}: [${item.priority}] ${item.description}`;
  if (item.assignee !== null) {
    line += ` — @${item.assignee}`;
    if (item.domain !== null) {
      line += ` (${item.domain})`;
    }
  }
  if (item.labels !== undefined && item.labels.length > 0) {
    line += ` [${item.labels.join(', ')}]`;
  }
  if (item.completed) {
    line = `## ~~${line.slice(3)}~~`;
  }
  return line;
}

export class TeamTodo {
  private todoPath: string;
  private items: TodoItem[] = [];
  private header: string[] = [];

  constructor(todoPath: string = TEAM_PATHS.TODO_MD) {
    this.todoPath = todoPath;
  }

  /** Parse TODO.md and return the items. */
  load(): TodoItem[] {
    const raw = readFileSync(this.todoPath, 'utf-8');
    const lines = raw.split('\n');
    this.items = [];
    this.header = [];

    let headerDone = false;
    for (const line of lines) {
      const item = parseLine(line);
      if (item !== null) {
        headerDone = true;
        this.items.push(item);
      } else if (!headerDone) {
        this.header.push(line);
      }
    }

    return [...this.items];
  }

  /** Save current items back to TODO.md. */
  save(): void {
    const dir = dirname(this.todoPath);
    if (dir && dir !== '.') {
      mkdirSync(dir, { recursive: true });
    }

    const headerLines = this.header.length > 0 ? this.header : ['# Team TODO', ''];

    const itemLines = this.items.map(serializeItem);
    const content = [...headerLines, ...itemLines, ''].join('\n');
    writeFileSync(this.todoPath, content, 'utf-8');
  }

  /** Add a new TODO item (not yet completed). */
  add(item: Omit<TodoItem, 'completed'>): void {
    this.items.push({ ...item, completed: false });
  }

  /** Mark item at the given 0-based index as completed. Returns false if out of range. */
  complete(index: number): boolean {
    if (index < 0 || index >= this.items.length) {
      return false;
    }
    const existing = this.items[index];
    if (existing === undefined) {
      return false;
    }
    this.items[index] = { ...existing, completed: true };
    return true;
  }

  /** Return items, optionally filtered by scope, priority, assignee, or label. */
  list(filter?: {
    scope?: 'team' | 'personal';
    priority?: string;
    assignee?: string;
    label?: string;
  }): TodoItem[] {
    if (!filter) {
      return [...this.items];
    }

    return this.items.filter((item) => {
      if (filter.scope !== undefined && item.scope !== filter.scope) {
        return false;
      }
      if (filter.priority !== undefined && item.priority !== filter.priority) {
        return false;
      }
      if (filter.assignee !== undefined && item.assignee !== filter.assignee) {
        return false;
      }
      if (filter.label !== undefined && !(item.labels?.includes(filter.label) ?? false)) {
        return false;
      }
      return true;
    });
  }

  /**
   * For items that have a domain but no assignee, look up the primary steward
   * from STEWARDS.yaml and set it as the assignee.
   * Returns the number of items updated.
   */
  autoAssign(stewardsPath: string = TEAM_PATHS.STEWARDS_YAML): number {
    const stewards = new Stewards(stewardsPath);
    if (!stewards.exists()) {
      return 0;
    }
    stewards.load();

    let count = 0;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (item === undefined) {
        continue;
      }
      if (item.domain !== null && item.assignee === null) {
        const domainData = stewards.getDomain(item.domain);
        if (domainData !== undefined) {
          this.items[i] = { ...item, assignee: domainData.primary };
          count++;
        }
      }
    }
    return count;
  }

  /** Check whether the TODO file exists on disk. */
  exists(): boolean {
    return existsSync(this.todoPath);
  }

  /** Create a minimal TODO.md template at the given path. */
  static createTemplate(path: string): void {
    const dir = dirname(path);
    if (dir && dir !== '.') {
      mkdirSync(dir, { recursive: true });
    }

    const template = [
      '# Team TODO',
      '',
      '## team: [P0] Fix Guardian CI false positive — @john-doe (languages)',
      '## team: [P1] Update react-best-practices skill — @jane-doe (frontend)',
      '## personal: [P2] Review session logs — @john-doe',
      '',
    ].join('\n');

    writeFileSync(path, template, 'utf-8');
  }
}
