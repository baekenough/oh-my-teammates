import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const DB_PATH =
  process.env.SESSIONS_DB_PATH || resolve(process.cwd(), '..', '.claude/team/sessions.db');

interface EventTypeRow {
  type: string;
  count: number;
}

interface ActiveUserRow {
  user: string;
  sessionCount: number;
  totalMinutes: number;
}

interface BranchRow {
  branch: string;
  count: number;
}

interface HourRow {
  hour: number;
  count: number;
}

interface MetricsRow {
  totalSessions: number;
  uniqueUsers: number;
  avgDurationMinutes: number | null;
  totalDurationMinutes: number | null;
  errorRate: number | null;
}

export const GET: RequestHandler = async ({ url }) => {
  if (!existsSync(DB_PATH)) {
    return json({
      totalSessions: 0,
      uniqueUsers: 0,
      avgDurationMinutes: 0,
      totalDurationMinutes: 0,
      errorRate: 0,
      eventsByType: [],
      activeUsers: [],
      branchDistribution: [],
      hourlyDistribution: [],
    });
  }

  const days = parseInt(url.searchParams.get('days') ?? '30', 10);

  const db = new Database(DB_PATH, { readonly: true });
  try {
    const since = `-${days} days`;

    // Core session metrics
    const metricsQuery = db.prepare(`
      SELECT
        COUNT(*) as totalSessions,
        COUNT(DISTINCT user) as uniqueUsers,
        AVG(
          CASE
            WHEN ended_at IS NOT NULL
            THEN (JULIANDAY(ended_at) - JULIANDAY(started_at)) * 1440
          END
        ) as avgDurationMinutes,
        SUM(
          CASE
            WHEN ended_at IS NOT NULL
            THEN (JULIANDAY(ended_at) - JULIANDAY(started_at)) * 1440
          END
        ) as totalDurationMinutes,
        AVG(
          CASE
            WHEN summary LIKE '%error%' OR summary LIKE '%fail%' THEN 1.0
            ELSE 0.0
          END
        ) as errorRate
      FROM sessions
      WHERE started_at >= datetime('now', ?)
    `);
    const metrics = metricsQuery.get(since) as MetricsRow;

    // Events by type
    const eventsByTypeQuery = db.prepare(`
      SELECT e.type, COUNT(*) as count
      FROM session_events e
      JOIN sessions s ON e.session_id = s.id
      WHERE s.started_at >= datetime('now', ?)
      GROUP BY e.type
      ORDER BY count DESC
    `);
    const eventsByType = eventsByTypeQuery.all(since) as EventTypeRow[];

    // Active users
    const activeUsersQuery = db.prepare(`
      SELECT
        user,
        COUNT(*) as sessionCount,
        COALESCE(SUM(
          CASE
            WHEN ended_at IS NOT NULL
            THEN (JULIANDAY(ended_at) - JULIANDAY(started_at)) * 1440
          END
        ), 0) as totalMinutes
      FROM sessions
      WHERE started_at >= datetime('now', ?)
      GROUP BY user
      ORDER BY sessionCount DESC
    `);
    const activeUsers = activeUsersQuery.all(since) as ActiveUserRow[];

    // Branch distribution
    const branchQuery = db.prepare(`
      SELECT branch, COUNT(*) as count
      FROM sessions
      WHERE started_at >= datetime('now', ?)
      GROUP BY branch
      ORDER BY count DESC
    `);
    const branchDistribution = branchQuery.all(since) as BranchRow[];

    // Hourly distribution (hour of day 0-23)
    const hourlyQuery = db.prepare(`
      SELECT
        CAST(strftime('%H', started_at) AS INTEGER) as hour,
        COUNT(*) as count
      FROM sessions
      WHERE started_at >= datetime('now', ?)
      GROUP BY hour
      ORDER BY hour ASC
    `);
    const hourlyDistribution = hourlyQuery.all(since) as HourRow[];

    return json({
      totalSessions: metrics.totalSessions,
      uniqueUsers: metrics.uniqueUsers,
      avgDurationMinutes: Math.round((metrics.avgDurationMinutes ?? 0) * 10) / 10,
      totalDurationMinutes: Math.round((metrics.totalDurationMinutes ?? 0) * 10) / 10,
      errorRate: Math.round((metrics.errorRate ?? 0) * 1000) / 1000,
      eventsByType,
      activeUsers,
      branchDistribution,
      hourlyDistribution,
    });
  } finally {
    db.close();
  }
};
