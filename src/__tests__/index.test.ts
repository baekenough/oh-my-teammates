import { describe, expect, it } from 'bun:test';
import { SessionLogger, Stewards, TeamConfig } from '../index';

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
});
