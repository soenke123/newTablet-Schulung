/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „SYNIR"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Ein Netzwerksimulator im Raum. Die Anwendung selbst liegt
   daneben (index.html + js/) und läuft auch für sich; hier steht
   nur, was der RAUM dazutut.

   ── Warum ein <iframe> wie bei Wild Clusters ──────────────────
   SYNIR sind 28 Skripte mit globalen Namen und ein eigenes
   Stylesheet von 3500 Zeilen. In eine einzige tool.js portiert,
   stünde jede Zeile davon in der MPSkills-Seite — und jeder
   Umbau am Simulator wäre ein Umbau hier. Eingerahmt bleibt der
   Simulator ein Ordner, der auch ohne Raum geht, und diese Datei
   ist die Tür: sie spricht mit dem Server und schickt Befehle in
   den Rahmen (js/bruecke.js ist die Gegenseite).

   ── Was der Raum tut ─────────────────────────────────────────
   · Szenarien: die Lehrkraft gibt frei (skill_room_state.data
     .shared), die Tablets sehen nur das Freigegebene. Mitgelieferte
     tragen „builtin:<schlüssel>" und kommen aus dem Rahmen selbst;
     eigene (synir_scenarios, Migration 0180) hängen an der
     Lehrkraft und überleben den Raum.
   · „Neues Szenario verfügbar" auf dem Tablet, sobald etwas
     dazukommt.
   · Stand der Klasse + Spiegelung auf den Beamer (synir_work):
     jedes Tablet meldet seinen Stand gebremst, die Lehrkraft tippt
     eine Person an und sieht mit. Tut sie selbst etwas, wird es
     ihre Kopie (die Brücke meldet `selbst`).
   · Blind: data.blind legt auf jedem Tablet den Schleier auf, und
     synir_work_put lehnt ab, solange er liegt.

   ⚠️ Wer tool.js oder tool.css anfasst, zieht den Cache-Stempel in
   MPSkills/lib/tool.js hoch — und wer an index.html oder js/
   arbeitet, zusätzlich `V` hier UND die ?v= in index.html.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '?v=20260928a';
  const TAKT_MS = 3000;          // Stand der Klasse / Spiegelung
  const GAP = 12;
  const MIN = 440;

  let root = null, ctx = null, view = null, frame = null;
  let bridgeReady = false;
  let onMsg = null, onResize = null, onFs = null;
  let code = null;

  let eigene = [];               // Lehrkraft: [{ id, titel }]
  let lastMenue = '';
  let lastBlind = null;
  let bekannte = null;           // Tablet: Set der freigegebenen IDs
  let lastErr = '';

  let listOpen = false;
  let work = [];                 // synir_work_list
  let workTimer = 0;
  let watch = null;              // { pid, name, since }
  let takeover = null;           // Name, wenn die Lehrkraft übernommen hat

  const isPresenter = () => !!ctx && ctx.role === 'presenter';
  const $ = (id) => root && root.querySelector('#' + id);

  function data() { return (view && view.state && view.state.data) || {}; }
  function sharedList() {
    const s = data().shared;
    return Array.isArray(s) ? s.filter(x => x && typeof x.id === 'string') : [];
  }

  async function call(fn, args) {
    if (!ctx || ctx.preview) return { ok: false, error: 'preview' };
    return ctx.actions.call(fn, args || {});
  }

  function fehler(res) {
    if (!res || res.ok) return;
    if (res.error === 'network' || res.error === 'preview') return;
    if (res.error === lastErr) return;
    lastErr = res.error;
    setTimeout(() => { if (lastErr === res.error) lastErr = ''; }, 8000);
    ctx.toast(ctx.errText(res.error));
  }

  /* ══════════════════════════════════════════════════════════
     Befehle in den Rahmen
     ══════════════════════════════════════════════════════════ */

  function post(cmd) {
    if (!frame || !frame.contentWindow || !bridgeReady) return;
    cmd.type = 'synir:cmd';
    try { frame.contentWindow.postMessage(cmd, location.origin); } catch (e) { /* zu */ }
  }

  function pushMenue() {
    const list = sharedList();
    const menue = {
      shared: list.map(x => x.id),
      sharedListe: list.map(x => ({ id: x.id, titel: x.t || 'Szenario' }))
    };
    if (isPresenter()) menue.private = eigene;
    const key = JSON.stringify(menue);
    if (key === lastMenue) return;
    lastMenue = key;
    post({ menue });
  }

  function pushBlind() {
    if (isPresenter()) return;
    const b = !!data().blind;
    if (b === lastBlind) return;
    lastBlind = b;
    post({ blind: b });
  }

  function pushAll() {
    lastMenue = '';
    lastBlind = null;
    pushMenue();
    pushBlind();
  }

  /* ══════════════════════════════════════════════════════════
     Raumzustand schreiben (nur Lehrkraft)
     ══════════════════════════════════════════════════════════
     skill_room_set_state ersetzt `data` als GANZES — deshalb geht
     hier immer der vollständige Zustand hinaus, mit der einen
     Änderung darin. Er wird auch gleich lokal eingesetzt: das Menü
     soll im selben Augenblick grün werden, nicht nach dem nächsten
     Takt. */
  async function setData(patch) {
    const next = Object.assign({}, data(), patch);
    if (view) view.state = Object.assign({}, view.state || {}, { data: next });
    pushMenue();
    paintDesk();
    const res = await ctx.actions.setData(next);
    fehler(res);
    ctx.refresh();
    return res;
  }

  async function share(id, an, titel) {
    let list = sharedList().filter(x => x.id !== id);
    if (an) list.push({ id, t: String(titel || 'Szenario').slice(0, 80) });
    await setData({ shared: list });
  }

  async function loadEigene() {
    if (!isPresenter()) return;
    const res = await call('synir_scenarios_list');
    if (!res.ok) { fehler(res); return; }
    eigene = (res.items || []).map(i => ({ id: i.id, titel: i.title }));
    pushMenue();
  }

  async function loeschen(id) {
    const res = await call('synir_scenario_delete', { p_id: id });
    if (!res.ok) { fehler(res); return; }
    eigene = eigene.filter(x => x.id !== id);
    if (sharedList().some(x => x.id === id)) await share(id, false);
    pushMenue();
    post({ toast: 'Szenario gelöscht.' });
  }

  /* Ein Stand als Szenario. Der Aufgabentext hat seine eigene
     Spalte und die Kennung des alten Szenarios gehört nicht
     hinein — beides wird aus dem Netz genommen. Die Überschrift
     des Auftrags (`titel`) bleibt drin: sie ist nicht der Name im
     Menü, sondern der Kopf der Karte. */
  async function alsSzenario(o) {
    const netz = Object.assign({}, o.stand || {});
    delete netz.szenario;
    delete netz.aufgabe;
    netz.titel = o.titel || o.name;
    if (JSON.stringify(netz).length > 280000 && netz.blobs) {
      delete netz.blobs;
      post({ toast: 'Hochgeladene Dateien sind zu groß für ein Szenario und wurden weggelassen.' });
    }
    const res = await call('synir_scenario_save', {
      p_id: o.id || null, p_title: o.name, p_aufgabe: o.aufgabe || '', p_netz: netz
    });
    if (!res.ok) { fehler(res); return; }
    post({ gespeichert: { id: res.id }, toast: 'Gespeichert unter „Eigene": ' + o.name });
    await loadEigene();
    // Ist es schon freigegeben, zieht der Name in der Klasse mit.
    const s = sharedList().find(x => x.id === res.id);
    if (s && s.t !== o.name) await share(res.id, true, o.name);
  }

  /* Ein Szenario, das nicht im Rahmen liegt, vom Server holen. */
  async function holen(id) {
    const res = isPresenter()
      ? await call('synir_scenario_get', { p_id: id })
      : await call('synir_shared_get', { p_id: id });
    if (!res.ok) { fehler(res); return; }
    const netz = res.netz || {};
    post({ laden: { id: res.id, titel: netz.titel || res.title, aufgabe: res.aufgabe || '', netz } });
  }

  /* ══════════════════════════════════════════════════════════
     Stand der Klasse und Spiegelung (nur Lehrkraft)
     ══════════════════════════════════════════════════════════ */

  function takt() {
    clearTimeout(workTimer);
    workTimer = 0;
    if (!isPresenter() || !(listOpen || watch)) return;
    workTimer = setTimeout(async () => {
      await tick();
      takt();
    }, TAKT_MS);
  }

  async function tick() {
    if (listOpen) {
      const res = await call('synir_work_list');
      if (res.ok) { work = res.items || []; paintPeople(); }
    }
    if (watch) await holeWatch();
  }

  async function holeWatch() {
    const w = watch;
    if (!w) return;
    const res = await call('synir_work_get', { p_participant: w.pid, p_since: w.since || null });
    if (watch !== w) return;               // inzwischen beendet
    if (!res.ok) { fehler(res); return; }
    if (!res.changed) return;
    w.since = res.updated_at;
    post({ watch: { name: w.name, stand: res.stand } });
  }

  function zusehen(pid, name) {
    if (watch && watch.pid === pid) { zuseheEnde(); return; }
    watch = { pid, name, since: null };
    takeover = null;
    holeWatch();
    takt();
    paintDesk();
    paintPeople();
  }

  function zuseheEnde() {
    if (watch) post({ watch: null });
    watch = null;
    takeover = null;
    takt();
    paintDesk();
    paintPeople();
  }

  /* ══════════════════════════════════════════════════════════
     Nachrichten aus dem Rahmen
     ══════════════════════════════════════════════════════════ */

  function handle(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.type !== 'synir:event') return;

    switch (m.ev) {
      case 'ready':
        bridgeReady = true;
        pushAll();
        if (isPresenter() && watch) { watch.since = null; holeWatch(); }
        break;
      case 'pick':
        if (isPresenter()) {
          // Eine eigene Wahl beendet das Zusehen — wie bei Wild Clusters.
          if (watch) { watch = null; takt(); }
          takeover = null;
          paintDesk(); paintPeople();
        }
        if (!m.lokal) holen(m.id);
        break;
      case 'share':
        if (isPresenter()) share(m.id, !!m.an, m.titel);
        break;
      case 'loeschen':
        if (isPresenter()) loeschen(m.id);
        break;
      case 'alsSzenario':
        if (isPresenter()) alsSzenario(m);
        break;
      case 'selbst':
        if (isPresenter() && watch) {
          takeover = watch.name;
          watch = null;
          takt();
          paintDesk(); paintPeople();
        }
        break;
      case 'stand':
        if (!isPresenter() && m.stand) {
          call('synir_work_put', { p_stand: m.stand }).then(res => {
            // Blind und stillgelegt sagt die Seite schon selbst.
            if (!res.ok && res.error !== 'blind' && res.error !== 'blocked') fehler(res);
          });
        }
        break;
    }
  }

  /* ══════════════════════════════════════════════════════════
     Das Pult (nur Beamer)
     ══════════════════════════════════════════════════════════ */

  function deskHTML() {
    return `
    <div class="sy-desk" id="syDesk">
      <div class="sy-row">
        <button type="button" class="sy-btn" id="syList" aria-expanded="false">Stand der Klasse</button>
        <span class="sy-note" id="syNote" hidden>
          <span id="syNoteText"></span>
          <button type="button" class="sy-note-x" id="syStop">Beenden</button>
        </span>
        <span class="sy-sp"></span>
        <button type="button" class="sy-btn sy-blind" id="syBlind" aria-pressed="false"
                title="Legt auf jedes Tablet das SYNIR-Logo: „Wir machen jetzt am Beamer weiter.“">Schüler blind</button>
        <button type="button" class="sy-btn sy-ghost" id="syFull" title="Vollbild">⛶</button>
      </div>
      <div class="sy-list" id="syPeople" hidden></div>
    </div>`;
  }

  function paintDesk() {
    if (!isPresenter() || !root) return;
    const blind = !!data().blind;
    const bb = $('syBlind');
    if (bb) {
      bb.setAttribute('aria-pressed', String(blind));
      bb.textContent = blind ? 'Schüler sind blind — aufheben' : 'Schüler blind';
    }
    const lb = $('syList');
    if (lb) lb.setAttribute('aria-expanded', String(listOpen));
    const note = $('syNote');
    if (note) {
      const txt = watch ? 'Ansicht von ' + watch.name
                : takeover ? 'Kopie von ' + takeover + ' — Sie arbeiten selbst'
                : '';
      note.hidden = !txt;
      note.classList.toggle('is-kopie', !watch && !!takeover);
      $('syNoteText').textContent = txt;
      $('syStop').textContent = watch ? 'Beenden' : 'OK';
    }
    const fb = $('syFull');
    if (fb) fb.textContent = isFull() ? '✕ Vollbild' : '⛶';
  }

  function alter(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
    if (s < 60) return 'vor ' + s + ' s';
    const m = Math.round(s / 60);
    return m < 60 ? 'vor ' + m + ' min' : 'vor ' + Math.round(m / 60) + ' h';
  }

  function paintPeople() {
    const box = $('syPeople');
    if (!box) return;
    box.hidden = !listOpen;
    if (!listOpen) return;
    const byId = {};
    for (const w of work) byId[w.participant] = w;
    const rows = [];
    const seen = {};
    for (const p of ((view && view.people) || [])) {
      seen[p.id] = true;
      rows.push({ id: p.id, name: p.name, online: p.online, w: byId[p.id] || null });
    }
    for (const w of work) if (!seen[w.participant]) rows.push({ id: w.participant, name: w.name, w });

    if (!rows.length) {
      box.innerHTML = '<p class="sy-empty">Noch niemand im Raum.</p>';
      return;
    }
    box.innerHTML = rows.map(r => {
      const on = watch && watch.pid === r.id;
      const info = r.w
        ? ctx.esc((r.w.titel ? r.w.titel + ' · ' : '') + r.w.geraete + ' Geräte · ' + alter(r.w.updated_at))
        : 'noch nichts gebaut';
      return '<button type="button" class="sy-person' + (on ? ' is-on' : '') + '" data-pid="' + ctx.esc(r.id) + '" '
        + 'data-name="' + ctx.esc(r.name || '') + '"' + (r.w ? '' : ' disabled') + ' aria-pressed="' + !!on + '">'
        + '<span class="sy-dot' + (r.online === false ? ' is-off' : '') + '"></span>'
        + '<strong>' + ctx.esc(r.name || '—') + '</strong>'
        + '<span class="sy-info">' + info + '</span>'
        + (on ? '<span class="sy-live">läuft vorne</span>' : '')
        + '</button>';
    }).join('');
  }

  function isFull() { return !!root && document.fullscreenElement === root.querySelector('.sy-host'); }
  function toggleFull() {
    const host = root && root.querySelector('.sy-host');
    if (!host) return;
    if (isFull()) { if (document.exitFullscreen) document.exitFullscreen(); }
    else if (host.requestFullscreen) host.requestFullscreen().catch(() => {});
  }

  async function onDeskClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'syList') {
      listOpen = !listOpen;
      paintDesk(); paintPeople();
      if (listOpen) { await tick(); }
      takt();
      fit();
      return;
    }
    if (b.id === 'syStop') { zuseheEnde(); return; }
    if (b.id === 'syBlind') { await setData({ blind: !data().blind }); return; }
    if (b.id === 'syFull') { toggleFull(); return; }
    if (b.dataset.pid) zusehen(b.dataset.pid, b.dataset.name || 'jemand');
  }

  /* ══════════════════════════════════════════════════════════
     Höhe des Rahmens
     ══════════════════════════════════════════════════════════
     Der Rahmen reicht bis an die untere Kante des Fensters — die
     Anwendung ist eine Fläche, und jeder Pixel darunter wäre
     Seite statt Netz. Dieselbe Messung wie bei Wild Clusters. */

  function spaceBelow(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        if (scs.display === 'none' || scs.position === 'fixed' || scs.position === 'absolute') continue;
        sum += s.offsetHeight + (parseFloat(scs.marginTop) || 0) + (parseFloat(scs.marginBottom) || 0);
      }
    }
    return sum;
  }

  function fit() {
    if (!frame) return;
    if (isFull()) { frame.style.height = ''; return; }
    const top = frame.getBoundingClientRect().top;
    const h = Math.max(MIN, window.innerHeight - top - spaceBelow(frame) - GAP);
    frame.style.height = h + 'px';
  }

  /* Der Rahmen entsteht erst mit dem ersten update(): seine Adresse
     trägt den Raumcode (für den eigenen Platz im Gerätespeicher,
     siehe app.js), und den kennt erst die view. */
  function baueRahmen() {
    const stage = $('syStage');
    if (!stage || frame) return;
    const c = (view && view.room && view.room.code) || (ctx.preview ? 'VORSCHAU' : 'RAUM');
    code = c;
    const src = 'tools/synir/index.html' + V
      + '&raum=' + encodeURIComponent(c)
      + '&rolle=' + (isPresenter() ? 'presenter' : 'participant');
    stage.innerHTML = '<iframe class="sy-frame" src="' + src + '" title="SYNIR" loading="eager" '
      + 'allow="fullscreen"></iframe>';
    frame = stage.querySelector('.sy-frame');
    fit();
    requestAnimationFrame(fit);
  }

  /* ══════════════════════════════════════════════════════════
     Schnittstelle nach außen
     ══════════════════════════════════════════════════════════ */

  window.MPTool.register('synir', {

    /* Nichts abzufragen: welche Szenarien die Klasse bekommt,
       entscheidet die Lehrkraft IM Raum, nicht beim Anlegen. */
    settingsFields: [],

    mount(el, context) {
      root = el;
      ctx = context;
      view = null;
      frame = null;
      bridgeReady = false;
      code = null;
      eigene = [];
      lastMenue = '';
      lastBlind = null;
      bekannte = null;
      lastErr = '';
      listOpen = false;
      work = [];
      watch = null;
      takeover = null;

      const pres = isPresenter();
      root.innerHTML =
        '<div class="sy-host">'
        + (pres ? deskHTML() : '')
        + '<div class="sy-stage" id="syStage"></div>'
        + '</div>';

      if (pres) {
        const desk = $('syDesk');
        if (desk) desk.addEventListener('click', onDeskClick);
        loadEigene();
      }

      onFs = () => { paintDesk(); fit(); };
      document.addEventListener('fullscreenchange', onFs);
      if (!ctx.preview) document.body.classList.add('tool-fill');

      onMsg = handle;
      window.addEventListener('message', onMsg);
      onResize = () => fit();
      window.addEventListener('resize', onResize);
    },

    update(v) {
      view = v;
      if (!frame) baueRahmen();

      // „Neues Szenario verfügbar" — nur für das, was NACH dem
      // Betreten dazukommt. Was beim Öffnen schon freigegeben war,
      // ist nicht neu, sondern der Stand.
      if (!isPresenter()) {
        const ids = sharedList().map(x => x.id);
        if (bekannte) {
          const neu = ids.filter(id => !bekannte.has(id));
          if (neu.length) {
            const msg = neu.length === 1 ? 'Neues Szenario verfügbar' : neu.length + ' neue Szenarien verfügbar';
            if (bridgeReady) post({ toast: msg + ' — oben rechts unter „Szenario laden".' });
            else ctx.toast(msg);
          }
        }
        bekannte = new Set(ids);
      }

      pushMenue();
      pushBlind();
      paintDesk();
      if (listOpen) paintPeople();
    },

    unmount() {
      clearTimeout(workTimer);
      workTimer = 0;
      if (isFull() && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) { /* egal */ } }
      if (onMsg) window.removeEventListener('message', onMsg);
      if (onResize) window.removeEventListener('resize', onResize);
      if (onFs) document.removeEventListener('fullscreenchange', onFs);
      onMsg = onResize = onFs = null;
      document.body.classList.remove('tool-fill');
      frame = null;
      root = null;
      ctx = null;
      view = null;
      watch = null;
      bridgeReady = false;
    }
  });
})();
