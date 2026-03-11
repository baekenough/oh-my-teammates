/**
 * Parsers for various dependency manifest files.
 * Extracts package names from package.json, go.mod, pyproject.toml,
 * requirements.txt, Cargo.toml, build.gradle, pom.xml, and pubspec.yaml.
 */
import { parse as parseYaml } from 'yaml';

export interface ParsedDependencies {
  manifest: string; // e.g., "package.json"
  packages: string[]; // all dependency package names
  devPackages: string[]; // dev-only dependency names
}

// ── package.json ─────────────────────────────────────────────────────────────

/**
 * Parse a package.json file.
 * - dependencies + peerDependencies → packages
 * - devDependencies → devPackages
 */
export function parsePackageJson(content: string): ParsedDependencies {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isObject(parsed)) {
      return empty('package.json');
    }

    const packages = [
      ...Object.keys(getStringMap(parsed, 'dependencies')),
      ...Object.keys(getStringMap(parsed, 'peerDependencies')),
    ];

    const devPackages = Object.keys(getStringMap(parsed, 'devDependencies'));

    return {
      manifest: 'package.json',
      packages: unique(packages),
      devPackages: unique(devPackages),
    };
  } catch {
    return empty('package.json');
  }
}

// ── go.mod ───────────────────────────────────────────────────────────────────

/**
 * Parse a go.mod file.
 * Extracts module paths from `require (...)` blocks and single `require` lines.
 * All deps go to packages (Go has no dev deps concept in go.mod).
 */
export function parseGoMod(content: string): ParsedDependencies {
  const packages: string[] = [];

  // Match multi-line require blocks: require (\n    pkg v1.0.0\n)
  const blockRegex = /require\s*\(([^)]*)\)/gs;
  for (const blockMatch of content.matchAll(blockRegex)) {
    const block = blockMatch[1] ?? '';
    for (const line of block.split('\n')) {
      const pkg = extractGoModule(line);
      if (pkg !== null) {
        packages.push(pkg);
      }
    }
  }

  // Match single-line require: require github.com/foo/bar v1.0.0
  const singleRegex = /^require\s+(\S+)\s+v\S+/gm;
  for (const match of content.matchAll(singleRegex)) {
    const pkg = (match[1] ?? '').trim();
    if (pkg !== '') {
      packages.push(pkg);
    }
  }

  return { manifest: 'go.mod', packages: unique(packages), devPackages: [] };
}

/** Extract module path from a single line inside a require block. */
function extractGoModule(line: string): string | null {
  const trimmed = line.trim();
  // Skip blank lines and comments
  if (trimmed === '' || trimmed.startsWith('//')) {
    return null;
  }
  // Format: "github.com/foo/bar v1.0.0" or "github.com/foo/bar v1.0.0 // indirect"
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && (parts[1] ?? '').startsWith('v')) {
    return parts[0] ?? null;
  }
  return null;
}

// ── pyproject.toml ───────────────────────────────────────────────────────────

/**
 * Parse a pyproject.toml file (simple text parsing, not a full TOML parser).
 * - [project] dependencies = [...] → packages
 * - [project.optional-dependencies] sections → devPackages
 * Package names have version specifiers stripped.
 */
export function parsePyprojectToml(content: string): ParsedDependencies {
  const packages = extractPyprojectDependencies(content);
  const devPackages = extractPyprojectOptionalDependencies(content);
  return {
    manifest: 'pyproject.toml',
    packages: unique(packages),
    devPackages: unique(devPackages),
  };
}

/** Extract [project] dependencies array entries. */
function extractPyprojectDependencies(content: string): string[] {
  // Split content by top-level section headers, then find [project] section
  const sections = content.split(/^(?=\[)/m);
  const projectSection = sections.find((s) => /^\[project\]/.test(s));
  if (projectSection === undefined) {
    return [];
  }
  return extractTomlStringArray(projectSection, 'dependencies');
}

/** Extract all entries from [project.optional-dependencies] subsections. */
function extractPyprojectOptionalDependencies(content: string): string[] {
  // Split content by top-level section headers, then find optional-dependencies section
  const sections = content.split(/^(?=\[)/m);
  const optSection = sections.find((s) => /^\[project\.optional-dependencies\]/.test(s));
  if (optSection === undefined) {
    return [];
  }

  // Remove the section header line to avoid matching the header as a group
  const body = optSection.split('\n').slice(1).join('\n');
  const packages: string[] = [];

  // Each sub-key is a group: group = ["pkg1", "pkg2"]
  const groupRegex = /^\s*\w[\w-]*\s*=\s*\[([^\]]*)\]/gm;
  for (const match of body.matchAll(groupRegex)) {
    const arrayContent = match[1] ?? '';
    for (const pkg of parseTomlStringList(arrayContent)) {
      packages.push(stripPythonVersionSpecifier(pkg));
    }
  }

  return packages;
}

/** Extract a named array from a TOML section snippet. */
function extractTomlStringArray(sectionContent: string, key: string): string[] {
  // Find the start of the array value for the given key
  const keyRegex = new RegExp(`^\\s*${key}\\s*=\\s*\\[`, 'm');
  const startMatch = sectionContent.match(keyRegex);
  if (startMatch === null) {
    return [];
  }

  // Find the closing bracket, skipping content inside quoted strings
  const startIdx = (startMatch.index ?? 0) + startMatch[0].length;
  let depth = 1;
  let i = startIdx;
  let inQuote = false;
  let quoteChar = '';

  while (i < sectionContent.length && depth > 0) {
    const ch = sectionContent[i];
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
    }
    i++;
  }

  if (depth !== 0) {
    return [];
  }

  const arrayContent = sectionContent.slice(startIdx, i - 1);
  return parseTomlStringList(arrayContent).map(stripPythonVersionSpecifier);
}

/** Parse a comma-separated list of quoted strings inside a TOML array. */
function parseTomlStringList(content: string): string[] {
  const results: string[] = [];
  // Match quoted strings, ignoring comments
  const quotedRegex = /["']([^"']+)["']/g;
  for (const match of content.matchAll(quotedRegex)) {
    const val = (match[1] ?? '').trim();
    if (val !== '') {
      results.push(val);
    }
  }
  return results;
}

/** Strip Python version specifiers: fastapi>=0.100.0 → fastapi */
function stripPythonVersionSpecifier(pkg: string): string {
  return (pkg.split(/[>=<!~\s[;]/)[0] ?? '').trim();
}

// ── requirements.txt ─────────────────────────────────────────────────────────

/**
 * Parse a requirements.txt file.
 * - One package per line; version specifiers stripped.
 * - Ignores comments, blank lines, -r includes, -e editable installs.
 * - All deps go to packages (no dev concept).
 */
export function parseRequirementsTxt(content: string): ParsedDependencies {
  const packages: string[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    // Skip blank lines, comments, include directives, editable installs
    if (
      line === '' ||
      line.startsWith('#') ||
      line.startsWith('-r') ||
      line.startsWith('-e') ||
      line.startsWith('-')
    ) {
      continue;
    }

    // Strip inline comments
    const withoutComment = (line.split('#')[0] ?? '').trim();
    if (withoutComment === '') {
      continue;
    }

    const pkg = stripPythonVersionSpecifier(withoutComment);
    if (pkg !== '') {
      packages.push(pkg);
    }
  }

  return { manifest: 'requirements.txt', packages: unique(packages), devPackages: [] };
}

// ── Cargo.toml ───────────────────────────────────────────────────────────────

/**
 * Parse a Cargo.toml file.
 * - [dependencies] → packages
 * - [dev-dependencies] → devPackages
 * Handles both `name = "version"` and `name = { version = "..." }` syntax.
 */
export function parseCargoToml(content: string): ParsedDependencies {
  const packages = extractCargoSection(content, 'dependencies');
  const devPackages = extractCargoSection(content, 'dev-dependencies');
  return { manifest: 'Cargo.toml', packages: unique(packages), devPackages: unique(devPackages) };
}

/** Extract package names from a named Cargo.toml section. */
function extractCargoSection(content: string, sectionName: string): string[] {
  // Split content by top-level section headers and find the target section
  const sections = content.split(/^(?=\[)/m);
  const sectionPattern = new RegExp(`^\\[${sectionName.replace(/-/g, '\\-')}\\]`);
  const found = sections.find((s) => sectionPattern.test(s));
  if (found === undefined) {
    return [];
  }

  // Remove the section header line
  const section = found.split('\n').slice(1).join('\n');
  const packages: string[] = [];

  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim();

    // Skip blank lines and comments
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    // Match: package-name = "version" or package-name = { version = "..." }
    const nameMatch = line.match(/^([\w-]+)\s*=/);
    if (nameMatch !== null) {
      packages.push(nameMatch[1] ?? '');
    }
  }

  return packages;
}

// ── build.gradle / build.gradle.kts ──────────────────────────────────────────

/**
 * Parse a build.gradle or build.gradle.kts file.
 * - implementation, api, compile → packages (group:artifact extracted)
 * - testImplementation, testCompile → devPackages
 * - plugins { id("...") } blocks also detected.
 */
export function parseBuildGradle(content: string): ParsedDependencies {
  const packages: string[] = [];
  const devPackages: string[] = [];

  // Match dependency declarations in any format:
  //   implementation("group:artifact:version")
  //   implementation 'group:artifact:version'
  //   testImplementation("group:artifact:version")
  const depRegex = /(\w+)\s*[\s(]["']([^"':]+:[^"':]+):[^"']+["']\)?/g;

  for (const match of content.matchAll(depRegex)) {
    const config = match[1] ?? '';
    const groupArtifact = match[2] ?? ''; // group:artifact
    const groupId = (groupArtifact.split(':')[0] ?? '').trim();

    if (isTestConfig(config)) {
      devPackages.push(groupId);
    } else if (isMainConfig(config)) {
      packages.push(groupId);
    }
  }

  // Extract plugin IDs from plugins { id("...") } or id '...'
  const pluginRegex = /\bid\s*[\s(]["']([^"']+)["']/g;
  for (const match of content.matchAll(pluginRegex)) {
    packages.push(match[1] ?? '');
  }

  return {
    manifest: 'build.gradle',
    packages: unique(packages),
    devPackages: unique(devPackages),
  };
}

function isMainConfig(config: string): boolean {
  return (
    config === 'implementation' ||
    config === 'api' ||
    config === 'compile' ||
    config === 'runtimeOnly' ||
    config === 'compileOnly'
  );
}

function isTestConfig(config: string): boolean {
  return (
    config === 'testImplementation' ||
    config === 'testCompile' ||
    config === 'testRuntimeOnly' ||
    config === 'testCompileOnly'
  );
}

// ── pom.xml ───────────────────────────────────────────────────────────────────

/**
 * Parse a pom.xml file (simple regex, not a full XML parser).
 * - Extracts groupId from <dependency> blocks.
 * - scope=test → devPackages, otherwise → packages.
 */
export function parsePomXml(content: string): ParsedDependencies {
  try {
    const packages: string[] = [];
    const devPackages: string[] = [];

    // Match individual <dependency>...</dependency> blocks
    const depBlockRegex = /<dependency>([\s\S]*?)<\/dependency>/g;

    for (const blockMatch of content.matchAll(depBlockRegex)) {
      const block = blockMatch[1] ?? '';

      const groupIdMatch = block.match(/<groupId>\s*([^<\s]+)\s*<\/groupId>/);
      if (groupIdMatch === null) {
        continue;
      }

      const groupId = (groupIdMatch[1] ?? '').trim();
      const isTest = /<scope>\s*test\s*<\/scope>/i.test(block);

      if (isTest) {
        devPackages.push(groupId);
      } else {
        packages.push(groupId);
      }
    }

    return { manifest: 'pom.xml', packages: unique(packages), devPackages: unique(devPackages) };
  } catch {
    return empty('pom.xml');
  }
}

// ── pubspec.yaml ──────────────────────────────────────────────────────────────

/**
 * Parse a pubspec.yaml file (Flutter/Dart).
 * - dependencies keys → packages (SDK deps like `flutter: { sdk: flutter }` are skipped)
 * - dev_dependencies keys → devPackages (SDK deps skipped)
 */
export function parsePubspecYaml(content: string): ParsedDependencies {
  try {
    const parsed: unknown = parseYaml(content);
    if (!isObject(parsed)) {
      return empty('pubspec.yaml');
    }

    const packages = extractPubspecDeps(parsed, 'dependencies');
    const devPackages = extractPubspecDeps(parsed, 'dev_dependencies');

    return {
      manifest: 'pubspec.yaml',
      packages: unique(packages),
      devPackages: unique(devPackages),
    };
  } catch {
    return empty('pubspec.yaml');
  }
}

/** Extract non-SDK dependency names from a pubspec section. */
function extractPubspecDeps(parsed: Record<string, unknown>, key: string): string[] {
  const section = parsed[key];
  if (!isObject(section)) {
    return [];
  }

  const packages: string[] = [];
  for (const [name, value] of Object.entries(section)) {
    // Skip SDK dependencies: `flutter: { sdk: flutter }`
    if (isObject(value) && typeof value['sdk'] === 'string') {
      continue;
    }
    packages.push(name);
  }
  return packages;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Dispatch to the appropriate parser based on the manifest filename.
 * Returns null if the filename is not recognized.
 */
export function parseManifest(filename: string, content: string): ParsedDependencies | null {
  const basename = filename.split('/').pop() ?? filename;

  switch (basename) {
    case 'package.json':
      return parsePackageJson(content);
    case 'go.mod':
      return parseGoMod(content);
    case 'pyproject.toml':
      return parsePyprojectToml(content);
    case 'requirements.txt':
      return parseRequirementsTxt(content);
    case 'Cargo.toml':
      return parseCargoToml(content);
    case 'build.gradle':
    case 'build.gradle.kts':
      return parseBuildGradle(content);
    case 'pom.xml':
      return parsePomXml(content);
    case 'pubspec.yaml':
      return parsePubspecYaml(content);
    default:
      return null;
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function empty(manifest: string): ParsedDependencies {
  return { manifest, packages: [], devPackages: [] };
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Safely extract a string-keyed record from a parsed JSON object. */
function getStringMap(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const val = obj[key];
  if (isObject(val)) {
    return val;
  }
  return {};
}
