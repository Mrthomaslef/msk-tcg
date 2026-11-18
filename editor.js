/* MSK TCG — card editor: edit titles/descriptions/rarity, remove or restore cards,
   then publish data/overrides.json to GitHub (token kept on this device only). */
(function () {
  'use strict';
  const D = window.MSK_DECK;
  const REPO = 'Mrthomaslef/msk-tcg';
  const PATH = 'data/overrides.json';
  const API = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
  const DRAFT_KEY = 'msk-tcg:editor-draft';
  const TOKEN_KEY = 'msk-tcg:gh-token';

  const REGIONS = {
    epaule: 'Épaule', coude: 'Coude', 'main-poignet': 'Poignet & Main', rachis: 'Rachis',
    'bassin-hanche': 'Bassin & Hanche', genou: 'Genou', 'cheville-pied': 'Cheville & Pied',
    'os-entier': 'Os & Systémique', 'parties-molles': 'Parties molles',
  };
  const RARITY = { commune: 'Commune', 'peu-commune': 'Peu commune', rare: 'Rare', legendaire: 'Légendaire' };
  const MODALITIES = ['Radiographie', 'TDM', 'IRM', 'Échographie', 'Scintigraphie/TEP', 'Interventionnel'];

  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const vibrate = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } };
  const BASE = Object.fromEntries(D.base.map((c) => [c.id, c]));

  // ---------- state ----------
  let published = D.norm(D.overrides);
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { /* ignore */ }
  draft = draft ? D.norm(draft) : D.norm(JSON.parse(JSON.stringify(published)));
  const saveDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* quota */ } };

  const isHidden = (o, id) => o.hidden.includes(id);
  const editOf = (o, id) => o.edits[id] || {};
  const cardState = (o, id) => JSON.stringify([isHidden(o, id), editOf(o, id)]);
  const pendingIds = () => D.base.map((c) => c.id).filter((id) => cardState(draft, id) !== cardState(published, id));
  const view = (id) => {
    const b = BASE[id]; const e = editOf(draft, id); const out = Object.assign({}, b);
    D.FIELDS.forEach((f) => { if (e[f] != null && e[f] !== '') out[f] = e[f]; });
    out.hidden = isHidden(draft, id); out.edited = Object.keys(e).length > 0; return out;
  };

  function setField(id, field, value) {
    const b = BASE[id]; const e = Object.assign({}, editOf(draft, id));
    if (value === b[field] || value === '') delete e[field]; else e[field] = value;
    if (Object.keys(e).length) draft.edits[id] = e; else delete draft.edits[id];
    saveDraft(); updatePublish();
  }
  function setHidden(id, hide) {
    draft.hidden = draft.hidden.filter((x) => x !== id);
    if (hide) draft.hidden.push(id);
    saveDraft(); updatePublish();
  }

  // ---------- list ----------
  let filter = 'all';
  let region = '';
  function renderFilters() {
    const all = D.base.map((c) => view(c.id));
    const counts = {
      all: all.length,
      visible: all.filter((c) => !c.hidden).length,
      hidden: all.filter((c) => c.hidden).length,
      edited: all.filter((c) => c.edited).length,
      pending: pendingIds().length,
    };
    const labels = { all: 'Toutes', visible: 'Dans le jeu', hidden: 'Retirées', edited: 'Modifiées', pending: 'Non publiées' };
    const box = $('#edFilters'); box.innerHTML = '';
    Object.keys(labels).forEach((k) => {
      if (k === 'pending' && !counts.pending && filter !== 'pending') return;
      const b = el('button', filter === k ? 'active' : '', `${labels[k]}<small>${counts[k]}</small>`);
      b.addEventListener('click', () => { filter = k; renderList(); });
      box.appendChild(b);
    });
    $('#edIntro').textContent = `${counts.visible} cartes dans le jeu · ${counts.hidden} retirée${counts.hidden > 1 ? 's' : ''}. Touchez une carte pour modifier son texte ou la retirer.`;
  }
  function renderList() {
    renderFilters();
    const q = $('#edSearch').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const pend = new Set(pendingIds());
    const list = D.base.map((c) => view(c.id)).filter((c) => {
      if (filter === 'visible' && c.hidden) return false;
      if (filter === 'hidden' && !c.hidden) return false;
      if (filter === 'edited' && !c.edited) return false;
      if (filter === 'pending' && !pend.has(c.id)) return false;
      if (region && c.region !== region) return false;
      if (q) { const t = `${c.title} ${c.desc} ${c.id}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); if (!t.includes(q)) return false; }
      return true;
    });
    const grid = $('#edGrid'); grid.innerHTML = '';
    if (!list.length) { grid.appendChild(el('p', 'muted ed-empty', 'Aucune carte.')); return; }
    const frag = document.createDocumentFragment();
    list.forEach((c) => {
      const t = el('button', `ed-tile r-${c.rarity}${c.hidden ? ' is-hidden' : ''}`);
      t.innerHTML = `
        <div class="ed-thumb"><img src="${c.img}" alt="" loading="lazy" decoding="async" draggable="false" />
          ${c.hidden ? '<span class="ed-badge out">Retirée</span>' : ''}${pend.has(c.id) ? '<span class="ed-badge pend">●</span>' : ''}</div>
        <div class="ed-meta"><b>${esc(c.title)}</b><span>${esc(RARITY[c.rarity])} · ${esc(c.modality)}</span></div>`;
      t.addEventListener('click', () => openSheet(c.id));
      frag.appendChild(t);
    });
    grid.appendChild(frag);
  }

  // ---------- sheet ----------
  let cur = null;
  function fillSelect(sel, entries, value) {
    sel.innerHTML = entries.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('');
  }
  function openSheet(id) {
    cur = id; const c = view(id);
    $('#edSheetTitle').textContent = `${c.id.toUpperCase()}${c.edited ? ' · modifiée' : ''}`;
    $('#edImg').src = c.img;
    $('#edSource').textContent = c.source || '';
    $('#edTitle').value = c.title; $('#edDesc').value = c.desc;
    $('#edTitle').placeholder = BASE[id].title; $('#edDesc').placeholder = BASE[id].desc;
    counts();
    const seg = $('#edRarity'); seg.innerHTML = '';
    Object.keys(RARITY).forEach((k) => {
      const b = el('button', `r-${k}${c.rarity === k ? ' on' : ''}`, esc(RARITY[k])); b.type = 'button';
      b.addEventListener('click', () => { setField(id, 'rarity', k); [...seg.children].forEach((x) => x.classList.toggle('on', x === b)); refreshSheetHead(); });
      seg.appendChild(b);
    });
    fillSelect($('#edRegionSel'), Object.entries(REGIONS), c.region);
    fillSelect($('#edModality'), MODALITIES.map((m) => [m, m]), c.modality);
    refreshSheetHead();
    $('#edSheet').hidden = false; document.body.classList.add('locked');
    $('.ed-sheet-scroll', $('#edSheet')).scrollTop = 0;
  }
  function refreshSheetHead() {
    const c = view(cur);
    $('#edSheetTitle').textContent = `${c.id.toUpperCase()}${c.edited ? ' · modifiée' : ''}`;
    const h = $('#edHide');
    h.textContent = c.hidden ? '↩︎ Remettre dans le jeu' : '🗑 Retirer du jeu';
    h.classList.toggle('danger', !c.hidden);
    $('#edRevert').hidden = !c.edited;
    $('#edSheet .ed-img').classList.toggle('is-hidden', c.hidden);
  }
  function counts() {
    $('#edTitleCount').textContent = `${$('#edTitle').value.length}/38 conseillé`;
    $('#edDescCount').textContent = `${$('#edDesc').value.length}/120 conseillé`;
  }
  function closeSheet() { $('#edSheet').hidden = true; document.body.classList.remove('locked'); cur = null; renderList(); }

  $('#edTitle').addEventListener('input', (e) => { setField(cur, 'title', e.target.value.trim()); counts(); refreshSheetHead(); });
  $('#edDesc').addEventListener('input', (e) => { setField(cur, 'desc', e.target.value.trim()); counts(); refreshSheetHead(); });
  $('#edRegionSel').addEventListener('change', (e) => { setField(cur, 'region', e.target.value); refreshSheetHead(); });
  $('#edModality').addEventListener('change', (e) => { setField(cur, 'modality', e.target.value); refreshSheetHead(); });
  $('#edHide').addEventListener('click', () => { const h = !view(cur).hidden; setHidden(cur, h); vibrate(h ? [15, 30, 15] : 12); toast(h ? 'Carte retirée du jeu' : 'Carte remise dans le jeu'); refreshSheetHead(); });
  $('#edRevert').addEventListener('click', () => { delete draft.edits[cur]; saveDraft(); updatePublish(); openSheet(cur); toast('Texte d’origine restauré'); });
  $('#edClose').addEventListener('click', closeSheet);
  $('#edSheet').addEventListener('click', (e) => { if (e.target.id === 'edSheet') closeSheet(); });

  // ---------- publish ----------
  function updatePublish() {
    const n = pendingIds().length; const b = $('#publishBtn');
    b.disabled = n === 0; b.textContent = n ? `Publier (${n})` : 'Publié ✓';
  }
  let toastT = null;
  function toast(msg, bad) {
    const t = $('#edToast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  async function publish(token) {
    const b = $('#publishBtn'); b.disabled = true; b.textContent = 'Publication…';
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    try {
      let sha;
      const g = await fetch(`${API}?ref=main&ts=${Date.now()}`, { headers, cache: 'no-store' });
      if (g.status === 401 || g.status === 403) throw Object.assign(new Error('auth'), { auth: true });
      if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error(`GitHub ${g.status}`);
      const next = D.norm(JSON.parse(JSON.stringify(draft)));
      next.updated = Date.now();
      next.hidden.sort();
      const n = pendingIds().length;
      const body = { message: `Éditeur : ${n} carte${n > 1 ? 's' : ''} modifiée${n > 1 ? 's' : ''}/retirée${n > 1 ? 's' : ''}`, content: b64(JSON.stringify(next, null, 1) + '\n'), branch: 'main' };
      if (sha) body.sha = sha;
      const p = await fetch(API, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (p.status === 401 || p.status === 403) throw Object.assign(new Error('auth'), { auth: true });
      if (!p.ok) throw new Error(`GitHub ${p.status}`);
      published = next; draft = D.norm(JSON.parse(JSON.stringify(next)));
      D.store(next); localStorage.removeItem(DRAFT_KEY);
      vibrate([12, 40, 12]);
      toast('Publié ✓ visible dans le jeu (autres appareils : ~1 min)');
      if (filter === 'pending') filter = 'all';
      renderList();
    } catch (err) {
      if (err.auth) { localStorage.removeItem(TOKEN_KEY); openToken('Jeton refusé par GitHub : vérifiez le dépôt msk-tcg et la permission Contents (lecture/écriture).'); }
      else toast(`Échec de la publication (${err.message}). Vos modifications sont gardées sur cet appareil.`, true);
    } finally { updatePublish(); }
  }
  function openToken(msg) {
    $('#tokenErr').textContent = msg || ''; $('#tokenInput').value = '';
    $('#tokenSheet').hidden = false; document.body.classList.add('locked');
  }
  function closeToken() { $('#tokenSheet').hidden = true; document.body.classList.remove('locked'); }
  $('#publishBtn').addEventListener('click', () => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) publish(t); else openToken();
  });
  $('#tokenSave').addEventListener('click', () => {
    const t = $('#tokenInput').value.trim();
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) { $('#tokenErr').textContent = 'Ce jeton ne ressemble pas à un jeton GitHub (github_pat_… ou ghp_…).'; return; }
    try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* ignore */ }
    closeToken(); publish(t);
  });
  $('#tokenClose').addEventListener('click', closeToken);
  $('#tokenSheet').addEventListener('click', (e) => { if (e.target.id === 'tokenSheet') closeToken(); });

  // ---------- filters / search ----------
  fillSelect($('#edRegion'), [['', 'Toutes les régions'], ...Object.entries(REGIONS)], '');
  $('#edRegion').addEventListener('change', (e) => { region = e.target.value; renderList(); });
  let qT = null;
  $('#edSearch').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(renderList, 120); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#tokenSheet').hidden) closeToken(); else if (!$('#edSheet').hidden) closeSheet(); } });

  // ---------- pull to refresh (touch only, rotating arrow) ----------
  (function setupPTR() {
    if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;
    const ind = $('#ptr'); const TH = 70; let y0 = null, pull = 0, busy = false;
    const blocked = () => !$('#edSheet').hidden || !$('#tokenSheet').hidden;
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
      if (pull >= TH) { busy = true; ind.classList.add('spin'); ind.style.transform = 'translateY(20px)'; vibrate(12); setTimeout(() => location.reload(), 380); }
      else { ind.style.opacity = 0; ind.style.transform = 'translateY(-50px)'; }
      pull = 0;
    }, { passive: true });
  })();

  // ---------- boot ----------
  renderList(); updatePublish();
  // pick up changes published from another device (keeps local unpublished edits)
  D.fetchRemote().then((j) => {
    if (!j || D.norm(j).updated <= published.updated) return;
    const hadPending = pendingIds().length > 0;
    published = D.norm(j); D.store(published);
    if (!hadPending) { draft = D.norm(JSON.parse(JSON.stringify(published))); localStorage.removeItem(DRAFT_KEY); }
    renderList(); updatePublish();
  });
})();
