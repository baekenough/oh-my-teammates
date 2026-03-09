<script lang="ts">
import { onMount } from 'svelte';
import { base } from '$app/paths';

interface Session {
  id: string;
  started_at: string;
  ended_at: string | null;
  user: string;
  branch: string;
  summary: string | null;
}

interface Event {
  id: number;
  session_id: string;
  timestamp: string;
  type: string;
  data: string;
}

let sessions = $state<Session[]>([]);
let total = $state(0);
let selectedSession = $state<Session | null>(null);
let events = $state<Event[]>([]);
let loading = $state(false);
let eventsLoading = $state(false);
let error = $state('');

// Filters
let userFilter = $state('');
let branchFilter = $state('');
let daysFilter = $state(30);

async function fetchSessions() {
  loading = true;
  error = '';
  try {
    const params = new URLSearchParams();
    if (userFilter) params.set('user', userFilter);
    if (branchFilter) params.set('branch', branchFilter);
    if (daysFilter > 0) params.set('days', String(daysFilter));
    params.set('limit', '50');

    const res = await fetch(`${base}/api/sessions?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    sessions = data.sessions ?? [];
    total = data.total ?? sessions.length;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load sessions';
    sessions = [];
    total = 0;
  } finally {
    loading = false;
  }
}

async function selectSession(session: Session) {
  if (selectedSession?.id === session.id) {
    selectedSession = null;
    events = [];
    return;
  }
  selectedSession = session;
  events = [];
  eventsLoading = true;
  try {
    const res = await fetch(`${base}/api/sessions/${session.id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    selectedSession = data.session ?? session;
    events = data.events ?? [];
  } catch {
    events = [];
  } finally {
    eventsLoading = false;
  }
}

function applyFilters() {
  selectedSession = null;
  events = [];
  fetchSessions();
}

function handleFilterKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') applyFilters();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatDuration(started: string, ended: string | null): string {
  if (!ended) return 'In progress';
  const ms = new Date(ended).getTime() - new Date(started).getTime();
  if (ms < 0) return '—';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function truncate(text: string | null, len = 80): string {
  if (!text) return '—';
  return text.length > len ? text.slice(0, len) + '…' : text;
}

const eventTypeColors: Record<string, string> = {
  file_change: '#3b82f6',
  command: '#22c55e',
  agent_spawn: '#a855f7',
  agent_start: '#a855f7',
  agent_stop: '#a855f7',
  error: '#ef4444',
  note: '#94a3b8',
};

function eventColor(type: string): string {
  return eventTypeColors[type] ?? '#94a3b8';
}

function parseEventData(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    return JSON.stringify(obj, null, 2);
  } catch {
    return raw;
  }
}

// Load on mount — runs once, not reactive to filter state
onMount(() => {
  fetchSessions();
});
</script>

<svelte:head>
	<title>Sessions — oh-my-teammates</title>
</svelte:head>

<div class="page">
	<!-- Header -->
	<div class="page-header">
		<div class="header-left">
			<h1 class="page-title">Sessions</h1>
			{#if !loading && !error}
				<span class="count-badge">{total}</span>
			{/if}
		</div>
	</div>

	<!-- Filters Bar -->
	<div class="filters-bar">
		<input
			class="filter-input"
			type="text"
			placeholder="User..."
			bind:value={userFilter}
			onkeydown={handleFilterKeydown}
		/>
		<input
			class="filter-input"
			type="text"
			placeholder="Branch..."
			bind:value={branchFilter}
			onkeydown={handleFilterKeydown}
		/>
		<select class="filter-select" bind:value={daysFilter}>
			<option value={7}>Last 7 days</option>
			<option value={14}>Last 14 days</option>
			<option value={30}>Last 30 days</option>
			<option value={90}>Last 90 days</option>
			<option value={0}>All time</option>
		</select>
		<button class="apply-btn" onclick={applyFilters} disabled={loading}>
			{loading ? 'Loading…' : 'Apply'}
		</button>
	</div>

	<!-- Content -->
	{#if loading}
		<div class="loading">Loading sessions…</div>
	{:else if error}
		<div class="error-box">
			<strong>Failed to load sessions</strong>
			<p>{error}</p>
			<p class="hint">Make sure the API server is running and the SQLite database exists.</p>
		</div>
	{:else if sessions.length === 0}
		<div class="empty-state">
			<div class="empty-icon">▣</div>
			<div class="empty-title">No sessions found</div>
			<div class="empty-sub">Try adjusting your filters or time range.</div>
		</div>
	{:else}
		<div class="card">
			<div class="table-wrap">
				<table class="sessions-table">
					<thead>
						<tr>
							<th>Date</th>
							<th>User</th>
							<th>Branch</th>
							<th>Duration</th>
							<th>Summary</th>
						</tr>
					</thead>
					<tbody>
						{#each sessions as session}
							<tr
								class="session-row"
								class:selected={selectedSession?.id === session.id}
								onclick={() => selectSession(session)}
								role="button"
								tabindex="0"
								onkeydown={(e) => e.key === 'Enter' && selectSession(session)}
							>
								<td class="cell-date">{formatDate(session.started_at)}</td>
								<td class="cell-user">{session.user || '—'}</td>
								<td class="cell-branch">
									{#if session.branch}
										<span class="branch-tag">{session.branch}</span>
									{:else}
										—
									{/if}
								</td>
								<td class="cell-duration">
									<span class:in-progress={!session.ended_at}>
										{formatDuration(session.started_at, session.ended_at)}
									</span>
								</td>
								<td class="cell-summary">{truncate(session.summary)}</td>
							</tr>

							{#if selectedSession?.id === session.id}
								<tr class="detail-row">
									<td colspan="5">
										<div class="detail-panel">
											{#if eventsLoading}
												<div class="events-loading">Loading events…</div>
											{:else if events.length === 0}
												<div class="events-empty">No events recorded for this session.</div>
											{:else}
												<div class="timeline">
													{#each events as event}
														<div class="timeline-item">
															<div
																class="timeline-dot"
																style="background: {eventColor(event.type)}"
															></div>
															<div class="timeline-content">
																<div class="event-header">
																	<span
																		class="event-type-badge"
																		style="background: {eventColor(event.type)}20; color: {eventColor(event.type)}; border-color: {eventColor(event.type)}40"
																	>
																		{event.type}
																	</span>
																	<span class="event-time">{formatDate(event.timestamp)}</span>
																</div>
																{#if event.data}
																	<pre class="event-data">{parseEventData(event.data)}</pre>
																{/if}
															</div>
														</div>
													{/each}
												</div>
											{/if}
										</div>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 1100px;
	}

	/* Header */
	.page-header {
		margin-bottom: 20px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.page-title {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--text);
	}

	.count-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--primary);
		color: #fff;
		font-size: 0.78rem;
		font-weight: 700;
		border-radius: 20px;
		padding: 2px 10px;
		min-width: 28px;
	}

	/* Filters */
	.filters-bar {
		display: flex;
		gap: 10px;
		margin-bottom: 20px;
		flex-wrap: wrap;
	}

	.filter-input {
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-card);
		color: var(--text);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.15s;
		width: 160px;
	}

	.filter-input:focus {
		border-color: var(--primary);
	}

	.filter-select {
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-card);
		color: var(--text);
		font-size: 0.875rem;
		outline: none;
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.filter-select:focus {
		border-color: var(--primary);
	}

	.apply-btn {
		padding: 8px 18px;
		background: var(--primary);
		color: #fff;
		border: none;
		border-radius: var(--radius);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.apply-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.apply-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* States */
	.loading {
		color: var(--text-muted);
		font-size: 0.9rem;
		padding: 40px 0;
	}

	.error-box {
		background: #fee2e2;
		border: 1px solid #fca5a5;
		border-radius: var(--radius);
		padding: 20px;
		color: #991b1b;
	}

	:global([data-theme='dark']) .error-box {
		background: #450a0a;
		border-color: #7f1d1d;
		color: #fca5a5;
	}

	.error-box p {
		margin-top: 8px;
		font-size: 0.85rem;
	}

	.hint {
		color: inherit;
		opacity: 0.8;
	}

	.empty-state {
		text-align: center;
		padding: 80px 20px;
		color: var(--text-muted);
	}

	.empty-icon {
		font-size: 2.5rem;
		opacity: 0.3;
		margin-bottom: 16px;
	}

	.empty-title {
		font-size: 1.1rem;
		font-weight: 600;
		margin-bottom: 8px;
		color: var(--text);
	}

	.empty-sub {
		font-size: 0.875rem;
	}

	/* Card + Table */
	.card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.table-wrap {
		overflow-x: auto;
	}

	.sessions-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.sessions-table thead tr {
		border-bottom: 1px solid var(--border);
	}

	.sessions-table th {
		text-align: left;
		padding: 12px 16px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.sessions-table td {
		padding: 12px 16px;
		color: var(--text);
		border-bottom: 1px solid var(--border);
		vertical-align: middle;
	}

	.session-row {
		cursor: pointer;
		transition: background 0.1s;
	}

	.session-row:hover {
		background: rgba(99, 102, 241, 0.05);
	}

	.session-row.selected {
		background: rgba(99, 102, 241, 0.08);
	}

	.session-row:focus {
		outline: 2px solid var(--primary);
		outline-offset: -2px;
	}

	.cell-date {
		white-space: nowrap;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.cell-user {
		font-weight: 500;
		white-space: nowrap;
	}

	.cell-branch {
		white-space: nowrap;
	}

	.branch-tag {
		display: inline-block;
		background: rgba(99, 102, 241, 0.1);
		color: var(--primary);
		border: 1px solid rgba(99, 102, 241, 0.2);
		border-radius: 4px;
		padding: 2px 8px;
		font-size: 0.78rem;
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.cell-duration {
		white-space: nowrap;
		font-size: 0.85rem;
	}

	.in-progress {
		color: #22c55e;
		font-weight: 500;
	}

	.cell-summary {
		color: var(--text-muted);
		max-width: 320px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Detail Panel */
	.detail-row td {
		padding: 0;
		border-bottom: 2px solid var(--primary);
		background: var(--bg);
	}

	.detail-panel {
		padding: 20px 24px;
	}

	.events-loading,
	.events-empty {
		color: var(--text-muted);
		font-size: 0.875rem;
		padding: 16px 0;
	}

	/* Timeline */
	.timeline {
		display: flex;
		flex-direction: column;
		gap: 0;
		position: relative;
		padding-left: 20px;
	}

	.timeline::before {
		content: '';
		position: absolute;
		left: 6px;
		top: 10px;
		bottom: 10px;
		width: 2px;
		background: var(--border);
	}

	.timeline-item {
		display: flex;
		gap: 16px;
		position: relative;
		padding-bottom: 16px;
	}

	.timeline-item:last-child {
		padding-bottom: 0;
	}

	.timeline-dot {
		position: absolute;
		left: -17px;
		top: 4px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid var(--bg);
		flex-shrink: 0;
		z-index: 1;
	}

	.timeline-content {
		flex: 1;
		min-width: 0;
	}

	.event-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 6px;
		flex-wrap: wrap;
	}

	.event-type-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		border: 1px solid;
		text-transform: lowercase;
		letter-spacing: 0.02em;
	}

	.event-time {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.event-data {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 10px 12px;
		font-size: 0.78rem;
		font-family: 'SF Mono', 'Fira Code', monospace;
		color: var(--text-muted);
		overflow-x: auto;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 160px;
		overflow-y: auto;
		margin: 0;
	}

	/* Mobile */
	@media (max-width: 768px) {
		.filter-input {
			width: 130px;
		}

		.cell-summary {
			display: none;
		}

		.sessions-table th:last-child,
		.sessions-table td:last-child {
			display: none;
		}
	}
</style>
