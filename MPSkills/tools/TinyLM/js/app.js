/* App-Shell: klebende Kopfzeile (Marke, Phasen-Reiter mit Leitfaden-Fortschritt, Textwelten-Knopf,
   darunter der Leitfaden), Drawer-Rendering, Phasen-Hosting. */
const $ = id => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* Phasen registrieren sich selbst (phase1.js/phase2.js/phase3.js rufen Phases.register(...) auf,
   sobald sie geladen sind). mount(host) läuft genau EINMAL je Phase und gibt eine kleine
   Schnittstelle zurück: { reveal(kartenId), onShow(), onHide() }. Beim Wechsel wird die Phase nur
   versteckt, nicht abgebaut — so bleiben geschriebener Text, Frage und vor allem das trainierte
   Netz erhalten, und onHide() hält laufende Schleifen an (vorher liefen sie unsichtbar weiter). */
const Phases = (() => {
  const mods = {};
  function register(n, mod) { mods[n] = mod; }
  function get(n) { return mods[n]; }
  return { register, get };
})();

const App = (() => {
  const PHASE_META = {
    1: { label: 'Frei schreiben', icon: '✍️' },
    2: { label: 'Frage & Antwort', icon: '💬' },
    3: { label: 'Echtes Netz', icon: '🧠' }
  };
  const PHASE_STORE = 'tinylm-phase';
  const panes = {};      /* n -> { el, api } */
  let active = 1;
  let tabs = {};

  function savedPhase() {
    try { const n = parseInt(localStorage.getItem(PHASE_STORE), 10); return [1, 2, 3].includes(n) ? n : 1; }
    catch (e) { return 1; }
  }

  /* Im MPSkills-Rahmen dieselbe Hell/Dunkel-Wahl wie die Seite drumherum (data-theme am <html>).
     Allein geöffnet greift prefers-color-scheme aus tokens.css. */
  function syncTheme() {
    let pd = null;
    try { pd = window.parent !== window ? window.parent.document.documentElement : null; } catch (e) { pd = null; }
    if (!pd) return;
    const apply = () => {
      const t = pd.getAttribute('data-theme');
      if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
      else document.documentElement.removeAttribute('data-theme');
    };
    apply();
    try { new MutationObserver(apply).observe(pd, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* egal */ }
  }

  function updateTabs() {
    [1, 2, 3].forEach(n => {
      const t = tabs[n];
      if (!t) return;
      const p = Guide.progress(n);
      t.btn.classList.toggle('active', n === active);
      t.btn.setAttribute('aria-selected', n === active ? 'true' : 'false');
      t.prog.textContent = p.done >= p.total ? '✓' : p.done + '/' + p.total;
      t.prog.classList.toggle('full', p.done >= p.total);
    });
  }

  function renderShell() {
    syncTheme();
    const root = $('app-root');
    root.replaceChildren();

    const head = el('header', 'shell');
    const topbar = el('div', 'topbar');
    const brand = el('div', 'brand');
    const logo = el('span', 'brand-logo');
    logo.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 3.8h13.6a2.2 2.2 0 0 1 2.2 2.2v8.4a2.2 2.2 0 0 1-2.2 2.2H10l-4.2 3.6v-3.6h-.6A2.2 2.2 0 0 1 3 14.4V6a2.2 2.2 0 0 1 2.2-2.2z"/><path d="M6.8 8.2h4.2M13 8.2h4.2M6.8 12.2h3.4"/><rect x="12.4" y="10.6" width="4.8" height="3.2" rx=".8"/></svg>';
    const name = el('span', 'brand-name');
    name.append(el('b', null, 'Tiny LM'), el('span', 'beta', 'Beta'));
    brand.append(logo, name);
    topbar.appendChild(brand);

    const phasesNav = el('nav', 'phases');
    phasesNav.setAttribute('role', 'tablist');
    phasesNav.setAttribute('aria-label', 'Phasen');
    tabs = {};
    [1, 2, 3].forEach(n => {
      const b = el('button', 'phase-btn');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      const lab = el('span', 'phase-lab');
      lab.append(el('span', 'phase-kicker', 'Phase ' + n), el('span', 'phase-name', PHASE_META[n].label));
      const prog = el('span', 'phase-prog');
      b.append(el('span', 'n', String(n)), lab, prog);
      b.addEventListener('click', () => goPhase(n));
      phasesNav.appendChild(b);
      tabs[n] = { btn: b, prog };
    });
    topbar.appendChild(phasesNav);

    const corpusBtn = el('button', 'btn corpus-btn');
    corpusBtn.type = 'button';
    corpusBtn.dataset.spot = 'textwelten';
    const count = el('span', 'count', String(State.activeTexts().length));
    corpusBtn.append(el('span', 'corpus-ico', '📚'), el('span', 'corpus-lab', 'Textwelten'), count);
    corpusBtn.addEventListener('click', toggleDrawer);
    topbar.appendChild(corpusBtn);
    head.appendChild(topbar);

    const guide = el('div', 'guide');
    guide.setAttribute('aria-live', 'polite');
    head.appendChild(guide);
    root.appendChild(head);

    const backdrop = el('div', 'drawer-backdrop');
    backdrop.id = 'drawerBackdrop';
    backdrop.addEventListener('click', closeDrawer);
    root.appendChild(backdrop);

    const drawer = el('div', 'drawer');
    drawer.id = 'drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Textwelten');
    root.appendChild(drawer);
    renderDrawer();

    const main = el('main', 'main');
    main.id = 'phaseHost';
    root.appendChild(main);

    /* Höhe der klebenden Kopfzeile als Variable — die Zentrum-Karte klebt direkt darunter. */
    const measure = () => document.documentElement.style.setProperty('--head-h',
      (getComputedStyle(head).position === 'sticky' ? head.offsetHeight : 0) + 'px');
    measure();
    if (window.ResizeObserver) new ResizeObserver(measure).observe(head);

    Guide.mount(guide);
    Guide.onChange(updateTabs);

    goPhase(savedPhase(), true);

    State.on('corpus-changed', () => {
      count.textContent = String(State.activeTexts().length);
      /* Nicht neu zeichnen, solange jemand in einem Text-Editor tippt — sonst wäre das Getippte weg. */
      if (!openEditors.size) renderDrawer();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('drawer').classList.contains('open')) closeDrawer(); });
  }

  function goPhase(n, initial) {
    if (!initial && n === active && panes[n]) return;
    Help.close();
    if (panes[active] && panes[active].api && panes[active].api.onHide && (n !== active)) panes[active].api.onHide();
    Object.values(panes).forEach(p => { p.el.hidden = true; });
    active = n;
    try { localStorage.setItem(PHASE_STORE, String(n)); } catch (e) { /* egal */ }
    State.setActivePhase(n);
    if (!panes[n]) {
      const pane = el('section', 'phase-pane');
      pane.dataset.phase = String(n);
      $('phaseHost').appendChild(pane);
      const mod = Phases.get(n);
      const api = mod && mod.mount ? (mod.mount(pane) || {}) : {};
      panes[n] = { el: pane, api };
    } else {
      panes[n].el.hidden = false;
      if (panes[n].api.onShow) panes[n].api.onShow();
    }
    Guide.setPhase(n);
    updateTabs();
    if (!initial) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* Leitfaden "Zeig mir wo": Karte aufklappen, hinscrollen, Stelle kurz pulsieren lassen. */
  function spotlight(spot, card) {
    Help.close();
    const p = panes[active];
    if (card && p && p.api.reveal) p.api.reveal(card);
    requestAnimationFrame(() => {
      const scope = spot === 'textwelten' ? document : (p ? p.el : document);
      const t = scope.querySelector('[data-spot="' + spot + '"]') ||
                (spot.startsWith('help-') ? scope.querySelector('[data-help="' + spot.slice(5) + '"]') : null) ||
                (card ? scope.querySelector('[data-card="' + card + '"]') : null);
      if (!t) return;
      const r = t.getBoundingClientRect();
      const headH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head-h')) || 0;
      if (r.top < headH + 10 || r.bottom > window.innerHeight - 10) {
        window.scrollTo({ top: window.scrollY + r.top - headH - Math.max(40, (window.innerHeight - headH - r.height) / 2),
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
      t.classList.remove('spot');
      void t.offsetWidth;
      t.classList.add('spot');
      setTimeout(() => t.classList.remove('spot'), 3200);
    });
  }

  function toggleDrawer() {
    const open = $('drawer').classList.toggle('open');
    $('drawerBackdrop').classList.toggle('open', open);
    if (open) Guide.did('drawer');
  }
  function closeDrawer() {
    $('drawer').classList.remove('open');
    $('drawerBackdrop').classList.remove('open');
  }

  /* Welche Text-Editoren im Drawer gerade offen sind (nur UI-Zustand, nichts Gespeichertes). */
  const openEditors = new Set();

  /* Text lesen + bearbeiten: Titel, voller Text, Speichern, Original wiederherstellen, Entfernen. */
  function buildEditor(t) {
    const box = el('div', 'text-edit');
    const titleIn = el('input', 'textin');
    titleIn.type = 'text'; titleIn.value = t.title; titleIn.setAttribute('aria-label', 'Titel');
    box.appendChild(titleIn);

    const ta = el('textarea');
    ta.value = t.body;
    ta.setAttribute('aria-label', 'Text von „' + t.title + '“');
    ta.rows = Math.min(14, Math.max(5, Math.ceil(t.body.length / 70) + 1));
    box.appendChild(ta);

    const count = el('p', 'own-msg');
    const words = s => s.trim().split(/\s+/).filter(Boolean).length;
    const setCount = () => { count.textContent = words(ta.value) + ' Wörter'; };
    setCount();
    ta.addEventListener('input', setCount);

    const btns = el('div', 'text-edit-btns');
    const save = el('button', 'btn primary', 'Speichern');
    save.type = 'button';
    save.addEventListener('click', () => {
      if (words(ta.value) < 8) { count.textContent = 'Zu kurz — schreib mindestens ein, zwei ganze Sätze.'; return; }
      State.updateText(t.id, { title: titleIn.value.trim() || t.title, body: ta.value.trim() });
      openEditors.delete(t.id);
      renderDrawer();
    });
    btns.appendChild(save);

    const cancel = el('button', 'btn', 'Abbrechen');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { openEditors.delete(t.id); renderDrawer(); });
    btns.appendChild(cancel);

    if (t.edited) {
      const reset = el('button', 'btn', 'Original wiederherstellen');
      reset.type = 'button';
      reset.addEventListener('click', () => { State.resetText(t.id); renderDrawer(); });
      btns.appendChild(reset);
    }
    if (t.own) {
      const del = el('button', 'own-del', 'Text entfernen');
      del.type = 'button';
      del.addEventListener('click', () => { openEditors.delete(t.id); State.removeOwnText(t.id); renderDrawer(); });
      btns.appendChild(del);
    }
    box.append(btns, count);
    return box;
  }

  function renderDrawer() {
    const drawer = $('drawer');
    if (!drawer) return;
    drawer.replaceChildren();
    const inner = el('div', 'drawer-inner');
    const head = el('div', 'drawer-head');
    const h = el('div', 'drawer-title');
    h.appendChild(el('span', 'drawer-ico', '📚'));
    const ht = el('div');
    ht.appendChild(el('h2', null, 'Was soll die KI lernen?'));
    ht.appendChild(el('p', null, 'Haken setzen = dieser Text füttert die KI. Gilt für alle drei Phasen.'));
    h.append(ht, Help.btn('textwelten'));
    head.appendChild(h);
    const closeBtn = el('button', 'btn', 'Fertig');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', closeDrawer);
    head.appendChild(closeBtn);
    inner.appendChild(head);

    const texts = Corpus.allTexts();
    const grid = el('div', 'world-grid');
    THEME_ORDER.forEach(themeId => {
      const items = texts.filter(t => (t.own ? 'eigen' : t.theme) === themeId);
      if (!items.length) return;
      const world = el('div', 'world');
      const wh = el('div', 'world-head');
      const title = el('div', 'world-title');
      const dot = el('i', 'dot'); dot.style.background = 'var(--t-' + themeId + ')';
      title.append(dot, document.createTextNode(THEME_NAME[themeId] + ' (' + items.length + ')'));
      wh.appendChild(title);
      const allOn = items.every(t => State.selectedIds.has(t.id));
      const toggle = el('button', 'world-toggle', allOn ? 'alle abwählen' : 'alle auswählen');
      toggle.type = 'button';
      toggle.addEventListener('click', () => State.setWorld(themeId, !allOn));
      wh.appendChild(toggle);
      world.appendChild(wh);

      items.forEach(t => {
        const wrap = el('div', 'text-item');
        const row = el('div', 'text-row');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = State.selectedIds.has(t.id);
        const cid = 'txt-' + t.id.replace(':', '-');
        cb.id = cid;
        cb.addEventListener('change', () => State.toggleText(t.id, cb.checked));
        const label = el('label', null, t.title);
        label.htmlFor = cid;
        if (t.own) label.appendChild(el('span', 'text-tag', 'eigener Text'));
        if (t.edited) label.appendChild(el('span', 'text-tag edited', 'bearbeitet'));
        const openBtn = el('button', 'text-open', openEditors.has(t.id) ? 'zu' : 'lesen');
        openBtn.type = 'button';
        openBtn.setAttribute('aria-expanded', openEditors.has(t.id) ? 'true' : 'false');
        row.append(cb, label, openBtn);
        wrap.appendChild(row);
        if (openEditors.has(t.id)) wrap.appendChild(buildEditor(t));
        openBtn.addEventListener('click', () => {
          if (openEditors.has(t.id)) openEditors.delete(t.id); else openEditors.add(t.id);
          renderDrawer();
        });
        world.appendChild(wrap);
      });
      grid.appendChild(world);
    });
    inner.appendChild(grid);

    const form = el('form', 'own-form');
    form.appendChild(el('h3', null, 'Eigenen Text hinzufügen'));
    const row = el('div', 'row');
    const title = el('input'); title.type = 'text'; title.placeholder = 'Titel, z. B. „Bello im Weltall“';
    const sel = el('select');
    THEME_ORDER.forEach(t => {
      const o = el('option', null, t === 'eigen' ? 'Eigenes Thema' : THEME_NAME[t]);
      o.value = t;
      if (t === 'eigen') o.selected = true;
      sel.appendChild(o);
    });
    row.append(title, sel);
    const ta = el('textarea');
    ta.placeholder = 'Ein paar ganze Sätze auf Deutsch …';
    const msg = el('span', 'own-msg');
    const submit = el('button', 'btn primary', 'Hinzufügen');
    submit.type = 'submit';
    form.append(row, ta, submit, msg);
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (ta.value.trim().split(/\s+/).filter(Boolean).length < 8) {
        msg.textContent = 'Der Text ist zu kurz. Schreib mindestens ein, zwei ganze Sätze.';
        return;
      }
      State.addOwnText({ title: title.value.trim() || 'Eigener Text', body: ta.value.trim(), theme: sel.value });
      title.value = ''; ta.value = '';
      msg.textContent = 'Hinzugefügt und ausgewählt.';
      renderDrawer();
    });
    inner.appendChild(form);

    drawer.appendChild(inner);
  }

  return { renderShell, goPhase, spotlight, get activePhase() { return active; } };
})();
