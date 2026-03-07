# {project-name}

## Team Collaboration

This project uses [oh-my-teammates](https://github.com/baekenough/oh-my-teammates) for team collaboration.

### Team Files

| File | Purpose |
|------|---------|
| `team.yaml` | Team member mapping and roles |
| `STEWARDS.yaml` | Domain ownership assignments |
| `.claude/team/TODO.md` | Shared team tasks |

### Steward Delegation

Code review assignments follow domain stewardship defined in `STEWARDS.yaml`.
Each domain has a primary and backup steward for review routing.

### Session Sharing

Team sessions are shared via `.claude/team/`:
- `shared-memory/` — Cross-team learnings
- `session-logs/` — Session summaries
- `employees/` — Per-member profiles

### Guardian CI

Harness integrity is validated on every PR targeting `main` or `develop`.
Changes in `.claude/` trigger automated validation (~860ms).

### Team TODO

Team tasks are tracked in `.claude/team/TODO.md`.
Use `bunx omcustom-team todo list` and `bunx omcustom-team todo add` to manage tasks.
