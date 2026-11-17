import { toReel, type Reel } from './instagram';

/** Where the scout gets an account's recent reels from. */
export type ReelSource = { reelsOf(username: string): Promise<Reel[]> };
export class SourceAccountError extends Error {}     // this account cannot be read (private, renamed, gone)
export class SourceBlockedError extends Error {}     // nothing can be read right now (bad key, quota used up)

export const RAPID_HOST = 'instagram-scraper-stable-api.p.rapidapi.com';
type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; text(): Promise<string> }>;

/** Reads reels through the "Instagram Scraper Stable API" listing on RapidAPI, so the user's own Instagram account is never involved. */
export function makeRapidSource(key: string, host = RAPID_HOST, doFetch: Fetch = fetch as unknown as Fetch): ReelSource {
  return {
    async reelsOf(username) {
      const res = await doFetch(`https://${host}/get_ig_user_reels.php`, {
        method: 'POST',
        headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username_or_url: username, amount: '24' }).toString(),
      });
      const body = await res.text();
      if (res.status === 401 || res.status === 403) throw new SourceBlockedError('RapidAPI refused the key. Check RAPIDAPI_KEY in .env and that you are subscribed to the API.');
      if (res.status === 429) throw new SourceBlockedError('The RapidAPI plan has no requests left for now.');
      let json: any;
      try { json = JSON.parse(body); } catch { throw new SourceAccountError(`No readable answer for ${username} (HTTP ${res.status})`); }
      if (res.status >= 400 || json?.error) throw new SourceAccountError(`Could not read ${username}: ${String(json?.error ?? json?.message ?? `HTTP ${res.status}`).slice(0, 120)}`);
      const list: any[] = json?.reels ?? json?.items ?? json?.data?.items ?? [];
      // This listing gives play counts but not lengths or captions; the scout fills those in for the videos it shortlists.
      return list.map(i => toReel(i?.node?.media ?? i?.media ?? i?.node ?? i, false)).filter((r): r is Reel => r !== null)
        .map(r => ({ ...r, username: r.username || username }));
    },
  };
}
