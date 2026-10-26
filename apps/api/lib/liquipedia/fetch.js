// Liquipedia MediaWiki API client that follows the API terms of use:
// a descriptive User-Agent with contact details, gzip, at most one request
// every 2 seconds, and only the API (never page HTML).
// https://liquipedia.net/api-terms-of-use

const WIKI_API = 'https://liquipedia.net/warthunder/api.php';
const COMMONS_API = 'https://liquipedia.net/commons/api.php';
const MIN_GAP_MS = 2100;
const BATCH = 50;
const REPO_URL = 'https://github.com/VermilionLP/potato-cup-tournament-platform';

/** User-Agent naming the project and, when given, a contact. */
export function userAgentFor(contact) {
  return `PotatoCupTournamentPlatform/1.0 (${REPO_URL}${contact ? `; ${contact}` : ''}) history-import`;
}

export function createClient({ userAgent, log = () => {} }) {
  if (!userAgent) throw new Error('A User-Agent with contact details is required');
  let last = 0;

  async function get(api, params) {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const url = `${api}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
    log(`GET ${url}`);
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, 'Accept-Encoding': 'gzip' },
    });
    if (!res.ok) throw new Error(`Liquipedia ${res.status} ${res.statusText} for ${url}`);
    const body = await res.json();
    if (body.error) throw new Error(`Liquipedia API error: ${body.error.info || body.error.code}`);
    return body;
  }

  /** Titles of main-namespace pages starting with `prefix`. */
  async function listPages(prefix) {
    const titles = [];
    let cont = {};
    do {
      const body = await get(WIKI_API, {
        action: 'query', list: 'allpages', apprefix: prefix, aplimit: '500', apnamespace: '0', ...cont,
      });
      titles.push(...body.query.allpages.map((p) => p.title));
      cont = body.continue || null;
    } while (cont);
    return titles;
  }

  /** { title: wikitext } for the given titles (50 per request). */
  async function pageContents(api, titles) {
    const out = {};
    for (let i = 0; i < titles.length; i += BATCH) {
      const body = await get(api, {
        action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
        titles: titles.slice(i, i + BATCH).join('|'),
      });
      for (const page of body.query.pages || []) {
        if (page.missing) continue;
        out[page.title] = page.revisions?.[0]?.slots?.main?.content ?? '';
      }
    }
    return out;
  }

  /**
   * Player pages for the given names, following redirects.
   * Returns { name: wikitext } keyed by the name that was asked for.
   */
  async function playerPages(names) {
    const out = {};
    for (let i = 0; i < names.length; i += BATCH) {
      const asked = names.slice(i, i + BATCH);
      const body = await get(WIKI_API, {
        action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1',
        titles: asked.join('|'),
      });
      const q = body.query || {};
      const step = (list) => new Map((list || []).map((r) => [r.from, r.to]));
      const normalized = step(q.normalized);
      const redirects = step(q.redirects);
      const content = new Map((q.pages || []).filter((pg) => !pg.missing)
        .map((pg) => [pg.title, pg.revisions?.[0]?.slots?.main?.content ?? '']));
      for (const name of asked) {
        let title = normalized.get(name) || name;
        title = redirects.get(title) || title;
        if (content.has(title)) out[name] = content.get(title);
      }
    }
    return out;
  }

  return {
    listPages,
    playerPages,
    wikiPages: (titles) => pageContents(WIKI_API, titles),
    /** Bracket templates by name ("Bracket/8") from Liquipedia Commons. */
    async bracketTemplates(names) {
      const byTitle = await pageContents(COMMONS_API, names.map((n) => `Template:${n}`));
      return Object.fromEntries(Object.entries(byTitle).map(([t, text]) => [t.replace(/^Template:/, ''), text]));
    },
  };
}
