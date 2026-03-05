/**
 * Session logging with bun:sqlite
 * Tracks Claude Code sessions for team knowledge sharing
 */
import { Database } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';

export interface Session {
  id: string;
  startedAt: string; // ISO 8601
  endedAt: string | null;
  user: string; // GitHub username
  branch: string;
  summary: string | null;
}

export interface SessionEvent {
  id: number;
  sessionId: string;
  timestamp: string; // ISO 8601
  type: 'file_change' | 'command' | 'agent_spawn' | 'error' | 'note';
  data: string; // JSON string
}

export class SessionLogger {
  private db: Database;
  private currentSession: string | null = null;

  constructor(dbPath = '.claude/team/sessions.db') {
    this.db = new Database(dbPath, { create: true });
    this.db.exec('PRAGMA journal_mode=WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
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

      CREATE INDEX IF NOT EXISTS idx_session_events_session_id
        ON session_events (session_id);

      CREATE INDEX IF NOT EXISTS idx_session_events_timestamp
        ON session_events (timestamp);
    `);
  }

  private generateSessionId(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const pid = process.pid;
    const uuid = randomUUID().slice(0, 8);
    return `${date}-${pid}-${uuid}`;
  }

  startSession(user: string, branch: string): string {
    const id = this.generateSessionId();
    const startedAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO sessions (id, started_at, ended_at, user, branch, summary)
         VALUES (?, ?, NULL, ?, ?, NULL)`,
      )
      .run(id, startedAt, user, branch);

    this.currentSession = id;
    return id;
  }

  endSession(summary?: string): void {
    if (this.currentSession === null) {
      return;
    }

    const endedAt = new Date().toISOString();

    this.db
      .prepare('UPDATE sessions SET ended_at = ?, summary = ? WHERE id = ?')
      .run(endedAt, summary ?? null, this.currentSession);

    this.currentSession = null;
  }

  logEvent(type: SessionEvent['type'], data: Record<string, unknown>): void {
    if (this.currentSession === null) {
      throw new Error('No active session. Call startSession() first.');
    }

    const timestamp = new Date().toISOString();
    const dataJson = JSON.stringify(data);

    this.db
      .prepare(
        `INSERT INTO session_events (session_id, timestamp, type, data)
         VALUES (?, ?, ?, ?)`,
      )
      .run(this.currentSession, timestamp, type, dataJson);
  }

  getCurrentSession(): string | null {
    return this.currentSession;
  }

  getSession(id: string): Session | undefined {
    const row = this.db
      .prepare<
        {
          id: string;
          started_at: string;
          ended_at: string | null;
          user: string;
          branch: string;
          summary: string | null;
        },
        [string]
      >(
        `SELECT id, started_at, ended_at, user, branch, summary
         FROM sessions WHERE id = ?`,
      )
      .get(id);

    if (row === null) {
      return undefined;
    }

    return {
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      user: row.user,
      branch: row.branch,
      summary: row.summary,
    };
  }

  listSessions(options?: { user?: string; limit?: number }): Session[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options?.user !== undefined) {
      conditions.push('user = ?');
      params.push(options.user);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = options?.limit !== undefined ? 'LIMIT ?' : '';

    if (options?.limit !== undefined) {
      params.push(options.limit);
    }

    const rows = this.db
      .prepare<
        {
          id: string;
          started_at: string;
          ended_at: string | null;
          user: string;
          branch: string;
          summary: string | null;
        },
        (string | number)[]
      >(
        `SELECT id, started_at, ended_at, user, branch, summary
         FROM sessions ${whereClause} ORDER BY started_at DESC ${limitClause}`,
      )
      .all(...params);

    return rows.map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      user: row.user,
      branch: row.branch,
      summary: row.summary,
    }));
  }

  getSessionEvents(sessionId: string): SessionEvent[] {
    const rows = this.db
      .prepare<
        {
          id: number;
          session_id: string;
          timestamp: string;
          type: string;
          data: string;
        },
        [string]
      >(
        `SELECT id, session_id, timestamp, type, data
         FROM session_events WHERE session_id = ?
         ORDER BY timestamp ASC`,
      )
      .all(sessionId);

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      type: row.type as SessionEvent['type'],
      data: row.data,
    }));
  }

  close(): void {
    this.db.close();
  }
}
