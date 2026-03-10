# Architecture Guide — oh-my-teammates

> Version 0.5.1 | Runtime: Bun | Language: TypeScript (strict mode)

## Overview

**oh-my-teammates** is a team collaboration addon for [oh-my-customcode](https://github.com/baekenough/oh-my-customcode). It extends the personal agent harness model to cover entire development teams, providing:

- **Team configuration** — member registry with roles and domain assignments (`team.yaml`)
- **Session logging** — persistent SQLite-based activity tracking per developer session
- **Domain stewardship** — 8-domain ownership model with automatic CODEOWNERS generation
- **Task management** — structured team TODO with priority levels and steward-based auto-assignment
- **Project scaffolding** — automated project scanning and configuration bootstrapping
- **CLI** — `omcustom-team` binary for day-to-day team operations
- **Dashboard** — SvelteKit visualization layer for the team's agent/skill/rule inventory
- **Agent recommendation** — 4-layer confidence scoring engine for tech stack analysis (`recommender.ts`)
- **Report generation** — static HTML reports aggregating team, session, steward, and TODO data (`report.ts`)

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          omcustom-team CLI                           │
│                              (cli.ts)                                │
│      init  │  todo  │  recommend  │  report  │  status               │
├────────────┴────────┴─────────────┴──────────┴───────────────────────┤
│                                                                       │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │ TeamConfig  │  │ Stewards │  │ SessionLogger │  │  TeamTodo   │  │
│  │ team.yaml   │  │STEWARDS  │  │  bun:sqlite   │  │  TODO.md    │  │
│  │ CRUD +      │  │.yaml +   │  │  WAL mode     │  │  priority + │  │
│  │ validation  │←→│CODEOWNERS│←─│  sessions +   │  │  auto-      │  │
│  └─────────────┘  │generation│  │  events       │  │  assign     │──┤
│                    └─────┬───┘  └───────────────┘  └─────────────┘  │
│                          │              │                  │          │
│                          │              ▼                  │          │
│  ┌─────────────┐         │    ┌───────────────┐           │          │
│  │ Recommender │         │    │ReportGenerator│◄──────────┘          │
│  │ 4-layer     │         │    │ HTML output   │                      │
│  │ scoring     │         └───►│ aggregates    │                      │
│  │             │              │ all modules   │                      │
│  └──────┬──────┘              └───────────────┘                      │
│         │                                                             │
│  ┌──────┴──────┐  ┌──────────────┐                                   │
│  │AgentCatalog │  │ManifestParser│                                   │
│  │ 41 agents   │  │ package.json │                                   │
│  │ detection   │  │ go.mod, etc  │                                   │
│  │ rules       │  │              │                                   │
│  └─────────────┘  └──────────────┘                                   │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                          init.ts                              │   │
│  │   scanProject() → scaffoldTeamDir() → scaffoldClaudeMd()      │   │
│  └───────────────────────────────────────────────────────────────┘   │
├───────────────────────────────────────────────────────────────────────┤
│                        Public API (index.ts)                          │
│  TeamConfig │ SessionLogger │ Stewards │ TeamTodo │ Recommender       │
│  ReportGenerator │ AgentCatalog │ ManifestParser                      │
├───────────────────────────────────────────────────────────────────────┤
│                       SvelteKit Dashboard                             │
│             dashboard/ → adapter-static → GitHub Pages                │
└───────────────────────────────────────────────────────────────────────┘
```

## Core Modules

### TeamConfig (`src/team-config.ts`)

Manages `team.yaml` — the authoritative registry of team members.

**Key types:**

```typescript
interface TeamMember {
  github: string;           // GitHub username (primary key)
  name: string;             // Display name
  role: 'admin' | 'member'; // Access tier
  domains: string[];        // Domain responsibilities
}

interface TeamConfigData {
  team: { name: string; version: string; members: TeamMember[] };
}
```

**Responsibilities:**
- Load and parse `team.yaml` with full schema validation (every field checked at runtime)
- CRUD operations: `addMember`, `removeMember`, `updateMember`, `getMember`
- Role-based queries: `getAdmins()`, `getMembersByDomain(domain)`
- Lazy loading with in-memory cache; explicit `save()` flushes to disk
- Static factory `createTemplate()` for project bootstrapping

**Data flow:** `load()` → validate → cache → mutate in memory → `save()` to YAML

---

### SessionLogger (`src/session-logger.ts`)

Tracks Claude Code sessions per developer using `bun:sqlite` in WAL mode.

**Schema:**

```
sessions
  id TEXT PK        — "{date}-{pid}-{uuid8}"
  started_at TEXT   — ISO 8601
  ended_at TEXT     — ISO 8601 (nullable)
  user TEXT         — GitHub username
  branch TEXT       — Git branch at session start
  summary TEXT      — End-of-session summary (nullable)

session_events
  id INTEGER PK AUTOINCREMENT
  session_id TEXT FK → sessions.id
  timestamp TEXT    — ISO 8601
  type TEXT         — file_change | command | agent_spawn | error | note
  data TEXT         — JSON payload
```

**Responsibilities:**
- `startSession(user, branch)` — opens a new session row, returns session ID
- `logEvent(type, data)` — appends an event to the active session
- `endSession(summary?)` — closes the session with timestamp and optional summary
- `listSessions({ user?, limit? })` — filtered session history
- `getSessionEvents(sessionId)` — full event timeline for a session
- WAL journal mode ensures concurrent read safety during active sessions

**Data flow:** `startSession` → `logEvent` (multiple) → `endSession` → exportable via `getSession` / `listSessions`

---

### Stewards (`src/stewards.ts`)

Manages `STEWARDS.yaml` — the domain ownership registry — and generates `.github/CODEOWNERS`.

**Key types:**

```typescript
interface DomainSteward {
  primary: string;      // GitHub username of primary owner
  backup: string | null; // Fallback owner
  paths: string[];      // Glob patterns for this domain
}

interface StewardsData {
  stewards: { version: string; domains: Record<string, DomainSteward> };
}
```

**The 8 default domains:**

| Domain | Default path patterns |
|--------|-----------------------|
| `languages` | `**/*.ts`, `**/*.py`, `**/*.go`, `**/*.kt`, `**/*.rs`, `**/*.java` |
| `frontend` | `src/components/**`, `dashboard/**`, `**/*.svelte`, `**/*.tsx` |
| `backend` | `src/api/**`, `src/server/**`, `routes/**` |
| `data-engineering` | `dags/**`, `pipelines/**`, `models/**` |
| `infrastructure` | `Dockerfile`, `.github/**`, `terraform/**` |
| `database` | `**/*.sql`, `migrations/**`, `schema/**` |
| `quality` | `**/*.test.ts`, `**/*.spec.ts`, `__tests__/**` |
| `documentation` | `docs/**`, `**/*.md`, `guides/**` |

**Responsibilities:**
- Load/save `STEWARDS.yaml` with strict runtime validation
- `findDomainForPath(filePath)` — glob-matches a file to its domain (custom glob engine, no regex shortcuts)
- `findStewardForFile(filePath)` — returns `{ domain, primary, backup }` for a file
- `generateCodeowners()` — renders the full CODEOWNERS file content from loaded data
- `writeCodeowners(outputPath?)` — writes CODEOWNERS to `.github/CODEOWNERS`
- Static `createTemplate()` scaffolds all 8 domains with placeholder values

**Glob engine:** Custom character-by-character parser handles `**`, `*`, directory prefixes, and extension wildcards without chaining string replacements (avoids double-substitution bugs).

**Data flow:** `STEWARDS.yaml` → `load()` → `validate()` → `generateCodeowners()` → `.github/CODEOWNERS`

---

### TeamTodo (`src/team-todo.ts`)

Parses and manages `.claude/team/TODO.md` — a structured, git-tracked shared task list.

**TodoItem structure:**

```typescript
interface TodoItem {
  scope: 'team' | 'personal'; // Visibility scope
  priority: 'P0' | 'P1' | 'P2'; // P0 = critical, P2 = low
  description: string;
  assignee: string | null;    // GitHub username
  domain: string | null;      // Domain for auto-assignment
  completed: boolean;
}
```

**Line format in TODO.md:**

```
## team: [P0] Fix Guardian CI false positive — @john-doe (languages)
## ~~personal: [P2] Review session logs — @john-doe~~   ← completed
```

**Responsibilities:**
- `load()` — regex-based line parser, preserves file header lines
- `add(item)` — appends a new item (always `completed: false`)
- `complete(index)` — marks an item done (renders with `~~strikethrough~~`)
- `list(filter?)` — filtered view by scope, priority, or assignee
- `autoAssign(stewardsPath?)` — for items with a domain but no assignee, looks up the primary steward from `STEWARDS.yaml` and fills the assignee field
- Static `createTemplate()` writes an example TODO.md

**Integration with Stewards:** `autoAssign()` instantiates a `Stewards` object internally. If `STEWARDS.yaml` is absent, it returns 0 (no-op) rather than throwing.

---

## Steward Concept Deep Dive

### Purpose

Stewards answer the fundamental team question: **"Who is responsible for this code?"**

Rather than managing CODEOWNERS manually at the file level, Stewards introduce a **domain abstraction layer**. You declare ownership at the domain level, and the system handles file-to-owner mapping automatically.

### Core Value Proposition

| Aspect | Traditional (CODEOWNERS) | Steward System |
|--------|--------------------------|----------------|
| Granularity | File/directory paths | **Domain** (8 semantic categories) |
| Maintenance | Manual edits, easily outdated | Declarative YAML, auto-generates CODEOWNERS |
| Task assignment | Manual per-task | Auto-assign via domain lookup |
| Discoverability | Grep through CODEOWNERS | `findStewardForFile(path)` API |
| Coverage visibility | None | Report highlights unowned domains |

### How the Mapping Works

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   File Changed    │     │   Domain Match    │     │  Steward Found   │
│                   │     │                   │     │                  │
│ src/api/auth.ts   │────►│ backend           │────►│ primary: alice   │
│                   │ glob│ (src/api/**)       │     │ backup:  bob     │
└──────────────────┘match └──────────────────┘     └──────────────────┘
```

The `findStewardForFile()` method:
1. Iterates through all domains in `STEWARDS.yaml`
2. For each domain, tests the file path against every glob pattern in `paths[]`
3. Returns the first matching domain's `primary` and `backup` steward
4. Returns `undefined` if no domain claims the file (coverage gap)

### Integration Points

```
STEWARDS.yaml ─────────────────────────────────┐
     │                                          │
     ├─► generateCodeowners()                   │
     │     └─► .github/CODEOWNERS               │
     │           └─► GitHub auto-assigns         │
     │               PR reviewers                │
     │                                          │
     ├─► TeamTodo.autoAssign()                  │
     │     └─► TODO items with domain but       │
     │         no assignee get primary steward   │
     │                                          │
     ├─► ReportGenerator                        │
     │     └─► Coverage gap analysis            │
     │         (domains with no steward)         │
     │                                          │
     └─► findStewardForFile(path)               │
           └─► Runtime query: "who owns this?"  │
```

### Practical Example

Given this `STEWARDS.yaml`:

```yaml
stewards:
  version: "1.0"
  domains:
    frontend:
      primary: carol
      backup: dave
      paths:
        - src/components/**
        - "**/*.svelte"
        - "**/*.tsx"
    backend:
      primary: alice
      backup: bob
      paths:
        - src/api/**
        - src/server/**
```

**Scenario 1: PR Review**
A PR modifies `src/api/auth.ts` → Stewards generates CODEOWNERS → GitHub assigns `@alice` and `@bob` as reviewers automatically.

**Scenario 2: TODO Auto-Assignment**
```
Before: ## team: [P0] Fix auth bug — (backend)     ← no assignee
After:  ## team: [P0] Fix auth bug — @alice (backend) ← auto-assigned
```

**Scenario 3: Coverage Gap Detection**
If `data-engineering` domain has `primary: null`, the report flags it as an unowned domain requiring attention.

---

### init (`src/init.ts`)

Project scanning and bootstrapping entry point.

**Responsibilities:**
- `scanProject(rootDir?)` — walks the project tree (skipping `node_modules`, `.git`, `dist`, etc.) and returns:
  - `detectedDomains` — which of the 8 default domains have matching files
  - `filePatterns` — extension frequency map (`{ '.ts': 42, '.py': 7, ... }`)
  - `dependencies` — detected manifest files (`package.json`, `go.mod`, `Cargo.toml`, etc.)
  - `suggestedStewards` — domain → matched file paths for STEWARDS.yaml seeding
- `scaffoldTeamDir(rootDir?)` — creates `.claude/team/` with a starter `TODO.md`
- `initTeam(rootDir?)` — orchestrates the full init flow:
  1. `scanProject()`
  2. `scaffoldTeamDir()`
  3. `TeamConfig.createTemplate()` (if `team.yaml` absent)
  4. `Stewards.createTemplate()` (if `STEWARDS.yaml` absent)
- `detectProjectName(rootDir)` — reads `package.json` name or falls back to directory basename

**Directory walker:** Uses `lstatSync` (not `statSync`) to avoid following symlinks into infinite loops.

---

### CLI (`src/cli.ts`)

Entry point for the `omcustom-team` binary, exported from `dist/cli.js`.

**Commands:**

| Command | Action |
|---------|--------|
| `omcustom-team init` | Run `initTeam()`, print detected domains and output paths |
| `omcustom-team todo list` | Load and print all TODO items with status indicators |
| `omcustom-team todo add <description>` | Add a `team` / `P1` item to TODO.md |

**Exit codes:** Exits with code `1` on missing required arguments or missing TODO.md when `list` is called before `init`.

---

### Recommender (`src/recommender.ts`)

Scans a project directory and produces ranked agent recommendations based on tech stack analysis.

**Key types:**

```typescript
interface AgentRecommendation {
  agent: string;         // Agent name from catalog
  category: AgentCategory;
  description: string;
  confidence: number;    // 0.0 - 1.0
  reasons: string[];     // Human-readable match reasons
}
```

**4-layer confidence scoring:**

| Layer | Signal | Max Confidence | Example |
|-------|--------|---------------|---------|
| 1. File extensions | `*.ts`, `*.py`, `*.go` | 0.5 | "42 .ts files found" |
| 2. Config files | `tsconfig.json`, `Cargo.toml` | 0.8 | "tsconfig.json found" |
| 3. Directory patterns | `dags/`, `migrations/` | 0.6 | "dags/ directory found" |
| 4. Manifest dependencies | `react` in package.json | 0.9 | "react, next in package.json" |

**Scoring algorithm:** Each layer produces a confidence score. The final confidence is `max(all layer scores)`, capped at 1.0. Higher layers (dependencies) override lower layers (extensions) when present.

**Data flow:** `scanFiles()` → `parseManifests()` → `scoreAgent()` per catalog entry → sort by confidence → filter by `minConfidence`

---

### ReportGenerator (`src/report.ts`)

Aggregates data from all core modules and produces a self-contained static HTML report.

**Data sources:**

| Source | Data Collected |
|--------|---------------|
| `TeamConfig` | Team name, member list |
| `Stewards` | Domain ownership map, coverage gaps |
| `TeamTodo` | Open/completed items, priority distribution |
| `SessionLogger` | Recent sessions, event stats, user activity |

**Report sections:** Team overview, domain stewardship matrix, TODO summary, session activity, coverage gap analysis.

**Output:** Single `.html` file at `.claude/team/report.html` (configurable). No external dependencies — all CSS/JS is inlined.

**Graceful degradation:** Each data source is independently collected. If `team.yaml` is missing, the report still generates with available data. No single missing file blocks report generation.

---

## Data Flow

```
omcustom-team init
  │
  ├─ scanProject()
  │     walk file tree → detect domains, extensions, manifests
  │
  ├─ scaffoldTeamDir()
  │     mkdir .claude/team/ + write TODO.md template
  │
  ├─ TeamConfig.createTemplate(team.yaml)
  │     write team.yaml with placeholder member
  │
  └─ Stewards.createTemplate(STEWARDS.yaml)
        write STEWARDS.yaml with all 8 domains

──── After manual editing of team.yaml / STEWARDS.yaml ────

TeamTodo.autoAssign()
  │
  ├─ load STEWARDS.yaml via Stewards.load()
  └─ for each TODO item with domain but no assignee:
        stewards.getDomain(domain).primary → item.assignee

SessionLogger.startSession(user, branch)
  │
  ├─ INSERT into sessions table
  ├─ logEvent(type, data) → INSERT into session_events
  └─ endSession(summary) → UPDATE sessions.ended_at

Stewards.writeCodeowners()
  │
  ├─ generateCodeowners() → format each domain's paths + owners
  └─ write to .github/CODEOWNERS

Recommender.recommend()
  │
  ├─ scanFiles()
  │     walk project tree → collect extensions, config files, directories
  │
  ├─ parseManifests()
  │     detect package.json, go.mod, etc. → extract dependencies
  │
  └─ scoreAgent() × N catalog entries
        4-layer scoring → sort by confidence → return recommendations

ReportGenerator.generate()
  │
  ├─ collectTeamConfig()    → team.yaml data
  ├─ collectDomains()       → STEWARDS.yaml data
  ├─ collectTodos()         → TODO.md items
  ├─ collectSessionData()   → SQLite session stats
  ├─ computeCoverageGaps()  → unowned domains
  └─ generateReportHtml()   → single HTML file output
```

## Dashboard

The `dashboard/` subdirectory is a standalone SvelteKit application.

**Architecture:**
- **Framework:** SvelteKit with `@sveltejs/adapter-static`
- **Output:** Fully static HTML/CSS/JS bundle (no server required)
- **Deployment:** GitHub Actions auto-deploy to GitHub Pages on push to `main`
- **Data source:** A `data.json` file generated from the project's `.claude/` directory (agents, skills, rules, guides)

**Views:**
- Agents — browse registered agents with frontmatter details and capability descriptions
- Skills — explore skill definitions and their agent associations
- Rules — view MUST/SHOULD/MAY rules sorted by priority level
- Guides — access developer guides and reference documentation

**Features:** Dark mode, mobile-responsive layout.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun >= 1.0.0 |
| Language | TypeScript (strict mode) |
| Database | bun:sqlite (WAL journal mode) |
| Config format | YAML via `yaml` ^2.7.0 |
| Dashboard | SvelteKit + @sveltejs/adapter-static |
| Linting / Formatting | Biome ^1.9.0 (strict ruleset) |
| Git hooks | Husky ^9.1.7 + lint-staged ^16.3.2 |
| Test coverage | Bun test, 99% coverage gate |
| CI/CD | GitHub Actions |
| Package registry | npm (public, scoped: `@oh-my-customcode/`) |

## Directory Structure

```
oh-my-teammates/
├── src/
│   ├── index.ts           — Public API exports
│   ├── cli.ts             — omcustom-team CLI entry point
│   ├── team-config.ts     — TeamConfig class (team.yaml)
│   ├── session-logger.ts  — SessionLogger class (bun:sqlite)
│   ├── stewards.ts        — Stewards class (STEWARDS.yaml + CODEOWNERS)
│   ├── team-todo.ts       — TeamTodo class (TODO.md)
│   └── init.ts            — scanProject + initTeam
├── dashboard/
│   ├── src/               — SvelteKit app source
│   └── package.json       — Dashboard dependencies
├── templates/             — Distributed config templates
├── dist/                  — Build output (gitignored)
│   ├── index.js           — Library entry
│   ├── index.d.ts         — Type declarations
│   └── cli.js             — CLI binary
├── .claude/
│   ├── agents/            — oh-my-customcode agent definitions
│   ├── skills/            — Skill definitions
│   ├── rules/             — MUST/SHOULD/MAY rules
│   └── team/              — Shared team data (sessions.db, TODO.md)
├── guides/                — Developer reference guides
├── team.yaml              — Team member registry (project root)
├── STEWARDS.yaml          — Domain ownership (project root)
├── package.json
├── CHANGELOG.md
└── README.md
```

## CI/CD Workflows

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `ci.yml` | PR | Lint (Biome) → Typecheck → Test (99% gate) → Build |
| `guardian.yml` | PR (`.claude/**` changes) | Validate agents, skills, STEWARDS.yaml, team.yaml |
| `claude-native-check.yml` | Weekly / manual | Official docs compliance check |
| `security-audit.yml` | Weekly / PR | Dependency vulnerability scan |
| `release.yml` | Tag push (`v*`) | Build → npm publish → GitHub Release |
