import { getStore } from '@netlify/blobs';

// Server-renders /meeting so link-preview crawlers (KakaoTalk, iMessage,
// etc.) see the couple's actual envelope image + intro text in the <head>
// meta tags — they don't run JavaScript, so the static sanggyeonrye.html
// with client-fetched data would always show placeholder text in previews.
// Mirrors netlify/functions/invite-page.mjs.

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async (req) => {
  const sgStore = getStore({ name: 'sanggyeonrye-data', consistency: 'strong' });
  const raw = await sgStore.get('content', { type: 'json' });
  const data = raw || { introText: '', slides: [] };

  // Borrow the couple's names from the invitation data for a nicer title —
  // 상견례 data itself doesn't track names, just the intro text/slideshow.
  const inviteStore = getStore({ name: 'invite-data', consistency: 'strong' });
  const inviteData = await inviteStore.get('content', { type: 'json' }).catch(() => null);
  const groom = (inviteData && inviteData.groom) || '신랑';
  const bride = (inviteData && inviteData.bride) || '신부';

  const origin = new URL(req.url).origin;
  const ssrJson = JSON.stringify(raw || null).replace(/</g, '\\u003c');

  const title = `${groom} · ${bride} 상견례 안내`;
  const introSnippet = (data.introText || '').replace(/\s+/g, ' ').trim();
  const description = introSnippet
    ? (introSnippet.length > 60 ? introSnippet.slice(0, 60) + '…' : introSnippet)
    : '상견례 안내 자료입니다.';

  // Prefer the uploaded envelope cover photo for link previews (separate
  // from the invitation's own envelope image); fall back to the first
  // photo slide if no envelope image was uploaded for 상견례. The "-og"
  // slot is a letterboxed (uncropped, full-photo) 1200x630 variant made
  // specifically for link previews, which crop to their own card aspect
  // ratio — prefer it over the raw crop-friendly upload.
  const photoStore = getStore({ name: 'invite-photos', consistency: 'strong' });
  const [envelopeOgBytes, envelopeBytes] = await Promise.all([
    photoStore.get('envelope-cover-sg-og', { type: 'arrayBuffer' }).catch(() => null),
    photoStore.get('envelope-cover-sg', { type: 'arrayBuffer' }).catch(() => null),
  ]);
  const firstSlidePhoto = (data.slides || []).find(s => s.type === 'photo');
  const imageSlot = envelopeOgBytes ? 'envelope-cover-sg-og' : envelopeBytes ? 'envelope-cover-sg' : (firstSlidePhoto && firstSlidePhoto.slot);
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
<meta property="og:url" content="${origin}/meeting">
${imageTag}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap" rel="stylesheet">
<script src="/sanggyeonrye-render.js"></script>
<style>
  :root {
    --sg-paper: #fffdfa; --sg-panel: #ffffff; --sg-panel-2: #fbeee1; --sg-border: #ecdfce;
    --sg-text: #4a3f33; --sg-muted: #a5967e; --sg-accent: #e0795c;
    --sg-font: 'Nanum Myeongjo', serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; background: var(--sg-paper); color: var(--sg-text);
    font-family: var(--sg-font); display: flex; justify-content: center;
  }
  .card { width: 100%; max-width: 460px; min-height: 100vh; padding-bottom: 50px; }
  .intro {
    text-align: center; font-size: 0.98rem; line-height: 1.9; color: var(--sg-text);
    white-space: pre-line; padding: 10px 30px 10px;
  }
  .empty { text-align: center; color: var(--sg-muted); padding: 60px 30px; font-size: 0.9rem; }

  .slideshow {
    position: relative; width: 100%; height: 420px; overflow: hidden; background: var(--sg-panel-2);
    transition: height .3s ease;
  }
  .slide-track { display: flex; height: 100%; transition: transform .45s cubic-bezier(.4,0,.2,1); }
  .slide { flex: 0 0 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: relative; touch-action: manipulation; }
  .slide img {
    width: 100%; height: 100%; object-fit: contain; display: block;
    pointer-events: none; touch-action: manipulation;
    -webkit-touch-callout: none; -webkit-user-select: none; user-select: none;
  }
  .slide.text-slide { background: var(--sg-panel); padding: 40px; }
  .slide.text-slide .slide-text {
    font-size: 1.1rem; line-height: 2; text-align: center; white-space: pre-line; color: var(--sg-text);
  }
  .slide-nav {
    position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 50%;
    background: rgba(255,255,255,0.85); border: none; font-size: 1.4rem; cursor: pointer; color: var(--sg-text);
    display: flex; align-items: center; justify-content: center;
  }
  .slide-nav.prev { left: 12px; }
  .slide-nav.next { right: 12px; }
  .slide-nav[disabled] { opacity: 0.3; cursor: default; }
  .slide-counter {
    position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.45); color: #fff; font-size: 0.75rem; padding: 4px 12px; border-radius: 999px;
  }

  .sg-envelope-perspective {
    position: fixed; inset: 0; z-index: 500;
    display: flex; align-items: center; justify-content: center; padding: 26px;
    overflow: hidden; cursor: pointer;
    background: radial-gradient(circle at 50% 42%, var(--sg-paper) 0%, var(--sg-panel-2) 100%);
    transition: transform .8s cubic-bezier(.5,0,.15,1), opacity .6s ease .15s;
  }
  .sg-envelope-perspective.sg-env-opening { transform: translateY(-6%) scale(1.04); opacity: 0; }

  .sg-env-wrap { width: min(84vw, 340px); text-align: center; }
  .sg-env-box {
    position: relative; width: 100%; aspect-ratio: 17 / 24; border-radius: 12px; overflow: hidden;
    background: var(--sg-panel-2);
    box-shadow: 0 25px 40px rgba(0,0,0,0.16);
  }
  .sg-env-cover-fallback {
    position: absolute; inset: 0; z-index: 0; display: flex; align-items: center; justify-content: center;
  }
  .sg-env-cover-img {
    position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; object-fit: cover;
  }
  .sg-env-icon-svg { width: 26px; height: 26px; color: var(--sg-muted); }

  .sg-env-hint {
    margin-top: 18px; font-size: 0.82rem; color: var(--sg-muted); letter-spacing: -0.2px;
    animation: sg-env-pulse 1.8s infinite;
  }
  @keyframes sg-env-pulse { 0%, 100% { opacity: .6; } 50% { opacity: 1; } }
</style>
</head>
<body>
<div class="card" id="app"></div>
<script>
  const SSR_DATA = ${ssrJson};
  SgRender.render(SSR_DATA || SgRender.DEFAULT_DATA);
  SgRender.showEnvelope();

  // Re-fetch in case the blob changed after this page was rendered — but only
  // re-render if the data actually differs, otherwise tearing down and
  // rebuilding an already-correct page just causes a visible flash for nothing.
  fetch('/.netlify/functions/sanggyeonrye')
    .then(res => res.ok ? res.json() : null)
    .then(json => {
      if (json && json.data && JSON.stringify(json.data) !== JSON.stringify(SSR_DATA)) {
        SgRender.render(json.data);
      }
    })
    .catch(() => {});
</script>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
