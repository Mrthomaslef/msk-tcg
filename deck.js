/* MSK TCG — deck layer: applies the editor overrides (hidden cards + edited texts) to the embedded cards.
   Overrides live in data/overrides.json (published from edit.html through the GitHub API).
   The last known version is cached in localStorage so the game works offline and boots instantly. */
(function () {
  'use strict';
  const KEY = 'msk-tcg:overrides';
  const REG = ['epaule', 'coude', 'main-poignet', 'rachis', 'bassin-hanche', 'genou', 'cheville-pied', 'os-entier', 'parties-molles'];
  const RAR = ['commune', 'peu-commune', 'rare', 'legendaire'];
  const FIELDS = ['title', 'desc', 'rarity', 'region', 'modality'];
  const base = window.MSK_CARDS || [];

  const norm = (o) => ({ updated: (o && o.updated) || 0, hidden: (o && o.hidden) || [], edits: (o && o.edits) || {} });
  const newer = (a, b) => (norm(a).updated >= norm(b).updated ? norm(a) : norm(b));

  function apply(ov) {
    ov = norm(ov);
    const hidden = new Set(ov.hidden);
    const all = base.map((c) => {
      const e = ov.edits[c.id] || {};
      const out = Object.assign({}, c, { baseN: c.n, hidden: hidden.has(c.id) });
      FIELDS.forEach((f) => { if (e[f] != null && e[f] !== '') out[f] = e[f]; });
      return out;
    });
    all.sort((a, b) => (REG.indexOf(a.region) - REG.indexOf(b.region)) || (RAR.indexOf(a.rarity) - RAR.indexOf(b.rarity)) || (a.baseN - b.baseN));
    const visible = all.filter((c) => !c.hidden);
    visible.forEach((c, i) => { c.n = i + 1; });
    return { all, visible };
  }

  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* ignore */ }
  let current = newer(cached, window.MSK_OVERRIDES);

  const stable = (o) => JSON.stringify(norm(o));
  const D = window.MSK_DECK = Object.assign({ KEY, REG, RAR, FIELDS, base, apply, norm, stable }, apply(current));
  D.overrides = current;

  // store a new published version locally (used by the editor right after publishing)
  D.store = (ov) => { current = norm(ov); D.overrides = current; try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) { /* quota */ } };

  // fetch the published overrides; calls onChange(ov) only if strictly newer than what we have
  D.fetchRemote = () => fetch(`data/overrides.json?ts=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  D.refresh = (onChange) => D.fetchRemote().then((j) => {
    if (j && norm(j).updated > current.updated) { D.store(j); if (onChange) onChange(current); }
  });
})();
