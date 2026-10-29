// A stand-in for Fastify that is enough to call route handlers: routes are
// registered by method and path, inject() matches a path, fills params and
// turns thrown http errors into a status. The database answers every read
// with one generic row and records writes, so tests can check that a
// rejected request wrote nothing. Hooks, schemas and plugins are not run.

const STATUS = {
  badRequest: 400, unauthorized: 401, forbidden: 403, notFound: 404, conflict: 409,
  serviceUnavailable: 503, internalServerError: 500,
};

export function httpErrors() {
  return new Proxy({}, {
    get: (_, name) => (message) => Object.assign(new Error(message), { statusCode: STATUS[name] || 500 }),
  });
}

/**
 * Fake database. `row` is merged into the generic row returned by reads;
 * `keys` maps player ids to a stored device-key hash.
 */
export function fakeDb({ row = {}, keys = {} } = {}) {
  const writes = [];
  const generic = {
    id: 't1', name: 'Event', status: 'registration', format: 'single_elim', game_mode: 'rb',
    vehicle_pool: 'prop', seed_mode: 'auto', tournament_id: 't1', player_id: 'p1',
    player1_id: 'p1', player2_id: 'p2', winner_id: null, score1: 0, score2: 0, bracket: 'main',
    round: 1, position: 1, count: 0, player_count: 2, swiss_rounds: null, points_table: null,
    ...row,
  };
  const query = async (sql, params = []) => {
    const text = String(sql).trim();
    if (/FROM axsuck\.player_keys/i.test(text)) {
      const hash = keys[String(params[0])];
      return { rows: hash ? [{ key_hash: hash }] : [], rowCount: hash ? 1 : 0 };
    }
    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(text)) return { rows: [], rowCount: 0 };
    const write = /^(INSERT|UPDATE|DELETE)\b/i.test(text);
    if (write) writes.push(text.split(/\s+/).slice(0, 3).join(' '));
    if (write && !/RETURNING/i.test(text)) return { rows: [], rowCount: 1 };
    return { rows: [{ ...generic }], rowCount: 1 };
  };
  return { query, connect: async () => ({ query, release() {} }), writes };
}

export async function buildRoutes(modules, db) {
  const routes = [];
  const fastify = {
    db,
    httpErrors: httpErrors(),
    tournamentEvents: { emit() {}, on() {}, off() {} },
    esLogger: null,
  };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    fastify[method] = (path, ...rest) => routes.push({ method: method.toUpperCase(), path, handler: rest.pop() });
  }
  for (const mod of modules) await mod(fastify);

  async function inject({ method, url, headers = {}, body = {}, query = {} }) {
    const route = routes.find((r) => r.method === method && match(r.path, url));
    if (!route) throw new Error(`no route ${method} ${url}`);
    const req = { method, url, headers, body, query, params: match(route.path, url), ip: '127.0.0.1', raw: { on() {} } };
    try {
      const payload = await route.handler(req, { headers() {}, header() {}, code() { return this; }, sse: {} });
      return { statusCode: 200, payload };
    } catch (err) {
      return { statusCode: err.statusCode || 500, error: err };
    }
  }
  return { routes, inject };
}

function match(pattern, url) {
  const a = pattern.split('/');
  const b = url.split('?')[0].split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

/** A URL for a route path, with its params filled in. */
export function sampleUrl(path) {
  return path.replace(':matchId', '1').replace(':season', '2026').replace(/:id/g, 't1');
}
