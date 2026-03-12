import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectProjectName,
  initTeam,
  migrateTeamFiles,
  scaffoldClaudeMd,
  scaffoldTeamDir,
  scanProject,
} from '../init';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a temporary directory and return its path. */
function makeTempDir(): string {
  const dir = join(tmpdir(), `omt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Recursively remove a directory, ignoring errors. */
function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/** Write a file, creating parent directories as needed. */
function write(dir: string, relPath: string, content = ''): void {
  const full = join(dir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
}

// ── migrateTeamFiles ─────────────────────────────────────────────────────────

describe('migrateTeamFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('migrates root-level team.yaml to .claude/team/team.yaml', () => {
    write(tmpDir, 'team.yaml', 'members: []\n');

    migrateTeamFiles(tmpDir);

    expect(existsSync(join(tmpDir, '.claude', 'team', 'team.yaml'))).toBe(true);
    expect(existsSync(join(tmpDir, 'team.yaml'))).toBe(false);
    expect(readFileSync(join(tmpDir, '.claude', 'team', 'team.yaml'), 'utf-8')).toBe(
      'members: []\n',
    );
  });

  it('migrates root-level STEWARDS.yaml to .claude/team/STEWARDS.yaml', () => {
    write(tmpDir, 'STEWARDS.yaml', 'domains: []\n');

    migrateTeamFiles(tmpDir);

    expect(existsSync(join(tmpDir, '.claude', 'team', 'STEWARDS.yaml'))).toBe(true);
    expect(existsSync(join(tmpDir, 'STEWARDS.yaml'))).toBe(false);
    expect(readFileSync(join(tmpDir, '.claude', 'team', 'STEWARDS.yaml'), 'utf-8')).toBe(
      'domains: []\n',
    );
  });

  it('does not overwrite existing .claude/team/ files', () => {
    // Pre-existing destination
    mkdirSync(join(tmpDir, '.claude', 'team'), { recursive: true });
    writeFileSync(join(tmpDir, '.claude', 'team', 'team.yaml'), '# existing\n', 'utf-8');
    // Root-level source
    write(tmpDir, 'team.yaml', 'members: []\n');

    migrateTeamFiles(tmpDir);

    // Destination must be unchanged
    expect(readFileSync(join(tmpDir, '.claude', 'team', 'team.yaml'), 'utf-8')).toBe(
      '# existing\n',
    );
    // Source must still exist (not removed because destination was not empty)
    expect(existsSync(join(tmpDir, 'team.yaml'))).toBe(true);
  });

  it('does nothing when no root-level files exist', () => {
    const moved = migrateTeamFiles(tmpDir);

    expect(moved).toEqual([]);
    expect(existsSync(join(tmpDir, '.claude', 'team', 'team.yaml'))).toBe(false);
    expect(existsSync(join(tmpDir, '.claude', 'team', 'STEWARDS.yaml'))).toBe(false);
  });

  it('returns list of migrated source paths', () => {
    write(tmpDir, 'team.yaml', 'members: []\n');
    write(tmpDir, 'STEWARDS.yaml', 'domains: []\n');

    const moved = migrateTeamFiles(tmpDir);

    expect(moved).toHaveLength(2);
    expect(moved).toContain(join(tmpDir, 'team.yaml'));
    expect(moved).toContain(join(tmpDir, 'STEWARDS.yaml'));
  });
});

// ── scanProject ──────────────────────────────────────────────────────────────

describe('scanProject', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('returns empty results for an empty project', () => {
    const result = scanProject(tmpDir);
    expect(result.detectedDomains).toEqual([]);
    expect(result.dependencies).toEqual([]);
    expect(result.filePatterns).toEqual({});
    expect(result.suggestedStewards).toEqual({});
    expect(result.analysisSkillAvailable).toBe(false);
  });

  it('detects analysis skill when .claude/skills/analysis/ directory exists', () => {
    mkdirSync(join(tmpDir, '.claude', 'skills', 'analysis'), { recursive: true });

    const result = scanProject(tmpDir);
    expect(result.analysisSkillAvailable).toBe(true);
  });

  it('reports analysis skill as unavailable when directory is absent', () => {
    const result = scanProject(tmpDir);
    expect(result.analysisSkillAvailable).toBe(false);
  });

  it('counts file extensions correctly', () => {
    write(tmpDir, 'src/index.ts', '');
    write(tmpDir, 'src/app.ts', '');
    write(tmpDir, 'src/style.css', '');

    const result = scanProject(tmpDir);
    expect(result.filePatterns['.ts']).toBe(2);
    expect(result.filePatterns['.css']).toBe(1);
  });

  it('detects package.json as a dependency', () => {
    write(tmpDir, 'package.json', JSON.stringify({ name: 'test-project' }));

    const result = scanProject(tmpDir);
    expect(result.dependencies).toContain('package.json');
  });

  it('detects go.mod as a dependency', () => {
    write(tmpDir, 'go.mod', 'module example.com/myapp\n\ngo 1.21\n');

    const result = scanProject(tmpDir);
    expect(result.dependencies).toContain('go.mod');
  });

  it('detects pyproject.toml as a dependency', () => {
    write(tmpDir, 'pyproject.toml', '[tool.poetry]\nname = "my-app"\n');

    const result = scanProject(tmpDir);
    expect(result.dependencies).toContain('pyproject.toml');
  });

  it('detects Cargo.toml as a dependency', () => {
    write(tmpDir, 'Cargo.toml', '[package]\nname = "my-crate"\n');

    const result = scanProject(tmpDir);
    expect(result.dependencies).toContain('Cargo.toml');
  });

  it('skips node_modules directory', () => {
    write(tmpDir, 'node_modules/some-pkg/index.js', '');
    write(tmpDir, 'src/main.ts', '');

    const result = scanProject(tmpDir);
    // node_modules files must not appear in extensions or domain suggestions
    const allFiles = Object.values(result.suggestedStewards).flat();
    expect(allFiles.every((f) => !f.includes('node_modules'))).toBe(true);
    expect(result.filePatterns['.js']).toBeUndefined();
  });

  it('skips .git directory', () => {
    write(tmpDir, '.git/config', '');
    write(tmpDir, 'src/app.ts', '');

    const result = scanProject(tmpDir);
    const allFiles = Object.values(result.suggestedStewards).flat();
    expect(allFiles.every((f) => !f.includes('.git'))).toBe(true);
  });

  it('skips dist directory', () => {
    write(tmpDir, 'dist/bundle.js', '');
    write(tmpDir, 'src/main.ts', '');

    const result = scanProject(tmpDir);
    const allFiles = Object.values(result.suggestedStewards).flat();
    expect(allFiles.every((f) => !f.includes('dist'))).toBe(true);
  });

  it("detects the 'quality' domain for test files", () => {
    write(tmpDir, 'src/__tests__/app.test.ts', '');

    const result = scanProject(tmpDir);
    expect(result.detectedDomains).toContain('quality');
    expect(result.suggestedStewards.quality).toBeDefined();
  });

  it("detects the 'documentation' domain for markdown files", () => {
    write(tmpDir, 'docs/README.md', '');

    const result = scanProject(tmpDir);
    expect(result.detectedDomains).toContain('documentation');
  });

  it("detects the 'infrastructure' domain for Dockerfile", () => {
    write(tmpDir, 'Dockerfile', 'FROM node:20');

    const result = scanProject(tmpDir);
    expect(result.detectedDomains).toContain('infrastructure');
  });

  it("detects the 'frontend' domain for TSX files", () => {
    write(tmpDir, 'src/components/Button.tsx', '');

    const result = scanProject(tmpDir);
    expect(result.detectedDomains).toContain('frontend');
  });

  it("detects the 'backend' domain for files under src/api/", () => {
    write(tmpDir, 'src/api/users.ts', '');

    const result = scanProject(tmpDir);
    expect(result.detectedDomains).toContain('backend');
  });

  it('detects multiple domains simultaneously', () => {
    write(tmpDir, 'src/api/users.ts', '');
    write(tmpDir, 'src/components/App.tsx', '');
    write(tmpDir, 'Dockerfile', 'FROM node:20');

    const result = scanProject(tmpDir);
    expect(result.detectedDomains).toContain('backend');
    expect(result.detectedDomains).toContain('frontend');
    expect(result.detectedDomains).toContain('infrastructure');
  });

  it('detects multiple dependency files', () => {
    write(tmpDir, 'package.json', '{}');
    write(tmpDir, 'Dockerfile', 'FROM node:20');
    write(tmpDir, 'go.mod', 'module example.com');

    const result = scanProject(tmpDir);
    expect(result.dependencies).toContain('package.json');
    expect(result.dependencies).toContain('go.mod');
  });

  it('silently skips unreadable subdirectories (permission error branch)', () => {
    // Create a readable file and an unreadable subdirectory
    write(tmpDir, 'src/main.ts', '');
    const restrictedDir = join(tmpDir, 'restricted');
    mkdirSync(restrictedDir);
    chmodSync(restrictedDir, 0o000);

    let result: ReturnType<typeof scanProject>;
    try {
      // scanProject must not throw even when a subdirectory is unreadable
      result = scanProject(tmpDir);
    } finally {
      // Restore permissions so cleanup() can remove the directory
      chmodSync(restrictedDir, 0o755);
    }

    // biome-ignore lint/style/noNonNullAssertion: assigned in try block before finally
    expect(result!.filePatterns['.ts']).toBe(1);
  });
});

// ── scaffoldTeamDir ───────────────────────────────────────────────────────────

describe('scaffoldTeamDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('creates the .claude/team/ directory', () => {
    scaffoldTeamDir(tmpDir);
    expect(existsSync(join(tmpDir, '.claude', 'team'))).toBe(true);
  });

  it('creates TODO.md inside .claude/team/', () => {
    scaffoldTeamDir(tmpDir);
    const todoPath = join(tmpDir, '.claude', 'team', 'TODO.md');
    expect(existsSync(todoPath)).toBe(true);
  });

  it('TODO.md contains expected header', () => {
    scaffoldTeamDir(tmpDir);
    const content = readFileSync(join(tmpDir, '.claude', 'team', 'TODO.md'), 'utf-8');
    expect(content).toContain('# Team TODO');
  });

  it('does not overwrite an existing TODO.md', () => {
    scaffoldTeamDir(tmpDir);
    const todoPath = join(tmpDir, '.claude', 'team', 'TODO.md');
    writeFileSync(todoPath, '# Custom Content\n', 'utf-8');

    // Call again — should not overwrite
    scaffoldTeamDir(tmpDir);
    const content = readFileSync(todoPath, 'utf-8');
    expect(content).toBe('# Custom Content\n');
  });

  it('is idempotent when called twice', () => {
    scaffoldTeamDir(tmpDir);
    scaffoldTeamDir(tmpDir);
    expect(existsSync(join(tmpDir, '.claude', 'team'))).toBe(true);
  });

  it('includes analysis skill note in TODO.md when analysisSkillAvailable is true', () => {
    scaffoldTeamDir(tmpDir, true);
    const content = readFileSync(join(tmpDir, '.claude', 'team', 'TODO.md'), 'utf-8');
    expect(content).toContain('Analysis Skill');
    expect(content).toContain('/analysis skill is available');
  });

  it('omits analysis skill note in TODO.md when analysisSkillAvailable is false', () => {
    scaffoldTeamDir(tmpDir, false);
    const content = readFileSync(join(tmpDir, '.claude', 'team', 'TODO.md'), 'utf-8');
    expect(content).not.toContain('Analysis Skill');
  });
});

// ── detectProjectName ─────────────────────────────────────────────────────────

describe('detectProjectName', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('reads name from package.json', () => {
    write(tmpDir, 'package.json', JSON.stringify({ name: 'my-awesome-project' }));
    expect(detectProjectName(tmpDir)).toBe('my-awesome-project');
  });

  it('falls back to directory basename when no package.json', () => {
    const name = detectProjectName(tmpDir);
    // The temp dir basename is non-empty
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('falls back to directory basename when package.json has no name field', () => {
    write(tmpDir, 'package.json', JSON.stringify({ version: '1.0.0' }));
    const name = detectProjectName(tmpDir);
    expect(name).not.toBe('');
    expect(name).not.toBeUndefined();
  });

  it('falls back to directory basename when package.json has empty name', () => {
    write(tmpDir, 'package.json', JSON.stringify({ name: '  ' }));
    const name = detectProjectName(tmpDir);
    // Should not be empty string (trimmed "  " fails the guard)
    expect(name).not.toBe('');
    expect(name).not.toBe('  ');
  });

  it('falls back to directory basename when package.json is malformed JSON', () => {
    write(tmpDir, 'package.json', '{ not valid json');
    const name = detectProjectName(tmpDir);
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });
});

// ── initTeam ─────────────────────────────────────────────────────────────────

describe('initTeam', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('returns all expected paths', async () => {
    write(tmpDir, 'package.json', JSON.stringify({ name: 'init-test' }));
    const result = await initTeam(tmpDir);

    expect(result.teamConfigPath).toBe(join(tmpDir, '.claude', 'team', 'team.yaml'));
    expect(result.stewardsPath).toBe(join(tmpDir, '.claude', 'team', 'STEWARDS.yaml'));
    expect(result.teamDirPath).toBe(join(tmpDir, '.claude', 'team'));
  });

  it('creates team.yaml when absent', async () => {
    await initTeam(tmpDir);
    expect(existsSync(join(tmpDir, '.claude', 'team', 'team.yaml'))).toBe(true);
  });

  it('creates STEWARDS.yaml when absent', async () => {
    await initTeam(tmpDir);
    expect(existsSync(join(tmpDir, '.claude', 'team', 'STEWARDS.yaml'))).toBe(true);
  });

  it('does not overwrite existing team.yaml', async () => {
    mkdirSync(join(tmpDir, '.claude', 'team'), { recursive: true });
    const teamPath = join(tmpDir, '.claude', 'team', 'team.yaml');
    writeFileSync(teamPath, '# custom\n', 'utf-8');

    await initTeam(tmpDir);
    expect(readFileSync(teamPath, 'utf-8')).toBe('# custom\n');
  });

  it('does not overwrite existing STEWARDS.yaml', async () => {
    mkdirSync(join(tmpDir, '.claude', 'team'), { recursive: true });
    const stewardsPath = join(tmpDir, '.claude', 'team', 'STEWARDS.yaml');
    writeFileSync(stewardsPath, '# custom stewards\n', 'utf-8');

    await initTeam(tmpDir);
    expect(readFileSync(stewardsPath, 'utf-8')).toBe('# custom stewards\n');
  });

  it('returns a scan result with the correct shape', async () => {
    write(tmpDir, 'src/api/users.ts', '');
    const result = await initTeam(tmpDir);

    expect(Array.isArray(result.scanResult.detectedDomains)).toBe(true);
    expect(typeof result.scanResult.filePatterns).toBe('object');
    expect(Array.isArray(result.scanResult.dependencies)).toBe(true);
    expect(typeof result.scanResult.suggestedStewards).toBe('object');
  });

  it('includes scan results reflecting actual project files', async () => {
    write(tmpDir, 'package.json', JSON.stringify({ name: 'demo' }));
    write(tmpDir, 'src/api/server.ts', '');

    const result = await initTeam(tmpDir);
    expect(result.scanResult.dependencies).toContain('package.json');
    expect(result.scanResult.detectedDomains).toContain('backend');
  });

  it('is idempotent when called twice', async () => {
    await initTeam(tmpDir);
    // Second call must not throw even though files now exist
    const result = await initTeam(tmpDir);
    expect(result.teamConfigPath).toBe(join(tmpDir, '.claude', 'team', 'team.yaml'));
  });

  it('uses project name from package.json in team.yaml', async () => {
    write(tmpDir, 'package.json', JSON.stringify({ name: 'cool-project' }));
    await initTeam(tmpDir);

    const content = readFileSync(join(tmpDir, '.claude', 'team', 'team.yaml'), 'utf-8');
    expect(content).toContain('cool-project');
  });

  it('returns claudeMdPath in result', async () => {
    const result = await initTeam(tmpDir);
    expect(result.claudeMdPath).toBe(join(tmpDir, 'CLAUDE.md'));
  });

  it('returns claudeMdResult in result', async () => {
    const result = await initTeam(tmpDir);
    expect(typeof result.claudeMdResult.created).toBe('boolean');
    expect(typeof result.claudeMdResult.appended).toBe('boolean');
  });

  it('creates CLAUDE.md after initTeam', async () => {
    await initTeam(tmpDir);
    expect(existsSync(join(tmpDir, 'CLAUDE.md'))).toBe(true);
  });
});

// ── initTeam → ReportGenerator integration ────────────────────────────────────

describe('initTeam → ReportGenerator integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('initTeam creates files that ReportGenerator can read', async () => {
    write(tmpDir, 'package.json', JSON.stringify({ name: 'integration-test' }));

    const initResult = await initTeam(tmpDir);

    expect(initResult.teamConfigPath).toBe(join(tmpDir, '.claude', 'team', 'team.yaml'));
    expect(initResult.stewardsPath).toBe(join(tmpDir, '.claude', 'team', 'STEWARDS.yaml'));
    expect(existsSync(initResult.teamConfigPath)).toBe(true);
    expect(existsSync(initResult.stewardsPath)).toBe(true);

    const { ReportGenerator } = await import('../report');
    const generator = new ReportGenerator(tmpDir);
    const outputPath = await generator.generate();

    expect(existsSync(outputPath)).toBe(true);
    const html = readFileSync(outputPath, 'utf-8');
    expect(html).toContain('integration-test');
  });
});

// ── scaffoldClaudeMd ──────────────────────────────────────────────────────────

describe('scaffoldClaudeMd', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('creates CLAUDE.md when it does not exist', () => {
    scaffoldClaudeMd(tmpDir, 'my-project');
    expect(existsSync(join(tmpDir, 'CLAUDE.md'))).toBe(true);
  });

  it('created file contains ## Team Collaboration', () => {
    scaffoldClaudeMd(tmpDir, 'my-project');
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('## Team Collaboration');
  });

  it('created file contains the project name', () => {
    scaffoldClaudeMd(tmpDir, 'awesome-project');
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('awesome-project');
  });

  it('appends team section to existing CLAUDE.md without a team section', () => {
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Existing Project\n\nSome content.\n', 'utf-8');
    scaffoldClaudeMd(tmpDir, 'my-project');
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('## Team Collaboration');
  });

  it('preserves existing content when appending', () => {
    const original = '# Existing Project\n\nSome content.\n';
    writeFileSync(join(tmpDir, 'CLAUDE.md'), original, 'utf-8');
    scaffoldClaudeMd(tmpDir, 'my-project');
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# Existing Project');
    expect(content).toContain('Some content.');
  });

  it('does not modify CLAUDE.md that already has a team section', () => {
    const original = '# Project\n\n## Team Collaboration\n\nAlready here.\n';
    writeFileSync(join(tmpDir, 'CLAUDE.md'), original, 'utf-8');
    scaffoldClaudeMd(tmpDir, 'my-project');
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toBe(original);
  });

  it('returns { created: true, appended: false } when creating new file', () => {
    const result = scaffoldClaudeMd(tmpDir, 'my-project');
    expect(result).toEqual({ created: true, appended: false });
  });

  it('returns { created: false, appended: true } when appending to existing file', () => {
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Existing\n', 'utf-8');
    const result = scaffoldClaudeMd(tmpDir, 'my-project');
    expect(result).toEqual({ created: false, appended: true });
  });

  it('returns { created: false, appended: false } when team section already exists', () => {
    writeFileSync(
      join(tmpDir, 'CLAUDE.md'),
      '# Project\n\n## Team Collaboration\n\nAlready here.\n',
      'utf-8',
    );
    const result = scaffoldClaudeMd(tmpDir, 'my-project');
    expect(result).toEqual({ created: false, appended: false });
  });
});
