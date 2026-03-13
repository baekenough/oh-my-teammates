import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

describe('checkForUpdate', () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns updateAvailable: true when registry version is newer', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ version: '1.0.0' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { checkForUpdate } = await import('../version-checker');
    const result = await checkForUpdate('test-pkg', '0.7.2');
    expect(result).toEqual({ current: '0.7.2', latest: '1.0.0', updateAvailable: true });
  });

  it('returns updateAvailable: false when at latest version', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ version: '0.7.2' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { checkForUpdate } = await import('../version-checker');
    const result = await checkForUpdate('test-pkg', '0.7.2');
    expect(result).toEqual({ current: '0.7.2', latest: '0.7.2', updateAvailable: false });
  });

  it('returns null on fetch failure', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));
    const { checkForUpdate } = await import('../version-checker');
    const result = await checkForUpdate('test-pkg', '0.7.2');
    expect(result).toBeNull();
  });

  it('returns null on non-200 response', async () => {
    fetchSpy.mockResolvedValue(new Response('Not found', { status: 404 }));
    const { checkForUpdate } = await import('../version-checker');
    const result = await checkForUpdate('test-pkg', '0.7.2');
    expect(result).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    fetchSpy.mockResolvedValue(
      new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    );
    const { checkForUpdate } = await import('../version-checker');
    const result = await checkForUpdate('test-pkg', '0.7.2');
    expect(result).toBeNull();
  });

  it('sanitizes version string (strips non-semver chars)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ version: '1.0.0\x1b[31m' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { checkForUpdate } = await import('../version-checker');
    const result = await checkForUpdate('test-pkg', '0.7.2');
    expect(result?.latest).toBe('1.0.0');
    expect(result?.updateAvailable).toBe(true);
  });
});

describe('compareSemver', () => {
  it('correctly compares major versions', async () => {
    const { compareSemver } = await import('../version-checker');
    expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  it('correctly compares minor versions', async () => {
    const { compareSemver } = await import('../version-checker');
    expect(compareSemver('1.1.0', '1.0.0')).toBeGreaterThan(0);
  });

  it('correctly compares patch versions', async () => {
    const { compareSemver } = await import('../version-checker');
    expect(compareSemver('1.0.1', '1.0.0')).toBeGreaterThan(0);
  });

  it('returns 0 for equal versions', async () => {
    const { compareSemver } = await import('../version-checker');
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });
});
