import { existsSync, readFileSync, writeFileSync } from 'node:fs';
/**
 * Team configuration management
 * Reads and manages team.yaml for member mapping
 */
import { parse, stringify } from 'yaml';
import { TEAM_PATHS } from './paths';

export interface TeamMember {
  github: string;
  name: string;
  role: 'admin' | 'member';
  domains: string[];
}

export interface TeamConfigData {
  team: {
    name: string;
    version: string;
    members: TeamMember[];
  };
}

export class TeamConfig {
  private configPath: string;
  private data: TeamConfigData | null = null;

  constructor(configPath: string = TEAM_PATHS.TEAM_YAML) {
    this.configPath = configPath;
  }

  /**
   * Load and parse team.yaml from disk.
   * Caches the result; call again after external changes to reload.
   */
  load(): TeamConfigData {
    if (!existsSync(this.configPath)) {
      throw new Error(`Config file not found: ${this.configPath}`);
    }

    const raw = readFileSync(this.configPath, 'utf-8');
    const parsed: unknown = parse(raw);
    this.data = this.validate(parsed);
    return this.data;
  }

  /**
   * Persist the current in-memory state back to team.yaml.
   * Throws if no data has been loaded or created yet.
   */
  save(): void {
    if (this.data === null) {
      throw new Error('No data to save. Call load() or add members first.');
    }

    writeFileSync(this.configPath, stringify(this.data), 'utf-8');
  }

  /** Return all team members, loading the config if not already loaded. */
  getMembers(): TeamMember[] {
    return this.ensureLoaded().team.members;
  }

  /** Find a member by GitHub username. Returns undefined if not found. */
  getMember(github: string): TeamMember | undefined {
    return this.getMembers().find((m) => m.github === github);
  }

  /**
   * Add a new member.
   * Throws if a member with the same GitHub username already exists.
   */
  addMember(member: TeamMember): void {
    const data = this.ensureLoaded();

    if (data.team.members.some((m) => m.github === member.github)) {
      throw new Error(`Member already exists: ${member.github}`);
    }

    this.validateMember(member);
    data.team.members.push({ ...member });
  }

  /**
   * Remove a member by GitHub username.
   * Returns true if removed, false if not found.
   */
  removeMember(github: string): boolean {
    const data = this.ensureLoaded();
    const index = data.team.members.findIndex((m) => m.github === github);

    if (index === -1) {
      return false;
    }

    data.team.members.splice(index, 1);
    return true;
  }

  /**
   * Update a member's fields (excluding github, which is the key).
   * Returns true if updated, false if not found.
   */
  updateMember(github: string, updates: Partial<Omit<TeamMember, 'github'>>): boolean {
    const data = this.ensureLoaded();
    const member = data.team.members.find((m) => m.github === github);

    if (member === undefined) {
      return false;
    }

    if (updates.role !== undefined && !isValidRole(updates.role)) {
      throw new Error(`Invalid role: ${updates.role}. Must be "admin" or "member".`);
    }

    if (updates.name !== undefined) {
      member.name = updates.name;
    }

    if (updates.role !== undefined) {
      member.role = updates.role;
    }

    if (updates.domains !== undefined) {
      member.domains = [...updates.domains];
    }

    return true;
  }

  /** Return only members with the "admin" role. */
  getAdmins(): TeamMember[] {
    return this.getMembers().filter((m) => m.role === 'admin');
  }

  /** Return members whose domains list includes the given domain. */
  getMembersByDomain(domain: string): TeamMember[] {
    return this.getMembers().filter((m) => m.domains.includes(domain));
  }

  /**
   * Validate raw parsed data against the TeamConfigData schema.
   * Throws a descriptive Error on any violation.
   */
  validate(data: unknown): TeamConfigData {
    if (!isObject(data)) {
      throw new Error('Config must be a YAML object.');
    }

    if (!isObject(data.team)) {
      throw new Error('Config must have a "team" object.');
    }

    const team = data.team as Record<string, unknown>;

    if (typeof team.name !== 'string' || team.name.trim() === '') {
      throw new Error('"team.name" must be a non-empty string.');
    }

    if (typeof team.version !== 'string' || team.version.trim() === '') {
      throw new Error('"team.version" must be a non-empty string.');
    }

    if (!Array.isArray(team.members)) {
      throw new Error('"team.members" must be an array.');
    }

    const members: TeamMember[] = (team.members as unknown[]).map((raw, index) => {
      if (!isObject(raw)) {
        throw new Error(`Member at index ${index} must be an object.`);
      }

      const m = raw as Record<string, unknown>;

      if (typeof m.github !== 'string' || m.github.trim() === '') {
        throw new Error(`Member[${index}].github must be a non-empty string.`);
      }

      if (typeof m.name !== 'string' || m.name.trim() === '') {
        throw new Error(`Member[${index}].name must be a non-empty string.`);
      }

      if (!isValidRole(m.role)) {
        throw new Error(
          `Member[${index}].role must be "admin" or "member", got: ${String(m.role)}`,
        );
      }

      if (!Array.isArray(m.domains)) {
        throw new Error(`Member[${index}].domains must be an array.`);
      }

      for (const [di, domain] of (m.domains as unknown[]).entries()) {
        if (typeof domain !== 'string') {
          throw new Error(`Member[${index}].domains[${di}] must be a string.`);
        }
      }

      return {
        github: m.github as string,
        name: m.name as string,
        role: m.role as 'admin' | 'member',
        domains: m.domains as string[],
      };
    });

    return {
      team: {
        name: team.name as string,
        version: team.version as string,
        members,
      },
    };
  }

  /** Return true if the config file exists at the configured path. */
  exists(): boolean {
    return existsSync(this.configPath);
  }

  /**
   * Write a default team.yaml template to the given path.
   * Throws if the file already exists.
   */
  static createTemplate(path: string, teamName: string): void {
    if (existsSync(path)) {
      throw new Error(`File already exists: ${path}`);
    }

    const template: TeamConfigData = {
      team: {
        name: teamName,
        version: '1.0',
        members: [
          {
            github: 'github-username',
            name: 'Full Name',
            role: 'admin',
            domains: ['backend', 'devops'],
          },
        ],
      },
    };

    writeFileSync(path, stringify(template), 'utf-8');
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private ensureLoaded(): TeamConfigData {
    if (this.data === null) {
      this.load();
    }

    // After load(), this.data is guaranteed non-null; cast is safe.
    return this.data as TeamConfigData;
  }

  private validateMember(member: TeamMember): void {
    if (!member.github || member.github.trim() === '') {
      throw new Error('Member github must be a non-empty string.');
    }

    if (!member.name || member.name.trim() === '') {
      throw new Error('Member name must be a non-empty string.');
    }

    if (!isValidRole(member.role)) {
      throw new Error(`Member role must be "admin" or "member".`);
    }

    if (!Array.isArray(member.domains)) {
      throw new Error('Member domains must be an array.');
    }
  }
}

// ── Module-level type guards ─────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidRole(value: unknown): value is 'admin' | 'member' {
  return value === 'admin' || value === 'member';
}
