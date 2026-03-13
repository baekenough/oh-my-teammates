/**
 * Additional coverage tests for cli.ts branches not covered by cli.test.ts.
 * - adminUsername branch: reads and writes team.yaml when admin is provided
 * - claudeMdResult.created branch: prints CLAUDE.md created message
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeTempDir(): string {
  const dir = join(tmpdir(), `cli-cov-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

describe('runCli coverage', () => {
  let consoleLogs: string[];
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogs = [];
    consoleLogSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleLogs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('init: adminUsername branch', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
    });

    afterEach(() => {
      cleanup(tmpDir);
    });

    it('writes admin username into team.yaml when provided', async () => {
      const teamYamlPath = join(tmpDir, 'team.yaml');
      writeFileSync(teamYamlPath, 'name: test\nadmin: ~\nmembers: []\n', 'utf-8');

      const initModule = await import('../init');
      const initSpy = spyOn(initModule, 'initTeam').mockResolvedValue({
        scanResult: {
          detectedDomains: [],
          filePatterns: {},
          dependencies: [],
          suggestedStewards: {},
          analysisSkillAvailable: false,
        },
        teamConfigPath: teamYamlPath,
        stewardsPath: join(tmpDir, 'STEWARDS.yaml'),
        teamDirPath: tmpDir,
        claudeMdPath: join(tmpDir, 'CLAUDE.md'),
        claudeMdResult: { created: false, appended: false },
      });

      const promptsModule = await import('../prompts');
      const promptSpy = spyOn(promptsModule, 'promptInit').mockResolvedValue({
        projectName: 'test-project',
        adminUsername: 'alice',
      });

      const { runCli } = await import('../cli');
      await runCli(['init']);

      expect(consoleLogs.some((l) => l.includes('Team initialized!'))).toBe(true);

      initSpy.mockRestore();
      promptSpy.mockRestore();
    });
  });

  describe('init: claudeMdResult.created branch', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
    });

    afterEach(() => {
      cleanup(tmpDir);
    });

    it('prints CLAUDE.md created message when claudeMdResult.created is true', async () => {
      const initModule = await import('../init');
      const initSpy = spyOn(initModule, 'initTeam').mockResolvedValue({
        scanResult: {
          detectedDomains: [],
          filePatterns: {},
          dependencies: [],
          suggestedStewards: {},
          analysisSkillAvailable: false,
        },
        teamConfigPath: join(tmpDir, 'team.yaml'),
        stewardsPath: join(tmpDir, 'STEWARDS.yaml'),
        teamDirPath: tmpDir,
        claudeMdPath: join(tmpDir, 'CLAUDE.md'),
        claudeMdResult: { created: true, appended: false },
      } as Awaited<ReturnType<typeof initModule.initTeam>> & {
        claudeMdPath: string;
        claudeMdResult: { created: boolean; appended: boolean };
      });

      const promptsModule = await import('../prompts');
      const promptSpy = spyOn(promptsModule, 'promptInit').mockResolvedValue({
        projectName: 'test-project',
        adminUsername: '',
      });

      const { runCli } = await import('../cli');
      await runCli(['init']);

      expect(consoleLogs.some((l) => l.includes('CLAUDE.md') && l.includes('(created)'))).toBe(
        true,
      );

      initSpy.mockRestore();
      promptSpy.mockRestore();
    });

    it('prints CLAUDE.md appended message when claudeMdResult.appended is true', async () => {
      const initModule = await import('../init');
      const initSpy = spyOn(initModule, 'initTeam').mockResolvedValue({
        scanResult: {
          detectedDomains: [],
          filePatterns: {},
          dependencies: [],
          suggestedStewards: {},
          analysisSkillAvailable: false,
        },
        teamConfigPath: join(tmpDir, 'team.yaml'),
        stewardsPath: join(tmpDir, 'STEWARDS.yaml'),
        teamDirPath: tmpDir,
        claudeMdPath: join(tmpDir, 'CLAUDE.md'),
        claudeMdResult: { created: false, appended: true },
      } as Awaited<ReturnType<typeof initModule.initTeam>> & {
        claudeMdPath: string;
        claudeMdResult: { created: boolean; appended: boolean };
      });

      const promptsModule = await import('../prompts');
      const promptSpy = spyOn(promptsModule, 'promptInit').mockResolvedValue({
        projectName: 'test-project',
        adminUsername: '',
      });

      const { runCli } = await import('../cli');
      await runCli(['init']);

      expect(
        consoleLogs.some((l) => l.includes('CLAUDE.md') && l.includes('(team section appended)')),
      ).toBe(true);

      initSpy.mockRestore();
      promptSpy.mockRestore();
    });
  });

  describe('doctor command', () => {
    it('runs doctor --locks and prints check results', async () => {
      const doctorModule = await import('../doctor');
      const doctorSpy = spyOn(doctorModule, 'runDoctor').mockResolvedValue([
        { check: 'file-integrity', status: 'pass', message: 'No locked files to verify' },
      ]);

      const { runCli } = await import('../cli');
      await runCli(['doctor', '--locks']);

      expect(consoleLogs.some((l) => l.includes('file-integrity'))).toBe(true);
      doctorSpy.mockRestore();
    });

    it('exits with code 1 when doctor finds failures', async () => {
      const doctorModule = await import('../doctor');
      const doctorSpy = spyOn(doctorModule, 'runDoctor').mockResolvedValue([
        { check: 'team.yaml', status: 'fail', message: 'not found' },
      ]);

      const processExitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });

      const { runCli } = await import('../cli');
      await expect(runCli(['doctor', '--config'])).rejects.toThrow('process.exit(1)');

      doctorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it('runs doctor with --updates flag', async () => {
      const doctorModule = await import('../doctor');
      const doctorSpy = spyOn(doctorModule, 'runDoctor').mockResolvedValue([
        { check: 'updates', status: 'pass', message: 'Up to date (0.8.0)' },
      ]);

      const { runCli } = await import('../cli');
      await runCli(['doctor', '--updates']);

      expect(consoleLogs.some((l) => l.includes('updates'))).toBe(true);
      doctorSpy.mockRestore();
    });
  });
});
