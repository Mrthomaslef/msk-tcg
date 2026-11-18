/* MSK TCG — booster opening of musculoskeletal imaging cards (vanilla JS, offline-first). */
(function () {
  'use strict';

  const CARDS = window.MSK_CARDS || [];
  const TOTAL = CARDS.length;
  const BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
  const PACK_SIZE = 5;
  const MAX_PACKS = 5;
  const REFILL_MS = 60 * 60 * 1000;
  const STORE_KEY = 'msk-tcg:v1';

  const REGIONS = {
    epaule: 'Épaule', coude: 'Coude', 'main-poignet': 'Poignet & Main', rachis: 'Rachis',
    'bassin-hanche': 'Bassin & Hanche', genou: 'Genou', 'cheville-pied': 'Cheville & Pied',
    'os-entier': 'Os & Systémique', 'parties-molles': 'Parties molles',
  };
  const RARITY = {
    commune: { label: 'Commune', gems: '◆' },
    'peu-commune': { label: 'Peu commune', gems: '◆◆' },
    rare: { label: 'Rare', gems: '◆◆◆' },
    legendaire: { label: 'Légendaire', gems: '★' },
  };
  const RAR_ORDER = ['commune', 'peu-commune', 'rare', 'legendaire'];

  const BOOSTERS = [
    { id: 'mix', name: 'Cochin Mix', kicker: 'Toutes régions', desc: 'Le grand mélange : tout le squelette.', regions: null, c1: '#38e1ff', c2: '#7c8cff' },
    { id: 'sup', name: 'Membre supérieur', kicker: 'Épaule · Coude · Main', desc: 'Coiffe, instabilité, poignet et doigts.', regions: ['epaule', 'coude', 'main-poignet'], c1: '#22d3ee', c2: '#2563eb' },
    { id: 'axial', name: 'Rachis & Bassin', kicker: 'Rachis · Sacro-iliaques · Hanche', desc: 'Spondylarthrite, tassements, coxarthrose.', regions: ['rachis', 'bassin-hanche'], c1: '#a78bfa', c2: '#4f46e5' },
    { id: 'inf', name: 'Membre inférieur', kicker: 'Genou · Cheville · Pied', desc: 'Fractures, ostéochondroses, arthropathies.', regions: ['genou', 'cheville-pied'], c1: '#34d399', c2: '#0e7490' },
    { id: 'os', name: 'Os & Systémique', kicker: 'Tumeurs · Métabolique · Génétique', desc: 'Paget, dysplasies, hémopathies, tumeurs.', regions: ['os-entier', 'parties-molles'], c1: '#ffc857', c2: '#db2777' },
  ];
  const usedCovers = new Set();
  // themed boosters pick their cover first; the mix booster takes a remaining one
  [...BOOSTERS.slice(1), BOOSTERS[0]].forEach((b) => {
    b.pool = CARDS.filter((c) => !b.regions || b.regions.includes(c.region));
    const free = (c) => !usedCovers.has(c.id);
    const cover = b.pool.find((c) => free(c) && c.rarity === 'legendaire' && c.modality === 'Radiographie')
      || b.pool.find((c) => free(c) && c.rarity === 'legendaire') || b.pool.find(free) || b.pool[0];
    if (cover) { usedCovers.add(cover.id); b.cover = cover.img; }
  });

  // ---------- state ----------
  const defaults = { collection: {}, packsLeft: MAX_PACKS, resetAt: 0, sound: true, dense: false, study: false, opened: 0 };
  let S;
  try { S = Object.assign({}, defaults, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { S = Object.assign({}, defaults); }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* quota */ } };
  const owned = (id) => !!S.collection[id];
  const ownedCount = (list) => (list || CARDS).filter((c) => owned(c.id)).length;

  function refreshPacks() {
    if (S.packsLeft < MAX_PACKS && S.resetAt && Date.now() >= S.resetAt) {
      S.packsLeft = MAX_PACKS; S.resetAt = 0; save();
    }
  }

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const pad3 = (n) => String(n).padStart(3, '0');
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* noop */ } };
  function toast(msg) {
    const t = el('div', 'toast', esc(msg)); document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }
  function fmtCountdown(ms) {
    const m = Math.max(0, Math.ceil(ms / 60000));
    return m >= 60 ? '1 h' : `${m} min`;
  }

  // ---------- sound (WebAudio synth, no files) ----------
  let AC = null;
  function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } } return AC; }
  function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0, slide = 0) {
    if (!S.sound) return; const a = ac(); if (!a) return;
    const t0 = a.currentTime + delay; const o = a.createOscillator(); const g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol = 0.08, hp = 2000) {
    if (!S.sound) return; const a = ac(); if (!a) return;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = a.createBufferSource(); s.buffer = buf; const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = a.createGain(); g.gain.value = vol; s.connect(f).connect(g).connect(a.destination); s.start();
  }
  const SFX = {
    tearStep: () => noise(0.05, 0.05, 3500),
    tear: () => { noise(0.35, 0.14, 1200); tone(220, 0.25, 'triangle', 0.06, 0, 300); },
    deal: () => noise(0.08, 0.05, 5000),
    reveal: (r) => {
      if (r === 'legendaire') { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, 'triangle', 0.1, i * 0.08)); }
      else if (r === 'rare') { [587, 740, 880].forEach((f, i) => tone(f, 0.35, 'triangle', 0.09, i * 0.07)); }
      else tone(660, 0.18, 'sine', 0.08, 0, 220);
    },
    tick: () => tone(900, 0.05, 'square', 0.03),
  };

  // ---------- card element ----------
  function cardEl(card, opts = {}) {
    const r = RARITY[card.rarity];
    const c = el('div', `card r-${card.rarity}${opts.revealed ? ' revealed' : ''}`);
    c.innerHTML = `
      <div class="card-inner">
        <div class="card-top"><span class="num">#${pad3(card.n)}/${TOTAL}</span><span class="gems" title="${r.label}">${r.gems}</span></div>
        <div class="card-img"><img src="${card.img}" alt="" draggable="false" ${opts.lazy ? 'loading="lazy"' : ''} decoding="async" /></div>
        ${opts.compact ? '' : `<div class="card-info"><div><div class="pad">
          <h3>${esc(card.title)}</h3>
          <p>${esc(card.desc)}</p>
          <div class="tags"><span class="tag">${esc(card.modality)}</span><span class="tag">${esc(REGIONS[card.region] || card.region)}</span><span class="tag">${r.label}</span></div>
        </div></div></div>`}
        ${opts.hint ? '<div class="tap-hint">Touchez pour révéler</div>' : ''}
        <div class="holo"></div>
      </div>`;
    if (opts.tilt) attachTilt(c);
    return c;
  }

  function attachTilt(c) {
    const move = (e) => {
      const r = c.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      c.style.transform = `rotateY(${(px - 0.5) * 14}deg) rotateX(${-(py - 0.5) * 14}deg)`;
      c.style.setProperty('--px', `${px * 100}%`); c.style.setProperty('--py', `${py * 100}%`);
      c.style.setProperty('--hx', `${px * 100}%`); c.style.setProperty('--hy', `${py * 100}%`);
    };
    const leave = () => { c.style.transform = ''; };
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerleave', leave);
    c.addEventListener('pointerup', leave);
  }

  // ---------- draw ----------
  function weightedPick(weights) {
    const tot = Object.values(weights).reduce((a, b) => a + b, 0); let x = Math.random() * tot;
    for (const k in weights) { x -= weights[k]; if (x <= 0) return k; }
    return Object.keys(weights)[0];
  }
  function drawPack(booster) {
    const slots = [
      { commune: 72, 'peu-commune': 28 },
      { commune: 72, 'peu-commune': 28 },
      { commune: 60, 'peu-commune': 40 },
      { commune: 20, 'peu-commune': 58, rare: 22 },
      { 'peu-commune': 36, rare: 50, legendaire: 14 },
    ];
    const picked = [];
    for (const w of slots) {
      let tier = weightedPick(w);
      let tierIdx = RAR_ORDER.indexOf(tier);
      let pool = [];
      // fall back to neighbouring tiers if the booster has none left
      for (let k = 0; k < 4 && !pool.length; k++) {
        const t = RAR_ORDER[Math.max(0, tierIdx - k)];
        pool = booster.pool.filter((c) => c.rarity === t && !picked.includes(c));
      }
      if (!pool.length) pool = booster.pool.filter((c) => !picked.includes(c));
      // unowned cards are 3× more likely, so the binder fills up
      const ws = pool.map((c) => (owned(c.id) ? 1 : 3));
      let x = Math.random() * ws.reduce((a, b) => a + b, 0); let chosen = pool[0];
      for (let i = 0; i < pool.length; i++) { x -= ws[i]; if (x <= 0) { chosen = pool[i]; break; } }
      picked.push(chosen);
    }
    picked.sort((a, b) => RAR_ORDER.indexOf(a.rarity) - RAR_ORDER.indexOf(b.rarity));
    return picked.map((card) => ({ card, isNew: !owned(card.id) }));
  }

  // ---------- views ----------
  let currentView = 'boosters';
  function showView(v) {
    currentView = v;
    document.querySelectorAll('.view').forEach((s) => { s.hidden = s.id !== `view-${v}`; });
    document.querySelectorAll('.bottom-nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    if (v === 'binder') { binderFilter = null; renderBinder(); } else renderHome();
    window.scrollTo({ top: 0 });
  }

  function renderTop() {
    refreshPacks();
    const pc = $('#packCounter');
    pc.classList.toggle('empty', S.packsLeft <= 0);
    pc.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M5 7h14"/></svg>${S.packsLeft}/${MAX_PACKS}`;
    $('#soundBtn').innerHTML = S.sound
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6M17 9l6 6"/></svg>';
  }

  function renderHome() {
    renderTop();
    const n = ownedCount();
    $('#homeProgress').style.width = `${(n / TOTAL) * 100}%`;
    $('#homeProgressText').textContent = `${n}/${TOTAL} cartes`;
    const grid = $('#boosterGrid'); grid.innerHTML = '';
    BOOSTERS.forEach((b) => {
      const t = el('button', `booster-tile${S.packsLeft <= 0 ? ' disabled' : ''}`);
      t.innerHTML = `
        <div class="mini-pack">${packArt(b)}</div>
        <div><h3>${esc(b.name)}</h3><p>${esc(b.desc)}</p></div>
        <span class="owned">${ownedCount(b.pool)}/${b.pool.length} collectées</span>`;
      t.addEventListener('click', () => openBooster(b));
      grid.appendChild(t);
    });
    updateRefill();
  }
  function updateRefill() {
    refreshPacks();
    const r = $('#refillText');
    if (S.packsLeft >= MAX_PACKS) r.textContent = `${MAX_PACKS} boosters disponibles · ils se rechargent toutes les heures`;
    else if (S.packsLeft > 0) r.textContent = `Recharge complète dans ${fmtCountdown(S.resetAt - Date.now())}`;
    else r.textContent = `Plus de booster : recharge dans ${fmtCountdown(S.resetAt - Date.now())}`;
  }
  function packArt(b) {
    return `<div class="pack" style="--c1:${b.c1};--c2:${b.c2}">
      <div class="pack-xray" style="background-image:url('${b.cover}')"></div>
      <div class="pack-sheen"></div>
      <div class="pack-label"><small>MSK TCG</small><span>${esc(b.name)}</span></div>
    </div>`;
  }

  // ---------- binder ----------
  let binderFilter = null;
  function renderBinder() {
    renderTop();
    const n = ownedCount();
    $('#binderCount').textContent = `${n}/${TOTAL} cartes · ${Math.round((n / TOTAL) * 100)} %`;
    $('#studyBtn').setAttribute('aria-pressed', String(!!S.study));
    $('#gridBtn').textContent = S.dense ? '▦ 4' : '▦ 3';

    const chips = $('#regionChips'); chips.innerHTML = '';
    const mk = (key, label, list) => {
      const b = el('button', binderFilter === key ? 'active' : '', `${esc(label)}<small>${ownedCount(list)}/${list.length}</small>`);
      b.addEventListener('click', () => { binderFilter = key; renderBinder(); });
      chips.appendChild(b);
    };
    const mine = CARDS.filter((c) => owned(c.id));
    if (binderFilter == null) binderFilter = mine.length ? 'owned' : 'all';
    if (mine.length) mk('owned', 'Obtenues', mine);
    mk('all', 'Tout', CARDS);
    Object.keys(REGIONS).forEach((k) => { const l = CARDS.filter((c) => c.region === k); if (l.length) mk(k, REGIONS[k], l); });

    const list = binderFilter === 'all' ? CARDS : binderFilter === 'owned' ? mine : CARDS.filter((c) => c.region === binderFilter);
    $('#rarityStats').innerHTML = RAR_ORDER.map((r) => {
      const l = list.filter((c) => c.rarity === r);
      return `<span class="rs-${r}">${RARITY[r].gems} ${RARITY[r].label} <b>${ownedCount(l)}/${l.length}</b></span>`;
    }).join('');

    const grid = $('#binderGrid'); grid.innerHTML = '';
    grid.classList.toggle('dense', !!S.dense);
    grid.classList.toggle('study', !!S.study);
    const frag = document.createDocumentFragment();
    list.forEach((card) => {
      const slot = el('div', 'slot');
      if (owned(card.id)) {
        const c = cardEl(card, { compact: true, lazy: true });
        const cnt = S.collection[card.id].count;
        if (cnt > 1) c.appendChild(el('span', 'count-badge', `×${cnt}`));
        c.addEventListener('click', () => openModal(card, !S.study));
        slot.appendChild(c);
        slot.appendChild(el('div', 'slot-title', esc(card.title)));
      } else {
        slot.appendChild(el('div', 'empty-slot', `<div><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>#${pad3(card.n)}</div>`));
        slot.appendChild(el('div', 'slot-title', '&nbsp;'));
      }
      frag.appendChild(slot);
    });
    grid.appendChild(frag);
  }

  // ---------- modal (inspect + pinch-zoom) ----------
  function openModal(card, revealed) {
    const m = $('#modal'); const box = $('#modalCard'); box.innerHTML = '';
    const c = cardEl(card, { revealed, hint: !revealed, tilt: false });
    box.appendChild(c);
    const info = S.collection[card.id];
    box.appendChild(el('div', 'modal-meta', `${esc(card.source)}${info ? ` · obtenue ×${info.count}` : ''} · pincez l’image pour zoomer`));
    if (!revealed) {
      c.addEventListener('click', (e) => { if (!c.classList.contains('revealed')) { e.stopPropagation(); c.classList.add('revealed'); SFX.reveal(card.rarity); vibrate(12); } });
    }
    attachZoom($('.card-img', c), $('.card-img img', c));
    m.hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; $('#modalCard').innerHTML = ''; }

  function attachZoom(box, img) {
    let s = 1, tx = 0, ty = 0; const pts = new Map(); let start = null; let lastTap = 0; let moved = false;
    const apply = () => {
      const w = box.clientWidth, h = box.clientHeight;
      s = Math.min(5, Math.max(1, s));
      tx = Math.min(0, Math.max(w * (1 - s), tx)); ty = Math.min(0, Math.max(h * (1 - s), ty));
      if (s === 1) { tx = 0; ty = 0; }
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    };
    const local = (e) => { const r = box.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    box.addEventListener('pointerdown', (e) => {
      box.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); moved = false;
      const arr = [...pts.values()];
      if (arr.length === 2) {
        const c = { x: (arr[0].x + arr[1].x) / 2, y: (arr[0].y + arr[1].y) / 2 };
        start = { s, tx, ty, d: Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y), c };
      } else start = { s, tx, ty, p: local(e) };
    });
    box.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, local(e)); const arr = [...pts.values()];
      if (arr.length >= 2 && start.d) {
        const c = { x: (arr[0].x + arr[1].x) / 2, y: (arr[0].y + arr[1].y) / 2 };
        const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
        s = start.s * (d / start.d);
        const k = s / start.s; tx = c.x - (start.c.x - start.tx) * k; ty = c.y - (start.c.y - start.ty) * k;
        moved = true; apply();
      } else if (arr.length === 1 && start.p && s > 1) {
        const p = arr[0]; tx = start.tx + (p.x - start.p.x); ty = start.ty + (p.y - start.p.y);
        if (Math.abs(p.x - start.p.x) + Math.abs(p.y - start.p.y) > 4) moved = true;
        apply();
      }
    });
    const up = (e) => {
      const p = pts.get(e.pointerId); pts.delete(e.pointerId);
      if (pts.size === 1) { const q = [...pts.values()][0]; start = { s, tx, ty, p: q }; return; }
      start = null;
      if (!moved && p && e.type === 'pointerup') {
        const now = Date.now();
        if (now - lastTap < 300) {
          if (s > 1) { s = 1; } else { const k = 2.5; tx = p.x - p.x * k; ty = p.y - p.y * k; s = k; }
          apply(); lastTap = 0;
        } else lastTap = now;
      }
      if (moved) { e.stopPropagation(); }
    };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.addEventListener('wheel', (e) => {
      e.preventDefault(); const p = local(e); const s0 = s; s = s * (e.deltaY < 0 ? 1.15 : 1 / 1.15); s = Math.min(5, Math.max(1, s));
      const k = s / s0; tx = p.x - (p.x - tx) * k; ty = p.y - (p.y - ty) * k; apply();
    }, { passive: false });
    // a zoom/pan gesture must not count as a "reveal" tap
    box.addEventListener('click', (e) => { if (s > 1 || moved) e.stopPropagation(); }, true);
  }

  // ---------- opening stage ----------
  let OP = null; // { booster, pulls, idx, phase }
  function openBooster(b) {
    refreshPacks();
    if (S.packsLeft <= 0) { toast(`Plus de booster : recharge dans ${fmtCountdown(S.resetAt - Date.now())}`); return; }
    ac(); // unlock audio on user gesture
    OP = { booster: b, pulls: drawPack(b), idx: 0, phase: 'pack' };
    $('#stage').hidden = false; document.body.style.overflow = 'hidden';
    renderPackPhase();
  }
  function closeStage() {
    $('#stage').hidden = true; document.body.style.overflow = '';
    $('#stageRays').className = 'stage-rays'; OP = null;
    showView(currentView);
  }

  function renderPackPhase() {
    const b = OP.booster;
    $('#stageStep').innerHTML = `${esc(b.name)}`;
    const body = $('#stageBody'); body.innerHTML = '';
    const wrap = el('div', 'stage-pack');
    wrap.innerHTML = `
      <div class="pack-bottom">${packArt(b)}</div>
      <div class="pack-top">${packArt(b)}</div>
      <div class="tear-zone"><div class="tear-line"></div><div class="tear-progress"></div><div class="tear-finger"></div></div>`;
    body.appendChild(wrap);
    $('#stageFoot').innerHTML = '<p class="hint-text">Glissez le doigt le long des pointillés pour déchirer le booster</p>';

    const zone = $('.tear-zone', wrap); const prog = $('.tear-progress', wrap); const finger = $('.tear-finger', wrap);
    let dragging = false, startX = 0, pct = 0, lastStep = 0;
    const width = () => zone.getBoundingClientRect().width * 0.88;
    const set = (p) => { pct = p; prog.style.width = `${p * 0.88}%`; };
    const done = () => {
      dragging = false; set(100); wrap.classList.add('torn'); SFX.tear(); vibrate([18, 30, 18]);
      wrap.appendChild(el('div', 'burst'));
      consumePack();
      setTimeout(startCards, 750);
    };
    zone.addEventListener('pointerdown', (e) => {
      if (wrap.classList.contains('torn')) return;
      zone.setPointerCapture(e.pointerId); dragging = true; startX = e.clientX; finger.style.display = 'none';
    });
    zone.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const p = Math.max(pct, Math.min(100, ((e.clientX - startX) / width()) * 100 + (pct > 0 ? 0 : 4)));
      if (p > pct) { set(p); if (p - lastStep > 9) { lastStep = p; SFX.tearStep(); vibrate(4); } }
      if (p >= 92) done();
    });
    const end = () => {
      if (!dragging) return; dragging = false;
      if (pct >= 70) done(); else { prog.style.transition = 'width .25s ease'; set(0); lastStep = 0; setTimeout(() => { prog.style.transition = ''; finger.style.display = ''; }, 260); }
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }

  function consumePack() {
    refreshPacks();
    if (S.packsLeft >= MAX_PACKS || !S.resetAt) S.resetAt = Date.now() + REFILL_MS;
    S.packsLeft = Math.max(0, S.packsLeft - 1); S.opened = (S.opened || 0) + 1;
    OP.pulls.forEach(({ card }) => {
      const cur = S.collection[card.id];
      if (cur) cur.count += 1; else S.collection[card.id] = { count: 1, first: Date.now() };
    });
    save(); renderTop();
  }

  function startCards() { OP.phase = 'cards'; OP.idx = 0; renderCard(); }

  function stepDots() {
    return `<div class="dots">${OP.pulls.map((_, i) => `<i class="${i < OP.idx ? 'done' : i === OP.idx ? 'cur' : ''}"></i>`).join('')}</div>`;
  }

  function renderCard() {
    const { card, isNew } = OP.pulls[OP.idx];
    $('#stageStep').innerHTML = stepDots();
    const rays = $('#stageRays');
    rays.className = 'stage-rays' + (card.rarity === 'legendaire' ? ' on gold' : card.rarity === 'rare' ? ' on violet' : '');
    const body = $('#stageBody'); body.innerHTML = '';
    const wrap = el('div', 'stage-card-wrap');
    const remaining = OP.pulls.length - OP.idx - 1;
    for (let i = Math.min(remaining, 2); i > 0; i--) {
      const g = el('div', 'stack-ghost'); g.style.transform = `translate(${i * 5}px, ${i * 6}px) rotate(${i * 1.5}deg)`; wrap.appendChild(g);
    }
    const c = cardEl(card, { hint: true, tilt: true });
    c.classList.add('deal-in');
    if (isNew) c.appendChild(el('span', 'new-badge', 'NOUVEAU'));
    wrap.appendChild(c); body.appendChild(wrap);
    SFX.deal();
    if (card.rarity === 'legendaire') vibrate([30, 40, 30, 40, 60]); else if (card.rarity === 'rare') vibrate([20, 30, 20]);
    $('#stageFoot').innerHTML = '';

    let sx = null, sy = 0, dx = 0;
    c.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; dx = 0; });
    c.addEventListener('pointermove', (e) => {
      if (sx == null || !c.classList.contains('revealed')) return;
      dx = e.clientX - sx;
      if (Math.abs(dx) > Math.abs(e.clientY - sy)) c.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
    });
    c.addEventListener('pointerup', () => {
      const revealed = c.classList.contains('revealed');
      if (revealed && Math.abs(dx) > 70) { next(dx < 0 ? 'left' : 'right'); }
      else if (!revealed && Math.abs(dx) < 10) reveal(c, card);
      sx = null; dx = 0;
    });
    c.addEventListener('pointercancel', () => { sx = null; dx = 0; c.style.transform = ''; });
  }

  function reveal(c, card) {
    c.classList.add('revealed'); SFX.reveal(card.rarity); vibrate(12);
    const last = OP.idx === OP.pulls.length - 1;
    const foot = $('#stageFoot'); foot.innerHTML = '';
    const b = el('button', 'btn', last ? 'Voir le récapitulatif' : 'Carte suivante →');
    b.addEventListener('click', () => next('left'));
    foot.appendChild(b);
  }

  function next(dir) {
    const c = $('#stageBody .card');
    if (c) { c.style.transform = ''; c.classList.remove('deal-in'); c.classList.add(dir === 'right' ? 'fly-out-right' : 'fly-out-left'); }
    SFX.tick();
    setTimeout(() => {
      if (!OP) return;
      OP.idx += 1;
      if (OP.idx >= OP.pulls.length) renderSummary(); else renderCard();
    }, 260);
  }

  function renderSummary() {
    OP.phase = 'summary';
    $('#stageRays').className = 'stage-rays';
    const nNew = OP.pulls.filter((p) => p.isNew).length;
    $('#stageStep').innerHTML = `Récapitulatif · ${nNew} nouvelle${nNew > 1 ? 's' : ''} carte${nNew > 1 ? 's' : ''}`;
    const body = $('#stageBody'); body.innerHTML = '';
    const sum = el('div', 'summary');
    OP.pulls.forEach(({ card, isNew }, i) => {
      const it = el('div', 'sum-item'); it.style.animationDelay = `${i * 70}ms`;
      const c = cardEl(card, { compact: true });
      if (isNew) c.appendChild(el('span', 'new-badge', 'NEW'));
      c.addEventListener('click', () => openModal(card, true));
      it.appendChild(c); it.appendChild(el('div', 'sum-title', esc(card.title)));
      sum.appendChild(it);
    });
    body.appendChild(sum);
    const foot = $('#stageFoot'); foot.innerHTML = '';
    refreshPacks();
    if (S.packsLeft > 0) {
      const again = el('button', 'btn', `Rouvrir (${S.packsLeft})`);
      const b = OP.booster;
      again.addEventListener('click', () => { closeStageSilently(); openBooster(b); });
      foot.appendChild(again);
    }
    const bind = el('button', 'btn ghost', 'Classeur');
    bind.addEventListener('click', () => { currentView = 'binder'; closeStage(); });
    foot.appendChild(bind);
  }
  function closeStageSilently() { $('#stage').hidden = true; OP = null; }

  // ---------- pull to refresh (touch only, icon only) ----------
  function setupPTR() {
    if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;
    const ind = $('#ptr'); const TH = 70; let y0 = null, pull = 0, busy = false;
    const blocked = () => !$('#stage').hidden || !$('#modal').hidden;
    window.addEventListener('touchstart', (e) => { if (busy || blocked() || window.scrollY > 2 || e.touches.length !== 1) { y0 = null; return; } y0 = e.touches[0].clientY; pull = 0; }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (y0 == null) return; const d = e.touches[0].clientY - y0;
      if (d <= 0 || window.scrollY > 2) { pull = 0; ind.style.opacity = 0; ind.style.transform = 'translateY(-50px)'; return; }
      pull = Math.min(120, Math.pow(d, 0.85));
      if (pull > 8 && e.cancelable) e.preventDefault();
      ind.style.opacity = Math.min(1, pull / TH);
      ind.style.transform = `translateY(${pull - 50}px) rotate(${pull * 3}deg)`;
    }, { passive: false });
    window.addEventListener('touchend', () => {
      if (y0 == null) return; y0 = null;
      if (pull >= TH) {
        busy = true; ind.classList.add('spin'); ind.style.transform = 'translateY(20px)'; vibrate(12);
        setTimeout(() => location.reload(), 380);
      } else { ind.style.opacity = 0; ind.style.transform = 'translateY(-50px)'; }
      pull = 0;
    }, { passive: true });
  }

  // ---------- wiring ----------
  document.querySelectorAll('.bottom-nav button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  $('#soundBtn').addEventListener('click', () => { S.sound = !S.sound; save(); renderTop(); if (S.sound) { ac(); SFX.tick(); } });
  $('#studyBtn').addEventListener('click', () => { S.study = !S.study; save(); renderBinder(); toast(S.study ? 'Mode révision : titres masqués, touchez une carte pour révéler' : 'Titres affichés'); });
  $('#gridBtn').addEventListener('click', () => { S.dense = !S.dense; save(); renderBinder(); });
  $('#stageClose').addEventListener('click', closeStage);
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (!$('#stage').hidden) closeStage(); }
  });
  setInterval(() => { if (currentView === 'boosters' && $('#stage').hidden) { const before = S.packsLeft; refreshPacks(); if (before !== S.packsLeft) renderHome(); else { updateRefill(); renderTop(); } } }, 30000);
  setupPTR();
  showView('boosters');

  // ---------- service worker ----------
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js?v=1').catch(() => {});
  }
})();
