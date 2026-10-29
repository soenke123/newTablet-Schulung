/* App-Shell: klebende Kopfzeile (Marke, Phasen-Reiter, Freigaben, Textwelten-Knopf, ? = Tour),
   Drawer-Rendering, Phasen-Hosting.

   Im MPSkills-Raum bekommt die Seite ?raum=lehrer bzw. ?raum=schueler (tool.js ist die Gegenseite):
     hinein   { type: 'tl:cmd', phases: [1, 2] }   welche Phasen die Klasse benutzen darf
     heraus   { type: 'tl:ready' }                 Seite steht
              { type: 'tl:phases', phases: [...] } Lehrkraft hat die Freigaben geändert
   Die Lehrkraft sieht immer alle Phasen und schaltet sie für die Klasse frei; Schüler sehen gesperrte
   Phasen mit Schloss. Allein geöffnet (ohne ?raum=) und im Schaufenster ist alles offen. */
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
  const ROOM = (() => { const r = new URLSearchParams(location.search).get('raum'); return r === 'lehrer' || r === 'schueler' ? r : null; })();
  const TEACHER = ROOM === 'lehrer';
  const STUDENT = ROOM === 'schueler';
  /* Für die Klasse freigegebene Phasen. Schüler warten auf die erste Nachricht aus tool.js
     (bis dahin null = noch nicht bekannt). */
  let classPhases = ROOM ? null : [1, 2, 3];
  let lockBtn = null, lockPop = null, waitEl = null;
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

  const isOpenForClass = n => !!classPhases && classPhases.includes(n);
  /* Darf diese Person die Phase gerade öffnen? */
  const usable = n => !STUDENT || isOpenForClass(n);

  function updateTabs() {
    [1, 2, 3].forEach(n => {
      const t = tabs[n];
      if (!t) return;
      const locked = !usable(n);
      t.btn.classList.toggle('active', n === active);
      t.btn.classList.toggle('locked', locked);
      t.btn.disabled = locked;
      t.btn.setAttribute('aria-selected', n === active ? 'true' : 'false');
      /* Schloss: Schüler = gesperrt, Lehrkraft = noch nicht für die Klasse frei. */
      const showLock = ROOM && !isOpenForClass(n) && classPhases;
      t.lock.hidden = !showLock;
      t.btn.title = !showLock ? '' : (TEACHER ? 'Für die Klasse noch gesperrt' : 'Deine Lehrkraft hat diese Phase noch nicht freigegeben');
    });
    if (lockBtn) lockBtn.querySelector('.count').textContent = (classPhases || []).length + '/3';
  }

  /* ---- Freigaben (nur Lehrkraft im Raum) ---- */
  function sendUp(msg) {
    if (window.parent === window) return;
    try { window.parent.postMessage(msg, location.origin); } catch (e) { /* Rahmen weg */ }
  }
  function setClassPhases(list, fromServer) {
    classPhases = [1, 2, 3].filter(n => list.includes(n));
    if (!fromServer) sendUp({ type: 'tl:phases', phases: classPhases });
    updateTabs();
    if (lockPop) paintLockPop();
    if (STUDENT) {
      if (!classPhases.length) { showWait(true); return; }
      showWait(false);
      if (active == null || !classPhases.includes(active)) {
        const saved = savedPhase();
        goPhase(classPhases.includes(saved) ? saved : classPhases[0], active == null);
      }
    }
  }
  function paintLockPop() {
    lockPop.replaceChildren();
    lockPop.appendChild(el('b', 'lock-title', 'Für die Klasse freigeben'));
    [1, 2, 3].forEach(n => {
      const row = el('label', 'lock-row');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = isOpenForClass(n);
      cb.addEventListener('change', () => {
        const next = (classPhases || []).filter(x => x !== n);
        if (cb.checked) next.push(n);
        setClassPhases(next, false);
      });
      const lab = el('span', 'lock-lab');
      lab.append(el('span', 'n', String(n)), el('span', null, PHASE_META[n].label));
      row.append(lab, cb);
      lockPop.appendChild(row);
    });
    lockPop.appendChild(el('p', 'lock-note', 'Du selbst siehst immer alle Phasen.'));
  }
  function toggleLockPop() {
    if (lockPop) { closeLockPop(); return; }
    lockPop = el('div', 'lock-pop');
    lockPop.setAttribute('role', 'dialog');
    lockPop.setAttribute('aria-label', 'Phasen freigeben');
    paintLockPop();
    document.body.appendChild(lockPop);
    /* Fest unter dem Knopf, aber nie über den Rand (auf dem Handy steht der Knopf links). */
    const r = lockBtn.getBoundingClientRect(), w = lockPop.offsetWidth;
    lockPop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    lockPop.style.top = (r.bottom + 8) + 'px';
    lockBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
      document.addEventListener('pointerdown', onLockDoc, true);
      window.addEventListener('resize', closeLockPop);
      window.addEventListener('scroll', closeLockPop, { passive: true });
    }, 0);
  }
  function closeLockPop() {
    if (!lockPop) return;
    lockPop.remove();
    lockPop = null;
    lockBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onLockDoc, true);
    window.removeEventListener('resize', closeLockPop);
    window.removeEventListener('scroll', closeLockPop);
  }
  function onLockDoc(e) {
    if (lockPop && !lockPop.contains(e.target) && !lockBtn.contains(e.target)) closeLockPop();
  }

  /* Schüler: noch keine Phase frei (oder alle wieder gesperrt). */
  function showWait(on) {
    if (on) {
      if (active != null && panes[active] && panes[active].api.onHide) panes[active].api.onHide();
      Object.values(panes).forEach(p => { p.el.hidden = true; });
      active = null;
      if (!waitEl) {
        waitEl = el('div', 'box wait-card');
        waitEl.append(el('span', 'wait-ico', '🔒'), el('h2', null, 'Gleich geht’s los'),
          el('p', null, classPhases ? 'Deine Lehrkraft hat noch keine Phase freigegeben.' : 'Einen Moment …'));
        $('phaseHost').appendChild(waitEl);
      } else waitEl.querySelector('p').textContent = classPhases ? 'Deine Lehrkraft hat noch keine Phase freigegeben.' : 'Einen Moment …';
      waitEl.hidden = false;
      updateTabs();
    } else if (waitEl) waitEl.hidden = true;
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
      const lock = el('span', 'phase-lock', '🔒');
      lock.hidden = true;
      lock.setAttribute('aria-label', 'gesperrt');
      b.append(el('span', 'n', String(n)), lab, lock);
      b.addEventListener('click', () => { if (usable(n)) goPhase(n); });
      phasesNav.appendChild(b);
      tabs[n] = { btn: b, lock };
    });
    topbar.appendChild(phasesNav);

    const tools = el('div', 'top-tools');
    if (TEACHER) {
      lockBtn = el('button', 'btn lock-btn');
      lockBtn.type = 'button';
      lockBtn.setAttribute('aria-haspopup', 'dialog');
      lockBtn.setAttribute('aria-expanded', 'false');
      lockBtn.append(el('span', 'corpus-ico', '🔓'), el('span', 'corpus-lab', 'Freigaben'), el('span', 'count', '–'));
      lockBtn.addEventListener('click', toggleLockPop);
      tools.appendChild(lockBtn);
    }

    const corpusBtn = el('button', 'btn corpus-btn');
    corpusBtn.type = 'button';
    corpusBtn.dataset.spot = 'textwelten';
    const count = el('span', 'count', String(State.activeTexts().length));
    corpusBtn.append(el('span', 'corpus-ico', '📚'), el('span', 'corpus-lab', 'Textwelten'), count);
    corpusBtn.addEventListener('click', toggleDrawer);
    tools.appendChild(corpusBtn);
    const tourBtn = el('button', 'help-btn tour-btn', '?');
    tourBtn.type = 'button';
    tourBtn.title = 'Tour zu dieser Phase zeigen';
    tourBtn.setAttribute('aria-label', 'Tour zu dieser Phase zeigen');
    tourBtn.addEventListener('click', () => { if (active != null) Tour.replay(active); });
    tools.appendChild(tourBtn);
    topbar.appendChild(tools);
    head.appendChild(topbar);
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

    if (STUDENT) showWait(true);
    else goPhase(savedPhase(), true);

    if (ROOM) {
      window.addEventListener('message', e => {
        if (e.origin !== location.origin || e.source !== window.parent || !e.data || e.data.type !== 'tl:cmd') return;
        if (Array.isArray(e.data.phases)) setClassPhases(e.data.phases.map(Number), true);
      });
      sendUp({ type: 'tl:ready' });
    }

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
    Tour.stop(false);
    if (active != null && panes[active] && panes[active].api && panes[active].api.onHide && (n !== active)) panes[active].api.onHide();
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
    updateTabs();
    if (!initial) window.scrollTo({ top: 0, behavior: 'auto' });
    Tour.forPhase(n);
  }

  /* Für die Tour: Karte der aktiven Phase aufklappen, ohne hinzuspringen. */
  function revealCard(id) {
    const p = panes[active];
    if (p && p.api.reveal) p.api.reveal(id);
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
  /* Welcher Reiter in „Textwelten“ offen ist (pro Gerät gemerkt). */
  const TAB_STORE = 'tinylm-textwelt-reiter';
  let drawerTab = (() => {
    try { const t = localStorage.getItem(TAB_STORE); if (THEME_ORDER.includes(t)) return t; } catch (e) { /* egal */ }
    return THEME_ORDER[0];
  })();

  /* Wort-Unterschied zwischen Original und geänderter Fassung (LCS über Wörter).
     Liefert [{w, op}] mit op = 'same' | 'add' | 'del'. */
  function wordDiff(a, b) {
    const A = a.split(/\s+/).filter(Boolean), B = b.split(/\s+/).filter(Boolean);
    const n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push({ w: B[j], op: 'same' }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) out.push({ w: A[i++], op: 'del' });
      else out.push({ w: B[j++], op: 'add' });
    }
    while (i < n) out.push({ w: A[i++], op: 'del' });
    while (j < m) out.push({ w: B[j++], op: 'add' });
    return out;
  }

  /* Text eines Kärtchens: bei geänderten mitgelieferten Texten mit markierten Änderungen. */
  function textBody(t) {
    const p = el('p', 'tw-body');
    const orig = t.edited ? Corpus.originalOf(t.id) : null;
    if (!orig) { p.textContent = t.body; return p; }
    /* Gleiche Art hintereinander zu einem Stück zusammenfassen, sonst flackert jede Lücke. */
    const runs = [];
    wordDiff(orig.body, t.body).forEach(d => {
      const last = runs[runs.length - 1];
      if (last && last.op === d.op) last.w += ' ' + d.w; else runs.push({ op: d.op, w: d.w });
    });
    runs.forEach((r, k) => {
      if (k) p.appendChild(document.createTextNode(' '));
      if (r.op === 'same') p.appendChild(document.createTextNode(r.w));
      else p.appendChild(el(r.op === 'add' ? 'mark' : 'del', 'tw-chg', r.w));
    });
    return p;
  }

  /* Text bearbeiten: Titel, voller Text, Speichern/Abbrechen (Entfernen bei eigenen Texten). */
  function buildEditor(t) {
    const box = el('div', 'text-edit');
    const titleIn = el('input', 'textin');
    titleIn.type = 'text'; titleIn.value = t.title; titleIn.setAttribute('aria-label', 'Titel');
    box.appendChild(titleIn);

    const ta = el('textarea');
    ta.value = t.body;
    ta.setAttribute('aria-label', 'Text von „' + t.title + '“');
    ta.rows = Math.min(14, Math.max(5, Math.ceil(t.body.length / 45) + 1));
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

    if (t.own) {
      const del = el('button', 'own-del', 'Text entfernen');
      del.type = 'button';
      del.addEventListener('click', () => { openEditors.delete(t.id); State.removeOwnText(t.id); renderDrawer(); });
      btns.appendChild(del);
    }
    box.append(btns, count);
    return box;
  }

  /* Ein Text als Kärtchen: Haken (drin/raus), Titel, Zurücksetzen, Bearbeiten, ganzer Text. */
  function textCard(t) {
    const on = State.selectedIds.has(t.id);
    const card = el('article', 'tw-card' + (on ? '' : ' off') + (t.edited ? ' edited' : ''));
    const head = el('div', 'tw-card-head');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = on;
    const cid = 'txt-' + t.id.replace(':', '-');
    cb.id = cid;
    cb.addEventListener('change', () => {
      card.classList.toggle('off', !cb.checked);
      State.toggleText(t.id, cb.checked);
    });
    const label = el('label', 'tw-title');
    label.htmlFor = cid;
    const orig = t.edited ? Corpus.originalOf(t.id) : null;
    label.appendChild(orig && orig.title !== t.title ? el('mark', 'tw-chg', t.title) : document.createTextNode(t.title));
    head.append(cb, label);
    card.appendChild(head);
    const tools = el('div', 'tw-tools');
    if (t.edited) tools.appendChild(el('span', 'tw-badge', 'verändert'));
    if (t.edited) {
      const reset = el('button', 'tw-btn tw-reset', '↺ Zurücksetzen');
      reset.type = 'button';
      reset.title = 'Originaltext wiederherstellen';
      reset.addEventListener('click', () => { State.resetText(t.id); renderDrawer(); });
      tools.appendChild(reset);
    }
    if (!openEditors.has(t.id)) {
      const edit = el('button', 'tw-btn', '✎ Bearbeiten');
      edit.type = 'button';
      edit.addEventListener('click', () => { openEditors.add(t.id); renderDrawer(); });
      tools.appendChild(edit);
    }
    card.appendChild(tools);
    card.appendChild(openEditors.has(t.id) ? buildEditor(t) : textBody(t));
    return card;
  }

  function ownForm() {
    const form = el('form', 'own-form');
    form.appendChild(el('h3', null, 'Eigenen Text hinzufügen'));
    const title = el('input', 'textin'); title.type = 'text'; title.placeholder = 'Titel, z. B. „Bello im Weltall“';
    const ta = el('textarea');
    ta.placeholder = 'Ein paar ganze Sätze auf Deutsch …';
    const msg = el('span', 'own-msg');
    const submit = el('button', 'btn primary', 'Hinzufügen');
    submit.type = 'submit';
    form.append(title, ta, submit, msg);
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (ta.value.trim().split(/\s+/).filter(Boolean).length < 8) {
        msg.textContent = 'Der Text ist zu kurz. Schreib mindestens ein, zwei ganze Sätze.';
        return;
      }
      State.addOwnText({ title: title.value.trim() || 'Eigener Text', body: ta.value.trim(), theme: 'eigen' });
      renderDrawer();
    });
    return form;
  }

  /* „Textwelten“: oben ein Reiter je Welt (Schalter für die ganze Welt + x/y), darunter alle Texte
     der gewählten Welt ausgeklappt nebeneinander. */
  function renderDrawer() {
    const drawer = $('drawer');
    if (!drawer) return;
    const keepScroll = drawer.scrollTop;
    drawer.replaceChildren();
    const inner = el('div', 'drawer-inner');
    const head = el('div', 'drawer-head');
    const h = el('div', 'drawer-title');
    h.appendChild(el('span', 'drawer-ico', '📚'));
    const ht = el('div');
    ht.appendChild(el('h2', null, 'Was soll die KI lernen?'));
    ht.appendChild(el('p', null, 'Haken = dieser Text füttert die KI. Gilt für alle drei Phasen.'));
    h.append(ht, Help.btn('textwelten'));
    head.appendChild(h);
    const closeBtn = el('button', 'btn', 'Fertig');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', closeDrawer);
    head.appendChild(closeBtn);
    inner.appendChild(head);

    const texts = Corpus.allTexts();
    const ofTheme = id => texts.filter(t => (t.own ? 'eigen' : t.theme) === id);

    const tabs = el('div', 'tw-tabs');
    tabs.setAttribute('role', 'tablist');
    THEME_ORDER.forEach(themeId => {
      const items = ofTheme(themeId);
      const nOn = items.filter(t => State.selectedIds.has(t.id)).length;
      const tab = el('div', 'tw-tab' + (themeId === drawerTab ? ' active' : '') + (items.length && !nOn ? ' off' : ''));
      tab.style.setProperty('--tc', 'var(--t-' + themeId + ')');
      const pick = el('button', 'tw-tab-pick');
      pick.type = 'button';
      pick.setAttribute('role', 'tab');
      pick.setAttribute('aria-selected', themeId === drawerTab ? 'true' : 'false');
      pick.append(el('span', 'tw-tab-name', THEME_NAME[themeId]), el('span', 'tw-tab-count', nOn + '/' + items.length));
      pick.addEventListener('click', () => {
        drawerTab = themeId;
        try { localStorage.setItem(TAB_STORE, themeId); } catch (e) { /* egal */ }
        renderDrawer();
      });
      tab.appendChild(pick);
      if (items.length) {
        const sw = el('input', 'tw-switch');
        sw.type = 'checkbox';
        sw.checked = nOn > 0;
        sw.indeterminate = nOn > 0 && nOn < items.length;
        sw.setAttribute('aria-label', THEME_NAME[themeId] + (nOn ? ' ganz abwählen' : ' ganz auswählen'));
        sw.title = nOn ? 'ganze Welt abwählen' : 'ganze Welt auswählen';
        sw.addEventListener('change', () => State.setWorld(themeId, nOn === 0));
        tab.appendChild(sw);
      }
      tabs.appendChild(tab);
    });
    inner.appendChild(tabs);

    const items = ofTheme(drawerTab);
    const grid = el('div', 'tw-grid');
    grid.style.setProperty('--tc', 'var(--t-' + drawerTab + ')');
    items.forEach(t => grid.appendChild(textCard(t)));
    if (!items.length) grid.appendChild(el('p', 'card-empty', drawerTab === 'eigen'
      ? 'Noch keine eigenen Texte. Schreib unten einen!' : 'Keine Texte.'));
    inner.appendChild(grid);
    if (drawerTab === 'eigen') inner.appendChild(ownForm());

    drawer.appendChild(inner);
    drawer.scrollTop = keepScroll;
  }

  return { renderShell, goPhase, revealCard, ROOM, TEACHER, STUDENT,
    get activePhase() { return active; }, get classPhases() { return classPhases; } };
})();
