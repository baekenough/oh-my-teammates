<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	interface Agent {
		name: string;
		description: string;
		model: string;
		tools: string[];
		skills: string[];
		memory?: string;
		effort?: string;
		file: string;
	}

	let agents = $state<Agent[]>([]);
	let loading = $state(true);
	let error = $state('');
	let search = $state('');

	onMount(async () => {
		try {
			const res = await fetch(`${base}/data.json`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			agents = data.agents;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	});

	const filtered = $derived(
		agents.filter(
			(a) =>
				!search ||
				a.name.includes(search) ||
				a.description.toLowerCase().includes(search.toLowerCase())
		)
	);

	const modelColors: Record<string, string> = {
		opus: '#8b5cf6',
		sonnet: '#6366f1',
		haiku: '#06b6d4'
	};

	function modelColor(model: string): string {
		return modelColors[model] ?? '#64748b';
	}
</script>

<svelte:head>
	<title>Agents — oh-my-teammates</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Agents</h1>
			{#if !loading && !error}
				<span class="count">{filtered.length} / {agents.length}</span>
			{/if}
		</div>
		<input
			class="search-input"
			type="search"
			placeholder="Search agents..."
			bind:value={search}
		/>
	</div>

	{#if loading}
		<div class="loading">Loading...</div>
	{:else if error}
		<div class="error-box">{error}</div>
	{:else}
		<div class="agent-grid">
			{#each filtered as agent}
				<div class="agent-card">
					<div class="agent-header">
						<span class="agent-name">{agent.name}</span>
						<span class="model-badge" style="background: {modelColor(agent.model)}20; color: {modelColor(agent.model)}">
							{agent.model}
						</span>
					</div>
					{#if agent.description}
						<p class="agent-desc">{agent.description}</p>
					{/if}
					<div class="agent-meta">
						{#if agent.tools?.length}
							<div class="meta-row">
								<span class="meta-label">Tools</span>
								<div class="tag-list">
									{#each agent.tools as tool}
										<span class="tag">{tool}</span>
									{/each}
								</div>
							</div>
						{/if}
						{#if agent.skills?.length}
							<div class="meta-row">
								<span class="meta-label">Skills</span>
								<div class="tag-list">
									{#each agent.skills as skill}
										<span class="tag tag-skill">{skill}</span>
									{/each}
								</div>
							</div>
						{/if}
						{#if agent.memory}
							<div class="meta-row">
								<span class="meta-label">Memory</span>
								<span class="tag">{agent.memory}</span>
							</div>
						{/if}
					</div>
					<div class="agent-file">{agent.file}</div>
				</div>
			{/each}
		</div>
		{#if filtered.length === 0}
			<div class="empty">No agents found matching "{search}"</div>
		{/if}
	{/if}
</div>

<style>
	.page {
		max-width: 1100px;
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

	.search-input {
		padding: 8px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-card);
		color: var(--text);
		font-size: 0.88rem;
		width: 240px;
		outline: none;
		transition: border-color 0.15s;
	}

	.search-input:focus {
		border-color: var(--primary);
	}

	.loading,
	.empty {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.error-box {
		background: #fee2e2;
		border: 1px solid #fca5a5;
		border-radius: var(--radius);
		padding: 16px;
		color: #991b1b;
		font-size: 0.88rem;
	}

	.agent-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 16px;
	}

	.agent-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		box-shadow: var(--shadow);
		transition: border-color 0.15s;
	}

	.agent-card:hover {
		border-color: var(--primary);
	}

	.agent-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.agent-name {
		font-weight: 700;
		font-size: 0.92rem;
		font-family: 'SF Mono', 'Fira Code', monospace;
		color: var(--primary);
	}

	.model-badge {
		font-size: 0.72rem;
		font-weight: 600;
		padding: 3px 8px;
		border-radius: 99px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.agent-desc {
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.agent-meta {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.meta-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.meta-label {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		min-width: 44px;
		padding-top: 3px;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.tag {
		font-size: 0.72rem;
		padding: 2px 7px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-muted);
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.tag-skill {
		background: rgba(99, 102, 241, 0.1);
		border-color: rgba(99, 102, 241, 0.3);
		color: var(--primary);
	}

	.agent-file {
		font-size: 0.7rem;
		color: var(--text-muted);
		opacity: 0.5;
		font-family: 'SF Mono', 'Fira Code', monospace;
		margin-top: auto;
	}

	@media (max-width: 640px) {
		.agent-grid {
			grid-template-columns: 1fr;
		}

		.search-input {
			width: 100%;
		}

		.page-header {
			flex-direction: column;
		}
	}
</style>
