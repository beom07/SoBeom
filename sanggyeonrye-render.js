// Shared 상견례 (family-meeting page) renderer — used identically by the
// static fallback (sanggyeonrye.html) and the server-rendered /meeting
// route (netlify/functions/meeting-page.mjs), so both stay visually
// identical and the intro/slideshow/envelope logic lives in one place.
window.SgRender = (function () {
  const DEFAULT_DATA = { introText: '', slides: [] };

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of [].concat(children || [])) if (c !== null && c !== undefined) e.append(c);
    return e;
  }
  function photoUrl(slot) { return `/.netlify/functions/invite-photo?slot=${encodeURIComponent(slot)}`; }

  function renderSlideshow(slides) {
    if (!slides || !slides.length) return null;
    let idx = 0;
    const track = el('div', { class: 'slide-track' }, slides.map(s => {
      if (s.type === 'photo') {
        const img = el('img', { src: photoUrl(s.slot), alt: '' });
        img.onerror = () => { img.style.display = 'none'; };
        return el('div', { class: 'slide' }, [img]);
      }
      return el('div', { class: 'slide text-slide' }, [el('div', { class: 'slide-text' }, s.text || '')]);
    }));
    const prevBtn = el('button', { class: 'slide-nav prev', type: 'button' }, '‹');
    const nextBtn = el('button', { class: 'slide-nav next', type: 'button' }, '›');
    const counter = el('div', { class: 'slide-counter' }, `1 / ${slides.length}`);

    function update() {
      track.style.transform = `translateX(-${idx * 100}%)`;
      counter.textContent = `${idx + 1} / ${slides.length}`;
      prevBtn.disabled = idx === 0;
      nextBtn.disabled = idx === slides.length - 1;
    }
    prevBtn.addEventListener('click', () => { if (idx > 0) { idx--; update(); } });
    nextBtn.addEventListener('click', () => { if (idx < slides.length - 1) { idx++; update(); } });
    update();

    const wrap = el('div', { class: 'slideshow' }, [track, prevBtn, nextBtn]);
    if (slides.length > 1) wrap.append(counter);
    return wrap;
  }

  function render(data) {
    data = data || DEFAULT_DATA;
    const app = document.getElementById('app');
    app.innerHTML = '';
    if (data.introText && data.introText.trim()) {
      app.append(el('div', { class: 'intro' }, data.introText));
    }
    const slideshow = renderSlideshow(data.slides);
    if (slideshow) {
      app.append(slideshow);
    } else if (!data.introText) {
      app.append(el('div', { class: 'empty' }, '아직 등록된 자료가 없습니다.'));
    }
  }

  function envelopeIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'sg-env-icon-svg');
    svg.innerHTML = '<circle cx="8.5" cy="8" r="2.6"/><circle cx="16" cy="8.5" r="2.2"/>' +
      '<path d="M3.5 19c.4-3 2.5-5 5-5s4.6 2 5 5"/><path d="M13.6 14.3c2.2.2 3.9 2 4.3 4.7"/>';
    return svg;
  }

  // A single well-known photo slot, uploaded from 상견례 관리 (separate from
  // the 청첩장 envelope image — different occasion, different photo). Its
  // mere existence is the source of truth (no data-blob field needed). Falls
  // back to a plain card with an icon if nothing has been uploaded yet.
  const ENVELOPE_IMAGE_SLOT = 'envelope-cover-sg';

  // Guest view only, once per page load: an uploaded envelope photo (falls
  // back to a plain card if none was uploaded). A single tap rises the whole
  // thing away, revealing the intro text + slideshow already rendered
  // underneath — no intermediate greeting screen.
  let envelopeShown = false;
  function showEnvelope() {
    if (envelopeShown) return;
    envelopeShown = true;
    const persp = el('div', { class: 'sg-envelope-perspective' });
    const box = el('div', { class: 'sg-env-box' });
    const cover = el('img', { class: 'sg-env-cover-img', src: photoUrl(ENVELOPE_IMAGE_SLOT), alt: '' });
    const fallbackIcon = el('div', { class: 'sg-env-cover-fallback' }, [envelopeIcon()]);
    cover.addEventListener('error', () => { cover.style.display = 'none'; });

    box.append(fallbackIcon, cover);
    const hint = el('div', { class: 'sg-env-hint' }, '터치하면 열립니다 ✨');
    const wrap = el('div', { class: 'sg-env-wrap' }, [box, hint]);
    persp.append(wrap);

    persp.addEventListener('click', () => {
      persp.classList.add('sg-env-opening');
      document.body.style.overflow = '';
      setTimeout(() => persp.remove(), 900);
    });
    document.body.style.overflow = 'hidden';
    document.body.appendChild(persp);
  }

  return { DEFAULT_DATA, render, showEnvelope, photoUrl };
})();
