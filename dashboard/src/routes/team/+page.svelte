<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	interface TeamMember {
		github?: string;
		email?: string;
		role?: string;
	}

	interface Team {
		admin: string | null;
		members: Record<string, TeamMember>;
		source: string;
	}

	let team = $state<Team | null>(null);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			const res = await fetch(`${base}/data.json`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			team = data.team;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	});

	const memberList = $derived(
		team ? Object.entries(team.members) : []
	);

	const admins = $derived(memberList.filter(([, m]) => m.role === 'admin'));
	const regularMembers = $derived(memberList.filter(([, m]) => m.role !== 'admin'));
</script>

<svelte:head>
	<title>Team — oh-my-teammates</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Team</h1>
			{#if team && memberList.length > 0}
				<span class="subtitle">{memberList.length} member{memberList.length !== 1 ? 's' : ''}</span>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="loading">Loading...</div>
	{:else if error}
		<div class="error-box">{error}</div>
	{:else if team}
		{#if team.source}
			<div class="source-hint">Source: <code>{team.source}</code></div>
		{/if}

		{#if team.admin && !team.members[team.admin]}
			<div class="admin-banner">
				<span class="admin-icon">★</span>
				Admin: <strong>{team.admin}</strong>
			</div>
		{/if}

		{#if memberList.length === 0}
			<div class="empty-state">
				<div class="empty-icon">◉</div>
				<div class="empty-text">No team members configured yet.</div>
				<div class="empty-hint">
					Edit <code>{team.source || 'team.yaml'}</code> to add members.
				</div>
			</div>
		{:else}
			{#if admins.length > 0}
				<section class="section">
					<h2 class="section-label">Admins</h2>
					<div class="member-grid">
						{#each admins as [name, member]}
							<div class="member-card admin-card">
								<div class="member-avatar">{name[0].toUpperCase()}</div>
								<div class="member-info">
									<div class="member-name">{name}</div>
									{#if member.github}
										<div class="member-meta">@{member.github}</div>
									{/if}
									{#if member.email}
										<div class="member-meta">{member.email}</div>
									{/if}
								</div>
								<span class="role-badge admin">admin</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if regularMembers.length > 0}
				<section class="section">
					<h2 class="section-label">Members</h2>
					<div class="member-grid">
						{#each regularMembers as [name, member]}
							<div class="member-card">
								<div class="member-avatar">{name[0].toUpperCase()}</div>
								<div class="member-info">
									<div class="member-name">{name}</div>
									{#if member.github}
										<div class="member-meta">@{member.github}</div>
									{/if}
									{#if member.email}
										<div class="member-meta">{member.email}</div>
									{/if}
								</div>
								{#if member.role}
									<span class="role-badge">{member.role}</span>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}
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
		margin-bottom: 20px;
	}

	.source-hint code {
		font-family: 'SF Mono', 'Fira Code', monospace;
		background: var(--bg-card);
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid var(--border);
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

	.admin-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		background: rgba(99, 102, 241, 0.08);
		border: 1px solid rgba(99, 102, 241, 0.2);
		border-radius: var(--radius);
		padding: 12px 16px;
		font-size: 0.88rem;
		color: var(--text);
		margin-bottom: 20px;
	}

	.admin-icon {
		color: var(--primary);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 60px 20px;
		gap: 10px;
	}

	.empty-icon {
		font-size: 2rem;
		color: var(--text-muted);
		opacity: 0.4;
	}

	.empty-text {
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.empty-hint {
		font-size: 0.8rem;
		color: var(--text-muted);
		opacity: 0.7;
	}

	.empty-hint code {
		font-family: 'SF Mono', 'Fira Code', monospace;
		background: var(--bg-card);
		padding: 1px 5px;
		border-radius: 3px;
		border: 1px solid var(--border);
	}

	.section {
		margin-bottom: 28px;
	}

	.section-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-muted);
		margin-bottom: 12px;
	}

	.member-grid {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.member-card {
		display: flex;
		align-items: center;
		gap: 14px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 14px 16px;
		box-shadow: var(--shadow);
	}

	.member-card.admin-card {
		border-left: 3px solid var(--primary);
	}

	.member-avatar {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--primary), var(--primary-light));
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1rem;
		flex-shrink: 0;
	}

	.member-info {
		flex: 1;
		min-width: 0;
	}

	.member-name {
		font-weight: 700;
		font-size: 0.9rem;
	}

	.member-meta {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin-top: 2px;
	}

	.role-badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 3px 9px;
		border-radius: 99px;
		background: rgba(100, 116, 139, 0.12);
		color: var(--text-muted);
		text-transform: lowercase;
	}

	.role-badge.admin {
		background: rgba(99, 102, 241, 0.12);
		color: var(--primary);
	}
</style>
