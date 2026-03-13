import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeTempDir(): string {
  const dir = join(tmpdir(), `doctor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe('runDoctor', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('--config check passes with valid team.yaml', async () => {
    const { runDoctor } = await import('../doctor');
    mkdirSync(join(tmpDir, '.claude', 'team'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.claude', 'team', 'team.yaml'),
      'team:\n  name: test\n  version: "1.0"\n  members:\n    - github: user1\n      name: User 1\n      role: admin\n      domains: []\n',
      'utf-8',
    );

    const results = await runDoctor({ config: true }, tmpDir);

    const configResult = results.find((r) => r.check === 'team.yaml');
    expect(configResult?.status).toBe('pass');
  });

  it('--config check fails when team.yaml missing', async () => {
    const { runDoctor } = await import('../doctor');

    const results = await runDoctor({ config: true }, tmpDir);

    const configResult = results.find((r) => r.check === 'team.yaml');
    expect(configResult?.status).toBe('fail');
  });

  it('--stewards check detects coverage gaps', async () => {
    const { runDoctor } = await import('../doctor');
    mkdirSync(join(tmpDir, '.claude', 'team'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.claude', 'team', 'STEWARDS.yaml'),
      'stewards:\n  version: "1.0"\n  domains:\n    backend:\n      primary: user1\n      backup: null\n      paths:\n        - src/api/**\n',
      'utf-8',
    );

    const results = await runDoctor({ stewards: true }, tmpDir);

    const gapResult = results.find((r) => r.check === 'steward-coverage');
    expect(gapResult?.status).toBe('warn');
    expect(gapResult?.message).toContain('backend');
  });

  it('--stewards check passes with full coverage', async () => {
    const { runDoctor } = await import('../doctor');
    mkdirSync(join(tmpDir, '.claude', 'team'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.claude', 'team', 'STEWARDS.yaml'),
      'stewards:\n  version: "1.0"\n  domains:\n    backend:\n      primary: user1\n      backup: user2\n      paths:\n        - src/api/**\n',
      'utf-8',
    );

    const results = await runDoctor({ stewards: true }, tmpDir);

    const gapResult = results.find((r) => r.check === 'steward-coverage');
    expect(gapResult?.status).toBe('pass');
  });

  it('--locks check detects modified locked files', async () => {
    const { runDoctor } = await import('../doctor');
    const { LockfileManager } = await import('../lockfile');

    mkdirSync(join(tmpDir, '.claude', 'team'), { recursive: true });
    const teamYaml = join(tmpDir, '.claude', 'team', 'team.yaml');
    writeFileSync(teamYaml, 'team: original\n', 'utf-8');

    const lockMgr = new LockfileManager(tmpDir);
    lockMgr.lock(teamYaml);

    // Modify the file
    writeFileSync(teamYaml, 'team: modified\n', 'utf-8');

    const results = await runDoctor({ locks: true }, tmpDir);

    const lockResult = results.find((r) => r.check === 'file-integrity');
    expect(lockResult?.status).toBe('fail');
  });

  it('--locks check passes when no modifications', async () => {
    const { runDoctor } = await import('../doctor');
    const { LockfileManager } = await import('../lockfile');

    mkdirSync(join(tmpDir, '.claude', 'team'), { recursive: true });
    const teamYaml = join(tmpDir, '.claude', 'team', 'team.yaml');
    writeFileSync(teamYaml, 'team: original\n', 'utf-8');

    const lockMgr = new LockfileManager(tmpDir);
    lockMgr.lock(teamYaml);

    const results = await runDoctor({ locks: true }, tmpDir);

    const lockResult = results.find((r) => r.check === 'file-integrity');
    expect(lockResult?.status).toBe('pass');
  });

  it('returns all checks when no flags specified', async () => {
    const { runDoctor } = await import('../doctor');

    const results = await runDoctor({}, tmpDir);

    // Should run at least config, stewards, and locks checks
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('--updates check shows update available', async () => {
    const vcModule = await import('../version-checker');
    const spy = spyOn(vcModule, 'checkForUpdate').mockResolvedValue({
      current: '0.8.0',
      latest: '0.9.0',
      updateAvailable: true,
    });

    const { runDoctor } = await import('../doctor');
    const results = await runDoctor({ updates: true }, tmpDir);

    const r = results.find((r) => r.check === 'updates');
    expect(r?.status).toBe('warn');
    expect(r?.message).toContain('0.9.0');
    spy.mockRestore();
  });

  it('--updates check shows up to date', async () => {
    const vcModule = await import('../version-checker');
    const spy = spyOn(vcModule, 'checkForUpdate').mockResolvedValue({
      current: '0.8.0',
      latest: '0.8.0',
      updateAvailable: false,
    });

    const { runDoctor } = await import('../doctor');
    const results = await runDoctor({ updates: true }, tmpDir);

    const r = results.find((r) => r.check === 'updates');
    expect(r?.status).toBe('pass');
    spy.mockRestore();
  });

  it('--updates check handles network failure gracefully', async () => {
    const vcModule = await import('../version-checker');
    const spy = spyOn(vcModule, 'checkForUpdate').mockResolvedValue(null);

    const { runDoctor } = await import('../doctor');
    const results = await runDoctor({ updates: true }, tmpDir);

    const r = results.find((r) => r.check === 'updates');
    expect(r?.status).toBe('warn');
    expect(r?.message).toContain('network');
    spy.mockRestore();
  });

  it('--config check fails when team.yaml is invalid YAML', async () => {
    const { runDoctor } = await import('../doctor');
    mkdirSync(join(tmpDir, '.claude', 'team'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.claude', 'team', 'team.yaml'),
      'not: valid: team: yaml: structure\n',
      'utf-8',
    );

    const results = await runDoctor({ config: true }, tmpDir);

    const configResult = results.find((r) => r.check === 'team.yaml');
    expect(configResult?.status).toBe('fail');
    expect(configResult?.message).toContain('Invalid');
  });

  it('--stewards check fails when STEWARDS.yaml is invalid', async () => {
    const { runDoctor } = await import('../doctor');
    mkdirSync(join(tmpDir, '.claude', 'team'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.claude', 'team', 'STEWARDS.yaml'),
      'not_stewards: true\n',
      'utf-8',
    );

    const results = await runDoctor({ stewards: true }, tmpDir);

    const stewardsResult = results.find((r) => r.check === 'STEWARDS.yaml');
    expect(stewardsResult?.status).toBe('fail');
    expect(stewardsResult?.message).toContain('Invalid');
  });
});
