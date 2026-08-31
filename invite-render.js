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
    venueDetail: '',
    venueAddress: '',
    venuePhone: '',
    subwayInfo: '',
    busInfo: '',
    tagline: "We're getting Married!",
    ddayLabel: '',
    envelopeMessage: '',
    greeting: '두 사람이 하나의 마음으로 만나\n새로운 시작을 앞두고 있습니다.\n\n저희 두 사람의 첫 걸음을\n축복해 주시면 감사하겠습니다.',
    accountNote: '계좌번호는 추후 업데이트될 예정입니다.\n참석해 주시는 것만으로 큰 힘이 됩니다 🙏',
    layout: 'classic',
    photos: [],
    bgColor: '#fffdfa',
    textColor: '#4a3f33',
    accentColor: '#e0795c',
    boxColor: '#fbeee1',
    mutedColor: '#a5967e',
    btnColor: '#fbeee1',
    // editorial theme extras
    groomFather: '', groomMother: '', brideFather: '', brideMother: '',
    contactPhone: '', relationshipStartYear: '',
    mapImageSlot: '',
    groomBank: '', groomBankAccount: '', groomAccountHolder: '',
    brideBank: '', brideBankAccount: '', brideAccountHolder: '',
  };

  const COLOR_FIELDS = [
    { field: 'bgColor', label: '배경색', varName: '--ir-paper' },
    { field: 'textColor', label: '글자색', varName: '--ir-text' },
    { field: 'accentColor', label: '포인트색', varName: '--ir-accent' },
    { field: 'boxColor', label: '박스 배경', varName: '--ir-panel-2' },
    { field: 'mutedColor', label: '보조 글자색', varName: '--ir-muted' },
    { field: 'btnColor', label: '버튼 배경', varName: '--ir-btn-bg' },
  ];

  const LAYOUTS = [
    { id: 'classic', label: '클래식', desc: '사진 한 장을 원형으로, 우아한 세로형' },
    { id: 'cover', label: '커버 포토', desc: '대표 사진이 상단을 가득 채우는 형태' },
    { id: 'gallery', label: '갤러리', desc: '여러 장의 사진을 그리드로 보여줌' },
    { id: 'polaroid', label: '폴라로이드', desc: '사진을 기울여 배치한 아기자기한 느낌' },
    { id: 'minimal', label: '미니멀', desc: '사진 없이 여백과 타이포 중심' },
    { id: 'editorial', label: '매거진', desc: '화보 컨셉의 그레이 톤 에디토리얼 테마' },
  ];

  // Applied to the invite's color fields when this layout is selected in the
  // manager (still individually overridable afterward via the color pickers).
  const THEME_PRESETS = {
    editorial: {
      bgColor: '#f1efe9', textColor: '#2b2b2a', accentColor: '#2b2b2a',
      boxColor: '#ffffff', mutedColor: '#9c9a92', btnColor: '#ffffff',
      tagline: 'invite',
    },
  };

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

  function formatDateCompact(data) {
    try {
      const d = new Date(`${data.date}T00:00:00+09:00`);
      const yy = String(d.getFullYear()).slice(-2);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dow = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
      return `${yy}.${mm}.${dd}.${dow}`;
    } catch (e) {
      return data.date || '';
    }
  }

  // Attaches the correct Korean particle (과/와) based on whether the name's
  // last syllable has a batchim (final consonant) — e.g. 희범 -> 희범과, 소진 -> 소진과.
  function withGwaWa(name) {
    if (!name) return name || '';
    const last = name.charCodeAt(name.length - 1);
    if (last >= 0xac00 && last <= 0xd7a3) {
      const hasBatchim = (last - 0xac00) % 28 !== 0;
      return name + (hasBatchim ? '과' : '와');
    }
    return name + '와';
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
  function sizeToContent(input, vertical) {
    const cs = getComputedStyle(input);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const text = input.value || input.placeholder || ' ';
    const size = Math.ceil(measureTextWidth(text, font)) + 14;
    if (vertical) input.style.height = size + 'px';
    else input.style.width = size + 'px';
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
        rows: options.rows || 3, placeholder: options.placeholder || null,
        oninput: e => { autoGrow(e.target); handler(e.target.value); },
      }, value || '');
      requestAnimationFrame(() => autoGrow(ta));
      return ta;
    }
    const input = h('input', {
      type: 'text', class: ((options.cls || '') + ' ir-edit ir-edit-input').trim(), value: value || '',
      placeholder: options.placeholder || null,
      oninput: e => { sizeToContent(e.target, options.vertical); handler(e.target.value); },
    });
    requestAnimationFrame(() => sizeToContent(input, options.vertical));
    return input;
  }

  function namesField(data, opts, minimal) {
    const groomEl = textField(data.groom, opts, v => opts.onText('groom', v), { cls: 'ir-name-input' });
    const brideEl = textField(data.bride, opts, v => opts.onText('bride', v), { cls: 'ir-name-input' });
    const heart = h('span', { class: 'heart' }, minimal ? '&' : '♥');
    return h('div', { class: 'names' }, [groomEl, heart, brideEl]);
  }

  // Vertical, top-to-bottom name display used by the "cover" layout's photo
  // card (matches the reference: names run down the side of the photo).
  function verticalNamesField(data, opts) {
    const groomEl = textField(data.groom, opts, v => opts.onText('groom', v), { cls: 'ir-vertical-name', vertical: true });
    const brideEl = textField(data.bride, opts, v => opts.onText('bride', v), { cls: 'ir-vertical-name', vertical: true });
    return h('div', { class: 'cover2-names' }, [groomEl, h('span', { class: 'cover2-dot' }, '·'), brideEl]);
  }

  function taglineField(data, opts) {
    return textField(data.tagline, opts, v => opts.onText('tagline', v), { cls: 'cover2-tagline' });
  }

  // Read-only mirror — the canonical, editable venue-name field now lives in
  // mapSection's info-card (alongside the hall detail, address, phone).
  function venueField(data) {
    return h('div', { class: 'venue-line', 'data-mirror': 'venue' }, data.venue || '');
  }

  function iconFromSvg(pathsHtml, cls) {
    const wrap = document.createElement('span');
    wrap.className = 'ir-icon' + (cls ? ' ' + cls : '');
    wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${pathsHtml}</svg>`;
    return wrap;
  }
  function phoneIcon() {
    return iconFromSvg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>');
  }

  function phoneRow(data, opts) {
    const editable = opts && opts.editable;
    const hasPhone = data.venuePhone && data.venuePhone.trim();
    if (!editable && !hasPhone) return null;
    const phoneInput = textField(data.venuePhone, opts, v => opts.onText('venuePhone', v), {
      cls: 'venue-phone-text', placeholder: '전화번호',
    });
    if (!editable && hasPhone) {
      return h('a', { class: 'venue-phone', href: `tel:${data.venuePhone}` }, [phoneIcon(), phoneInput]);
    }
    return h('div', { class: 'venue-phone' }, [phoneIcon(), phoneInput]);
  }

  function transitSection(data, opts, field, titleText, placeholder) {
    const editable = opts && opts.editable;
    if (!editable && !(data[field] && data[field].trim())) return null;
    return h('div', { class: 'subway-block' }, [
      h('div', { class: 'subway-title' }, titleText),
      h('div', { class: 'subway-text' }, [
        textField(data[field], opts, v => opts.onText(field, v), {
          multiline: true, rows: 3, cls: 'subway-input', placeholder,
        }),
      ]),
    ]);
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

    const wrap = h('div', { class: ((cls || '') + ' ir-photo-wrap' + (slot ? '' : ' ir-photo-empty')).trim() });
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

  // A single named image slot (used for the "약도 이미지" map screenshot) —
  // distinct from the `photos` gallery array. Guests get a "지도 이미지 보기"
  // button that opens it in the lightbox; the admin gets an upload/replace tile.
  function singleImageSlot(data, opts, field, viewLabel) {
    const slot = data[field];
    const editable = opts && opts.editable;
    if (!editable) {
      if (!slot) return null;
      const btn = h('button', { class: 'map-btn', type: 'button' }, viewLabel);
      btn.addEventListener('click', () => openLightbox([slot], 0));
      return btn;
    }
    const wrap = h('div', { class: 'ir-photo-wrap ed-map-image-slot' + (slot ? '' : ' ir-photo-empty') });
    if (slot) wrap.append(photoNode(slot, 'ir-photo-img'));
    wrap.append(h('div', { class: 'ir-photo-overlay' }, slot ? '✎ 지도 이미지 변경' : '+ 지도 이미지 추가'));
    const fileInput = h('input', {
      type: 'file', accept: 'image/*', class: 'ir-photo-file-input',
      onchange: e => { if (e.target.files[0]) opts.onMapImageSelect(e.target.files[0]); e.target.value = ''; },
    });
    wrap.append(fileInput);
    if (slot) {
      const removeBtn = h('button', {
        class: 'ir-photo-remove', title: '삭제',
        onclick: e => { e.stopPropagation(); opts.onMapImageRemove(); },
      }, '✕');
      wrap.append(removeBtn);
      wrap.addEventListener('click', e => { if (e.target !== removeBtn) fileInput.click(); });
    } else {
      wrap.addEventListener('click', () => fileInput.click());
    }
    return wrap;
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

  function ddayBox(data, opts) {
    const autoLabel = `${data.groom} ❤️ ${data.bride}의 결혼식이 다가옵니다`;
    const labelValue = (data.ddayLabel && data.ddayLabel.trim()) ? data.ddayLabel : autoLabel;
    const box = h('div', { class: 'dday-box' }, [
      h('div', { class: 'num' }, 'D-day'),
      h('div', { class: 'label' }, [
        textField(labelValue, opts, v => opts.onText('ddayLabel', v), { cls: 'dday-label-text' }),
      ]),
    ]);
    try {
      const d = new Date(`${data.date}T${data.time || '00:00'}:00+09:00`);
      const diff = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
      box.querySelector('.num').textContent = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-Day' : `결혼 후 ${Math.abs(diff)}일`;
    } catch (e) {}
    return box;
  }

  // "Add to calendar" — Google Calendar link + a downloadable .ics (opens
  // directly in Calendar on iOS, downloads for Android/desktop apps to open).
  function calendarSection(data) {
    if (!data.date) return null;
    const start = new Date(`${data.date}T${data.time || '00:00'}:00+09:00`);
    if (isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const title = `${data.groom || ''} ♥ ${data.bride || ''} 결혼식`.trim();
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(data.venue || '')}&location=${encodeURIComponent(data.venue || '')}`;
    const icsContent = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
      `SUMMARY:${title}`, `LOCATION:${data.venue || ''}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const icsHref = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsContent);

    return h('section', { class: 'block' }, [
      h('div', { class: 'block-title' }, '일정 등록'),
      h('div', { class: 'map-links' }, [
        h('a', { class: 'map-btn', href: gcalUrl, target: '_blank', rel: 'noopener' }, 'Google 캘린더'),
        h('a', { class: 'map-btn', href: icsHref, download: `${title}.ics` }, '캘린더 앱에 추가'),
      ]),
    ]);
  }

  function greetingBlock(data, opts) {
    return h('div', { class: 'greeting' }, [
      textField(data.greeting, opts, v => opts.onText('greeting', v), { multiline: true, rows: 5, cls: 'greeting-input' }),
    ]);
  }

  function mapSection(data, opts) {
    const editable = opts && opts.editable;
    const q = encodeURIComponent(data.venueAddress || data.venue || '');
    const hallField = (editable || (data.venueDetail && data.venueDetail.trim()))
      ? h('div', { class: 'venue-hall' }, [
          textField(data.venueDetail, opts, v => opts.onText('venueDetail', v), { cls: 'venue-hall-text', placeholder: '홀 이름 (예: 네이처홀 1층)' }),
        ])
      : null;
    const addressField = (editable || (data.venueAddress && data.venueAddress.trim()))
      ? h('div', { class: 'venue-address' }, [
          textField(data.venueAddress, opts, v => opts.onText('venueAddress', v), { cls: 'venue-address-text', placeholder: '전체 주소 입력' }),
        ])
      : null;
    return h('section', { class: 'block' }, [
      h('div', { class: 'block-title' }, '오시는 길'),
      h('div', { class: 'info-card' }, [
        h('div', { class: 'venue-name' }, [
          textField(data.venue, opts, v => opts.onText('venue', v), { cls: 'venue-name-text' }),
        ]),
        phoneRow(data, opts),
        hallField,
        addressField,
        singleImageSlot(data, opts, 'mapImageSlot', '지도 이미지 보기'),
        h('div', { class: 'map-links' }, [
          h('a', { class: 'map-btn', href: `tmap://search?name=${q}`, rel: 'noopener' }, '티맵'),
          h('a', { class: 'map-btn', 'data-map': 'kakao', href: `https://map.kakao.com/link/search/${q}`, target: '_blank', rel: 'noopener' }, '카카오내비'),
          h('a', { class: 'map-btn', 'data-map': 'naver', href: `https://map.naver.com/p/search/${q}`, target: '_blank', rel: 'noopener' }, '네이버지도'),
        ]),
        transitSection(data, opts, 'subwayInfo', '지하철 Subway',
          '예) · 5호선 발산역 3번 출구 도보 5분\n· 9호선 양천향교역 6번 출구 도보 10분'),
        transitSection(data, opts, 'busInfo', '버스 Bus',
          '예) · 간선버스 600, 601번 하차\n· 공항리무진 6003번 이용'),
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
    pad.append(hero, ddayBox(data, opts), calendarSection(data), greetingBlock(data, opts), divider(), mapSection(data, opts), accountSection(data, opts), footerBlock(data));
    return pad;
  }

  // A 3-column grid section for a set of photo indexes. When editable, an
  // add-tile is appended (if under maxPhotos) so more photos can be dropped
  // in right there; omitted entirely for guests when there's nothing to show.
  function galleryGridSection(data, opts, indexes, title) {
    const editable = opts && opts.editable;
    const photos = data.photos || [];
    const tiles = indexes.map(i => photoBlock(data, opts, i, ''));
    if (editable && photos.length < (opts.maxPhotos || 6)) tiles.push(addPhotoTile(opts));
    if (!tiles.length) return null;
    return h('section', { class: 'block' }, [
      h('div', { class: 'block-title' }, title),
      h('div', { class: 'gallery-grid' }, tiles),
    ]);
  }

  function buildCover(data, opts) {
    const pad = h('div', { class: 'pad' });
    const card = h('div', { class: 'cover2-card' }, [
      h('div', { class: 'cover2-photo-row' }, [
        photoBlock(data, opts, 0, 'cover2-photo'),
        verticalNamesField(data, opts),
      ]),
      taglineField(data, opts),
    ]);
    pad.append(card);
    pad.append(h('div', { class: 'cover2-info' }, [dateTimeField(data, opts), venueField(data, opts)]));
    pad.append(ddayBox(data, opts), calendarSection(data), greetingBlock(data, opts));
    const galleryIndexes = (data.photos || []).slice(1).map((_, i) => i + 1);
    const gallery = galleryGridSection(data, opts, galleryIndexes, '갤러리');
    if (gallery) pad.append(gallery);
    pad.append(divider(), mapSection(data, opts), accountSection(data, opts), footerBlock(data));
    return pad;
  }

  function buildGallery(data, opts) {
    const pad = h('div', { class: 'pad' });
    pad.append(heroBlock(data, opts), ddayBox(data, opts), calendarSection(data), greetingBlock(data, opts));
    const allIndexes = (data.photos || []).map((_, i) => i);
    const gallery = galleryGridSection(data, opts, allIndexes, '우리의 순간');
    if (gallery) pad.append(gallery);
    pad.append(divider(), mapSection(data, opts), accountSection(data, opts), footerBlock(data));
    return pad;
  }

  function buildPolaroid(data, opts) {
    const editable = opts && opts.editable;
    const pad = h('div', { class: 'pad' });
    pad.append(heroBlock(data, opts), ddayBox(data, opts), calendarSection(data));
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
    pad.append(ddayBox(data, opts), calendarSection(data), greetingBlock(data, opts), divider(), mapSection(data, opts), accountSection(data, opts), footerBlock(data));
    return pad;
  }

  /* ---------- editorial theme ---------- */

  function edKicker(text) { return h('div', { class: 'ed-kicker' }, text); }

  function editorialHero(data, opts) {
    return h('div', { class: 'ed-hero' }, [
      edKicker('WEDDING CEREMONY'),
      h('div', { class: 'ed-hero-frame' }, [
        photoBlock(data, opts, 0, 'ed-hero-photo'),
        h('div', { class: 'ed-hero-overlay' }, [taglineField(data, opts)]),
      ]),
      h('div', { class: 'ed-hero-names' }, [namesField(data, opts, true)]),
    ]);
  }

  function editorialInvitation(data, opts) {
    return h('div', { class: 'ed-invitation' }, [
      edKicker('INVITATION'),
      h('div', { class: 'ed-invitation-title' }, '소중한 분들을 초대합니다'),
      greetingBlock(data, opts),
    ]);
  }

  function editorialParents(data, opts) {
    const editable = opts && opts.editable;
    const hasAny = [data.groomFather, data.groomMother, data.brideFather, data.brideMother].some(v => v && v.trim());
    if (!editable && !hasAny) return null;
    const line = (fatherField, motherField, role, name) => h('div', { class: 'ed-parent-line' }, [
      textField(data[fatherField], opts, v => opts.onText(fatherField, v), { cls: 'ed-parent-input', placeholder: '아버지 성함' }),
      ' · ',
      textField(data[motherField], opts, v => opts.onText(motherField, v), { cls: 'ed-parent-input', placeholder: '어머니 성함' }),
      `의 ${role} `,
      h('b', {}, name || ''),
    ]);
    return h('div', { class: 'ed-parents' }, [
      line('groomFather', 'groomMother', '아들', data.groom),
      line('brideFather', 'brideMother', '딸', data.bride),
    ]);
  }

  function editorialContactBtn(data, opts) {
    const editable = opts && opts.editable;
    const hasPhone = data.contactPhone && data.contactPhone.trim();
    if (!editable && !hasPhone) return null;
    if (editable) {
      return h('div', { class: 'ed-contact-edit' }, [
        h('span', { class: 'ed-contact-edit-label' }, '연락처: '),
        textField(data.contactPhone, opts, v => opts.onText('contactPhone', v), { cls: 'venue-phone-text', placeholder: '전화번호' }),
      ]);
    }
    return h('a', { class: 'ed-contact-btn', href: `tel:${data.contactPhone}` }, [phoneIcon(), ' 연락하기']);
  }

  function editorialTimeline(data, opts) {
    const weddingYear = data.date ? data.date.split('-')[0] : '';
    return h('div', { class: 'ed-timeline' }, [
      h('div', { class: 'ed-timeline-title' }, ['Two Hearts', h('br'), 'One Story']),
      h('div', { class: 'ed-timeline-years' }, [
        textField(data.relationshipStartYear, opts, v => opts.onText('relationshipStartYear', v), { cls: 'ed-year-input', placeholder: '시작 연도' }),
        h('div', { class: 'ed-timeline-bar' }),
        h('div', { class: 'ed-year-end' }, weddingYear),
      ]),
    ]);
  }

  function editorialCalendar(data) {
    if (!data.date) return null;
    let d;
    try { d = new Date(`${data.date}T00:00:00+09:00`); } catch (e) { return null; }
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear(), month = d.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
    const headRow = h('div', { class: 'ed-cal-row ed-cal-head' },
      dowLabels.map((w, i) => h('div', { class: 'ed-cal-cell' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') }, w)));
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(h('div', { class: 'ed-cal-cell empty' }, ''));
    for (let day = 1; day <= daysInMonth; day++) {
      const dow = (firstDow + day - 1) % 7;
      cells.push(h('div', {
        class: 'ed-cal-cell' + (day === d.getDate() ? ' wedding' : '') + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''),
      }, String(day)));
    }
    const rows = [headRow];
    for (let i = 0; i < cells.length; i += 7) rows.push(h('div', { class: 'ed-cal-row' }, cells.slice(i, i + 7)));
    return h('div', { class: 'ed-calendar' }, rows);
  }

  // Live-ticking DAYS/HOUR/MIN/SEC. Only ticks in guest (read-only) view —
  // the editor re-renders far too often (every keystroke elsewhere, every
  // photo change) to safely own a running interval without leaking timers.
  let edCountdownTimer = null;
  function editorialCountdown(data, opts) {
    const dayNum = h('div', { class: 'ed-cd-num' }, '0');
    const hourNum = h('div', { class: 'ed-cd-num' }, '0');
    const minNum = h('div', { class: 'ed-cd-num' }, '0');
    const secNum = h('div', { class: 'ed-cd-num' }, '0');
    const label = h('div', { class: 'ed-cd-label' }, '');
    const unit = (numEl, lab) => h('div', { class: 'ed-cd-unit' }, [numEl, h('div', { class: 'ed-cd-lab' }, lab)]);
    const wrap = h('div', { class: 'ed-countdown' }, [
      h('div', { class: 'ed-cd-row' }, [unit(dayNum, 'DAYS'), unit(hourNum, 'HOUR'), unit(minNum, 'MIN'), unit(secNum, 'SEC')]),
      label,
    ]);

    let target = null;
    try { target = new Date(`${data.date}T${data.time || '00:00'}:00+09:00`); } catch (e) {}
    const tick = () => {
      if (!target || isNaN(target.getTime())) return;
      const diff = target - new Date();
      if (diff <= 0) {
        dayNum.textContent = '0'; hourNum.textContent = '0'; minNum.textContent = '0'; secNum.textContent = '0';
        label.textContent = `${data.bride || ''}, ${data.groom || ''}의 결혼식 날입니다!`;
        if (edCountdownTimer) clearInterval(edCountdownTimer);
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      dayNum.textContent = String(Math.floor(totalSec / 86400));
      hourNum.textContent = String(Math.floor((totalSec % 86400) / 3600)).padStart(2, '0');
      minNum.textContent = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
      secNum.textContent = String(totalSec % 60).padStart(2, '0');
      label.textContent = `${data.bride || ''}, ${data.groom || ''}의 결혼식이 ${Math.ceil(diff / 86400000)}일 남았습니다.`;
    };
    tick();
    if (!(opts && opts.editable)) {
      if (edCountdownTimer) clearInterval(edCountdownTimer);
      edCountdownTimer = setInterval(tick, 1000);
    }
    return wrap;
  }

  function editorialJoinUs(data) {
    let d = null;
    try { d = new Date(`${data.date}T${data.time || '00:00'}:00+09:00`); } catch (e) {}
    const valid = d && !isNaN(d.getTime());
    const day = valid ? String(d.getDate()).padStart(2, '0') : '';
    const monthName = valid ? d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase() : '';
    const dow = valid ? d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() : '';
    const year = valid ? d.getFullYear() : '';
    const hh = data.time ? Number(data.time.split(':')[0]) : null;
    const mm = data.time ? data.time.split(':')[1] : null;
    const period = hh !== null ? (hh < 12 ? 'AM' : 'PM') : '';
    const hour12 = hh !== null ? (hh % 12 === 0 ? 12 : hh % 12) : '';
    return h('div', { class: 'ed-joinus' }, [
      h('div', { class: 'ed-joinus-title' }, 'JOIN US AS WE BECOME ONE'),
      h('div', { class: 'ed-joinus-grid' }, [
        h('div', {}, String(day)), h('div', {}, monthName), h('div', {}, String(year)),
        h('div', {}, dow), h('div', {}, hh !== null ? `${period} ${hour12}:${mm}` : ''),
      ]),
    ]);
  }

  function editorialCarousel(data, opts) {
    const editable = opts && opts.editable;
    const photos = data.photos || [];
    if (!editable && !photos.length) return null;
    let idx = 0;
    const frame = h('div', { class: 'ed-carousel-frame' });
    const renderSlide = () => {
      frame.innerHTML = '';
      if (photos.length) frame.append(photoBlock(data, opts, idx, 'ed-carousel-img'));
      else if (editable) frame.append(addPhotoTile(opts, 'ed-carousel-img'));
    };
    renderSlide();
    const prevBtn = h('button', { class: 'ed-carousel-nav prev', type: 'button', title: '이전' }, '‹');
    const nextBtn = h('button', { class: 'ed-carousel-nav next', type: 'button', title: '다음' }, '›');
    prevBtn.addEventListener('click', e => { e.stopPropagation(); if (!photos.length) return; idx = (idx - 1 + photos.length) % photos.length; renderSlide(); });
    nextBtn.addEventListener('click', e => { e.stopPropagation(); if (!photos.length) return; idx = (idx + 1) % photos.length; renderSlide(); });
    const nav = photos.length > 1 ? [prevBtn, nextBtn] : [];

    const tools = [];
    if (editable && photos.length && photos.length < (opts.maxPhotos || 6)) {
      const addBtn = h('button', { class: 'ed-carousel-add', type: 'button' }, '+ 사진 추가');
      addBtn.addEventListener('click', e => {
        e.stopPropagation();
        const fi = document.createElement('input');
        fi.type = 'file'; fi.accept = 'image/*';
        fi.onchange = () => { if (fi.files[0]) opts.onPhotoSelect(-1, fi.files[0]); };
        fi.click();
      });
      tools.push(addBtn);
    }

    return h('section', { class: 'block' }, [
      edKicker('GALLERY'),
      h('div', { class: 'block-title' }, '웨딩 갤러리'),
      h('div', { class: 'ed-carousel' }, [frame, ...nav]),
      tools.length ? h('div', { class: 'ed-carousel-tools' }, tools) : null,
    ]);
  }

  function edAccountRow(data, opts, side) {
    const holderField = side === 'groom' ? 'groomAccountHolder' : 'brideAccountHolder';
    const bankField = side === 'groom' ? 'groomBank' : 'brideBank';
    const acctField = side === 'groom' ? 'groomBankAccount' : 'brideBankAccount';
    const defaultName = side === 'groom' ? data.groom : data.bride;
    const editable = opts && opts.editable;
    const account = data[acctField];

    if (!editable && !(data[bankField] && data[bankField].trim()) && !(account && account.trim())) {
      return h('div', { class: 'ed-acct-empty' }, '등록된 계좌 정보가 없습니다.');
    }

    const nameEl = textField(data[holderField] || defaultName, opts, v => opts.onText(holderField, v), { cls: 'ed-acct-name', placeholder: '이름' });
    const bankEl = textField(data[bankField], opts, v => opts.onText(bankField, v), { cls: 'ed-acct-bank', placeholder: '은행명' });
    const acctEl = textField(account, opts, v => opts.onText(acctField, v), { cls: 'ed-acct-num', placeholder: '계좌번호' });
    const row = h('div', { class: 'ed-acct-row' }, [
      nameEl,
      h('div', { class: 'ed-acct-line' }, [bankEl, ' ', acctEl]),
    ]);
    if (!editable && account && account.trim()) {
      const copyBtn = h('button', { class: 'ed-acct-copy', type: 'button' }, '복사');
      copyBtn.addEventListener('click', () => {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(account).then(() => {
          copyBtn.textContent = '복사됨';
          setTimeout(() => { copyBtn.textContent = '복사'; }, 1500);
        }).catch(() => {});
      });
      row.append(copyBtn);
    }
    return row;
  }

  function editorialAccounts(data, opts) {
    const groomPanel = h('div', { class: 'ed-acct-panel active' }, [edAccountRow(data, opts, 'groom')]);
    const bridePanel = h('div', { class: 'ed-acct-panel' }, [edAccountRow(data, opts, 'bride')]);
    const groomTab = h('button', { class: 'ed-acct-tab active', type: 'button' }, '신랑측');
    const brideTab = h('button', { class: 'ed-acct-tab', type: 'button' }, '신부측');
    groomTab.addEventListener('click', () => {
      groomTab.classList.add('active'); brideTab.classList.remove('active');
      groomPanel.classList.add('active'); bridePanel.classList.remove('active');
    });
    brideTab.addEventListener('click', () => {
      brideTab.classList.add('active'); groomTab.classList.remove('active');
      bridePanel.classList.add('active'); groomPanel.classList.remove('active');
    });
    return h('section', { class: 'block' }, [
      edKicker('ACCOUNT'),
      h('div', { class: 'block-title' }, '마음 전하실 곳'),
      h('div', { class: 'account-note' }, [
        textField(data.accountNote, opts, v => opts.onText('accountNote', v), { multiline: true, rows: 2, cls: 'account-input' }),
      ]),
      h('div', { class: 'ed-acct-tabs' }, [groomTab, brideTab]),
      h('div', { class: 'ed-acct-panels' }, [groomPanel, bridePanel]),
    ]);
  }

  function editorialShareBtn(data) {
    if (typeof navigator === 'undefined' || !navigator.share) return null;
    const btn = h('button', { class: 'ed-share-btn', type: 'button' }, '청첩장 공유하기');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      navigator.share({
        title: `${data.groom} ♥ ${data.bride} 결혼합니다`,
        text: `${data.groom} ♥ ${data.bride}의 결혼식에 초대합니다.`,
        url: location.href,
      }).catch(() => {});
    });
    return btn;
  }

  function buildEditorial(data, opts) {
    const pad = h('div', { class: 'ed-pad' });
    pad.append(editorialHero(data, opts));
    pad.append(editorialInvitation(data, opts));
    const parents = editorialParents(data, opts);
    if (parents) pad.append(parents);
    const contact = editorialContactBtn(data, opts);
    if (contact) pad.append(contact);
    pad.append(divider());
    pad.append(editorialTimeline(data, opts));
    pad.append(h('div', { class: 'ed-date-line' }, formatDateLine(data)));
    const cal = editorialCalendar(data);
    if (cal) pad.append(cal);
    pad.append(editorialCountdown(data, opts));
    pad.append(editorialJoinUs(data));
    pad.append(divider());
    pad.append(mapSection(data, opts));
    const carousel = editorialCarousel(data, opts);
    if (carousel) pad.append(carousel);
    pad.append(divider());
    pad.append(editorialAccounts(data, opts));
    pad.append(footerBlock(data));
    const share = editorialShareBtn(data);
    if (share) pad.append(share);
    return pad;
  }

  const BUILDERS = { classic: buildClassic, cover: buildCover, gallery: buildGallery, polaroid: buildPolaroid, minimal: buildMinimal, editorial: buildEditorial };

  function candleIcon() {
    return iconFromSvg(
      '<path d="M12 2.2v1.6M8.6 4l1 1M15.4 4l-1 1M6.6 5.6l.9.7M17.4 5.6l-.9.7"/>' +
      '<circle cx="12" cy="6.6" r="1"/>' +
      '<rect x="9.5" y="9.2" width="5" height="12.6" rx="1.4"/>',
      'ir-env-icon-svg'
    );
  }

  // Envelope intro (guest view only, once per page load): tap the wax seal to
  // reveal a short greeting preview, then tap/scroll again to slide the whole
  // envelope layer up off-screen and reveal the invitation already rendered
  // underneath (no drag-tracking needed — any tap advances the stage).
  let envelopeShown = false;
  function buildEnvelopeOverlay(data) {
    // A perspective wrapper is required for the final rotateX "flap opening"
    // to render as real 3D foreshortening rather than a flat squash.
    const persp = h('div', { class: 'ir-envelope-perspective' });
    const overlay = h('div', { class: 'ir-envelope-overlay' });
    const fold = h('div', { class: 'ir-env-fold' });
    const seal = h('button', { class: 'ir-env-seal', type: 'button', 'aria-label': '초대장 열기' }, '♥');
    const hint = h('div', { class: 'ir-env-hint' }, '터치하여 열기');

    const autoMsg = `${withGwaWa(data.groom)} ${data.bride || ''}의 결혼식에\n소중한 분들을 초대합니다.`;
    const msgText = (data.envelopeMessage && data.envelopeMessage.trim()) ? data.envelopeMessage : autoMsg;
    const greeting = h('div', { class: 'ir-env-greeting' }, [
      candleIcon(),
      h('div', { class: 'ir-env-kicker' }, 'Wedding Invitation'),
      h('div', { class: 'ir-env-msg' }, msgText),
      h('div', { class: 'ir-env-date' }, formatDateCompact(data)),
      h('div', { class: 'ir-env-chevron' }, '⌃'),
    ]);

    overlay.append(fold, seal, hint, greeting);
    persp.append(overlay);

    let stage = 1;
    const advance = () => {
      if (stage === 1) {
        stage = 2;
        overlay.classList.add('ir-env-stage-2');
      } else if (stage === 2) {
        stage = 3;
        overlay.classList.add('ir-env-opening');
        document.body.style.overflow = '';
        setTimeout(() => persp.remove(), 900);
      }
    };
    persp.addEventListener('click', advance);
    document.body.style.overflow = 'hidden';
    return persp;
  }

  function buildInviteCard(data, opts) {
    opts = opts || {};
    const build = BUILDERS[data.layout] || buildClassic;
    const root = h('div', { class: 'ir-root', 'data-layout': data.layout || 'classic' });
    COLOR_FIELDS.forEach(({ field, varName }) => {
      if (data[field]) root.style.setProperty(varName, data[field]);
    });
    root.append(build(data, opts));
    if (!opts.editable && !envelopeShown) {
      envelopeShown = true;
      root.append(buildEnvelopeOverlay(data));
    }
    return root;
  }

  /* ---------- injected, scoped stylesheet ---------- */
  const STYLE = `
.ir-root {
  --ir-paper: #fffdfa; --ir-panel: #ffffff; --ir-panel-2: #fbeee1; --ir-border: #ecdfce;
  --ir-text: #4a3f33; --ir-muted: #a5967e; --ir-accent: #e0795c; --ir-accent-soft: #f6d9c9;
  --ir-btn-bg: #fbeee1;
  --ir-radius: 18px;
  --ir-font-head: 'Nanum Myeongjo', 'Gowun Batang', serif;
  --ir-font-body: 'Nanum Myeongjo', 'Gowun Batang', serif;
  --ir-font-script: 'Caveat', cursive;
  font-family: var(--ir-font-body); color: var(--ir-text); background: var(--ir-paper);
  letter-spacing: 0.01em;
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

.ir-root .info-card { background: var(--ir-panel); border: 1px solid var(--ir-border); border-radius: var(--ir-radius); padding: 22px 20px; text-align: center; }
.ir-root .info-card .venue-name { font-weight: 800; font-size: 1.1rem; margin-bottom: 6px; }
.ir-root .venue-phone {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  color: var(--ir-muted); font-size: 0.85rem; text-decoration: none; margin-bottom: 8px;
}
.ir-root .ir-icon { display: inline-flex; width: 14px; height: 14px; flex-shrink: 0; }
.ir-root .ir-icon svg { width: 100%; height: 100%; }
.ir-root .venue-hall, .ir-root .venue-address { color: var(--ir-muted); font-size: 0.85rem; margin-bottom: 4px; }
.ir-root .venue-address { margin-bottom: 18px; }
.ir-root .subway-block { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--ir-border); text-align: left; }
.ir-root .subway-title { font-weight: 700; font-size: 0.92rem; margin-bottom: 8px; }
.ir-root .subway-text { font-size: 0.85rem; color: var(--ir-text); line-height: 1.8; white-space: pre-line; }

.ir-root .map-links { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.ir-root .map-btn {
  display: inline-flex; align-items: center; gap: 6px; background: var(--ir-btn-bg);
  border: 1px solid var(--ir-border); border-radius: 999px; padding: 9px 16px;
  font-size: 0.85rem; font-weight: 700; color: var(--ir-text); text-decoration: none;
}
.ir-root .map-btn:hover { border-color: var(--ir-accent); color: var(--ir-accent); }

.ir-root .account-note {
  background: var(--ir-panel); border: 1px dashed var(--ir-border); border-radius: var(--ir-radius);
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

.ir-root .cover2-card {
  background: var(--ir-panel); border-radius: 4px; padding: 22px 16px 20px; margin-bottom: 24px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.05);
}
.ir-root .cover2-photo-row { display: flex; align-items: stretch; gap: 14px; margin-bottom: 18px; }
.ir-root .cover2-photo, .ir-root .cover2-photo.ir-photo-wrap {
  flex: 1; min-width: 0; aspect-ratio: 3/4; object-fit: cover; display: block; background: var(--ir-panel-2);
}
.ir-root .cover2-names {
  flex: 0 0 auto; writing-mode: vertical-rl; text-orientation: upright;
  font-family: var(--ir-font-head); font-size: 1.05rem; font-weight: 700; letter-spacing: 0.08em;
  color: var(--ir-text); display: flex; align-items: center; justify-content: center; gap: 4px; padding: 0 4px;
}
.ir-root .cover2-dot { color: var(--ir-accent); }
.ir-root .ir-vertical-name { writing-mode: vertical-rl; text-orientation: upright; }
.ir-root .cover2-tagline {
  display: block; width: 100%; text-align: center; font-family: var(--ir-font-script);
  font-size: 2.2rem; font-weight: 700; color: var(--ir-text); line-height: 1.25;
}
.ir-root .cover2-info { text-align: center; margin-bottom: 30px; }

.ir-root .gallery-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.ir-root .gallery-grid img, .ir-root .gallery-grid .ir-photo-wrap { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; overflow: hidden; }

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
.ir-root .ir-photo-empty .ir-photo-overlay { opacity: 1; position: static; background: none; color: var(--ir-muted); }
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

/* envelope intro: wax-seal cover -> short greeting preview -> opens like a
   real envelope flap (3D rotate on its top edge, not a flat slide) */
.ir-envelope-perspective { position: fixed; inset: 0; z-index: 500; perspective: 1400px; }
.ir-envelope-overlay {
  position: absolute; inset: 0; overflow: hidden; cursor: pointer;
  background: var(--ir-paper, #fffdfa); display: flex; align-items: center; justify-content: center;
  transform-origin: top center; transform-style: preserve-3d;
  transition: transform .85s cubic-bezier(.5,0,.15,1), opacity .6s ease .18s;
}
.ir-envelope-overlay.ir-env-opening {
  transform: rotateX(-112deg) translateY(-3%) scale(0.98);
  opacity: 0;
}

.ir-env-fold { position: absolute; inset: 0; pointer-events: none; }
.ir-env-fold::before, .ir-env-fold::after {
  content: ''; position: absolute; top: 50%; left: 50%; width: 200vmax; height: 1px;
  background: var(--ir-border, #ecdfce);
}
.ir-env-fold::before { transform: translate(-50%, -50%) rotate(45deg); }
.ir-env-fold::after { transform: translate(-50%, -50%) rotate(-45deg); }

.ir-env-seal {
  position: relative; z-index: 2; width: 84px; height: 84px; border-radius: 50%; border: none; padding: 0;
  background: var(--ir-accent);
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--ir-accent) 80%, white), var(--ir-accent) 55%, color-mix(in srgb, var(--ir-accent) 60%, black) 100%);
  display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.7rem;
  box-shadow: 0 6px 18px rgba(0,0,0,0.22), inset 0 2px 4px rgba(255,255,255,0.35);
  cursor: pointer; transition: opacity .3s ease;
}
.ir-env-hint {
  position: absolute; top: calc(50% + 68px); left: 50%; transform: translateX(-50%);
  font-size: 0.72rem; color: var(--ir-muted); letter-spacing: 0.15em; z-index: 2;
  transition: opacity .3s ease;
}
.ir-envelope-overlay.ir-env-stage-2 .ir-env-seal,
.ir-envelope-overlay.ir-env-stage-2 .ir-env-hint { opacity: 0; pointer-events: none; }

.ir-env-greeting {
  position: absolute; inset: 0; z-index: 3; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px; padding: 40px 30px;
  text-align: center; opacity: 0; pointer-events: none; transition: opacity .5s ease;
}
.ir-envelope-overlay.ir-env-stage-2 .ir-env-greeting { opacity: 1; pointer-events: auto; }
.ir-env-icon-svg { width: 26px; height: 26px; color: var(--ir-muted); margin-bottom: 4px; }
.ir-env-kicker { font-size: 0.7rem; letter-spacing: 0.22em; color: var(--ir-muted); }
.ir-env-msg {
  font-family: var(--ir-font-head); font-size: 1.05rem; line-height: 1.7; color: var(--ir-text);
  white-space: pre-line; margin: 6px 0;
}
.ir-env-date { font-size: 0.85rem; letter-spacing: 0.1em; color: var(--ir-muted); margin-bottom: 6px; }
.ir-env-chevron { font-size: 1.2rem; color: var(--ir-accent); animation: ir-env-bounce 1.6s ease-in-out infinite; }
@keyframes ir-env-bounce { 0%, 100% { transform: translateY(0); opacity: .6; } 50% { transform: translateY(-6px); opacity: 1; } }

/* editorial theme */
.ir-root[data-layout="editorial"] {
  --ir-font-head: 'Playfair Display', 'Nanum Myeongjo', serif;
  --ir-font-script: 'Playfair Display', serif;
}
.ir-root[data-layout="editorial"] .cover2-tagline { font-style: italic; font-weight: 600; }
.ed-pad { padding: 0 0 30px; }
.ed-kicker {
  font-family: var(--ir-font-head); font-size: 0.72rem; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--ir-muted); text-align: center; margin-bottom: 8px;
}
.ed-hero { padding-top: 30px; text-align: center; }
.ed-hero-frame {
  position: relative; margin-top: 18px; width: 100%; aspect-ratio: 4/5;
  background: var(--ir-panel);
}
.ed-hero-photo, .ed-hero-frame .ir-photo-wrap { width: 100%; height: 100%; object-fit: cover; display: block; }
.ed-hero-overlay {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 0 20px;
  background: linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.4) 100%);
}
.ed-hero-overlay .cover2-tagline { color: #fff; font-size: 2.8rem; text-shadow: 0 2px 14px rgba(0,0,0,0.4); text-align: center; }
.ed-hero-overlay .ir-edit-input { max-width: 92% !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ed-hero-names {
  margin-top: 22px; font-family: var(--ir-font-head); font-size: 0.95rem;
  letter-spacing: 0.28em; text-transform: uppercase; color: var(--ir-muted); padding: 0 24px;
}
.ed-hero-names .names { font-size: inherit; letter-spacing: inherit; text-transform: inherit; font-weight: 400; }
.ed-hero-names .ir-name-input { text-transform: uppercase; font-family: inherit; font-weight: 400; }

.ed-invitation { padding: 44px 30px 0; text-align: center; }
.ed-invitation-title { font-family: var(--ir-font-head); font-size: 1.3rem; font-weight: 700; margin-bottom: 18px; }

.ed-parents { padding: 30px 30px 0; text-align: center; }
.ed-parent-line { font-size: 0.92rem; color: var(--ir-text); line-height: 2; }
.ed-parent-input { color: var(--ir-text); }

.ed-contact-btn, .ed-contact-edit {
  display: flex; align-items: center; justify-content: center; gap: 8px; margin: 24px auto 0; width: fit-content;
  padding: 11px 26px; border: 1px solid var(--ir-border); border-radius: 999px;
  color: var(--ir-text); font-size: 0.85rem; text-decoration: none;
}

.ed-timeline { padding: 44px 30px 0; text-align: center; }
.ed-timeline-title {
  font-family: var(--ir-font-head); font-style: italic; font-weight: 700;
  font-size: 2.2rem; line-height: 1.25; margin-bottom: 20px;
}
.ed-timeline-years { display: flex; align-items: center; justify-content: center; gap: 14px; }
.ed-year-input {
  font-family: var(--ir-font-body); font-size: 0.85rem; color: var(--ir-muted);
  width: 4.2em !important; text-align: center;
}
.ed-timeline-bar { width: 60px; height: 1px; background: var(--ir-border); }
.ed-year-end { font-size: 0.85rem; color: var(--ir-muted); }

.ed-date-line { text-align: center; font-size: 0.85rem; color: var(--ir-muted); margin: 30px 0 16px; }

.ed-calendar { margin: 0 30px 30px; border-top: 1px solid var(--ir-border); padding-top: 20px; }
.ed-cal-row { display: grid; grid-template-columns: repeat(7, 1fr); }
.ed-cal-head { margin-bottom: 8px; }
.ed-cal-cell {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  font-size: 0.8rem; color: var(--ir-text); position: relative;
}
.ed-cal-head .ed-cal-cell { font-size: 0.7rem; font-weight: 700; color: var(--ir-muted); aspect-ratio: auto; }
.ed-cal-cell.sun { color: var(--ir-accent); }
.ed-cal-cell.wedding {
  background: var(--ir-accent); color: #fff; border-radius: 50%; font-weight: 700;
}

.ed-countdown { text-align: center; padding: 0 30px 20px; }
.ed-cd-row { display: flex; align-items: baseline; justify-content: center; gap: 18px; margin-bottom: 10px; }
.ed-cd-num { font-family: var(--ir-font-head); font-size: 1.7rem; font-weight: 700; color: var(--ir-text); }
.ed-cd-lab { font-size: 0.62rem; letter-spacing: 0.12em; color: var(--ir-muted); margin-top: 2px; }
.ed-cd-label { font-size: 0.82rem; color: var(--ir-muted); }

.ed-joinus { text-align: center; padding: 20px 30px 40px; color: var(--ir-accent); }
.ed-joinus-title { font-family: var(--ir-font-head); font-weight: 700; letter-spacing: 0.06em; font-size: 0.95rem; margin-bottom: 14px; }
.ed-joinus-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 20px; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.05em; }

.ed-map-image-slot { width: 100%; aspect-ratio: 16/9; margin-bottom: 16px; border-radius: 10px; overflow: hidden; border: 1px dashed var(--ir-border); }

.ed-carousel { position: relative; }
.ed-carousel-frame { width: 100%; aspect-ratio: 4/5; background: var(--ir-panel-2); overflow: hidden; }
.ed-carousel-img, .ed-carousel-frame .ir-photo-wrap { width: 100%; height: 100%; object-fit: cover; display: block; }
.ed-carousel-nav {
  position: absolute; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.85); border: none; font-size: 1.3rem; cursor: pointer; color: var(--ir-text);
}
.ed-carousel-nav.prev { left: 10px; }
.ed-carousel-nav.next { right: 10px; }
.ed-carousel-tools { text-align: center; padding-top: 10px; }
.ed-carousel-add {
  background: none; border: 1px solid var(--ir-border); border-radius: 999px; padding: 7px 16px;
  font-size: 0.78rem; color: var(--ir-muted); cursor: pointer;
}

.ed-acct-tabs { display: flex; justify-content: center; gap: 0; margin: 20px 30px 0; border: 1px solid var(--ir-border); border-radius: 999px; overflow: hidden; }
.ed-acct-tab { flex: 1; padding: 9px; background: var(--ir-panel); border: none; font-size: 0.82rem; color: var(--ir-muted); cursor: pointer; }
.ed-acct-tab.active { background: var(--ir-accent); color: #fff; }
.ed-acct-panels { margin: 0 30px; }
.ed-acct-panel { display: none; text-align: center; padding: 18px 0; }
.ed-acct-panel.active { display: block; }
.ed-acct-row { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ed-acct-name { font-weight: 700; }
.ed-acct-line { display: flex; align-items: center; gap: 4px; color: var(--ir-muted); font-size: 0.85rem; }
.ed-acct-copy {
  margin-top: 6px; background: none; border: 1px solid var(--ir-border); border-radius: 999px;
  padding: 5px 14px; font-size: 0.75rem; color: var(--ir-muted); cursor: pointer;
}
.ed-acct-empty { color: var(--ir-muted); font-size: 0.85rem; padding: 10px 0; }

.ed-share-btn {
  display: block; margin: 24px auto 0; padding: 12px 30px; border-radius: 999px;
  background: var(--ir-btn-bg); border: 1px solid var(--ir-border); color: var(--ir-text);
  font-size: 0.85rem; font-weight: 700; cursor: pointer;
}
`;

  if (!document.getElementById('ir-shared-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'ir-shared-style';
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);
  }

  return { DEFAULT_INVITE, LAYOUTS, COLOR_FIELDS, THEME_PRESETS, photoUrl, formatDateLine, buildInviteCard };
})();
