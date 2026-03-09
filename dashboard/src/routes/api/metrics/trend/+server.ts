import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { json } from '@sveltejs/kit';

const DB_PATH =
  process.env.SESSIONS_DB_PATH || resolve(process.cwd(), '..', '.claude/team/sessions.db');

interface DailyRow {
  date: string;
  sessions: number;
  events: number;
}

export async function GET({ url }: { url: URL }): Promise<Response> {
  if (!existsSync(DB_PATH)) {
    return json({ daily: [] });
  }

  const days = parseInt(url.searchParams.get('days') ?? '30', 10);

  const db = new Database(DB_PATH, { readonly: true });
  try {
    const since = `-${days} days`;

    const trendQuery = db.prepare(`
      SELECT
        DATE(s.started_at) as date,
        COUNT(DISTINCT s.id) as sessions,
        COUNT(e.id) as events
      FROM sessions s
      LEFT JOIN session_events e ON e.session_id = s.id
      WHERE s.started_at >= datetime('now', ?)
      GROUP BY DATE(s.started_at)
      ORDER BY date ASC
    `);
    const daily = trendQuery.all(since) as DailyRow[];

    return json({ daily });
  } finally {
    db.close();
  }
}
