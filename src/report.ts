/**
 * Report generation
 * Aggregates data from all sources and produces a static HTML report
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { TEAM_PATHS } from './paths';
import type { ReportData } from './report-template';
import { generateReportHtml } from './report-template';
import { SessionLogger } from './session-logger';
import { Stewards } from './stewards';
import { TeamConfig } from './team-config';
import type { TodoItem } from './team-todo';
import { TeamTodo } from './team-todo';

export interface ReportOptions {
  output?: string;
  days?: number;
  open?: boolean;
  excludeDomains?: string[];
}

export class ReportGenerator {
  private basePath: string;

  constructor(basePath = '.') {
    this.basePath = basePath;
  }

  async generate(options: ReportOptions = {}): Promise<string> {
    const outputPath = resolve(this.basePath, options.output ?? TEAM_PATHS.REPORT_HTML);
    const days = options.days;

    // 1. Collect data from all sources (graceful fallback)
    const teamConfig = this.collectTeamConfig();
    const domainsMap = this.collectDomains();
    const filteredDomains = this.applyDomainFilter(domainsMap, options.excludeDomains ?? []);
    const todoItems = this.collectTodos();
    const sessionData = this.collectSessionData(days);
    const coverageGaps = this.computeCoverageGaps(filteredDomains);

    // 2. Build ReportData
    const teamName = teamConfig?.name ?? 'Team';
    const members = teamConfig?.members ?? [];
    const domains = filteredDomains ?? {};

    const todos = todoItems !== null ? this.summarizeTodos(todoItems) : null;

    const recentSessions = sessionData?.recentSessions ?? [];

    const reportData: ReportData = {
      generatedAt: new Date().toISOString(),
      teamName,
      memberCount: members.length,
      domainCount: Object.keys(domains).length,
      members,
      domains,
      sessionStats: sessionData?.stats ?? null,
      eventStats: sessionData?.eventStats ?? null,
      userActivity: sessionData?.activeUsers ?? null,
      branchDistribution: sessionData?.branchDistribution ?? null,
      recentSessions,
      todos,
      coverageGaps,
    };

    // 3. Generate HTML
    const html = generateReportHtml(reportData);

    // 4. Write to file
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outputPath, html, 'utf-8');

    // 5. Optionally open in browser (macOS only)
    /* istanbul ignore next -- platform-specific: macOS only */
    if (options.open === true && process.platform === 'darwin') {
      Bun.spawn(['open', outputPath]);
    }

    return outputPath;
  }

  // ── Private data collectors ───────────────────────────────────────────────

  private collectTeamConfig(): { name: string; members: ReportData['members'] } | null {
    const configPath = resolve(this.basePath, TEAM_PATHS.TEAM_YAML);
    try {
      const config = new TeamConfig(configPath);
      if (!config.exists()) {
        return null;
      }
      const data = config.load();
      return {
        name: data.team.name,
        members: data.team.members.map((m) => ({
          github: m.github,
          name: m.name,
          role: m.role,
          domains: m.domains,
        })),
      };
    } catch {
      return null;
    }
  }

  private collectDomains(): ReportData['domains'] | null {
    const stewardsPath = resolve(this.basePath, TEAM_PATHS.STEWARDS_YAML);
    try {
      const stewards = new Stewards(stewardsPath);
      if (!stewards.exists()) {
        return null;
      }
      stewards.load();
      const raw = stewards.getDomains();
      const result: ReportData['domains'] = {};
      for (const [domain, steward] of Object.entries(raw)) {
        result[domain] = {
          primary: steward.primary,
          backup: steward.backup,
          paths: steward.paths,
        };
      }
      return result;
    } catch {
      return null;
    }
  }

  private collectTodos(): TodoItem[] | null {
    const todoPath = resolve(this.basePath, TEAM_PATHS.TODO_MD);
    try {
      const todo = new TeamTodo(todoPath);
      if (!todo.exists()) {
        return null;
      }
      return todo.load();
    } catch {
      return null;
    }
  }

  private summarizeTodos(items: TodoItem[]): ReportData['todos'] {
    let completed = 0;
    const byPriority: Record<string, number> = {};
    for (const item of items) {
      if (item.completed) {
        completed++;
      }
      byPriority[item.priority] = (byPriority[item.priority] ?? 0) + 1;
    }
    return {
      total: items.length,
      completed,
      pending: items.length - completed,
      byPriority,
    };
  }

  private collectSessionData(days?: number): {
    stats: ReportData['sessionStats'];
    eventStats: ReportData['eventStats'];
    activeUsers: ReportData['userActivity'];
    branchDistribution: ReportData['branchDistribution'];
    recentSessions: ReportData['recentSessions'];
  } | null {
    const dbPath = resolve(this.basePath, TEAM_PATHS.SESSIONS_DB);
    let logger: SessionLogger | null = null;
    try {
      if (!existsSync(dbPath)) {
        return null;
      }
      logger = new SessionLogger(dbPath);
      const stats = logger.getSessionStats(days);
      const eventStats = logger.getEventStats(days);
      const activeUsers = logger.getActiveUsers(days);
      const branchDistribution = logger.getBranchDistribution(days);
      const recentSessions = logger.listSessions({ limit: 20 }).map((s) => ({
        id: s.id,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        user: s.user,
        branch: s.branch,
        summary: s.summary,
      }));
      return { stats, eventStats, activeUsers, branchDistribution, recentSessions };
    } catch {
      return null;
    } finally {
      logger?.close();
    }
  }

  private applyDomainFilter(
    domains: ReportData['domains'] | null,
    exclude: string[],
  ): ReportData['domains'] | null {
    if (domains === null || exclude.length === 0) {
      return domains;
    }
    const excludeSet = new Set(exclude);
    const filtered: ReportData['domains'] = {};
    for (const [domain, steward] of Object.entries(domains)) {
      if (!excludeSet.has(domain)) {
        filtered[domain] = steward;
      }
    }
    return filtered;
  }

  private computeCoverageGaps(domains: ReportData['domains'] | null): string[] {
    if (domains === null) {
      return [];
    }
    const gaps: string[] = [];
    for (const [domain, steward] of Object.entries(domains)) {
      if (steward.backup === null) {
        gaps.push(domain);
      }
    }
    return gaps;
  }
}
