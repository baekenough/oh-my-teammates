/**
 * Shared fetch utility with retry logic for CI scripts.
 *
 * Retryable status codes:
 *   429 — Rate limited (respects Retry-After header)
 *   500 — Internal server error
 *   502 — Bad gateway
 *   503 — Service unavailable
 *   529 — Anthropic overloaded
 */

export interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  timeoutMs?: number;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(response: Response, attempt: number, baseDelay: number): number {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }
  const exponential = baseDelay * 2 ** attempt;
  const jitter = Math.random() * 1000;
  return exponential + jitter;
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: RetryConfig = {},
): Promise<Response> {
  const maxRetries = config.maxRetries ?? 3;
  const baseDelay = config.baseDelay ?? 1000;
  const timeoutMs = config.timeoutMs ?? 60000;

  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!RETRYABLE_STATUS_CODES.has(response.status)) {
        return response;
      }

      lastResponse = response;

      if (attempt < maxRetries) {
        const delay = getRetryDelay(response, attempt, baseDelay);
        console.warn(
          `[fetch-retry] HTTP ${response.status} on attempt ${attempt + 1}/${maxRetries + 1}. ` +
            `Retrying in ${Math.round(delay)}ms...`,
        );
        await sleep(delay);
      }
    } catch (error) {
      clearTimeout(timeoutId);

      const isTimeout =
        error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'));

      if (isTimeout && attempt < maxRetries) {
        const delay = baseDelay * 2 ** attempt;
        console.warn(
          `[fetch-retry] Timeout on attempt ${attempt + 1}/${maxRetries + 1}. ` +
            `Retrying in ${Math.round(delay)}ms...`,
        );
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  return lastResponse!;
}
