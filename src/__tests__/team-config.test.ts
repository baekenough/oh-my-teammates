import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import type { TeamConfigData, TeamMember } from '../team-config';
import { TeamConfig } from '../team-config';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN: TeamMember = {
  github: 'john-doe',
  name: 'John Doe',
  role: 'admin',
  domains: ['languages', 'backend'],
};

const MEMBER: TeamMember = {
  github: 'jane-doe',
  name: 'Jane Doe',
  role: 'member',
  domains: ['frontend', 'design'],
};

function makeValidConfig(members: TeamMember[] = [ADMIN, MEMBER]): TeamConfigData {
  return {
    team: {
      name: 'my-team',
      version: '1.0',
      members: structuredClone(members),
    },
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('TeamConfig', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'team-config-test-'));
    configPath = join(tmpDir, 'team.yaml');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Helper: write a valid YAML config to disk
  function writeConfig(data: TeamConfigData = makeValidConfig()): void {
    writeFileSync(configPath, stringify(data), 'utf-8');
  }

  // ── exists() ───────────────────────────────────────────────────────────────

  describe('exists()', () => {
    it('returns false when config file does not exist', () => {
      const config = new TeamConfig(configPath);
      expect(config.exists()).toBe(false);
    });

    it('returns true after the file is written', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      expect(config.exists()).toBe(true);
    });
  });

  // ── load() ─────────────────────────────────────────────────────────────────

  describe('load()', () => {
    it('parses a valid team.yaml and returns TeamConfigData', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      const data = config.load();

      expect(data.team.name).toBe('my-team');
      expect(data.team.version).toBe('1.0');
      expect(data.team.members).toHaveLength(2);
    });

    it('throws when the file does not exist', () => {
      const config = new TeamConfig(configPath);
      expect(() => config.load()).toThrow(`Config file not found: ${configPath}`);
    });

    it('throws when YAML is missing the team key', () => {
      writeFileSync(configPath, stringify({ other: 'value' }), 'utf-8');
      const config = new TeamConfig(configPath);
      expect(() => config.load()).toThrow('"team" object');
    });

    it('throws when a member has an invalid role', () => {
      const bad = makeValidConfig([{ ...ADMIN, role: 'owner' as 'admin' }]);
      writeFileSync(configPath, stringify(bad), 'utf-8');
      const config = new TeamConfig(configPath);
      expect(() => config.load()).toThrow('role must be "admin" or "member"');
    });

    it('throws when team.name is missing', () => {
      const bad = { team: { version: '1.0', members: [] } };
      writeFileSync(configPath, stringify(bad), 'utf-8');
      const config = new TeamConfig(configPath);
      expect(() => config.load()).toThrow('"team.name"');
    });
  });

  // ── save() ─────────────────────────────────────────────────────────────────

  describe('save()', () => {
    it('persists in-memory changes to disk and reloads correctly', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      config.load();
      config.addMember({
        github: 'new-user',
        name: 'New User',
        role: 'member',
        domains: ['qa'],
      });
      config.save();

      const reloaded = new TeamConfig(configPath);
      const data = reloaded.load();
      expect(data.team.members).toHaveLength(3);
      expect(data.team.members[2]?.github).toBe('new-user');
    });

    it('throws when save() is called before any data is loaded', () => {
      const config = new TeamConfig(configPath);
      expect(() => config.save()).toThrow('No data to save');
    });
  });

  // ── getMembers() ───────────────────────────────────────────────────────────

  describe('getMembers()', () => {
    it('returns all members from the config', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      const members = config.getMembers();
      expect(members).toHaveLength(2);
      expect(members[0]?.github).toBe('john-doe');
    });
  });

  // ── getMember() ────────────────────────────────────────────────────────────

  describe('getMember()', () => {
    it('returns the correct member by github username', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      const member = config.getMember('jane-doe');
      expect(member?.name).toBe('Jane Doe');
    });

    it('returns undefined for unknown github username', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      expect(config.getMember('nobody')).toBeUndefined();
    });
  });

  // ── addMember() ────────────────────────────────────────────────────────────

  describe('addMember()', () => {
    it('adds a new member and getMembers reflects the change', () => {
      writeConfig(makeValidConfig([ADMIN]));
      const config = new TeamConfig(configPath);
      config.addMember({ ...MEMBER });
      expect(config.getMembers()).toHaveLength(2);
      expect(config.getMember('jane-doe')?.role).toBe('member');
    });

    it('throws when adding a duplicate github username', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      expect(() => config.addMember({ ...ADMIN })).toThrow('Member already exists');
    });
  });

  // ── removeMember() ─────────────────────────────────────────────────────────

  describe('removeMember()', () => {
    it('removes an existing member and returns true', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      const removed = config.removeMember('jane-doe');
      expect(removed).toBe(true);
      expect(config.getMembers()).toHaveLength(1);
      expect(config.getMember('jane-doe')).toBeUndefined();
    });

    it('returns false when the member does not exist', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      expect(config.removeMember('nobody')).toBe(false);
    });
  });

  // ── updateMember() ─────────────────────────────────────────────────────────

  describe('updateMember()', () => {
    it('updates name, role, and domains and returns true', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      const updated = config.updateMember('jane-doe', {
        name: 'Jane Smith',
        role: 'admin',
        domains: ['frontend', 'design', 'ux'],
      });
      expect(updated).toBe(true);
      const member = config.getMember('jane-doe');
      expect(member?.name).toBe('Jane Smith');
      expect(member?.role).toBe('admin');
      expect(member?.domains).toEqual(['frontend', 'design', 'ux']);
    });

    it('returns false when the member does not exist', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      expect(config.updateMember('nobody', { name: 'Ghost' })).toBe(false);
    });

    it('throws when given an invalid role', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      expect(() => config.updateMember('jane-doe', { role: 'superadmin' as 'admin' })).toThrow(
        'Invalid role',
      );
    });
  });

  // ── getAdmins() ────────────────────────────────────────────────────────────

  describe('getAdmins()', () => {
    it('returns only members with the admin role', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      const admins = config.getAdmins();
      expect(admins).toHaveLength(1);
      expect(admins[0]?.github).toBe('john-doe');
    });
  });

  // ── getMembersByDomain() ───────────────────────────────────────────────────

  describe('getMembersByDomain()', () => {
    it('returns members whose domains include the queried domain', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      const backendMembers = config.getMembersByDomain('backend');
      expect(backendMembers).toHaveLength(1);
      expect(backendMembers[0]?.github).toBe('john-doe');
    });

    it('returns an empty array when no member has the domain', () => {
      writeConfig();
      const config = new TeamConfig(configPath);
      expect(config.getMembersByDomain('security')).toHaveLength(0);
    });
  });

  // ── validate() ─────────────────────────────────────────────────────────────

  describe('validate()', () => {
    it('throws on non-object input', () => {
      const config = new TeamConfig(configPath);
      expect(() => config.validate('not an object')).toThrow('YAML object');
    });

    it('throws when team.members is not an array', () => {
      const config = new TeamConfig(configPath);
      expect(() => config.validate({ team: { name: 't', version: '1.0', members: null } })).toThrow(
        '"team.members" must be an array',
      );
    });

    it('throws when a member domain entry is not a string', () => {
      const config = new TeamConfig(configPath);
      const badData = {
        team: {
          name: 't',
          version: '1.0',
          members: [{ github: 'u', name: 'U', role: 'member', domains: [42] }],
        },
      };
      expect(() => config.validate(badData)).toThrow('domains[0] must be a string');
    });
  });

  // ── createTemplate() ──────────────────────────────────────────────────────

  describe('TeamConfig.createTemplate()', () => {
    it('creates a valid team.yaml template at the given path', () => {
      const templatePath = join(tmpDir, 'team-template.yaml');
      TeamConfig.createTemplate(templatePath, 'acme-team');

      const config = new TeamConfig(templatePath);
      const data = config.load();
      expect(data.team.name).toBe('acme-team');
      expect(data.team.members).toHaveLength(1);
      expect(data.team.members[0]?.role).toBe('admin');
    });

    it('throws when the target file already exists', () => {
      writeFileSync(configPath, '', 'utf-8');
      expect(() => TeamConfig.createTemplate(configPath, 'team')).toThrow('File already exists');
    });
  });
});
