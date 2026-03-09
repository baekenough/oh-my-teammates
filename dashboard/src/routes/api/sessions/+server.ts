import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

export const GET: RequestHandler = async ({ url }) => {
  if (!existsSync(DB_PATH)) {
    return json({ sessions: [], total: 0 });
  }

  const db = new Database(DB_PATH, { readonly: true });
  try {
    const user = url.searchParams.get('user');
    const branch = url.searchParams.get('branch');
    const days = url.searchParams.get('days');
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (user) {
      conditions.push('user = ?');
      params.push(user);
    }

    if (branch) {
      conditions.push('branch = ?');
      params.push(branch);
    }

    if (days) {
      const daysNum = parseInt(days, 10);
      if (!isNaN(daysNum)) {
        conditions.push("started_at >= datetime('now', ?|| ' days')");
        params.push(-daysNum);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = db.prepare(`SELECT COUNT(*) as count FROM sessions ${where}`);
    const countRow = countQuery.get(...params) as { count: number };
    const total = countRow.count;

    const dataParams = [...params, limit];
    const dataQuery = db.prepare(
      `SELECT id, started_at, ended_at, user, branch, summary
       FROM sessions
       ${where}
       ORDER BY started_at DESC
       LIMIT ?`,
    );
    const sessions = dataQuery.all(...dataParams) as Session[];

    return json({ sessions, total });
  } finally {
    db.close();
  }
};
