import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeTempDir(): string {
  const dir = join(tmpdir(), `lockfile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

describe('LockfileManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    mkdirSync(join(tmpDir, '.claude', 'team'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('lock() creates .lockfile.json with correct hash', async () => {
    const { LockfileManager } = await import('../lockfile');
    const filePath = join(tmpDir, '.claude', 'team', 'team.yaml');
    writeFileSync(filePath, 'team: test\n', 'utf-8');
    const manager = new LockfileManager(tmpDir);
    manager.lock(filePath);
    const lockfilePath = join(tmpDir, '.claude', 'team', '.lockfile.json');
    expect(existsSync(lockfilePath)).toBe(true);
    const lockData = JSON.parse(readFileSync(lockfilePath, 'utf-8'));
    // toHaveProperty treats '.' as path separator, so check key existence directly
    expect(Object.hasOwn(lockData, filePath)).toBe(true);
    expect(lockData[filePath].hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verify() returns ok: true for unchanged file', async () => {
    const { LockfileManager } = await import('../lockfile');
    const filePath = join(tmpDir, '.claude', 'team', 'team.yaml');
    writeFileSync(filePath, 'team: test\n', 'utf-8');
    const manager = new LockfileManager(tmpDir);
    manager.lock(filePath);
    const result = manager.verify(filePath);
    expect(result.ok).toBe(true);
  });

  it('verify() returns ok: false for modified file', async () => {
    const { LockfileManager } = await import('../lockfile');
    const filePath = join(tmpDir, '.claude', 'team', 'team.yaml');
    writeFileSync(filePath, 'team: test\n', 'utf-8');
    const manager = new LockfileManager(tmpDir);
    manager.lock(filePath);
    writeFileSync(filePath, 'team: modified\n', 'utf-8');
    const result = manager.verify(filePath);
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty('expected');
    expect(result).toHaveProperty('actual');
  });

  it('unlock() removes entry from lockfile', async () => {
    const { LockfileManager } = await import('../lockfile');
    const filePath = join(tmpDir, '.claude', 'team', 'team.yaml');
    writeFileSync(filePath, 'team: test\n', 'utf-8');
    const manager = new LockfileManager(tmpDir);
    manager.lock(filePath);
    manager.unlock(filePath);
    const result = manager.verify(filePath);
    expect(result.ok).toBe(true);
  });

  it('verifyAll() checks all locked paths', async () => {
    const { LockfileManager } = await import('../lockfile');
    const file1 = join(tmpDir, '.claude', 'team', 'team.yaml');
    const file2 = join(tmpDir, '.claude', 'team', 'STEWARDS.yaml');
    writeFileSync(file1, 'team: test\n', 'utf-8');
    writeFileSync(file2, 'stewards: test\n', 'utf-8');
    const manager = new LockfileManager(tmpDir);
    manager.lock(file1);
    manager.lock(file2);
    writeFileSync(file2, 'stewards: changed\n', 'utf-8');
    const results = manager.verifyAll();
    expect(results.length).toBe(2);
    const okResults: typeof results = [];
    const failResults: typeof results = [];
    for (const r of results) {
      if (r.ok) okResults.push(r);
      else failResults.push(r);
    }
    expect(okResults.length).toBe(1);
    expect(failResults.length).toBe(1);
  });

  it('handles missing .lockfile.json gracefully', async () => {
    const { LockfileManager } = await import('../lockfile');
    const manager = new LockfileManager(tmpDir);
    const result = manager.verifyAll();
    expect(result).toEqual([]);
  });

  it('handles missing locked file gracefully', async () => {
    const { LockfileManager } = await import('../lockfile');
    const filePath = join(tmpDir, '.claude', 'team', 'team.yaml');
    writeFileSync(filePath, 'team: test\n', 'utf-8');
    const manager = new LockfileManager(tmpDir);
    manager.lock(filePath);
    rmSync(filePath);
    const result = manager.verify(filePath);
    expect(result.ok).toBe(false);
  });

  it('lock is idempotent (lock same file twice updates hash)', async () => {
    const { LockfileManager } = await import('../lockfile');
    const filePath = join(tmpDir, '.claude', 'team', 'team.yaml');
    writeFileSync(filePath, 'team: v1\n', 'utf-8');
    const manager = new LockfileManager(tmpDir);
    manager.lock(filePath);
    writeFileSync(filePath, 'team: v2\n', 'utf-8');
    manager.lock(filePath);
    const result = manager.verify(filePath);
    expect(result.ok).toBe(true);
  });
});
