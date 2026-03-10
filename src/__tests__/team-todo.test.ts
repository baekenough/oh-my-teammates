import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { TeamTodo } from '../team-todo';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(
    import.meta.dir,
    `__tmp_todo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeTodo(dir: string, content: string): string {
  const path = join(dir, 'TODO.md');
  writeFileSync(path, content, 'utf-8');
  return path;
}

function writeStewards(
  dir: string,
  domains: Record<string, { primary: string; backup: string | null; paths: string[] }>,
): string {
  const path = join(dir, 'STEWARDS.yaml');
  const data = {
    stewards: {
      version: '1.0',
      domains,
    },
  };
  writeFileSync(path, stringify(data), 'utf-8');
  return path;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const MIXED_TODO = `# Team TODO

## team: [P0] Fix Guardian CI false positive — @john-doe (languages)
## team: [P1] Update react-best-practices skill — @jane-doe (frontend)
## personal: [P2] Review session logs — @john-doe
## team: [P1] Audit dependencies
`;

// ── Tests ──────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = makeTmpDir();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// 1. Parse mixed TODO.md
describe('load()', () => {
  it('parses mixed TODO items correctly', () => {
    const path = writeTodo(tmpDir, MIXED_TODO);
    const todo = new TeamTodo(path);
    const items = todo.load();

    expect(items).toHaveLength(4);

    expect(items[0]).toMatchObject({
      scope: 'team',
      priority: 'P0',
      description: 'Fix Guardian CI false positive',
      assignee: 'john-doe',
      domain: 'languages',
      completed: false,
    });

    expect(items[1]).toMatchObject({
      scope: 'team',
      priority: 'P1',
      description: 'Update react-best-practices skill',
      assignee: 'jane-doe',
      domain: 'frontend',
      completed: false,
    });

    expect(items[2]).toMatchObject({
      scope: 'personal',
      priority: 'P2',
      description: 'Review session logs',
      assignee: 'john-doe',
      domain: null,
      completed: false,
    });

    expect(items[3]).toMatchObject({
      scope: 'team',
      priority: 'P1',
      description: 'Audit dependencies',
      assignee: null,
      domain: null,
      completed: false,
    });
  });

  it('returns empty array for file with no TODO items', () => {
    const path = writeTodo(tmpDir, '# Team TODO\n\nSome notes here.\n');
    const todo = new TeamTodo(path);
    expect(todo.load()).toHaveLength(0);
  });

  it('skips malformed lines gracefully', () => {
    const content = `# Team TODO

## not-a-todo-line
## team: Missing priority — @someone
## team: [P0] Valid item
`;
    const path = writeTodo(tmpDir, content);
    const todo = new TeamTodo(path);
    const items = todo.load();
    expect(items).toHaveLength(1);
    expect(items[0]?.description).toBe('Valid item');
  });
});

// 2. Save items back to TODO.md
describe('save()', () => {
  it('round-trips items through load/save', () => {
    const path = writeTodo(tmpDir, MIXED_TODO);
    const todo = new TeamTodo(path);
    todo.load();
    todo.save();

    const todo2 = new TeamTodo(path);
    const items = todo2.load();
    expect(items).toHaveLength(4);
    expect(items[0]?.assignee).toBe('john-doe');
    expect(items[2]?.scope).toBe('personal');
  });

  it('creates parent directories if needed', () => {
    const nestedPath = join(tmpDir, 'deep', 'nested', 'TODO.md');
    const todo = new TeamTodo(nestedPath);
    todo.add({ scope: 'team', priority: 'P1', description: 'Test', assignee: null, domain: null });
    todo.save();
    expect(existsSync(nestedPath)).toBe(true);
  });
});

// 3. Add items
describe('add()', () => {
  it('adds a new item and it appears in list()', () => {
    const path = writeTodo(tmpDir, '# Team TODO\n');
    const todo = new TeamTodo(path);
    todo.load();
    todo.add({
      scope: 'team',
      priority: 'P0',
      description: 'Urgent fix',
      assignee: 'alice',
      domain: 'backend',
    });
    const items = todo.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ description: 'Urgent fix', completed: false });
  });

  it('persists added item after save/reload', () => {
    const path = writeTodo(tmpDir, '# Team TODO\n');
    const todo = new TeamTodo(path);
    todo.load();
    todo.add({
      scope: 'personal',
      priority: 'P2',
      description: 'Read docs',
      assignee: null,
      domain: null,
    });
    todo.save();

    const todo2 = new TeamTodo(path);
    const items = todo2.load();
    expect(items).toHaveLength(1);
    expect(items[0]?.description).toBe('Read docs');
  });
});

// 4. Complete items
describe('complete()', () => {
  it('marks an item as completed', () => {
    const path = writeTodo(tmpDir, MIXED_TODO);
    const todo = new TeamTodo(path);
    todo.load();
    const result = todo.complete(0);
    expect(result).toBe(true);
    expect(todo.list()[0]?.completed).toBe(true);
  });

  it('returns false for out-of-range index', () => {
    const path = writeTodo(tmpDir, MIXED_TODO);
    const todo = new TeamTodo(path);
    todo.load();
    expect(todo.complete(99)).toBe(false);
    expect(todo.complete(-1)).toBe(false);
  });

  it('completed item serializes with ~~ markers', () => {
    const path = writeTodo(tmpDir, MIXED_TODO);
    const todo = new TeamTodo(path);
    todo.load();
    todo.complete(0);
    todo.save();

    const todo2 = new TeamTodo(path);
    const items = todo2.load();
    expect(items[0]?.completed).toBe(true);
  });
});

// 5. Filter by scope/priority/assignee
describe('list() filtering', () => {
  it('filters by scope', () => {
    const path = writeTodo(tmpDir, MIXED_TODO);
    const todo = new TeamTodo(path);
    todo.load();
    const personal = todo.list({ scope: 'personal' });
    expect(personal).toHaveLength(1);
    expect(personal[0]?.scope).toBe('personal');
  });

  it('filters by priority', () => {
    const path = writeTodo(tmpDir, MIXED_TODO);
    const todo = new TeamTodo(path);
    todo.load();
    const p1 = todo.list({ priority: 'P1' });
    expect(p1).toHaveLength(2);
    for (const i of p1) expect(i.priority).toBe('P1');
  });

  it('filters by assignee', () => {
    const path = writeTodo(tmpDir, MIXED_TODO);
    const todo = new TeamTodo(path);
    todo.load();
    const johnItems = todo.list({ assignee: 'john-doe' });
    expect(johnItems).toHaveLength(2);
    for (const i of johnItems) expect(i.assignee).toBe('john-doe');
  });

  it('returns all items when no filter given', () => {
    const path = writeTodo(tmpDir, MIXED_TODO);
    const todo = new TeamTodo(path);
    todo.load();
    expect(todo.list()).toHaveLength(4);
  });
});

// 6. Auto-assign from stewards
describe('autoAssign()', () => {
  it('assigns primary steward to domain items without assignee', () => {
    const path = writeTodo(tmpDir, '# Team TODO\n');
    const stewardsPath = writeStewards(tmpDir, {
      infrastructure: { primary: 'ops-lead', backup: null, paths: ['Dockerfile'] },
      languages: { primary: 'lang-lead', backup: null, paths: ['**/*.ts'] },
    });
    const todo = new TeamTodo(path);
    todo.load();
    // Item with domain but no assignee — should be auto-assigned
    todo.add({
      scope: 'team',
      priority: 'P0',
      description: 'Update infra',
      assignee: null,
      domain: 'infrastructure',
    });
    // Item with domain AND existing assignee — should NOT be changed
    todo.add({
      scope: 'team',
      priority: 'P1',
      description: 'Review code',
      assignee: 'existing',
      domain: 'languages',
    });
    const count = todo.autoAssign(stewardsPath);
    expect(count).toBe(1);
    const items = todo.list();
    const infraItem = items.find((i) => i.domain === 'infrastructure');
    expect(infraItem?.assignee).toBe('ops-lead');
    // Already-assigned item should remain unchanged
    const existingItem = items.find((i) => i.domain === 'languages');
    expect(existingItem?.assignee).toBe('existing');
  });

  it('returns 0 when STEWARDS.yaml does not exist', () => {
    const path = writeTodo(tmpDir, MIXED_TODO);
    const todo = new TeamTodo(path);
    todo.load();
    const count = todo.autoAssign(join(tmpDir, 'nonexistent.yaml'));
    expect(count).toBe(0);
  });

  it('returns 0 when no items need assignment', () => {
    const todoContent = `# Team TODO

## team: [P0] All assigned — @alice (frontend)
`;
    const path = writeTodo(tmpDir, todoContent);
    const stewardsPath = writeStewards(tmpDir, {
      frontend: { primary: 'bob', backup: null, paths: ['src/**'] },
    });
    const todo = new TeamTodo(path);
    todo.load();
    const count = todo.autoAssign(stewardsPath);
    expect(count).toBe(0);
  });
});

// 7. exists()
describe('exists()', () => {
  it('returns true when file exists', () => {
    const path = writeTodo(tmpDir, '# Team TODO\n');
    const todo = new TeamTodo(path);
    expect(todo.exists()).toBe(true);
  });

  it('returns false when file does not exist', () => {
    const todo = new TeamTodo(join(tmpDir, 'nonexistent.md'));
    expect(todo.exists()).toBe(false);
  });
});

// 8. labels support
describe('labels support', () => {
  it('should parse labels from TODO line', () => {
    const content = `# Team TODO\n\n## team: [P1] Fix login bug [bug, urgent]\n`;
    const path = writeTodo(tmpDir, content);
    const todo = new TeamTodo(path);

    const items = todo.load();
    expect(items.length).toBe(1);
    expect(items[0]?.labels).toEqual(['bug', 'urgent']);
  });

  it('should handle items without labels', () => {
    const content = `# Team TODO\n\n## team: [P1] Fix login bug\n`;
    const path = writeTodo(tmpDir, content);
    const todo = new TeamTodo(path);

    const items = todo.load();
    expect(items.length).toBe(1);
    expect(items[0]?.labels).toBeUndefined();
  });

  it('should serialize labels correctly', () => {
    const content = `# Team TODO\n\n## team: [P1] Fix login bug [bug, urgent]\n`;
    const path = writeTodo(tmpDir, content);
    const todo = new TeamTodo(path);

    todo.load();
    todo.save();

    const saved = readFileSync(path, 'utf-8');
    expect(saved).toContain('[bug, urgent]');
  });

  it('should roundtrip labels through parse/serialize', () => {
    const content = `# Team TODO\n\n## team: [P1] Fix login bug [bug, urgent]\n`;
    const path = writeTodo(tmpDir, content);
    const todo = new TeamTodo(path);

    const items1 = todo.load();
    todo.save();

    const todo2 = new TeamTodo(path);
    const items2 = todo2.load();

    expect(items2[0]?.labels).toEqual(items1[0]?.labels);
    expect(items2[0]?.description).toEqual(items1[0]?.description);
  });

  it('should filter by label', () => {
    const content = [
      '# Team TODO',
      '',
      '## team: [P1] Fix login bug [bug, urgent]',
      '## team: [P1] Add feature [feature]',
      '## team: [P2] Update docs',
      '',
    ].join('\n');
    const path = writeTodo(tmpDir, content);
    const todo = new TeamTodo(path);
    todo.load();

    const bugItems = todo.list({ label: 'bug' });
    expect(bugItems.length).toBe(1);
    expect(bugItems[0]?.description).toBe('Fix login bug');

    const featureItems = todo.list({ label: 'feature' });
    expect(featureItems.length).toBe(1);

    const noLabelItems = todo.list({ label: 'nonexistent' });
    expect(noLabelItems.length).toBe(0);
  });

  it('should handle empty labels brackets', () => {
    const content = `# Team TODO\n\n## team: [P1] Fix login bug []\n`;
    const path = writeTodo(tmpDir, content);
    const todo = new TeamTodo(path);

    const items = todo.load();
    expect(items.length).toBe(1);
    expect(items[0]?.labels).toBeUndefined();
  });

  it('should parse labels with assignee and domain', () => {
    const content = `# Team TODO\n\n## team: [P1] Fix login bug — @alice (backend) [bug, urgent]\n`;
    const path = writeTodo(tmpDir, content);
    const todo = new TeamTodo(path);

    const items = todo.load();
    expect(items.length).toBe(1);
    expect(items[0]?.assignee).toBe('alice');
    expect(items[0]?.domain).toBe('backend');
    expect(items[0]?.labels).toEqual(['bug', 'urgent']);
  });
});

// 9. createTemplate()
describe('TeamTodo.createTemplate()', () => {
  it('creates a file with template content', () => {
    const path = join(tmpDir, 'TODO.md');
    TeamTodo.createTemplate(path);
    expect(existsSync(path)).toBe(true);

    const todo = new TeamTodo(path);
    const items = todo.load();
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.scope === 'team')).toBe(true);
    expect(items.some((i) => i.scope === 'personal')).toBe(true);
  });

  it('creates parent directories if needed', () => {
    const path = join(tmpDir, 'nested', 'dir', 'TODO.md');
    TeamTodo.createTemplate(path);
    expect(existsSync(path)).toBe(true);
  });
});
