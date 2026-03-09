import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { error, json } from '@sveltejs/kit';

const DB_PATH =
  process.env.SESSIONS_DB_PATH || resolve(process.cwd(), '..', '.claude/team/sessions.db');

interface Session {
  id: string;
  started_at: string;
  ended_at: string | null;
  user: string;
  branch: string;
  summary: string | null;
}

interface SessionEvent {
  id: number;
  session_id: string;
  timestamp: string;
  type: string;
  data: string;
}

export async function GET({ params }: { params: Record<string, string> }): Promise<Response> {
  const id = params.id;

  if (!id) {
    throw error(400, 'Missing session id');
  }

  if (!existsSync(DB_PATH)) {
    throw error(404, 'Session not found');
  }

  const db = new Database(DB_PATH, { readonly: true });
  try {
    const sessionQuery = db.prepare(
      `SELECT id, started_at, ended_at, user, branch, summary
       FROM sessions
       WHERE id = ?`,
    );
    const session = sessionQuery.get(id) as Session | null;

    if (!session) {
      throw error(404, 'Session not found');
    }

    const eventsQuery = db.prepare(
      `SELECT id, session_id, timestamp, type, data
       FROM session_events
       WHERE session_id = ?
       ORDER BY timestamp ASC`,
    );
    const events = eventsQuery.all(id) as SessionEvent[];

    return json({ session, events });
  } finally {
    db.close();
  }
}
