<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	interface Skill {
		name: string;
		file: string;
	}

	interface Agent {
		name: string;
		skills: string[];
	}

	let skills = $state<Skill[]>([]);
	let agents = $state<Agent[]>([]);
	let loading = $state(true);
	let error = $state('');
	let search = $state('');

	onMount(async () => {
		try {
			const res = await fetch(`${base}/data.json`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			skills = data.skills;
			agents = data.agents;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	});

	function agentsForSkill(skillName: string): string[] {
		return agents.filter((a) => a.skills?.includes(skillName)).map((a) => a.name);
	}

	const filtered = $derived(
		skills.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()))
	);
</script>

<svelte:head>
	<title>Skills — oh-my-teammates</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Skills</h1>
			{#if !loading && !error}
				<span class="count">{filtered.length} / {skills.length}</span>
			{/if}
		</div>
		<input
			class="search-input"
			type="search"
			placeholder="Search skills..."
			bind:value={search}
		/>
	</div>

	{#if loading}
		<div class="loading">Loading...</div>
	{:else if error}
		<div class="error-box">{error}</div>
	{:else}
		<div class="skill-grid">
			{#each filtered as skill}
				{@const usedBy = agentsForSkill(skill.name)}
				<div class="skill-card">
					<div class="skill-name">{skill.name}</div>
					{#if usedBy.length > 0}
						<div class="used-by">
							<span class="meta-label">Used by</span>
							<div class="agent-list">
								{#each usedBy as agent}
									<span class="agent-tag">{agent}</span>
								{/each}
							</div>
						</div>
					{:else}
						<div class="no-agents">Not used by any agent</div>
					{/if}
					<div class="skill-file">{skill.file}</div>
				</div>
			{/each}
		</div>
		{#if filtered.length === 0}
			<div class="empty">No skills found matching "{search}"</div>
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
	}

	.search-input:focus {
		border-color: var(--primary);
	}

	.loading,
	.empty,
	.no-agents {
		color: var(--text-muted);
		font-size: 0.82rem;
	}

	.error-box {
		background: #fee2e2;
		border: 1px solid #fca5a5;
		border-radius: var(--radius);
		padding: 16px;
		color: #991b1b;
	}

	.skill-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 14px;
	}

	.skill-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		box-shadow: var(--shadow);
		transition: border-color 0.15s;
	}

	.skill-card:hover {
		border-color: #22c55e;
	}

	.skill-name {
		font-weight: 700;
		font-size: 0.88rem;
		font-family: 'SF Mono', 'Fira Code', monospace;
		color: #22c55e;
	}

	.used-by {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.meta-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		padding-top: 3px;
		white-space: nowrap;
	}

	.agent-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.agent-tag {
		font-size: 0.72rem;
		padding: 2px 7px;
		background: rgba(99, 102, 241, 0.1);
		border: 1px solid rgba(99, 102, 241, 0.3);
		border-radius: 4px;
		color: var(--primary);
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.skill-file {
		font-size: 0.68rem;
		color: var(--text-muted);
		opacity: 0.5;
		font-family: 'SF Mono', 'Fira Code', monospace;
		margin-top: auto;
	}

	@media (max-width: 640px) {
		.skill-grid {
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
