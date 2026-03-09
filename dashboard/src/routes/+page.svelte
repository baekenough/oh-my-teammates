<script lang="ts">
import { onMount } from 'svelte';
import { base } from '$app/paths';

interface DashboardData {
  agents: unknown[];
  skills: unknown[];
  rules: unknown[];
  guides: unknown[];
  generatedAt: string;
  counts: {
    agents: number;
    skills: number;
    rules: number;
    guides: number;
  };
}

let data = $state<DashboardData | null>(null);
let loading = $state(true);
let error = $state('');

onMount(async () => {
  try {
    const res = await fetch(`${base}/data.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load data';
  } finally {
    loading = false;
  }
});

const cards = [
  { key: 'agents', label: 'Agents', icon: '◉', href: `${base}/agents`, color: '#6366f1' },
  { key: 'skills', label: 'Skills', icon: '◆', href: `${base}/skills`, color: '#22c55e' },
  { key: 'rules', label: 'Rules', icon: '◇', href: `${base}/rules`, color: '#f59e0b' },
  { key: 'guides', label: 'Guides', icon: '◎', href: `${base}/guides`, color: '#06b6d4' },
];
</script>

<svelte:head>
	<title>oh-my-teammates Dashboard</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">Dashboard</h1>
		{#if data}
			<span class="generated-at">
				Last updated: {new Date(data.generatedAt).toLocaleString()}
			</span>
		{/if}
	</div>

	{#if loading}
		<div class="loading">Loading...</div>
	{:else if error}
		<div class="error-box">
			<strong>Failed to load data.json</strong>
			<p>{error}</p>
			<p class="hint">Run <code>bun run dashboard/scripts/scan-data.ts</code> to generate data.</p>
		</div>
	{:else if data}
		<div class="summary-grid">
			{#each cards as card}
				<a href={card.href} class="summary-card" style="--accent: {card.color}">
					<div class="card-icon" style="color: {card.color}">{card.icon}</div>
					<div class="card-count">{data.counts[card.key as keyof typeof data.counts]}</div>
					<div class="card-label">{card.label}</div>
				</a>
			{/each}
		</div>

		<section class="section">
			<h2 class="section-title">About</h2>
			<div class="about-card">
				<p>
					<strong>oh-my-teammates</strong> is a team collaboration addon for oh-my-customcode. This
					dashboard provides an overview of all agents, skills, rules, and guides in the project.
				</p>
			</div>
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 900px;
	}

	.page-header {
		margin-bottom: 32px;
		display: flex;
		align-items: baseline;
		gap: 16px;
		flex-wrap: wrap;
	}

	.page-title {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--text);
	}

	.generated-at {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.loading {
		color: var(--text-muted);
		font-size: 0.9rem;
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

	.hint code {
		background: rgba(0, 0, 0, 0.1);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 0.8rem;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 16px;
		margin-bottom: 40px;
	}

	.summary-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 28px 20px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text);
		transition:
			transform 0.15s,
			box-shadow 0.15s,
			border-color 0.15s;
		gap: 8px;
		box-shadow: var(--shadow);
	}

	.summary-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		border-color: var(--accent);
	}

	.card-icon {
		font-size: 1.6rem;
	}

	.card-count {
		font-size: 2.2rem;
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
	}

	.card-label {
		font-size: 0.8rem;
		color: var(--text-muted);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.section {
		margin-top: 32px;
	}

	.section-title {
		font-size: 1.1rem;
		font-weight: 600;
		margin-bottom: 16px;
		color: var(--text);
	}

	.about-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		line-height: 1.6;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.about-card strong {
		color: var(--primary);
	}

	@media (max-width: 480px) {
		.summary-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
