/* ══════════════════════════════════════════════════════════════
   SQL Studio — js/panes.js   ·   Die vier Reiter
   ══════════════════════════════════════════════════════════════
   SQL       Editor + Ergebnisse. Beispiele passen sich an die
             geöffnete Datenbank an (echte Tabellen- und Spaltennamen).
   Daten     Tabelle blättern, sortieren, suchen, Zellen ändern,
             Zeilen einfügen und löschen. Jede Änderung zeigt danach,
             wie sie als SQL aussieht — so lernt man nebenbei.
   Struktur  Spalten per Formular. Das Formular schreibt MySQL-SQL
             (CREATE TABLE / ALTER TABLE … MODIFY …), zeigt es vor dem
             Ausführen und schickt es durch denselben Weg wie der
             Editor — also gelten dieselben Rechte und Fehlertexte.
   Diagramm  js/diagram.js.

   Alle Änderungen laufen über SQLApp.execSql — nichts schreibt an
   der Rechteprüfung vorbei.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const { $, $$, esc, icon, toast, dialog, confirm, download, tableHTML, csv, plural, ms } = window.SQLUI;
  const Core = window.SQLCore;
  const A = () => window.SQLApp;
  const q = n => Core.q(n);
  const lit = v => Core.lit(v);

  let tab = 'sql';
  const TABS = ['sql', 'data', 'struct', 'diagram'];

  function switchTab(t) {
    if (!TABS.includes(t)) return;
    tab = t;
    A().S.tab = t;
    $$('.tab').forEach(b => {
      const on = b.dataset.tab === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.pane').forEach(p => { p.hidden = p.id !== 'pane-' + t; });
    A().ls.set('tab', t);
    P[t].show && P[t].show();
  }

  function openTable(name, where) {
    A().S.table = name;
    const target = where || (tab === 'struct' ? 'struct' : 'data');
    if (target === 'data') data.select(name);
    if (target === 'struct') struct.select(name);
    switchTab(target);
    window.SQLPanes.onTable();
  }

  async function query(sql) {
    const r = await window.SQLWorker.call('run', { sql, rights: 'use', maxRows: 500 });
    return r.results[r.results.length - 1];
  }

  const table = (name) => A().S.schema.tables.find(t => t.name === name) || null;
  const viewOf = (name) => A().S.schema.views.find(v => v.name === name) || null;
  const isNumType = t => /INT|DEC|NUM|REAL|FLOA|DOUB|BOOL/i.test(t || '');
  const isTextType = t => !t || /CHAR|TEXT|CLOB|ENUM/i.test(t);

  /* Wert aus einem Eingabefeld → SQL-Literal, passend zur Spalte. */
  function literal(v, col) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    const s = String(v);
    if (col && isNumType(col.type) && /^-?\d+([.,]\d+)?$/.test(s.trim())) return s.trim().replace(',', '.');
    return lit(s);
  }

  /* ════════════════════════════════════════════════════════════
     SQL
     ════════════════════════════════════════════════════════════ */
  const sql = (function () {
    let ed = null;
    let saveTimer = null;
    let lastRun = null;      // { offset } für die Fehlermarke

    function edKey() { const c = A().S.cur; return c ? 'ed.' + c.id : 'ed'; }

    function starter() {
      const sc = A().S.schema;
      const t = sc.tables[0];
      return '-- Willkommen in SQL Studio!\n' +
        '-- Schreibe hier SQL und drücke ▶ Ausführen (oder Strg+Enter).\n' +
        '-- Unter „Beispiele" findest du Vorlagen für diese Datenbank.\n\n' +
        (t ? 'SELECT * FROM ' + q(t.name) + ';\n' : 'CREATE TABLE beispiel (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL\n);\n');
    }

    function init() {
      const root = $('#pane-sql');
      root.innerHTML =
        '<div class="bar">' +
          '<button type="button" class="btn btn--primary" id="btnRun">' + icon('play') + '<span>Ausführen</span><kbd>Strg ↵</kbd></button>' +
          '<div class="dd"><button type="button" class="btn" id="btnEx" aria-haspopup="true">' + icon('book') + '<span>Beispiele</span></button><div class="dd-menu" id="exMenu" hidden></div></div>' +
          '<div class="dd"><button type="button" class="btn" id="btnHist" aria-haspopup="true">' + icon('clock') + '<span>Verlauf</span></button><div class="dd-menu" id="histMenu" hidden></div></div>' +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn btn--ghost" id="btnClear" title="Editor leeren">' + icon('trash') + '<span class="hide-s">Leeren</span></button>' +
        '</div>' +
        '<div class="sql-ed" id="sqlEd"></div>' +
        '<div class="split" id="split" role="separator" aria-orientation="horizontal" title="Ziehen, um die Höhe zu ändern"><span></span></div>' +
        '<div class="sql-res" id="sqlRes"><div class="res-empty">' + icon('play') + '<p>Hier erscheinen die Ergebnisse.</p></div></div>';
      ed = window.SQLEditor.create($('#sqlEd'), {
        onRun: run,
        getSchema: () => A().S.schema,
        onChange: (v) => { clearTimeout(saveTimer); saveTimer = setTimeout(() => A().ls.set(edKey(), v), 400); }
      });
      const h = parseInt(A().ls.get('edh'), 10);
      if (h > 80) $('#sqlEd').style.height = h + 'px';
      $('#btnRun').addEventListener('click', run);
      $('#btnClear').addEventListener('click', () => { ed.value = ''; A().ls.set(edKey(), ''); ed.focus(); });
      $('#btnEx').addEventListener('click', (e) => { e.stopPropagation(); toggleDd('exMenu', exMenu); });
      $('#btnHist').addEventListener('click', (e) => { e.stopPropagation(); toggleDd('histMenu', histMenu); });
      $('#exMenu').addEventListener('click', (e) => {
        const b = e.target.closest('[data-ex]');
        if (!b) return;
        ed.insert(EX_CACHE[+b.dataset.ex]);
        toggleDd('exMenu', null, false);
      });
      $('#histMenu').addEventListener('click', (e) => {
        const b = e.target.closest('[data-h]');
        if (!b) return;
        const hist = loadHist();
        ed.value = hist[+b.dataset.h].sql;
        A().ls.set(edKey(), ed.value);
        toggleDd('histMenu', null, false);
        ed.focus();
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.dd')) { toggleDd('exMenu', null, false); toggleDd('histMenu', null, false); }
      });
      // Höhe des Editors ziehen
      const split = $('#split');
      split.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        split.setPointerCapture(e.pointerId);
        const box = $('#sqlEd');
        const y0 = e.clientY, h0 = box.offsetHeight;
        const move = (ev) => { box.style.height = Math.max(90, Math.min(window.innerHeight - 200, h0 + ev.clientY - y0)) + 'px'; };
        const up = () => {
          split.removeEventListener('pointermove', move);
          split.removeEventListener('pointerup', up);
          A().ls.set('edh', String(box.offsetHeight));
        };
        split.addEventListener('pointermove', move);
        split.addEventListener('pointerup', up);
      });
      $('#sqlRes').addEventListener('click', (e) => {
        const b = e.target.closest('[data-csv]');
        if (b) {
          const r = LAST_RESULTS[+b.dataset.csv];
          if (r) download('ergebnis.csv', csv(r.columns, r.rows), 'text/csv;charset=utf-8');
        }
        const t = e.target.closest('[data-tr]');
        if (t) t.closest('.rc').classList.toggle('show-tr');
      });
    }

    function toggleDd(id, fill, force) {
      const m = $('#' + id);
      const open = force !== undefined ? force : m.hidden;
      if (open && fill) fill(m);
      m.hidden = !open;
    }

    /* Beispiele mit echten Namen aus der geöffneten Datenbank */
    let EX_CACHE = [];
    function exMenu(m) {
      const sc = A().S.schema;
      const t = sc.tables.find(x => x.columns.length > 2) || sc.tables[0];
      const groups = [];
      if (t) {
        const tn = q(t.name);
        const cols = t.columns;
        const pk = cols.find(c => c.pk) || cols[0];
        const txt = cols.find(c => !c.pk && !c.fk && isTextType(c.type) && !c.enumValues) || cols.find(c => !c.pk) || cols[0];
        const grp = cols.find(c => c.enumValues) || cols.find(c => c.fk) || txt;
        const two = cols.filter(c => !c.pk).slice(0, 2).map(c => q(c.name));
        const child = sc.tables.find(x => x.fks.length && table(x.fks[0].ref));
        const ins = cols.filter(c => !c.ai && !c.generated);
        const sample = c => c.enumValues ? lit(c.enumValues[0]) : c.fk ? '1' : /DATE/i.test(c.type) ? "'2026-10-23'" : isNumType(c.type) ? '0' : "'…'";
        const ex = [
          ['Abfragen', 'Alle Zeilen einer Tabelle', 'SELECT * FROM ' + tn + ';'],
          ['Abfragen', 'Bestimmte Spalten, sortiert', 'SELECT ' + (two.join(', ') || '*') + '\nFROM ' + tn + '\nORDER BY ' + (two[0] || q(pk.name)) + ';'],
          ['Abfragen', 'Filtern mit WHERE', 'SELECT *\nFROM ' + tn + '\nWHERE ' + q(txt.name) + " LIKE 'A%';"],
          ['Abfragen', 'Zählen und gruppieren', 'SELECT ' + q(grp.name) + ', COUNT(*) AS anzahl\nFROM ' + tn + '\nGROUP BY ' + q(grp.name) + '\nORDER BY anzahl DESC;']
        ];
        if (child) {
          const f = child.fks[0], par = table(f.ref);
          const ct = child.columns.find(c => !c.pk && !c.fk && isTextType(c.type)) || child.columns[0];
          const pt = par.columns.find(c => !c.pk && isTextType(c.type)) || par.columns[0];
          ex.push(['Abfragen', 'Zwei Tabellen verbinden (JOIN)',
            'SELECT c.' + q(ct.name) + ', p.' + q(pt.name) + '\nFROM ' + q(child.name) + ' c\nJOIN ' + q(par.name) + ' p ON p.' + q(f.refCols[0]) + ' = c.' + q(f.cols[0]) + ';']);
        }
        ex.push(['Abfragen', 'Tabellen und Spalten zeigen', 'SHOW TABLES;\nDESCRIBE ' + tn + ';']);
        ex.push(['Daten ändern', 'Neue Zeile einfügen (INSERT)', 'INSERT INTO ' + tn + ' (' + ins.map(c => q(c.name)).join(', ') + ')\nVALUES (' + ins.map(sample).join(', ') + ');']);
        ex.push(['Daten ändern', 'Zeilen ändern (UPDATE)', 'UPDATE ' + tn + '\nSET ' + q(txt.name) + " = '…'\nWHERE " + q(pk.name) + ' = 1;']);
        ex.push(['Daten ändern', 'Zeilen löschen (DELETE)', 'DELETE FROM ' + tn + '\nWHERE ' + q(pk.name) + ' = 1;']);
        if (A().can('modify')) ex.push(['Struktur', 'Spalte hinzufügen', 'ALTER TABLE ' + tn + '\nADD COLUMN notiz VARCHAR(100);']);
        groups.push(...ex);
      }
      if (A().can('modify')) {
        groups.push(['Struktur', 'Neue Tabelle anlegen', 'CREATE TABLE beispiel (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL,\n  erstellt_am DATE\n);']);
        groups.push(['Struktur', 'Tabelle mit UUID als Schlüssel', 'CREATE TABLE geraet (\n  id UUID PRIMARY KEY DEFAULT (UUID()),\n  name VARCHAR(50) NOT NULL\n);\nINSERT INTO geraet (name) VALUES (\'Tablet 1\'), (\'Tablet 2\');\nSELECT * FROM geraet;']);
        if (t) groups.push(['Struktur', 'Tabelle mit Fremdschlüssel', 'CREATE TABLE notiz (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  text VARCHAR(200) NOT NULL,\n  ' + q(t.name + '_id') + ' INT,\n  FOREIGN KEY (' + q(t.name + '_id') + ') REFERENCES ' + q(t.name) + '(' + q((t.columns.find(c => c.pk) || t.columns[0]).name) + ')\n);']);
      }
      if (A().can('create')) groups.push(['Datenbank', 'Neue Datenbank anlegen', 'CREATE DATABASE meine_db;\nUSE meine_db;']);
      EX_CACHE = groups.map(g => g[2]);
      let last = '';
      m.innerHTML = groups.map((g, i) => {
        const head = g[0] !== last ? '<div class="menu-head">' + esc(g[0]) + '</div>' : '';
        last = g[0];
        return head + '<button type="button" class="menu-it" data-ex="' + i + '"><span>' + esc(g[1]) + '</span></button>';
      }).join('') || '<div class="menu-head">Keine Beispiele</div>';
    }

    function loadHist() {
      try { return JSON.parse(A().ls.get('hist') || '[]'); } catch (e) { return []; }
    }
    function pushHist(text) {
      const h = loadHist().filter(x => x.sql !== text);
      h.unshift({ sql: text, db: A().titleOf(A().S.cur), t: Date.now() });
      A().ls.set('hist', JSON.stringify(h.slice(0, 30)));
    }
    function histMenu(m) {
      const h = loadHist();
      if (!h.length) { m.innerHTML = '<div class="menu-head">Noch nichts ausgeführt</div>'; return; }
      m.innerHTML = h.map((x, i) => {
        const d = new Date(x.t);
        const when = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const first = x.sql.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--'))[0] || x.sql.trim();
        return '<button type="button" class="menu-it hist" data-h="' + i + '"><span class="h-sql">' + esc(first.slice(0, 80)) + '</span>' +
          '<span class="h-meta">' + esc(x.db || '') + ' · ' + when + '</span></button>';
      }).join('');
    }

    async function run() {
      if (A().S.busy) return;
      const sel = ed.selection();
      const text = sel ? sel.text : ed.value;
      if (!text.trim()) { ed.focus(); return; }
      ed.clearMark();
      lastRun = { offset: sel ? sel.start : 0 };
      $('#btnRun').disabled = true;
      try {
        const res = await A().execSql(text, { offset: lastRun.offset });
        pushHist(text.trim());
        showResults(res);
        const err = res.find(r => r.kind === 'error');
        if (err && err.start !== undefined && err.end > err.start) ed.markError(err.start, err.end);
      } finally { $('#btnRun').disabled = false; }
    }

    let LAST_RESULTS = [];
    function card(r, i) {
      const head = (ic, msg, meta, extra) =>
        '<div class="rc-h">' + icon(ic) + '<span class="rc-msg">' + msg + '</span>' + (meta ? '<span class="rc-meta">' + meta + '</span>' : '') + (extra || '') + '</div>';
      const stmt = r.sql ? '<pre class="rc-sql">' + esc(r.sql.length > 400 ? r.sql.slice(0, 400) + ' …' : r.sql) + '</pre>' : '';
      const tr = r.translated ? '<button type="button" class="rc-tr-btn" data-tr>So lief es in SQLite</button><pre class="rc-tr">' + esc(r.translated) + '</pre>' : '';
      const warn = (r.warn || []).map(w => '<div class="rc-warn">' + icon('warn') + '<span>' + esc(w) + '</span></div>').join('');
      if (r.kind === 'error') {
        return '<div class="rc rc--err">' + head('warn', esc(r.message), r.denied ? 'kein Recht' : '') +
          (r.hint ? '<div class="rc-hint">' + esc(r.hint) + '</div>' : '') + stmt +
          (r.raw && r.raw !== r.message ? '<div class="rc-raw">SQLite: ' + esc(r.raw) + '</div>' : '') + '</div>';
      }
      if (r.kind === 'rows') {
        const n = r.rows.length;
        const msg = n ? plural(n, 'Zeile', 'Zeilen') + (r.truncated ? ' (die ersten ' + n + ')' : '') : 'Keine Zeilen gefunden.';
        const csvBtn = n ? '<button type="button" class="btn btn--mini" data-csv="' + i + '" title="Als CSV-Datei speichern (öffnet in Excel)">' + icon('download') + '<span>CSV</span></button>' : '';
        return '<div class="rc rc--rows">' + head('check', msg, r.ms !== undefined ? ms(r.ms) : '', csvBtn) + stmt + warn + tr +
          (n ? tableHTML(r.columns, r.rows) : '') + '</div>';
      }
      const ic = r.kind === 'info' ? 'info' : 'check';
      return '<div class="rc rc--' + (r.kind === 'info' ? 'info' : 'ok') + '">' + head(ic, esc(r.message), r.ms !== undefined ? ms(r.ms) : '') + stmt + warn + tr + '</div>';
    }

    function showResults(res, label) {
      LAST_RESULTS = res;
      const box = $('#sqlRes');
      if (!res.length) { box.innerHTML = '<div class="res-empty"><p>Keine Anweisung gefunden.</p></div>'; return; }
      const nErr = res.filter(r => r.kind === 'error').length;
      let h = '<div class="res-sum">' + (label ? '<b>' + esc(label) + '</b> · ' : '') + plural(res.length, 'Anweisung', 'Anweisungen') +
        (nErr ? ' · <span class="bad">angehalten beim Fehler</span>' : '') + '</div>';
      // Lange Folgen gleichförmiger Meldungen (Import!) zusammenfassen
      let i = 0;
      while (i < res.length) {
        let j = i;
        while (j < res.length && (res[j].kind === 'done' || res[j].kind === 'info') && !(res[j].warn && res[j].warn.length)) j++;
        if (j - i > 4) {
          h += '<details class="rc rc--ok rc-group"><summary>' + icon('check') + '<span class="rc-msg">' + (j - i) + ' Anweisungen erfolgreich</span></summary>' +
            res.slice(i, j).map(r => '<div class="rc-line">' + esc(r.message) + ' <code>' + esc((r.sql || '').split('\n')[0].slice(0, 90)) + '</code></div>').join('') + '</details>';
          i = j;
        } else {
          h += card(res[i], i);
          i++;
        }
      }
      box.innerHTML = h;
      box.scrollTop = 0;
      const firstErr = box.querySelector('.rc--err');
      if (firstErr && res.length > 3) firstErr.scrollIntoView({ block: 'nearest' });
    }

    return {
      init,
      show() { ed.repaint(); },
      onDb() {
        // Wechsel mitten im Lauf (USE, CREATE DATABASE): Text und
        // Ergebnisse bleiben stehen — der Text gilt dann auch hier.
        if (A().S.busy) { A().ls.set(edKey(), ed.value); return; }
        const v = A().ls.get(edKey());
        ed.value = v === null ? starter() : v;
        $('#sqlRes').innerHTML = '<div class="res-empty">' + icon('play') + '<p>Hier erscheinen die Ergebnisse.</p></div>';
      },
      onSchema() { ed.repaint(); },
      showResults,
      insert(text) { ed.insert(text); },
      setValue(text) { ed.value = text; A().ls.set(edKey(), text); }
    };
  })();

  /* ════════════════════════════════════════════════════════════
     Daten
     ════════════════════════════════════════════════════════════ */
  const data = (function () {
    const D = { table: null, offset: 0, limit: 50, orderBy: null, desc: false, filter: '', page: null, sel: null };
    let filterTimer = null;

    function init() {
      const root = $('#pane-data');
      root.innerHTML =
        '<div class="bar">' +
          '<label class="sel-wrap">' + icon('table') + '<select id="dTable" aria-label="Tabelle"></select></label>' +
          '<label class="search">' + icon('search') + '<input id="dFilter" type="search" placeholder="Suchen …" autocomplete="off"></label>' +
          '<button type="button" class="btn" id="dAdd">' + icon('plus') + '<span>Zeile</span></button>' +
          '<span class="spacer"></span>' +
          '<span class="pager"><span id="dCount"></span>' +
            '<button type="button" class="btn btn--icon" id="dPrev" aria-label="Zurück">' + icon('chevl') + '</button>' +
            '<button type="button" class="btn btn--icon" id="dNext" aria-label="Weiter">' + icon('chevr') + '</button></span>' +
        '</div>' +
        '<div class="grid-wrap" id="dGrid"></div>' +
        '<div class="sqllog" id="dLog" hidden></div>';
      $('#dTable').addEventListener('change', (e) => { A().S.table = e.target.value; select(e.target.value); window.SQLPanes.onTable(); });
      $('#dFilter').addEventListener('input', (e) => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(() => { D.filter = e.target.value.trim(); D.offset = 0; load(); }, 250);
      });
      $('#dPrev').addEventListener('click', () => { D.offset = Math.max(0, D.offset - D.limit); load(); });
      $('#dNext').addEventListener('click', () => { if (D.page && D.offset + D.limit < D.page.total) { D.offset += D.limit; load(); } });
      $('#dAdd').addEventListener('click', addRow);
      const grid = $('#dGrid');
      grid.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-c]');
        if (th) {
          const c = D.page.columns[+th.dataset.c];
          if (D.orderBy === c) { if (D.desc) { D.orderBy = null; D.desc = false; } else D.desc = true; }
          else { D.orderBy = c; D.desc = false; }
          D.offset = 0; load();
          return;
        }
        const del = e.target.closest('[data-del]');
        if (del) { delRow(+del.dataset.del); return; }
        const td = e.target.closest('td[data-r]');
        if (td && !td.classList.contains('editing')) {
          const key = td.dataset.r + ':' + td.dataset.c;
          if (D.sel === key) edit(td);
          else { $$('td.sel', grid).forEach(x => x.classList.remove('sel')); td.classList.add('sel'); D.sel = key; }
        }
      });
      grid.addEventListener('dblclick', (e) => {
        const td = e.target.closest('td[data-r]');
        if (td && !td.classList.contains('editing')) edit(td);
      });
      $('#dLog').addEventListener('click', (e) => {
        if (e.target.closest('[data-toed]')) {
          const s = $('#dLog code').textContent;
          switchTab('sql');
          sql.insert(s);
        }
      });
    }

    function fillSelect() {
      const sc = A().S.schema;
      const s = $('#dTable');
      s.innerHTML = sc.tables.map(t => '<option value="' + esc(t.name) + '">' + esc(t.name) + '</option>').join('') +
        (sc.views.length ? '<optgroup label="Sichten">' + sc.views.map(v => '<option value="' + esc(v.name) + '">' + esc(v.name) + '</option>').join('') + '</optgroup>' : '');
      if (D.table) s.value = D.table;
    }

    function select(name) {
      if (D.table !== name) { D.offset = 0; D.orderBy = null; D.desc = false; D.filter = ''; $('#dFilter').value = ''; }
      D.table = name;
      D.sel = null;
      fillSelect();
      load();
    }

    async function load() {
      const grid = $('#dGrid');
      const sc = A().S.schema;
      if (!sc.tables.length && !sc.views.length) {
        grid.innerHTML = '<div class="pane-empty">' + icon('table') + '<p>Diese Datenbank hat noch keine Tabellen.</p></div>';
        $('#dCount').textContent = ''; $('#dAdd').disabled = true;
        return;
      }
      if (!D.table || (!table(D.table) && !viewOf(D.table))) { D.table = (sc.tables[0] || sc.views[0]).name; fillSelect(); }
      let p;
      try {
        p = await window.SQLWorker.call('page', { table: D.table, offset: D.offset, limit: D.limit, orderBy: D.orderBy, desc: D.desc, filter: D.filter });
      } catch (e) {
        grid.innerHTML = '<div class="pane-empty"><p>' + esc(e.message) + '</p></div>';
        return;
      }
      D.page = p;
      render();
    }

    function colInfo(name) {
      const t = table(D.table);
      return t ? t.columns.find(c => c.name === name) : null;
    }

    function render() {
      const p = D.page;
      const t = table(D.table);
      const ro = p.isView || !A().can('use');
      $('#dAdd').disabled = ro;
      const from = p.total ? p.offset + 1 : 0, to = Math.min(p.total, p.offset + p.limit);
      $('#dCount').textContent = p.total ? from + '–' + to + ' von ' + p.total : (D.filter ? 'keine Treffer' : 'leer');
      $('#dPrev').disabled = p.offset === 0;
      $('#dNext').disabled = to >= p.total;
      let h = '<table class="grid"><thead><tr>' + (ro ? '' : '<th class="g-act"></th>');
      p.columns.forEach((c, i) => {
        const ci = colInfo(c);
        const keys = ci ? (ci.pk ? icon('key', 'k-pk') : '') + (ci.fk ? icon('link', 'k-fk') : '') : '';
        const sort = D.orderBy === c ? '<span class="g-sort">' + icon(D.desc ? 'down' : 'up') + '</span>' : '';
        h += '<th data-c="' + i + '" title="' + esc(ci && ci.fk ? 'Fremdschlüssel → ' + ci.fk.table + '.' + ci.fk.col : 'Sortieren') + '">' +
          '<span class="g-name">' + keys + esc(c) + (ci && ci.fk ? '<span class="fk-up" aria-label="Fremdschlüssel">↑</span>' : '') + sort + '</span>' +
          '<span class="g-type">' + esc(ci ? (ci.enumValues ? 'ENUM' : ci.type || '') : '') + '</span></th>';
      });
      h += '</tr></thead><tbody>';
      if (!p.rows.length) {
        h += '<tr><td class="g-none" colspan="' + (p.columns.length + 1) + '">' + (D.filter ? 'Nichts gefunden für »' + esc(D.filter) + '«.' : 'Die Tabelle ist leer.' + (ro ? '' : ' Mit <b>+ Zeile</b> fügst du etwas ein.')) + '</td></tr>';
      }
      p.rows.forEach((r, ri) => {
        h += '<tr>' + (ro ? '' : '<td class="g-act"><button type="button" class="g-del" data-del="' + ri + '" title="Zeile löschen" aria-label="Zeile löschen">' + icon('trash') + '</button></td>');
        r.forEach((v, ci) => {
          const cls = v === null ? 'c-null' : typeof v === 'number' ? 'c-num' : '';
          const txt = v === null ? 'NULL' : typeof v === 'object' ? '[BLOB]' : String(v);
          h += '<td data-r="' + ri + '" data-c="' + ci + '" class="' + cls + (ro ? ' ro' : '') + '">' + esc(txt.length > 200 ? txt.slice(0, 200) + '…' : txt) + '</td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table>';
      $('#dGrid').innerHTML = h;
      void t;
    }

    function whereOf(ri) {
      const p = D.page;
      if (p.pk.length) {
        return p.pk.map(c => {
          const v = p.rows[ri][p.columns.indexOf(c)];
          return q(c) + (v === null ? ' IS NULL' : ' = ' + literal(v, colInfo(c)));
        }).join(' AND ');
      }
      return 'rowid = ' + p.rowids[ri];
    }

    function log(sqlText, res) {
      const box = $('#dLog');
      const err = res.find(r => r.kind === 'error');
      box.hidden = false;
      box.className = 'sqllog' + (err ? ' bad' : '');
      box.innerHTML = (err ? icon('warn') + '<span class="sl-msg">' + esc(err.message) + (err.hint ? ' ' + esc(err.hint) : '') + '</span>'
        : icon('check') + '<span class="sl-msg">So sieht das als SQL aus:</span>') +
        '<code>' + esc(sqlText) + '</code>' +
        '<button type="button" class="btn btn--mini" data-toed>In den Editor</button>';
    }

    async function apply(sqlText) {
      const res = await A().execSql(sqlText);
      log(sqlText, res);
      const err = res.find(r => r.kind === 'error');
      if (!err) await load();
      return !err;
    }

    function edit(td) {
      if (D.page.isView) { toast('Eine Sicht (VIEW) lässt sich nicht direkt bearbeiten.'); return; }
      if (!A().can('use')) { toast('Diese Datenbank kannst du hier nur ansehen.'); return; }
      const ri = +td.dataset.r, ci = +td.dataset.c;
      const col = D.page.columns[ci];
      const info = colInfo(col);
      const old = D.page.rows[ri][ci];
      if (old && typeof old === 'object') return;
      td.classList.add('editing');
      const w = Math.max(td.offsetWidth, 140);
      let inp;
      if (info && info.enumValues) {
        inp = '<select class="g-in">' + (info.notnull ? '' : '<option value="__null__">NULL</option>') +
          info.enumValues.map(v => '<option' + (v === old ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select>';
      } else {
        inp = '<input class="g-in" value="' + esc(old === null ? '' : String(old)) + '" ' + (old === null ? 'placeholder="NULL"' : '') + '>';
      }
      td.innerHTML = '<div class="g-edit" style="min-width:' + w + 'px">' + inp +
        (info && info.notnull ? '' : '<button type="button" class="g-nullbtn" title="Leer (NULL) setzen">NULL</button>') + '</div>';
      const el = td.querySelector('.g-in');
      el.focus();
      if (el.select) el.select();
      let done = false;
      const finish = async (save, forceNull) => {
        if (done) return;
        done = true;
        let v = forceNull ? null : el.value;
        if (v === '__null__') v = null;
        if (!forceNull && el.tagName === 'INPUT' && v === '' && old === null) v = null;
        const same = (v === null && old === null) || (v !== null && old !== null && String(v) === String(old));
        if (!save || same) { render(); return; }
        const s = 'UPDATE ' + q(D.page.table) + ' SET ' + q(col) + ' = ' + literal(v, info) + ' WHERE ' + whereOf(ri) + ';';
        const ok = await apply(s);
        if (!ok) render();
      };
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      el.addEventListener('blur', () => setTimeout(() => finish(true), 120));
      const nb = td.querySelector('.g-nullbtn');
      if (nb) nb.addEventListener('pointerdown', (e) => { e.preventDefault(); finish(true, true); });
      if (el.tagName === 'SELECT') el.addEventListener('change', () => finish(true));
    }

    async function delRow(ri) {
      const s = 'DELETE FROM ' + q(D.page.table) + ' WHERE ' + whereOf(ri) + ';';
      const ok = await confirm('Zeile löschen?', 'Diese Anweisung wird ausgeführt:<pre class="dlg-sql">' + esc(s) + '</pre>', 'Löschen', 'danger');
      if (ok) apply(s);
    }

    async function fkOptions(c) {
      const par = table(c.fk.table);
      if (!par) return null;
      const labels = par.columns.filter(x => !x.pk && isTextType(x.type) && !x.enumValues).slice(0, 2);
      const s = 'SELECT ' + q(c.fk.col) + (labels.length ? ', ' + labels.map(x => q(x.name)).join(" || ' ' || ") : '') +
        ' FROM ' + q(par.name) + ' ORDER BY 1 LIMIT 500';
      try {
        const r = await query(s);
        return r.kind === 'rows' ? r.rows : null;
      } catch (e) { return null; }
    }

    async function addRow() {
      const t = table(D.table);
      if (!t) return;
      const fields = [];
      for (const c of t.columns) {
        if (c.generated) continue;
        const req = c.notnull && !c.ai && (c.dflt === null || c.dflt === undefined) && !(c.pk && /^INT/i.test(c.type) && t.pk.length === 1);
        let inp;
        const name = 'f_' + fields.length;
        if (c.ai || (c.pk && /^INTEGER$/i.test(c.type) && t.pk.length === 1)) {
          inp = '<input name="' + name + '" placeholder="automatisch" inputmode="numeric">';
        } else if (c.enumValues) {
          inp = '<select name="' + name + '">' + (req ? '' : '<option value="">(leer)</option>') + c.enumValues.map(v => '<option>' + esc(v) + '</option>').join('') + '</select>';
        } else if (c.fk) {
          const opts = await fkOptions(c);
          if (opts) {
            inp = '<select name="' + name + '">' + (req ? '' : '<option value="">(leer)</option>') +
              opts.map(o => '<option value="' + esc(o[0]) + '">' + esc(o[0]) + (o.length > 1 && o[1] !== null ? ' – ' + esc(o[1]) : '') + '</option>').join('') + '</select>';
          }
        } else if (/^DATE$/i.test(c.type)) {
          inp = '<input name="' + name + '" type="date">';
        } else if (/BOOL/i.test(c.type)) {
          inp = '<select name="' + name + '"><option value="">(leer)</option><option value="1">1 – wahr</option><option value="0">0 – falsch</option></select>';
        }
        if (!inp) {
          const ph = c.dflt && /uuid/i.test(c.dflt) ? 'automatisch (UUID)'
            : /DATETIME|TIMESTAMP/i.test(c.type) ? 'JJJJ-MM-TT hh:mm:ss'
            : (c.dflt !== null && c.dflt !== undefined ? 'Standard: ' + c.dflt : /^UUID$/i.test(c.type) ? 'z. B. ' + crypto.randomUUID() : '');
          inp = '<input name="' + name + '"' + (isNumType(c.type) ? ' inputmode="decimal"' : '') + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' autocomplete="off">';
        }
        fields.push({ c, name, req });
        const badges = (c.pk ? '<span class="badge">PK</span>' : '') + (c.fk ? '<span class="badge badge--fk">→ ' + esc(c.fk.table) + '</span>' : '') + (req ? '<span class="badge badge--req">Pflicht</span>' : '');
        fields[fields.length - 1].html = '<label class="fld"><span>' + esc(c.name) + ' <small>' + esc(c.enumValues ? 'ENUM' : c.type) + '</small>' + badges + '</span>' + inp + '</label>';
      }
      let lastSql = '';
      const build = (f) => {
        const cols = [], vals = [];
        for (const x of fields) {
          const el = f[x.name];
          const v = el.value;
          if (v === '') continue;
          cols.push(q(x.c.name)); vals.push(literal(v, x.c));
        }
        return cols.length
          ? 'INSERT INTO ' + q(t.name) + ' (' + cols.join(', ') + ')\nVALUES (' + vals.join(', ') + ');'
          : 'INSERT INTO ' + q(t.name) + ' DEFAULT VALUES;';
      };
      const ok = await dialog({
        title: 'Neue Zeile in »' + t.name + '«',
        wide: true,
        body: '<div class="form-grid">' + fields.map(x => x.html).join('') + '</div><pre class="dlg-sql" id="insPrev"></pre>',
        buttons: [{ label: 'Abbrechen', value: false }, { label: 'Einfügen', kind: 'primary', submit: true, value: true }],
        onOpen: (f) => {
          const upd = () => { lastSql = build(f); f.querySelector('#insPrev').textContent = lastSql; };
          f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
        },
        validate: async (f) => {
          const miss = fields.filter(x => x.req && f[x.name].value === '').map(x => x.c.name);
          if (miss.length) return 'Bitte ausfüllen: ' + miss.join(', ');
          lastSql = build(f);
          const res = await A().execSql(lastSql);
          const err = res.find(r => r.kind === 'error');
          if (err) return err.message + (err.hint ? ' ' + err.hint : '');
          return null;
        }
      });
      if (ok) {
        log(lastSql.replace(/\n/g, ' '), [{ kind: 'done' }]);
        // Neue Zeile steht am Ende — dorthin blättern
        D.orderBy = null; D.filter = ''; $('#dFilter').value = '';
        const total = (D.page ? D.page.total : 0) + 1;
        D.offset = Math.max(0, Math.floor((total - 1) / D.limit) * D.limit);
        await load();
        toast('Zeile eingefügt.');
      }
    }

    return {
      init, select,
      show(force) { if (force || !D.page || D.page.table !== A().S.table) { if (A().S.table) D.table = A().S.table; fillSelect(); load(); } },
      onDb() { D.table = null; D.page = null; D.offset = 0; D.orderBy = null; D.filter = ''; $('#dFilter').value = ''; $('#dLog').hidden = true; if (tab === 'data') { fillSelect(); load(); } },
      onSchema() { fillSelect(); if (tab === 'data') load(); else D.page = null; },
      onRights() {}
    };
  })();

  /* ════════════════════════════════════════════════════════════
     Struktur
     ════════════════════════════════════════════════════════════ */
  const struct = (function () {
    const TYPES = ['INT', 'VARCHAR', 'CHAR', 'TEXT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'BOOLEAN', 'DATE', 'DATETIME', 'TIME', 'ENUM', 'UUID', 'BLOB'];
    const ARG = { VARCHAR: '50', CHAR: '1', DECIMAL: '8,2', ENUM: "'a','b'" };
    const T = { table: null, mode: 'view', rows: [], orig: [], name: '', err: null };

    const splitType = (type, enumValues) => {
      if (enumValues) return { base: 'ENUM', arg: enumValues.map(v => lit(v)).join(',') };
      const m = /^\s*([A-Za-z][A-Za-z ]*?)\s*(?:\((.*)\))?\s*$/.exec(type || '');
      if (!m) return { base: type || '', arg: '' };
      let base = m[1].toUpperCase();
      if (base === 'INTEGER') base = 'INT';
      if (!TYPES.includes(base)) return { base: (type || '').toUpperCase(), arg: '' };
      return { base, arg: m[2] || '' };
    };

    function rowOf(c) {
      const { base, arg } = splitType(c.type, c.enumValues);
      return {
        orig: c.name, name: c.name, base, arg, pk: c.pk, ai: c.ai, notnull: c.notnull && !c.pk,
        unique: c.unique && !c.pk, dflt: c.dflt === null || c.dflt === undefined ? '' : String(c.dflt),
        fk: c.fk ? c.fk.table + '.' + c.fk.col : '', fkName: c.fk ? c.fk.name : null, generated: c.generated
      };
    }

    const typeStr = r => {
      if (r.base === 'ENUM') return 'ENUM(' + r.arg + ')';
      if (['VARCHAR', 'CHAR', 'DECIMAL'].includes(r.base) && r.arg.trim()) return r.base + '(' + r.arg.trim() + ')';
      return r.base;
    };
    const dfltSql = v => {
      const s = v.trim();
      if (/^-?\d+(\.\d+)?$/.test(s) || /^(NULL|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|TRUE|FALSE)$/i.test(s)) return s.toUpperCase() === s.toLowerCase() ? s : s.toUpperCase();
      if (/^'.*'$/s.test(s) || /^\(.*\)$/s.test(s)) return s;
      // UUID(), gen_random_uuid() … → als Ausdruck in Klammern
      if (/^[A-Za-z_][A-Za-z0-9_]*\(\s*\)$/.test(s)) return '(' + s + ')';
      return lit(s);
    };
    const coldef = (r, pkInline) => {
      let s = q(r.name) + ' ' + typeStr(r);
      if (r.notnull && !r.pk) s += ' NOT NULL';
      if (r.ai) s += ' AUTO_INCREMENT';
      if (pkInline) s += ' PRIMARY KEY';
      if (r.unique && !r.pk) s += ' UNIQUE';
      if (r.dflt.trim() !== '') s += ' DEFAULT ' + dfltSql(r.dflt);
      return s;
    };
    const sig = r => [r.name, typeStr(r), !!r.notnull && !r.pk, !!r.ai, !!r.unique && !r.pk, r.dflt.trim()].join('|');

    /* Formular → SQL. Für eine neue Tabelle CREATE TABLE, sonst EIN
       ALTER TABLE mit allen Änderungen (wie in phpMyAdmin). */
    function generate() {
      const rows = T.rows;
      const pk = rows.filter(r => r.pk);
      const fkSql = r => {
        const [t, c] = r.fk.split('.');
        return 'FOREIGN KEY (' + q(r.name) + ') REFERENCES ' + q(t) + '(' + q(c) + ')';
      };
      if (T.mode === 'new') {
        const lines = rows.map(r => '  ' + coldef(r, pk.length === 1 && r.pk));
        if (pk.length > 1) lines.push('  PRIMARY KEY (' + pk.map(r => q(r.name)).join(', ') + ')');
        rows.filter(r => r.fk).forEach(r => lines.push('  ' + fkSql(r)));
        return 'CREATE TABLE ' + q(T.name.trim() || 'neue_tabelle') + ' (\n' + lines.join(',\n') + '\n);';
      }
      const t = table(T.table);
      if (!t) return '';
      const acts = [], first = [], last = [];
      const orig = T.orig;
      const byOrig = Object.fromEntries(orig.map(r => [r.orig, r]));
      // Primärschlüssel
      const oldPk = orig.filter(r => r.pk).map(r => r.orig).join(',');
      const newPk = rows.filter(r => r.pk).map(r => r.orig || '#' + r.name).join(',');
      const pkChanged = oldPk !== newPk;
      if (pkChanged && oldPk) first.push('DROP PRIMARY KEY');
      if (pkChanged && pk.length) last.push('ADD PRIMARY KEY (' + pk.map(r => q(r.name)).join(', ') + ')');
      // Fremdschlüssel (je eine Spalte)
      rows.forEach(r => {
        const o = r.orig ? byOrig[r.orig] : null;
        const was = o ? o.fk : '';
        if (was === r.fk) return;
        if (was) first.push('DROP FOREIGN KEY ' + q(o.fkName || o.orig));
        if (r.fk) last.push('ADD CONSTRAINT ' + q('fk_' + t.name + '_' + r.name) + ' ' + fkSql(r));
      });
      // Gelöschte Spalten
      orig.forEach(o => { if (!rows.some(r => r.orig === o.orig)) acts.push('DROP COLUMN ' + q(o.orig)); });
      // Reihenfolge geändert?
      const keptOld = orig.map(o => o.orig).filter(n => rows.some(r => r.orig === n));
      const keptNew = rows.filter(r => r.orig).map(r => r.orig);
      const moved = keptOld.join(',') !== keptNew.join(',');
      rows.forEach((r, i) => {
        const pos = i === 0 ? ' FIRST' : ' AFTER ' + q(rows[i - 1].name);
        if (!r.orig) { acts.push('ADD COLUMN ' + coldef(r, false) + (i === rows.length - 1 ? '' : pos)); return; }
        const o = byOrig[r.orig];
        const renamed = r.name !== r.orig;
        const changed = sig({ ...r, name: '' }) !== sig({ ...o, name: '' }) || (pkChanged && r.ai);
        if (renamed && !changed && !moved) acts.push('RENAME COLUMN ' + q(r.orig) + ' TO ' + q(r.name));
        else if (renamed) acts.push('CHANGE COLUMN ' + q(r.orig) + ' ' + coldef(r, false) + (moved ? pos : ''));
        else if (changed || moved) acts.push('MODIFY COLUMN ' + coldef(r, false) + (moved ? pos : ''));
      });
      const all = first.concat(acts, last);
      if (T.name.trim() && T.name.trim() !== t.name) all.push('RENAME TO ' + q(T.name.trim()));
      if (!all.length) return '';
      return 'ALTER TABLE ' + q(t.name) + '\n  ' + all.join(',\n  ') + ';';
    }

    function problems() {
      const out = [];
      const names = new Set();
      const ident = /^[A-Za-z_][A-Za-z0-9_]*$/;
      if (T.mode === 'new' || T.name.trim() !== (T.table || '')) {
        const n = T.name.trim();
        if (!ident.test(n)) out.push('Der Tabellenname darf nur Buchstaben (ohne Umlaute), Ziffern und _ enthalten.');
        else if (A().S.schema.tables.some(t => t.name.toLowerCase() === n.toLowerCase() && t.name !== T.table)) out.push('Eine Tabelle »' + n + '« gibt es schon.');
      }
      if (!T.rows.length) out.push('Eine Tabelle braucht mindestens eine Spalte.');
      T.rows.forEach((r, i) => {
        const n = r.name.trim();
        if (!n) out.push('Spalte ' + (i + 1) + ' hat keinen Namen.');
        else if (!ident.test(n)) out.push('»' + n + '«: nur Buchstaben (ohne Umlaute), Ziffern und _.');
        else if (names.has(n.toLowerCase())) out.push('»' + n + '« gibt es zweimal.');
        names.add(n.toLowerCase());
        if (r.base === 'ENUM' && !/'[^']*'/.test(r.arg)) out.push('»' + n + '«: ENUM braucht Werte, z. B. \'rot\',\'blau\'.');
        if (r.ai && (!r.pk || r.base !== 'INT')) out.push('»' + n + '«: AUTO_INCREMENT geht nur bei INT und Primärschlüssel.');
      });
      if (T.rows.filter(r => r.ai).length > 1) out.push('Nur eine Spalte kann AUTO_INCREMENT sein.');
      if (T.rows.filter(r => r.ai).length && T.rows.filter(r => r.pk).length > 1) out.push('Mit AUTO_INCREMENT darf nur diese eine Spalte der Primärschlüssel sein.');
      return out;
    }

    function init() {
      const root = $('#pane-struct');
      root.addEventListener('click', onClick);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
    }

    function select(name) {
      T.table = name;
      T.mode = name ? 'view' : 'view';
      load();
    }

    function load() {
      const t = T.table ? table(T.table) : null;
      if (T.mode === 'new') { render(); return; }
      if (!t) { T.table = null; T.rows = []; T.orig = []; T.name = ''; render(); return; }
      T.orig = t.columns.map(rowOf);
      T.rows = T.orig.map(r => ({ ...r }));
      T.name = t.name;
      T.err = null;
      render();
    }

    function startNew() {
      T.mode = 'new';
      T.table = null;
      T.name = '';
      T.rows = [
        { orig: null, name: 'id', base: 'INT', arg: '', pk: true, ai: true, notnull: false, unique: false, dflt: '', fk: '' },
        { orig: null, name: '', base: 'VARCHAR', arg: '50', pk: false, ai: false, notnull: false, unique: false, dflt: '', fk: '' }
      ];
      T.orig = [];
      T.err = null;
      render();
      const n = $('#stName');
      if (n) n.focus();
    }

    function fkChoices() {
      const out = [];
      A().S.schema.tables.forEach(t => {
        const keys = t.columns.filter(c => c.pk || c.unique);
        (keys.length ? keys : t.columns.slice(0, 1)).forEach(c => out.push(t.name + '.' + c.name));
      });
      return out;
    }

    function render() {
      const root = $('#pane-struct');
      const sc = A().S.schema;
      const ro = !A().can('modify');
      const t = T.table ? table(T.table) : null;
      let h = '<div class="bar">';
      if (sc.tables.length) {
        h += '<label class="sel-wrap">' + icon('table') + '<select id="stTable" aria-label="Tabelle">' +
          (T.mode === 'new' ? '<option value="">— neue Tabelle —</option>' : '') +
          sc.tables.map(x => '<option value="' + esc(x.name) + '"' + (x.name === T.table ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>';
      }
      if (!ro) h += '<button type="button" class="btn" data-act="new">' + icon('plus') + '<span>Neue Tabelle</span></button>';
      h += '<span class="spacer"></span>';
      if (t && T.mode !== 'new') {
        if (A().can('use')) h += '<button type="button" class="btn btn--ghost" data-act="truncate" title="Alle Zeilen löschen (TRUNCATE)">' + icon('reset') + '<span class="hide-s">Leeren</span></button>';
        if (!ro) h += '<button type="button" class="btn btn--ghost danger" data-act="drop" title="Tabelle löschen (DROP TABLE)">' + icon('trash') + '<span class="hide-s">Löschen</span></button>';
      }
      h += '</div><div class="st-scroll">';
      if (ro) h += '<div class="note">' + icon('shield') + '<span>' + (A().isReadOnly()
        ? 'Nur ansehen: Diese Datenbank kannst du hier nicht verändern.'
        : 'Nur ansehen: die Struktur dieser Datenbank darfst du nicht verändern. Abfragen und Daten ändern geht.') + '</span></div>';
      if (T.mode !== 'new' && !t) {
        h += '<div class="pane-empty">' + icon('table') + '<p>' + (sc.tables.length ? 'Wähle oben eine Tabelle.' : 'Diese Datenbank hat noch keine Tabellen.') + '</p>' +
          (!ro ? '<button type="button" class="btn btn--primary" data-act="new">' + icon('plus') + '<span>Erste Tabelle anlegen</span></button>' : '') + '</div></div>';
        root.innerHTML = h;
        return;
      }
      const dis = ro ? ' disabled' : '';
      h += '<div class="st-head"><label class="fld fld--inline"><span>Tabelle</span><input id="stName" value="' + esc(T.name) + '" placeholder="z. B. schueler" autocomplete="off" autocapitalize="off" spellcheck="false"' + dis + '></label>';
      if (t) h += '<span class="st-meta">' + plural(t.rows || 0, 'Zeile', 'Zeilen') + ' · ' + plural(t.columns.length, 'Spalte', 'Spalten') + '</span>';
      h += '</div>';
      const fks = fkChoices();
      h += '<div class="st-cols-wrap"><table class="st-cols"><thead><tr>' +
        '<th></th><th>Name</th><th>Datentyp</th><th>Länge / Werte</th>' +
        '<th title="Primärschlüssel">PK</th><th title="AUTO_INCREMENT: zählt von selbst hoch">AI</th><th title="Darf nicht leer sein">NOT NULL</th><th title="Jeder Wert nur einmal">UNIQUE</th>' +
        '<th>Standard</th><th title="Fremdschlüssel: Die Spalte zeigt auf den Schlüssel einer anderen Tabelle">Fremdschlüssel ↑</th><th></th></tr></thead><tbody>';
      T.rows.forEach((r, i) => {
        const needsArg = ['VARCHAR', 'CHAR', 'DECIMAL', 'ENUM'].includes(r.base);
        const known = TYPES.includes(r.base);
        h += '<tr data-i="' + i + '"' + (r.orig ? '' : ' class="new"') + '>' +
          '<td class="st-move">' + (ro ? '' : '<button type="button" class="mv" data-act="up" ' + (i === 0 ? 'disabled' : '') + ' aria-label="nach oben">' + icon('up') + '</button>' +
            '<button type="button" class="mv" data-act="down" ' + (i === T.rows.length - 1 ? 'disabled' : '') + ' aria-label="nach unten">' + icon('down') + '</button>') + '</td>' +
          '<td><div class="st-name"><input data-f="name" value="' + esc(r.name) + '" placeholder="spalte" autocomplete="off" autocapitalize="off" spellcheck="false"' + dis + '>' +
            (r.fk ? '<span class="fk-up" title="Fremdschlüssel → ' + esc(r.fk) + '">↑</span>' : '') + '</div></td>' +
          '<td><select data-f="base"' + dis + '>' + (known ? '' : '<option selected>' + esc(r.base) + '</option>') +
            TYPES.map(x => '<option' + (x === r.base ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></td>' +
          '<td>' + (needsArg ? '<input data-f="arg" value="' + esc(r.arg) + '" class="st-arg" placeholder="' + esc(ARG[r.base] || '') + '"' + dis + '>' : '<span class="st-na">—</span>') + '</td>' +
          '<td class="cb"><input type="checkbox" data-f="pk"' + (r.pk ? ' checked' : '') + dis + ' aria-label="Primärschlüssel"></td>' +
          '<td class="cb"><input type="checkbox" data-f="ai"' + (r.ai ? ' checked' : '') + (ro || r.base !== 'INT' ? ' disabled' : '') + ' aria-label="AUTO_INCREMENT"></td>' +
          '<td class="cb"><input type="checkbox" data-f="notnull"' + (r.notnull || r.pk ? ' checked' : '') + (ro || r.pk ? ' disabled' : '') + ' aria-label="NOT NULL"></td>' +
          '<td class="cb"><input type="checkbox" data-f="unique"' + (r.unique || r.pk ? ' checked' : '') + (ro || r.pk ? ' disabled' : '') + ' aria-label="UNIQUE"></td>' +
          '<td><input data-f="dflt" value="' + esc(r.dflt) + '" placeholder="—" class="st-dflt"' + dis + '></td>' +
          '<td><select data-f="fk" aria-label="Fremdschlüssel"' + dis + '><option value="">kein Fremdschlüssel</option>' +
            fks.filter(x => !(T.mode !== 'new' && x.startsWith(T.table + '.') && x.endsWith('.' + r.name))).map(x => '<option value="' + esc(x) + '"' + (x === r.fk ? ' selected' : '') + '>→ ' + esc(x) + '</option>').join('') +
            (r.fk && !fks.includes(r.fk) ? '<option value="' + esc(r.fk) + '" selected>→ ' + esc(r.fk) + '</option>' : '') + '</select></td>' +
          '<td>' + (ro ? '' : '<button type="button" class="st-del" data-act="delcol" aria-label="Spalte entfernen" title="Spalte entfernen">' + icon('x') + '</button>') + '</td>' +
          '</tr>';
      });
      h += '</tbody></table></div>';
      if (!ro) h += '<button type="button" class="btn btn--ghost st-add" data-act="addcol">' + icon('plus') + '<span>Spalte</span></button>';
      h += '<div id="stPrev"></div>';
      if (t && T.mode !== 'new') h += extras(t);
      h += '</div>';
      root.innerHTML = h;
      preview();
    }

    function extras(t) {
      let h = '<div class="st-extra">';
      const multi = t.fks.filter(f => f.cols.length > 1);
      const inc = [];
      A().S.schema.tables.forEach(o => o.fks.forEach(f => { if (f.ref === t.name) inc.push(o.name + '.' + f.cols.join(',')); }));
      h += '<div class="st-box"><h3>' + icon('link') + 'Fremdschlüssel ↑</h3>';
      if (!t.fks.length && !inc.length) h += '<p class="muted">Keine Fremdschlüssel.</p>';
      t.fks.forEach(f => {
        h += '<div class="rel">' + '<code>' + esc(f.cols.join(', ')) + '<span class="fk-up">↑</span></code> → <code>' + esc(f.ref + '.' + f.refCols.join(', ')) + '</code>' +
          (f.name ? ' <small class="muted">' + esc(f.name) + '</small>' : '') +
          (f.onDelete && f.onDelete !== 'NO ACTION' ? ' <small class="muted">ON DELETE ' + esc(f.onDelete) + '</small>' : '') + '</div>';
      });
      inc.forEach(x => { h += '<div class="rel muted">' + '<code>' + esc(x) + '↑</code> ist ein Fremdschlüssel auf diese Tabelle</div>'; });
      if (multi.length) h += '<p class="muted">Fremdschlüssel über mehrere Spalten ändert man per SQL.</p>';
      h += '</div>';
      const idx = t.indexes.filter(i => i.origin === 'c');
      h += '<div class="st-box"><h3>' + icon('search') + 'Indizes</h3>' +
        (idx.length ? idx.map(i => '<div class="rel"><code>' + esc(i.name) + '</code> (' + esc(i.cols.join(', ')) + ')' + (i.unique ? ' <small class="muted">UNIQUE</small>' : '') + '</div>').join('')
          : '<p class="muted">Keine eigenen Indizes. <code>CREATE INDEX name ON ' + esc(q(t.name)) + ' (spalte);</code></p>') + '</div>';
      h += '<details class="st-box st-sql"><summary><h3>' + icon('book') + 'CREATE-Anweisung</h3></summary><pre>' + esc(t.sql) + ';</pre>' +
        '<button type="button" class="btn btn--mini" data-act="sql2ed">In den Editor</button></details>';
      h += '</div>';
      return h;
    }

    function preview() {
      const box = $('#stPrev');
      if (!box) return;
      if (!A().can('modify')) { box.innerHTML = ''; return; }
      const probs = problems();
      const s = generate();
      if (T.mode !== 'new' && !s && !T.err) { box.innerHTML = ''; return; }
      let h = '<div class="st-prev' + (T.err ? ' bad' : '') + '">';
      if (probs.length && (T.mode === 'new' ? T.rows.some(r => r.name) || T.name : true)) {
        h += '<div class="st-probs">' + probs.map(p => '<div>' + icon('warn') + '<span>' + esc(p) + '</span></div>').join('') + '</div>';
      }
      if (T.err) h += '<div class="st-probs"><div>' + icon('warn') + '<span>' + esc(T.err) + '</span></div></div>';
      h += '<div class="st-prev-h">Diese Anweisung wird ausgeführt:</div><pre class="dlg-sql">' + esc(s) + '</pre>' +
        '<div class="st-prev-btns"><button type="button" class="btn" data-act="discard">Verwerfen</button>' +
        '<button type="button" class="btn btn--ghost" data-act="toed">In den Editor</button>' +
        '<button type="button" class="btn btn--primary" data-act="apply"' + (probs.length ? ' disabled' : '') + '>' + icon('check') + '<span>' + (T.mode === 'new' ? 'Tabelle anlegen' : 'Übernehmen') + '</span></button></div></div>';
      box.innerHTML = h;
    }

    function rowAt(el) {
      const tr = el.closest('tr[data-i]');
      return tr ? +tr.dataset.i : -1;
    }

    function onInput(e) {
      const el = e.target;
      if (el.id === 'stName') { T.name = el.value; T.err = null; preview(); return; }
      const f = el.dataset.f;
      const i = rowAt(el);
      if (!f || i < 0 || el.type === 'checkbox' || el.tagName === 'SELECT') return;
      T.rows[i][f] = el.value;
      T.err = null;
      preview();
    }

    function onChange(e) {
      const el = e.target;
      if (el.id === 'stTable') { T.mode = 'view'; select(el.value); A().S.table = el.value; window.SQLPanes.onTable(); return; }
      const f = el.dataset.f;
      const i = rowAt(el);
      // Textfelder nicht: deren change kommt beim Verlassen des Feldes —
      // ein Neuaufbau in dem Moment verschluckte den Klick auf „Übernehmen".
      if (!f || i < 0 || (el.tagName === 'INPUT' && el.type !== 'checkbox')) return;
      const r = T.rows[i];
      if (el.type === 'checkbox') {
        r[f] = el.checked;
        if (f === 'ai' && el.checked) { r.pk = true; T.rows.forEach((x, k) => { if (k !== i) { x.ai = false; x.pk = false; } }); }
        if (f === 'pk' && !el.checked) r.ai = false;
        if (f === 'pk' && el.checked) { r.notnull = false; r.unique = false; if (r.base === 'UUID' && !r.dflt.trim()) r.dflt = 'UUID()'; }
      } else if (el.tagName === 'SELECT') {
        r[f] = el.value;
        if (f === 'base') {
          r.arg = ARG[r.base] || '';
          if (r.base !== 'INT') r.ai = false;
          // Ein UUID-Schlüssel bekommt seinen Wert von selbst, wie AUTO_INCREMENT
          if (r.base === 'UUID' && r.pk && !r.dflt.trim()) r.dflt = 'UUID()';
        }
        if (f === 'fk' && r.fk) {
          // Typ angleichen: ein Fremdschlüssel hat den Typ seines Ziels
          const [tn, cn] = r.fk.split('.');
          const c = (table(tn) || { columns: [] }).columns.find(x => x.name === cn);
          if (c && r.base !== splitType(c.type).base && !r.orig) { const s = splitType(c.type); r.base = s.base; r.arg = s.arg; }
          if (!r.name.trim()) r.name = tn + '_' + cn;
        }
      }
      T.err = null;
      render();
    }

    async function onClick(e) {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      const i = rowAt(b);
      if (act === 'new') startNew();
      else if (act === 'addcol') {
        T.rows.push({ orig: null, name: '', base: 'VARCHAR', arg: '50', pk: false, ai: false, notnull: false, unique: false, dflt: '', fk: '' });
        render();
        const ins = $$('#pane-struct tr[data-i] input[data-f="name"]');
        if (ins.length) ins[ins.length - 1].focus();
      } else if (act === 'delcol') { T.rows.splice(i, 1); render(); }
      else if (act === 'up' && i > 0) { [T.rows[i - 1], T.rows[i]] = [T.rows[i], T.rows[i - 1]]; render(); }
      else if (act === 'down' && i < T.rows.length - 1) { [T.rows[i + 1], T.rows[i]] = [T.rows[i], T.rows[i + 1]]; render(); }
      else if (act === 'discard') {
        if (T.mode === 'new') { T.mode = 'view'; T.table = A().S.table && table(A().S.table) ? A().S.table : (A().S.schema.tables[0] || {}).name || null; }
        load();
      } else if (act === 'toed') { const s = generate(); switchTab('sql'); sql.insert(s); }
      else if (act === 'sql2ed') { const t = table(T.table); if (t) { switchTab('sql'); sql.insert(t.sql + ';'); } }
      else if (act === 'apply') {
        const s = generate();
        if (!s) return;
        const newName = T.name.trim();
        b.disabled = true;
        const res = await A().execSql(s);
        const err = res.find(r => r.kind === 'error');
        if (err) { T.err = err.message + (err.hint ? ' — ' + err.hint : ''); preview(); return; }
        const warn = res.flatMap(r => r.warn || []);
        toast(T.mode === 'new' ? 'Tabelle »' + newName + '« angelegt.' : 'Tabelle geändert.' + (warn.length ? ' ' + warn[0] : ''));
        T.mode = 'view';
        T.table = newName || T.table;
        A().S.table = T.table;
        load();
        window.SQLPanes.onTable();
      } else if (act === 'truncate') {
        const s = 'TRUNCATE TABLE ' + q(T.table) + ';';
        if (await confirm('Tabelle leeren?', 'Alle Zeilen in <b>' + esc(T.table) + '</b> werden gelöscht, die Struktur bleibt.<pre class="dlg-sql">' + esc(s) + '</pre>', 'Leeren', 'danger')) {
          const res = await A().execSql(s);
          const err = res.find(r => r.kind === 'error');
          toast(err ? err.message : 'Tabelle geleert.', err ? 'error' : null);
          load();
        }
      } else if (act === 'drop') {
        const s = 'DROP TABLE ' + q(T.table) + ';';
        if (await confirm('Tabelle löschen?', 'Die Tabelle <b>' + esc(T.table) + '</b> mit allen Daten wird gelöscht.<pre class="dlg-sql">' + esc(s) + '</pre>', 'Löschen', 'danger')) {
          const res = await A().execSql(s);
          const err = res.find(r => r.kind === 'error');
          if (err) { toast(err.message + (err.hint ? ' ' + err.hint : ''), 'error'); return; }
          toast('Tabelle gelöscht.');
          T.table = null; A().S.table = null;
          load();
          window.SQLPanes.onTable();
        }
      }
    }

    return {
      init, select, startNew,
      show() {
        if (T.mode === 'new') return;
        const want = A().S.table && table(A().S.table) ? A().S.table : (T.table && table(T.table) ? T.table : (A().S.schema.tables[0] || {}).name || null);
        if (want !== T.table || !T.rows.length) { T.table = want; load(); }
        else if (!$('#pane-struct').innerHTML) load();
      },
      onDb() { T.mode = 'view'; T.table = null; T.rows = []; $('#pane-struct').innerHTML = ''; if (tab === 'struct') this.show(); },
      onSchema() {
        if (T.mode === 'new') return;
        const dirty = !!generate();
        if (!dirty && tab === 'struct') load();
      },
      onRights() { render(); }
    };
  })();

  /* ════════════════════════════════════════════════════════════
     Diagramm
     ════════════════════════════════════════════════════════════ */
  const diagram = (function () {
    let dg = null;
    let stale = true;
    let selName = null;
    let saveTimer = null;

    function init() {
      const root = $('#pane-diagram');
      root.innerHTML =
        '<div class="bar">' +
          '<button type="button" class="btn" id="dgArr">' + icon('arrange') + '<span>Anordnen</span></button>' +
          '<span class="btn-group">' +
            '<button type="button" class="btn btn--icon" id="dgOut" aria-label="Verkleinern">' + icon('zout') + '</button>' +
            '<button type="button" class="btn btn--icon" id="dgIn" aria-label="Vergrößern">' + icon('zin') + '</button>' +
            '<button type="button" class="btn btn--icon" id="dgFit" aria-label="Alles zeigen">' + icon('fit') + '</button>' +
          '</span>' +
          '<label class="chk"><input type="checkbox" id="dgTypes" checked><span>Datentypen</span></label>' +
          '<span class="spacer"></span>' +
          '<span class="dg-sel" id="dgSel" hidden></span>' +
          '<button type="button" class="btn" id="dgPng">' + icon('image') + '<span class="hide-s">Als Bild</span></button>' +
        '</div>' +
        '<div class="dg-host" id="dgHost"></div>' +
        '<div class="dg-legend">' + icon('key', 'k-pk') + '<span>Primärschlüssel</span>' + icon('link', 'k-fk') + '<span>Fremdschlüssel ↑</span>' +
          '<span class="lg-line"></span><span>1 : n — eine Zeile dort, viele hier</span><span class="lg-tip">Kästen verschieben · antippen hebt hervor · doppelt tippen öffnet die Daten</span></div>';
      dg = window.SQLDiagram.create($('#dgHost'), {
        onLayout: (lay) => { clearTimeout(saveTimer); saveTimer = setTimeout(() => A().saveLayout(lay), 300); },
        onOpenTable: (n) => openTable(n, 'data'),
        onSelect: (n) => {
          selName = n;
          const s = $('#dgSel');
          if (!n) { s.hidden = true; return; }
          s.hidden = false;
          s.innerHTML = '<b>' + esc(n) + '</b><button type="button" class="btn btn--mini" data-go="data">Daten</button><button type="button" class="btn btn--mini" data-go="struct">Struktur</button>';
        }
      });
      $('#dgArr').addEventListener('click', () => dg.arrange());
      $('#dgIn').addEventListener('click', () => dg.zoom(1.2));
      $('#dgOut').addEventListener('click', () => dg.zoom(1 / 1.2));
      $('#dgFit').addEventListener('click', () => dg.fit());
      $('#dgTypes').addEventListener('change', (e) => dg.setShowTypes(e.target.checked));
      $('#dgPng').addEventListener('click', () => dg.exportPng((A().S.cur.name || 'diagramm') + '-diagramm.png').catch(e => toast('Bild ging nicht: ' + e.message, 'error')));
      $('#dgSel').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b && selName) openTable(selName, b.dataset.go); });
    }

    function draw() {
      const cur = A().S.cur;
      const lay = cur && cur.layout;
      $('#dgTypes').checked = !(lay && lay.showTypes === false);
      dg.render(A().S.schema, lay);
      stale = false;
    }

    return {
      init,
      show() { if (stale) draw(); },
      onDb() { stale = true; $('#dgSel').hidden = true; if (tab === 'diagram') draw(); },
      onSchema() {
        // Lage behalten, neue Tabellen kommen dazu
        stale = true;
        if (tab === 'diagram') draw();
      },
      onTheme() { if (dg) dg.redraw(); },
      onRights() {}
    };
  })();

  const P = { sql, data, struct, diagram };

  /* ── Reiterleiste ────────────────────────────────────────── */
  function initTabs() {
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (b) switchTab(b.dataset.tab);
    });
    $('#tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1);
      const t = TABS[(i + TABS.length) % TABS.length];
      switchTab(t);
      $('.tab[data-tab="' + t + '"]').focus();
    });
  }

  window.SQLPanes = {
    sql, data, struct, diagram,
    init() {
      initTabs();
      sql.init(); data.init(); struct.init(); diagram.init();
      const t = A().ls.get('tab');
      switchTab(TABS.includes(t) ? t : 'sql');
    },
    switchTab, openTable,
    onDb() { sql.onDb(); data.onDb(); struct.onDb(); diagram.onDb(); P[tab].show && P[tab].show(); },
    onSchema() {
      const S = A().S;
      if (S.table && !table(S.table) && !viewOf(S.table)) S.table = null;
      sql.onSchema(); data.onSchema(); struct.onSchema(); diagram.onSchema();
    },
    onRights() { struct.onRights(); data.onRights(); if (tab === 'data') data.show(true); },
    onTable() {
      // Auswahl in der Seitenleiste nachziehen
      $$('#side .tbl').forEach(b => b.classList.toggle('on', b.dataset.table === A().S.table));
    }
  };
})();
