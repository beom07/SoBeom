import { getStore } from '@netlify/blobs';

// Server-renders /invite so link-preview crawlers (KakaoTalk, iMessage, etc.)
// see the couple's actual photo/names/date in the <head> meta tags — they
// don't run JavaScript, so a static invite.html with client-fetched data
// would always show placeholder text in link previews.

function formatDateLine(data) {
  try {
    const d = new Date(`${data.date}T${data.time || '00:00'}:00+09:00`);
    const weekday = d.toLocaleDateString('ko-KR', { weekday: 'long' });
    const [y, m, day] = data.date.split('-');
    const [hh, mm] = (data.time || '00:00').split(':').map(Number);
    const period = hh < 12 ? '오전' : '오후';
    const hour12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${y}년 ${Number(m)}월 ${Number(day)}일 ${weekday} ${period} ${hour12}시${mm ? ' ' + mm + '분' : ''}`;
  } catch {
    return data.date || '';
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async (req) => {
  const store = getStore({ name: 'invite-data', consistency: 'strong' });
  const raw = await store.get('content', { type: 'json' });
  const data = raw || {};
  const origin = new URL(req.url).origin;
  // Escape '<' so a stray "</script>" inside user-entered text (greeting,
  // tagline, etc.) can't break out of the inline <script> block below.
  const ssrJson = JSON.stringify(raw || null).replace(/</g, '\\u003c');

  const groom = data.groom || '신랑';
  const bride = data.bride || '신부';
  const title = `${groom} ♥ ${bride} 결혼합니다`;
  const descParts = [];
  if (data.date) descParts.push(formatDateLine(data));
  if (data.venue) descParts.push(data.venue);
  const description = descParts.join(' · ') || '모바일 청첩장';

  // Prefer the uploaded envelope cover photo for link previews (KakaoTalk,
  // iMessage, etc.) since that's the couple's chosen representative image;
  // fall back to the first gallery photo if no envelope image was uploaded.
  const photoStore = getStore({ name: 'invite-photos', consistency: 'strong' });
  const envelopeBytes = await photoStore.get('envelope-cover', { type: 'arrayBuffer' }).catch(() => null);
  const imageSlot = envelopeBytes ? 'envelope-cover' : (data.photos && data.photos[0]);
  const imageTag = imageSlot
    ? `<meta property="og:image" content="${origin}/.netlify/functions/invite-photo?slot=${encodeURIComponent(imageSlot)}">\n<meta name="twitter:card" content="summary_large_image">`
    : '';

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${origin}/invite">
${imageTag}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=Caveat:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
<script src="/invite-render.js"></script>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh;
    background:
      radial-gradient(circle, rgba(224,121,92,0.10) 1px, transparent 1px) 0 0/22px 22px,
      #faf5ee;
    display: flex; justify-content: center;
  }
  .card {
    width: 100%; max-width: 460px; min-height: 100vh;
    box-shadow: 0 0 60px rgba(74,63,51,0.08); padding-bottom: 60px; overflow: hidden;
  }
</style>
</head>
<body>
<div class="card" id="app"></div>
<script>
  const SSR_DATA = ${ssrJson};
  function render(data) {
    const app = document.getElementById('app');
    app.innerHTML = '';
    app.append(InviteRender.buildInviteCard(data, { editable: false }));
    document.title = data.groom + ' ♥ ' + data.bride + ' 결혼합니다';
  }
  render({ ...InviteRender.DEFAULT_INVITE, ...(SSR_DATA || {}) });

  // Re-fetch in case the blob changed after this page was rendered — but only
  // re-render if the data actually differs, otherwise tearing down and
  // rebuilding an already-correct page just causes a visible flash for nothing.
  fetch('/.netlify/functions/invite')
    .then(res => res.ok ? res.json() : null)
    .then(json => {
      if (json && json.data && JSON.stringify(json.data) !== JSON.stringify(SSR_DATA)) {
        render({ ...InviteRender.DEFAULT_INVITE, ...json.data });
      }
    })
    .catch(() => {});
</script>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
