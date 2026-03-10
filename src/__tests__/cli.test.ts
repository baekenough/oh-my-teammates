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
      expect(
        consoleLogs.some((l) =>
          l.includes('Usage: omcustom-team [init|todo|report|recommend|sessions]'),
        ),
      ).toBe(true);
      expect(processExitCode).toBe(1);
    });

    it('prints usage and exits with code 1 for empty args', async () => {
      const { runCli } = await import('../cli');
      await expect(runCli([])).rejects.toThrow('process.exit(1)');
      expect(
        consoleLogs.some((l) =>
          l.includes('Usage: omcustom-team [init|todo|report|recommend|sessions]'),
        ),
      ).toBe(true);
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
        claudeMdPath: '/fake/CLAUDE.md',
        claudeMdResult: { created: true, appended: false },
      });

      // Mock promptInit to avoid blocking on stdin
      const promptsModule = await import('../prompts');
      const _promptSpy = spyOn(promptsModule, 'promptInit').mockResolvedValue({
        projectName: 'test-project',
        adminUsername: '',
      });

      const { runCli } = await import('../cli');
      await runCli(['init']);

      expect(consoleLogs.some((l) => l.includes('Team initialized!'))).toBe(true);
      expect(consoleLogs.some((l) => l.includes('backend') && l.includes('frontend'))).toBe(true);
      expect(consoleLogs.some((l) => l.includes('/fake/team.yaml'))).toBe(true);
      expect(consoleLogs.some((l) => l.includes('/fake/STEWARDS.yaml'))).toBe(true);

      expect(consoleLogs.some((l) => l.includes('/fake/CLAUDE.md') && l.includes('created'))).toBe(
        true,
      );

      initSpy.mockRestore();
    });

    it('prints CLAUDE.md appended message when team section was appended', async () => {
      const initModule = await import('../init');
      const initSpy = spyOn(initModule, 'initTeam').mockResolvedValue({
        scanResult: {
          detectedDomains: [],
          filePatterns: {},
          dependencies: [],
          suggestedStewards: {},
          analysisSkillAvailable: false,
        },
        teamConfigPath: '/p/team.yaml',
        stewardsPath: '/p/STEWARDS.yaml',
        teamDirPath: '/p/.claude/team',
        claudeMdPath: '/p/CLAUDE.md',
        claudeMdResult: { created: false, appended: true },
      });

      const { runCli } = await import('../cli');
      await runCli(['init']);

      expect(
        consoleLogs.some((l) => l.includes('/p/CLAUDE.md') && l.includes('team section appended')),
      ).toBe(true);

      initSpy.mockRestore();
    });

    it('does not print CLAUDE.md message when file already had team section', async () => {
      const initModule = await import('../init');
      const initSpy = spyOn(initModule, 'initTeam').mockResolvedValue({
        scanResult: {
          detectedDomains: [],
          filePatterns: {},
          dependencies: [],
          suggestedStewards: {},
          analysisSkillAvailable: false,
        },
        teamConfigPath: '/p/team.yaml',
        stewardsPath: '/p/STEWARDS.yaml',
        teamDirPath: '/p/.claude/team',
        claudeMdPath: '/p/CLAUDE.md',
        claudeMdResult: { created: false, appended: false },
      });

      const { runCli } = await import('../cli');
      await runCli(['init']);

      expect(consoleLogs.some((l) => l.includes('CLAUDE.md:'))).toBe(false);

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
        claudeMdPath: '/p/CLAUDE.md',
        claudeMdResult: { created: false, appended: false },
      });

      // Mock promptInit to avoid blocking on stdin
      const promptsModule = await import('../prompts');
      const promptSpy = spyOn(promptsModule, 'promptInit').mockResolvedValue({
        projectName: 'my-project',
        adminUsername: '',
      });

      const { runCli } = await import('../cli');
      await runCli(['init']);

      expect(consoleLogs.some((l) => l.includes('infrastructure'))).toBe(true);

      initSpy.mockRestore();
      promptSpy.mockRestore();
    });

    it('skips prompts when --yes flag is provided', async () => {
      const initModule = await import('../init');
      const initSpy = spyOn(initModule, 'initTeam').mockResolvedValue({
        scanResult: {
          detectedDomains: [],
          filePatterns: {},
          dependencies: [],
          suggestedStewards: {},
          analysisSkillAvailable: false,
        },
        teamConfigPath: '/p/team.yaml',
        stewardsPath: '/p/STEWARDS.yaml',
        teamDirPath: '/p/.claire/team',
        claudeMdPath: '/p/CLAUDE.md',
        claudeMdResult: { created: false, appended: false },
      });

      const { runCli } = await import('../cli');
      await runCli(['init', '--yes']);

      expect(consoleLogs.some((l) => l.includes('Team initialized!'))).toBe(true);

      initSpy.mockRestore();
    });

    it('skips prompts when -y flag is provided', async () => {
      const initModule = await import('../init');
      const initSpy = spyOn(initModule, 'initTeam').mockResolvedValue({
        scanResult: {
          detectedDomains: [],
          filePatterns: {},
          dependencies: [],
          suggestedStewards: {},
          analysisSkillAvailable: false,
        },
        teamConfigPath: '/p/team.yaml',
        stewardsPath: '/p/STEWARDS.yaml',
        teamDirPath: '/p/.claude/team',
        claudeMdPath: '/p/CLAUDE.md',
        claudeMdResult: { created: false, appended: false },
      });

      const { runCli } = await import('../cli');
      await runCli(['init', '-y']);

      expect(consoleLogs.some((l) => l.includes('Team initialized!'))).toBe(true);

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

  // ── report command ────────────────────────────────────────────────────────

  describe('report command', () => {
    it('generates report and prints output path', async () => {
      const reportModule = await import('../report');
      const reportSpy = spyOn(reportModule.ReportGenerator.prototype, 'generate').mockResolvedValue(
        '/fake/report.html',
      );

      const { runCli } = await import('../cli');
      await runCli(['report']);

      expect(consoleLogs.some((l) => l.includes('/fake/report.html'))).toBe(true);
      expect(reportSpy).toHaveBeenCalledWith({ output: undefined, days: undefined, open: false });

      reportSpy.mockRestore();
    });

    it('passes --output flag to generator', async () => {
      const reportModule = await import('../report');
      const reportSpy = spyOn(reportModule.ReportGenerator.prototype, 'generate').mockResolvedValue(
        '/custom/out.html',
      );

      const { runCli } = await import('../cli');
      await runCli(['report', '--output', 'custom/out.html']);

      expect(reportSpy).toHaveBeenCalledWith(
        expect.objectContaining({ output: 'custom/out.html' }),
      );

      reportSpy.mockRestore();
    });

    it('passes -o short flag to generator', async () => {
      const reportModule = await import('../report');
      const reportSpy = spyOn(reportModule.ReportGenerator.prototype, 'generate').mockResolvedValue(
        '/short/out.html',
      );

      const { runCli } = await import('../cli');
      await runCli(['report', '-o', 'short/out.html']);

      expect(reportSpy).toHaveBeenCalledWith(expect.objectContaining({ output: 'short/out.html' }));

      reportSpy.mockRestore();
    });

    it('passes --days flag to generator', async () => {
      const reportModule = await import('../report');
      const reportSpy = spyOn(reportModule.ReportGenerator.prototype, 'generate').mockResolvedValue(
        '/fake/report.html',
      );

      const { runCli } = await import('../cli');
      await runCli(['report', '--days', '7']);

      expect(reportSpy).toHaveBeenCalledWith(expect.objectContaining({ days: 7 }));

      reportSpy.mockRestore();
    });

    it('passes --open flag to generator', async () => {
      const reportModule = await import('../report');
      const reportSpy = spyOn(reportModule.ReportGenerator.prototype, 'generate').mockResolvedValue(
        '/fake/report.html',
      );

      const { runCli } = await import('../cli');
      await runCli(['report', '--open']);

      expect(reportSpy).toHaveBeenCalledWith(expect.objectContaining({ open: true }));

      reportSpy.mockRestore();
    });
  });

  // ── recommend command ─────────────────────────────────────────────────────

  describe('recommend command', () => {
    it('prints text output with recommendations when found', async () => {
      const recommenderModule = await import('../recommender');
      const recommendSpy = spyOn(
        recommenderModule.Recommender.prototype,
        'recommend',
      ).mockReturnValue([
        {
          agent: 'lang-typescript-expert',
          category: 'language',
          description: 'TypeScript development',
          confidence: 0.9,
          reasons: ['tsconfig.json found'],
        },
        {
          agent: 'infra-docker-expert',
          category: 'infrastructure',
          description: 'Docker containerization',
          confidence: 0.5,
          reasons: ['Dockerfile found'],
        },
      ]);

      const { runCli } = await import('../cli');
      await runCli(['recommend']);

      expect(consoleLogs.some((l) => l.includes('Project Tech Stack Analysis'))).toBe(true);
      // High confidence (>=70%) uses *
      expect(consoleLogs.some((l) => l.includes('*') && l.includes('lang-typescript-expert'))).toBe(
        true,
      );
      // Medium confidence (30-69%) uses .
      expect(consoleLogs.some((l) => l.includes('.') && l.includes('infra-docker-expert'))).toBe(
        true,
      );
      expect(consoleLogs.some((l) => l.includes('* High confidence'))).toBe(true);

      recommendSpy.mockRestore();
    });

    it('prints "No agent recommendations found." when list is empty', async () => {
      const recommenderModule = await import('../recommender');
      const recommendSpy = spyOn(
        recommenderModule.Recommender.prototype,
        'recommend',
      ).mockReturnValue([]);

      const { runCli } = await import('../cli');
      await runCli(['recommend']);

      expect(consoleLogs.some((l) => l.includes('No agent recommendations found.'))).toBe(true);

      recommendSpy.mockRestore();
    });

    it('outputs JSON when --json flag is provided', async () => {
      const recommenderModule = await import('../recommender');
      const mockRecs = [
        {
          agent: 'lang-typescript-expert',
          category: 'language' as const,
          description: 'TypeScript development',
          confidence: 0.9,
          reasons: ['tsconfig.json found'],
        },
      ];
      const recommendSpy = spyOn(
        recommenderModule.Recommender.prototype,
        'recommend',
      ).mockReturnValue(mockRecs);

      const { runCli } = await import('../cli');
      await runCli(['recommend', '--json']);

      const jsonLine = consoleLogs.find((l) => {
        try {
          JSON.parse(l);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonLine).toBeDefined();
      const parsed = JSON.parse(jsonLine ?? '[]');
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].agent).toBe('lang-typescript-expert');

      recommendSpy.mockRestore();
    });

    it('shows reasons when --verbose flag is provided', async () => {
      const recommenderModule = await import('../recommender');
      const recommendSpy = spyOn(
        recommenderModule.Recommender.prototype,
        'recommend',
      ).mockReturnValue([
        {
          agent: 'lang-typescript-expert',
          category: 'language',
          description: 'TypeScript development',
          confidence: 0.9,
          reasons: ['tsconfig.json found', '5 .ts files found'],
        },
      ]);

      const { runCli } = await import('../cli');
      await runCli(['recommend', '--verbose']);

      expect(consoleLogs.some((l) => l.includes('tsconfig.json found'))).toBe(true);
      expect(consoleLogs.some((l) => l.includes('.ts files found'))).toBe(true);

      recommendSpy.mockRestore();
    });

    it('passes minConfidence option when --min-confidence flag is provided', async () => {
      const recommenderModule = await import('../recommender');
      const recommendSpy = spyOn(
        recommenderModule.Recommender.prototype,
        'recommend',
      ).mockReturnValue([]);

      const { runCli } = await import('../cli');
      await runCli(['recommend', '--min-confidence', '0.7']);

      expect(recommendSpy).toHaveBeenCalledWith(expect.objectContaining({ minConfidence: 0.7 }));

      recommendSpy.mockRestore();
    });

    it('passes category option when --category flag is provided', async () => {
      const recommenderModule = await import('../recommender');
      const recommendSpy = spyOn(
        recommenderModule.Recommender.prototype,
        'recommend',
      ).mockReturnValue([]);

      const { runCli } = await import('../cli');
      await runCli(['recommend', '--category', 'infrastructure']);

      expect(recommendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'infrastructure' }),
      );

      recommendSpy.mockRestore();
    });
  });

  // ── sessions command ──────────────────────────────────────────────────────

  describe('sessions command', () => {
    let originalCwd: string;

    beforeEach(() => {
      originalCwd = process.cwd();
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('prints message and exits when no sessions database exists', async () => {
      // Change to a temp dir that has no sessions.db
      const emptyDir = makeTempDir();
      process.chdir(emptyDir);

      const { runCli } = await import('../cli');
      await expect(runCli(['sessions'])).rejects.toThrow('process.exit(1)');

      expect(consoleLogs.some((l) => l.includes('No sessions database found'))).toBe(true);
      expect(processExitCode).toBe(1);

      cleanup(emptyDir);
    });

    it('prints "No sessions found." when database exists but is empty', async () => {
      const tmpDir = makeTempDir();
      const teamDir = join(tmpDir, '.claude', 'team');
      mkdirSync(teamDir, { recursive: true });
      process.chdir(tmpDir);

      const sessionLoggerModule = await import('../session-logger');
      const listSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'listSessions',
      ).mockReturnValue([]);
      const closeSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'close',
      ).mockImplementation(() => {});

      // Create the DB file so existsSync returns true
      writeFileSync(join(teamDir, 'sessions.db'), '');

      const { runCli } = await import('../cli');
      await runCli(['sessions']);

      expect(consoleLogs.some((l) => l.includes('No sessions found.'))).toBe(true);

      listSpy.mockRestore();
      closeSpy.mockRestore();
      cleanup(tmpDir);
    });

    it('lists sessions with correct format when sessions exist', async () => {
      const tmpDir = makeTempDir();
      const teamDir = join(tmpDir, '.claude', 'team');
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, 'sessions.db'), '');
      process.chdir(tmpDir);

      const sessionLoggerModule = await import('../session-logger');
      const mockSessions = [
        {
          id: 'sess-1',
          startedAt: '2024-03-10T09:30:00.000Z',
          endedAt: '2024-03-10T10:00:00.000Z',
          user: 'alice',
          branch: 'feature/auth',
          summary: 'Implemented OAuth flow',
        },
        {
          id: 'sess-2',
          startedAt: '2024-03-10T11:00:00.000Z',
          endedAt: null,
          user: 'bob',
          branch: 'develop',
          summary: null,
        },
      ];
      const listSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'listSessions',
      ).mockReturnValue(mockSessions);
      const closeSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'close',
      ).mockImplementation(() => {});

      const { runCli } = await import('../cli');
      await runCli(['sessions']);

      // Completed session uses ✓
      expect(
        consoleLogs.some(
          (l) => l.includes('✓') && l.includes('@alice') && l.includes('feature/auth'),
        ),
      ).toBe(true);
      // Active session uses →
      expect(
        consoleLogs.some((l) => l.includes('→') && l.includes('@bob') && l.includes('develop')),
      ).toBe(true);
      // No summary shown as (no summary)
      expect(consoleLogs.some((l) => l.includes('(no summary)'))).toBe(true);
      // Summary shown for alice's session
      expect(consoleLogs.some((l) => l.includes('Implemented OAuth flow'))).toBe(true);

      listSpy.mockRestore();
      closeSpy.mockRestore();
      cleanup(tmpDir);
    });

    it('passes search option when --search flag is provided', async () => {
      const tmpDir = makeTempDir();
      const teamDir = join(tmpDir, '.claude', 'team');
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, 'sessions.db'), '');
      process.chdir(tmpDir);

      const sessionLoggerModule = await import('../session-logger');
      const listSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'listSessions',
      ).mockReturnValue([]);
      const closeSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'close',
      ).mockImplementation(() => {});

      const { runCli } = await import('../cli');
      await runCli(['sessions', '--search', 'oauth']);

      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ search: 'oauth' }));

      listSpy.mockRestore();
      closeSpy.mockRestore();
      cleanup(tmpDir);
    });

    it('passes user option when --user flag is provided', async () => {
      const tmpDir = makeTempDir();
      const teamDir = join(tmpDir, '.claude', 'team');
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, 'sessions.db'), '');
      process.chdir(tmpDir);

      const sessionLoggerModule = await import('../session-logger');
      const listSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'listSessions',
      ).mockReturnValue([]);
      const closeSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'close',
      ).mockImplementation(() => {});

      const { runCli } = await import('../cli');
      await runCli(['sessions', '--user', 'alice']);

      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ user: 'alice' }));

      listSpy.mockRestore();
      closeSpy.mockRestore();
      cleanup(tmpDir);
    });

    it('passes limit option when --limit flag is provided', async () => {
      const tmpDir = makeTempDir();
      const teamDir = join(tmpDir, '.claude', 'team');
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, 'sessions.db'), '');
      process.chdir(tmpDir);

      const sessionLoggerModule = await import('../session-logger');
      const listSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'listSessions',
      ).mockReturnValue([]);
      const closeSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'close',
      ).mockImplementation(() => {});

      const { runCli } = await import('../cli');
      await runCli(['sessions', '--limit', '5']);

      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));

      listSpy.mockRestore();
      closeSpy.mockRestore();
      cleanup(tmpDir);
    });

    it('uses -s shorthand for search', async () => {
      const tmpDir = makeTempDir();
      const teamDir = join(tmpDir, '.claude', 'team');
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, 'sessions.db'), '');
      process.chdir(tmpDir);

      const sessionLoggerModule = await import('../session-logger');
      const listSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'listSessions',
      ).mockReturnValue([]);
      const closeSpy = spyOn(
        sessionLoggerModule.SessionLogger.prototype,
        'close',
      ).mockImplementation(() => {});

      const { runCli } = await import('../cli');
      await runCli(['sessions', '-s', 'fix']);

      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ search: 'fix' }));

      listSpy.mockRestore();
      closeSpy.mockRestore();
      cleanup(tmpDir);
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
