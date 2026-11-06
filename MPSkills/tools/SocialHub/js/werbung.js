/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/werbung.js   ·   Werbung (Migration 0276)
   Dateien und Klassen heißen bewusst NICHT ad/ads (wb-…, data-wb…):
   Werbeblocker (uBlock, AdBlock) blenden sonst den ganzen Reiter aus.
   ══════════════════════════════════════════════════════════════
   Reiter „Werbung“ im Adminbereich (erscheint, wenn die Lehrkraft die
   Tabelle ads erstellt hat; im Klassen-Netz immer):
     - Liste der Kampagnen mit Schalter an/aus, Zielgruppe, Fehlern
     - Editor: Name · Art (Anzeige | Beworbene Posts) · Bild/Titel/Text/
       Knopf · „Wem?“ (target_sql) · „Was?“ bzw. „Wo?“ (content_sql) mit Probelauf
     Anzeige ohne „Wo?“ = Karte im Feed, mit „Wo?“ = nur an diesen Fotos (0277)

   Die Zielgruppen rechnet NUR dieses Gerät (Admin): Schnappschuss →
   SQLite-Kopie im Worker → js/werbung-rechnen.js → nur die ids an
   sh_ads_compute. Der Server führt das SQL nie aus.

   SHAds.auto(call): rechnet im Hintergrund, solange ein Admin im
   Netzwerk ist (beim Hineingehen, dann alle 3 Minuten).
   Dazu die Bausteine für die App: cardHtml (Karte im Feed), stripHtml
   (Leiste unter den Kommentaren), why() und open() (Anzeige antippen).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const KIND = { ad: 'Anzeige', boost: 'Beworbene Posts' };
  const COLS = ['id', 'user_id', 'name', 'kind', 'title', 'body', 'image', 'button', 'target_sql', 'content_sql', 'active', 'created_at'];

  const ICON = {
    mega: '<svg viewBox="0 0 24 24"><path d="M3.5 10v4a1 1 0 0 0 1 1H7l5 4V5L7 9H4.5a1 1 0 0 0-1 1zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>',
    rocket: '<svg viewBox="0 0 24 24"><path d="M12 15.5 8.5 12C10 7 13.5 4 19.5 4.5 20 10.5 17 14 12 15.5zM8.5 12l-3-1 2.5-3h4M12 15.5l1 3 3-2.5v-4M5.5 18.5c.5-1.5 1.5-2.5 3-3"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4.5 19.5h4l10-10-4-4-10 10zM13 7l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 2.5-2.5L20 19"/></svg>'
  };

  const rowsToAds = t => !t ? [] : t.rows.map(r => { const o = {}; t.cols.forEach((c, i) => { o[c] = r[i]; }); return o; });
  const firstLine = sql => { const l = String(sql || '').trim().split('\n').map(x => x.trim()).filter(Boolean); return l.length ? l.slice(0, 3).join(' ').slice(0, 140) : ''; };
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

  /* ── Rechnen: Schnappschuss → Worker → sh_ads_compute ────── */
  async function computeWith(W, call, snap) {
    const ads = rowsToAds(snap.ads).filter(a => a.active === true || a.active === 1);
    if (!ads.length) return { ads: rowsToAds(snap.ads), results: [] };
    const results = await W.ads(ads.map(a => ({ id: a.id, kind: a.kind, target_sql: a.target_sql, content_sql: a.content_sql })));
    await call('sh_ads_compute', { p_results: results.map(x => ({ id: x.id, a: x.a, c: x.c })) });
    return { ads: rowsToAds(snap.ads), results };
  }

  async function compute(call) {
    const res = await call('sh_db_snapshot', {});
    if (!res || !res.ok || !res.tables || !res.tables.ads) return null;
    const W = window.SHDB.worker();
    try {
      await W.open(window.SHDB.buildScript(res.tables).script);
      return await computeWith(W, call, res.tables);
    } catch (e) {
      return null;
    } finally { W.stop(); }
  }

  // Im Hintergrund, solange ein Admin im Netzwerk ist
  let autoT = null, autoKey = null, autoBusy = false, autoLast = 0;
  function auto(call, key) {
    if (autoKey !== key) { stop(); autoKey = key; autoLast = 0; }
    const tick = async () => {
      if (autoBusy || document.visibilityState !== 'visible') return;
      if (Date.now() - autoLast < 170000) return;
      autoBusy = true;
      try { await compute(call); autoLast = Date.now(); } finally { autoBusy = false; }
    };
    if (!autoT) autoT = setInterval(tick, 20000);
    tick();
  }
  function stop() { if (autoT) clearInterval(autoT); autoT = null; autoKey = null; }

  /* ── Bausteine für die App ───────────────────────────────── */
  // Karte im Feed (kind 'ad')
  function cardHtml(ad) {
    const img = ad.image;
    return '<article class="card card--wb" data-wb="' + esc(ad.id) + '">' +
      (img ? '<div class="card-bg" data-m="' + esc(img) + '" data-thumb="1"></div><img class="card-img" data-m="' + esc(img) + '" alt="" draggable="false">'
           : '<div class="wb-fill"><span>' + esc(ad.title || ad.name) + '</span></div>') +
      '<div class="wb-label"><span>Anzeige</span><button type="button" class="wb-why" data-wbwhy title="Warum sehe ich das?">' + ICON.info + '</button></div>' +
      '<div class="meta meta--wb"><b class="wb-name">' + esc(ad.name) + '</b><span class="m-time">· Gesponsert</span>' +
        (ad.title ? '<p class="wb-title">' + esc(ad.title) + '</p>' : '') +
        (ad.body ? '<p class="m-desc">' + esc(ad.body) + '</p>' : '') +
        '<button type="button" class="wb-cta" data-wbgo>' + esc(ad.button || 'Mehr erfahren') + '<span>›</span></button>' +
      '</div></article>';
  }
  // Leiste (z. B. unter den Kommentaren)
  function stripHtml(ad) {
    return '<div class="wb-strip" data-wb="' + esc(ad.id) + '">' +
      (ad.image ? '<span class="wb-strip-img" data-m="' + esc(ad.image) + '" data-thumb="1"></span>' : '<span class="wb-strip-img wb-strip-img--x">' + ICON.mega + '</span>') +
      '<button type="button" class="wb-strip-t" data-wbgo><small>Anzeige · ' + esc(ad.name) + '</small><b>' + esc(ad.title || ad.name) + '</b></button>' +
      '<button type="button" class="wb-why wb-why--s" data-wbwhy title="Warum sehe ich das?">' + ICON.info + '</button></div>';
  }
  // Leiste unten auf einer Foto-Karte (Anzeige mit „Wo?“, 0277)
  function photoAdHtml(ad) {
    return '<div class="wb-onphoto" data-wbp>' +
      (ad.image ? '<span class="wb-strip-img" data-m="' + esc(ad.image) + '" data-thumb="1"></span>' : '<span class="wb-strip-img wb-strip-img--x">' + ICON.mega + '</span>') +
      '<button type="button" class="wb-strip-t" data-wbgo><small>Anzeige · ' + esc(ad.name) + '</small><b>' + esc(ad.title || ad.name) + '</b></button>' +
      '<button type="button" class="wb-why wb-why--s" data-wbwhy title="Warum sehe ich das?">' + ICON.info + '</button></div>';
  }
  // „Warum sehe ich das?“ – die Abfrage, durch die man in der Zielgruppe ist
  function whyHtml(ad, netName, sponsored) {
    const t = String(ad.target_sql || '').trim();
    return '<p>' + (sponsored ? 'Dieser Beitrag wird dir von <b>' + esc(ad.name) + '</b> vorgeschlagen (bezahlt).' : 'Diese Anzeige ist von <b>' + esc(ad.name) + '</b>.') + '</p>' +
      (t ? '<p>' + esc(netName || 'Das Netzwerk') + ' zeigt sie Usern, für die diese Abfrage passt – und du gehörst dazu:</p><pre class="wb-sqlv">' + esc(t) + '</pre>' +
             (/\$user\b/i.test(t) ? '<p class="muted small"><code>$user</code> ist deine User-id. Für jeden User wird einmal gefragt; kommt <i>wahr</i> heraus, sieht er die Werbung.</p>'
                                   : '<p class="muted small">Die Abfrage liefert eine Liste von User-ids – deine ist dabei.</p>')
         : '<p>Diese Werbung sehen <b>alle</b> – die Kampagne hat keine Zielgruppe.</p>') +
      (sponsored && ad.content_sql ? '<p>Beworben werden die Fotos aus dieser Abfrage:</p><pre class="wb-sqlv">' + esc(String(ad.content_sql).trim()) + '</pre>' : '') +
      (!sponsored && ad.content_sql ? '<p>Und sie hängt an Fotos, die diese Abfrage liefert – so wie das Foto, das du gerade ansiehst:</p><pre class="wb-sqlv">' + esc(String(ad.content_sql).trim()) + '</pre>' : '') +
      '<p class="muted small">Gerechnet wird mit dem, was das Netzwerk über dich gespeichert hat: Likes, Follows, Besuche, wie lange du Fotos ansiehst …</p>';
  }

  /* ── Reiter „Werbung“ ────────────────────────────────────── */
  function tab(host, ctx) {
    const call = ctx.call;
    const W = window.SHDB.worker();
    let snap = null, schema = null, ads = [], results = {}, loaded = false, at = null, dead = false;
    let listed = false, failMsg = null;   // Liste schon aus dem Schnappschuss da? / was beim Laden schiefging

    function state(t, bad) { const el = $('#wbSt', host); if (el) { el.textContent = t || ''; el.classList.toggle('bad', !!bad); } }

    async function load(msg) {
      state(msg || 'rechnet …');
      failMsg = null;
      const res = await call('sh_db_snapshot', {});
      if (dead) return;
      if (!res || !res.ok) {
        failMsg = res && res.error === 'not_admin' ? 'Das dürfen nur Admins.'
          : res && res.error === 'fn_missing' ? 'Der Server kennt die Werbung noch nicht – Migration 0276 fehlt.'
          : 'Konnte die Daten des Netzwerks nicht laden (' + ((res && (res.message || res.error)) || '?') + ').';
        state('Fehler', true);
        if (!editing) paintList();
        return;
      }
      snap = res.tables || {};
      // Liste gleich zeigen – die Zielgruppen kommen danach
      ads = rowsToAds(snap.ads);
      listed = true;
      if (!snap.ads) failMsg = 'Die Tabelle ads fehlt in diesem Netzwerk.';
      if (!editing) { paintList(); state('rechnet die Zielgruppen …'); }
      try {
        const o = await W.open(window.SHDB.buildScript(snap).script);
        schema = o.schema;
        const r = await computeWith(W, call, snap);
        if (dead) return;
        ads = r.ads;
        results = {};
        r.results.forEach(x => { results[x.id] = x; });
        loaded = true;
        at = new Date();
        state(plural(ads.length, 'Kampagne', 'Kampagnen') + ' · Zielgruppen berechnet um ' + at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
      } catch (e) {
        failMsg = 'Zielgruppen konnten nicht berechnet werden: ' + (e && e.message || e);
        state('Fehler', true);
      }
      if (!editing) paintList();
    }

    let editing = null;
    // Fehler beim Zeichnen nie verschlucken (sonst bleibt der Reiter einfach leer)
    function paintList() {
      try { paintListNow(); } catch (e) {
        console.error('[Werbung]', e);
        host.innerHTML = '<div class="adm-pad wbx"><div class="res res--bad"><b>Die Werbung ließ sich nicht anzeigen:</b> ' + esc(e && (e.stack || e.message) || e) + '</div></div>';
      }
    }
    function paintListNow() {
      editing = null;
      host.innerHTML = '<div class="adm-pad wbx">' +
        '<div class="wb-h"><h2 class="adm-h">Werbung</h2><span class="wb-st" id="wbSt"></span><span class="spacer"></span>' +
          '<button type="button" class="btn btn--ghost btn--s" id="wbRe" title="Zielgruppen jetzt neu berechnen">' + ICON.redo + ' Neu berechnen</button>' +
          '<button type="button" class="btn btn--accent btn--s" id="wbNew">' + ICON.plus + ' Neue Kampagne</button></div>' +
        '<p class="hint">Jede Kampagne hat eine Zielgruppe als SQL-Abfrage („Wem?“). Dieses Gerät rechnet sie mit den gesammelten Daten aus – der Server bekommt nur die Liste der User. ' +
          '<b>Anzeige</b> = eigene Karte im Feed und unter den Kommentaren. <b>Beworbene Posts</b> = Fotos aus „Was?“ werden der Zielgruppe in „Für dich“ vorgeschlagen.</p>' +
        (failMsg ? '<div class="res res--bad wb-fail"><b>Fehler:</b> ' + esc(failMsg) + ' <button type="button" class="btn btn--ghost btn--s" id="wbRetry">Nochmal</button></div>' : '') +
        '<div class="wb-list" id="wbList">' + (loaded || listed ? listHtml() : failMsg ? '' : '<p class="muted">lädt …</p>') + '</div></div>';
      if (at) state(plural(ads.length, 'Kampagne', 'Kampagnen') + ' · Zielgruppen berechnet um ' + at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
      $('#wbRe', host).onclick = () => load('rechnet …');
      if ($('#wbRetry', host)) $('#wbRetry', host).onclick = () => load('lädt …');
      $('#wbNew', host).onclick = () => edit(null);
      $$('[data-aon]', host).forEach(i => i.onchange = async () => {
        const r = await call('sh_ad_active', { p_id: +i.dataset.aon, p_on: i.checked });
        if (!r || !r.ok) { ctx.fail(r); i.checked = !i.checked; return; }
        ctx.toast(i.checked ? 'Kampagne läuft' : 'Kampagne pausiert');
        load('rechnet …');
      });
      $$('[data-aedit]', host).forEach(b => b.onclick = () => edit(ads.find(a => a.id === +b.dataset.aedit)));
      $$('[data-wbel]', host).forEach(b => b.onclick = async () => {
        const a = ads.find(x => x.id === +b.dataset.wbel);
        if (await ctx.dialog('Kampagne löschen?', '<p><b>' + esc(a ? a.name : '') + '</b> endgültig löschen?</p>', [['no', 'Abbrechen'], ['yes', 'Löschen', 'bad']]) !== 'yes') return;
        const r = await call('sh_ad_delete', { p_id: +b.dataset.wbel });
        if (!r || !r.ok) { ctx.fail(r); return; }
        load('rechnet …');
      });
      ctx.hydrate(host);
    }

    function listHtml() {
      if (!ads.length) return '<div class="wb-empty">' + ICON.mega + '<p>Noch keine Kampagne. Leg die erste an – zum Beispiel Werbung nur für Leute, die Gaming-Fotos liken.</p>' +
        '<p class="muted small">Beispiel-Kampagnen lädt die Lehrkraft auf der Startseite: im Tabellen-Diagramm an der Kachel <code>ads</code> auf „Füllen“.</p></div>';
      return ads.map(a => {
        const on = a.active === true || a.active === 1;
        const r = results[a.id];
        let n = '';
        if (!on) n = '<span class="muted">pausiert – wird niemandem gezeigt</span>';
        else if (!r) n = '<span class="muted">noch nicht berechnet</span>';
        else {
          n = '<span>' + (r.a === null ? '<b>alle ' + r.n + ' User</b>' : '<b>' + plural(r.n, 'User', 'User') + '</b>') + ' in der Zielgruppe' +
              (a.kind === 'boost' ? ' · <b>' + plural(r.nc || 0, 'Foto', 'Fotos') + '</b> beworben'
                : a.content_sql ? ' · an <b>' + plural(r.nc || 0, 'Foto', 'Fotos') + '</b>' : ' · Karte im Feed') + '</span>';
          if (r.error) n += '<span class="wb-err">„Wem?“: ' + esc(r.error) + '</span>';
          if (r.cerror) n += '<span class="wb-err">' + (a.kind === 'boost' ? '„Was?“' : '„Wo?“') + ': ' + esc(r.cerror) + '</span>';
        }
        return '<article class="wb-row' + (on ? '' : ' is-off') + '">' +
          (a.image ? '<span class="wb-thumb" data-m="' + esc(a.image) + '" data-thumb="1"></span>'
                   : '<span class="wb-thumb wb-thumb--x">' + (a.kind === 'boost' ? ICON.rocket : ICON.mega) + '</span>') +
          '<div class="wb-main"><div class="wb-top"><b>' + esc(a.name) + '</b><span class="wb-kind wb-kind--' + esc(a.kind) + '">' + esc(a.kind === 'ad' && a.content_sql ? 'Anzeige am Foto' : (KIND[a.kind] || a.kind)) + '</span>' +
            (a.user_id == null ? '<span class="wb-kind">Plattform</span>' : '') + '</div>' +
            '<div class="wb-n">' + n + '</div>' +
            (a.target_sql ? '<code class="wb-q" title="' + esc(a.target_sql) + '">' + esc(firstLine(a.target_sql)) + '</code>' : '<code class="wb-q muted">ohne Zielgruppe = alle</code>') +
          '</div>' +
          '<div class="wb-acts"><label class="switch switch--s" title="' + (on ? 'Pausieren' : 'Starten') + '"><input type="checkbox" data-aon="' + a.id + '"' + (on ? ' checked' : '') + '><span></span></label>' +
            '<button type="button" class="icon-btn icon-btn--s" data-aedit="' + a.id + '" title="Bearbeiten">' + ICON.edit + '</button>' +
            '<button type="button" class="icon-btn icon-btn--s icon-btn--bad" data-wbel="' + a.id + '" title="Löschen">' + ICON.trash + '</button></div>' +
        '</article>';
      }).join('');
    }

    /* Editor */
    function edit(a) {
      try { editNow(a); } catch (e) {
        console.error('[Werbung]', e);
        host.innerHTML = '<div class="adm-pad wbx"><div class="res res--bad"><b>Der Editor ließ sich nicht öffnen:</b> ' + esc(e && e.message || e) +
          ' <button type="button" class="btn btn--ghost btn--s" id="wbBack2">Zurück</button></div></div>';
        $('#wbBack2', host).onclick = () => paintList();
      }
    }
    function editNow(a) {
      const v = Object.assign({ id: null, name: '', kind: 'ad', title: '', body: '', image: null, button: 'Mehr erfahren', target_sql: '', content_sql: '', active: true }, a || {});
      editing = v;
      host.innerHTML = '<div class="adm-pad wbx wbx--ed"><form class="form wb-form" id="wbForm">' +
        '<div class="wb-h"><button type="button" class="btn btn--ghost btn--s" id="wbBack">‹ Alle Kampagnen</button>' +
          '<h2 class="adm-h">' + (v.id ? 'Kampagne bearbeiten' : 'Neue Kampagne') + '</h2></div>' +
        '<div class="wb-grid"><div class="wb-col">' +
          '<label>Name (Werbekunde)<input name="name" maxlength="60" required value="' + esc(v.name) + '" placeholder="z. B. VOLTA Energy"></label>' +
          '<div><span class="lbl">Art</span><div class="seg seg--s wb-seg" role="radiogroup">' +
            ['ad', 'boost'].map(k => '<button type="button" role="radio" data-kind="' + k + '"' + (v.kind === k ? ' class="on" aria-checked="true"' : ' aria-checked="false"') + '>' + KIND[k] + '</button>').join('') + '</div></div>' +
          '<div class="wb-only-ad">' +
            '<div class="wb-pic"><span class="wb-pic-img" id="wbPic"></span><div><span class="lbl">Bild</span>' +
              (ctx.upload() ? '<label class="btn btn--ghost btn--s">' + ICON.image + ' Bild wählen<input type="file" accept="image/*" id="wbFile" hidden></label>' : '<p class="muted small">Bilder hochladen ist ausgeschaltet – die Anzeige zeigt dann den Titel groß.</p>') +
              '<button type="button" class="btn btn--ghost btn--s" id="wbNoPic"' + (v.image ? '' : ' hidden') + '>Ohne Bild</button></div></div>' +
            '<label>Titel<input name="title" maxlength="80" value="' + esc(v.title) + '" placeholder="z. B. Noch eine Runde?"></label>' +
            '<label>Text<textarea name="body" maxlength="300" rows="3" placeholder="Was soll in der Anzeige stehen?">' + esc(v.body) + '</textarea></label>' +
            '<label>Knopf<input name="button" maxlength="30" value="' + esc(v.button) + '" placeholder="Mehr erfahren"></label>' +
          '</div>' +
          '<label class="check"><input type="checkbox" name="active"' + (v.active === false || v.active === 0 ? '' : ' checked') + '><span></span>Kampagne läuft</label>' +
        '</div><div class="wb-col">' +
          '<div class="wb-q-box"><div class="wb-q-h"><b>Wem?</b> <span class="muted small">Zielgruppe als SQL – leer = alle</span>' +
            '<button type="button" class="btn btn--ghost btn--s" id="wbProbeT">' + ICON.play + ' Probelauf</button></div>' +
            '<div class="sql-ed wb-ed" id="wbEdT"></div>' +
            '<details class="wb-help"><summary>Wie schreibe ich „Wem?“</summary>' +
              '<p><b>Mit <code>$user</code></b> (die id des Users, der gerade schaut): ein Wert, <i>wahr</i> = passt.</p>' +
              '<pre>SELECT CASE gender WHEN \'male\' THEN true ELSE false END\nFROM users WHERE id = $user</pre>' +
              '<p><b>Ohne <code>$user</code></b>: eine Liste von User-ids. Ist der User dabei, passt es.</p>' +
              '<pre>SELECT id FROM users WHERE gender = \'male\'</pre></details>' +
            '<div class="wb-probe" id="wbOutT"></div></div>' +
          '<div class="wb-q-box"><div class="wb-q-h"><b class="wb-c-l"></b> <span class="muted small wb-c-h"></span>' +
            '<button type="button" class="btn btn--ghost btn--s" id="wbProbeC">' + ICON.play + ' Probelauf</button></div>' +
            '<div class="sql-ed wb-ed" id="wbEdC"></div>' +
            '<details class="wb-help wb-only-ad"><summary>Wozu „Wo?“</summary>' +
              '<p><b>Leer</b>: die Anzeige erscheint als eigene Karte im Feed.</p>' +
              '<p><b>Mit Abfrage</b>: sie erscheint nur an diesen Fotos – unten auf dem Foto und über den Kommentaren (Kontext-Werbung: es zählt, was jemand ansieht, nicht wer er ist). „Wem?“ gilt zusätzlich.</p>' +
              '<pre>SELECT pt.photo_id FROM photo_tag pt\nJOIN tags t ON t.id = pt.tag_id\nWHERE t.name IN (\'hund\', \'katze\')</pre></details>' +
            '<div class="wb-probe" id="wbOutC"></div></div>' +
        '</div></div>' +
        '<div class="wb-foot"><span class="hint" id="wbHint" hidden></span><span class="spacer"></span>' +
          '<button type="button" class="btn btn--ghost" id="wbCancel">Abbrechen</button>' +
          '<button class="btn btn--accent" id="wbSave">Speichern</button></div>' +
      '</form></div>';
      const f = $('#wbForm', host);
      // form.name / form.title sind Eigenschaften des Formulars selbst → Felder über elements holen
      const fv = n => f.elements.namedItem(n);
      const edT = window.SQLEditor.create($('#wbEdT', host), { getSchema: () => schema, onRun: () => probe('target') });
      const edC = window.SQLEditor.create($('#wbEdC', host), { getSchema: () => schema, onRun: () => probe('content') });
      edT.value = v.target_sql || '';
      edC.value = v.content_sql || '';
      const syncKind = () => {
        f.classList.toggle('is-boost', v.kind === 'boost');
        $('.wb-c-l', f).textContent = v.kind === 'boost' ? 'Was?' : 'Wo?';
        $('.wb-c-h', f).textContent = v.kind === 'boost' ? 'Fotos, die beworben werden (Liste von photo-ids)' : 'An welchen Fotos? (photo-ids) – leer = Karte im Feed';
        $$('[data-kind]', f).forEach(b => { b.classList.toggle('on', b.dataset.kind === v.kind); b.setAttribute('aria-checked', b.dataset.kind === v.kind); });
      };
      const paintPic = () => {
        const el = $('#wbPic', host);
        el.removeAttribute('data-h'); el.classList.remove('img-ok', 'img-missing'); el.style.backgroundImage = '';
        if (v.image) { el.dataset.m = v.image; el.dataset.thumb = '1'; ctx.hydrate(f); } else { delete el.dataset.m; el.innerHTML = ICON.image; }
        if (v.image) el.innerHTML = '';
        const nb = $('#wbNoPic', host); if (nb) nb.hidden = !v.image;
      };
      syncKind(); paintPic();
      $$('[data-kind]', f).forEach(b => b.onclick = () => { v.kind = b.dataset.kind; syncKind(); });
      const back = () => paintList();
      $('#wbBack', host).onclick = back;
      $('#wbCancel', host).onclick = back;
      if ($('#wbNoPic', host)) $('#wbNoPic', host).onclick = () => { v.image = null; paintPic(); };
      if ($('#wbFile', host)) $('#wbFile', host).onchange = async (e) => {
        const fl = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!fl) return;
        try {
          const cut = await window.SHPhoto.crop(await window.SHMedia.decode(fl), { start: 0.9, title: 'Bild der Anzeige zuschneiden' });
          if (!cut) return;
          const c = await window.SHMedia.compress(cut);
          const r = await call('sh_media_put', { p_data: c.data, p_thumb: c.thumb, p_mime: c.mime });
          if (!r || !r.ok) { ctx.fail(r && r.error === 'not_logged_in' ? { error: 'not_logged_in', message: 'Zum Hochladen oben mit einem Konto anmelden.' } : r); return; }
          window.SHMedia.prime(ctx.hubId, r.name, c.preview);
          v.image = r.name;
          paintPic();
        } catch (err) { ctx.toast(err.message || 'Das Bild ging nicht.', true); }
      };

      async function probe(kind) {
        const ed = kind === 'content' ? edC : edT;
        const out = $(kind === 'content' ? '#wbOutC' : '#wbOutT', host);
        if (!loaded) { out.innerHTML = '<p class="muted small">Die Daten laden noch …</p>'; return; }
        out.innerHTML = '<p class="muted small">rechnet …</p>';
        try {
          const r = await W.probe(ed.value, kind === 'content' ? 'content' : 'target');
          if (r.error) { out.innerHTML = '<div class="res res--bad"><b>Fehler:</b> ' + esc(r.error) + '</div>'; return; }
          if (kind === 'content') {
            out.innerHTML = '<div class="res res--ok"><b>' + plural(r.ids.length, 'Foto', 'Fotos') + '</b> ' + (v.kind === 'boost' ? 'würden beworben' : 'bekämen die Anzeige') + (r.ids.length ? ':' : '.') + '</div>' +
              (r.rows.length ? '<div class="wb-hits">' + r.rows.map(x => '<span title="' + esc(x[1] || '') + '">#' + esc(x[0]) + (x[1] ? ' ' + esc(String(x[1]).slice(0, 28)) : '') + '</span>').join('') + '</div>' : '');
          } else {
            out.innerHTML = '<div class="res res--ok"><b>' + (r.all ? 'Alle ' + r.ids.length + ' User' : plural(r.ids.length, 'User', 'User')) + '</b> ' +
              (r.all ? '(keine Abfrage)' : r.form === 'user' ? 'ergeben „wahr“ (für jeden einzeln mit $user gefragt)' : 'stehen in der Liste') + (r.rows.length ? ':' : '.') + '</div>' +
              (r.rows.length ? '<div class="wb-hits">' + r.rows.map(x => '<span>@' + esc(x[1]) + '</span>').join('') + '</div>' : '');
          }
        } catch (e) { out.innerHTML = '<div class="res res--bad">' + esc(e.message) + '</div>'; }
      }
      $('#wbProbeT', host).onclick = () => probe('target');
      $('#wbProbeC', host).onclick = () => probe('content');

      f.onsubmit = async (e) => {
        e.preventDefault();
        const hint = $('#wbHint', host);
        const name = fv('name').value.trim();
        if (!name) { hint.hidden = false; hint.textContent = 'Bitte einen Namen eingeben.'; return; }
        if (v.kind === 'boost' && !edC.value.trim()) { hint.hidden = false; hint.textContent = 'Bei „Beworbene Posts“ braucht es eine Abfrage bei „Was?“.'; return; }
        $('#wbSave', host).disabled = true;
        const r = await call('sh_ad_save', {
          p_id: v.id, p_name: name, p_kind: v.kind,
          p_title: v.kind === 'ad' ? fv('title').value : null, p_body: v.kind === 'ad' ? fv('body').value : null,
          p_image: v.kind === 'ad' ? v.image : null, p_button: v.kind === 'ad' ? fv('button').value : null,
          p_target: edT.value, p_content: edC.value, p_active: fv('active').checked
        });
        $('#wbSave', host).disabled = false;
        if (!r || !r.ok) { ctx.fail(r); return; }
        ctx.toast('Kampagne gespeichert');
        editing = null;
        paintList();
        load('rechnet …');
      };
    }

    paintList();
    load().catch(e => { failMsg = 'Fehler: ' + (e && (e.stack || e.message) || e); if (!editing) paintList(); });
    return { destroy() { dead = true; W.stop(); } };
  }

  window.SHAds = { tab, compute, auto, stop, cardHtml, stripHtml, photoAdHtml, whyHtml, ICON };
})();
