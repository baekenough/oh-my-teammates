import { describe, expect, it } from 'bun:test';
import {
  AGENT_CATALOG,
  getAllCategories,
  getCatalogByCategory,
  getCatalogEntry,
  parseManifest,
  Recommender,
  SessionLogger,
  Stewards,
  TeamConfig,
} from '../index';

describe('index re-exports', () => {
  it('should export TeamConfig', () => {
    expect(TeamConfig).toBeDefined();
  });

  it('should export SessionLogger', () => {
    expect(SessionLogger).toBeDefined();
  });

  it('should export Stewards', () => {
    expect(Stewards).toBeDefined();
  });

  it('should export Recommender', () => {
    expect(Recommender).toBeDefined();
    expect(typeof Recommender).toBe('function');
  });

  it('should export AGENT_CATALOG as a non-empty array', () => {
    expect(Array.isArray(AGENT_CATALOG)).toBe(true);
    expect(AGENT_CATALOG.length).toBeGreaterThan(0);
  });

  it('should export getCatalogEntry and return a known agent', () => {
    expect(typeof getCatalogEntry).toBe('function');
    const entry = getCatalogEntry('lang-typescript-expert');
    expect(entry).toBeDefined();
    expect(entry?.name).toBe('lang-typescript-expert');
  });

  it('getCatalogEntry returns undefined for unknown agent', () => {
    const entry = getCatalogEntry('nonexistent-agent');
    expect(entry).toBeUndefined();
  });

  it('should export getCatalogByCategory and return agents for a category', () => {
    expect(typeof getCatalogByCategory).toBe('function');
    const languageAgents = getCatalogByCategory('language');
    expect(languageAgents.length).toBeGreaterThan(0);
    expect(languageAgents.every((a) => a.category === 'language')).toBe(true);
  });

  it('should export getAllCategories and return unique categories', () => {
    expect(typeof getAllCategories).toBe('function');
    const categories = getAllCategories();
    expect(categories.length).toBeGreaterThan(0);
    // Check for uniqueness
    const unique = new Set(categories);
    expect(unique.size).toBe(categories.length);
  });

  it('should export parseManifest and dispatch correctly', () => {
    expect(typeof parseManifest).toBe('function');
    const result = parseManifest(
      'package.json',
      JSON.stringify({ dependencies: { react: '^18' } }),
    );
    expect(result).not.toBeNull();
    expect(result?.manifest).toBe('package.json');
  });
});
