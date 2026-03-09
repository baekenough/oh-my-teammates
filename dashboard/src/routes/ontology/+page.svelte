<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { base } from '$app/paths';

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

interface Skill {
  name: string;
  path: string;
  usedBy: string[];
}

interface Rule {
  id: string;
  name: string;
  priority: string;
  description: string;
}

interface Guide {
  name: string;
  path: string;
}

interface DashboardData {
  agents: Agent[];
  skills: Skill[];
  rules: Rule[];
  guides: Guide[];
}

let container: HTMLDivElement | undefined = $state();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cy: any = null;
let data = $state<DashboardData | null>(null);
let loading = $state(true);
let error = $state('');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let selectedNode = $state<any>(null);

let showAgents = $state(true);
let showSkills = $state(true);
let showGuides = $state(true);
let showRules = $state(true);
let searchQuery = $state('');

// Stats derived from data
const stats = $derived(
  data
    ? {
        agents: data.agents?.length ?? 0,
        skills: data.skills?.length ?? 0,
        guides: data.guides?.length ?? 0,
        rules: data.rules?.length ?? 0,
      }
    : null,
);

onMount(async () => {
  try {
    const res = await fetch(`${base}/data.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    await initGraph();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load';
  } finally {
    loading = false;
  }
});

onDestroy(() => {
  if (cy) {
    cy.destroy();
    cy = null;
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildElements(d: DashboardData): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edges: any[] = [];
  const edgeSet = new Set<string>();

  function addEdge(source: string, target: string, edgeType: string) {
    const key = `${source}--${target}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push({
        data: { id: key, source, target, edgeType },
      });
    }
  }

  // Agent nodes
  for (const agent of d.agents ?? []) {
    nodes.push({
      data: {
        id: `agent:${agent.name}`,
        label: agent.name,
        type: 'agent',
        raw: agent,
      },
    });
  }

  // Skill nodes
  for (const skill of d.skills ?? []) {
    nodes.push({
      data: {
        id: `skill:${skill.name}`,
        label: skill.name,
        type: 'skill',
        raw: skill,
      },
    });
  }

  // Guide nodes
  for (const guide of d.guides ?? []) {
    nodes.push({
      data: {
        id: `guide:${guide.name}`,
        label: guide.name,
        type: 'guide',
        raw: guide,
      },
    });
  }

  // Rule nodes
  for (const rule of d.rules ?? []) {
    nodes.push({
      data: {
        id: `rule:${rule.id}`,
        label: rule.name ?? rule.id,
        type: 'rule',
        raw: rule,
      },
    });
  }

  // Agent → Skill edges (from agent.skills array)
  for (const agent of d.agents ?? []) {
    for (const skillName of agent.skills ?? []) {
      const skillId = `skill:${skillName}`;
      const agentId = `agent:${agent.name}`;
      // Only add edge if skill node exists
      if ((d.skills ?? []).some((s) => s.name === skillName)) {
        addEdge(agentId, skillId, 'uses');
      }
    }
  }

  // Skill → Agent edges (from skill.usedBy)
  for (const skill of d.skills ?? []) {
    for (const agentName of skill.usedBy ?? []) {
      const agentId = `agent:${agentName}`;
      const skillId = `skill:${skill.name}`;
      if ((d.agents ?? []).some((a) => a.name === agentName)) {
        addEdge(agentId, skillId, 'uses');
      }
    }
  }

  return [...nodes, ...edges];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const graphStyle: any[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'font-size': '9px',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 6,
      'text-wrap': 'wrap',
      'text-max-width': '80px',
      width: 28,
      height: 28,
      color: '#64748b',
      'text-outline-width': 2,
      'text-outline-color': '#ffffff',
    },
  },
  {
    selector: '[data-theme="dark"] node',
    style: {
      color: '#94a3b8',
      'text-outline-color': '#0f172a',
    },
  },
  {
    selector: 'node[type="agent"]',
    style: {
      'background-color': '#6366f1',
      shape: 'roundrectangle',
      width: 34,
      height: 34,
    },
  },
  {
    selector: 'node[type="skill"]',
    style: {
      'background-color': '#10b981',
      shape: 'diamond',
      width: 28,
      height: 28,
    },
  },
  {
    selector: 'node[type="guide"]',
    style: {
      'background-color': '#06b6d4',
      shape: 'ellipse',
    },
  },
  {
    selector: 'node[type="rule"]',
    style: {
      'background-color': '#f59e0b',
      shape: 'rectangle',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1.2,
      'line-color': '#94a3b8',
      'target-arrow-color': '#94a3b8',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      opacity: 0.55,
    },
  },
  {
    selector: ':selected',
    style: {
      'border-width': 3,
      'border-color': '#f43f5e',
      'border-opacity': 1,
    },
  },
  {
    selector: '.highlighted',
    style: {
      'border-width': 3,
      'border-color': '#f43f5e',
      'border-opacity': 1,
      opacity: 1,
    },
  },
  {
    selector: '.dimmed',
    style: {
      opacity: 0.15,
    },
  },
];

async function initGraph() {
  if (!data || !container) return;

  const cytoscapeModule = await import('cytoscape');
  const cytoscape = cytoscapeModule.default;

  const elements = buildElements(data);

  if (cy) {
    cy.destroy();
  }

  cy = cytoscape({
    container,
    elements,
    style: graphStyle,
    layout: {
      name: 'cose',
      animate: true,
      animationDuration: 800,
      nodeRepulsion: () => 10000,
      idealEdgeLength: () => 100,
      gravity: 0.3,
      numIter: 1000,
      initialTemp: 200,
      coolingFactor: 0.95,
      minTemp: 1.0,
      fit: true,
      padding: 40,
      randomize: true,
    },
  });

  cy.on('tap', 'node', (evt: { target: { data: () => unknown } }) => {
    selectedNode = evt.target.data();
    highlightNeighbors(selectedNode.id);
  });

  cy.on('tap', (evt: { target: unknown }) => {
    if (evt.target === cy) {
      selectedNode = null;
      clearHighlights();
    }
  });
}

function highlightNeighbors(nodeId: string) {
  if (!cy) return;
  clearHighlights();
  const node = cy.$(`#${CSS.escape(nodeId)}`);
  const neighbors = node.neighborhood();
  cy.elements().addClass('dimmed');
  node.removeClass('dimmed').addClass('highlighted');
  neighbors.removeClass('dimmed');
}

function clearHighlights() {
  if (!cy) return;
  cy.elements().removeClass('dimmed').removeClass('highlighted');
}

function applyFilters() {
  if (!cy) return;
  cy.nodes().forEach(
    (node: { data: (key: string) => string; style: (prop: string, val: string) => void }) => {
      const type = node.data('type');
      const visible =
        (type === 'agent' && showAgents) ||
        (type === 'skill' && showSkills) ||
        (type === 'guide' && showGuides) ||
        (type === 'rule' && showRules);
      node.style('display', visible ? 'element' : 'none');
    },
  );
}

function applySearch() {
  if (!cy) return;
  if (!searchQuery.trim()) {
    clearHighlights();
    return;
  }
  const q = searchQuery.toLowerCase();
  cy.elements().addClass('dimmed');
  cy.nodes().forEach(
    (node: {
      data: (key: string) => string;
      removeClass: (cls: string) => void;
      addClass: (cls: string) => void;
    }) => {
      const label = (node.data('label') as string).toLowerCase();
      if (label.includes(q)) {
        node.removeClass('dimmed');
        node.addClass('highlighted');
      }
    },
  );
}

function resetLayout() {
  if (!cy) return;
  cy.layout({
    name: 'cose',
    animate: true,
    animationDuration: 600,
    nodeRepulsion: () => 10000,
    idealEdgeLength: () => 100,
    gravity: 0.3,
    fit: true,
    padding: 40,
    randomize: true,
  }).run();
}

function fitView() {
  if (!cy) return;
  cy.fit(undefined, 40);
}

// Reactive: apply filters when toggle states change
$effect(() => {
  // Track all filter states
  const _a = showAgents;
  const _s = showSkills;
  const _g = showGuides;
  const _r = showRules;
  void _a;
  void _s;
  void _g;
  void _r;
  applyFilters();
});

// Reactive: apply search when query changes
$effect(() => {
  const _q = searchQuery;
  void _q;
  applySearch();
});

// Helper: get connected node info for detail panel
function getConnectedNodes(nodeId: string) {
  if (!cy) return [];
  const node = cy.$(`#${CSS.escape(nodeId)}`);
  return node.neighborhood('node').map((n: { data: (key: string) => string }) => ({
    id: n.data('id'),
    label: n.data('label'),
    type: n.data('type'),
  }));
}

const typeColors: Record<string, string> = {
  agent: '#6366f1',
  skill: '#10b981',
  guide: '#06b6d4',
  rule: '#f59e0b',
};

const typeLabels: Record<string, string> = {
  agent: 'Agent',
  skill: 'Skill',
  guide: 'Guide',
  rule: 'Rule',
};

const connectedNodes = $derived(selectedNode ? getConnectedNodes(selectedNode.id) : []);
</script>

<svelte:head>
	<title>Ontology — oh-my-teammates</title>
</svelte:head>

<div class="page">
	<!-- Header -->
	<div class="page-header">
		<div>
			<h1 class="page-title">Ontology Graph</h1>
			{#if stats}
				<div class="stats-row">
					<span class="stat" style="color: #6366f1">{stats.agents} agents</span>
					<span class="sep">·</span>
					<span class="stat" style="color: #10b981">{stats.skills} skills</span>
					<span class="sep">·</span>
					<span class="stat" style="color: #06b6d4">{stats.guides} guides</span>
					<span class="sep">·</span>
					<span class="stat" style="color: #f59e0b">{stats.rules} rules</span>
				</div>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="loading">Loading graph...</div>
	{:else if error}
		<div class="error-box">{error}</div>
	{:else}
		<!-- Controls -->
		<div class="controls">
			<div class="filter-group">
				<span class="filter-label">Show:</span>
				<label class="filter-chip" class:active={showAgents} style="--chip-color: #6366f1">
					<input type="checkbox" bind:checked={showAgents} hidden />
					<span class="chip-dot"></span>
					Agents
				</label>
				<label class="filter-chip" class:active={showSkills} style="--chip-color: #10b981">
					<input type="checkbox" bind:checked={showSkills} hidden />
					<span class="chip-dot"></span>
					Skills
				</label>
				<label class="filter-chip" class:active={showGuides} style="--chip-color: #06b6d4">
					<input type="checkbox" bind:checked={showGuides} hidden />
					<span class="chip-dot"></span>
					Guides
				</label>
				<label class="filter-chip" class:active={showRules} style="--chip-color: #f59e0b">
					<input type="checkbox" bind:checked={showRules} hidden />
					<span class="chip-dot"></span>
					Rules
				</label>
			</div>

			<div class="control-right">
				<input
					class="search-input"
					type="search"
					placeholder="Search nodes..."
					bind:value={searchQuery}
				/>
				<button class="btn-icon" onclick={resetLayout} title="Reset layout">⟳</button>
				<button class="btn-icon" onclick={fitView} title="Fit to view">⊡</button>
			</div>
		</div>

		<!-- Graph + Detail panel layout -->
		<div class="graph-layout" class:has-detail={!!selectedNode}>
			<!-- Cytoscape container -->
			<div class="graph-card">
				<div class="graph-container" bind:this={container}></div>
				<div class="legend">
					<span class="legend-item"><span class="legend-dot" style="background:#6366f1;border-radius:4px"></span>Agent</span>
					<span class="legend-item"><span class="legend-dot" style="background:#10b981;transform:rotate(45deg)"></span>Skill</span>
					<span class="legend-item"><span class="legend-dot" style="background:#06b6d4;border-radius:50%"></span>Guide</span>
					<span class="legend-item"><span class="legend-dot" style="background:#f59e0b"></span>Rule</span>
				</div>
			</div>

			<!-- Detail panel -->
			{#if selectedNode}
				<div class="detail-panel">
					<div class="detail-header">
						<div class="detail-type-badge" style="background: {typeColors[selectedNode.type]}22; color: {typeColors[selectedNode.type]}">
							{typeLabels[selectedNode.type] ?? selectedNode.type}
						</div>
						<button
							class="close-btn"
							onclick={() => { selectedNode = null; clearHighlights(); }}
							aria-label="Close"
						>✕</button>
					</div>

					<h2 class="detail-name">{selectedNode.label}</h2>

					{#if selectedNode.raw}
						{@const raw = selectedNode.raw}

						{#if selectedNode.type === 'agent'}
							{#if raw.description}
								<p class="detail-desc">{raw.description}</p>
							{/if}
							<div class="detail-section">
								<div class="detail-row">
									<span class="detail-key">Model</span>
									<span class="detail-val mono">{raw.model ?? '—'}</span>
								</div>
								{#if raw.memory}
									<div class="detail-row">
										<span class="detail-key">Memory</span>
										<span class="detail-val mono">{raw.memory}</span>
									</div>
								{/if}
								{#if raw.effort}
									<div class="detail-row">
										<span class="detail-key">Effort</span>
										<span class="detail-val mono">{raw.effort}</span>
									</div>
								{/if}
							</div>
							{#if raw.tools?.length}
								<div class="detail-section">
									<div class="detail-key">Tools</div>
									<div class="tag-list">
										{#each raw.tools as tool}
											<span class="tag">{tool}</span>
										{/each}
									</div>
								</div>
							{/if}
							{#if raw.skills?.length}
								<div class="detail-section">
									<div class="detail-key">Skills</div>
									<div class="tag-list">
										{#each raw.skills as skill}
											<span class="tag tag-skill">{skill}</span>
										{/each}
									</div>
								</div>
							{/if}

						{:else if selectedNode.type === 'skill'}
							{#if raw.path}
								<p class="detail-path">{raw.path}</p>
							{/if}
							{#if raw.usedBy?.length}
								<div class="detail-section">
									<div class="detail-key">Used by</div>
									<div class="tag-list">
										{#each raw.usedBy as agentName}
											<span class="tag tag-agent">{agentName}</span>
										{/each}
									</div>
								</div>
							{/if}

						{:else if selectedNode.type === 'guide'}
							{#if raw.path}
								<p class="detail-path">{raw.path}</p>
							{/if}

						{:else if selectedNode.type === 'rule'}
							{#if raw.description}
								<p class="detail-desc">{raw.description}</p>
							{/if}
							{#if raw.priority}
								<div class="detail-section">
									<div class="detail-row">
										<span class="detail-key">Priority</span>
										<span class="detail-val mono">{raw.priority}</span>
									</div>
									{#if raw.id}
										<div class="detail-row">
											<span class="detail-key">ID</span>
											<span class="detail-val mono">{raw.id}</span>
										</div>
									{/if}
								</div>
							{/if}
						{/if}
					{/if}

					{#if connectedNodes.length > 0}
						<div class="detail-section">
							<div class="detail-key">Connected ({connectedNodes.length})</div>
							<div class="connected-list">
								{#each connectedNodes as node}
									<button
										class="connected-item"
										onclick={() => {
											selectedNode = cy.$(`#${CSS.escape(node.id)}`).data();
											highlightNeighbors(node.id);
										}}
									>
										<span class="connected-dot" style="background:{typeColors[node.type]}"></span>
										<span class="connected-label">{node.label}</span>
										<span class="connected-type">{typeLabels[node.type] ?? node.type}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 1300px;
	}

	.page-header {
		margin-bottom: 20px;
	}

	.page-title {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.03em;
	}

	.stats-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
		font-size: 0.82rem;
	}

	.stat {
		font-weight: 600;
	}

	.sep {
		color: var(--text-muted);
		opacity: 0.5;
	}

	/* Controls */
	.controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}

	.filter-group {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.filter-label {
		font-size: 0.78rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.filter-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border-radius: 99px;
		border: 1.5px solid var(--border);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		color: var(--text-muted);
		transition: all 0.15s;
		user-select: none;
	}

	.filter-chip:hover {
		border-color: var(--chip-color);
		color: var(--chip-color);
	}

	.filter-chip.active {
		border-color: var(--chip-color);
		background: color-mix(in srgb, var(--chip-color) 12%, transparent);
		color: var(--chip-color);
	}

	.chip-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--chip-color);
		opacity: 0.5;
		transition: opacity 0.15s;
	}

	.filter-chip.active .chip-dot {
		opacity: 1;
	}

	.control-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.search-input {
		padding: 7px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-card);
		color: var(--text);
		font-size: 0.85rem;
		width: 200px;
		outline: none;
		transition: border-color 0.15s;
	}

	.search-input:focus {
		border-color: var(--primary);
	}

	.btn-icon {
		padding: 7px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-card);
		color: var(--text-muted);
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.15s;
		line-height: 1;
	}

	.btn-icon:hover {
		border-color: var(--primary);
		color: var(--primary);
	}

	/* Graph layout */
	.graph-layout {
		display: grid;
		grid-template-columns: 1fr;
		gap: 16px;
	}

	.graph-layout.has-detail {
		grid-template-columns: 1fr 280px;
	}

	.graph-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.graph-container {
		height: 600px;
		width: 100%;
	}

	.legend {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 10px 16px;
		border-top: 1px solid var(--border);
		flex-wrap: wrap;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.legend-dot {
		display: inline-block;
		width: 10px;
		height: 10px;
		flex-shrink: 0;
	}

	/* Detail panel */
	.detail-panel {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-self: start;
		max-height: 640px;
		overflow-y: auto;
	}

	.detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.detail-type-badge {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 3px 9px;
		border-radius: 99px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.close-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		font-size: 0.9rem;
		padding: 2px 4px;
		border-radius: 4px;
		transition: color 0.15s;
		line-height: 1;
	}

	.close-btn:hover {
		color: var(--text);
	}

	.detail-name {
		font-size: 0.95rem;
		font-weight: 700;
		font-family: 'SF Mono', 'Fira Code', monospace;
		color: var(--text);
		word-break: break-all;
	}

	.detail-desc {
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.detail-path {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-family: 'SF Mono', 'Fira Code', monospace;
		word-break: break-all;
		opacity: 0.7;
	}

	.detail-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.detail-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.detail-key {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		min-width: 52px;
	}

	.detail-val {
		font-size: 0.82rem;
		color: var(--text);
	}

	.mono {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.78rem;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 2px;
	}

	.tag {
		font-size: 0.7rem;
		padding: 2px 7px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-muted);
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.tag-skill {
		background: rgba(99, 102, 241, 0.08);
		border-color: rgba(99, 102, 241, 0.25);
		color: #6366f1;
	}

	.tag-agent {
		background: rgba(16, 185, 129, 0.08);
		border-color: rgba(16, 185, 129, 0.25);
		color: #10b981;
	}

	/* Connected nodes list */
	.connected-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 4px;
	}

	.connected-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 6px;
		border: 1px solid transparent;
		background: transparent;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
		width: 100%;
	}

	.connected-item:hover {
		background: var(--bg);
		border-color: var(--border);
	}

	.connected-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.connected-label {
		font-size: 0.78rem;
		font-family: 'SF Mono', 'Fira Code', monospace;
		color: var(--text);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.connected-type {
		font-size: 0.68rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	/* Loading / Error */
	.loading {
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

	/* Responsive */
	@media (max-width: 900px) {
		.graph-layout.has-detail {
			grid-template-columns: 1fr;
		}

		.graph-container {
			height: 480px;
		}
	}

	@media (max-width: 640px) {
		.controls {
			flex-direction: column;
			align-items: flex-start;
		}

		.search-input {
			width: 100%;
		}

		.graph-container {
			height: 380px;
		}
	}
</style>
