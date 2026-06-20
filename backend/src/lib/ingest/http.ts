/**
 * Polite HTTP fetching for corpus ingestion: a realistic User-Agent, retry with
 * backoff, and a minimum delay between requests so we do not hammer source
 * sites (public court and legislation portals). Respect each source's terms of
 * use and robots.txt before running a crawl.
 */

const DEFAULT_UA =
  "MikeLegalBot/1.0 (+https://mikeoss.com; legal-research corpus ingestion)";

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchOptions {
  /** Minimum milliseconds between successive requests. Default 1500. */
  minDelayMs?: number;
  /** Number of retry attempts on failure. Default 3. */
  retries?: number;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Extra headers to merge in. */
  headers?: Record<string, string>;
}

async function politeDelay(minDelayMs: number): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < minDelayMs) await sleep(minDelayMs - elapsed);
  lastRequestAt = Date.now();
}

async function fetchOnce(
  url: string,
  opts: FetchOptions,
  accept: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 30000,
  );
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": DEFAULT_UA,
        Accept: accept,
        ...opts.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function withRetry<T>(
  url: string,
  opts: FetchOptions,
  run: () => Promise<T>,
): Promise<T> {
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await politeDelay(opts.minDelayMs ?? 1500);
      return await run();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    }
  }
  throw new Error(
    `fetch failed for ${url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

/** Fetch a URL and return the response body as text (HTML). */
export async function fetchHtml(
  url: string,
  opts: FetchOptions = {},
): Promise<string> {
  return withRetry(url, opts, async () => {
    const resp = await fetchOnce(url, opts, "text/html,application/xhtml+xml");
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return resp.text();
  });
}

/** Fetch a URL and return the response body as a Buffer (e.g. a PDF). */
export async function fetchBuffer(
  url: string,
  opts: FetchOptions = {},
): Promise<Buffer> {
  return withRetry(url, opts, async () => {
    const resp = await fetchOnce(url, opts, "application/pdf,*/*");
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const arrayBuffer = await resp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  });
}
