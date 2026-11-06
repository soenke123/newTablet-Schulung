/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/adseval.js   ·   Zielgruppen der Werbung rechnen
   ══════════════════════════════════════════════════════════════
   Läuft NUR im Browser eines Admins (im Worker js/dbworker.js, auf der
   SQLite-Kopie des Netzwerks) und im Prüfstand unter Node. Der Server
   führt das SQL der Klasse nie aus – er bekommt nur die Zahlen
   (sh_ads_compute, Migration 0276).

   „Wem?“ (target_sql), $user = id des aktuellen Users:
     mit $user   → für jeden User einmal, ein Wert; wahr = passt
     ohne $user  → einmal; Liste von ids (erste Spalte); dabei = passt
     leer        → alle (a = null)
   „Was?“ (content_sql, beworbene Posts) bzw. „Wo?“ (content_sql einer
   Anzeige, 0277: an welchen Fotos sie erscheint): Liste von Foto-ids
   (erste Spalte).

   Nur EINE Abfrage (SELECT oder WITH), nur lesen (readOnly im Kern).
   ══════════════════════════════════════════════════════════════ */

(function (root) {
  'use strict';

  const MAX_ROWS = 5000;

  // Kommentare weg, Leerraum und ein Semikolon am Ende weg
  function clean(sql) {
    return String(sql || '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|\s)(--|#)[^\n]*/g, '$1')
      .trim()
      .replace(/;\s*$/, '')
      .trim();
  }
  const blank = sql => clean(sql) === '';
  const hasUser = sql => /\$user\b/i.test(String(sql || ''));

  function truthy(v) {
    if (v === null || v === undefined || v === false || v === 0) return false;
    if (typeof v === 'string') { const s = v.trim().toLowerCase(); return !(s === '' || s === '0' || s === 'false' || s === 'f' || s === 'nein'); }
    return true;
  }

  // Eine Abfrage im Kern ausführen → { columns, rows } oder Error
  function query(C, db, sql) {
    const s = clean(sql);
    if (!/^(select|with)\b/i.test(s)) throw new Error('Hier geht nur eine Abfrage mit SELECT.');
    if (C.split(s).length !== 1) throw new Error('Bitte nur eine einzige Abfrage (ohne ; dazwischen).');
    const r = C.run(db, s, { rights: 'use', readOnly: true, createDb: false, maxRows: MAX_ROWS });
    const err = r.results.find(x => x.kind === 'error');
    if (err) throw new Error(err.message + (err.hint ? ' – ' + err.hint : ''));
    const res = r.results.filter(x => x.kind === 'rows').pop();
    if (!res) throw new Error('Die Abfrage liefert keine Tabelle.');
    return res;
  }

  // erste Spalte als ganze Zahlen (doppelte weg)
  function idsOf(res) {
    const out = new Set();
    for (const row of res.rows) {
      const v = row[0];
      const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*\d{1,9}\s*$/.test(v) ? +v : NaN);
      if (Number.isInteger(n) && n > 0) out.add(n);
    }
    return Array.from(out).sort((a, b) => a - b);
  }

  /* Zielgruppe. users = alle User-ids des Netzwerks.
     → { a: [ids] | null (= alle), form: 'all'|'user'|'list', error } */
  function target(C, db, sql, users) {
    if (blank(sql)) return { a: null, form: 'all' };
    try {
      if (hasUser(sql)) {
        const a = [];
        for (const id of users) {
          const res = query(C, db, String(sql).replace(/\$user\b/gi, String(id)));
          if (res.rows.length && truthy(res.rows[0][0])) a.push(id);
        }
        return { a, form: 'user' };
      }
      const set = new Set(users);
      return { a: idsOf(query(C, db, sql)).filter(id => set.has(id)), form: 'list' };
    } catch (e) {
      return { a: [], form: hasUser(sql) ? 'user' : 'list', error: String(e && e.message || e) };
    }
  }

  /* Beworbene Fotos → { c: [ids], error } */
  function content(C, db, sql, photos) {
    if (blank(sql)) return { c: [] };
    if (hasUser(sql)) return { c: [], error: '$user geht nur bei „Wem?“ – hier geht es um Fotos, nicht um den User.' };
    try {
      const set = new Set(photos);
      return { c: idsOf(query(C, db, sql)).filter(id => set.has(id)) };
    } catch (e) {
      return { c: [], error: String(e && e.message || e) };
    }
  }

  const listIds = (C, db, t) => { try { return idsOf(query(C, db, 'SELECT id FROM ' + t)); } catch (e) { return []; } };

  /* Alle Kampagnen: ads = [{ id, kind, target_sql, content_sql }]
     → [{ id, a, c, n, nc, form, error, cerror }] */
  function all(C, db, ads) {
    const users = listIds(C, db, 'users');
    // „Was?“ (Boost) bzw. „Wo?“ (Anzeige am Foto, 0277) – beides Foto-ids aus content_sql
    const withC = x => x.kind === 'boost' || !blank(x.content_sql);
    const photos = ads.some(withC) ? listIds(C, db, 'photos') : [];
    return ads.map(ad => {
      const t = target(C, db, ad.target_sql, users);
      const out = { id: ad.id, a: t.a, form: t.form, n: t.a === null ? users.length : t.a.length, error: t.error || null };
      if (withC(ad)) {
        const k = content(C, db, ad.content_sql, photos);
        out.c = k.c; out.nc = k.c.length; out.cerror = k.error || null;
      } else out.c = null;
      return out;
    });
  }

  /* Probelauf im Editor: wen trifft es? → { ids, users: [[id, username]], error, form } */
  function probe(C, db, sql, kind) {
    if (kind === 'content') {
      const k = content(C, db, sql, listIds(C, db, 'photos'));
      let rows = [];
      if (k.c.length) { try { rows = query(C, db, 'SELECT id, description FROM photos WHERE id IN (' + k.c.slice(0, 200).join(',') + ')').rows; } catch (e) { rows = []; } }
      return { ids: k.c, rows, error: k.error || null };
    }
    const users = listIds(C, db, 'users');
    const t = target(C, db, sql, users);
    const ids = t.a === null ? users : t.a;
    let rows = [];
    if (ids.length) { try { rows = query(C, db, 'SELECT id, username FROM users WHERE id IN (' + ids.slice(0, 300).join(',') + ')').rows; } catch (e) { rows = []; } }
    return { ids, rows, all: t.a === null, form: t.form, error: t.error || null };
  }

  root.SHAdsEval = { clean, blank, hasUser, truthy, target, content, all, probe };
})(typeof self !== 'undefined' ? self : globalThis);
