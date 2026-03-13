/**
 * Centralized path constants for team directory structure.
 * All team-related file paths derive from TEAM_DIR.
 */

export const TEAM_DIR = '.claude/team' as const;

export const TEAM_PATHS = {
  TEAM_YAML: `${TEAM_DIR}/team.yaml`,
  STEWARDS_YAML: `${TEAM_DIR}/STEWARDS.yaml`,
  TODO_MD: `${TEAM_DIR}/TODO.md`,
  SESSIONS_DB: `${TEAM_DIR}/sessions.db`,
  REPORT_HTML: `${TEAM_DIR}/report.html`,
  LOCKFILE: `${TEAM_DIR}/.lockfile.json`,
} as const;

export type TeamPathKey = keyof typeof TEAM_PATHS;
