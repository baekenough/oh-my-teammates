import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import type { AgentCatalogEntry, AgentCategory } from './agent-catalog';
/**
 * Agent recommendation engine
 * Scans a project directory and produces ranked agent recommendations
 * based on file structure, config files, and manifest dependencies.
 */
import { AGENT_CATALOG } from './agent-catalog';
import type { ParsedDependencies } from './manifest-parser';
import { parseManifest } from './manifest-parser';

export interface AgentRecommendation {
  agent: string;
  category: AgentCategory;
  description: string;
  confidence: number;
  reasons: string[];
}

export interface RecommendOptions {
  minConfidence?: number;
  category?: AgentCategory;
}

interface ScanResult {
  extensions: Record<string, number>;
  filenames: string[];
  directories: string[];
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svelte-kit',
  'dist',
  'build',
  '__pycache__',
  '.next',
  'target',
  'vendor',
]);

const MANIFEST_FILES = [
  'package.json',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
];

export class Recommender {
  private basePath: string;

  constructor(basePath = '.') {
    this.basePath = basePath;
  }

  recommend(options: RecommendOptions = {}): AgentRecommendation[] {
    const { minConfidence = 0.3, category } = options;

    const scan = this.scanFiles();
    const manifests = this.parseManifests();

    const results: AgentRecommendation[] = [];

    for (const entry of AGENT_CATALOG) {
      const { confidence, reasons } = this.scoreAgent(entry, scan, manifests);

      if (confidence < minConfidence) {
        continue;
      }

      if (category !== undefined && entry.category !== category) {
        continue;
      }

      results.push({
        agent: entry.name,
        category: entry.category,
        description: entry.description,
        confidence,
        reasons,
      });
    }

    results.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return a.agent.localeCompare(b.agent);
    });

    return results;
  }

  // ── Private: file scanning ────────────────────────────────────────────────

  private scanFiles(): ScanResult {
    const extensions: Record<string, number> = {};
    const filenames: string[] = [];
    const directories: string[] = [];

    const walk = (dir: string, depth: number): void => {
      if (depth > 3) {
        return;
      }

      let entries: import('node:fs').Dirent[] = [];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        // skip unreadable directories
        return;
      }

      for (const entry of entries) {
        const name = entry.name;

        if (name.startsWith('.') && name !== '.dockerignore') {
          continue;
        }

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(name)) {
            continue;
          }
          directories.push(`${name}/`);
          walk(join(dir, name), depth + 1);
        } else {
          const ext = extname(name);
          if (ext) {
            extensions[ext] = (extensions[ext] ?? 0) + 1;
          }
          filenames.push(basename(name));
        }
      }
    };

    walk(this.basePath, 0);
    return { extensions, filenames, directories };
  }

  // ── Private: manifest parsing ─────────────────────────────────────────────

  private parseManifests(): ParsedDependencies[] {
    const results: ParsedDependencies[] = [];

    for (const filename of MANIFEST_FILES) {
      const filePath = resolve(this.basePath, filename);

      if (!existsSync(filePath)) {
        continue;
      }

      let content: string;
      try {
        content = readFileSync(filePath, 'utf-8');
      } catch {
        // skip files that can't be read
        continue;
      }

      try {
        const parsed = parseManifest(filename, content);
        if (parsed !== null) {
          results.push(parsed);
        }
      } catch {
        // skip unparseable manifests
      }
    }

    return results;
  }

  // ── Private: confidence scoring ───────────────────────────────────────────

  private scoreAgent(
    entry: AgentCatalogEntry,
    scan: ScanResult,
    manifests: ParsedDependencies[],
  ): { confidence: number; reasons: string[] } {
    let maxConfidence = 0;
    const reasons: string[] = [];

    // Layer 1: File extensions
    if (entry.detection.fileExtensions !== undefined) {
      for (const ext of entry.detection.fileExtensions) {
        const count = scan.extensions[ext] ?? 0;

        if (count >= 5) {
          const score = 0.5;
          if (score > maxConfidence) {
            maxConfidence = score;
          }
          reasons.push(`${count} ${ext} files found`);
        } else if (count >= 1) {
          const score = 0.3;
          if (score > maxConfidence) {
            maxConfidence = score;
          }
          reasons.push(`${count} ${ext} file(s) found`);
        }
      }
    }

    // Layer 2: Config files
    if (entry.detection.configFiles !== undefined) {
      for (const config of entry.detection.configFiles) {
        if (scan.filenames.includes(config)) {
          const score = 0.8;
          if (score > maxConfidence) {
            maxConfidence = score;
          }
          reasons.push(`${config} found`);
        }
      }
    }

    // Layer 3: Directory patterns
    if (entry.detection.directoryPatterns !== undefined) {
      for (const pattern of entry.detection.directoryPatterns) {
        if (scan.directories.includes(pattern)) {
          const score = 0.6;
          if (score > maxConfidence) {
            maxConfidence = score;
          }
          reasons.push(`${pattern} directory found`);
        }
      }
    }

    // Layer 4: Manifest dependencies (highest priority)
    if (entry.detection.dependencies !== undefined) {
      for (const rule of entry.detection.dependencies) {
        const matchingManifest = manifests.find((m) => m.manifest === rule.manifest);

        if (matchingManifest === undefined) {
          continue;
        }

        const allPkgs = [...matchingManifest.packages, ...matchingManifest.devPackages];
        const matchedPkgs = rule.packages.filter((p) => allPkgs.includes(p));

        if (matchedPkgs.length > 0) {
          if (rule.confidence > maxConfidence) {
            maxConfidence = rule.confidence;
          }
          reasons.push(`${matchedPkgs.join(', ')} in ${rule.manifest}`);
        }
      }
    }

    return { confidence: Math.min(maxConfidence, 1.0), reasons };
  }
}
