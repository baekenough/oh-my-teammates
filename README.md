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

## Quick Start

```bash
# Install (requires oh-my-customcode >= 0.18.0)
bun add -d @oh-my-customcode/oh-my-teammates

# Initialize team features on your project
omcustom-team init
```

## CLI Usage

### `omcustom-team init`

Bootstraps team configuration for your project:

```bash
omcustom-team init
```

1. **Scan** your project for languages, frameworks, and file patterns
2. **Analyze** git history to map contributors to domains
3. **Generate** `team.yaml` (member mapping) and `STEWARDS.yaml` (domain ownership)
4. **Create** `.claude/team/` directory structure for shared knowledge

### `omcustom-team todo`

Manage team-level tasks linked to stewards:

```bash
# List all team TODOs
omcustom-team todo list

# Add a new team task
omcustom-team todo add --priority high --domain backend "Review API rate limiting"

# Assign to steward
omcustom-team todo assign <id> --steward john-doe
```

## Dashboard

The SvelteKit dashboard provides a visual overview of your team's oh-my-customcode harness:

- **Agents** — Browse and inspect all registered agents with their capabilities
- **Skills** — Explore skill definitions and their agent associations
- **Rules** — View MUST/SHOULD/MAY rules with priority levels
- **Guides** — Access developer guides and reference documentation

Features dark mode and mobile support. Auto-deployed via CI on push to `main`.

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
omcustom-team link
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
| V1.5 | Static HTML report (`omcustom-team report`) | Planned |
| V2 | Web Dashboard -- monitoring + management | [#205](https://github.com/baekenough/oh-my-customcode/issues/205) |
| V3 | Adaptive Expansion -- auto-detect and recommend | Planned |

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
