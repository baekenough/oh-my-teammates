<script lang="ts">
import { onMount } from 'svelte';
import { base } from '$app/paths';

// --- Types ---
interface EventByType {
  type: string;
  count: number;
}

interface ActiveUser {
  user: string;
  sessionCount: number;
  totalMinutes: number;
}

interface BranchEntry {
  branch: string;
  count: number;
}

interface HourEntry {
  hour: number;
  count: number;
}

interface MetricsSummary {
  totalSessions: number;
  uniqueUsers: number;
  avgDurationMinutes: number;
  totalDurationMinutes: number;
  errorRate: number;
  eventsByType: EventByType[];
  activeUsers: ActiveUser[];
  branchDistribution: BranchEntry[];
  hourlyDistribution: HourEntry[];
}

interface DailyEntry {
  date: string;
  sessions: number;
  events: number;
}

interface MetricsTrend {
  daily: DailyEntry[];
}

// --- State ---
let days = $state(30);
let summary = $state<MetricsSummary | null>(null);
let trend = $state<MetricsTrend | null>(null);
let loading = $state(true);
let error = $state('');

const dayOptions = [7, 14, 30, 90];

// --- Derived ---
let maxDailySessions = $derived(trend ? Math.max(...trend.daily.map((d) => d.sessions), 1) : 1);

let sortedEvents = $derived(
  summary ? [...summary.eventsByType].sort((a, b) => b.count - a.count) : [],
);

let maxEventCount = $derived(sortedEvents.length > 0 ? sortedEvents[0].count : 1);

let sortedUsers = $derived(
  summary ? [...summary.activeUsers].sort((a, b) => b.sessionCount - a.sessionCount) : [],
);

let totalBranchCount = $derived(
  summary ? summary.branchDistribution.reduce((s, b) => s + b.count, 0) : 1,
);

let hourlyMap = $derived(
  summary
    ? Object.fromEntries(summary.hourlyDistribution.map((h) => [h.hour, h.count]))
    : ({} as Record<number, number>),
);

let maxHourlyCount = $derived(
  summary ? Math.max(...summary.hourlyDistribution.map((h) => h.count), 1) : 1,
);

// --- Helpers ---
function formatDuration(minutes: number): string {
  if (!minutes || minutes < 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function heatColor(count: number, max: number): string {
  if (!count || max === 0) return 'transparent';
  const intensity = Math.min(count / max, 1);
  // green gradient: low → rgba(34,197,94,0.15), high → rgba(34,197,94,0.9)
  return `rgba(34, 197, 94, ${0.1 + intensity * 0.8})`;
}

function eventColor(index: number): string {
  const colors = [
    '#6366f1',
    '#22c55e',
    '#f59e0b',
    '#06b6d4',
    '#ec4899',
    '#8b5cf6',
    '#f97316',
    '#14b8a6',
  ];
  return colors[index % colors.length];
}

// --- Fetch ---
async function fetchData() {
  loading = true;
  error = '';
  try {
    const [sumRes, trendRes] = await Promise.all([
      fetch(`${base}/api/metrics/summary?days=${days}`),
      fetch(`${base}/api/metrics/trend?days=${days}`),
    ]);

    if (!sumRes.ok) throw new Error(`Summary API: HTTP ${sumRes.status}`);
    if (!trendRes.ok) throw new Error(`Trend API: HTTP ${trendRes.status}`);

    summary = await sumRes.json();
    trend = await trendRes.json();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load metrics';
    summary = null;
    trend = null;
  } finally {
    loading = false;
  }
}

onMount(() => {
  fetchData();
});

$effect(() => {
  // Re-fetch when days changes (after initial mount)
  if (days) fetchData();
});
</script>

<svelte:head>
	<title>Metrics — oh-my-teammates</title>
</svelte:head>

<div class="page">
	<!-- Header -->
	<div class="page-header">
		<h1 class="page-title">Metrics</h1>
		<div class="day-selector">
			{#each dayOptions as d}
				<button
					class="day-btn"
					class:active={days === d}
					onclick={() => (days = d)}
				>
					{d}d
				</button>
			{/each}
		</div>
	</div>

	{#if loading}
		<div class="loading">Loading metrics...</div>
	{:else if error}
		<div class="error-box">
			<strong>Failed to load metrics</strong>
			<p>{error}</p>
		</div>
	{:else if summary && trend}
		<!-- KPI Cards -->
		<div class="kpi-grid">
			<!-- Total Sessions -->
			<div class="kpi-card">
				<div class="kpi-label">Total Sessions</div>
				<div class="kpi-value">{summary.totalSessions.toLocaleString()}</div>
				<div class="kpi-sparkline">
					{#each trend.daily.slice(-14) as day}
						<div
							class="spark-bar"
							style="height: {maxDailySessions > 0 ? (day.sessions / maxDailySessions) * 100 : 0}%"
						></div>
					{/each}
				</div>
			</div>

			<!-- Active Users -->
			<div class="kpi-card">
				<div class="kpi-label">Active Users</div>
				<div class="kpi-value">{summary.uniqueUsers.toLocaleString()}</div>
				<div class="kpi-sub">unique this period</div>
			</div>

			<!-- Avg Duration -->
			<div class="kpi-card">
				<div class="kpi-label">Avg Duration</div>
				<div class="kpi-value">{formatDuration(summary.avgDurationMinutes)}</div>
				<div class="kpi-sub">total: {formatDuration(summary.totalDurationMinutes)}</div>
			</div>

			<!-- Error Rate -->
			<div class="kpi-card">
				<div class="kpi-label">Error Rate</div>
				<div class="kpi-value" class:kpi-error={summary.errorRate > 0.1}>
					{(summary.errorRate * 100).toFixed(1)}%
				</div>
				<div class="kpi-sub">{summary.errorRate > 0.1 ? 'above threshold' : 'within range'}</div>
			</div>
		</div>

		<!-- Daily Trend Chart -->
		<section class="section">
			<h2 class="section-title">Daily Session Trend</h2>
			<div class="chart-card">
				{#if trend.daily.length === 0}
					<div class="empty">No trend data available</div>
				{:else}
					<div class="bar-chart">
						{#each trend.daily as day}
							<div class="bar-col">
								<div class="bar-track">
									<div
										class="bar-fill"
										style="height: {maxDailySessions > 0
											? (day.sessions / maxDailySessions) * 100
											: 0}%"
										title="{day.date}: {day.sessions} sessions, {day.events} events"
									></div>
								</div>
								<span class="bar-label">{formatDate(day.date)}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		<!-- Event Distribution -->
		<section class="section">
			<h2 class="section-title">Event Distribution</h2>
			<div class="chart-card">
				{#if sortedEvents.length === 0}
					<div class="empty">No event data available</div>
				{:else}
					<div class="horiz-bars">
						{#each sortedEvents as evt, i}
							<div class="horiz-row">
								<span class="horiz-label">{evt.type}</span>
								<div class="horiz-track">
									<div
										class="horiz-fill"
										style="width: {(evt.count / maxEventCount) * 100}%; background: {eventColor(i)}"
									></div>
								</div>
								<span class="horiz-count">{evt.count.toLocaleString()}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		<!-- User Activity Table -->
		<section class="section">
			<h2 class="section-title">User Activity</h2>
			<div class="chart-card table-card">
				{#if sortedUsers.length === 0}
					<div class="empty">No user activity data</div>
				{:else}
					<table class="activity-table">
						<thead>
							<tr>
								<th>User</th>
								<th class="num">Sessions</th>
								<th class="num">Total Time</th>
								<th class="num">Avg Session</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedUsers as user}
								<tr>
									<td class="user-name">{user.user}</td>
									<td class="num">{user.sessionCount}</td>
									<td class="num">{formatDuration(user.totalMinutes)}</td>
									<td class="num">
										{formatDuration(
											user.sessionCount > 0 ? user.totalMinutes / user.sessionCount : 0
										)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</section>

		<!-- Branch Distribution -->
		<section class="section">
			<h2 class="section-title">Branch Distribution</h2>
			<div class="chart-card">
				{#if summary.branchDistribution.length === 0}
					<div class="empty">No branch data available</div>
				{:else}
					<div class="horiz-bars">
						{#each summary.branchDistribution as b}
							{@const pct = totalBranchCount > 0 ? (b.count / totalBranchCount) * 100 : 0}
							<div class="horiz-row">
								<span class="horiz-label branch-label">{b.branch}</span>
								<div class="horiz-track">
									<div
										class="horiz-fill branch-fill"
										style="width: {pct}%"
									></div>
								</div>
								<span class="horiz-count">{b.count} <span class="pct">({pct.toFixed(0)}%)</span></span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		<!-- Hourly Heatmap -->
		<section class="section">
			<h2 class="section-title">Peak Hours</h2>
			<div class="chart-card">
				<div class="heatmap">
					{#each Array.from({ length: 24 }, (_, i) => i) as hour}
						{@const count = hourlyMap[hour] ?? 0}
						<div
							class="heat-cell"
							style="background: {heatColor(count, maxHourlyCount)}"
							title="{hour}:00 — {count} sessions"
						>
							<span class="heat-hour">{hour}</span>
							{#if count > 0}
								<span class="heat-count">{count}</span>
							{/if}
						</div>
					{/each}
				</div>
				<div class="heatmap-legend">
					<span class="legend-label">Low</span>
					<div class="legend-bar"></div>
					<span class="legend-label">High</span>
				</div>
			</div>
		</section>
	{:else}
		<div class="empty-state">No metrics data available for this period.</div>
	{/if}
</div>

<style>
	.page {
		max-width: 1000px;
	}

	/* Header */
	.page-header {
		margin-bottom: 32px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
	}

	.page-title {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--text);
	}

	.day-selector {
		display: flex;
		gap: 6px;
	}

	.day-btn {
		padding: 6px 14px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--bg-card);
		color: var(--text-muted);
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.day-btn:hover {
		border-color: var(--primary);
		color: var(--primary);
	}

	.day-btn.active {
		background: var(--primary);
		border-color: var(--primary);
		color: #fff;
	}

	/* Status */
	.loading {
		color: var(--text-muted);
		font-size: 0.9rem;
		padding: 40px 0;
		text-align: center;
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

	.empty-state,
	.empty {
		color: var(--text-muted);
		font-size: 0.88rem;
		padding: 24px 0;
		text-align: center;
	}

	/* KPI Grid */
	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
		margin-bottom: 36px;
	}

	.kpi-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px 20px 16px;
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.kpi-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.kpi-value {
		font-size: 2rem;
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1.1;
		color: var(--text);
	}

	.kpi-error {
		color: #ef4444;
	}

	.kpi-sub {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-top: 2px;
	}

	/* Sparkline */
	.kpi-sparkline {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 32px;
		margin-top: 8px;
	}

	.spark-bar {
		flex: 1;
		background: var(--primary);
		opacity: 0.6;
		border-radius: 2px 2px 0 0;
		min-height: 2px;
	}

	/* Section */
	.section {
		margin-bottom: 28px;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
		margin-bottom: 12px;
	}

	.chart-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		box-shadow: var(--shadow);
	}

	/* Vertical bar chart */
	.bar-chart {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		height: 160px;
		overflow-x: auto;
		padding-bottom: 4px;
	}

	.bar-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: 1;
		min-width: 24px;
		height: 100%;
	}

	.bar-track {
		flex: 1;
		width: 100%;
		display: flex;
		align-items: flex-end;
	}

	.bar-fill {
		width: 100%;
		background: var(--primary);
		opacity: 0.8;
		border-radius: 3px 3px 0 0;
		min-height: 2px;
		transition: height 0.3s ease;
	}

	.bar-fill:hover {
		opacity: 1;
	}

	.bar-label {
		font-size: 0.65rem;
		color: var(--text-muted);
		margin-top: 4px;
		white-space: nowrap;
		transform: rotate(-45deg);
		transform-origin: top center;
		display: block;
	}

	/* Horizontal bars */
	.horiz-bars {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.horiz-row {
		display: grid;
		grid-template-columns: 140px 1fr 70px;
		align-items: center;
		gap: 12px;
	}

	.horiz-label {
		font-size: 0.82rem;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.horiz-track {
		height: 10px;
		background: var(--border);
		border-radius: 5px;
		overflow: hidden;
	}

	.horiz-fill {
		height: 100%;
		border-radius: 5px;
		transition: width 0.3s ease;
	}

	.horiz-count {
		font-size: 0.8rem;
		color: var(--text-muted);
		text-align: right;
		white-space: nowrap;
	}

	.branch-label {
		font-family: monospace;
		font-size: 0.8rem;
	}

	.branch-fill {
		background: var(--primary);
		opacity: 0.75;
	}

	.pct {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	/* Table */
	.table-card {
		padding: 0;
		overflow: auto;
	}

	.activity-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.activity-table th {
		padding: 12px 16px;
		text-align: left;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
		background: var(--bg-card);
	}

	.activity-table td {
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
		color: var(--text);
	}

	.activity-table tr:last-child td {
		border-bottom: none;
	}

	.activity-table tr:hover td {
		background: rgba(99, 102, 241, 0.04);
	}

	.activity-table .num {
		text-align: right;
	}

	.user-name {
		font-weight: 500;
		font-family: monospace;
		font-size: 0.82rem;
	}

	/* Heatmap */
	.heatmap {
		display: grid;
		grid-template-columns: repeat(12, 1fr);
		gap: 6px;
	}

	.heat-cell {
		aspect-ratio: 1;
		border-radius: 6px;
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		cursor: default;
		transition: transform 0.1s;
	}

	.heat-cell:hover {
		transform: scale(1.1);
		z-index: 1;
	}

	.heat-hour {
		font-size: 0.65rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.heat-count {
		font-size: 0.6rem;
		color: var(--text);
		font-weight: 700;
	}

	.heatmap-legend {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
	}

	.legend-label {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.legend-bar {
		flex: 1;
		height: 8px;
		border-radius: 4px;
		background: linear-gradient(to right, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.9));
		max-width: 200px;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.kpi-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.horiz-row {
			grid-template-columns: 100px 1fr 54px;
			gap: 8px;
		}

		.heatmap {
			grid-template-columns: repeat(8, 1fr);
		}
	}

	@media (max-width: 480px) {
		.kpi-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.heatmap {
			grid-template-columns: repeat(6, 1fr);
		}

		.bar-label {
			display: none;
		}
	}
</style>
