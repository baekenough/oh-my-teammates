/**
 * Project initialization
 * Analyzes existing project to recommend team configuration
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join } from 'node:path';
import { TEAM_DIR, TEAM_PATHS } from './paths';
import { DEFAULT_DOMAINS, Stewards } from './stewards';
import { TeamConfig } from './team-config';

/** Directories to skip when scanning the project tree. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.claude',
  '.next',
  '.nuxt',
  'build',
  'out',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
  'target',
]);

/** Dependency manifest filenames that signal specific ecosystems. */
const DEPENDENCY_FILES = [
  'package.json',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
  'Gemfile',
  'composer.json',
] as const;

export interface ProjectScanResult {
  /** Which of the 8 DEFAULT_DOMAINS are present */
  detectedDomains: string[];
  /** Extension -> file count */
  filePatterns: Record<string, number>;
  /** Detected dependency manifest paths (relative to rootDir) */
  dependencies: string[];
  /** domain -> suggested paths that matched that domain's glob patterns */
  suggestedStewards: Record<string, string[]>;
  /** Whether the .claude/skills/analysis/ directory is present at runtime */
  analysisSkillAvailable: boolean;
}

// ── Directory walker ─────────────────────────────────────────────────────────

/**
 * Recursively collect all file paths under `dir`, skipping SKIP_DIRS and
 * symbolic links that point to directories (to avoid infinite loops).
 */
function walkDir(dir: string, rootDir: string): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    // Permission errors or broken mounts — skip silently
    return results;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }

    const fullPath = join(dir, entry);

    let stat: ReturnType<typeof statSync>;
    try {
      // lstatSync does NOT follow symlinks; symlinked dirs are skipped below
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isSymbolicLink()) {
      // Skip symlinks entirely to avoid loops
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath, rootDir));
    } else if (stat.isFile()) {
      // Store paths relative to rootDir for readability
      results.push(fullPath.slice(rootDir.length).replace(/^[\\/]/, ''));
    }
  }

  return results;
}

// ── Pattern helpers ───────────────────────────────────────────────────────────

/**
 * Minimal glob matcher for DEFAULT_DOMAINS patterns.
 * Handles:
 *   - Exact basename matches (e.g. "Dockerfile")
 *   - Extension wildcards like "**\/*.ts"
 *   - Directory prefix patterns like "src/api/**"
 */
function matchesGlob(pattern: string, filePath: string): boolean {
  const normalPattern = pattern.replace(/\\/g, '/');
  const normalPath = filePath.replace(/\\/g, '/');

  // Exact match
  if (normalPattern === normalPath) {
    return true;
  }

  // Convert to regex
  const regexSource = normalPattern
    .replace(/[.+^${}()|[\]\\]/g, (ch) => `\\${ch}`)
    .replace(/\*\*\//g, '(?:.+/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');

  return new RegExp(`^${regexSource}$`).test(normalPath);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scan the project rooted at `rootDir` and return analysis results.
 *
 * - Counts file extensions across the project tree.
 * - Detects which DEFAULT_DOMAINS have matching files.
 * - Finds dependency manifests (package.json, go.mod, etc.).
 * - Suggests per-domain file paths for STEWARDS.yaml.
 */
export function scanProject(rootDir = '.'): ProjectScanResult {
  const absRoot = rootDir === '.' ? process.cwd() : rootDir;
  const allFiles = walkDir(absRoot, absRoot);

  // Count file extensions
  const filePatterns: Record<string, number> = {};
  for (const file of allFiles) {
    const ext = extname(file);
    if (ext) {
      filePatterns[ext] = (filePatterns[ext] ?? 0) + 1;
    } else {
      // Track extensionless files by basename (e.g. Makefile, Dockerfile)
      const name = basename(file);
      filePatterns[name] = (filePatterns[name] ?? 0) + 1;
    }
  }

  // Detect dependency manifests
  const dependencies: string[] = [];
  for (const file of allFiles) {
    if ((DEPENDENCY_FILES as readonly string[]).includes(basename(file))) {
      dependencies.push(file);
    }
  }

  // Match files against DEFAULT_DOMAINS patterns
  const suggestedStewards: Record<string, string[]> = {};
  const detectedDomainSet = new Set<string>();

  for (const [domain, patterns] of Object.entries(DEFAULT_DOMAINS)) {
    const matched: string[] = [];

    for (const file of allFiles) {
      for (const pattern of patterns) {
        if (matchesGlob(pattern, file)) {
          matched.push(file);
          break; // count each file once per domain
        }
      }
    }

    if (matched.length > 0) {
      detectedDomainSet.add(domain);
      suggestedStewards[domain] = matched;
    }
  }

  // Detect /analysis skill availability at runtime
  const analysisSkillAvailable = existsSync(join(absRoot, '.claude', 'skills', 'analysis'));

  return {
    detectedDomains: Array.from(detectedDomainSet).sort(),
    filePatterns,
    dependencies,
    suggestedStewards,
    analysisSkillAvailable,
  };
}

// ── CLAUDE.md scaffolding ─────────────────────────────────────────────────────

/**
 * Generate the "## Team Collaboration" section content for CLAUDE.md.
 */
function generateTeamSection(): string {
  return `## Team Collaboration

This project uses [oh-my-teammates](https://github.com/baekenough/oh-my-teammates) for team collaboration.

### Team Files

| File | Purpose |
|------|---------|
| \`.claude/team/team.yaml\` | Team member mapping and roles |
| \`.claude/team/STEWARDS.yaml\` | Domain ownership assignments |
| \`.claude/team/TODO.md\` | Shared team tasks |

### Steward Delegation

Code review assignments follow domain stewardship defined in \`.claude/team/STEWARDS.yaml\`.
Each domain has a primary and backup steward for review routing.

### Session Sharing

Team sessions are shared via \`.claude/team/\`:
- \`shared-memory/\` — Cross-team learnings
- \`session-logs/\` — Session summaries
- \`employees/\` — Per-member profiles

### Guardian CI

Harness integrity is validated on every PR targeting \`main\` or \`develop\`.
Changes in \`.claude/\` trigger automated validation (~860ms).

### Team TODO

Team tasks are tracked in \`.claude/team/TODO.md\`.
Use \`bunx omcustom-team todo list\` and \`bunx omcustom-team todo add\` to manage tasks.`;
}

/**
 * Create or update `CLAUDE.md` in the given root directory with team collaboration content.
 *
 * - If `CLAUDE.md` does not exist: creates it with a project heading and the team section.
 * - If `CLAUDE.md` exists but has no team section: appends the team section.
 * - If `CLAUDE.md` already contains `## Team Collaboration`: leaves it untouched (idempotent).
 *
 * @returns `{ created, appended }` — exactly one will be `true` unless the file already had a team section.
 */
export function scaffoldClaudeMd(
  rootDir = '.',
  projectName = 'my-project',
): { created: boolean; appended: boolean } {
  const claudeMdPath = join(rootDir, 'CLAUDE.md');
  const teamSection = generateTeamSection();

  if (!existsSync(claudeMdPath)) {
    writeFileSync(claudeMdPath, `# ${projectName}\n\n${teamSection}\n`, 'utf-8');
    return { created: true, appended: false };
  }

  const existing = readFileSync(claudeMdPath, 'utf-8');
  if (existing.includes('## Team Collaboration')) {
    return { created: false, appended: false };
  }

  writeFileSync(claudeMdPath, `${existing.trimEnd()}\n\n${teamSection}\n`, 'utf-8');
  return { created: false, appended: true };
}

// ── Team directory scaffolding ────────────────────────────────────────────────

/**
 * Create the `.claude/team/` directory scaffold and a TODO.md template inside.
 *
 * @param analysisSkillAvailable - When true, a note about the /analysis skill is appended to TODO.md.
 */
export function scaffoldTeamDir(rootDir = '.', analysisSkillAvailable = false): void {
  const teamDir = join(rootDir, TEAM_DIR);
  mkdirSync(teamDir, { recursive: true });

  const todoPath = join(teamDir, 'TODO.md');
  if (!existsSync(todoPath)) {
    const lines = [
      '# Team TODO',
      '',
      'Track team-related tasks here.',
      '',
      '## Pending',
      '',
      '- [ ] Review and complete STEWARDS.yaml',
      '- [ ] Add team members to team.yaml',
      '- [ ] Configure domain ownership',
    ];

    if (analysisSkillAvailable) {
      lines.push(
        '',
        '## Analysis Skill',
        '',
        '- /analysis skill is available in .claude/skills/analysis/',
      );
    }

    lines.push('');
    writeFileSync(todoPath, lines.join('\n'), 'utf-8');
  }
}

/**
 * Migrate legacy root-level `team.yaml` and `STEWARDS.yaml` to `.claude/team/`.
 *
 * Only moves a file if the source exists at the project root AND the destination
 * does not yet exist (to avoid overwriting existing data). After copying, the
 * source file is removed.
 *
 * @returns Array of source paths that were successfully migrated.
 */
export function migrateTeamFiles(rootDir = '.'): string[] {
  const moved: string[] = [];
  const teamDir = join(rootDir, TEAM_DIR);
  const migrations: Array<[string, string]> = [
    [join(rootDir, 'team.yaml'), join(rootDir, TEAM_PATHS.TEAM_YAML)],
    [join(rootDir, 'STEWARDS.yaml'), join(rootDir, TEAM_PATHS.STEWARDS_YAML)],
  ];
  for (const [src, dest] of migrations) {
    if (existsSync(src) && !existsSync(dest)) {
      mkdirSync(teamDir, { recursive: true });
      const content = readFileSync(src, 'utf-8');
      writeFileSync(dest, content, 'utf-8');
      rmSync(src);
      moved.push(src);
    }
  }
  return moved;
}

/**
 * Run full project initialization:
 *
 * 1. Scan project for domains, file patterns, and dependency files.
 * 2. Migrate legacy root-level team files to `.claude/team/` (existing users).
 * 3. Scaffold `.claude/team/` directory with TODO.md.
 * 4. Create `.claude/team/team.yaml` template (if absent).
 * 5. Create `.claude/team/STEWARDS.yaml` draft (if absent).
 * 6. Create or update `CLAUDE.md` with team collaboration section.
 *
 * Returns paths to the created/located files plus the scan result.
 */
export async function initTeam(rootDir = '.'): Promise<{
  scanResult: ProjectScanResult;
  teamConfigPath: string;
  stewardsPath: string;
  teamDirPath: string;
  claudeMdPath: string;
  claudeMdResult: { created: boolean; appended: boolean };
}> {
  // 1. Scan project
  const scanResult = scanProject(rootDir);

  // 2. Migrate legacy root-level team files to .claude/team/ (for existing users)
  migrateTeamFiles(rootDir);

  // 3. Scaffold .claude/team/ directory (pass analysis skill availability)
  scaffoldTeamDir(rootDir, scanResult.analysisSkillAvailable);

  // 4. Create team.yaml template if it doesn't exist
  const teamConfigPath = join(rootDir, TEAM_PATHS.TEAM_YAML);
  if (!existsSync(teamConfigPath)) {
    const projectName = detectProjectName(rootDir);
    TeamConfig.createTemplate(teamConfigPath, projectName);
  }

  // 5. Create STEWARDS.yaml draft based on scan results
  const stewardsPath = join(rootDir, TEAM_PATHS.STEWARDS_YAML);
  if (!existsSync(stewardsPath)) {
    Stewards.createTemplate(stewardsPath);
  }

  // 6. Create or update CLAUDE.md with team collaboration section
  const projectName = detectProjectName(rootDir);
  const claudeMdPath = join(rootDir, 'CLAUDE.md');
  const claudeMdResult = scaffoldClaudeMd(rootDir, projectName);

  // 7. Register critical team files in lockfile
  const { LockfileManager } = await import('./lockfile');
  const lockMgr = new LockfileManager(rootDir);
  if (existsSync(teamConfigPath)) {
    lockMgr.lock(teamConfigPath);
  }
  if (existsSync(stewardsPath)) {
    lockMgr.lock(stewardsPath);
  }

  return {
    scanResult,
    teamConfigPath,
    stewardsPath,
    teamDirPath: join(rootDir, TEAM_DIR),
    claudeMdPath,
    claudeMdResult,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Detect project name from `package.json` or fall back to directory basename.
 */
export function detectProjectName(rootDir: string): string {
  const pkgPath = join(rootDir, 'package.json');

  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, 'utf-8');
      const pkg: unknown = JSON.parse(raw);
      if (
        typeof pkg === 'object' &&
        pkg !== null &&
        'name' in pkg &&
        typeof (pkg as Record<string, unknown>).name === 'string'
      ) {
        const name = (pkg as Record<string, unknown>).name as string;
        if (name.trim() !== '') {
          return name.trim();
        }
      }
    } catch {
      // Fall through to directory name
    }
  }

  return basename(rootDir === '.' ? process.cwd() : rootDir);
}
