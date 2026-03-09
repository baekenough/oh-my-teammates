import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { ReportGenerator } from '../report';
import type { ReportData } from '../report-template';
import { escapeHtml, generateReportHtml } from '../report-template';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `report-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

function createTeamDir(tmpDir: string): string {
  const teamDir = join(tmpDir, '.claude', 'team');
  mkdirSync(teamDir, { recursive: true });
  return teamDir;
}

function writeTeamConfig(teamDir: string): void {
  const teamYaml = stringify({
    team: {
      name: 'Test Team',
      version: '1.0',
      members: [
        { github: 'alice', name: 'Alice Smith', role: 'admin', domains: ['backend'] },
        { github: 'bob', name: 'Bob Jones', role: 'member', domains: ['frontend'] },
      ],
    },
  });
  writeFileSync(join(teamDir, 'team.yaml'), teamYaml, 'utf-8');
}

function writeStewardsConfig(teamDir: string): void {
  const stewardsYaml = stringify({
    stewards: {
      version: '1.0',
      domains: {
        backend: { primary: 'alice', backup: 'bob', paths: ['src/api/**'] },
        frontend: { primary: 'bob', backup: null, paths: ['src/components/**'] },
      },
    },
  });
  writeFileSync(join(teamDir, 'STEWARDS.yaml'), stewardsYaml, 'utf-8');
}

function writeTodoFile(teamDir: string): void {
  const content = [
    '# Team TODO',
    '',
    '## team: [P0] Fix critical bug — @alice (backend)',
    '## team: [P1] Update docs — @bob (frontend)',
    '## ~~team: [P2] Old task — @alice (backend)~~',
  ].join('\n');
  writeFileSync(join(teamDir, 'TODO.md'), content, 'utf-8');
}

function createSessionDb(teamDir: string): void {
  const dbPath = join(teamDir, 'sessions.db');
  const db = new Database(dbPath, { create: true });
  db.exec('PRAGMA journal_mode=WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      user TEXT NOT NULL,
      branch TEXT NOT NULL,
      summary TEXT
    );
    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);

  db.prepare(
    'INSERT INTO sessions (id, started_at, ended_at, user, branch, summary) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    'session-1',
    '2025-01-01T10:00:00.000Z',
    '2025-01-01T11:00:00.000Z',
    'alice',
    'main',
    'Fixed bug',
  );

  db.prepare(
    'INSERT INTO sessions (id, started_at, ended_at, user, branch, summary) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    'session-2',
    '2025-01-02T09:00:00.000Z',
    '2025-01-02T09:30:00.000Z',
    'bob',
    'feature/x',
    null,
  );

  db.prepare(
    'INSERT INTO session_events (session_id, timestamp, type, data) VALUES (?, ?, ?, ?)',
  ).run(
    'session-1',
    '2025-01-01T10:05:00.000Z',
    'file_change',
    JSON.stringify({ file: 'src/api/index.ts' }),
  );

  db.prepare(
    'INSERT INTO session_events (session_id, timestamp, type, data) VALUES (?, ?, ?, ?)',
  ).run(
    'session-1',
    '2025-01-01T10:10:00.000Z',
    'agent_spawn',
    JSON.stringify({ agent: 'lang-typescript-expert' }),
  );

  db.close();
}

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater-than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('passes through normal text unchanged', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123');
  });

  it('escapes all special characters in a single string', () => {
    expect(escapeHtml('<a href="url">it\'s & more</a>')).toBe(
      '&lt;a href=&quot;url&quot;&gt;it&#39;s &amp; more&lt;/a&gt;',
    );
  });
});

// ── ReportGenerator ───────────────────────────────────────────────────────────

describe('ReportGenerator', () => {
  let tmpDir: string;
  let teamDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    teamDir = createTeamDir(tmpDir);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('generates report with all data sources present', async () => {
    writeTeamConfig(teamDir);
    writeStewardsConfig(teamDir);
    writeTodoFile(teamDir);
    createSessionDb(teamDir);

    const generator = new ReportGenerator(tmpDir);
    const outputPath = await generator.generate();

    expect(existsSync(outputPath)).toBe(true);
    const html = readFileSync(outputPath, 'utf-8');
    expect(html).toContain('Test Team');
    expect(html).toContain('Alice Smith');
    expect(html).toContain('Bob Jones');
    expect(html).toContain('backend');
    expect(html).toContain('frontend');
  });

  it('generates report when no data sources exist (graceful fallback)', async () => {
    const generator = new ReportGenerator(tmpDir);
    const outputPath = await generator.generate();

    expect(existsSync(outputPath)).toBe(true);
    const html = readFileSync(outputPath, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Team Report');
    expect(html).toContain('No session data available.');
    expect(html).toContain('No TODO data available.');
  });

  it('generates report with only team config present', async () => {
    writeTeamConfig(teamDir);

    const generator = new ReportGenerator(tmpDir);
    const outputPath = await generator.generate();

    expect(existsSync(outputPath)).toBe(true);
    const html = readFileSync(outputPath, 'utf-8');
    expect(html).toContain('Test Team');
    expect(html).toContain('Alice Smith');
    expect(html).toContain('No session data available.');
    expect(html).toContain('No TODO data available.');
  });

  it('generates report with only stewards config present', async () => {
    writeStewardsConfig(teamDir);

    const generator = new ReportGenerator(tmpDir);
    const outputPath = await generator.generate();

    expect(existsSync(outputPath)).toBe(true);
    const html = readFileSync(outputPath, 'utf-8');
    expect(html).toContain('backend');
    expect(html).toContain('frontend');
    expect(html).toContain('alice');
  });

  it('respects custom output path via options.output', async () => {
    writeTeamConfig(teamDir);

    const customOutput = join(tmpDir, 'custom', 'my-report.html');
    const generator = new ReportGenerator(tmpDir);
    const outputPath = await generator.generate({ output: 'custom/my-report.html' });

    expect(outputPath).toBe(customOutput);
    expect(existsSync(customOutput)).toBe(true);
  });

  it('generated HTML contains expected section headings', async () => {
    const generator = new ReportGenerator(tmpDir);
    const outputPath = await generator.generate();

    const html = readFileSync(outputPath, 'utf-8');
    expect(html).toContain('Team Members');
    expect(html).toContain('Domain Ownership Matrix');
    expect(html).toContain('Session Activity');
    expect(html).toContain('TODO Status');
    expect(html).toContain('Coverage Gaps');
  });

  it('generated HTML is self-contained (no external URLs)', async () => {
    const generator = new ReportGenerator(tmpDir);
    const outputPath = await generator.generate();

    const html = readFileSync(outputPath, 'utf-8');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<script');
  });

  it('shows coverage gaps when a domain has no backup steward', async () => {
    writeStewardsConfig(teamDir);

    const generator = new ReportGenerator(tmpDir);
    const outputPath = await generator.generate();

    const html = readFileSync(outputPath, 'utf-8');
    expect(html).not.toContain('All domains have backup stewards.');
  });

  it('shows all-covered message when all domains have backup stewards', async () => {
    const stewardsYaml = stringify({
      stewards: {
        version: '1.0',
        domains: {
          backend: { primary: 'alice', backup: 'bob', paths: ['src/api/**'] },
        },
      },
    });
    writeFileSync(join(teamDir, 'STEWARDS.yaml'), stewardsYaml, 'utf-8');

    const generator = new ReportGenerator(tmpDir);
    const outputPath = await generator.generate();

    const html = readFileSync(outputPath, 'utf-8');
    expect(html).toContain('All domains have backup stewards.');
  });
});

// ── generateReportHtml ────────────────────────────────────────────────────────

describe('generateReportHtml', () => {
  function makeBaseData(overrides: Partial<ReportData> = {}): ReportData {
    return {
      generatedAt: '2025-01-01T12:00:00.000Z',
      teamName: 'Test Team',
      version: '0.4.5',
      memberCount: 2,
      domainCount: 2,
      members: [
        { github: 'alice', name: 'Alice Smith', role: 'admin', domains: ['backend'] },
        { github: 'bob', name: 'Bob Jones', role: 'member', domains: ['frontend'] },
      ],
      domains: {
        backend: { primary: 'alice', backup: 'bob', paths: ['src/api/**'] },
        frontend: { primary: 'bob', backup: null, paths: ['src/components/**'] },
      },
      sessionStats: {
        totalSessions: 5,
        uniqueUsers: 2,
        avgDurationMinutes: 30,
        totalDurationMinutes: 150,
      },
      eventStats: [{ type: 'file_change', count: 10 }],
      userActivity: [{ user: 'alice', sessionCount: 3, totalMinutes: 90 }],
      branchDistribution: [{ branch: 'main', count: 3 }],
      recentSessions: [
        {
          id: 'sess-1',
          startedAt: '2025-01-01T10:00:00.000Z',
          endedAt: '2025-01-01T11:00:00.000Z',
          user: 'alice',
          branch: 'main',
          summary: 'Implemented feature X',
        },
      ],
      todos: { total: 3, completed: 1, pending: 2, byPriority: { P0: 1, P1: 1, P2: 1 } },
      coverageGaps: ['frontend'],
      ...overrides,
    };
  }

  it('generates valid HTML with all sections', () => {
    const html = generateReportHtml(makeBaseData());

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
    expect(html).toContain('Test Team');
    expect(html).toContain('Team Members');
    expect(html).toContain('Domain Ownership Matrix');
    expect(html).toContain('Session Activity');
    expect(html).toContain('TODO Status');
    expect(html).toContain('Coverage Gaps');
  });

  it('handles null session data gracefully', () => {
    const html = generateReportHtml(
      makeBaseData({
        sessionStats: null,
        eventStats: null,
        userActivity: null,
        branchDistribution: null,
      }),
    );

    expect(html).toContain('No session data available.');
    expect(html).toContain('No user activity data available.');
    expect(html).toContain('No branch distribution data available.');
    expect(html).toContain('No event statistics available.');
  });

  it('handles null todo data gracefully', () => {
    const html = generateReportHtml(makeBaseData({ todos: null }));

    expect(html).toContain('No TODO data available.');
  });

  it('shows coverage gaps when backup is null', () => {
    const html = generateReportHtml(makeBaseData({ coverageGaps: ['frontend', 'infra'] }));

    expect(html).toContain('frontend');
    expect(html).toContain('infra');
    expect(html).not.toContain('All domains have backup stewards.');
  });

  it('shows all-covered message when coverageGaps is empty', () => {
    const html = generateReportHtml(makeBaseData({ coverageGaps: [] }));

    expect(html).toContain('All domains have backup stewards.');
  });

  it('escapes user-provided team name in HTML output', () => {
    const html = generateReportHtml(makeBaseData({ teamName: '<script>alert("xss")</script>' }));

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes member github handle in HTML output', () => {
    const data = makeBaseData({
      members: [{ github: '<bad>', name: 'Bad Actor', role: 'member', domains: [] }],
    });
    const html = generateReportHtml(data);

    expect(html).not.toContain('<bad>');
    expect(html).toContain('&lt;bad&gt;');
  });

  it('escapes domain names in HTML output', () => {
    const data = makeBaseData({
      domains: {
        '<xss>': { primary: 'alice', backup: null, paths: [] },
      },
      coverageGaps: ['<xss>'],
    });
    const html = generateReportHtml(data);

    expect(html).not.toContain('<xss>');
    expect(html).toContain('&lt;xss&gt;');
  });

  it('truncates long session summaries', () => {
    const longSummary = 'A'.repeat(100);
    const data = makeBaseData({
      recentSessions: [
        {
          id: 'sess-long',
          startedAt: '2025-01-01T10:00:00.000Z',
          endedAt: null,
          user: 'alice',
          branch: 'main',
          summary: longSummary,
        },
      ],
    });
    const html = generateReportHtml(data);

    expect(html).not.toContain(longSummary);
    expect(html).toContain('A'.repeat(80));
    expect(html).toContain('\u2026');
  });

  it('handles session with null endedAt', () => {
    const data = makeBaseData({
      recentSessions: [
        {
          id: 'sess-open',
          startedAt: '2025-01-01T10:00:00.000Z',
          endedAt: null,
          user: 'alice',
          branch: 'main',
          summary: null,
        },
      ],
    });
    const html = generateReportHtml(data);

    expect(html).toContain('sess-open');
    expect(html).toContain('\u2014');
  });
});
