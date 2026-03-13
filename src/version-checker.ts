/**
 * npm registry version checker.
 * First runtime network call in oh-my-teammates — designed for safety:
 * - 5 second timeout
 * - Response size bounded (reject > 10KB)
 * - Version string sanitized (strip non-semver chars)
 * - Graceful null return on any failure
 */

export interface UpdateCheckResult {
  current: string;
  latest: string;
  updateAvailable: boolean;
}

const REGISTRY_TIMEOUT_MS = 5000;
const MAX_RESPONSE_SIZE = 10 * 1024;

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function sanitizeVersion(version: string): string {
  const match = version.match(/^(\d+\.\d+\.\d+)/);
  return match ? (match[1] ?? '') : '';
}

export async function checkForUpdate(
  packageName: string,
  currentVersion: string,
): Promise<UpdateCheckResult | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(controller.abort.bind(controller), REGISTRY_TIMEOUT_MS);
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    );
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const contentLength = response.headers.get('content-length');
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) return null;
    const text = await response.text();
    if (text.length > MAX_RESPONSE_SIZE) return null;
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null || !('version' in data)) return null;
    const rawVersion = (data as { version: unknown }).version;
    if (typeof rawVersion !== 'string') return null;
    const latest = sanitizeVersion(rawVersion);
    if (!latest) return null;
    return {
      current: currentVersion,
      latest,
      updateAvailable: compareSemver(latest, currentVersion) > 0,
    };
  } catch {
    return null;
  }
}
