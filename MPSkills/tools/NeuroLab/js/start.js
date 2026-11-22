/* ══════════════════════════════════════════════════════════════
   NeuroLab · start.js — Startseite, Freigaben, Navigation
   ══════════════════════════════════════════════════════════════
   Drei Bereiche (Übersicht neu 21.11.2026):
     neuron      Wie funktioniert ein Neuron?   EINE Kachel n-wie, darauf der Knopf
                 „Alle Neuronen“ (n-typen wird immer mit n-wie geteilt)
     bauen       Vom Neuron zum Netz            v-revier (Wildkatzen, js/revier.js) ·
                 v-rechnen (Netz durchrechnen, js/rechnen.js) · b-frei (freies Feld)
     trainieren  Netze trainieren               EIN Knopf; die Szenarien sc-* wählt man
                 im Modus (#scen-picker), dort teilt die Lehrkraft sie auch einzeln
   Das Feld selbst ist das NeuroLab von vorher (app.js), es bekommt nur
   den Bereich gesagt: NLApp.enterArea('bauen' | 'lernen', szenario).
   Ansichten (html[data-view]): home · neuron · netz (Revier/Rechnen) · lab.

   Im Raum (?raum=lehrer|schueler) entscheidet die Lehrkraft, was die Klasse
   öffnen darf: skill_room_state.data.parts = Bereichs- + Kachel-ids. Eine
   Kachel ist offen, wenn Bereich UND Kachel geteilt sind. Fehlt parts: nur
   „Wie funktioniert ein Neuron?“. Botschaften mit tool.js:
     hinein  { type: 'nl:cmd', parts }   heraus  { type: 'nl:ready' } · { type: 'nl:parts', parts }
   Ohne Raum (allein) und im Schaufenster (?demo=1) ist alles offen.
   ⚠️ ids nie umbenennen — sie stehen in laufenden Räumen.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const ROOM = Q.get('raum') === 'lehrer' || Q.get('raum') === 'schueler' ? Q.get('raum') : null;
  const TEACHER = ROOM === 'lehrer', STUDENT = ROOM === 'schueler';
  const DEMO = Q.has('demo');
  const App = window.NLApp;

  const ICON = {
    neuron: '<svg viewBox="0 0 64 40"><circle cx="10" cy="10" r="6"/><circle cx="10" cy="30" r="6"/><path d="M16 11 L28 18 M16 29 L28 22"/><rect x="28" y="11" width="22" height="18" rx="9"/><path d="M50 20 H60"/></svg>',
    bauen: '<svg viewBox="0 0 64 40"><circle cx="8" cy="12" r="5"/><circle cx="8" cy="28" r="5"/><rect x="26" y="5" width="12" height="10" rx="4"/><rect x="26" y="25" width="12" height="10" rx="4"/><rect x="48" y="15" width="12" height="10" rx="4"/><path d="M13 12 L26 10 M13 12 L26 30 M13 28 L26 10 M13 28 L26 30 M38 10 L48 20 M38 30 L48 20"/></svg>',
    trainieren: '<svg viewBox="0 0 64 40"><path d="M4 6 V36 H60"/><path d="M8 10 C18 12 20 28 30 30 S50 33 58 33" class="hl"/></svg>',
    'v-revier': '<svg viewBox="0 0 64 40"><path d="M4 30 L60 14" class="hl"/><path d="M4 8 L40 36" /><rect x="40" y="4" width="14" height="10" rx="2"/><circle cx="47" cy="9" r="2.5" class="fill"/><rect x="10" y="22" width="12" height="9" rx="2"/></svg>',
    frei: '<svg viewBox="0 0 64 40"><circle cx="8" cy="12" r="5"/><circle cx="8" cy="28" r="5"/><rect x="28" y="14" width="12" height="10" rx="4"/><rect x="48" y="14" width="12" height="10" rx="4"/><path d="M13 12 L28 17 M13 28 L28 21 M40 19 H48"/><text x="26" y="8" font-size="8" font-weight="800" stroke="none" fill="currentColor">CSV</text></svg>',
    'v-rechnen': '<svg viewBox="0 0 64 40"><rect x="4" y="6" width="14" height="8" rx="3"/><rect x="4" y="26" width="14" height="8" rx="3"/><path d="M18 10 L30 20 M18 30 L30 20"/><rect x="30" y="12" width="16" height="16" rx="5"/><path d="M46 20 H52"/><text x="56" y="25" font-size="13" font-weight="800" stroke="none" fill="currentColor">=</text></svg>',
  };
  const SC_ICON = {
    gates: '<b class="t-big">&amp; ≥1 ⊕</b>',
    seg7: '<svg viewBox="0 0 30 46"><path class="hl" d="M7 4 H23 M25 6 V21 M25 25 V40 M7 42 H23 M5 25 V40 M5 6 V21 M7 23 H23"/></svg>',
    zielscheibe: '<svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="20"/><circle cx="23" cy="23" r="12"/><circle cx="23" cy="23" r="4" class="fill"/></svg>',
    voegel: '<svg viewBox="0 0 60 40"><path class="hl" d="M4 22 C14 10 22 12 30 20 C38 12 46 10 56 22 C46 18 38 20 30 28 C22 20 14 18 4 22 Z"/></svg>',
  };
  const SC_TEXT = {
    gates: 'AND, OR, NOT A und XOR gleichzeitig lernen – XOR geht nicht mit einer Schicht.',
    seg7: 'Welche Ziffer zeigt die 7-Segment-Anzeige? Sieben Eingänge, eine Zahl als Ausgabe.',
    zielscheibe: 'Wo trifft der Pfeil? Aus (x, y) die Punkte vorhersagen – 1500 Würfe.',
    voegel: '180 echte Greifvögel: Aus Flügel und Gewicht die Art erkennen.',
  };

  const AREAS = [
    { id: 'neuron', title: 'Wie funktioniert ein Neuron?', text: 'Was in einem Neuron passiert – und welche Neuronen es gibt.',
      items: [
        { id: 'n-wie', title: 'Wie arbeitet ein Neuron?', text: 'Ein Neuron Stück für Stück aufdecken: Eingänge, Gewichte, Bias, Aktivierung – bis es Punkte trennt.' },
        // ohne eigene Kachel: Knopf auf n-wie, wird immer mit n-wie geteilt
        { id: 'n-typen', title: 'Alle Neuronen', text: 'Perceptron, Linear, ReLU, Sigmoid und Tanh im Überblick.', with: 'n-wie' },
      ] },
    { id: 'bauen', title: 'Vom Neuron zum Netz', text: 'Aus Geraden wird ein Netz – und am Ende baust du frei.',
      items: [
        { id: 'v-revier', title: 'Wildkatzen', text: 'Wildtierkameras im Tal: Jede Grenze ist ein Neuron – rechne die Geraden aus und schließ sie zu einem Netz zusammen.' },
        { id: 'b-frei', title: 'Frei', text: 'Alles selbst: Schichten und Neuronen setzen, eigene CSV-Tabelle hineinladen und das Netz lernen lassen.' },
      ] },
    { id: 'trainieren', title: 'Lernen', text: 'Das Netz findet die Gewichte selbst. Das Szenario wählst du im Modus.',
      items: App.scenarios().filter(e => e.key !== 'custom').map(e => ({ id: e.id, key: e.key, title: e.name, text: SC_TEXT[e.key] || '' })) },
  ];
  const ALL_PARTS = AREAS.flatMap(a => [a.id, ...a.items.map(i => i.id)]);
  /* Startseite = vier Kacheln: Neuronen · Wildkatzen · Lernen · Frei */
  const HOME = [
    { id: 'n-wie', area: 'neuron', title: 'Neuronen', text: 'Ein Neuron Stück für Stück aufdecken – und alle Neuronen im Überblick.', art: 'neuron' },
    { id: 'v-revier', area: 'bauen', title: 'Wildkatzen', text: 'Wildtierkameras im Tal: Aus Geraden wird ein Netz – erst rechnen, dann sehen.', art: 'v-revier' },
    { id: 'trainieren', area: 'trainieren', title: 'Lernen', text: 'Szenario wählen, Schichten dazwischen bauen – und zusehen, wie das Netz lernt.', art: 'trainieren' },
    { id: 'b-frei', area: 'bauen', title: 'Frei', text: 'Komplett frei bauen und eine eigene CSV-Tabelle hineinladen.', art: 'frei' },
  ];
  const DEFAULT_PARTS = ['neuron', 'n-wie', 'n-typen'];

  /* ── Freigaben ───────────────────────────────────────────── */
  let parts = ROOM ? null : ALL_PARTS.slice();
  const areaOf = id => AREAS.find(a => a.id === id || a.items.some(i => i.id === id));
  const shared = id => !!parts && parts.includes(id);
  function usable(id) {
    if (id === 'n-typen') id = 'n-wie';            // „Alle Neuronen“ hängt an „Wie arbeitet ein Neuron?“
    if (!STUDENT || DEMO) return true;
    const a = areaOf(id);
    return !!a && shared(a.id) && (id === a.id || shared(id));
  }
  const tileOn = t => usable(t.id) && (!parts || (t.id === 'trainieren' ? shared('trainieren') : shared(t.id) && shared(t.area)));
  function sendUp(m) { if (window.parent === window) return; try { window.parent.postMessage(m, location.origin); } catch (e) { /* zu */ } }
  function setParts(list, fromServer) {
    parts = (list || []).filter(x => ALL_PARTS.includes(x));
    if (!fromServer) sendUp({ type: 'nl:parts', parts });
    if (!booted) { boot(); return; }
    // Schüler: Teil entzogen, während man drin ist → Übersicht
    if (STUDENT && where.id && !usable(where.id)) goHome();
    else if (where.view === 'home') renderHome();
    else if (where.view === 'neuron') renderNeuron();
    else if (where.view === 'lab' && where.area === 'lernen' && where.id === 'b-frei') App.render();
    else if (where.view === 'lab' && where.area === 'lernen') {
      App.render();
      if (!$('scen-picker').hidden || (STUDENT && where.sc && !usable(where.sc))) showPicker();
    }  // Szenario-Auswahl neu
  }
  function toggleShare(id) {
    if (!TEACHER || !parts) return;
    const a = AREAS.find(x => x.id === id);
    let next;
    const ids = id === 'n-wie' ? ['n-wie', 'n-typen'] : [id];
    const ht = HOME.find(t => t.id === id && t.id !== 'trainieren');
    if (ht) {   // Kachel der Startseite: Teil + sein Bereich zusammen
      next = shared(id) ? parts.filter(x => !ids.includes(x)) : parts.concat(ids.concat(ht.area).filter(x => !parts.includes(x)));
      setParts(next, false); return;
    }
    if (shared(id)) next = parts.filter(x => !ids.includes(x));
    else if (a && !a.items.some(i => shared(i.id))) next = parts.concat(id, a.items.map(i => i.id));
    else next = parts.concat(ids.filter(x => !parts.includes(x)));
    setParts(next, false);
  }

  /* ── Speicher für „wo war ich“ ───────────────────────────── */
  const mem = {};
  const store = {
    get(k) { if (DEMO) return mem[k] ?? null; try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { if (DEMO) { mem[k] = v; return; } try { localStorage.setItem(k, v); } catch (e) { /* egal */ } },
  };
  let where = { view: 'home' };
  function saveWhere() { if (where.viewing) return; store.set('nl.where', JSON.stringify(where)); }

  const SHARE_SVG = '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>';
  const LOCK_SVG = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── Ansichten ───────────────────────────────────────────── */
  function setView(v, title) {
    document.documentElement.dataset.view = v;
    $('area-title').textContent = title || '';
    $('btn-print').hidden = STUDENT;
    $('btn-scen').hidden = v !== 'lab' || !where || where.area !== 'lernen' || where.id === 'b-frei';
    if (v !== 'lab') document.body.className = DEMO ? 'demo-mode' : '';
  }

  function renderHome() {
    const box = $('areas');
    const visible = HOME.filter(t => !STUDENT || DEMO || usable(t.id) && (t.id !== 'trainieren' || AREAS[2].items.some(i => usable(i.id))));
    $('wait').hidden = visible.length > 0;
    box.innerHTML = '<div class="tiles tiles-four">' + visible.map(t => {
      const ok = usable(t.id) && (t.id !== 'trainieren' || AREAS[2].items.some(i => usable(i.id)));
      const on = TEACHER && shared(t.id) && (t.id === 'trainieren' || shared(t.area));
      const share = TEACHER ? `<button class="share${on ? ' on' : ''}" data-share="${t.id}" title="${on ? 'Geteilt – antippen zum Entziehen' : 'Mit der Klasse teilen'}">${SHARE_SVG}<span>${on ? 'Geteilt' : 'Teilen'}</span></button>` : '';
      const sub = t.id === 'n-wie' ? `<span class="tile-subs"><button type="button" class="tile-sub" data-open="n-typen"${ok ? '' : ' disabled'}>Alle Neuronen ›</button></span>` : '';
      const note = TEACHER && t.id === 'trainieren' ? `<span class="tile-note">${AREAS[2].items.filter(i => shared(i.id)).length} von ${AREAS[2].items.length} Szenarien geteilt – einzeln teilen im Modus</span>` : '';
      return `<div class="tile area-${t.area}${ok ? '' : ' locked'}" data-id="${t.id}" role="button" tabindex="0">
        <div class="tile-art">${ICON[t.art] || ''}</div>
        <div class="tile-body"><b>${esc(t.title)}</b><span>${esc(t.text)}</span>${note}${sub}</div>
        ${ok ? '' : `<span class="lock">${LOCK_SVG}</span>`}${share}
      </div>`;
    }).join('') + '</div>';
    box.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); toggleShare(b.dataset.share); }));
    box.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); open(b.dataset.open); }));
    box.querySelectorAll('.tile').forEach(t => {
      const go = () => open(t.dataset.id);
      t.addEventListener('click', go);
      t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  /* Szenario-Wahl im Modus „Netze trainieren“ (#scen-picker) */
  function renderPicker() {
    const box = $('scen-picker'), a = AREAS[2], cur = App.state.learn && App.state.learn.scenario;
    const tiles = a.items.map(it => {
      const ok = usable(it.id);
      const share = TEACHER ? `<button class="share${shared(it.id) ? ' on' : ''}" data-share="${it.id}">${SHARE_SVG}<span>${shared(it.id) ? 'Geteilt' : 'Teilen'}</span></button>` : '';
      return `<div class="tile${ok ? '' : ' locked'}${it.key === cur ? ' current' : ''}" data-id="${it.id}" role="button" tabindex="0">
        <div class="tile-art">${SC_ICON[it.key] || ''}</div>
        <div class="tile-body"><b>${esc(it.title)}</b><span>${esc(it.text)}</span>${it.key === cur ? '<span class="tile-note">gerade offen</span>' : ''}</div>
        ${ok ? '' : `<span class="lock">${LOCK_SVG}</span>`}${share}</div>`;
    }).join('');
    box.innerHTML = `<div class="scen-card area-trainieren" role="dialog" aria-label="Szenario wählen">
      <div class="scen-head"><div><h2>Welches Szenario?</h2><p>Das Szenario legt Eingänge und Ausgänge fest. Was dazwischen liegt, baust du selbst.</p></div>
      ${cur ? '<button type="button" class="nn-btn scen-close" title="Schließen">×</button>' : ''}</div>
      <div class="tiles">${tiles}</div></div>`;
    box.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); toggleShare(b.dataset.share); }));
    box.querySelectorAll('.tile').forEach(t => {
      const go = () => {
        if (!usable(t.dataset.id)) return;
        const it = a.items.find(i => i.id === t.dataset.id);
        box.hidden = true;
        // Jedes Szenario hat sein eigenes gemerktes Netz: Feld verlassen, das andere betreten
        if (it.key !== cur) { App.leaveArea(); App.enterArea('lernen', it.key); }
        where.sc = it.id; saveWhere();
      };
      t.addEventListener('click', go);
      t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    const cl = box.querySelector('.scen-close');
    if (cl) cl.addEventListener('click', () => { box.hidden = true; });
  }
  function showPicker() { $('scen-picker').hidden = false; renderPicker(); }
  $('btn-scen').addEventListener('click', showPicker);

  function open(id, restore) {
    if (!usable(id)) return;
    const a = areaOf(id);
    if (!a) return;
    $('scen-picker').hidden = true;
    if (a.id === 'neuron') { where = { view: 'neuron', id }; renderNeuron(); }
    else if (id === 'v-revier') { where = { view: 'netz', id }; renderNetz(); }
    else if (id === 'b-frei') { where = { view: 'lab', area: 'lernen', id, sc: 'sc-eigene' }; setView('lab', 'Frei'); App.enterArea('lernen', 'custom'); }
    else if (a.id === 'bauen') return;
    else {
      // Kachel „Netze trainieren“ (id = Bereich) oder direkt ein Szenario
      let it = a.items.find(i => i.id === id);
      const last = a.items.find(i => i.id === (restore && restore.sc));
      if (!it && last && usable(last.id)) it = last;
      where = { view: 'lab', area: 'lernen', id: a.id, sc: it ? it.id : null };
      setView('lab', a.title);
      App.enterArea('lernen', it && it.key);
      // vom Übersichts-Knopf aus: erst das Szenario wählen
      if (id === a.id && !restore) showPicker();
    }
    saveWhere();
  }

  function renderNetz() {
    setView('netz', 'Wildkatzen');
    const pg = $('netz-page');
    window.NLRevier.render(pg, {});
    pg.scrollTop = 0;
  }

  function renderNeuron() {
    setView('neuron', AREAS[0].title);
    const tabs = AREAS[0].items.filter(i => usable(i.id));
    if (!tabs.some(t => t.id === where.id)) where.id = tabs[0] && tabs[0].id;
    window.NLNeuron.render($('neuron-page'), {
      tabs, current: where.id,
      go: id => { where.id = id; saveWhere(); renderNeuron(); },
    });
  }

  function goHome() {
    $('scen-picker').hidden = true;
    if (where.view === 'lab') App.leaveArea();
    where = { view: 'home' };
    saveWhere();
    setView('home');
    renderHome();
    $('home').scrollTop = 0;
  }
  $('btn-home').addEventListener('click', goHome);

  /* ── Senden an die Lehrkraft + Eingang ───────────────────────
     Der Rahmen (tool.js) leitet nur die vier nl_*-Aufrufe an den Raum
     weiter: { type: 'nl:rpc', id, fn, args } ↔ { type: 'nl:rpc:res', id, res }. */
  const HASROOM = !!ROOM && !DEMO && window.parent !== window;
  const rpcWait = {};
  let rpcId = 0;
  function rpc(fn, args) {
    return new Promise(resolve => {
      const id = ++rpcId;
      rpcWait[id] = resolve;
      sendUp({ type: 'nl:rpc', id, fn, args });
      setTimeout(() => { if (rpcWait[id]) { delete rpcWait[id]; resolve({ ok: false, error: 'network' }); } }, 15000);
    });
  }
  const scName = key => key === 'custom' ? 'Frei' : ((App.scenarios().find(e => e.key === key) || {}).name || key);
  const ERR = { network: 'Keine Verbindung.', payload_too_big: 'Das Netz ist zu groß zum Senden.', quota_exceeded: 'Der Eingang ist voll.',
    room_gone: 'Der Raum ist beendet.', blocked: 'Du bist gesperrt.' };

  // Schüler: Knopf „An Lehrkraft senden“
  const canSend = () => STUDENT && HASROOM && !!App.state.learn.scenario;
  let sendTimer = 0;
  $('btn-send').addEventListener('click', async () => {
    const b = $('btn-send'), key = App.state.learn.scenario;
    if (!key || b.disabled) return;
    b.disabled = true; b.textContent = 'Sende …';
    const r = await rpc('nl_send', { p_scenario: key, p_payload: App.exportNet() });
    b.disabled = false;
    b.textContent = r && r.ok ? 'Gesendet ✓' : (ERR[r && r.error] || 'Senden hat nicht geklappt');
    b.classList.toggle('is-sent', !!(r && r.ok));
    clearTimeout(sendTimer);
    sendTimer = setTimeout(() => { b.textContent = 'An Lehrkraft senden'; b.classList.remove('is-sent'); }, 3500);
  });

  // Lehrkraft: Eingang
  let inbox = [], inboxOpen = false;
  async function loadInbox() {
    const r = await rpc('nl_inbox_list', {});
    if (r && r.ok) { inbox = r.items || []; paintInboxBadge(); if (inboxOpen) paintInbox(); }
  }
  function paintInboxBadge() {
    const n = $('inbox-n');
    n.textContent = inbox.length; n.hidden = !inbox.length;
  }
  function paintInbox() {
    const box = $('inbox');
    const rows = inbox.map(i => `<div class="ib-row" data-id="${i.id}">
        <div class="ib-who"><b>${esc(i.from || 'ohne Namen')}</b><span>${esc(scName(i.scenario))} · ${esc(i.at)}</span></div>
        <button type="button" class="ib-show" data-show="${i.id}">Zeigen</button>
        <button type="button" class="ib-del" data-del="${i.id}" title="Nur aus deiner Liste löschen">Löschen</button>
      </div>`).join('');
    box.innerHTML = `<div class="ib-card" role="dialog" aria-label="Eingang">
      <div class="ib-head"><div><h2>Eingang</h2><p>Netze, die Schüler gesendet haben. Löschen entfernt sie nur aus dieser Liste.</p></div>
        <button type="button" class="nn-btn ib-close" title="Schließen">×</button></div>
      <div class="ib-list">${rows || '<p class="ib-empty">Noch nichts angekommen.</p>'}</div></div>`;
    box.querySelector('.ib-close').addEventListener('click', closeInbox);
    box.addEventListener('click', e => { if (e.target === box) closeInbox(); });
    box.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => showSent(+b.dataset.show)));
    box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      await rpc('nl_inbox_delete', { p_id: +b.dataset.del });
      await loadInbox();
    }));
  }
  function closeInbox() { inboxOpen = false; $('inbox').hidden = true; }
  async function showSent(id) {
    const r = await rpc('nl_inbox_get', { p_id: id });
    if (!r || !r.ok) return;
    closeInbox();
    const key = r.scenario;
    App.openShared(key, r.payload);
    where = { view: 'lab', area: 'lernen', id: key === 'custom' ? 'b-frei' : 'trainieren', sc: null, viewing: true };
    setView('lab', `${r.from || 'Schüler'} · ${scName(key)}`);
    $('btn-scen').hidden = true;
    App.render();
  }
  if (TEACHER && HASROOM) {
    $('btn-inbox').hidden = false;
    $('btn-inbox').addEventListener('click', () => { inboxOpen = true; $('inbox').hidden = false; paintInbox(); loadInbox(); });
    loadInbox();
    setInterval(() => { if (!document.hidden) loadInbox(); }, 6000);
  }
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== window.parent || !e.data || e.data.type !== 'nl:rpc:res') return;
    const f = rpcWait[e.data.id];
    if (f) { delete rpcWait[e.data.id]; f(e.data.res); }
  });

  /* ── Start ───────────────────────────────────────────────── */
  let booted = false;
  function boot() {
    booted = true;
    let w = null;
    try { w = JSON.parse(store.get('nl.where') || 'null'); } catch (e) { /* egal */ }
    if (w && w.id && usable(w.id)) open(w.id, w);
    else { setView('home'); renderHome(); }
  }

  /* Hell/Dunkel gewechselt: was mit Canvas gezeichnet ist, neu zeichnen
     (SVG und CSS folgen von selbst, js/theme.js). */
  window.addEventListener('nl:theme-redraw', () => {
    if (!booted) return;
    if (where.view === 'neuron') renderNeuron();
    else if (where.view === 'netz') renderNetz();
    else if (where.view === 'lab') App.render();
  });

  window.NLStart = { usable, goHome, open, canSend, get parts() { return parts; } };

  setView('home');
  if (STUDENT) renderHome();            // erst einmal leer, bis die Freigaben da sind
  if (!ROOM) boot();
  else {
    window.addEventListener('message', e => {
      if (e.origin !== location.origin || e.source !== window.parent || !e.data || e.data.type !== 'nl:cmd') return;
      setParts(Array.isArray(e.data.parts) ? e.data.parts.map(String) : DEFAULT_PARTS.slice(), true);
    });
    sendUp({ type: 'nl:ready' });
    // Lehrkraft ohne Antwort (z. B. allein getestet): nach kurzer Zeit trotzdem starten
    if (TEACHER) setTimeout(() => { if (!booted) { parts = DEFAULT_PARTS.slice(); boot(); } }, 1500);
  }
})();
