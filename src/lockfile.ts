/**
 * Checksum-based file protection for team configuration files.
 * Tracks SHA-256 hashes of critical files to detect accidental overwrites.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEAM_PATHS } from './paths';

export interface LockEntry {
  hash: string;
  lockedAt: string;
}

export interface VerifyResult {
  path: string;
  ok: boolean;
  expected?: string;
  actual?: string;
}

type LockData = Record<string, LockEntry>;

export class LockfileManager {
  private lockfilePath: string;

  constructor(basePath = '.') {
    this.lockfilePath = join(basePath, TEAM_PATHS.LOCKFILE);
  }

  private computeHash(filePath: string): string {
    const content = readFileSync(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  }

  private readLockData(): LockData {
    if (!existsSync(this.lockfilePath)) return {};
    try {
      return JSON.parse(readFileSync(this.lockfilePath, 'utf-8')) as LockData;
    } catch {
      return {};
    }
  }

  private writeLockData(data: LockData): void {
    writeFileSync(this.lockfilePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  lock(filePath: string): void {
    const data = this.readLockData();
    data[filePath] = { hash: this.computeHash(filePath), lockedAt: new Date().toISOString() };
    this.writeLockData(data);
  }

  verify(filePath: string): VerifyResult {
    const data = this.readLockData();
    const entry = data[filePath];
    if (!entry) return { path: filePath, ok: true };
    if (!existsSync(filePath)) {
      return { path: filePath, ok: false, expected: entry.hash, actual: '(file missing)' };
    }
    const currentHash = this.computeHash(filePath);
    if (currentHash === entry.hash) return { path: filePath, ok: true };
    return { path: filePath, ok: false, expected: entry.hash, actual: currentHash };
  }

  /** Uses for loop instead of .filter() for Linux coverage. */
  verifyAll(): VerifyResult[] {
    const data = this.readLockData();
    const results: VerifyResult[] = [];
    for (const filePath of Object.keys(data)) {
      results.push(this.verify(filePath));
    }
    return results;
  }

  unlock(filePath: string): void {
    const data = this.readLockData();
    delete data[filePath];
    this.writeLockData(data);
  }
}
