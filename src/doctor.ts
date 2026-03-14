/**
 * Team health check framework.
 * Aggregates validation from TeamConfig, Stewards, and LockfileManager.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LockfileManager } from './lockfile';
import { TEAM_PATHS } from './paths';
import { Stewards } from './stewards';
import { TeamConfig } from './team-config';
import { checkForUpdate } from './version-checker';

export interface DoctorCheckResult {
  check: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface DoctorOptions {
  config?: boolean;
  stewards?: boolean;
  updates?: boolean;
  locks?: boolean;
}

const PACKAGE_NAME = '@oh-my-customcode/oh-my-teammates';
const CURRENT_VERSION = '0.8.1';

export async function runDoctor(
  options: DoctorOptions,
  basePath = '.',
): Promise<DoctorCheckResult[]> {
  const results: DoctorCheckResult[] = [];
  const runAll = !options.config && !options.stewards && !options.updates && !options.locks;

  if (runAll || options.config) {
    results.push(...checkConfig(basePath));
  }

  if (runAll || options.stewards) {
    results.push(...checkStewards(basePath));
  }

  if (runAll || options.locks) {
    results.push(...checkLocks(basePath));
  }

  // --updates is opt-in only (not included in runAll) because it makes
  // a network call to npm registry. Avoid slowing down local health checks.
  if (options.updates) {
    const updateResult = await checkUpdates();
    if (updateResult) {
      results.push(updateResult);
    }
  }

  return results;
}

function checkConfig(basePath: string): DoctorCheckResult[] {
  const results: DoctorCheckResult[] = [];
  const teamYamlPath = join(basePath, TEAM_PATHS.TEAM_YAML);

  if (!existsSync(teamYamlPath)) {
    results.push({
      check: 'team.yaml',
      status: 'fail',
      message: `${TEAM_PATHS.TEAM_YAML} not found. Run 'omcustom-team init' first.`,
    });
    return results;
  }

  try {
    const config = new TeamConfig(teamYamlPath);
    const data = config.load();
    results.push({
      check: 'team.yaml',
      status: 'pass',
      message: `Valid (${data.team.members.length} members)`,
    });
  } catch (err) {
    results.push({
      check: 'team.yaml',
      status: 'fail',
      message: `Invalid: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return results;
}

function checkStewards(basePath: string): DoctorCheckResult[] {
  const results: DoctorCheckResult[] = [];
  const stewardsPath = join(basePath, TEAM_PATHS.STEWARDS_YAML);

  if (!existsSync(stewardsPath)) {
    results.push({
      check: 'STEWARDS.yaml',
      status: 'fail',
      message: `${TEAM_PATHS.STEWARDS_YAML} not found. Run 'omcustom-team init' first.`,
    });
    return results;
  }

  try {
    const stewards = new Stewards(stewardsPath);
    stewards.load();
    const domains = stewards.getDomains();

    results.push({
      check: 'STEWARDS.yaml',
      status: 'pass',
      message: `Valid (${Object.keys(domains).length} domains)`,
    });

    // Check coverage gaps — use for loop for Linux coverage
    const gaps: string[] = [];
    for (const [domain, steward] of Object.entries(domains)) {
      if (steward.backup === null) {
        gaps.push(domain);
      }
    }

    if (gaps.length > 0) {
      results.push({
        check: 'steward-coverage',
        status: 'warn',
        message: `${gaps.length} domain(s) without backup steward: ${gaps.join(', ')}`,
      });
    } else {
      results.push({
        check: 'steward-coverage',
        status: 'pass',
        message: 'All domains have backup stewards',
      });
    }
  } catch (err) {
    results.push({
      check: 'STEWARDS.yaml',
      status: 'fail',
      message: `Invalid: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return results;
}

function checkLocks(basePath: string): DoctorCheckResult[] {
  const manager = new LockfileManager(basePath);
  const verifyResults = manager.verifyAll();

  if (verifyResults.length === 0) {
    return [
      {
        check: 'file-integrity',
        status: 'pass',
        message: 'No locked files to verify',
      },
    ];
  }

  const failures: string[] = [];
  for (const r of verifyResults) {
    if (!r.ok) {
      failures.push(r.path);
    }
  }

  if (failures.length > 0) {
    return [
      {
        check: 'file-integrity',
        status: 'fail',
        message: `${failures.length} file(s) modified since lock: ${failures.map((f) => f.split('/').pop() ?? f).join(', ')}`,
      },
    ];
  }

  return [
    {
      check: 'file-integrity',
      status: 'pass',
      message: `All ${verifyResults.length} locked file(s) intact`,
    },
  ];
}

async function checkUpdates(): Promise<DoctorCheckResult | null> {
  const result = await checkForUpdate(PACKAGE_NAME, CURRENT_VERSION);

  if (result === null) {
    return {
      check: 'updates',
      status: 'warn',
      message: 'Could not check for updates (network unavailable or timeout)',
    };
  }

  if (result.updateAvailable) {
    return {
      check: 'updates',
      status: 'warn',
      message: `Update available: ${result.current} → ${result.latest}`,
    };
  }

  return {
    check: 'updates',
    status: 'pass',
    message: `Up to date (${result.current})`,
  };
}
