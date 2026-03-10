<div align="center">
  <img src="assets/banner.png" alt="oh-my-teammates banner" width="800" />
</div>

# oh-my-teammates

> **Your Team's Agent Stack, Together**

[![npm version](https://img.shields.io/npm/v/@oh-my-customcode/oh-my-teammates.svg)](https://www.npmjs.com/package/@oh-my-customcode/oh-my-teammates)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-teammates/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-teammates/actions/workflows/ci.yml)
[![Security Audit](https://github.com/baekenough/oh-my-teammates/actions/workflows/security-audit.yml/badge.svg)](https://github.com/baekenough/oh-my-teammates/actions/workflows/security-audit.yml)

**[한국어 문서 (Korean)](./README_ko.md)** | 📐 [Architecture Guide](ARCHITECTURE.md)

**Team collaboration addon for [oh-my-customcode](https://github.com/baekenough/oh-my-customcode) — share sessions, protect your harness, and govern together.**

Like oh-my-customcode gave you a personal agent stack, oh-my-teammates makes it work for your whole team.

## Features

| Module | Description |
|--------|-------------|
| `team-config.ts` | Parse and manage `team.yaml` with CRUD operations, admin roles, and schema validation |
| `session-logger.ts` | `bun:sqlite`-based session tracking with structured event logging |
| `stewards.ts` | `STEWARDS.yaml` management with 8-domain model and CODEOWNERS generation |
| `init.ts` | Project scanning, dependency analysis, and team configuration scaffolding |
| `team-todo.ts` | Team-level task management with priority levels and steward-based auto-assignment |
| `recommender.ts` | Project scanning engine with 4-layer confidence scoring for agent recommendations |
| `report.ts` | Static HTML report generator aggregating team, steward, session, and TODO data |
| `cli.ts` | `omcustom-team init` and `omcustom-team todo` CLI commands |
| Dashboard | SvelteKit-based agent/skill/rule/guide visualization with dark mode and mobile support |

## What It Does

| Feature | Description |
|---------|-------------|
| **Session Sharing** | Share Claude session knowledge across team via selective symlinks |
| **Guardian CI** | Automated harness validation on every PR (~860ms) |
| **Steward System** | Domain-based ownership with auto-assignment on init |
| **Team TODO** | Shared task management linked to stewards and issues |
| **Quality Metrics** | Rule Adherence Rate (RAR) tracking, target 98% |
| **Adaptive Expansion** | Auto-detect tech stack changes and recommend new agents/skills |
| **Agent Recommender** | Scan project structure and recommend relevant agents based on tech stack |
| **HTML Report** | Aggregate team data into a static dashboard report |

## How Stewards Work

Stewards are **domain guardians** — they declare "who is responsible for what" across your codebase. Instead of manually editing `.github/CODEOWNERS`, you define ownership at the **domain level** in `STEWARDS.yaml`.

### The Problem Stewards Solve

| Without Stewards | With Stewards |
|------------------|---------------|
| Manually edit `.github/CODEOWNERS` per file | Define ownership per **domain** → CODEOWNERS auto-generated |
| "Who should review this PR?" → ask around | `findStewardForFile("src/api/auth.ts")` → `alice` |
| TODO tasks manually assigned | Domain-based auto-assignment via `autoAssign()` |
| No visibility into coverage gaps | Report shows unowned domains |

### How It Works

```
STEWARDS.yaml                        .github/CODEOWNERS
┌──────────────────────┐             ┌──────────────────────────┐
│ domains:             │             │ # Auto-generated          │
│   frontend:          │  ────────►  │ /src/components/** @carol │
│     primary: carol   │  generate   │ /**/*.svelte @carol @dave │
│     backup: dave     │  Codeowners │                           │
│     paths:           │             │ /src/api/** @alice @bob   │
│       - src/comp/**  │             └──────────────────────────┘
│       - **/*.svelte  │
│   backend:           │             TODO.md (auto-assign)
│     primary: alice   │             ┌──────────────────────────┐
│     backup: bob      │  ────────►  │ [P0] Fix auth — @alice   │
│     paths:           │  autoAssign │   (backend domain)       │
│       - src/api/**   │             │ [P1] Update UI — @carol  │
└──────────────────────┘             │   (frontend domain)      │
                                     └──────────────────────────┘
```

### File → Domain → Steward Mapping

When a file is changed, Stewards traces the chain:

```
src/components/Button.tsx → frontend domain → carol (primary), dave (backup)
dags/daily_etl.py        → data-engineering  → dave (primary)
Dockerfile               → infrastructure    → eve (primary)
src/api/auth.ts          → backend domain    → alice (primary), bob (backup)
```

### 8 Default Domains

| Domain | Scope | Example Patterns |
|--------|-------|-----------------|
| `languages` | Language-specific code | `**/*.ts`, `**/*.py`, `**/*.go` |
| `frontend` | UI components & frameworks | `src/components/**`, `**/*.svelte` |
| `backend` | Server & API code | `src/api/**`, `routes/**` |
| `data-engineering` | Pipelines & DAGs | `dags/**`, `pipelines/**` |
| `infrastructure` | Deploy & CI/CD | `Dockerfile`, `terraform/**` |
| `database` | Schema & migrations | `**/*.sql`, `migrations/**` |
| `quality` | Tests & specs | `**/*.test.ts`, `__tests__/**` |
| `documentation` | Docs & guides | `docs/**`, `**/*.md` |

## Quick Start

```bash
# Install (requires oh-my-customcode >= 0.23.0)
bun add -d @oh-my-customcode/oh-my-teammates

# Initialize team features on your project
bunx omcustom-team init
```

## CLI Usage

### `omcustom-team init`

Bootstraps team configuration for your project:

```bash
bunx omcustom-team init
```

1. **Scan** your project for languages, frameworks, and file patterns
2. **Analyze** git history to map contributors to domains
3. **Generate** `team.yaml` (member mapping) and `STEWARDS.yaml` (domain ownership)
4. **Create** `.claude/team/` directory structure for shared knowledge

### `omcustom-team todo`

Manage team-level tasks:

```bash
# List all team TODOs
bunx omcustom-team todo list

# Add a new team task
bunx omcustom-team todo add Fix API rate limiting
```

### `omcustom-team recommend`

Scan your project and recommend agents:

```bash
bunx omcustom-team recommend
```

Analyzes file extensions, config files, directory patterns, and manifest dependencies to suggest the most relevant oh-my-customcode agents for your tech stack.

## Dashboard

The SvelteKit dashboard is scaffolded into your project when you run `omcustom-team init`. It provides a visual overview of your oh-my-customcode harness:

- **Agents** — Browse all registered agents with their capabilities
- **Skills** — Explore skill definitions and agent associations
- **Rules** — View MUST/SHOULD/MAY rules by priority
- **Guides** — Access developer guides and reference docs
- **Stewards** — Domain ownership assignments
- **Team** — Team member status

Built with SvelteKit + adapter-static. Supports dark mode and mobile. Deploy to GitHub Pages from your own project.

## Configuration

### team.yaml

Admin-managed file mapping team members to accounts:

```yaml
admin: john-doe
members:
  john-doe:
    github: baekenough
    email: john@example.com
    role: admin
  jane-doe:
    github: jane-gh
    email: jane@example.com
    role: member
```

### STEWARDS.yaml

Auto-generated domain ownership. 8 domains x 2 roles (primary + backup):

| Domain | Scope |
|--------|-------|
| Languages | lang-* agents, language-specific skills |
| Backend | be-* agents, API framework skills |
| Frontend | fe-* agents, UI/UX skills |
| Data Engineering | de-* agents, pipeline skills |
| DB/Infra | db-*, infra-* agents |
| Tooling | tool-*, mgr-* agents |
| QA/Architecture | qa-*, arch-* agents |
| Governance | rules, CLAUDE.md, team config |

Example auto-generated output:

```yaml
domains:
  languages:
    primary: john-doe    # 85% of .ts commits
    backup: jane-doe     # 12% of .ts commits
    active: true
  de:
    active: false        # no pipeline files detected
```

## Session Sharing

Share Claude session knowledge without external infrastructure:

```bash
# Set up selective symlinks (per developer)
bunx omcustom-team link
```

### What Gets Shared

| Content | Shared? | Reason |
|---------|---------|--------|
| `agent-memory/` (project scope) | Yes | Team-wide learnings |
| `MEMORY.md` | Yes | Session summaries |
| Session logs (Parquet) | Yes | Knowledge pipeline |
| Architectural decisions | Yes | Team alignment |
| `settings.local.json` | No | Personal config |
| API keys / credentials | No | Security |

### Directory Structure

```
.claude/team/
├── shared-memory/          # Cross-team learnings
├── session-logs/           # Exported session summaries
├── employees/              # Per-member profiles
│   ├── john-doe/
│   │   ├── MEMORY.md
│   │   └── preferences.yaml
│   └── jane-doe/
│       └── ...
├── team.yaml               # Member mapping
├── STEWARDS.yaml           # Domain ownership
└── TODO.md                 # Shared team tasks
```

## Guardian CI

Validates harness integrity on every PR targeting `main` or `develop`:

- **Agent frontmatter** — YAML headers present and valid
- **Skill references** — All referenced skills exist
- **Naming conventions** — kebab-case enforcement
- **STEWARDS.yaml / team.yaml** — Validated when present
- **Execution time** — ~860ms (single job)

Triggered only when `.claude/` files change.

## Quality Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| **RAR** | 98% | Rule Adherence Rate = violation-free tasks / total |
| Execution overhead | < 5% | Time cost of compliance |
| Token waste | < 2% | Token cost of compliance |

Measured via before/after paired comparison (each developer is their own control).

## Team TODO

Enhanced `sys-naggy` agent with team features:

- `.claude/team/TODO.md` — Git-tracked, team-visible
- `team:` prefix for team tasks vs personal tasks
- Auto-generated TODO items from unfinished session work
- Steward-based task routing

## CI Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| CI | PR | Lint (Biome) + Typecheck + Test (Bun, 99% coverage gate) + Build |
| Guardian | PR (.claude/** changes) | Harness integrity + STEWARDS.yaml/team.yaml validation |
| Claude Native Check | Weekly / Manual | Official docs compliance |
| Security Audit | Weekly / PR | Dependency vulnerability scan |
| Release | Tag push (v*) | Build -> npm publish -> GitHub Release |

## Development

```bash
bun install          # Install dependencies
bun test             # Run tests
bun run build        # Build for production
```

## Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| V1 | Guardian CI, Session Logging, Stewards, Team TODO | **Shipped (v0.2.0)** |
| V1.5 | Static HTML report (`omcustom-team report`) | **Shipped (v0.5.0)** |
| V2 | Dashboard enhancements — ontology graph, session timeline, RAR metrics | **Shipped (v0.5.0)** |
| V3 | Adaptive Expansion -- auto-detect and recommend | **Shipped (v0.5.0)** |

## Related

- [oh-my-customcode](https://github.com/baekenough/oh-my-customcode) — Core agent harness (personal)
- [CHANGELOG](./CHANGELOG.md) — Release history
- [Issue #203](https://github.com/baekenough/oh-my-customcode/issues/203) — Architecture design
- [Issue #205](https://github.com/baekenough/oh-my-customcode/issues/205) — Web dashboard design

## License

[MIT](LICENSE)

---

<p align="center">
  <strong>Your team's agent stack. Shared knowledge. Governed together.</strong>
</p>

<p align="center">
  Made with care by <a href="https://github.com/baekenough">baekenough</a>
</p>
