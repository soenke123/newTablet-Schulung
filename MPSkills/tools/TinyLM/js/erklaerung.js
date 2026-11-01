/* Erklärfenster für die Reiter (ersetzt die frühere Tour je Phase; Sönke 01.11.2026: „Nicht als
   Tour, sondern dass man immer einmal das hat … nur die Reiter da rechts und da unten“).

   Öffnet man einen Reiter (Karte rechts oder breite Karte unten) zum ERSTEN Mal, legt sich ein
   kleines Fenster neben die Karte: Bild, Titel, zwei, drei Sätze „was du hier findest“ und ein
   „Probier mal“. Der Rest der Seite ist leicht abgedunkelt, die Karte ausgespart. „Alles klar“,
   Tipp daneben oder Esc schließt es. Das ? an der Karte zeigt dasselbe Fenster jederzeit wieder.
   Texte: HELP in help.js (title, icon, cat, vis, text, try).

   Gemerkt wird je Phase und Reiter (`<phase>:<id>`), bei der Lehrkraft (und allein geöffnet) im
   localStorage, bei der Klasse im sessionStorage: ein Klassensatz-Tablet wechselt die Person.
   Im Schaufenster (?demo=1) öffnet es sich nie von selbst. */
const Explain = (() => {
  const DEMO = /[?&]demo=1(&|$)/.test(location.search);
  const GAP = 14, EDGE = 8, PAD = 5;

  function role() { return typeof App !== 'undefined' ? App : {}; }
  function store() {
    try { return role().STUDENT ? window.sessionStorage : window.localStorage; } catch (e) { return null; }
  }
  const KEY = () => 'tinylm-erklaert-' + (role().TEACHER ? 'lehrer' : role().STUDENT ? 'schueler' : 'allein');
  let seen = null;
  function loadSeen() {
    if (seen) return seen;
    try { seen = JSON.parse((store() && store().getItem(KEY())) || '{}') || {}; } catch (e) { seen = {}; }
    return seen;
  }
  function markSeen(k) {
    loadSeen()[k] = 1;
    try { store().setItem(KEY(), JSON.stringify(seen)); } catch (e) { /* ohne Speicher */ }
  }
  const isSeen = (phase, id) => !!loadSeen()[phase + ':' + id];

  let shield = null, spot = null, pop = null, target = null, watch = 0, onDone = null;

  function build() {
    if (pop) return;
    shield = el('div', 'ex-shield');
    spot = el('div', 'ex-spot');
    pop = el('div', 'ex-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'false');
    shield.hidden = spot.hidden = pop.hidden = true;
    document.body.append(shield, spot, pop);
    shield.addEventListener('click', () => close());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop && !pop.hidden) close(); });
    window.addEventListener('resize', () => { if (pop && !pop.hidden) place(); });
    window.addEventListener('scroll', () => { if (pop && !pop.hidden) place(); }, { passive: true });
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* Karte ins Bild holen — ohne scrollIntoView (das scrollte auch die MPSkills-Seite um den Rahmen). */
  function bringIntoView() {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const headH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head-h')) || 0;
    const room = window.innerHeight - headH;
    if (r.top >= headH + 8 && r.bottom <= window.innerHeight - 8) return;
    if (r.top >= headH + 8 && r.height > room) return;
    const y = window.scrollY + r.top - headH - Math.max(12, (room - r.height) / 3);
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
  }

  function place() {
    if (!pop || pop.hidden) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    if (!target || !target.isConnected || !target.getClientRects().length) {
      spot.hidden = true;
      pop.dataset.side = 'none';
      pop.style.left = Math.round((vw - w) / 2) + 'px';
      pop.style.top = Math.round((vh - h) / 2) + 'px';
      return;
    }
    const b = target.getBoundingClientRect();
    const r = { left: b.left - PAD, top: b.top - PAD, right: b.right + PAD, bottom: b.bottom + PAD };
    const s = { left: Math.max(r.left, 2), top: Math.max(r.top, 2), right: Math.min(r.right, vw - 2), bottom: Math.min(r.bottom, vh - 2) };
    spot.hidden = s.bottom <= s.top;
    spot.style.left = s.left + 'px';
    spot.style.top = s.top + 'px';
    spot.style.width = Math.max(0, s.right - s.left) + 'px';
    spot.style.height = Math.max(0, s.bottom - s.top) + 'px';

    const cx = (s.left + s.right) / 2, cy = (s.top + s.bottom) / 2;
    const fits = {
      left: s.left - GAP - w >= EDGE,
      right: s.right + GAP + w <= vw - EDGE,
      bottom: s.bottom + GAP + h <= vh - EDGE,
      top: s.top - GAP - h >= EDGE
    };
    let side = ['left', 'right', 'bottom', 'top'].find(o => fits[o]) || 'none';
    let x, y;
    if (side === 'none') {
      /* Handy / sehr hohe Karte: unten am Bildschirm über die Karte legen. */
      x = clamp((vw - w) / 2, EDGE, vw - w - EDGE);
      y = vh - h - EDGE;
    } else if (side === 'left' || side === 'right') {
      x = side === 'left' ? s.left - GAP - w : s.right + GAP;
      y = clamp(Math.min(cy - h / 2, s.top + 40), EDGE, vh - h - EDGE);
      pop.style.setProperty('--arrow', clamp(Math.min(cy, s.top + 28) - y, 18, h - 18) + 'px');
    } else {
      x = clamp(cx - w / 2, EDGE, vw - w - EDGE);
      y = clamp(side === 'bottom' ? s.bottom + GAP : s.top - GAP - h, EDGE, vh - h - EDGE);
      pop.style.setProperty('--arrow', clamp(cx - x, 18, w - 18) + 'px');
    }
    pop.dataset.side = side;
    pop.style.left = Math.round(x) + 'px';
    pop.style.top = Math.round(y) + 'px';
  }

  /* Das Fenster zu HELP[key] neben `card` zeigen. */
  function show(key, card, done) {
    const h = typeof HELP !== 'undefined' && HELP[key];
    if (!h) return;
    close(true);
    build();
    target = card || null;
    onDone = done || null;
    const c = h.cat && typeof CAT !== 'undefined' && CAT[h.cat];
    [pop, spot].forEach(x => x.style.setProperty('--tc', c ? c.color : 'var(--accent)'));
    pop.style.setProperty('--tt', c ? c.tint : 'var(--accent-dim)');
    pop.setAttribute('aria-label', h.title);
    pop.replaceChildren();

    const head = el('div', 'ex-head');
    head.append(el('span', 'ex-ico', h.icon || '💡'), el('h3', null, h.title));
    pop.appendChild(head);
    if (h.vis) {
      const pic = el('div', 'ex-pic');
      pic.appendChild(Help.vis(h.vis, h.cat));
      pop.appendChild(pic);
    }
    (Array.isArray(h.text) ? h.text : [h.text]).forEach(t => { if (t) pop.appendChild(el('p', 'ex-txt', t)); });
    if (h.try) {
      const tr = el('p', 'ex-try');
      tr.append(el('b', null, 'Probier mal: '), document.createTextNode(h.try));
      pop.appendChild(tr);
    }
    const foot = el('div', 'ex-foot');
    const ok = el('button', 'btn primary sm', 'Alles klar');
    ok.type = 'button';
    ok.addEventListener('click', () => close());
    foot.appendChild(ok);
    pop.appendChild(foot);

    pop.hidden = shield.hidden = false;
    place();
    requestAnimationFrame(() => { bringIntoView(); place(); });
    clearInterval(watch);
    watch = setInterval(place, 400);     /* Karten wachsen noch (Text, Wortkarte …) */
    ok.focus({ preventScroll: true });
  }

  function close(silent) {
    clearInterval(watch);
    if (pop) pop.hidden = shield.hidden = spot.hidden = true;
    target = null;
    const d = onDone;
    onDone = null;
    if (d && !silent) d();
  }

  /* Ein Reiter wurde von Hand geöffnet: beim ersten Mal das Fenster. */
  function firstOpen(phase, id, key, card, done) {
    if (DEMO || !key) return false;
    const k = phase + ':' + id;
    if (loadSeen()[k]) return false;
    markSeen(k);
    /* Erst zeigen, wenn die Karte aufgeklappt und gezeichnet ist. */
    requestAnimationFrame(() => show(key, card, done));
    return true;
  }

  return { show, close, firstOpen, isSeen, reset: () => { seen = {}; try { store().removeItem(KEY()); } catch (e) { /* egal */ } } };
})();
