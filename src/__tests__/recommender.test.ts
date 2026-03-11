import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Recommender } from '../recommender';
import { SessionLogger } from '../session-logger';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `rec-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Recommender', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ── TypeScript project ────────────────────────────────────────────────────

  describe('TypeScript project detection', () => {
    it('recommends lang-typescript-expert for a TS project', () => {
      // Create tsconfig.json (config file detection → 0.8 confidence)
      writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
      // Create package.json with typescript dep (dependency detection → 0.9 confidence)
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } }),
      );
      // Create some .ts files
      writeFileSync(join(tmpDir, 'index.ts'), 'export const x = 1;');
      writeFileSync(join(tmpDir, 'main.ts'), 'console.log("hello");');

      const recommender = new Recommender(tmpDir);
      const results = recommender.recommend();

      const tsRec = results.find((r) => r.agent === 'lang-typescript-expert');
      expect(tsRec).toBeDefined();
      expect(tsRec?.confidence).toBeGreaterThanOrEqual(0.3);
    });
  });

  // ── NestJS project ────────────────────────────────────────────────────────

  describe('NestJS project detection', () => {
    it('recommends be-nestjs-expert for a NestJS project', () => {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            '@nestjs/core': '^10.0.0',
            '@nestjs/common': '^10.0.0',
          },
        }),
      );
      writeFileSync(
        join(tmpDir, 'nest-cli.json'),
        JSON.stringify({ collection: '@nestjs/schematics' }),
      );

      const recommender = new Recommender(tmpDir);
      const results = recommender.recommend();

      const nestRec = results.find((r) => r.agent === 'be-nestjs-expert');
      expect(nestRec).toBeDefined();
      expect(nestRec?.confidence).toBeGreaterThanOrEqual(0.3);
    });
  });

  // ── Docker detection ──────────────────────────────────────────────────────

  describe('Docker detection', () => {
    it('recommends infra-docker-expert when Dockerfile exists', () => {
      writeFileSync(
        join(tmpDir, 'Dockerfile'),
        'FROM node:18-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install\n',
      );

      const recommender = new Recommender(tmpDir);
      const results = recommender.recommend();

      const dockerRec = results.find((r) => r.agent === 'infra-docker-expert');
      expect(dockerRec).toBeDefined();
      expect(dockerRec?.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('recommends infra-docker-expert when docker-compose.yml exists', () => {
      writeFileSync(
        join(tmpDir, 'docker-compose.yml'),
        'version: "3"\nservices:\n  app:\n    build: .\n',
      );

      const recommender = new Recommender(tmpDir);
      const results = recommender.recommend();

      const dockerRec = results.find((r) => r.agent === 'infra-docker-expert');
      expect(dockerRec).toBeDefined();
    });
  });

  // ── Empty directory ───────────────────────────────────────────────────────

  describe('empty directory', () => {
    it('recommends nothing for an empty directory', () => {
      const recommender = new Recommender(tmpDir);
      const results = recommender.recommend();

      // Results may be empty or very low confidence — none should exceed default threshold
      expect(results.every((r) => r.confidence >= 0.3)).toBe(true);
      // No results should appear for language agents without any files
      const tsRec = results.find((r) => r.agent === 'lang-typescript-expert');
      const goRec = results.find((r) => r.agent === 'lang-golang-expert');
      expect(tsRec).toBeUndefined();
      expect(goRec).toBeUndefined();
    });
  });

  // ── minConfidence filter ──────────────────────────────────────────────────

  describe('minConfidence filter', () => {
    it('excludes results below minConfidence threshold', () => {
      // Create a project that has only file extension detection (lower confidence)
      writeFileSync(join(tmpDir, 'main.ts'), 'export const x = 1;');

      const recommender = new Recommender(tmpDir);

      // With a very high threshold, should filter out most results
      const highThreshold = recommender.recommend({ minConfidence: 0.99 });
      const lowThreshold = recommender.recommend({ minConfidence: 0.1 });

      expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
      expect(highThreshold.every((r) => r.confidence >= 0.99)).toBe(true);
    });

    it('returns all results above specified minConfidence', () => {
      writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify({}));
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } }),
      );

      const recommender = new Recommender(tmpDir);
      const results = recommender.recommend({ minConfidence: 0.5 });

      expect(results.every((r) => r.confidence >= 0.5)).toBe(true);
    });
  });

  // ── category filter ───────────────────────────────────────────────────────

  describe('category filter', () => {
    it('filters results by category', () => {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            typescript: '^5.0.0',
            '@nestjs/core': '^10.0.0',
          },
        }),
      );
      writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify({}));
      writeFileSync(join(tmpDir, 'Dockerfile'), 'FROM node:18\n');

      const recommender = new Recommender(tmpDir);
      const languageOnly = recommender.recommend({ category: 'language' });
      const infraOnly = recommender.recommend({ category: 'infrastructure' });

      expect(languageOnly.every((r) => r.category === 'language')).toBe(true);
      expect(infraOnly.every((r) => r.category === 'infrastructure')).toBe(true);
    });

    it('returns empty array when category has no matching agents above threshold', () => {
      // Empty dir — no data-engineering files
      const recommender = new Recommender(tmpDir);
      const results = recommender.recommend({ category: 'data-engineering' });
      expect(results).toHaveLength(0);
    });
  });

  // ── Sort order ────────────────────────────────────────────────────────────

  describe('sort order', () => {
    it('returns results sorted by confidence descending', () => {
      // Create multiple signals to generate multiple recommendations
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            typescript: '^5.0.0',
            react: '^18.0.0',
          },
        }),
      );
      writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify({}));

      const recommender = new Recommender(tmpDir);
      const results = recommender.recommend();

      for (let i = 1; i < results.length; i++) {
        // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee both indices are valid
        expect(results[i - 1]!.confidence).toBeGreaterThanOrEqual(results[i]!.confidence);
      }
    });
  });

  // ── Malformed manifest ────────────────────────────────────────────────────

  describe('malformed manifest handling', () => {
    it('handles gracefully when manifest is malformed', () => {
      writeFileSync(join(tmpDir, 'package.json'), '{ this is not valid JSON !!!');

      const recommender = new Recommender(tmpDir);

      // Should not throw, should return empty or valid results
      expect(() => recommender.recommend()).not.toThrow();
      const results = recommender.recommend();
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles partially readable project without throwing', () => {
      writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
      writeFileSync(join(tmpDir, 'package.json'), 'INVALID_JSON_CONTENT');
      writeFileSync(join(tmpDir, 'index.ts'), 'const x = 1;');

      const recommender = new Recommender(tmpDir);
      expect(() => recommender.recommend()).not.toThrow();
    });
  });

  // ── Flutter project ───────────────────────────────────────────────────────

  describe('Flutter project detection', () => {
    it('recommends fe-flutter-agent for a Flutter project', () => {
      writeFileSync(
        join(tmpDir, 'pubspec.yaml'),
        'name: my_app\ndependencies:\n  flutter:\n    sdk: flutter\n',
      );
      mkdirSync(join(tmpDir, 'lib'), { recursive: true });
      writeFileSync(join(tmpDir, 'lib', 'main.dart'), 'void main() {}');

      const recommender = new Recommender(tmpDir);
      const results = recommender.recommend();

      const flutterRec = results.find((r) => r.agent === 'fe-flutter-agent');
      expect(flutterRec).toBeDefined();
      expect(flutterRec?.confidence).toBeGreaterThanOrEqual(0.3);
    });
  });

  // ── Go project ────────────────────────────────────────────────────────────

  describe('Go project detection', () => {
    it('recommends lang-golang-expert for a Go project', () => {
      writeFileSync(
        join(tmpDir, 'go.mod'),
        'module github.com/example/app\n\ngo 1.21\n\nrequire github.com/gin-gonic/gin v1.9.0\n',
      );
      writeFileSync(join(tmpDir, 'main.go'), 'package main\n\nfunc main() {}\n');

      const recommender = new Recommender(tmpDir);
      const results = recommender.recommend();

      const goRec = results.find((r) => r.agent === 'lang-golang-expert');
      expect(goRec).toBeDefined();
    });
  });

  // ── Result structure ──────────────────────────────────────────────────────

  describe('result structure', () => {
    it('each recommendation has required fields', () => {
      writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify({}));

      const recommender = new Recommender(tmpDir);
      const results = recommender.recommend();

      for (const rec of results) {
        expect(typeof rec.agent).toBe('string');
        expect(typeof rec.category).toBe('string');
        expect(typeof rec.description).toBe('string');
        expect(typeof rec.confidence).toBe('number');
        expect(Array.isArray(rec.reasons)).toBe(true);
        expect(rec.confidence).toBeGreaterThanOrEqual(0);
        expect(rec.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── Layer 5: frequency boost ──────────────────────────────────────────────

  describe('Layer 5: frequency boost', () => {
    it('should boost confidence for agents with spawn history', () => {
      const dbPath = join(tmpDir, 'sessions.db');
      const logger = new SessionLogger(dbPath);
      logger.startSession('alice', 'main');
      logger.logEvent('agent_spawn', { agent: 'lang-typescript-expert' });
      logger.logEvent('agent_spawn', { agent: 'lang-typescript-expert' });
      logger.endSession();
      logger.close();

      const projectDir = join(tmpDir, 'project');
      mkdirSync(projectDir);
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(projectDir, `file${i}.ts`), '// test');
      }

      const recommender = new Recommender(projectDir);

      const withoutBoost = recommender.recommend({ minConfidence: 0.01 });
      const tsEntryWithout = withoutBoost.find((r) => r.agent === 'lang-typescript-expert');

      // Use a fresh Recommender to avoid cache
      const recommenderWithBoost = new Recommender(projectDir);
      const withBoost = recommenderWithBoost.recommend({
        minConfidence: 0.01,
        sessionsDbPath: dbPath,
      });
      const tsEntryWith = withBoost.find((r) => r.agent === 'lang-typescript-expert');

      expect(tsEntryWith).toBeDefined();
      expect(tsEntryWithout).toBeDefined();
      if (tsEntryWith !== undefined && tsEntryWithout !== undefined) {
        expect(tsEntryWith.confidence).toBeGreaterThan(tsEntryWithout.confidence);
        expect(tsEntryWith.reasons).toContain('used 2 time(s) in past sessions');
      }
    });

    it('should cap confidence at 1.0', () => {
      const dbPath = join(tmpDir, 'sessions-cap.db');
      const logger = new SessionLogger(dbPath);
      logger.startSession('alice', 'main');
      logger.logEvent('agent_spawn', { agent: 'lang-typescript-expert' });
      logger.endSession();
      logger.close();

      const projectDir = join(tmpDir, 'project-cap');
      mkdirSync(projectDir);
      for (let i = 0; i < 10; i++) {
        writeFileSync(join(projectDir, `file${i}.ts`), '// test');
      }
      writeFileSync(join(projectDir, 'tsconfig.json'), '{}');

      const recommender = new Recommender(projectDir);
      const results = recommender.recommend({ minConfidence: 0.01, sessionsDbPath: dbPath });
      const tsEntry = results.find((r) => r.agent === 'lang-typescript-expert');

      expect(tsEntry).toBeDefined();
      if (tsEntry !== undefined) {
        expect(tsEntry.confidence).toBeLessThanOrEqual(1.0);
      }
    });

    it('should skip gracefully when DB is missing', () => {
      const projectDir = join(tmpDir, 'project-missing');
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, 'file.ts'), '// test');

      const recommender = new Recommender(projectDir);
      const results = recommender.recommend({ sessionsDbPath: '/nonexistent/path/sessions.db' });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should not boost agents without spawn history', () => {
      const dbPath = join(tmpDir, 'sessions-noagent.db');
      const logger = new SessionLogger(dbPath);
      logger.startSession('alice', 'main');
      logger.logEvent('agent_spawn', { agent: 'some-other-agent' });
      logger.endSession();
      logger.close();

      const projectDir = join(tmpDir, 'project-noboost');
      mkdirSync(projectDir);
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(projectDir, `file${i}.ts`), '// test');
      }

      const withoutBoostRec = new Recommender(projectDir);
      const withoutBoost = withoutBoostRec.recommend({ minConfidence: 0.01 });
      const tsWithout = withoutBoost.find((r) => r.agent === 'lang-typescript-expert');

      const withBoostRec = new Recommender(projectDir);
      const withBoost = withBoostRec.recommend({ minConfidence: 0.01, sessionsDbPath: dbPath });
      const tsWithBoost = withBoost.find((r) => r.agent === 'lang-typescript-expert');

      if (tsWithBoost !== undefined && tsWithout !== undefined) {
        expect(tsWithBoost.confidence).toBe(tsWithout.confidence);
      }
    });
  });
});
