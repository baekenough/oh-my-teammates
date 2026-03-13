export type { AgentCatalogEntry, AgentCategory } from './agent-catalog';
export {
  AGENT_CATALOG,
  getAllCategories,
  getCatalogByCategory,
  getCatalogEntry,
} from './agent-catalog';
export type { DoctorCheckResult, DoctorOptions } from './doctor';
export { runDoctor } from './doctor';
export type { LockEntry, VerifyResult } from './lockfile';
export { LockfileManager } from './lockfile';
export type { ParsedDependencies } from './manifest-parser';
export { parseManifest } from './manifest-parser';
export { TEAM_DIR, TEAM_PATHS } from './paths';
export type { AgentRecommendation } from './recommender';
export { Recommender } from './recommender';
export { ReportGenerator } from './report';
export { SessionLogger } from './session-logger';
export { Stewards } from './stewards';
export { TeamConfig } from './team-config';
export type { TodoItem } from './team-todo';
export { TeamTodo } from './team-todo';
export type { UpdateCheckResult } from './version-checker';
export { checkForUpdate, compareSemver } from './version-checker';
