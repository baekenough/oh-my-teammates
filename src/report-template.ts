/**
 * HTML report template generator for oh-my-teammates
 * Produces a self-contained, inline-CSS HTML report (no external resources)
 */

export interface ReportData {
  generatedAt: string;
  teamName: string;
  version: string;
  memberCount: number;
  domainCount: number;
  members: Array<{ github: string; name: string; role: string; domains: string[] }>;
  domains: Record<string, { primary: string; backup: string | null; paths: string[] }>;
  sessionStats: {
    totalSessions: number;
    uniqueUsers: number;
    avgDurationMinutes: number;
    totalDurationMinutes: number;
  } | null;
  eventStats: Array<{ type: string; count: number }> | null;
  userActivity: Array<{ user: string; sessionCount: number; totalMinutes: number }> | null;
  branchDistribution: Array<{ branch: string; count: number }> | null;
  recentSessions: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    user: string;
    branch: string;
    summary: string | null;
  }>;
  todos: {
    total: number;
    completed: number;
    pending: number;
    byPriority: Record<string, number>;
  } | null;
  coverageGaps: string[];
}

/** Escape HTML special characters to prevent XSS in generated markup */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format minutes as "Xh Ym" */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) {
    return `${m}m`;
  }
  return `${h}h ${m}m`;
}

/** Format an ISO 8601 string as "YYYY-MM-DD HH:mm" */
function formatDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #f8f9fa;
    --surface: #ffffff;
    --border: #e2e8f0;
    --shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
    --text: #1a202c;
    --text-muted: #718096;
    --accent: #4f46e5;
    --accent-light: #eef2ff;
    --success: #059669;
    --success-light: #ecfdf5;
    --warning: #d97706;
    --warning-light: #fffbeb;
    --danger: #dc2626;
    --danger-light: #fef2f2;
    --radius: 8px;
    --font: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --border: #334155;
      --shadow: 0 1px 3px rgba(0,0,0,.4);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #818cf8;
      --accent-light: #1e1b4b;
      --success-light: #064e3b;
      --warning-light: #451a03;
      --danger-light: #450a0a;
    }
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.6;
    padding: 24px 16px 48px;
  }

  .container { max-width: 1100px; margin: 0 auto; }

  /* Header */
  .report-header {
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 2px solid var(--border);
  }
  .report-header h1 { font-size: 28px; font-weight: 700; color: var(--text); }
  .report-header .subtitle { color: var(--text-muted); margin-top: 4px; font-size: 13px; }
  .stat-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-top: 20px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .stat-card .value { font-size: 26px; font-weight: 700; color: var(--accent); }
  .stat-card .label { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

  /* Sections */
  section { margin-bottom: 36px; }
  section h2 {
    font-size: 17px;
    font-weight: 600;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
  }

  /* Tables */
  .table-wrap { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    font-size: 13px;
  }
  th {
    background: var(--bg);
    font-weight: 600;
    text-align: left;
    padding: 10px 14px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 9px 14px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--accent-light); }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-primary { background: var(--accent-light); color: var(--accent); }
  .badge-success { background: var(--success-light); color: var(--success); }
  .badge-warning { background: var(--warning-light); color: var(--warning); }
  .badge-danger  { background: var(--danger-light);  color: var(--danger); }

  /* Domain tags */
  .domain-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .domain-tag {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 11px;
    color: var(--text-muted);
  }

  /* Fallback */
  .fallback {
    color: var(--text-muted);
    font-style: italic;
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  /* Coverage gaps */
  .gap-list { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
  .gap-list li {
    background: var(--danger-light);
    color: var(--danger);
    border-radius: var(--radius);
    padding: 4px 12px;
    font-size: 13px;
    font-weight: 500;
  }
  .all-covered {
    color: var(--success);
    background: var(--success-light);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 16px;
    font-weight: 500;
  }

  /* Footer */
  footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
  }

  @media (max-width: 600px) {
    body { padding: 16px 10px 32px; }
    .stat-cards { grid-template-columns: repeat(2, 1fr); }
    .report-header h1 { font-size: 22px; }
  }
`;

function renderMembersTable(data: ReportData): string {
  const rows = data.members
    .map(
      (m) => `
      <tr>
        <td><code>${escapeHtml(m.github)}</code></td>
        <td>${escapeHtml(m.name)}</td>
        <td><span class="badge badge-primary">${escapeHtml(m.role)}</span></td>
        <td><div class="domain-tags">${m.domains.map((d) => `<span class="domain-tag">${escapeHtml(d)}</span>`).join('')}</div></td>
      </tr>`,
    )
    .join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>GitHub</th><th>Name</th><th>Role</th><th>Domains</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderDomainsTable(data: ReportData): string {
  const rows = Object.entries(data.domains)
    .map(([domain, info]) => {
      const backup = info.backup
        ? `<code>${escapeHtml(info.backup)}</code>`
        : `<span class="badge badge-warning">None</span>`;
      return `
      <tr>
        <td><strong>${escapeHtml(domain)}</strong></td>
        <td><code>${escapeHtml(info.primary)}</code></td>
        <td>${backup}</td>
        <td>${info.paths.length}</td>
      </tr>`;
    })
    .join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Domain</th><th>Primary Steward</th><th>Backup Steward</th><th>Paths</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderSessionActivity(data: ReportData): string {
  if (data.sessionStats === null) {
    return '<p class="fallback">No session data available.</p>';
  }

  const s = data.sessionStats;
  const statCards = `
    <div class="stat-cards" style="margin-bottom:16px">
      <div class="stat-card"><div class="value">${s.totalSessions}</div><div class="label">Total Sessions</div></div>
      <div class="stat-card"><div class="value">${s.uniqueUsers}</div><div class="label">Unique Users</div></div>
      <div class="stat-card"><div class="value">${formatDuration(s.avgDurationMinutes)}</div><div class="label">Avg Duration</div></div>
      <div class="stat-card"><div class="value">${formatDuration(s.totalDurationMinutes)}</div><div class="label">Total Duration</div></div>
    </div>`;

  return statCards;
}

function renderUserActivity(data: ReportData): string {
  if (data.userActivity === null || data.userActivity.length === 0) {
    return '<p class="fallback">No user activity data available.</p>';
  }

  const rows = data.userActivity
    .map(
      (u) => `
      <tr>
        <td><code>${escapeHtml(u.user)}</code></td>
        <td>${u.sessionCount}</td>
        <td>${formatDuration(u.totalMinutes)}</td>
      </tr>`,
    )
    .join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>User</th><th>Sessions</th><th>Total Time</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderBranchDistribution(data: ReportData): string {
  if (data.branchDistribution === null || data.branchDistribution.length === 0) {
    return '<p class="fallback">No branch distribution data available.</p>';
  }

  const rows = data.branchDistribution
    .map(
      (b) => `
      <tr>
        <td><code>${escapeHtml(b.branch)}</code></td>
        <td>${b.count}</td>
      </tr>`,
    )
    .join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Branch</th><th>Sessions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderEventStats(data: ReportData): string {
  if (data.eventStats === null || data.eventStats.length === 0) {
    return '<p class="fallback">No event statistics available.</p>';
  }

  const rows = data.eventStats
    .map(
      (e) => `
      <tr>
        <td><span class="badge badge-primary">${escapeHtml(e.type)}</span></td>
        <td>${e.count}</td>
      </tr>`,
    )
    .join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Event Type</th><th>Count</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderRecentSessions(data: ReportData): string {
  const sessions = data.recentSessions.slice(0, 20);
  if (sessions.length === 0) {
    return '<p class="fallback">No recent sessions.</p>';
  }

  const rows = sessions
    .map((s) => {
      const summary =
        s.summary !== null && s.summary.length > 80
          ? `${escapeHtml(s.summary.slice(0, 80))}…`
          : escapeHtml(s.summary ?? '—');
      const endedAt = s.endedAt !== null ? formatDate(s.endedAt) : '—';
      return `
      <tr>
        <td><code style="font-size:11px">${escapeHtml(s.id)}</code></td>
        <td>${formatDate(s.startedAt)}</td>
        <td>${endedAt}</td>
        <td><code>${escapeHtml(s.user)}</code></td>
        <td><code>${escapeHtml(s.branch)}</code></td>
        <td>${summary}</td>
      </tr>`;
    })
    .join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Started</th><th>Ended</th><th>User</th><th>Branch</th><th>Summary</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderTodos(data: ReportData): string {
  if (data.todos === null) {
    return '<p class="fallback">No TODO data available.</p>';
  }

  const t = data.todos;
  const completionPct = t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0;
  const statCards = `
    <div class="stat-cards" style="margin-bottom:16px">
      <div class="stat-card"><div class="value">${t.total}</div><div class="label">Total</div></div>
      <div class="stat-card"><div class="value">${t.pending}</div><div class="label">Pending</div></div>
      <div class="stat-card"><div class="value">${t.completed}</div><div class="label">Completed</div></div>
      <div class="stat-card"><div class="value">${completionPct}%</div><div class="label">Completion</div></div>
    </div>`;

  const priorityRows = Object.entries(t.byPriority)
    .map(
      ([priority, count]) => `
      <tr>
        <td><span class="badge badge-warning">${escapeHtml(priority)}</span></td>
        <td>${count}</td>
      </tr>`,
    )
    .join('');

  const priorityTable =
    priorityRows.length > 0
      ? `<div class="table-wrap">
           <table>
             <thead><tr><th>Priority</th><th>Count</th></tr></thead>
             <tbody>${priorityRows}</tbody>
           </table>
         </div>`
      : '';

  return statCards + priorityTable;
}

function renderCoverageGaps(data: ReportData): string {
  if (data.coverageGaps.length === 0) {
    return '<p class="all-covered">All domains have backup stewards.</p>';
  }

  const items = data.coverageGaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join('');

  return `<ul class="gap-list">${items}</ul>`;
}

/** Generate a complete, self-contained HTML report from ReportData */
export function generateReportHtml(data: ReportData): string {
  const title = escapeHtml(`${data.teamName} — Team Report`);
  const generatedAt = formatDate(data.generatedAt);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">

    <header class="report-header">
      <h1>${escapeHtml(data.teamName)}</h1>
      <p class="subtitle">Team Report &mdash; generated ${generatedAt}</p>
      <div class="stat-cards">
        <div class="stat-card"><div class="value">${data.memberCount}</div><div class="label">Team Members</div></div>
        <div class="stat-card"><div class="value">${data.domainCount}</div><div class="label">Domains</div></div>
      </div>
    </header>

    <section>
      <h2>Team Members</h2>
      ${renderMembersTable(data)}
    </section>

    <section>
      <h2>Domain Ownership Matrix</h2>
      ${renderDomainsTable(data)}
    </section>

    <section>
      <h2>Session Activity</h2>
      ${renderSessionActivity(data)}
    </section>

    <section>
      <h2>User Activity</h2>
      ${renderUserActivity(data)}
    </section>

    <section>
      <h2>Branch Distribution</h2>
      ${renderBranchDistribution(data)}
    </section>

    <section>
      <h2>Event Statistics</h2>
      ${renderEventStats(data)}
    </section>

    <section>
      <h2>Recent Sessions</h2>
      ${renderRecentSessions(data)}
    </section>

    <section>
      <h2>TODO Status</h2>
      ${renderTodos(data)}
    </section>

    <section>
      <h2>Coverage Gaps</h2>
      ${renderCoverageGaps(data)}
    </section>

    <footer>
      Generated by oh-my-teammates v${data.version} &bull; ${generatedAt}
    </footer>

  </div>
</body>
</html>`;
}
