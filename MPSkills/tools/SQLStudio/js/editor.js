/* ══════════════════════════════════════════════════════════════
   SQL Studio — js/editor.js   ·   Der SQL-Editor
   ══════════════════════════════════════════════════════════════
   Ein <textarea> mit durchsichtiger Schrift über einem <pre>, das
   dieselben Zeichen farbig zeigt. Kein fremder Editor (CodeMirror &
   Co.): der wäre größer als die ganze App, und das Tablet bekommt
   so seine eigene Tastatur, Auswahl und Rückgängig-Funktion.

   Kein Zeilenumbruch (wrap=off) — dann steht jedes Zeichen in einem
   festen Raster, und Hervorhebung, Fehlermarke und die Liste der
   Vorschläge lassen sich ohne Messen pro Zeile platzieren.

   Wörter liefert der Kern (SQLCore.tokenize), damit Editor und
   Ausführung dieselbe Sprache sprechen.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const KW = new Set(('SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP ADD ' +
    'COLUMN PRIMARY KEY FOREIGN REFERENCES JOIN INNER LEFT RIGHT OUTER CROSS FULL NATURAL ON USING AS ORDER BY GROUP HAVING ' +
    'LIMIT OFFSET DISTINCT NULL IS IN BETWEEN LIKE GLOB EXISTS CASE WHEN THEN ELSE END UNION ALL INTERSECT EXCEPT ' +
    'INDEX VIEW TRIGGER UNIQUE DEFAULT CHECK CONSTRAINT AUTO_INCREMENT AUTOINCREMENT ASC DESC IF ' +
    'INT INTEGER TINYINT SMALLINT BIGINT VARCHAR CHAR TEXT DATE DATETIME DECIMAL NUMERIC FLOAT DOUBLE BOOLEAN BOOL REAL ' +
    'ENUM TIMESTAMP TIME BLOB UNSIGNED MODIFY CHANGE RENAME TO SHOW TABLES COLUMNS DESCRIBE DESC USE DATABASE DATABASES ' +
    'TRUNCATE WITH RECURSIVE BEGIN COMMIT ROLLBACK TRANSACTION START TRUE FALSE CASCADE RESTRICT NO ACTION AFTER FIRST ' +
    'PRAGMA EXPLAIN REPLACE IGNORE RETURNING OVER PARTITION ROWS ENGINE CHARSET COMMENT FOR EACH ROW BEFORE INSTEAD OF ' +
    'CONFLICT DO NOTHING ESCAPE COLLATE').split(' '));

  const FUNCS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'ABS', 'UPPER', 'LOWER', 'UCASE', 'LCASE', 'LENGTH',
    'CHAR_LENGTH', 'SUBSTR', 'SUBSTRING', 'TRIM', 'REPLACE', 'CONCAT', 'CONCAT_WS', 'IFNULL', 'COALESCE', 'NULLIF',
    'IF', 'IIF', 'CAST', 'NOW', 'CURDATE', 'DATE', 'TIME', 'DATETIME', 'STRFTIME', 'YEAR', 'MONTH', 'DAY', 'DATEDIFF',
    'DATE_FORMAT', 'LEFT', 'RIGHT', 'RANDOM', 'RAND', 'FLOOR', 'CEIL', 'POWER', 'SQRT', 'GROUP_CONCAT', 'INSTR', 'LOCATE'];

  const KW_LIST = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
    'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'ADD COLUMN', 'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'JOIN',
    'INNER JOIN', 'LEFT JOIN', 'ON', 'AS', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'DISTINCT', 'NULL', 'IS NULL',
    'IS NOT NULL', 'IN', 'BETWEEN', 'LIKE', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'UNION', 'ASC', 'DESC',
    'INT', 'VARCHAR', 'TEXT', 'DATE', 'DECIMAL', 'BOOLEAN', 'AUTO_INCREMENT', 'NOT NULL', 'UNIQUE', 'DEFAULT',
    'MODIFY', 'CHANGE', 'RENAME TO', 'SHOW TABLES', 'DESCRIBE', 'TRUNCATE TABLE', 'CREATE INDEX', 'CREATE VIEW'];

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function create(host, opts) {
    host.innerHTML =
      '<div class="ed">' +
        '<div class="ed-gutter" aria-hidden="true"><div class="ed-lines"></div></div>' +
        '<div class="ed-body">' +
          '<pre class="ed-hl" aria-hidden="true"><code></code></pre>' +
          '<textarea class="ed-ta" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" ' +
            'autocorrect="off" aria-label="SQL eingeben"></textarea>' +
          '<span class="ed-measure" aria-hidden="true">M</span>' +
        '</div>' +
        '<ul class="ed-ac" role="listbox" hidden></ul>' +
      '</div>';
    const ed = host.querySelector('.ed');
    const ta = host.querySelector('.ed-ta');
    const hl = host.querySelector('.ed-hl code');
    const pre = host.querySelector('.ed-hl');
    const lines = host.querySelector('.ed-lines');
    const ac = host.querySelector('.ed-ac');
    const measure = host.querySelector('.ed-measure');
    let mark = null;         // { start, end } — Fehlerstelle
    let acItems = [], acSel = 0, acWord = null;

    /* ── Malen ─────────────────────────────────────────────── */
    function names() {
      const sc = opts.getSchema ? opts.getSchema() : null;
      const tables = new Set(), cols = new Set();
      if (sc) {
        sc.tables.forEach(t => { tables.add(t.name.toLowerCase()); t.columns.forEach(c => cols.add(c.name.toLowerCase())); });
        sc.views.forEach(v => { tables.add(v.name.toLowerCase()); v.columns.forEach(c => cols.add(c.name.toLowerCase())); });
      }
      return { tables, cols };
    }

    function paint() {
      const text = ta.value;
      const toks = window.SQLCore.tokenize(text);
      const { tables, cols } = names();
      let html = '';
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        let cls = '';
        if (t.t === 'com') cls = 'com';
        else if (t.t === 'str') cls = 'str';
        else if (t.t === 'num') cls = 'num';
        else if (t.t === 'dq' || t.t === 'bq') cls = 'qid';
        else if (t.t === 'var') cls = 'var';
        else if (t.t === 'op') cls = 'op';
        else if (t.t === 'id') {
          const u = t.v.toUpperCase();
          let k = i + 1;
          while (k < toks.length && toks[k].t === 'ws') k++;
          const call = toks[k] && toks[k].t === 'op' && toks[k].v === '(';
          if (KW.has(u) && !(call && FUNCS.includes(u) && !['IF', 'LEFT', 'RIGHT', 'REPLACE'].includes(u))) cls = 'kw';
          else if (call) cls = 'fn';
          else if (tables.has(t.v.toLowerCase())) cls = 'tbl';
          else if (cols.has(t.v.toLowerCase())) cls = 'col';
        }
        let piece = esc(t.v);
        if (cls) piece = '<span class="t-' + cls + '">' + piece + '</span>';
        if (mark && t.e > mark.start && t.s < mark.end && t.t !== 'ws') piece = '<mark class="ed-err">' + piece + '</mark>';
        html += piece;
      }
      hl.innerHTML = html + '\n';
      const n = (text.match(/\n/g) || []).length + 1;
      if (lines.childElementCount !== n) {
        let s = '';
        for (let i = 1; i <= n; i++) s += '<div>' + i + '</div>';
        lines.innerHTML = s;
      }
      sync();
    }

    function sync() {
      pre.style.transform = 'translate(' + (-ta.scrollLeft) + 'px,' + (-ta.scrollTop) + 'px)';
      lines.style.transform = 'translateY(' + (-ta.scrollTop) + 'px)';
    }

    /* ── Schreiben, mit Rückgängig ─────────────────────────── */
    function insertText(text, from, to) {
      ta.focus();
      if (from !== undefined) ta.setSelectionRange(from, to);
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
      if (!ok) {
        const s = ta.selectionStart;
        ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
        ta.setSelectionRange(s + text.length, s + text.length);
        ta.dispatchEvent(new Event('input'));
      }
    }

    /* ── Vorschläge ────────────────────────────────────────── */
    function charSize() {
      const r = measure.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
      return { w: r.width || 8, h: lh };
    }

    function stmtAround(pos) {
      const text = ta.value;
      const a = text.lastIndexOf(';', pos - 1) + 1;
      let b = text.indexOf(';', pos);
      if (b < 0) b = text.length;
      return text.slice(a, b);
    }

    function aliasMap(stmt, sc) {
      const map = {};
      if (!sc) return map;
      const all = sc.tables.concat(sc.views);
      const byLower = Object.fromEntries(all.map(t => [t.name.toLowerCase(), t]));
      const toks = window.SQLCore.tokenize(stmt).filter(t => t.t !== 'ws' && t.t !== 'com');
      for (let i = 0; i < toks.length; i++) {
        const v = toks[i].t === 'id' ? toks[i].v : (toks[i].x || '');
        const t = byLower[v.toLowerCase()];
        if (!t) continue;
        map[t.name.toLowerCase()] = t;
        let k = i + 1;
        if (toks[k] && toks[k].t === 'id' && toks[k].v.toUpperCase() === 'AS') k++;
        const al = toks[k];
        if (al && al.t === 'id' && !KW.has(al.v.toUpperCase())) map[al.v.toLowerCase()] = t;
      }
      return map;
    }

    function suggest() {
      const pos = ta.selectionStart;
      if (pos !== ta.selectionEnd) return closeAc();
      const before = ta.value.slice(0, pos);
      const m = before.match(/([A-Za-z_À-￿][\wÀ-￿]*)\.([\wÀ-￿]*)$|([A-Za-z_À-￿][\wÀ-￿]*)$/);
      if (!m) return closeAc();
      // In Strings und Kommentaren nichts vorschlagen
      const toks = window.SQLCore.tokenize(before);
      const last = toks[toks.length - 1];
      if (last && (last.t === 'str' || last.t === 'com' || last.t === 'dq' || last.t === 'bq') && last.e === pos) return closeAc();
      const sc = opts.getSchema ? opts.getSchema() : null;
      const stmt = stmtAround(pos);
      let items = [];
      let word;
      if (m[1] !== undefined) {
        word = m[2];
        const t = aliasMap(stmt, sc)[m[1].toLowerCase()];
        if (!t) return closeAc();
        items = t.columns.map(c => ({ label: c.name, kind: 'col', detail: c.type || '' }));
      } else {
        word = m[3];
        if (word.length < 1) return closeAc();
        const prev = before.slice(0, before.length - word.length).trim().split(/\s+/).pop() || '';
        const wantTables = /^(FROM|JOIN|INTO|UPDATE|TABLE|DESCRIBE|DESC|REFERENCES)$/i.test(prev);
        const used = aliasMap(stmt, sc);
        const tbls = sc ? sc.tables.concat(sc.views).map(t => ({ label: t.name, kind: 'tbl', detail: 'Tabelle' })) : [];
        const usedCols = [];
        const otherCols = [];
        if (sc) {
          const seen = new Set();
          Object.values(used).forEach(t => t.columns.forEach(c => {
            if (!seen.has(c.name)) { seen.add(c.name); usedCols.push({ label: c.name, kind: 'col', detail: t.name }); }
          }));
          sc.tables.forEach(t => t.columns.forEach(c => {
            if (!seen.has(c.name)) { seen.add(c.name); otherCols.push({ label: c.name, kind: 'col', detail: t.name }); }
          }));
        }
        const kws = KW_LIST.map(k => ({ label: k, kind: 'kw', detail: '' }));
        const fns = FUNCS.map(f => ({ label: f + '(', kind: 'fn', detail: 'Funktion' }));
        items = wantTables ? tbls.concat(usedCols, kws, otherCols, fns) : usedCols.concat(tbls, kws, fns, otherCols);
      }
      const w = word.toLowerCase();
      const seen = new Set();
      items = items.filter(it => {
        const l = it.label.toLowerCase();
        if (!l.startsWith(w) || l === w || seen.has(l)) return false;
        seen.add(l); return true;
      }).slice(0, 8);
      if (!items.length) return closeAc();
      acItems = items; acSel = 0; acWord = word;
      ac.innerHTML = items.map((it, i) =>
        '<li role="option" data-i="' + i + '" class="ac-' + it.kind + (i === 0 ? ' sel' : '') + '">' +
          '<span class="ac-ico"></span><span class="ac-l">' + esc(it.label) + '</span>' +
          (it.detail ? '<span class="ac-d">' + esc(it.detail) + '</span>' : '') + '</li>').join('');
      // Platz: unter der Schreibmarke
      const { w: cw, h } = charSize();
      const lineStart = before.lastIndexOf('\n') + 1;
      const row = (before.match(/\n/g) || []).length;
      const col = before.length - lineStart - word.length;
      const padL = parseFloat(getComputedStyle(ta).paddingLeft) || 0;
      const padT = parseFloat(getComputedStyle(ta).paddingTop) || 0;
      const bodyLeft = ta.offsetLeft + ta.parentElement.offsetLeft;
      let x = bodyLeft + padL + col * cw - ta.scrollLeft;
      let y = padT + (row + 1) * h - ta.scrollTop + 4;
      const maxX = ed.clientWidth - 240;
      x = Math.max(4, Math.min(x, maxX));
      if (y + 230 > ed.clientHeight && y - h - 230 > 0) y = y - h - 8 - Math.min(230, items.length * 30 + 8);
      ac.style.left = x + 'px';
      ac.style.top = y + 'px';
      ac.hidden = false;
    }

    function closeAc() { ac.hidden = true; acItems = []; acWord = null; }

    function accept(i) {
      const it = acItems[i];
      if (!it) return;
      const pos = ta.selectionStart;
      // Das schon getippte Stück merken, BEVOR closeAc() es leert —
      // sonst ersetzt der Vorschlag nichts und hängt sich nur an („SeSELECT").
      const word = acWord || '';
      let text = it.label;
      if (it.kind === 'kw' && word && word === word.toLowerCase() && /[a-z]/.test(word)) text = text.toLowerCase();
      closeAc();
      insertText(text, pos - word.length, pos);
    }

    function moveSel(d) {
      acSel = (acSel + d + acItems.length) % acItems.length;
      [...ac.children].forEach((li, i) => li.classList.toggle('sel', i === acSel));
      const li = ac.children[acSel];
      if (li) li.scrollIntoView({ block: 'nearest' });
    }

    /* ── Tasten ────────────────────────────────────────────── */
    ta.addEventListener('keydown', (e) => {
      if (!ac.hidden && acItems.length) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(acSel); return; }
        if (e.key === 'Escape') { e.preventDefault(); closeAc(); return; }
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); closeAc(); opts.onRun && opts.onRun(); return; }
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); insertText('  '); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        const pos = ta.selectionStart;
        const ls = ta.value.lastIndexOf('\n', pos - 1) + 1;
        const indent = (ta.value.slice(ls, pos).match(/^[ \t]*/) || [''])[0];
        if (indent) { e.preventDefault(); insertText('\n' + indent); }
      }
    });

    ta.addEventListener('input', (e) => {
      if (mark) mark = null;
      paint();
      opts.onChange && opts.onChange(ta.value);
      const typed = e.inputType === 'insertText' || e.inputType === 'insertCompositionText';
      if (typed && e.data && /[\w.À-￿]$/.test(e.data)) suggest();
      else closeAc();
    });
    ta.addEventListener('scroll', () => { sync(); if (!ac.hidden) closeAc(); });
    ta.addEventListener('blur', () => setTimeout(closeAc, 150));
    ta.addEventListener('click', closeAc);
    ac.addEventListener('pointerdown', (e) => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      accept(+li.dataset.i);
    });

    paint();

    return {
      get value() { return ta.value; },
      set value(v) { ta.value = v || ''; mark = null; paint(); },
      focus() { ta.focus(); },
      selection() {
        const a = ta.selectionStart, b = ta.selectionEnd;
        return a !== b ? { text: ta.value.slice(a, b), start: a } : null;
      },
      /* Text an der Schreibmarke einfügen — bei leerem Editor ersetzt
         er alles, sonst kommt er in eine eigene Zeile. */
      insert(text) {
        const v = ta.value;
        if (!v.trim()) { ta.focus(); ta.select(); insertText(text); return; }
        ta.focus();
        const pos = ta.selectionEnd;
        const lineEnd = v.indexOf('\n', pos) < 0 ? v.length : v.indexOf('\n', pos);
        const needNl = lineEnd > 0 && v[lineEnd - 1] !== '\n' ? '\n\n' : '\n';
        insertText(needNl + text, lineEnd, lineEnd);
      },
      markError(start, end) {
        mark = { start, end };
        paint();
        // Fehlerstelle in Sicht bringen
        const before = ta.value.slice(0, start);
        const row = (before.match(/\n/g) || []).length;
        const { h } = charSize();
        const y = row * h;
        if (y < ta.scrollTop || y > ta.scrollTop + ta.clientHeight - h) ta.scrollTop = Math.max(0, y - h * 2);
      },
      clearMark() { if (mark) { mark = null; paint(); } },
      repaint: paint
    };
  }

  window.SQLEditor = { create, FUNCS };
})();
