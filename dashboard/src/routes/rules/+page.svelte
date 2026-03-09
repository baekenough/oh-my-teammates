<script lang="ts">
import { onMount } from 'svelte';
import { base } from '$app/paths';

interface Rule {
  name: string;
  priority: 'MUST' | 'SHOULD' | 'MAY';
  id: string;
  file: string;
}

let rules = $state<Rule[]>([]);
let loading = $state(true);
let error = $state('');
let filter = $state<'ALL' | 'MUST' | 'SHOULD' | 'MAY'>('ALL');

onMount(async () => {
  try {
    const res = await fetch(`${base}/data.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    rules = data.rules;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load';
  } finally {
    loading = false;
  }
});

const filtered = $derived(filter === 'ALL' ? rules : rules.filter((r) => r.priority === filter));

const mustRules = $derived(rules.filter((r) => r.priority === 'MUST'));
const shouldRules = $derived(rules.filter((r) => r.priority === 'SHOULD'));
const mayRules = $derived(rules.filter((r) => r.priority === 'MAY'));

const priorityConfig = {
  MUST: { color: '#ef4444', bg: '#fee2e2', darkBg: '#450a0a', label: 'MUST', desc: 'Enforced' },
  SHOULD: {
    color: '#f59e0b',
    bg: '#fef3c7',
    darkBg: '#451a03',
    label: 'SHOULD',
    desc: 'Recommended',
  },
  MAY: { color: '#06b6d4', bg: '#e0f2fe', darkBg: '#082f49', label: 'MAY', desc: 'Optional' },
};
</script>

<svelte:head>
	<title>Rules — oh-my-teammates</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Rules</h1>
			{#if !loading && !error}
				<span class="count">{filtered.length} / {rules.length}</span>
			{/if}
		</div>
		<div class="filter-tabs">
			{#each (['ALL', 'MUST', 'SHOULD', 'MAY'] as const) as tab}
				<button
					class="filter-tab"
					class:active={filter === tab}
					onclick={() => (filter = tab)}
				>
					{tab}
					{#if tab !== 'ALL'}
						<span class="tab-count">
							{tab === 'MUST' ? mustRules.length : tab === 'SHOULD' ? shouldRules.length : mayRules.length}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	{#if loading}
		<div class="loading">Loading...</div>
	{:else if error}
		<div class="error-box">{error}</div>
	{:else}
		{#if filter === 'ALL'}
			{#each (['MUST', 'SHOULD', 'MAY'] as const) as priority}
				{@const group = rules.filter((r) => r.priority === priority)}
				{#if group.length > 0}
					<section class="priority-group">
						<div class="group-header" style="color: {priorityConfig[priority].color}">
							<span class="group-badge" style="background: {priorityConfig[priority].color}20; color: {priorityConfig[priority].color}">
								{priority}
							</span>
							<span class="group-desc">{priorityConfig[priority].desc}</span>
							<span class="group-count">({group.length})</span>
						</div>
						<div class="rules-list">
							{#each group as rule}
								<div class="rule-card" style="border-left-color: {priorityConfig[priority].color}">
									<div class="rule-header">
										<span class="rule-name">{rule.name}</span>
										{#if rule.id}
											<span class="rule-id">{rule.id}</span>
										{/if}
									</div>
									<div class="rule-file">{rule.file}</div>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			{/each}
		{:else}
			<div class="rules-list">
				{#each filtered as rule}
					<div class="rule-card" style="border-left-color: {priorityConfig[filter].color}">
						<div class="rule-header">
							<span class="rule-name">{rule.name}</span>
							{#if rule.id}
								<span class="rule-id">{rule.id}</span>
							{/if}
						</div>
						<div class="rule-file">{rule.file}</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.page {
		max-width: 900px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 28px;
		gap: 16px;
		flex-wrap: wrap;
	}

	.page-title {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.03em;
	}

	.count {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-top: 2px;
		display: block;
	}

	.filter-tabs {
		display: flex;
		gap: 4px;
	}

	.filter-tab {
		padding: 7px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-card);
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			color 0.15s;
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.filter-tab.active {
		background: var(--primary);
		border-color: var(--primary);
		color: #fff;
	}

	.tab-count {
		font-size: 0.72rem;
		opacity: 0.7;
	}

	.loading {
		color: var(--text-muted);
	}

	.error-box {
		background: #fee2e2;
		border: 1px solid #fca5a5;
		border-radius: var(--radius);
		padding: 16px;
		color: #991b1b;
	}

	.priority-group {
		margin-bottom: 32px;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
	}

	.group-badge {
		font-size: 0.75rem;
		font-weight: 700;
		padding: 4px 10px;
		border-radius: 4px;
		letter-spacing: 0.05em;
	}

	.group-desc {
		font-size: 0.82rem;
		font-weight: 500;
	}

	.group-count {
		font-size: 0.8rem;
		opacity: 0.6;
	}

	.rules-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.rule-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-left: 3px solid;
		border-radius: var(--radius);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		box-shadow: var(--shadow);
	}

	.rule-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.rule-name {
		font-weight: 600;
		font-size: 0.9rem;
		text-transform: capitalize;
	}

	.rule-id {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.75rem;
		color: var(--text-muted);
		background: var(--bg);
		padding: 2px 7px;
		border-radius: 4px;
		border: 1px solid var(--border);
	}

	.rule-file {
		font-size: 0.7rem;
		color: var(--text-muted);
		opacity: 0.5;
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	@media (max-width: 640px) {
		.page-header {
			flex-direction: column;
		}

		.filter-tabs {
			flex-wrap: wrap;
		}
	}
</style>
