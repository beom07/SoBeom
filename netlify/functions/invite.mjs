import { getStore } from '@netlify/blobs';

const STORE_NAME = 'invite-data';
const DATA_KEY = 'content';

function checkAuth(req) {
  const expected = process.env.PLAN_PASSCODE;
  if (!expected) return false;
  return (req.headers.get('x-plan-passcode') || '') === expected;
}

export default async (req) => {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  // Reading the invitation content is public — guests load /invite with no passcode.
  if (req.method === 'GET') {
    const data = await store.get(DATA_KEY, { type: 'json' });
    return new Response(JSON.stringify({ data: data || null }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // Every write requires the shared passcode.
  if (!checkAuth(req)) {
    return new Response(JSON.stringify({ error: '비밀번호가 올바르지 않습니다.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'invalid json' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    await store.setJSON(DATA_KEY, body);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response('Method not allowed', { status: 405 });
};
