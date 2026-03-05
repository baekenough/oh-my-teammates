import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DOMAINS, Stewards } from '../stewards';
import type { DomainSteward } from '../stewards';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TMP_BASE = join(import.meta.dir, '__tmp__stewards__');

function tmpDir(label: string): string {
  const dir = join(TMP_BASE, label);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Fixtures & teardown
// ---------------------------------------------------------------------------

let tmpDirPath: string;

beforeEach(() => {
  tmpDirPath = tmpDir(Math.random().toString(36).slice(2));
});

afterEach(() => {
  rmSync(TMP_BASE, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. DEFAULT_DOMAINS
// ---------------------------------------------------------------------------

describe('DEFAULT_DOMAINS', () => {
  it('exports all 8 expected domains', () => {
    const expected = [
      'languages',
      'frontend',
      'backend',
      'data-engineering',
      'infrastructure',
      'database',
      'quality',
      'documentation',
    ];
    expect(Object.keys(DEFAULT_DOMAINS)).toEqual(expected);
  });

  it('each domain has at least one path pattern', () => {
    for (const paths of Object.values(DEFAULT_DOMAINS)) {
      expect(paths.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Construction / exists / load / save
// ---------------------------------------------------------------------------

describe('Stewards — file I/O', () => {
  it('exists() returns false when config file is missing', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    expect(s.exists()).toBe(false);
  });

  it('exists() returns true after createTemplate()', () => {
    const yamlPath = join(tmpDirPath, 'STEWARDS.yaml');
    Stewards.createTemplate(yamlPath);
    const s = new Stewards(yamlPath);
    expect(s.exists()).toBe(true);
  });

  it('load() reads and parses a valid STEWARDS.yaml', () => {
    const yamlPath = join(tmpDirPath, 'STEWARDS.yaml');
    Stewards.createTemplate(yamlPath);
    const s = new Stewards(yamlPath);
    const data = s.load();
    expect(data.stewards.version).toBe('1.0');
    expect(typeof data.stewards.domains).toBe('object');
  });

  it('save() writes data that can be read back', () => {
    const yamlPath = join(tmpDirPath, 'STEWARDS.yaml');
    const s = new Stewards(yamlPath);
    s.setDomain('languages', {
      primary: 'alice',
      backup: null,
      paths: ['**/*.ts'],
    });
    s.save();
    expect(existsSync(yamlPath)).toBe(true);

    const s2 = new Stewards(yamlPath);
    const data = s2.load();
    expect(data.stewards.domains.languages?.primary).toBe('alice');
  });

  it('save() throws when no data is loaded', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    expect(() => s.save()).toThrow('No data loaded');
  });
});

// ---------------------------------------------------------------------------
// 3. createTemplate
// ---------------------------------------------------------------------------

describe('Stewards.createTemplate()', () => {
  it('creates a file with all 8 domains and placeholder primary', () => {
    const yamlPath = join(tmpDirPath, 'STEWARDS.yaml');
    Stewards.createTemplate(yamlPath);
    const s = new Stewards(yamlPath);
    const data = s.load();
    const domainNames = Object.keys(data.stewards.domains);
    expect(domainNames).toHaveLength(8);
    for (const steward of Object.values(data.stewards.domains)) {
      expect(steward.primary).toBe('username');
      expect(steward.backup).toBeNull();
    }
  });

  it('creates nested directories as needed', () => {
    const yamlPath = join(tmpDirPath, 'nested', 'deep', 'STEWARDS.yaml');
    Stewards.createTemplate(yamlPath);
    expect(existsSync(yamlPath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. getDomain / setDomain / getDomains
// ---------------------------------------------------------------------------

describe('Stewards — domain CRUD', () => {
  it('getDomain returns undefined for missing domain', () => {
    const yamlPath = join(tmpDirPath, 'STEWARDS.yaml');
    Stewards.createTemplate(yamlPath);
    const s = new Stewards(yamlPath);
    s.load();
    expect(s.getDomain('nonexistent')).toBeUndefined();
  });

  it('setDomain then getDomain round-trips correctly', () => {
    const yamlPath = join(tmpDirPath, 'STEWARDS.yaml');
    const s = new Stewards(yamlPath);
    const steward: DomainSteward = {
      primary: 'bob',
      backup: 'carol',
      paths: ['src/api/**'],
    };
    s.setDomain('backend', steward);
    expect(s.getDomain('backend')).toEqual(steward);
  });

  it('getDomains returns all configured domains', () => {
    const yamlPath = join(tmpDirPath, 'STEWARDS.yaml');
    Stewards.createTemplate(yamlPath);
    const s = new Stewards(yamlPath);
    s.load();
    const domains = s.getDomains();
    expect(Object.keys(domains)).toHaveLength(8);
  });

  it('getDomain throws when data is not loaded', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    expect(() => s.getDomain('languages')).toThrow('not loaded');
  });
});

// ---------------------------------------------------------------------------
// 5. findDomainForPath
// ---------------------------------------------------------------------------

describe('Stewards — findDomainForPath', () => {
  function makeLoaded(): Stewards {
    const yamlPath = join(tmpDirPath, 'STEWARDS.yaml');
    const s = new Stewards(yamlPath);
    s.setDomain('languages', {
      primary: 'alice',
      backup: null,
      paths: ['**/*.ts', '**/*.py'],
    });
    s.setDomain('frontend', {
      primary: 'bob',
      backup: null,
      paths: ['src/components/**', 'dashboard/**'],
    });
    s.setDomain('infrastructure', {
      primary: 'carol',
      backup: null,
      paths: ['Dockerfile', 'docker-compose*', '.github/**'],
    });
    return s;
  }

  it('matches a TypeScript file via extension glob', () => {
    const s = makeLoaded();
    expect(s.findDomainForPath('src/utils/helpers.ts')).toBe('languages');
  });

  it('matches a nested component path', () => {
    const s = makeLoaded();
    expect(s.findDomainForPath('src/components/Button/index.tsx')).toBe('frontend');
  });

  it('matches an exact literal path (Dockerfile)', () => {
    const s = makeLoaded();
    expect(s.findDomainForPath('Dockerfile')).toBe('infrastructure');
  });

  it('matches a wildcard-suffix pattern (docker-compose*)', () => {
    const s = makeLoaded();
    expect(s.findDomainForPath('docker-compose.yaml')).toBe('infrastructure');
  });

  it('returns undefined for an unmatched path', () => {
    const s = makeLoaded();
    expect(s.findDomainForPath('some/random/file.xyz')).toBeUndefined();
  });

  it('matches .github/** sub-paths', () => {
    const s = makeLoaded();
    expect(s.findDomainForPath('.github/workflows/ci.yml')).toBe('infrastructure');
  });
});

// ---------------------------------------------------------------------------
// 6. findStewardForFile
// ---------------------------------------------------------------------------

describe('Stewards — findStewardForFile', () => {
  it('returns primary and backup for a matched file', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    s.setDomain('languages', {
      primary: 'john',
      backup: 'jane',
      paths: ['**/*.ts'],
    });
    const result = s.findStewardForFile('src/index.ts');
    expect(result).toEqual({
      domain: 'languages',
      primary: 'john',
      backup: 'jane',
    });
  });

  it('returns null backup when no backup is configured', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    s.setDomain('frontend', {
      primary: 'alice',
      backup: null,
      paths: ['src/components/**'],
    });
    const result = s.findStewardForFile('src/components/Header.tsx');
    expect(result?.backup).toBeNull();
  });

  it('returns undefined for an unmatched file', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    s.setDomain('backend', {
      primary: 'dev',
      backup: null,
      paths: ['src/api/**'],
    });
    expect(s.findStewardForFile('unrelated/file.txt')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. generateCodeowners / writeCodeowners
// ---------------------------------------------------------------------------

describe('Stewards — generateCodeowners', () => {
  it('generates lines with GitHub @username format', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    s.setDomain('languages', {
      primary: 'john-doe',
      backup: 'jane-doe',
      paths: ['**/*.ts'],
    });
    const output = s.generateCodeowners();
    expect(output).toContain('@john-doe');
    expect(output).toContain('@jane-doe');
    expect(output).toContain('/**/*.ts');
  });

  it('omits backup when backup is null', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    s.setDomain('frontend', {
      primary: 'alice',
      backup: null,
      paths: ['src/components/**'],
    });
    const output = s.generateCodeowners();
    const line = output.split('\n').find((l) => l.includes('components'));
    expect(line).toBeDefined();
    expect(line).toContain('@alice');
    // Only one @ token on the line (no second owner)
    expect(line?.match(/@\w/g)?.length).toBe(1);
  });

  it('includes a header comment', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    s.setDomain('quality', {
      primary: 'qa-lead',
      backup: null,
      paths: ['**/*.test.ts'],
    });
    const output = s.generateCodeowners();
    expect(output).toContain('# CODEOWNERS');
  });

  it('writeCodeowners writes to disk and creates parent dir', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    s.setDomain('documentation', {
      primary: 'tech-writer',
      backup: null,
      paths: ['docs/**'],
    });
    const codeownersPath = join(tmpDirPath, '.github', 'CODEOWNERS');
    s.writeCodeowners(codeownersPath);
    expect(existsSync(codeownersPath)).toBe(true);
    const content = readFileSync(codeownersPath, 'utf8');
    expect(content).toContain('@tech-writer');
  });
});

// ---------------------------------------------------------------------------
// 8. validate
// ---------------------------------------------------------------------------

describe('Stewards — validate', () => {
  it('throws on null input', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    expect(() => s.validate(null)).toThrow();
  });

  it('throws when stewards key is missing', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    expect(() => s.validate({ not_stewards: {} })).toThrow();
  });

  it('throws when version is missing', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    expect(() => s.validate({ stewards: { domains: {} } })).toThrow('version');
  });

  it('throws when a domain primary is not a string', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    expect(() =>
      s.validate({
        stewards: {
          version: '1.0',
          domains: {
            bad: { primary: 42, backup: null, paths: [] },
          },
        },
      }),
    ).toThrow('primary');
  });

  it('accepts valid data and returns typed StewardsData', () => {
    const s = new Stewards(join(tmpDirPath, 'STEWARDS.yaml'));
    const raw = {
      stewards: {
        version: '1.0',
        domains: {
          languages: { primary: 'alice', backup: null, paths: ['**/*.ts'] },
        },
      },
    };
    const result = s.validate(raw);
    expect(result.stewards.version).toBe('1.0');
    expect(result.stewards.domains.languages?.primary).toBe('alice');
  });
});
