/*
 * Shared invitation renderer, used by both invite.html (read-only, public)
 * and index.html's "청첩장 관리" tab (editable, live WYSIWYG preview).
 * Everything the card itself renders is scoped under `.ir-root` so its
 * (intentionally romantic/serif) styling can never bleed into the host page.
 */
window.InviteRender = (function () {
  const DEFAULT_INVITE = {
    groom: '양희범', bride: '김소진', date: '2027-02-27', time: '13:30',
    venue: '여의도 더 파티움',
    greeting: '두 사람이 하나의 마음으로 만나\n새로운 시작을 앞두고 있습니다.\n\n저희 두 사람의 첫 걸음을\n축복해 주시면 감사하겠습니다.',
    accountNote: '계좌번호는 추후 업데이트될 예정입니다.\n참석해 주시는 것만으로 큰 힘이 됩니다 🙏',
    layout: 'classic',
    photos: [],
    bgColor: '#fffdfa',
    textColor: '#4a3f33',
    accentColor: '#e0795c',
  };

  const COLOR_FIELDS = [
    { field: 'bgColor', label: '배경색', varName: '--ir-paper' },
    { field: 'textColor', label: '글자색', varName: '--ir-text' },
    { field: 'accentColor', label: '포인트색', varName: '--ir-accent' },
  ];

  const LAYOUTS = [
    { id: 'classic', label: '클래식', desc: '사진 한 장을 원형으로, 우아한 세로형' },
    { id: 'cover', label: '커버 포토', desc: '대표 사진이 상단을 가득 채우는 형태' },
    { id: 'gallery', label: '갤러리', desc: '여러 장의 사진을 그리드로 보여줌' },
    { id: 'polaroid', label: '폴라로이드', desc: '사진을 기울여 배치한 아기자기한 느낌' },
    { id: 'minimal', label: '미니멀', desc: '사진 없이 여백과 타이포 중심' },
  ];

  function photoUrl(slot) { return `/.netlify/functions/invite-photo?slot=${encodeURIComponent(slot)}`; }

  function formatDateLine(data) {
    try {
      const d = new Date(`${data.date}T${data.time || '00:00'}:00+09:00`);
      const weekday = d.toLocaleDateString('ko-KR', { weekday: 'long' });
      const [y, m, day] = data.date.split('-');
      const [hh, mm] = (data.time || '00:00').split(':').map(Number);
      const period = hh < 12 ? '오전' : '오후';
      const hour12 = hh % 12 === 0 ? 12 : hh % 12;
      return `${y}년 ${Number(m)}월 ${Number(day)}일 ${weekday} ${period} ${hour12}시${mm ? ' ' + mm + '분' : ''}`;
    } catch (e) {
      return data.date || '';
    }
  }

  function h(tag, attrs, children) {
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

  /* ---------- editable-aware primitives ---------- */

  // `ch` units badly under-measure Korean text (Hangul glyphs are far wider
  // than the "0" character `ch` is based on), which clipped names. Measure
  // the actual rendered width with a canvas using the input's real font.
  let measureCanvas = null;
  function measureTextWidth(text, font) {
    if (!measureCanvas) measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    ctx.font = font;
    return ctx.measureText(text || ' ').width;
  }
  function sizeToContent(input) {
    const cs = getComputedStyle(input);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const text = input.value || input.placeholder || ' ';
    const width = measureTextWidth(text, font);
    input.style.width = Math.ceil(width) + 14 + 'px';
  }
  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  // Text field that never re-renders the tree on input (so it keeps focus
  // while typing) — the caller's handler is responsible for persisting state.
  function textField(value, opts, handler, options) {
    options = options || {};
    if (!opts || !opts.editable) {
      return h(options.multiline ? 'div' : 'span', { class: options.cls || null }, value || '');
    }
    if (options.multiline) {
      const ta = h('textarea', {
        class: ((options.cls || '') + ' ir-edit ir-edit-area').trim(),
        rows: options.rows || 3,
        oninput: e => { autoGrow(e.target); handler(e.target.value); },
      }, value || '');
      requestAnimationFrame(() => autoGrow(ta));
      return ta;
    }
    const input = h('input', {
      type: 'text', class: ((options.cls || '') + ' ir-edit ir-edit-input').trim(), value: value || '',
      oninput: e => { sizeToContent(e.target); handler(e.target.value); },
    });
    requestAnimationFrame(() => sizeToContent(input));
    return input;
  }

  function namesField(data, opts, minimal) {
    const groomEl = textField(data.groom, opts, v => opts.onText('groom', v), { cls: 'ir-name-input' });
    const brideEl = textField(data.bride, opts, v => opts.onText('bride', v), { cls: 'ir-name-input' });
    const heart = h('span', { class: 'heart' }, minimal ? '&' : '♥');
    return h('div', { class: 'names' }, [groomEl, heart, brideEl]);
  }

  function venueField(data, opts) {
    return textField(data.venue, opts, v => opts.onText('venue', v), { cls: 'venue-line' });
  }

  function dateTimeField(data, opts) {
    if (!opts || !opts.editable) {
      return h('div', { class: 'date-line', 'data-mirror': 'datetime' }, formatDateLine(data));
    }
    const caption = h('div', { class: 'date-line date-caption' }, formatDateLine(data));
    const sync = patch => {
      const text = formatDateLine({ ...data, ...patch });
      caption.textContent = text;
      document.querySelectorAll('[data-mirror="datetime"]').forEach(m => { m.textContent = text; });
    };
    const dateInput = h('input', {
      type: 'date', class: 'ir-edit ir-date', value: data.date || '',
      oninput: e => { opts.onDate('date', e.target.value); sync({ date: e.target.value }); },
    });
    const timeInput = h('input', {
      type: 'time', class: 'ir-edit ir-time', value: data.time || '',
      oninput: e => { opts.onDate('time', e.target.value); sync({ time: e.target.value }); },
    });
    return h('div', { class: 'date-edit-wrap' }, [
      h('div', { class: 'date-inputs' }, [dateInput, timeInput]),
      caption,
    ]);
  }

  function photoNode(slot, cls) {
    if (!slot) return null;
    const img = h('img', { src: photoUrl(slot), alt: '', class: cls || null });
    img.addEventListener('error', () => { img.style.display = 'none'; });
    return img;
  }

  // Full-screen viewer for browsing every uploaded photo (guest view only).
  // Reuses a single overlay instance appended to <body>.
  function openLightbox(photos, startIndex) {
    if (!photos || !photos.length) return;
    let idx = startIndex;
    const img = h('img', { class: 'ir-lightbox-img' });
    const counter = h('div', { class: 'ir-lightbox-counter' });
    function show() {
      img.src = photoUrl(photos[idx]);
      counter.textContent = `${idx + 1} / ${photos.length}`;
    }
    function go(delta) { idx = (idx + delta + photos.length) % photos.length; show(); }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    }
    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
    const overlay = h('div', { class: 'ir-lightbox', onclick: close }, [
      h('button', { class: 'ir-lightbox-close', onclick: close }, '✕'),
      img,
    ]);
    img.addEventListener('click', e => e.stopPropagation());
    if (photos.length > 1) {
      overlay.append(
        h('button', { class: 'ir-lightbox-nav ir-lightbox-prev', onclick: e => { e.stopPropagation(); go(-1); } }, '‹'),
        h('button', { class: 'ir-lightbox-nav ir-lightbox-next', onclick: e => { e.stopPropagation(); go(1); } }, '›'),
        counter,
      );
    }
    show();
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  // A photo slot: read-only image (click opens a full lightbox of every
  // photo), or (when editable) a click-to-replace tile with a remove button.
  // `index` is the position within data.photos.
  function photoBlock(data, opts, index, cls) {
    const slot = data.photos[index];
    if (!opts || !opts.editable) {
      const img = photoNode(slot, cls);
      if (img) {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => openLightbox(data.photos, index));
      }
      return img;
    }

    const wrap = h('div', { class: ((cls || '') + ' ir-photo-wrap').trim() });
    if (slot) wrap.append(photoNode(slot, 'ir-photo-img'));
    wrap.append(h('div', { class: 'ir-photo-overlay' }, slot ? '✎ 사진 변경' : '+ 사진 추가'));
    const fileInput = h('input', {
      type: 'file', accept: 'image/*', class: 'ir-photo-file-input',
      onchange: e => { if (e.target.files[0]) opts.onPhotoSelect(index, e.target.files[0]); e.target.value = ''; },
    });
    wrap.append(fileInput);
    if (slot) {
      const removeBtn = h('button', {
        class: 'ir-photo-remove', title: '삭제',
        onclick: e => { e.stopPropagation(); opts.onPhotoRemove(index); },
      }, '✕');
      wrap.append(removeBtn);
      wrap.addEventListener('click', e => { if (e.target !== removeBtn) fileInput.click(); });
    } else {
      wrap.addEventListener('click', () => fileInput.click());
    }
    return wrap;
  }

  function addPhotoTile(opts, cls) {
    const fileInput = h('input', {
      type: 'file', accept: 'image/*', class: 'ir-photo-file-input',
      onchange: e => { if (e.target.files[0]) opts.onPhotoSelect(-1, e.target.files[0]); e.target.value = ''; },
    });
    const tile = h('div', { class: ((cls || '') + ' ir-photo-add').trim() }, ['+ 사진 추가', fileInput]);
    tile.addEventListener('click', e => { if (e.target !== fileInput) fileInput.click(); });
    return tile;
  }

  /* ---------- shared blocks ---------- */

  function heroBlock(data, opts, config) {
    config = config || {};
    return h('div', { class: config.cls || 'hero' }, [
      h('div', { class: 'kicker' }, 'WE ARE GETTING MARRIED'),
      namesField(data, opts, config.minimal),
      dateTimeField(data, opts),
      venueField(data, opts),
    ]);
  }

  function ddayBox(data) {
    const box = h('div', { class: 'dday-box' }, [
      h('div', { class: 'num' }, 'D-day'),
      h('div', { class: 'label' }, `${data.groom} ❤️ ${data.bride}의 결혼식이 다가옵니다`),
    ]);
    try {
      const d = new Date(`${data.date}T${data.time || '00:00'}:00+09:00`);
      const diff = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
      box.querySelector('.num').textContent = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-Day' : `결혼 후 ${Math.abs(diff)}일`;
    } catch (e) {}
    return box;
  }

  function greetingBlock(data, opts) {
    return h('div', { class: 'greeting' }, [
      textField(data.greeting, opts, v => opts.onText('greeting', v), { multiline: true, rows: 5, cls: 'greeting-input' }),
    ]);
  }

  function mapSection(data, opts) {
    const q = encodeURIComponent(data.venue || '');
    return h('section', { class: 'block' }, [
      h('div', { class: 'block-title' }, '오시는 길'),
      h('div', { class: 'info-card' }, [
        h('div', { class: 'venue-name', 'data-mirror': 'venue' }, data.venue || ''),
        h('div', { class: 'venue-detail', 'data-mirror': 'datetime' }, formatDateLine(data)),
        h('div', { class: 'map-links' }, [
          h('a', { class: 'map-btn', 'data-map': 'naver', href: `https://map.naver.com/p/search/${q}`, target: '_blank', rel: 'noopener' }, '🗺️ 네이버 지도'),
          h('a', { class: 'map-btn', 'data-map': 'kakao', href: `https://map.kakao.com/link/search/${q}`, target: '_blank', rel: 'noopener' }, '🚗 카카오맵'),
        ]),
      ]),
    ]);
  }

  function accountSection(data, opts) {
    return h('section', { class: 'block' }, [
      h('div', { class: 'block-title' }, '마음 전하실 곳'),
      h('div', { class: 'account-note' }, [
        textField(data.accountNote, opts, v => opts.onText('accountNote', v), { multiline: true, rows: 3, cls: 'account-input' }),
      ]),
    ]);
  }

  function footerBlock(data) {
    return h('footer', {}, [data.groom, ' ', h('span', { class: 'heart' }, '·'), ' ', data.bride, ' ', h('span', { class: 'heart' }, '♥')]);
  }

  function divider() { return h('div', { class: 'divider' }, '❈'); }

  /* ---------- layouts ---------- */

  function buildClassic(data, opts) {
    const pad = h('div', { class: 'pad' });
    const hero = heroBlock(data, opts);
    if (data.photos && (data.photos[0] || (opts && opts.editable))) {
      hero.prepend(photoBlock(data, opts, 0, 'classic-photo'));
    }
    pad.append(hero, ddayBox(data), greetingBlock(data, opts), divider(), mapSection(data, opts), accountSection(data, opts), footerBlock(data));
    return pad;
  }

  function buildCover(data, opts) {
    const editable = opts && opts.editable;
    if (!data.photos || !data.photos[0]) {
      if (!editable) return buildClassic(data, opts); // guests never see an empty cover slot
    }
    const root = document.createDocumentFragment();
    const heroText = heroBlock(data, opts, { cls: 'cover-text' });
    const hero = h('div', { class: 'cover-hero' }, [photoBlock(data, opts, 0, 'ir-cover-photo'), heroText]);
    root.append(hero);
    const pad = h('div', { class: 'pad' });
    pad.append(ddayBox(data), greetingBlock(data, opts), divider(), mapSection(data, opts), accountSection(data, opts), footerBlock(data));
    root.append(pad);
    return root;
  }

  function buildGallery(data, opts) {
    const editable = opts && opts.editable;
    const pad = h('div', { class: 'pad' });
    pad.append(heroBlock(data, opts), ddayBox(data), greetingBlock(data, opts));
    const photos = data.photos || [];
    const tiles = photos.map((_, i) => photoBlock(data, opts, i, i === 0 && photos.length % 2 === 1 ? 'wide' : ''));
    if (editable && photos.length < (opts.maxPhotos || 6)) tiles.push(addPhotoTile(opts));
    if (tiles.length) {
      const grid = h('div', { class: 'gallery-grid' }, tiles);
      pad.append(h('section', { class: 'block' }, [h('div', { class: 'block-title' }, '우리의 순간'), grid]));
    }
    pad.append(divider(), mapSection(data, opts), accountSection(data, opts), footerBlock(data));
    return pad;
  }

  function buildPolaroid(data, opts) {
    const editable = opts && opts.editable;
    const pad = h('div', { class: 'pad' });
    pad.append(heroBlock(data, opts), ddayBox(data));
    const photos = data.photos || [];
    const tiles = photos.map((_, i) => h('div', { class: 'polaroid-item' }, [photoBlock(data, opts, i, '')]));
    if (editable && photos.length < (opts.maxPhotos || 6)) tiles.push(h('div', { class: 'polaroid-item' }, [addPhotoTile(opts)]));
    if (tiles.length) pad.append(h('div', { class: 'polaroid-grid' }, tiles));
    pad.append(greetingBlock(data, opts), divider(), mapSection(data, opts), accountSection(data, opts), footerBlock(data));
    return pad;
  }

  function buildMinimal(data, opts) {
    const pad = h('div', { class: 'pad' });
    pad.append(heroBlock(data, opts, { cls: 'minimal-hero hero', minimal: true }));
    pad.append(ddayBox(data), greetingBlock(data, opts), divider(), mapSection(data, opts), accountSection(data, opts), footerBlock(data));
    return pad;
  }

  const BUILDERS = { classic: buildClassic, cover: buildCover, gallery: buildGallery, polaroid: buildPolaroid, minimal: buildMinimal };

  function buildInviteCard(data, opts) {
    opts = opts || {};
    const build = BUILDERS[data.layout] || buildClassic;
    const root = h('div', { class: 'ir-root' });
    COLOR_FIELDS.forEach(({ field, varName }) => {
      if (data[field]) root.style.setProperty(varName, data[field]);
    });
    root.append(build(data, opts));
    return root;
  }

  /* ---------- injected, scoped stylesheet ---------- */
  const STYLE = `
.ir-root {
  --ir-paper: #fffdfa; --ir-panel: #ffffff; --ir-panel-2: #fbeee1; --ir-border: #ecdfce;
  --ir-text: #4a3f33; --ir-muted: #a5967e; --ir-accent: #e0795c; --ir-accent-soft: #f6d9c9;
  --ir-radius: 18px;
  --ir-font-head: 'Gowun Batang', 'Nanum Myeongjo', serif;
  --ir-font-body: 'Nunito', -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif;
  font-family: var(--ir-font-body); color: var(--ir-text); background: var(--ir-paper);
}
.ir-root * { box-sizing: border-box; }
.ir-root .pad { padding: 30px; }
.ir-root .hero { text-align: center; margin-bottom: 40px; }
.ir-root .kicker { font-size: 0.78rem; letter-spacing: 0.18em; color: var(--ir-muted); font-weight: 700; margin-bottom: 18px; }
.ir-root .names { font-family: var(--ir-font-head); font-size: 2.1rem; font-weight: 700; line-height: 1.5; margin-bottom: 18px; display: flex; align-items: baseline; justify-content: center; gap: 8px; flex-wrap: wrap; }
.ir-root .names .heart { color: var(--ir-accent); font-size: 1.4rem; }
.ir-root .date-line { font-size: 1.05rem; font-weight: 700; margin-bottom: 4px; color: var(--ir-text); }
.ir-root .venue-line { font-size: 0.9rem; color: var(--ir-muted); }
.ir-root .date-edit-wrap { margin-bottom: 4px; }
.ir-root .date-inputs { display: flex; gap: 6px; justify-content: center; margin-bottom: 4px; }
.ir-root .date-caption { color: var(--ir-muted); font-weight: 600; font-size: 0.85rem; }

.ir-root .divider { display: flex; align-items: center; gap: 12px; margin: 34px 0; color: var(--ir-accent-soft); font-size: 0.9rem; }
.ir-root .divider::before, .ir-root .divider::after { content: ''; flex: 1; height: 1px; background: var(--ir-border); }

.ir-root .dday-box { text-align: center; background: var(--ir-panel-2); border-radius: var(--ir-radius); padding: 18px; margin-bottom: 34px; }
.ir-root .dday-box .num { font-family: var(--ir-font-head); font-size: 1.8rem; font-weight: 700; color: var(--ir-accent); }
.ir-root .dday-box .label { font-size: 0.78rem; color: var(--ir-muted); margin-top: 4px; }

.ir-root .greeting { text-align: center; font-size: 0.98rem; line-height: 2; margin-bottom: 8px; white-space: pre-line; }

.ir-root section.block { margin-bottom: 34px; }
.ir-root .block-title { font-family: var(--ir-font-head); font-size: 1.15rem; font-weight: 700; text-align: center; margin-bottom: 16px; }

.ir-root .info-card { background: var(--ir-panel); border: 2px solid var(--ir-border); border-radius: var(--ir-radius); padding: 22px 20px; text-align: center; }
.ir-root .info-card .venue-name { font-weight: 800; font-size: 1.1rem; margin-bottom: 4px; }
.ir-root .info-card .venue-detail { color: var(--ir-muted); font-size: 0.85rem; margin-bottom: 16px; }

.ir-root .map-links { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.ir-root .map-btn {
  display: inline-flex; align-items: center; gap: 6px; background: var(--ir-panel-2);
  border: 2px solid var(--ir-border); border-radius: 999px; padding: 9px 16px;
  font-size: 0.85rem; font-weight: 700; color: var(--ir-text); text-decoration: none;
}
.ir-root .map-btn:hover { border-color: var(--ir-accent); color: var(--ir-accent); }

.ir-root .account-note {
  background: var(--ir-panel); border: 2px dashed var(--ir-border); border-radius: var(--ir-radius);
  padding: 20px; text-align: center; color: var(--ir-muted); font-size: 0.88rem; line-height: 1.7; white-space: pre-line;
}

.ir-root footer { text-align: center; color: var(--ir-muted); font-size: 0.8rem; }
.ir-root footer .heart { color: var(--ir-accent); }

.ir-root .classic-photo, .ir-root .classic-photo.ir-photo-wrap {
  width: 200px; height: 200px; border-radius: 50%; object-fit: cover;
  margin: 0 auto 20px; display: block; border: 4px solid var(--ir-panel);
  box-shadow: 0 8px 24px rgba(74,63,51,0.15); overflow: hidden;
}
.ir-root .classic-photo.ir-photo-wrap img { width: 100%; height: 100%; object-fit: cover; }

.ir-root .cover-hero { position: relative; width: 100%; aspect-ratio: 4/5; overflow: hidden; margin-bottom: 32px; }
.ir-root .cover-hero > .ir-cover-photo, .ir-root .cover-hero > img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ir-root .cover-hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(20,14,8,0.75) 100%); pointer-events: none; }
.ir-root .cover-hero .cover-text { position: absolute; left: 0; right: 0; bottom: 24px; z-index: 1; text-align: center; color: #fff; }
.ir-root .cover-hero .cover-text .kicker { color: rgba(255,255,255,0.85); }
.ir-root .cover-hero .cover-text .names { color: #fff; }
.ir-root .cover-hero .cover-text .date-line, .ir-root .cover-hero .cover-text .venue-line, .ir-root .cover-hero .cover-text .date-caption { color: rgba(255,255,255,0.9); }
.ir-root .cover-hero .cover-text .ir-edit { background: rgba(255,255,255,0.15); color: #fff; }

.ir-root .gallery-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ir-root .gallery-grid img, .ir-root .gallery-grid .ir-photo-wrap { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; display: block; overflow: hidden; }
.ir-root .gallery-grid .wide { grid-column: 1 / -1; aspect-ratio: 16/10; }

.ir-root .polaroid-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 18px 10px; padding: 10px 0 6px; }
.ir-root .polaroid-item { background: #fff; padding: 10px 10px 26px; box-shadow: 0 6px 16px rgba(74,63,51,0.18); width: 42%; transform: rotate(-3deg); }
.ir-root .polaroid-item:nth-child(2n) { transform: rotate(3deg); }
.ir-root .polaroid-item:nth-child(3n) { transform: rotate(-5deg); }
.ir-root .polaroid-item img, .ir-root .polaroid-item .ir-photo-wrap { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }

.ir-root .minimal-hero { text-align: center; margin-bottom: 44px; padding-top: 20px; }
.ir-root .minimal-hero .names { font-size: 1.7rem; flex-direction: column; }
.ir-root .minimal-hero .names .heart { font-size: 1rem; }

/* editable primitives */
.ir-root .ir-edit {
  background: transparent; border: 1px dashed transparent; border-radius: 6px;
  color: inherit; font-family: inherit; font-size: inherit; font-weight: inherit;
  text-align: inherit; padding: 1px 4px;
}
.ir-root .ir-edit:hover { border-color: var(--ir-accent-soft); }
.ir-root .ir-edit:focus { outline: none; border-color: var(--ir-accent); background: var(--ir-panel-2); border-style: solid; }
.ir-root .ir-edit-input { display: inline-block; min-width: 2ch; }
.ir-root .ir-name-input { font-family: var(--ir-font-head); font-size: inherit; font-weight: 700; text-align: center; }
.ir-root .ir-edit-area { display: block; width: 100%; resize: none; line-height: 2; overflow: hidden; }
.ir-root .greeting .ir-edit-area { text-align: center; }
.ir-root .account-note .ir-edit-area { text-align: center; color: var(--ir-muted); }
.ir-root .ir-date, .ir-root .ir-time { border: 1px solid var(--ir-border); border-radius: 8px; padding: 6px 8px; font-size: 0.85rem; background: var(--ir-panel); }

.ir-root .ir-photo-wrap { position: relative; cursor: pointer; background: var(--ir-panel-2); display: flex; align-items: center; justify-content: center; }
.ir-root .ir-photo-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ir-root .ir-photo-overlay {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(20,14,8,0.35); color: #fff; font-size: 0.78rem; font-weight: 700; opacity: 0;
  transition: opacity .15s; text-align: center; padding: 4px;
}
.ir-root .ir-photo-wrap:hover .ir-photo-overlay { opacity: 1; }
.ir-root .ir-photo-file-input { display: none; }
.ir-root .ir-photo-remove {
  position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 50%;
  background: rgba(0,0,0,0.55); color: #fff; border: none; cursor: pointer; font-size: 0.8rem; z-index: 2;
}
.ir-root .ir-photo-add {
  border: 2px dashed var(--ir-border); border-radius: 10px; background: var(--ir-panel-2);
  color: var(--ir-muted); display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 0.8rem; font-weight: 700; aspect-ratio: 1; text-align: center; padding: 6px;
}
.ir-root .ir-photo-add:hover { border-color: var(--ir-accent); color: var(--ir-accent); }
.ir-root .polaroid-item .ir-photo-add, .ir-root .polaroid-item .ir-photo-wrap { aspect-ratio: 1; }
.ir-root .classic-photo .ir-photo-add { border-radius: 50%; }

/* lightbox (appended to <body>, outside .ir-root — kept under its own
   distinctive ir-lightbox-* names so it can't collide with host page CSS) */
.ir-lightbox {
  position: fixed; inset: 0; background: rgba(0,0,0,0.88); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 20px; cursor: zoom-out;
}
.ir-lightbox-img { max-width: 100%; max-height: 100%; object-fit: contain; cursor: default; border-radius: 4px; }
.ir-lightbox-close {
  position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; border-radius: 50%;
  background: rgba(255,255,255,0.15); color: #fff; border: none; font-size: 1.1rem; cursor: pointer;
}
.ir-lightbox-close:hover { background: rgba(255,255,255,0.28); }
.ir-lightbox-nav {
  position: absolute; top: 50%; transform: translateY(-50%); width: 48px; height: 48px; border-radius: 50%;
  background: rgba(255,255,255,0.15); color: #fff; border: none; font-size: 1.6rem; cursor: pointer; line-height: 1;
}
.ir-lightbox-nav:hover { background: rgba(255,255,255,0.28); }
.ir-lightbox-prev { left: 16px; }
.ir-lightbox-next { right: 16px; }
.ir-lightbox-counter {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
  color: rgba(255,255,255,0.85); font-size: 0.82rem; font-weight: 600; letter-spacing: 0.04em;
}
`;

  if (!document.getElementById('ir-shared-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'ir-shared-style';
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);
  }

  return { DEFAULT_INVITE, LAYOUTS, COLOR_FIELDS, photoUrl, formatDateLine, buildInviteCard };
})();
