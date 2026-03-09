#!/usr/bin/env bun
/**
 * scan-data.ts
 * Scans .claude/ directory and generates dashboard/static/data.json
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

const ROOT = join(import.meta.dir, '../..');
const STATIC_DIR = join(import.meta.dir, '../static');

interface AgentFrontmatter {
  name: string;
  description: string;
  model: string;
  tools: string[];
  skills: string[];
  memory?: string;
  effort?: string;
}

interface Agent {
  name: string;
  description: string;
  model: string;
  tools: string[];
  skills: string[];
  memory?: string;
  effort?: string;
  file: string;
}

interface Skill {
  name: string;
  file: string;
}

interface Rule {
  name: string;
  priority: 'MUST' | 'SHOULD' | 'MAY';
  id: string;
  file: string;
}

interface Guide {
  name: string;
  path: string;
}

interface StewardDomain {
  primary: string | null;
  backup: string | null;
  active: boolean;
}

interface Stewards {
  domains: Record<string, StewardDomain>;
  source: string;
}

interface TeamMember {
  github?: string;
  email?: string;
  role?: string;
}

interface Team {
  admin: string | null;
  members: Record<string, TeamMember>;
  source: string;
}

interface DashboardData {
  agents: Agent[];
  skills: Skill[];
  rules: Rule[];
  guides: Guide[];
  stewards: Stewards;
  team: Team;
  generatedAt: string;
  counts: {
    agents: number;
    skills: number;
    rules: number;
    guides: number;
    teamMembers: number;
  };
}

/**
 * Minimal YAML parser for STEWARDS.yaml and team.yaml formats.
 */
function parseSimpleYaml(content: string): Record<string, unknown> {
  const lines = content.split('\n');
  const result: Record<string, unknown> = {};
  const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [
    { indent: -1, obj: result },
  ];

  for (const rawLine of lines) {
    if (rawLine.trim() === '' || rawLine.trim().startsWith('#')) continue;

    const indent = rawLine.search(/\S/);
    if (indent === -1) continue;

    const line = rawLine.trim();
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]!.obj;

    if (value === '~' || value === 'null') {
      parent[key] = null;
    } else if (value === '') {
      const newObj: Record<string, unknown> = {};
      parent[key] = newObj;
      stack.push({ indent, obj: newObj });
    } else if (value === 'true') {
      parent[key] = true;
    } else if (value === 'false') {
      parent[key] = false;
    } else if (value === '{}') {
      parent[key] = {};
    } else {
      parent[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }

  return result;
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1]!;
  const result: Record<string, unknown> = {};

  let currentKey = '';
  let inList = false;
  const listItems: string[] = [];

  for (const line of yaml.split('\n')) {
    // List item
    if (line.match(/^\s+- (.+)/)) {
      const item = line.match(/^\s+- (.+)/)?.[1]?.trim() ?? '';
      listItems.push(item);
      continue;
    }

    // Save previous list if any
    if (inList && currentKey && !line.match(/^\s+- /)) {
      result[currentKey] = [...listItems];
      listItems.length = 0;
      inList = false;
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w[\w-]*): ?(.*)?$/);
    if (kvMatch) {
      currentKey = kvMatch[1]!;
      const value = kvMatch[2]?.trim() ?? '';

      if (value === '' || value === null) {
        // Next lines might be a list
        inList = true;
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline list: [a, b, c]
        result[currentKey] = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        result[currentKey] = value;
      }
    }
  }

  // Save last list if any
  if (inList && currentKey && listItems.length > 0) {
    result[currentKey] = [...listItems];
  }

  return result;
}

function scanAgents(): Agent[] {
  const agentsDir = join(ROOT, '.claude/agents');
  if (!existsSync(agentsDir)) return [];

  const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  const agents: Agent[] = [];

  for (const file of files) {
    const filePath = join(agentsDir, file);
    const content = readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content) as Partial<AgentFrontmatter>;

    agents.push({
      name: fm.name ?? basename(file, '.md'),
      description: fm.description ?? '',
      model: fm.model ?? 'sonnet',
      tools: (fm.tools as string[]) ?? [],
      skills: (fm.skills as string[]) ?? [],
      memory: fm.memory as string | undefined,
      effort: fm.effort as string | undefined,
      file: `.claude/agents/${file}`,
    });
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

function scanSkills(): Skill[] {
  const skillsDir = join(ROOT, '.claude/skills');
  if (!existsSync(skillsDir)) return [];

  const entries = readdirSync(skillsDir);
  const skills: Skill[] = [];

  for (const entry of entries) {
    const entryPath = join(skillsDir, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    const skillFile = join(entryPath, 'SKILL.md');
    if (existsSync(skillFile)) {
      skills.push({
        name: entry,
        file: `.claude/skills/${entry}/SKILL.md`,
      });
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function scanRules(): Rule[] {
  const rulesDir = join(ROOT, '.claude/rules');
  if (!existsSync(rulesDir)) return [];

  const files = readdirSync(rulesDir).filter((f) => f.endsWith('.md'));
  const rules: Rule[] = [];

  for (const file of files) {
    const nameWithoutExt = basename(file, '.md');
    let priority: Rule['priority'] = 'SHOULD';
    if (nameWithoutExt.startsWith('MUST-')) priority = 'MUST';
    else if (nameWithoutExt.startsWith('SHOULD-')) priority = 'SHOULD';
    else if (nameWithoutExt.startsWith('MAY-')) priority = 'MAY';

    // Extract ID from file content
    const content = readFileSync(join(rulesDir, file), 'utf-8');
    const idMatch = content.match(/\*\*ID\*\*:\s*(R\d+)/);
    const id = idMatch?.[1] ?? '';

    const humanName = nameWithoutExt.replace(/^(MUST|SHOULD|MAY)-/, '').replace(/-/g, ' ');

    rules.push({
      name: humanName,
      priority,
      id,
      file: `.claude/rules/${file}`,
    });
  }

  return rules.sort((a, b) => {
    const priorityOrder = { MUST: 0, SHOULD: 1, MAY: 2 };
    const diff = priorityOrder[a.priority] - priorityOrder[b.priority];
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

function scanGuides(): Guide[] {
  const guidesDir = join(ROOT, 'guides');
  if (!existsSync(guidesDir)) return [];

  const entries = readdirSync(guidesDir);
  const guides: Guide[] = [];

  for (const entry of entries) {
    const entryPath = join(guidesDir, entry);
    if (statSync(entryPath).isDirectory()) {
      guides.push({
        name: entry,
        path: `guides/${entry}`,
      });
    }
  }

  return guides.sort((a, b) => a.name.localeCompare(b.name));
}

function scanStewards(): Stewards {
  const candidates = [join(ROOT, 'STEWARDS.yaml'), join(ROOT, 'templates/STEWARDS.yaml')];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseSimpleYaml(content) as { domains?: Record<string, unknown> };
    const domains: Record<string, StewardDomain> = {};

    if (parsed.domains && typeof parsed.domains === 'object') {
      for (const [domainName, domainVal] of Object.entries(parsed.domains)) {
        if (domainVal && typeof domainVal === 'object') {
          const d = domainVal as Record<string, unknown>;
          domains[domainName] = {
            primary: (d.primary as string | null) ?? null,
            backup: (d.backup as string | null) ?? null,
            active: d.active === true,
          };
        }
      }
    }

    return { domains, source: filePath.replace(ROOT + '/', '') };
  }

  return { domains: {}, source: '' };
}

function scanTeam(): Team {
  const candidates = [join(ROOT, 'team.yaml'), join(ROOT, 'templates/team.yaml')];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseSimpleYaml(content) as {
      admin?: string | null;
      members?: Record<string, unknown>;
    };

    const members: Record<string, TeamMember> = {};
    if (parsed.members && typeof parsed.members === 'object') {
      for (const [memberName, memberVal] of Object.entries(parsed.members)) {
        if (memberVal && typeof memberVal === 'object') {
          const m = memberVal as Record<string, unknown>;
          members[memberName] = {
            github: m.github as string | undefined,
            email: m.email as string | undefined,
            role: m.role as string | undefined,
          };
        }
      }
    }

    return {
      admin: (parsed.admin as string | null) ?? null,
      members,
      source: filePath.replace(ROOT + '/', ''),
    };
  }

  return { admin: null, members: {}, source: '' };
}

// Main
const agents = scanAgents();
const skills = scanSkills();
const rules = scanRules();
const guides = scanGuides();
const stewards = scanStewards();
const team = scanTeam();

const data: DashboardData = {
  agents,
  skills,
  rules,
  guides,
  stewards,
  team,
  generatedAt: new Date().toISOString(),
  counts: {
    agents: agents.length,
    skills: skills.length,
    rules: rules.length,
    guides: guides.length,
    teamMembers: Object.keys(team.members).length,
  },
};

writeFileSync(join(STATIC_DIR, 'data.json'), JSON.stringify(data, null, 2));

console.log(`[Done] data.json generated`);
console.log(`  Agents: ${agents.length}`);
console.log(`  Skills: ${skills.length}`);
console.log(`  Rules: ${rules.length}`);
console.log(`  Guides: ${guides.length}`);
console.log(`  Steward domains: ${Object.keys(stewards.domains).length}`);
console.log(`  Team members: ${Object.keys(team.members).length}`);
