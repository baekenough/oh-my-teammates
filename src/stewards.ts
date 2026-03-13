import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
/**
 * Domain stewardship management
 * STEWARDS.yaml -> CODEOWNERS auto-generation
 */
import { parse, stringify } from 'yaml';
import { TEAM_PATHS } from './paths';

export interface DomainSteward {
  primary: string;
  backup: string | null;
  paths: string[];
}

export interface StewardsData {
  stewards: {
    version: string;
    domains: Record<string, DomainSteward>;
  };
}

export const DEFAULT_DOMAINS: Record<string, string[]> = {
  languages: ['**/*.ts', '**/*.py', '**/*.go', '**/*.kt', '**/*.rs', '**/*.java', '**/*.dart'],
  frontend: ['src/components/**', 'dashboard/**', '**/*.svelte', '**/*.vue', '**/*.tsx'],
  backend: ['src/api/**', 'src/server/**', 'routes/**'],
  'data-engineering': ['dags/**', 'pipelines/**', 'models/**'],
  infrastructure: ['Dockerfile', 'docker-compose*', '.github/**', 'terraform/**'],
  database: ['**/*.sql', 'migrations/**', 'schema/**'],
  quality: ['**/*.test.ts', '**/*.spec.ts', '__tests__/**', 'cypress/**'],
  documentation: ['docs/**', '**/*.md', 'guides/**'],
};

/**
 * Match a file path against a glob-like pattern.
 * Supports:
 *   - "**" segments (match zero or more path components)
 *   - "*" wildcard (match any characters within a single segment)
 *   - Exact literal matches
 *   - Trailing "/**" (match directory and all contents)
 *   - Extension patterns like "**\/*.ts"
 */
function matchGlob(pattern: string, filePath: string): boolean {
  // Normalise separators
  const normalPattern = pattern.replace(/\\/g, '/');
  const normalPath = filePath.replace(/\\/g, '/');

  // Exact match fast path
  if (normalPattern === normalPath) {
    return true;
  }

  // Convert glob to regex by scanning character-by-character to avoid
  // the ambiguity of chained string replacements (e.g. "**" -> ".*" then
  // "*" -> "[^/]*" would corrupt the ".*" we just inserted).
  let regexSource = '';
  let i = 0;
  while (i < normalPattern.length) {
    const ch = normalPattern[i] ?? '';

    if (ch === '*') {
      if (normalPattern[i + 1] === '*') {
        // "**" — match any path segment sequence (including none)
        if (normalPattern[i + 2] === '/') {
          // "**/" prefix — zero or more directories
          regexSource += '(?:[^/]+/)*';
          i += 3;
        } else {
          // trailing "**" or "**" elsewhere — match everything remaining
          regexSource += '.*';
          i += 2;
        }
      } else {
        // single "*" — match any chars within one path segment
        regexSource += '[^/]*';
        i += 1;
      }
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      // Escape regex meta-characters
      regexSource += `\\${ch}`;
      i += 1;
    } else {
      regexSource += ch;
      i += 1;
    }
  }

  const regex = new RegExp(`^${regexSource}$`);
  return regex.test(normalPath);
}

export class Stewards {
  private configPath: string;
  private data: StewardsData | null = null;

  constructor(configPath: string = TEAM_PATHS.STEWARDS_YAML) {
    this.configPath = configPath;
  }

  /** Load and parse the STEWARDS.yaml file */
  load(): StewardsData {
    const raw = readFileSync(this.configPath, 'utf8');
    const parsed: unknown = parse(raw);
    this.data = this.validate(parsed);
    return this.data;
  }

  /** Persist the current in-memory state back to STEWARDS.yaml */
  save(): void {
    if (this.data === null) {
      throw new Error('No data loaded. Call load() or setDomain() first.');
    }
    const dir = dirname(this.configPath);
    if (dir && dir !== '.') {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, stringify(this.data), 'utf8');
  }

  /** Check whether the config file exists on disk */
  exists(): boolean {
    return existsSync(this.configPath);
  }

  /** Return the steward config for a single domain */
  getDomain(domain: string): DomainSteward | undefined {
    return this.requireData().stewards.domains[domain];
  }

  /** Create or overwrite the steward config for a domain */
  setDomain(domain: string, steward: DomainSteward): void {
    const data = this.getOrInitData();
    data.stewards.domains[domain] = steward;
  }

  /** Return all domain configs */
  getDomains(): Record<string, DomainSteward> {
    return this.requireData().stewards.domains;
  }

  /**
   * Find which domain a file path belongs to.
   * Returns the first matching domain name, or undefined.
   */
  findDomainForPath(filePath: string): string | undefined {
    const domains = this.requireData().stewards.domains;
    for (const [domain, steward] of Object.entries(domains)) {
      for (const pattern of steward.paths) {
        if (matchGlob(pattern, filePath)) {
          return domain;
        }
      }
    }
    return undefined;
  }

  /**
   * Find the steward responsible for a given file path.
   * Returns domain + primary/backup info, or undefined if no match.
   */
  findStewardForFile(
    filePath: string,
  ): { domain: string; primary: string; backup: string | null } | undefined {
    const domain = this.findDomainForPath(filePath);
    if (domain === undefined) {
      return undefined;
    }
    const steward = this.getDomain(domain);
    if (steward === undefined) {
      return undefined;
    }
    return {
      domain,
      primary: steward.primary,
      backup: steward.backup,
    };
  }

  /**
   * Generate the content of a GitHub CODEOWNERS file from the loaded data.
   */
  generateCodeowners(): string {
    const domains = this.requireData().stewards.domains;
    const lines: string[] = [
      '# CODEOWNERS — auto-generated by oh-my-teammates',
      '# Do not edit manually. Update STEWARDS.yaml instead.',
      '',
    ];

    for (const [domain, steward] of Object.entries(domains)) {
      lines.push(`# Domain: ${domain}`);
      const owners = [`@${steward.primary}`];
      if (steward.backup !== null) {
        owners.push(`@${steward.backup}`);
      }
      for (const pattern of steward.paths) {
        // CODEOWNERS paths must start with /; keep ** patterns as-is
        const codeownersPath = pattern.startsWith('/') ? pattern : `/${pattern}`;
        lines.push(`${codeownersPath} ${owners.join(' ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Write the generated CODEOWNERS content to disk */
  writeCodeowners(outputPath = '.github/CODEOWNERS'): void {
    const content = this.generateCodeowners();
    const dir = dirname(outputPath);
    if (dir && dir !== '.') {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outputPath, content, 'utf8');
  }

  /**
   * Validate raw parsed YAML and return a typed StewardsData.
   * Throws if the structure is invalid.
   */
  validate(data: unknown): StewardsData {
    if (typeof data !== 'object' || data === null) {
      throw new Error('STEWARDS.yaml must be a YAML object');
    }

    const root = data as Record<string, unknown>;

    if (typeof root.stewards !== 'object' || root.stewards === null) {
      throw new Error('STEWARDS.yaml must have a "stewards" object');
    }

    const stewards = root.stewards as Record<string, unknown>;

    if (typeof stewards.version !== 'string') {
      throw new Error('stewards.version must be a string');
    }

    if (
      typeof stewards.domains !== 'object' ||
      stewards.domains === null ||
      Array.isArray(stewards.domains)
    ) {
      throw new Error('stewards.domains must be an object');
    }

    const domains = stewards.domains as Record<string, unknown>;
    const validatedDomains: Record<string, DomainSteward> = {};

    for (const [name, value] of Object.entries(domains)) {
      if (typeof value !== 'object' || value === null) {
        throw new Error(`Domain "${name}" must be an object`);
      }
      const d = value as Record<string, unknown>;

      if (typeof d.primary !== 'string') {
        throw new Error(`Domain "${name}".primary must be a string`);
      }

      if (d.backup !== null && typeof d.backup !== 'string') {
        throw new Error(`Domain "${name}".backup must be a string or null`);
      }

      if (!Array.isArray(d.paths)) {
        throw new Error(`Domain "${name}".paths must be an array`);
      }

      for (const p of d.paths as unknown[]) {
        if (typeof p !== 'string') {
          throw new Error(`Domain "${name}".paths entries must all be strings`);
        }
      }

      validatedDomains[name] = {
        primary: d.primary as string,
        backup: (d.backup as string | null) ?? null,
        paths: d.paths as string[],
      };
    }

    return {
      stewards: {
        version: stewards.version as string,
        domains: validatedDomains,
      },
    };
  }

  /**
   * Write a default STEWARDS.yaml template to the given path.
   * Includes all 8 default domains with placeholder values.
   */
  static createTemplate(path: string): void {
    const template: StewardsData = {
      stewards: {
        version: '1.0',
        domains: Object.fromEntries(
          Object.entries(DEFAULT_DOMAINS).map(([domain, paths]) => [
            domain,
            {
              primary: 'username',
              backup: null,
              paths,
            },
          ]),
        ),
      },
    };

    const dir = dirname(path);
    if (dir && dir !== '.') {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(path, stringify(template), 'utf8');
  }

  // --- Private helpers ---

  private requireData(): StewardsData {
    if (this.data === null) {
      throw new Error('Data not loaded. Call load() before accessing steward data.');
    }
    return this.data;
  }

  private getOrInitData(): StewardsData {
    if (this.data === null) {
      this.data = {
        stewards: {
          version: '1.0',
          domains: {},
        },
      };
    }
    return this.data;
  }
}
