// Cloudflare Worker. Bind a D1 database as DB, then run schema.sql once.
const origins = new Set([
  'https://sofivita.ru',
  'http://sofivita.ru',
  'https://www.sofivita.ru',
  'http://www.sofivita.ru',
  'https://vitaliybatyriev2002-ai.github.io',
]);

const historyTable = `CREATE TABLE IF NOT EXISTS quarrel_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delta INTEGER NOT NULL,
  count_after INTEGER NOT NULL,
  created_at TEXT NOT NULL
)`;
const historyTrigger = `CREATE TRIGGER IF NOT EXISTS log_quarrel_change
AFTER UPDATE OF count ON quarrels
WHEN NEW.count != OLD.count
BEGIN
  INSERT INTO quarrel_events (delta, count_after, created_at)
  VALUES (NEW.count - OLD.count, NEW.count, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = origins.has(origin);
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
    };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !allowed) return reply({ error: 'Origin not allowed' }, 403);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }});
    }
    if (new URL(request.url).pathname !== '/counter') return reply({ error: 'Not found' }, 404);
    if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Method not allowed' }, 405);
    try {
      // Idempotent migration preserves the existing counter; timestamps are server-generated.
      await env.DB.batch([env.DB.prepare(historyTable), env.DB.prepare(historyTrigger)]);
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS quarrel_event_authors (event_id INTEGER PRIMARY KEY, actor TEXT NOT NULL)').run();
      await env.DB.batch([
        env.DB.prepare('CREATE TABLE IF NOT EXISTS quarrel_event_details (event_id INTEGER PRIMARY KEY, actor TEXT, reason TEXT)'),
        // Requested correction: 23 October 2026, 00:07 Moscow = 22 October 21:07 UTC.
        env.DB.prepare("UPDATE quarrel_events SET created_at = '2026-10-22T21:07:00.000Z' WHERE id = 10 AND delta > 0 AND created_at != '2026-10-22T21:07:00.000Z'"),
        env.DB.prepare("INSERT OR IGNORE INTO quarrel_event_details (event_id, reason) SELECT id, 'тирлист' FROM quarrel_events WHERE id = 10 AND delta > 0"),
      ]);
      let statement;
      let actor = null;
      let reason = null;
      if (request.method === 'POST') {
        if (!allowed) return reply({ error: 'Origin required' }, 403);
        if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
          return reply({ error: 'JSON required' }, 415);
        }
        const body = await request.text();
        if (body.length > 4096) return reply({ error: 'Body too large' }, 413);
        let data;
        try { data = JSON.parse(body); } catch { return reply({ error: 'Invalid JSON' }, 400); }
        if (data?.actor != null && !['vitalya', 'sonya'].includes(data.actor)) return reply({ error: 'Invalid actor' }, 400);
        actor = data.actor || null;
        if (data?.delta !== 1 && data?.delta !== -1) return reply({ error: 'Invalid delta' }, 400);
        reason = typeof data.reason === 'string' ? data.reason.trim() : '';
        if (data.delta === 1 && (!reason || reason.length > 500)) return reply({ error: 'Reason required (1-500 characters)' }, 400);
        if (data.delta === 1 && !actor) return reply({ error: 'Actor required' }, 400);
        if (data.delta === -1) reason = null;
        // One atomic update: simultaneous clicks cannot overwrite each other.
        statement = env.DB.prepare(
          'UPDATE quarrels SET count = min(9007199254740991, max(0, count + ?)) WHERE id = 1 AND count + ? BETWEEN 0 AND 9007199254740991 RETURNING count'
        ).bind(data.delta, data.delta);
      } else {
        statement = env.DB.prepare('SELECT count FROM quarrels WHERE id = 1');
      }
      const statements = [statement];
      if (request.method === 'POST') {
        statements.push(env.DB.prepare(
          'INSERT INTO quarrel_event_details (event_id, actor, reason) SELECT id, ?, ? FROM quarrel_events WHERE id = (SELECT max(id) FROM quarrel_events) AND changes() > 0'
        ).bind(actor, reason));
      }
      statements.push(env.DB.prepare('SELECT count FROM quarrels WHERE id = 1'));
      statements.push(env.DB.prepare('SELECT e.id, e.delta, e.count_after, e.created_at, COALESCE(d.actor, a.actor) AS actor, d.reason FROM quarrel_events e LEFT JOIN quarrel_event_authors a ON a.event_id = e.id LEFT JOIN quarrel_event_details d ON d.event_id = e.id ORDER BY e.id DESC LIMIT 30'));
      const result = await env.DB.batch(statements);
      const row = result[result.length - 2].results[0];
      if (!row || !Number.isSafeInteger(row.count) || row.count < 0) throw new Error('Database not initialized');
      return reply({ count: row.count, history: result[result.length - 1].results });
    } catch {
      return reply({ error: 'Counter unavailable' }, 503);
    }
  },
};
