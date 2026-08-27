import { getStore } from '@netlify/blobs';

const STORE_NAME = 'invite-photos';

function checkAuth(req) {
  const expected = process.env.PLAN_PASSCODE;
  if (!expected) return false;
  return (req.headers.get('x-plan-passcode') || '') === expected;
}

export default async (req) => {
  const url = new URL(req.url);
  const slot = (url.searchParams.get('slot') || '').replace(/[^a-z0-9_-]/gi, '');
  if (!slot) {
    return new Response(JSON.stringify({ error: 'slot is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  // Reading a photo is public — guests viewing /invite need this with no passcode.
  if (req.method === 'GET') {
    const bytes = await store.get(slot, { type: 'arrayBuffer' });
    if (!bytes) return new Response('Not found', { status: 404 });
    return new Response(bytes, {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=300' },
    });
  }

  // Uploading or deleting a photo requires the shared passcode.
  if (!checkAuth(req)) {
    return new Response(JSON.stringify({ error: '비밀번호가 올바르지 않습니다.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (req.method === 'POST') {
    const bytes = await req.arrayBuffer();
    if (!bytes || bytes.byteLength === 0) {
      return new Response(JSON.stringify({ error: 'empty body' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    await store.set(slot, bytes);
    return new Response(JSON.stringify({ ok: true, slot }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  if (req.method === 'DELETE') {
    await store.delete(slot);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response('Method not allowed', { status: 405 });
};
