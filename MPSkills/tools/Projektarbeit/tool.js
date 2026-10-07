/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Projektarbeit"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Zehnter Skill (Migration 0200). Ein Raum ist eine ganze KLASSE:
   Lobby → Gruppen (per Drag & Drop durch die Lehrkraft) → je Gruppe
   ein Planungsraum mit Projektziel, Board, Stunden, Anträgen, Team
   und Regeln.

   Gebaut wie die Scrum Werkstatt: die Oberfläche ist eine eigene
   Seite (index.html) im <iframe>, mit eigenem Kleid; bridge.js darin
   spricht mit diesem Modul. Dieses Modul: Rahmen einhängen und messen,
   den Stand vom Server holen (eigener Takt: pa_sig → pa_view bzw.
   pa_room_sig → pa_room_get) und in den Rahmen reichen, Aufrufe aus
   dem Rahmen an den Server weitergeben. Token bzw. Raum-Code hängt
   ctx.actions.call an — der Rahmen kennt keinen von beiden.

   Die Lehrkraft sieht immer die Übersicht und — wenn sie einen
   Planungsraum betreten hat — dessen Inhalt. Welcher das ist, sagt
   der Rahmen ({type:'focus'}); er geht als p_group an pa_room_get.

   Reiter (0201): Auf der Raumseite ersetzt die Projektarbeit den
   Reiter „3 Projektarbeit" durch zwei eigene (ctx.tabs, lib/tool.js):
     3 Gruppen-Übersicht     Lobby, Gruppen bilden, Klassenliste
     4 „<Gruppe> Projekt"    der Planungsraum der zuletzt geöffneten
                             Gruppe (nach dem Neuladen: die Gruppe, in
                             der zuletzt etwas geschah)
   Ein Tipp darauf geht als {type:'goto'} in den Rahmen; der Rahmen
   antwortet wie immer mit {type:'focus'}. Ohne ctx.tabs (Schaufenster)
   bleibt der Knopf „← Übersicht" im Rahmen.

   Export, Import, Backups (0202): nur die Lehrkraft, über das Menü im
   Rahmen (pa_room_export / _import / _backups / _backup_get /
   _backup_restore). Ein Projektarbeit-Raum hält ein Jahr (Trigger auf
   skill_rooms, Migration 0202) statt 30 Tage.

   Nur geänderte Objekte über das Netz: pa_view / pa_room_get nehmen
   p_have ({ "task:t3": 4, … }) und lassen bei allem, was das Gerät in
   dieser Version schon hat, die Daten weg. `cache` füllt sie wieder
   auf, bevor die Ansicht in den Rahmen geht.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const ALLOWED = {
    participant: ['pa_save', 'pa_member_update'],
    presenter:   ['pa_room_save', 'pa_room_member_update', 'pa_room_rekey', 'pa_room_assign',
                  'pa_room_plan', 'pa_room_group_rename', 'pa_room_group_delete', 'pa_room_rules',
                  'pa_room_consent', 'pa_room_export', 'pa_room_import', 'pa_room_backups',
                  'pa_room_backup_get', 'pa_room_backup_restore', 'pa_room_notify_get', 'pa_room_notify_set']
  };

  const GAP = 12;
  const MIN = 460;

  let root = null, frame = null, ctx = null, role = null;
  let ready = false, destroyed = false, busy = false;
  let lastSig = null, pollTimer = null, onResize = null, onMsg = null;
  let cache = {};          // 'task:t3' → { v, data }  (nur für die Gruppe in `focus`)
  let lastView = null;
  let focus = null;        // Lehrkraft: Gruppe, deren Planungsraum offen ist
  let lastFocus = null;    // … und für welche die letzte Ansicht geholt wurde
  let ticks = 0;
  let lastGroup = null;    // Lehrkraft: zuletzt geöffneter Planungsraum (Reiter 4)
  let tabSig = null;       // was zuletzt an ctx.tabs ging

  /* ─── Reiter auf der Raumseite ──────────────────────────── */
  const hasTabs = () => role === 'presenter' && ctx && typeof ctx.tabs === 'function' && !ctx.preview;

  function groupTitle(g, people) {
    if (!g) return '';
    if (g.name) return g.name;
    const m = (people || []).find(p => p.group === g.id);
    return (m && m.name) || 'Einzelarbeit';
  }

  function updateTabs() {
    if (!hasTabs()) return;
    const groups = (lastView && lastView.groups) || [];
    const people = (lastView && lastView.people) || [];
    // Aufgelöst? Dann gilt sie nicht mehr. Die gerade geöffnete bleibt —
    // eine eben eröffnete Einzelarbeit steht noch in keiner Ansicht.
    if (lastView && lastGroup && lastGroup !== focus && !groups.some(g => g.id === lastGroup)) lastGroup = null;
    // Nach dem Neuladen: die Gruppe mit offenem Planungsraum, in der
    // zuletzt etwas geschah.
    if (!lastGroup) {
      const cand = groups.filter(g => g.plan_open)
        .sort((a, b) => String(b.last || '').localeCompare(String(a.last || '')))[0];
      if (cand) lastGroup = cand.id;
    }
    const g = groups.find(x => x.id === lastGroup) || null;
    const list = [
      { key: 'groups', label: 'Gruppen-Übersicht' },
      { key: 'plan', label: g ? groupTitle(g, people) + ' Projekt' : 'Projekt',
        disabled: !lastGroup, title: 'Erst in der Gruppen-Übersicht einen Planungsraum öffnen.' }
    ];
    const active = focus ? 'plan' : 'groups';
    const sig = JSON.stringify([list, active]);
    if (sig === tabSig) return;
    tabSig = sig;
    ctx.tabs(list, active, key => {
      if (key === 'groups') post({ type: 'goto', group: null });
      else if (lastGroup) post({ type: 'goto', group: lastGroup });
    });
  }

  /* ─── Rahmenhöhe (wie Scrum Werkstatt / NeuroLab) ───────── */
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
    const top = frame.getBoundingClientRect().top;
    frame.style.height = Math.max(MIN, window.innerHeight - top - spaceBelow(frame) - GAP) + 'px';
  }

  function post(msg) {
    if (!frame || !frame.contentWindow) return;
    try { frame.contentWindow.postMessage(Object.assign({ pa: 1 }, msg), location.origin); } catch (e) { /* zu */ }
  }

  /* ─── Eigener Takt ──────────────────────────────────────── */
  async function tick(force) {
    if (destroyed || busy || !ready) return;
    if (!force && document.hidden) return;
    busy = true;
    try {
      const presenter = role === 'presenter';
      // Die Punkte „gerade da" stehen nicht in der Signatur (sie wechseln
      // zu oft). Die Lehrkraft holt deshalb alle 30 s ohnehin neu.
      if (presenter && ++ticks % 8 === 0) force = true;
      const s = await ctx.actions.call(presenter ? 'pa_room_sig' : 'pa_sig', {});
      if (destroyed || !s || !s.ok) {
        if (s && s.error === 'fn_missing') ctx.toast(ctx.errText('fn_missing'), true);
        return;
      }
      if (s.sig === lastSig && !force) return;

      const asked = focus;
      const have = {};
      Object.keys(cache).forEach(k => { have[k] = cache[k].v; });
      const v = presenter
        ? await ctx.actions.call('pa_room_get', { p_group: asked, p_have: have })
        : await ctx.actions.call('pa_view', { p_have: have });
      if (destroyed) return;
      if (!v || !v.ok) {
        if (v && v.error === 'fn_missing') ctx.toast(ctx.errText('fn_missing'), true);
        return;
      }
      // Während der Abfrage den Planungsraum gewechselt: verwerfen.
      if (presenter && asked !== focus) { lastSig = null; return; }
      lastSig = s.sig;

      // Schüler: wechselt die Gruppe, gehört der Cache nicht mehr dazu.
      const gid = v.group ? v.group.id : null;
      if (!presenter && lastView && (lastView.group ? lastView.group.id : null) !== gid) cache = {};

      const next = {};
      v.items = (v.items || []).map(it => {
        const k = it.kind + ':' + it.id;
        if (it.data === undefined && cache[k] && cache[k].v === it.v) it = Object.assign({}, it, { data: cache[k].data });
        if (it.data !== undefined) next[k] = { v: it.v, data: it.data };
        return it;
      });
      cache = next;
      lastView = v; lastFocus = asked;
      post({ type: 'view', view: v, focus: asked });
      updateTabs();
    } finally {
      busy = false;
    }
  }

  async function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.pa !== 1) return;

    if (m.type === 'ready') {
      ready = true;
      lastSig = null;
      post({ type: 'host', tabs: hasTabs() });
      if (lastView) post({ type: 'view', view: lastView, focus: lastFocus });
      tick(true);
      return;
    }
    if (m.type === 'refresh') { lastSig = null; tick(true); return; }
    if (m.type === 'focus') {
      if (role !== 'presenter') return;
      focus = m.group || null;
      if (focus) lastGroup = focus;
      updateTabs();
      cache = {}; lastView = null; lastSig = null;
      // Läuft gerade eine Abfrage, verwirft sie ihr Ergebnis (s. o.) —
      // dann kurz danach noch einmal.
      if (busy) setTimeout(() => tick(true), 300); else tick(true);
      return;
    }
    if (m.type === 'call') {
      const ok = (ALLOWED[role] || []).includes(m.fn);
      const res = ok ? await ctx.actions.call(m.fn, m.args || {})
                     : { ok: false, error: 'not_allowed' };
      post({ type: 'reply', rid: m.rid, res });
    }
  }

  window.MPTool.register('projekt', {

    // Gruppen, Ziele und Regeln entstehen im Raum selbst.
    settingsFields: [],

    mount(el, c) {
      root = el; ctx = c; role = c.role; destroyed = false;

      // Im Schaufenster ohne Raum: die Beispielklasse (?demo=1, bridge.js).
      const q = (ctx.preview ? '?demo=1&' : '?') + 'v=20261007c';
      root.innerHTML =
        '<div class="pa-host">' +
          '<iframe class="pa-frame" src="tools/Projektarbeit/index.html' + q + '" ' +
                  'title="Projektarbeit" loading="eager"></iframe>' +
        '</div>';
      frame = root.querySelector('.pa-frame');

      if (!ctx.preview) {
        updateTabs();
        document.body.classList.add('tool-fill');
        onMsg = onMessage;
        window.addEventListener('message', onMsg);
        pollTimer = setInterval(() => tick(false), 4000);
      }

      onResize = () => fit();
      window.addEventListener('resize', onResize);
      fit();
      requestAnimationFrame(fit);
    },

    // Der Seiten-Poller (skill_view) meldet sich, wenn sich im Raum
    // etwas tut — ein billiger Anstoß für den eigenen Takt.
    update() { tick(false); },

    unmount() {
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (onResize) window.removeEventListener('resize', onResize);
      if (onMsg) window.removeEventListener('message', onMsg);
      document.body.classList.remove('tool-fill');
      pollTimer = onResize = onMsg = null;
      frame = root = ctx = role = null;
      ready = false; busy = false; lastSig = null; cache = {}; lastView = null; focus = null; ticks = 0;
      lastGroup = null; tabSig = null;
    }
  });
})();
