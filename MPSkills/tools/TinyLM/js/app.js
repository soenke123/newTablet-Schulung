/* App-Shell: Kopfzeile (Phasen-Umschalter + Textauswahl-Drawer-Button), Drawer-Rendering, Phasen-Hosting. */
const $ = id => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* Phasen registrieren sich selbst (phase1.js/phase2.js/phase3.js rufen Phases.register(...) auf,
   sobald sie geladen sind). So kann app.js schon stehen, bevor die Phasen-Module existieren. */
const Phases = (() => {
  const mods = {};
  function register(n, mod) { mods[n] = mod; if (State.activePhase === n) App.renderActivePhase(); }
  function get(n) { return mods[n]; }
  return { register, get };
})();

const App = (() => {
  const PHASE_META = {
    1: { label: 'Frei schreiben' },
    2: { label: 'Frage & Antwort' },
    3: { label: 'Echtes Netz' }
  };

  function renderShell() {
    const root = $('app-root');
    root.replaceChildren();

    const topbar = el('header', 'topbar');
    const brand = el('div', 'brand');
    brand.append(el('b', null, 'Wortwelten'), el('span', null, 'Ein Mini-Sprachmodell zum Aufschrauben'));
    topbar.appendChild(brand);

    const phasesNav = el('nav', 'phases');
    [1, 2, 3].forEach(n => {
      const b = el('button', 'phase-btn' + (State.activePhase === n ? ' active' : ''));
      b.type = 'button';
      b.append(el('span', 'n', String(n)), document.createTextNode(PHASE_META[n].label));
      b.addEventListener('click', () => { State.setActivePhase(n); renderShell(); });
      phasesNav.appendChild(b);
    });
    topbar.appendChild(phasesNav);

    const corpusBtn = el('button', 'btn corpus-btn');
    corpusBtn.type = 'button';
    const count = el('span', 'count', String(State.activeTexts().length) + ' Texte');
    corpusBtn.append(document.createTextNode('📚 Textwelten'), count);
    corpusBtn.addEventListener('click', toggleDrawer);
    topbar.appendChild(corpusBtn);

    root.appendChild(topbar);

    const backdrop = el('div', 'drawer-backdrop');
    backdrop.id = 'drawerBackdrop';
    backdrop.addEventListener('click', closeDrawer);
    root.appendChild(backdrop);

    const drawer = el('div', 'drawer');
    drawer.id = 'drawer';
    root.appendChild(drawer);
    renderDrawer();

    const main = el('main', 'main');
    main.id = 'phaseHost';
    root.appendChild(main);
    renderActivePhase();

    State.on('corpus-changed', () => {
      count.textContent = State.activeTexts().length + ' Texte';
      /* Nicht neu zeichnen, solange jemand in einem Text-Editor tippt — sonst wäre das Getippte weg. */
      if (!openEditors.size) renderDrawer();
    });
  }

  function renderActivePhase() {
    const host = $('phaseHost');
    if (!host) return;
    host.replaceChildren();
    const mod = Phases.get(State.activePhase);
    if (mod && mod.mount) { mod.mount(host); return; }
    const ph = el('div', 'box');
    ph.style.maxWidth = '40ch';
    ph.style.margin = '60px auto';
    ph.style.textAlign = 'center';
    ph.appendChild(el('p', 'muted', 'Diese Phase wird noch gebaut …'));
    host.appendChild(ph);
  }

  function toggleDrawer() {
    const open = $('drawer').classList.toggle('open');
    $('drawerBackdrop').classList.toggle('open', open);
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
    const h = el('div');
    h.appendChild(el('h2', null, 'Was soll die KI lernen?'));
    h.appendChild(el('p', null, 'Wähl aus, welche Texte gerade "die KI füttern". Du kannst Wortwelten frei mischen, jeden Text lesen und bearbeiten und eigene ergänzen — alle drei Phasen nutzen dieselbe Auswahl.'));
    head.appendChild(h);
    const closeBtn = el('button', 'btn', 'Schließen');
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
        const openBtn = el('button', 'text-open', 'lesen & bearbeiten');
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

  return { renderShell, renderActivePhase };
})();
