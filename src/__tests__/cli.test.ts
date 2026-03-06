import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runCli', () => {
  let consoleLogs: string[];
  let consoleErrors: string[];
  let processExitCode: number | undefined;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogs = [];
    consoleErrors = [];
    processExitCode = undefined;

    consoleLogSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleLogs.push(args.map(String).join(' '));
    });
    consoleErrorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
    processExitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
      processExitCode = code;
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  // ── default / unknown command ─────────────────────────────────────────────

  describe('unknown command', () => {
    it('prints usage and exits with code 1 for unknown command', async () => {
      const { runCli } = await import('../cli');
      await expect(runCli(['unknown-command'])).rejects.toThrow('process.exit(1)');
      expect(consoleLogs.some((l) => l.includes('Usage: omcustom-team [init|todo]'))).toBe(true);
      expect(processExitCode).toBe(1);
    });

    it('prints usage and exits with code 1 for empty args', async () => {
      const { runCli } = await import('../cli');
      await expect(runCli([])).rejects.toThrow('process.exit(1)');
      expect(consoleLogs.some((l) => l.includes('Usage: omcustom-team [init|todo]'))).toBe(true);
      expect(processExitCode).toBe(1);
    });
  });

  // ── init command ──────────────────────────────────────────────────────────

  describe('init command', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
    });

    afterEach(() => {
      cleanup(tmpDir);
    });

    it('runs initTeam and prints success messages', async () => {
      // Create a minimal project structure for initTeam to scan
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-project' }));

      // Mock initTeam to return a known result
      const initModule = await import('../init');
      const initSpy = spyOn(initModule, 'initTeam').mockResolvedValue({
        scanResult: {
          detectedDomains: ['backend', 'frontend'],
          filePatterns: {},
          dependencies: [],
          suggestedStewards: {},
          analysisSkillAvailable: false,
        },
        teamConfigPath: '/fake/team.yaml',
        stewardsPath: '/fake/STEWARDS.yaml',
        teamDirPath: '/fake/.claude/team',
      });

      const { runCli } = await import('../cli');
      await runCli(['init']);

      expect(consoleLogs.some((l) => l.includes('Team initialized!'))).toBe(true);
      expect(consoleLogs.some((l) => l.includes('backend') && l.includes('frontend'))).toBe(true);
      expect(consoleLogs.some((l) => l.includes('/fake/team.yaml'))).toBe(true);
      expect(consoleLogs.some((l) => l.includes('/fake/STEWARDS.yaml'))).toBe(true);

      initSpy.mockRestore();
    });

    it('prints detected domains in the output', async () => {
      const initModule = await import('../init');
      const initSpy = spyOn(initModule, 'initTeam').mockResolvedValue({
        scanResult: {
          detectedDomains: ['infrastructure'],
          filePatterns: {},
          dependencies: [],
          suggestedStewards: {},
          analysisSkillAvailable: false,
        },
        teamConfigPath: '/p/team.yaml',
        stewardsPath: '/p/STEWARDS.yaml',
        teamDirPath: '/p/.claude/team',
      });

      const { runCli } = await import('../cli');
      await runCli(['init']);

      expect(consoleLogs.some((l) => l.includes('infrastructure'))).toBe(true);

      initSpy.mockRestore();
    });
  });

  // ── todo list command ─────────────────────────────────────────────────────

  describe('todo list command', () => {
    it('prints message when TODO.md does not exist', async () => {
      const teamTodoModule = await import('../team-todo');
      const existsSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'exists').mockReturnValue(false);

      const { runCli } = await import('../cli');
      await expect(runCli(['todo', 'list'])).rejects.toThrow('process.exit(1)');

      expect(consoleLogs.some((l) => l.includes('No TODO.md found'))).toBe(true);
      expect(processExitCode).toBe(1);

      existsSpy.mockRestore();
    });

    it('prints "No TODO items." when list is empty', async () => {
      const teamTodoModule = await import('../team-todo');
      const existsSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'exists').mockReturnValue(true);
      const listSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'list').mockReturnValue([]);

      const { runCli } = await import('../cli');
      await runCli(['todo', 'list']);

      expect(consoleLogs.some((l) => l.includes('No TODO items.'))).toBe(true);

      existsSpy.mockRestore();
      listSpy.mockRestore();
    });

    it('prints items with correct format when items exist', async () => {
      const teamTodoModule = await import('../team-todo');
      const existsSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'exists').mockReturnValue(true);
      const listSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'list').mockReturnValue([
        {
          scope: 'team',
          priority: 'P1',
          description: 'Fix the bug',
          assignee: 'alice',
          domain: 'backend',
          completed: false,
        },
        {
          scope: 'personal',
          priority: 'P2',
          description: 'Write docs',
          assignee: null,
          domain: null,
          completed: true,
        },
      ]);

      const { runCli } = await import('../cli');
      await runCli(['todo', 'list']);

      // First item: not completed, has assignee
      expect(
        consoleLogs.some(
          (l) => l.includes('○') && l.includes('Fix the bug') && l.includes('@alice'),
        ),
      ).toBe(true);
      // Second item: completed, no assignee
      expect(consoleLogs.some((l) => l.includes('✓') && l.includes('Write docs'))).toBe(true);
      // Second item has no @assignee
      const docsLine = consoleLogs.find((l) => l.includes('Write docs'));
      expect(docsLine).not.toContain('@');

      existsSpy.mockRestore();
      listSpy.mockRestore();
    });

    it('formats completed items with ✓', async () => {
      const teamTodoModule = await import('../team-todo');
      spyOn(teamTodoModule.TeamTodo.prototype, 'exists').mockReturnValue(true);
      spyOn(teamTodoModule.TeamTodo.prototype, 'list').mockReturnValue([
        {
          scope: 'team',
          priority: 'P0',
          description: 'Done task',
          assignee: null,
          domain: null,
          completed: true,
        },
      ]);

      const { runCli } = await import('../cli');
      await runCli(['todo', 'list']);

      expect(consoleLogs.some((l) => l.startsWith('✓'))).toBe(true);
    });

    it('formats incomplete items with ○', async () => {
      const teamTodoModule = await import('../team-todo');
      spyOn(teamTodoModule.TeamTodo.prototype, 'exists').mockReturnValue(true);
      spyOn(teamTodoModule.TeamTodo.prototype, 'list').mockReturnValue([
        {
          scope: 'team',
          priority: 'P0',
          description: 'Pending task',
          assignee: null,
          domain: null,
          completed: false,
        },
      ]);

      const { runCli } = await import('../cli');
      await runCli(['todo', 'list']);

      expect(consoleLogs.some((l) => l.startsWith('○'))).toBe(true);
    });
  });

  // ── todo add command ──────────────────────────────────────────────────────

  describe('todo add command', () => {
    it('exits with error when no description is provided', async () => {
      const { runCli } = await import('../cli');
      await expect(runCli(['todo', 'add'])).rejects.toThrow('process.exit(1)');

      expect(consoleErrors.some((l) => l.includes('Usage: omcustom-team todo add'))).toBe(true);
      expect(processExitCode).toBe(1);
    });

    it('creates template and adds item when TODO.md does not exist', async () => {
      const teamTodoModule = await import('../team-todo');
      const existsSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'exists').mockReturnValue(false);
      const createTemplateSpy = spyOn(teamTodoModule.TeamTodo, 'createTemplate').mockImplementation(
        () => {},
      );
      const addSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'add').mockImplementation(() => {});
      const saveSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'save').mockImplementation(() => {});

      const { runCli } = await import('../cli');
      await runCli(['todo', 'add', 'My new task']);

      expect(createTemplateSpy).toHaveBeenCalledWith('.claude/team/TODO.md');
      expect(addSpy).toHaveBeenCalledWith({
        scope: 'team',
        priority: 'P1',
        description: 'My new task',
        assignee: null,
        domain: null,
      });
      expect(saveSpy).toHaveBeenCalled();
      expect(consoleLogs.some((l) => l.includes('Added: My new task'))).toBe(true);

      existsSpy.mockRestore();
      createTemplateSpy.mockRestore();
      addSpy.mockRestore();
      saveSpy.mockRestore();
    });

    it('loads existing TODO.md and adds item when file exists', async () => {
      const teamTodoModule = await import('../team-todo');
      const existsSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'exists').mockReturnValue(true);
      const loadSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'load').mockReturnValue([]);
      const addSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'add').mockImplementation(() => {});
      const saveSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'save').mockImplementation(() => {});

      const { runCli } = await import('../cli');
      await runCli(['todo', 'add', 'Another task']);

      expect(loadSpy).toHaveBeenCalled();
      expect(addSpy).toHaveBeenCalledWith({
        scope: 'team',
        priority: 'P1',
        description: 'Another task',
        assignee: null,
        domain: null,
      });
      expect(saveSpy).toHaveBeenCalled();
      expect(consoleLogs.some((l) => l.includes('Added: Another task'))).toBe(true);

      existsSpy.mockRestore();
      loadSpy.mockRestore();
      addSpy.mockRestore();
      saveSpy.mockRestore();
    });

    it('joins multi-word description correctly', async () => {
      const teamTodoModule = await import('../team-todo');
      spyOn(teamTodoModule.TeamTodo.prototype, 'exists').mockReturnValue(true);
      spyOn(teamTodoModule.TeamTodo.prototype, 'load').mockReturnValue([]);
      const addSpy = spyOn(teamTodoModule.TeamTodo.prototype, 'add').mockImplementation(() => {});
      spyOn(teamTodoModule.TeamTodo.prototype, 'save').mockImplementation(() => {});

      const { runCli } = await import('../cli');
      await runCli(['todo', 'add', 'Fix', 'the', 'CI', 'pipeline']);

      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Fix the CI pipeline' }),
      );
    });
  });

  // ── todo unknown subcommand ───────────────────────────────────────────────

  describe('todo unknown subcommand', () => {
    it('prints usage error and exits with code 1', async () => {
      const { runCli } = await import('../cli');
      await expect(runCli(['todo', 'delete'])).rejects.toThrow('process.exit(1)');

      expect(consoleErrors.some((l) => l.includes('Usage: omcustom-team todo [list|add]'))).toBe(
        true,
      );
      expect(processExitCode).toBe(1);
    });

    it('exits with code 1 for undefined subcommand', async () => {
      const { runCli } = await import('../cli');
      await expect(runCli(['todo'])).rejects.toThrow('process.exit(1)');
      expect(processExitCode).toBe(1);
    });
  });

  // ── module-level import ───────────────────────────────────────────────────

  describe('module import', () => {
    it('exports runCli as a function', async () => {
      const mod = await import('../cli');
      expect(typeof mod.runCli).toBe('function');
    });
  });
});
