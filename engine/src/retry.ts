export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Only failures that may pass on a second try: rate limits, server errors and dropped connections. */
const retryable = (e: unknown) => {
  const err = e as { status?: number; name?: string; code?: string; message?: string };
  if (typeof err?.status === 'number') return err.status === 429 || err.status >= 500;
  if (/Connection|Timeout/i.test(err?.name ?? '')) return true;
  if (typeof err?.code === 'string' && /^(ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR)/.test(err.code)) return true;
  return e instanceof TypeError && /fetch failed|network/i.test(err.message ?? '');
};

/** Retries on network errors, HTTP 429 and 5xx, waiting 1 s, 3 s and 9 s between attempts. */
export async function withRetry<T>(fn: () => Promise<T>, delays = [1000, 3000, 9000]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt >= delays.length || !retryable(e)) throw e;
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
}

export async function okJson(res: Response, what: string): Promise<any> {
  if (!res.ok) throw new HttpError(res.status, `${what} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
