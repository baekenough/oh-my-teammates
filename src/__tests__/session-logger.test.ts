import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionLogger } from '../session-logger';

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `session-logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('SessionLogger', () => {
  let logger: SessionLogger;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    dbPath = join(tempDir, 'sessions.db');
    logger = new SessionLogger(dbPath);
  });

  afterEach(() => {
    logger.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- Constructor & schema ---

  describe('constructor', () => {
    it('creates a SessionLogger instance', () => {
      expect(logger).toBeInstanceOf(SessionLogger);
    });

    it('creates the database file on disk', () => {
      const { existsSync } = require('node:fs');
      expect(existsSync(dbPath)).toBe(true);
    });

    it('initializes with no active session', () => {
      expect(logger.getCurrentSession()).toBeNull();
    });
  });

  // --- generateSessionId (via startSession) ---

  describe('session ID format', () => {
    it('returns an ID matching {YYYYMMDD}-{PID}-{8-char-hex} pattern', () => {
      const id = logger.startSession('testuser', 'main');
      expect(id).toMatch(/^\d{8}-\d+-[0-9a-f]{8}$/);
    });

    it("includes today's date in the session ID", () => {
      const id = logger.startSession('testuser', 'main');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      expect(id.startsWith(today)).toBe(true);
    });

    it('generates unique IDs across sessions', () => {
      const id1 = logger.startSession('user1', 'main');
      logger.endSession();
      const id2 = logger.startSession('user2', 'develop');
      expect(id1).not.toBe(id2);
    });
  });

  // --- startSession ---

  describe('startSession', () => {
    it('returns the new session ID', () => {
      const id = logger.startSession('alice', 'feature/login');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('sets the current session to the returned ID', () => {
      const id = logger.startSession('alice', 'main');
      expect(logger.getCurrentSession()).toBe(id);
    });

    it('persists the session record in the database', () => {
      const id = logger.startSession('alice', 'develop');
      const session = logger.getSession(id);
      expect(session).toBeDefined();
      expect(session?.user).toBe('alice');
      expect(session?.branch).toBe('develop');
    });

    it('sets endedAt to null initially', () => {
      const id = logger.startSession('alice', 'main');
      const session = logger.getSession(id);
      expect(session?.endedAt).toBeNull();
    });

    it('sets summary to null initially', () => {
      const id = logger.startSession('alice', 'main');
      const session = logger.getSession(id);
      expect(session?.summary).toBeNull();
    });

    it('records a valid ISO 8601 startedAt timestamp', () => {
      const before = new Date().toISOString();
      const id = logger.startSession('alice', 'main');
      const after = new Date().toISOString();
      const session = logger.getSession(id);
      expect(session?.startedAt).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: existence verified by toBeDefined above
      expect(session!.startedAt >= before).toBe(true);
      // biome-ignore lint/style/noNonNullAssertion: existence verified by toBeDefined above
      expect(session!.startedAt <= after).toBe(true);
    });
  });

  // --- endSession ---

  describe('endSession', () => {
    it('clears the current session', () => {
      logger.startSession('bob', 'main');
      logger.endSession();
      expect(logger.getCurrentSession()).toBeNull();
    });

    it('records endedAt on the session record', () => {
      const id = logger.startSession('bob', 'main');
      logger.endSession();
      const session = logger.getSession(id);
      expect(session?.endedAt).not.toBeNull();
    });

    it('records summary when provided', () => {
      const id = logger.startSession('bob', 'main');
      logger.endSession('Implemented feature X');
      const session = logger.getSession(id);
      expect(session?.summary).toBe('Implemented feature X');
    });

    it('records null summary when not provided', () => {
      const id = logger.startSession('bob', 'main');
      logger.endSession();
      const session = logger.getSession(id);
      expect(session?.summary).toBeNull();
    });

    it('is a no-op when no session is active', () => {
      expect(() => logger.endSession('should not throw')).not.toThrow();
    });

    it('records a valid ISO 8601 endedAt timestamp', () => {
      const id = logger.startSession('bob', 'main');
      const before = new Date().toISOString();
      logger.endSession();
      const after = new Date().toISOString();
      const session = logger.getSession(id);
      expect((session?.endedAt ?? '') >= before).toBe(true);
      expect((session?.endedAt ?? '') <= after).toBe(true);
    });
  });

  // --- logEvent ---

  describe('logEvent', () => {
    it('throws when no session is active', () => {
      expect(() => logger.logEvent('note', { msg: 'hello' })).toThrow('No active session');
    });

    it('persists an event linked to the current session', () => {
      const sessionId = logger.startSession('carol', 'main');
      logger.logEvent('note', { msg: 'hello' });
      const events = logger.getSessionEvents(sessionId);
      expect(events).toHaveLength(1);
    });

    it('stores data as a JSON string', () => {
      const sessionId = logger.startSession('carol', 'main');
      logger.logEvent('file_change', { path: 'src/index.ts', lines: 42 });
      const events = logger.getSessionEvents(sessionId);
      // biome-ignore lint/style/noNonNullAssertion: event exists, verified by logEvent call above
      const parsed = JSON.parse(events[0]!.data);
      expect(parsed.path).toBe('src/index.ts');
      expect(parsed.lines).toBe(42);
    });

    it('records the event type correctly', () => {
      const sessionId = logger.startSession('carol', 'main');
      logger.logEvent('agent_spawn', { agent: 'lang-typescript-expert' });
      const events = logger.getSessionEvents(sessionId);
      expect(events[0]?.type).toBe('agent_spawn');
    });

    it('records a valid ISO 8601 timestamp', () => {
      const sessionId = logger.startSession('carol', 'main');
      const before = new Date().toISOString();
      logger.logEvent('command', { cmd: 'bun test' });
      const after = new Date().toISOString();
      const events = logger.getSessionEvents(sessionId);
      // biome-ignore lint/style/noNonNullAssertion: event exists, verified by logEvent call above
      expect(events[0]!.timestamp >= before).toBe(true);
      // biome-ignore lint/style/noNonNullAssertion: event exists, verified by logEvent call above
      expect(events[0]!.timestamp <= after).toBe(true);
    });

    it('assigns auto-incremented integer IDs to events', () => {
      const sessionId = logger.startSession('carol', 'main');
      logger.logEvent('note', { n: 1 });
      logger.logEvent('note', { n: 2 });
      const events = logger.getSessionEvents(sessionId);
      expect(events[0]?.id).toBe(1);
      expect(events[1]?.id).toBe(2);
    });

    it('supports all valid event types', () => {
      const sessionId = logger.startSession('carol', 'main');
      const types: Array<
        'file_change' | 'command' | 'agent_spawn' | 'agent_start' | 'agent_stop' | 'error' | 'note'
      > = ['file_change', 'command', 'agent_spawn', 'agent_start', 'agent_stop', 'error', 'note'];
      for (const type of types) {
        logger.logEvent(type, {});
      }
      const events = logger.getSessionEvents(sessionId);
      expect(events.map((e) => e.type)).toEqual(types);
    });
  });

  // --- listSessions ---

  describe('listSessions', () => {
    it('returns an empty array when no sessions exist', () => {
      expect(logger.listSessions()).toEqual([]);
    });

    it('returns all sessions ordered by startedAt descending', async () => {
      const id1 = logger.startSession('alice', 'main');
      logger.endSession();
      // Small pause so the second session gets a later timestamp
      await new Promise((resolve) => setTimeout(resolve, 5));
      const id2 = logger.startSession('bob', 'develop');
      logger.endSession();
      const sessions = logger.listSessions();
      expect(sessions[0]?.id).toBe(id2);
      expect(sessions[1]?.id).toBe(id1);
    });

    it('filters by user when user option is provided', () => {
      logger.startSession('alice', 'main');
      logger.endSession();
      logger.startSession('bob', 'main');
      logger.endSession();
      logger.startSession('alice', 'feature');
      logger.endSession();
      const aliceSessions = logger.listSessions({ user: 'alice' });
      expect(aliceSessions).toHaveLength(2);
      expect(aliceSessions.every((s) => s.user === 'alice')).toBe(true);
    });

    it('respects the limit option', () => {
      for (let i = 0; i < 5; i++) {
        logger.startSession('user', 'main');
        logger.endSession();
      }
      const limited = logger.listSessions({ limit: 3 });
      expect(limited).toHaveLength(3);
    });

    it('applies both user filter and limit together', () => {
      logger.startSession('alice', 'main');
      logger.endSession();
      logger.startSession('alice', 'develop');
      logger.endSession();
      logger.startSession('bob', 'main');
      logger.endSession();
      const result = logger.listSessions({ user: 'alice', limit: 1 });
      expect(result).toHaveLength(1);
      expect(result[0]?.user).toBe('alice');
    });
  });

  // --- getSession ---

  describe('getSession', () => {
    it('returns undefined for a non-existent ID', () => {
      expect(logger.getSession('non-existent-id')).toBeUndefined();
    });

    it('returns the full Session object for an existing ID', () => {
      const id = logger.startSession('dave', 'hotfix');
      logger.endSession('quick fix');
      const session = logger.getSession(id);
      expect(session).toBeDefined();
      expect(session?.id).toBe(id);
      expect(session?.user).toBe('dave');
      expect(session?.branch).toBe('hotfix');
      expect(session?.summary).toBe('quick fix');
      expect(session?.endedAt).not.toBeNull();
    });
  });

  // --- getSessionEvents ---

  describe('getSessionEvents', () => {
    it('returns an empty array for a session with no events', () => {
      const sessionId = logger.startSession('eve', 'main');
      logger.endSession();
      expect(logger.getSessionEvents(sessionId)).toEqual([]);
    });

    it('returns events only for the specified session', () => {
      const id1 = logger.startSession('eve', 'main');
      logger.logEvent('note', { text: 'session 1' });
      logger.endSession();

      const id2 = logger.startSession('eve', 'develop');
      logger.logEvent('note', { text: 'session 2' });
      logger.endSession();

      const events1 = logger.getSessionEvents(id1);
      expect(events1).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: length verified by toHaveLength above
      expect(JSON.parse(events1[0]!.data).text).toBe('session 1');

      const events2 = logger.getSessionEvents(id2);
      expect(events2).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: length verified by toHaveLength above
      expect(JSON.parse(events2[0]!.data).text).toBe('session 2');
    });

    it('returns events ordered by timestamp ascending', () => {
      const sessionId = logger.startSession('eve', 'main');
      logger.logEvent('note', { n: 1 });
      logger.logEvent('note', { n: 2 });
      logger.logEvent('note', { n: 3 });
      const events = logger.getSessionEvents(sessionId);
      const ns = events.map((e) => JSON.parse(e.data).n);
      expect(ns).toEqual([1, 2, 3]);
    });

    it('sets sessionId on each event', () => {
      const sessionId = logger.startSession('eve', 'main');
      logger.logEvent('command', { cmd: 'bun test' });
      const events = logger.getSessionEvents(sessionId);
      expect(events[0]?.sessionId).toBe(sessionId);
    });
  });

  // --- close ---

  describe('close', () => {
    it('closes the database without throwing', () => {
      expect(() => logger.close()).not.toThrow();
    });
  });
});
