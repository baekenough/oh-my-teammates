<script lang="ts">
import { base } from '$app/paths';
import { page } from '$app/state';

let { children } = $props();

let isDark = $state(false);
let sidebarOpen = $state(false);

// Initialize from system preference
$effect(() => {
  isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
});

function toggleTheme() {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

const navItems = [
  { href: `${base}/`, label: 'Overview', icon: '◈' },
  { href: `${base}/agents`, label: 'Agents', icon: '◉' },
  { href: `${base}/skills`, label: 'Skills', icon: '◆' },
  { href: `${base}/rules`, label: 'Rules', icon: '◇' },
  { href: `${base}/guides`, label: 'Guides', icon: '◎' },
  { href: `${base}/stewards`, label: 'Stewards', icon: '★' },
  { href: `${base}/team`, label: 'Team', icon: '◉' },
  { href: `${base}/sessions`, label: 'Sessions', icon: '▣' },
  { href: `${base}/metrics`, label: 'Metrics', icon: '◧' },
  { href: `${base}/ontology`, label: 'Ontology', icon: '◬' },
];

function isActive(href: string) {
  const currentPath = page.url.pathname;
  if (href === `${base}/`) return currentPath === `${base}/` || currentPath === `${base}`;
  return currentPath.startsWith(href);
}
</script>

<div class="app">
	<!-- Mobile header -->
	<header class="mobile-header">
		<button class="hamburger" onclick={() => (sidebarOpen = !sidebarOpen)} aria-label="Toggle menu">
			{sidebarOpen ? '✕' : '☰'}
		</button>
		<span class="site-title">oh-my-teammates</span>
		<button class="theme-toggle" onclick={toggleTheme} aria-label="Toggle theme">
			{isDark ? '☀' : '☾'}
		</button>
	</header>

	<!-- Sidebar overlay for mobile -->
	{#if sidebarOpen}
		<div class="overlay" onclick={() => (sidebarOpen = false)} role="presentation"></div>
	{/if}

	<!-- Sidebar -->
	<aside class="sidebar" class:open={sidebarOpen}>
		<div class="sidebar-header">
			<div class="logo">
				<span class="logo-icon">◈</span>
				<span class="logo-text">oh-my-teammates</span>
			</div>
			<button class="theme-toggle desktop-theme" onclick={toggleTheme} aria-label="Toggle theme">
				{isDark ? '☀' : '☾'}
			</button>
		</div>

		<nav class="sidebar-nav">
			{#each navItems as item}
				<a
					href={item.href}
					class="nav-item"
					class:active={isActive(item.href)}
					onclick={() => (sidebarOpen = false)}
				>
					<span class="nav-icon">{item.icon}</span>
					<span class="nav-label">{item.label}</span>
				</a>
			{/each}
		</nav>

		<div class="sidebar-footer">
			<span class="version">v0.1.0</span>
		</div>
	</aside>

	<!-- Main content -->
	<main class="main-content">
		{@render children()}
	</main>
</div>

<style>
	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(:root) {
		--bg: #ffffff;
		--bg-card: #f8f9fa;
		--bg-sidebar: #1a1a2e;
		--text: #1a1a2e;
		--text-muted: #64748b;
		--text-sidebar: #e2e8f0;
		--primary: #6366f1;
		--primary-light: #818cf8;
		--border: #e2e8f0;
		--shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		--radius: 8px;
		--sidebar-width: 220px;
	}

	:global([data-theme='dark']) {
		--bg: #0f172a;
		--bg-card: #1e293b;
		--bg-sidebar: #0a0f1e;
		--text: #e2e8f0;
		--text-muted: #94a3b8;
		--text-sidebar: #cbd5e1;
		--primary: #818cf8;
		--primary-light: #a5b4fc;
		--border: #334155;
		--shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
	}

	:global(body) {
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: var(--bg);
		color: var(--text);
		transition:
			background 0.2s,
			color 0.2s;
	}

	.app {
		display: flex;
		min-height: 100vh;
	}

	/* Mobile header */
	.mobile-header {
		display: none;
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 56px;
		background: var(--bg-sidebar);
		color: var(--text-sidebar);
		align-items: center;
		justify-content: space-between;
		padding: 0 16px;
		z-index: 100;
		box-shadow: var(--shadow);
	}

	.site-title {
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	/* Overlay */
	.overlay {
		display: none;
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 90;
	}

	/* Sidebar */
	.sidebar {
		position: fixed;
		left: 0;
		top: 0;
		bottom: 0;
		width: var(--sidebar-width);
		background: var(--bg-sidebar);
		color: var(--text-sidebar);
		display: flex;
		flex-direction: column;
		z-index: 95;
		overflow: hidden;
	}

	.sidebar-header {
		padding: 20px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.logo-icon {
		font-size: 1.2rem;
		color: var(--primary-light);
	}

	.logo-text {
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: #fff;
	}

	.sidebar-nav {
		flex: 1;
		padding: 12px 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: var(--radius);
		color: var(--text-sidebar);
		text-decoration: none;
		font-size: 0.88rem;
		font-weight: 500;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.nav-item:hover {
		background: rgba(255, 255, 255, 0.08);
		color: #fff;
	}

	.nav-item.active {
		background: var(--primary);
		color: #fff;
	}

	.nav-icon {
		font-size: 0.9rem;
		opacity: 0.8;
	}

	.sidebar-footer {
		padding: 16px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.version {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.3);
	}

	/* Theme toggle */
	.theme-toggle {
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 6px;
		padding: 6px 8px;
		cursor: pointer;
		color: var(--text-sidebar);
		font-size: 0.9rem;
		transition: background 0.15s;
	}

	.theme-toggle:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.hamburger {
		background: transparent;
		border: none;
		color: var(--text-sidebar);
		font-size: 1.1rem;
		cursor: pointer;
		padding: 4px 8px;
	}

	/* Main content */
	.main-content {
		margin-left: var(--sidebar-width);
		flex: 1;
		padding: 32px;
		max-width: 1200px;
		min-height: 100vh;
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.mobile-header {
			display: flex;
		}

		.desktop-theme {
			display: none;
		}

		.sidebar {
			transform: translateX(-100%);
			transition: transform 0.25s ease;
			top: 56px;
		}

		.sidebar.open {
			transform: translateX(0);
		}

		.overlay {
			display: block;
			top: 56px;
		}

		.main-content {
			margin-left: 0;
			margin-top: 56px;
			padding: 20px 16px;
		}
	}
</style>
