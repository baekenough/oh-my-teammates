<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	interface StewardDomain {
		primary: string | null;
		backup: string | null;
		active: boolean;
	}

	interface Stewards {
		domains: Record<string, StewardDomain>;
		source: string;
	}

	let stewards = $state<Stewards | null>(null);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			const res = await fetch(`${base}/data.json`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			stewards = data.stewards;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	});

	const domainIcons: Record<string, string> = {
		languages: '◈',
		backend: '▣',
		frontend: '◎',
		de: '⟳',
		'db-infra': '◉',
		tooling: '◆',
		'qa-arch': '◇',
		governance: '★'
	};

	function getIcon(name: string): string {
		return domainIcons[name] ?? '◈';
	}

	const activeDomains = $derived(
		stewards
			? Object.entries(stewards.domains).filter(([, d]) => d.active)
			: []
	);

	const inactiveDomains = $derived(
		stewards
			? Object.entries(stewards.domains).filter(([, d]) => !d.active)
			: []
	);
</script>

<svelte:head>
	<title>Stewards — oh-my-teammates</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Stewards</h1>
			{#if stewards}
				<span class="subtitle">Domain stewardship assignments</span>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="loading">Loading...</div>
	{:else if error}
		<div class="error-box">{error}</div>
	{:else if stewards}
		{#if stewards.source}
			<div class="source-hint">Source: <code>{stewards.source}</code></div>
		{/if}

		{#if activeDomains.length > 0}
			<section class="section">
				<h2 class="section-title">Active Domains</h2>
				<div class="domain-grid">
					{#each activeDomains as [name, domain]}
						<div class="domain-card active">
							<div class="domain-header">
								<span class="domain-icon">{getIcon(name)}</span>
								<span class="domain-name">{name}</span>
								<span class="active-badge">Active</span>
							</div>
							<div class="domain-body">
								<div class="steward-row">
									<span class="steward-label">Primary</span>
									<span class="steward-value">{domain.primary ?? '—'}</span>
								</div>
								<div class="steward-row">
									<span class="steward-label">Backup</span>
									<span class="steward-value">{domain.backup ?? '—'}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if inactiveDomains.length > 0}
			<section class="section">
				<h2 class="section-title">Unassigned Domains</h2>
				<div class="domain-grid">
					{#each inactiveDomains as [name, domain]}
						<div class="domain-card inactive">
							<div class="domain-header">
								<span class="domain-icon">{getIcon(name)}</span>
								<span class="domain-name">{name}</span>
								<span class="inactive-badge">Unassigned</span>
							</div>
							<div class="domain-body">
								<div class="steward-row">
									<span class="steward-label">Primary</span>
									<span class="steward-value muted">{domain.primary ?? '—'}</span>
								</div>
								<div class="steward-row">
									<span class="steward-label">Backup</span>
									<span class="steward-value muted">{domain.backup ?? '—'}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if Object.keys(stewards.domains).length === 0}
			<div class="empty">
				No domains configured. Edit <code>{stewards.source || 'STEWARDS.yaml'}</code> to assign stewards.
			</div>
		{/if}
	{/if}
</div>

<style>
	.page {
		max-width: 900px;
	}

	.page-header {
		margin-bottom: 24px;
	}

	.page-title {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.03em;
	}

	.subtitle {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-top: 4px;
		display: block;
	}

	.source-hint {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-bottom: 24px;
	}

	.source-hint code {
		font-family: 'SF Mono', 'Fira Code', monospace;
		background: var(--bg-card);
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid var(--border);
	}

	.loading,
	.empty {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.empty code {
		font-family: 'SF Mono', 'Fira Code', monospace;
		background: var(--bg-card);
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid var(--border);
	}

	.error-box {
		background: #fee2e2;
		border: 1px solid #fca5a5;
		border-radius: var(--radius);
		padding: 16px;
		color: #991b1b;
	}

	.section {
		margin-bottom: 32px;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 14px;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.75rem;
	}

	.domain-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 14px;
	}

	.domain-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		box-shadow: var(--shadow);
	}

	.domain-card.active {
		border-left: 3px solid #22c55e;
	}

	.domain-card.inactive {
		opacity: 0.65;
	}

	.domain-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}

	.domain-icon {
		font-size: 1rem;
		color: var(--primary);
	}

	.domain-name {
		font-weight: 700;
		font-size: 0.9rem;
		flex: 1;
	}

	.active-badge {
		font-size: 0.68rem;
		font-weight: 600;
		padding: 2px 7px;
		background: rgba(34, 197, 94, 0.15);
		color: #16a34a;
		border-radius: 99px;
	}

	.inactive-badge {
		font-size: 0.68rem;
		font-weight: 600;
		padding: 2px 7px;
		background: rgba(100, 116, 139, 0.15);
		color: var(--text-muted);
		border-radius: 99px;
	}

	.domain-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.steward-row {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.82rem;
	}

	.steward-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		min-width: 52px;
	}

	.steward-value {
		color: var(--text);
		font-weight: 500;
	}

	.steward-value.muted {
		color: var(--text-muted);
		font-style: italic;
	}

	@media (max-width: 640px) {
		.domain-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
