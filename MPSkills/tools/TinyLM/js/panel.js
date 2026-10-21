/* Rechte Erklär-Liste ("Leuchtende Kategorien") — ersetzt das verworfene Orbit-Muster.
   Alle drei Phasen haben dieselben vier Schritte an derselben Stelle, mit derselben Nummer und
   derselben Farbfamilie — so findet man sich in jeder neuen Phase sofort wieder:
     ① worauf schaut die KI?   Türkis-Familie   context = Kontextfenster (P1)
                                                ask     = Frage zerlegen (P2)
                                                embed   = Embedding (P3: das Kontextfenster als Zahlen)
     ② woher nimmt sie es?     Bernstein-Fam.   origin  = Quellen (P1, P2)
                                                hidden  = Hidden-Schicht (P3: keine Texte mehr, nur Zahlen)
     ③ candidates = Kandidaten (alle Phasen)    ④ random = Zufall (alle Phasen)
   Was zu keinem der vier Schritte gehört, hat eine eigene Farbe ohne Nummer:
     meaning = Wortkarte (P2) · train = Training (P3, läuft neben dem Schreiben)
     net     = Netz-Bild, bewusst neutral-graphit: diese Karte zeigt ALLE Schichten auf einmal, und
               darin tragen die Schichten weiter ihre eigenen Farben (embed/hidden/candidates).
   Das Ablauf-Band (flow.js) nutzt dieselben Namen und Farben wie die Karten.

   Jede Karte ist EINZELN auf- und zuklappbar (Tipp auf den Kopf); der Zustand wird je Phase in
   localStorage gemerkt. Erklärt wird NICHT auf der Karte, sondern hinter dem ?-Knopf im Kopf
   (help.js) — auf der Karte steht nur, was die Maschine gerade tut.
   Geschlossene Karten werden nicht gerendert (spart Arbeit beim Training in Phase 3) und
   rendern sich beim Aufklappen nach. Jede render()-Funktion zeigt selbst einen Platzhalter,
   solange es noch nichts zu erklären gibt.

   Item-Felder: { id, label, cat, hint, help (Schlüssel in HELP), render(container),
                  open:   false -> standardmäßig zugeklappt,
                  wide:   true  -> breite Karte unter dem Zweispalter (z. B. die Wortkarte),
                  onClose: fn   -> wird beim Zuklappen aufgerufen (z. B. Training anhalten),
                  manual: true  -> von refreshAll() ausgenommen (teure Inhalte wie Canvas-Karten;
                                   die Phase ruft dafür gezielt refresh(id) auf) } */
const CAT = {
  origin: { color: 'var(--cat-origin)', tint: 'var(--cat-origin-tint)' },
  context: { color: 'var(--cat-context)', tint: 'var(--cat-context-tint)' },
  candidates: { color: 'var(--cat-candidates)', tint: 'var(--cat-candidates-tint)' },
  random: { color: 'var(--cat-random)', tint: 'var(--cat-random-tint)' },
  ask: { color: 'var(--cat-ask)', tint: 'var(--cat-ask-tint)' },
  embed: { color: 'var(--cat-embed)', tint: 'var(--cat-embed-tint)' },
  hidden: { color: 'var(--cat-hidden)', tint: 'var(--cat-hidden-tint)' },
  meaning: { color: 'var(--cat-meaning)', tint: 'var(--cat-meaning-tint)' },
  train: { color: 'var(--cat-train)', tint: 'var(--cat-train-tint)' },
  net: { color: 'var(--cat-net)', tint: 'var(--cat-net-tint)' }
};

const Panel = (() => {
  const STORE = 'tinylm-panel-offen';
  function loadOpen() {
    try { const v = JSON.parse(localStorage.getItem(STORE) || '{}'); return (v && typeof v === 'object') ? v : {}; }
    catch (e) { return {}; }
  }
  function saveOpen(map) {
    try { localStorage.setItem(STORE, JSON.stringify(map)); } catch (e) { /* ohne Speicher geht es auch */ }
  }
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mount(host, centerEl, items, opts) {
    opts = opts || {};
    const ns = 'p' + (opts.phase != null ? opts.phase : 'x') + ':';
    const openMap = loadOpen();

    const root = el('div', 'panel-wrap' + (opts.phase != null ? ' phase-' + opts.phase : ''));
    const grid = el('div', 'panel');
    const centerWrap = el('div', 'panel-center');
    centerWrap.appendChild(centerEl);

    const side = el('div', 'panel-side');
    const list = el('div', 'panel-list');
    side.appendChild(list);
    grid.append(centerWrap, side);
    const wideList = el('div', 'panel-wide');
    root.append(grid, wideList);
    host.replaceChildren(root);

    const entries = {};
    const order = [];

    function isOpen(item) {
      const v = openMap[ns + item.id];
      return v == null ? (item.open !== false) : !!v;
    }

    function renderBody(e) {
      e.body.replaceChildren();
      const slot = el('div', 'panel-item-slot');
      e.body.appendChild(slot);
      e.slot = slot;
      e.item.render(slot);
      e.rendered = true;
    }

    function apply(e, on) {
      e.open = on;
      openMap[ns + e.item.id] = on;
      e.card.classList.toggle('closed', !on);
      e.head.setAttribute('aria-expanded', on ? 'true' : 'false');
      e.body.hidden = !on;
      if (on && !e.rendered) renderBody(e);
      if (!on) { e.body.replaceChildren(); e.rendered = false; if (e.item.onClose) e.item.onClose(); }
    }

    function setOpen(id, on) {
      const e = entries[id];
      if (!e) return;
      apply(e, on);
      saveOpen(openMap);
      if (on && typeof Guide !== 'undefined') Guide.did('card', { phase: opts.phase, id });
    }
    /* Vom Ablauf-Fließband / Leitfaden aus: Karte aufklappen und hinspringen. */
    function reveal(id, noScroll) {
      const e = entries[id];
      if (!e) return;
      if (!e.open) setOpen(id, true);
      if (!noScroll) e.card.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      e.card.classList.add('flash');
      setTimeout(() => e.card.classList.remove('flash'), 900);
    }

    items.forEach(item => {
      const cat = CAT[item.cat] || CAT.context;
      const card = el('div', 'panel-item' + (item.wide ? ' wide' : ''));
      card.style.setProperty('--cat-color', cat.color);
      card.style.setProperty('--cat-tint', cat.tint);
      card.dataset.card = item.id;

      const head = el('button', 'panel-item-head');
      head.type = 'button';
      head.id = 'ph-' + ns.replace(':', '') + '-' + item.id;
      const chev = el('span', 'panel-chev');
      chev.setAttribute('aria-hidden', 'true');
      if (item.hint) head.appendChild(el('span', 'panel-item-hint', item.hint));
      head.append(el('h3', null, item.label), chev);

      const headRow = el('div', 'panel-item-headrow');
      headRow.appendChild(head);
      if (item.help) headRow.appendChild(Help.btn(item.help));

      const body = el('div', 'panel-item-body');
      body.setAttribute('role', 'region');
      body.setAttribute('aria-labelledby', head.id);
      card.append(headRow, body);
      (item.wide ? wideList : list).appendChild(card);

      const e = { item, card, head, body, rendered: false, open: true };
      entries[item.id] = e;
      order.push(item.id);
      head.addEventListener('click', () => setOpen(item.id, !e.open));
      apply(e, isOpen(item));
    });

    function refresh(id) {
      const e = entries[id];
      if (!e || !e.open) return;
      if (!e.rendered) { renderBody(e); return; }
      e.slot.replaceChildren();
      e.item.render(e.slot);
    }
    /* refreshAll läuft bei jedem erzeugten Wort — teure Karten (manual) bleiben dabei stehen. */
    function refreshAll() { order.forEach(id => { if (!entries[id].item.manual) refresh(id); }); }

    const isCardOpen = id => !!(entries[id] && entries[id].open);
    return { refresh, refreshAll, setOpen, reveal, isOpen: isCardOpen, root };
  }
  return { mount, CAT };
})();
