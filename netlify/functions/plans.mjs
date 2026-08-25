import { getStore } from '@netlify/blobs';

const KEY = 'state';
const STORE_NAME = 'myplans';

function checkAuth(req) {
  const expected = process.env.PLAN_PASSCODE;
  if (!expected) return { ok: false, reason: 'not_configured' };
  const given = req.headers.get('x-plan-passcode') || '';
  return { ok: given === expected, reason: 'bad_passcode' };
}

export default async (req) => {
  const auth = checkAuth(req);
  if (!auth.ok) {
    const status = auth.reason === 'not_configured' ? 500 : 401;
    const error = auth.reason === 'not_configured'
      ? 'PLAN_PASSCODE 환경변수가 설정되지 않았습니다.'
      : '비밀번호가 올바르지 않습니다.';
    return new Response(JSON.stringify({ error }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  if (req.method === 'GET') {
    const data = await store.get(KEY, { type: 'json' });
    return new Response(JSON.stringify({ data: data || null }), {
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
    await store.setJSON(KEY, body);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response('Method not allowed', { status: 405 });
};
