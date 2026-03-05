# oh-my-teammates

> Team collaboration addon for [oh-my-customcode](https://github.com/baekenough/oh-my-customcode) — organizational harness management

## Overview

oh-my-teammates extends oh-my-customcode with team-level features:

- **Session Sharing**: Share Claude session knowledge across team members via selective symlinks
- **Guardian CI**: Automated harness validation on PRs (~860ms)
- **Steward System**: Domain-based ownership with auto-assignment on init
- **Team TODO**: Shared task management with steward integration
- **Quality Metrics**: Rule Adherence Rate (RAR) tracking with 98% target

## Prerequisites

- [oh-my-customcode](https://github.com/baekenough/oh-my-customcode) >= 0.18.0
- [Bun](https://bun.sh) >= 1.0.0

## Installation

```bash
bun add -d oh-my-teammates
```

## Quick Start

```bash
# Initialize team features on existing project
omcustom-team init

# This will:
# 1. Scan project for tech stack and file patterns
# 2. Analyze git history for contributor mapping
# 3. Generate team.yaml and STEWARDS.yaml
# 4. Set up .claude/team/ directory structure
```

## Configuration

### team.yaml

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

Auto-generated on `omcustom-team init`, maps 8 domains to team members:

| Domain | Scope |
|--------|-------|
| Languages | lang-* agents, language skills |
| Backend | be-* agents, API skills |
| Frontend | fe-* agents, UI skills |
| DE | de-* agents, pipeline skills |
| DB/Infra | db-*, infra-* agents |
| Tooling | tool-*, mgr-* agents |
| QA/Arch | qa-*, arch-* agents |
| Governance | rules, CLAUDE.md |

## Session Sharing

Share Claude session knowledge via selective symlinks:

```bash
# Share specific subdirectories (run per developer)
omcustom-team link

# This creates symlinks:
# ~/.claude/agent-memory → .claude/team/employees/<username>/agent-memory
# ~/.claude/MEMORY.md → .claude/team/employees/<username>/MEMORY.md
```

## Guardian CI

Validates harness integrity on every PR:

- Agent frontmatter validation
- Skill reference checking
- Routing pattern completeness
- CLAUDE.md sync verification

## Related

- [oh-my-customcode](https://github.com/baekenough/oh-my-customcode) — Core AI agent harness
- [Issue #203](https://github.com/baekenough/oh-my-customcode/issues/203) — Organizational collaboration design
- [Issue #205](https://github.com/baekenough/oh-my-customcode/issues/205) — Web dashboard (future)

## License

MIT
