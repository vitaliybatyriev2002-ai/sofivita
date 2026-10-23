// Cloudflare Worker. Bind a D1 database as DB, then run schema.sql once.
const origins = new Set([
  'https://sofivita.ru',
  'http://sofivita.ru',
  'https://www.sofivita.ru',
  'http://www.sofivita.ru',
  'https://vitaliybatyriev2002-ai.github.io',
]);

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
      let row;
      if (request.method === 'POST') {
        if (!allowed) return reply({ error: 'Origin required' }, 403);
        if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
          return reply({ error: 'JSON required' }, 415);
        }
        const body = await request.text();
        if (body.length > 128) return reply({ error: 'Body too large' }, 413);
        let data;
        try { data = JSON.parse(body); } catch { return reply({ error: 'Invalid JSON' }, 400); }
        if (data?.delta !== 1 && data?.delta !== -1) return reply({ error: 'Invalid delta' }, 400);
        // One atomic update: simultaneous clicks cannot overwrite each other.
        row = await env.DB.prepare(
          'UPDATE quarrels SET count = min(9007199254740991, max(0, count + ?)) WHERE id = 1 RETURNING count'
        ).bind(data.delta).first();
      } else {
        row = await env.DB.prepare('SELECT count FROM quarrels WHERE id = 1').first();
      }
      if (!row || !Number.isSafeInteger(row.count) || row.count < 0) throw new Error('Database not initialized');
      return reply({ count: row.count });
    } catch {
      return reply({ error: 'Counter unavailable' }, 503);
    }
  },
};
