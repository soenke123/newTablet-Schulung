/* ══════════════════════════════════════════════════════════════
   SQL Studio — js/core.js   ·   Der Kern
   ══════════════════════════════════════════════════════════════
   Alles, was mit SQL zu tun hat, und nichts, was man sieht. Läuft im
   Web Worker (js/worker.js) neben sql.js und in den Tests unter Node
   (tests/core.test.mjs) — deshalb kein DOM, kein window, nur
   `root.SQLCore`.

   Unter der Haube ist es SQLite. Die Schülerinnen und Schüler
   schreiben aber wie im Schulbuch (MySQL/phpMyAdmin), also übersetzt
   dieser Kern vor dem Ausführen:

     · CREATE TABLE mit AUTO_INCREMENT, ENUM, KEY/INDEX, COMMENT,
       ENGINE=…  → wird zerlegt (parseCreate) und als SQLite neu
       geschrieben (createSql). Reines SQLite geht unverändert durch.
     · ALTER TABLE … MODIFY / CHANGE / ADD FOREIGN KEY / DROP … kann
       SQLite nicht → die Tabelle wird nach dem offiziellen
       Zwölf-Schritte-Rezept neu gebaut (rebuild).
     · SHOW TABLES, DESCRIBE, SHOW CREATE TABLE → eigene Antworten.
     · CREATE/DROP DATABASE, USE, SHOW DATABASES → gehören der App
       (eine Datenbank ist dort ein Eintrag links), der Kern hält an
       und meldet sie (stop).
     · Kleinkram: INSERT IGNORE, TRUNCATE, IF(), NOW(), YEAR() …

   Rechte (pro Datenbank, siehe Plan): use < modify < create.
     use     SELECT, INSERT, UPDATE, DELETE
     modify  + CREATE/ALTER/DROP TABLE, INDEX, VIEW, TRIGGER
     create  + eigene Datenbanken (CREATE/DROP DATABASE)
   Geprüft wird JEDE Anweisung vor dem Ausführen. Das schützt den
   Unterricht, nicht einen Server: die Datenbank liegt ohnehin nur
   als eigene Kopie im Gerät.
   ══════════════════════════════════════════════════════════════ */

(function (root) {
  'use strict';

  const LEVEL = { use: 1, modify: 2, create: 3 };
  const LEVEL_NAME = { 1: 'use', 2: 'modify', 3: 'create' };
  const NEVER = 99;

  /* ─── Zerlegen in Wörter ─────────────────────────────────── */

  const isWs    = c => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
  const isStart = c => /[A-Za-z_À-￿]/.test(c);
  const isPart  = c => /[A-Za-z0-9_$À-￿]/.test(c);
  const isDigit = c => c >= '0' && c <= '9';
  const OPS2 = ['<=', '>=', '<>', '!=', '==', '||', '<<', '>>', '->'];

  /* Token: { t, v, s, e } — t: ws | com | id | str | dq | bq | num | op | var
     v ist der Originaltext. Für str/dq/bq steht der Inhalt in `x`. */
  function tokenize(sql) {
    const out = [];
    const n = sql.length;
    let i = 0;
    while (i < n) {
      const c = sql[i], s = i;
      if (isWs(c)) {
        while (i < n && isWs(sql[i])) i++;
        out.push({ t: 'ws', v: sql.slice(s, i), s, e: i });
      } else if ((c === '-' && sql[i + 1] === '-') || c === '#') {
        while (i < n && sql[i] !== '\n') i++;
        out.push({ t: 'com', v: sql.slice(s, i), s, e: i });
      } else if (c === '/' && sql[i + 1] === '*') {
        const end = sql.indexOf('*/', i + 2);
        i = end < 0 ? n : end + 2;
        out.push({ t: 'com', v: sql.slice(s, i), s, e: i, open: end < 0 });
      } else if (c === "'" || c === '"' || c === '`') {
        // MySQL-Strings kennen \' — SQLite nicht. Wir lesen beides.
        let x = '', closed = false;
        i++;
        while (i < n) {
          const d = sql[i];
          if (d === c) {
            if (sql[i + 1] === c) { x += c; i += 2; continue; }
            i++; closed = true; break;
          }
          if (d === '\\' && c !== '`' && i + 1 < n) {
            const f = sql[i + 1];
            const map = { "'": "'", '"': '"', '\\': '\\', n: '\n', t: '\t', r: '\r', 0: '\0' };
            if (f in map) { x += map[f]; i += 2; continue; }
          }
          x += d; i++;
        }
        out.push({ t: c === "'" ? 'str' : c === '"' ? 'dq' : 'bq', v: sql.slice(s, i), x, s, e: i, open: !closed });
      } else if (isDigit(c) || (c === '.' && isDigit(sql[i + 1] || ''))) {
        if (c === '0' && /[xX]/.test(sql[i + 1] || '')) {
          i += 2;
          while (i < n && /[0-9a-fA-F]/.test(sql[i])) i++;
        } else {
          while (i < n && (isDigit(sql[i]) || sql[i] === '.')) i++;
          if (/[eE]/.test(sql[i] || '') && /[0-9+-]/.test(sql[i + 1] || '')) {
            i += 2;
            while (i < n && isDigit(sql[i])) i++;
          }
        }
        out.push({ t: 'num', v: sql.slice(s, i), s, e: i });
      } else if (isStart(c)) {
        while (i < n && isPart(sql[i])) i++;
        out.push({ t: 'id', v: sql.slice(s, i), s, e: i });
      } else if (c === '@' || c === ':' && isStart(sql[i + 1] || '')) {
        i++;
        while (i < n && (isPart(sql[i]) || sql[i] === '@')) i++;
        out.push({ t: 'var', v: sql.slice(s, i), s, e: i });
      } else {
        const two = sql.slice(i, i + 3) === '->>' ? '->>' : sql.slice(i, i + 2);
        if (two === '->>' || OPS2.includes(two)) i += two.length; else i++;
        out.push({ t: 'op', v: sql.slice(s, i), s, e: i });
      }
    }
    return out;
  }

  const U = tok => (tok && tok.t === 'id') ? tok.v.toUpperCase() : null;
  const isName = tok => tok && (tok.t === 'id' || tok.t === 'dq' || tok.t === 'bq' || tok.t === 'str');
  const nameOf = tok => tok ? (tok.t === 'id' ? tok.v : tok.x) : '';
  const sig = toks => toks.filter(t => t.t !== 'ws' && t.t !== 'com');

  /* ─── In Anweisungen teilen ──────────────────────────────── */
  /* Am Semikolon — außer im Rumpf eines Triggers (BEGIN … END;),
     dort darf es stehen. CASE … END zählt mit, sonst endete der
     Trigger am ersten CASE. */
  function split(sql) {
    const toks = tokenize(sql);
    const out = [];
    let cur = [];
    let trigger = false, inBody = false, cases = 0;
    const flush = (endTok) => {
      const s = sig(cur);
      if (s.length) {
        const first = s[0], last = s[s.length - 1];
        out.push({
          toks: cur.slice(), sig: s,
          start: first.s, end: last.e,
          text: sql.slice(first.s, last.e),
          endsWithSemicolon: !!endTok
        });
      } else if (cur.some(t => t.t === 'com')) {
        // Nur Kommentar — zählt nicht als Anweisung.
      }
      cur = [];
      trigger = false; inBody = false; cases = 0;
    };
    for (const tk of toks) {
      if (tk.t === 'op' && tk.v === ';' && !(trigger && inBody)) { flush(tk); continue; }
      cur.push(tk);
      if (tk.t !== 'id') continue;
      const u = tk.v.toUpperCase();
      const s = sig(cur);
      if (s.length <= 4 && u === 'TRIGGER' && U(s[0]) === 'CREATE') trigger = true;
      if (trigger) {
        if (u === 'BEGIN') inBody = true;
        else if (inBody && u === 'CASE') cases++;
        else if (inBody && u === 'END') { if (cases > 0) cases--; else inBody = false; }
      }
    }
    flush(null);
    return out;
  }

  /* ─── Bezeichner schreiben ───────────────────────────────── */
  const RESERVED = new Set(('ABORT ACTION ADD AFTER ALL ALTER ALWAYS ANALYZE AND AS ASC ATTACH AUTOINCREMENT ' +
    'BEFORE BEGIN BETWEEN BY CASCADE CASE CAST CHECK COLLATE COLUMN COMMIT CONFLICT CONSTRAINT CREATE CROSS ' +
    'CURRENT CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT DEFERRABLE DEFERRED DELETE DESC DETACH ' +
    'DISTINCT DO DROP EACH ELSE END ESCAPE EXCEPT EXCLUDE EXCLUSIVE EXISTS EXPLAIN FAIL FILTER FIRST FOLLOWING FOR ' +
    'FOREIGN FROM FULL GENERATED GLOB GROUP GROUPS HAVING IF IGNORE IMMEDIATE IN INDEX INDEXED INITIALLY INNER INSERT ' +
    'INSTEAD INTERSECT INTO IS ISNULL JOIN KEY LAST LEFT LIKE LIMIT MATCH MATERIALIZED NATURAL NO NOT NOTHING NOTNULL ' +
    'NULL NULLS OF OFFSET ON OR ORDER OTHERS OUTER OVER PARTITION PLAN PRAGMA PRECEDING PRIMARY QUERY RAISE RANGE ' +
    'RECURSIVE REFERENCES REGEXP REINDEX RELEASE RENAME REPLACE RESTRICT RETURNING RIGHT ROLLBACK ROW ROWS SAVEPOINT ' +
    'SELECT SET TABLE TEMP TEMPORARY THEN TIES TO TRANSACTION TRIGGER UNBOUNDED UNION UNIQUE UPDATE USING VACUUM ' +
    'VALUES VIEW VIRTUAL WHEN WHERE WINDOW WITH WITHOUT').split(' '));

  function q(name) {
    name = String(name);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !RESERVED.has(name.toUpperCase())) return name;
    return '"' + name.replace(/"/g, '""') + '"';
  }
  const lit = v => v === null || v === undefined ? 'NULL'
    : typeof v === 'number' ? String(v)
    : "'" + String(v).replace(/'/g, "''") + "'";

  /* Text eines Tokenbereichs (für CHECK, DEFAULT, Typ-Argumente).
     Strings werden SQLite-gerecht neu geschrieben, damit \' aus MySQL
     nicht als Fehler im Schema landet. */
  function raw(toks) {
    let s = '', prev = null;
    for (const t of toks) {
      if (t.t === 'com') continue;
      // Die Liste kommt meist ohne Leerraum-Tokens — wo im Original
      // eine Lücke war, gehört ein Leerzeichen hin.
      if (prev && t.s > prev.e && t.t !== 'ws' && prev.t !== 'ws') s += ' ';
      prev = t;
      if (t.t === 'str') s += lit(t.x);
      else if (t.t === 'bq') s += q(t.x);
      else s += t.v;
    }
    return s.replace(/\s+/g, ' ').trim();
  }

  /* ─── CREATE TABLE lesen ─────────────────────────────────── */
  /* Ein kleiner Leser über der Token-Liste (ohne ws/com). Er kennt
     SQLite UND die MySQL-Zusätze. Was er nicht versteht (CREATE
     TABLE … AS SELECT, GENERATED nur teilweise), meldet er mit null;
     der Aufrufer reicht die Anweisung dann unverändert an SQLite. */
  function reader(toks) {
    let i = 0;
    const r = {
      peek: (k = 0) => toks[i + k],
      next: () => toks[i++],
      done: () => i >= toks.length,
      get i() { return i; }, set i(v) { i = v; },
      is: (...ws) => ws.some(w => U(toks[i]) === w),
      isOp: v => toks[i] && toks[i].t === 'op' && toks[i].v === v,
      eat(...ws) { if (r.is(...ws)) { i++; return true; } return false; },
      eatOp(v) { if (r.isOp(v)) { i++; return true; } return false; },
      expectOp(v) { if (!r.eatOp(v)) throw new Error('erwartet ' + v); },
      // Alles bis zur passenden Klammer zu (die öffnende ist schon gelesen).
      group() {
        const start = i; let d = 1;
        while (i < toks.length) {
          const t = toks[i];
          if (t.t === 'op' && t.v === '(') d++;
          else if (t.t === 'op' && t.v === ')') { d--; if (d === 0) { i++; return toks.slice(start, i - 1); } }
          i++;
        }
        throw new Error('Klammer fehlt');
      },
      name() {
        const t = toks[i];
        if (!isName(t)) throw new Error('Name erwartet');
        i++;
        // schema.tabelle → nur die Tabelle
        if (r.isOp('.') && isName(toks[i + 1])) { i++; return nameOf(toks[i++]); }
        return nameOf(t);
      }
    };
    return r;
  }

  // Spaltenliste in Klammern: (a, b(10) DESC, `c`) → ['a','b','c']
  function colList(r) {
    r.expectOp('(');
    const g = r.group();
    const out = [];
    let depth = 0, first = true;
    for (const t of g) {
      if (t.t === 'op' && t.v === '(') { depth++; continue; }
      if (t.t === 'op' && t.v === ')') { depth--; continue; }
      if (depth) continue;
      if (t.t === 'op' && t.v === ',') { first = true; continue; }
      if (first && isName(t)) { out.push(nameOf(t)); first = false; }
    }
    return out;
  }

  function fkTail(r, fk) {
    fk.ref = r.name();
    fk.refCols = r.isOp('(') ? colList(r) : [];
    for (;;) {
      if (r.eat('ON')) {
        const which = r.next().v.toUpperCase();
        let act;
        if (r.eat('SET')) act = 'SET ' + r.next().v.toUpperCase();
        else if (r.eat('NO')) { r.eat('ACTION'); act = 'NO ACTION'; }
        else act = r.next().v.toUpperCase();
        if (which === 'DELETE') fk.onDelete = act; else fk.onUpdate = act;
      } else if (r.eat('MATCH')) { r.next(); }
      else if (r.is('NOT') && U(r.peek(1)) === 'DEFERRABLE') { r.i += 2; if (r.eat('INITIALLY')) r.next(); }
      else if (r.eat('DEFERRABLE')) { if (r.eat('INITIALLY')) r.next(); }
      else break;
    }
    return fk;
  }

  const COL_STOP = new Set(['CONSTRAINT', 'PRIMARY', 'NOT', 'NULL', 'UNIQUE', 'CHECK', 'DEFAULT', 'COLLATE',
    'REFERENCES', 'GENERATED', 'AS', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'COMMENT', 'ON', 'CHARSET', 'KEY',
    'INVISIBLE', 'VISIBLE', 'FIRST', 'AFTER']);
  const MYSQL_COLLATIONS = c => !['NOCASE', 'BINARY', 'RTRIM'].includes(c.toUpperCase());

  /* Eine Spaltendefinition. `mysql` sammelt, was übersetzt werden
     musste (für den Hinweis „übersetzt aus MySQL"). */
  function parseColumn(r, mysql) {
    const col = { name: r.name(), type: '', notnull: false, pk: false, ai: false, unique: false,
                  dflt: null, check: null, collate: null, generated: null, enumValues: null,
                  fk: null, pkOrder: '', comment: null };
    // Typ: Wörter + (Argumente), bis ein Schlüsselwort kommt.
    const typeParts = [];
    while (!r.done() && !r.isOp(',') && !r.isOp(')')) {
      const t = r.peek();
      const u = U(t);
      if (u && COL_STOP.has(u)) break;
      if (u === 'CHARACTER' && U(r.peek(1)) === 'SET') break;
      if (t.t === 'id') {
        r.next();
        if ((u === 'ENUM' || u === 'SET') && r.isOp('(')) {
          r.next();
          const g = r.group();
          col.enumValues = g.filter(x => x.t === 'str').map(x => x.x);
          mysql.push(u);
          typeParts.push('TEXT');
          continue;
        }
        if (u === 'UNSIGNED' || u === 'SIGNED' || u === 'ZEROFILL') { mysql.push(u); continue; }
        typeParts.push(t.v);
        if (r.isOp('(')) { r.next(); typeParts.push('(' + raw(r.group()) + ')'); }
      } else break;
    }
    col.type = typeParts.join(' ').replace(/ \(/g, '(');
    let cname = null;
    while (!r.done() && !r.isOp(',') && !r.isOp(')')) {
      if (r.eat('CONSTRAINT')) { cname = r.name(); continue; }
      if (r.eat('PRIMARY')) {
        r.eat('KEY'); col.pk = true;
        if (r.is('ASC', 'DESC')) col.pkOrder = r.next().v.toUpperCase();
        if (r.eat('ON')) { r.eat('CONFLICT'); r.next(); }
        if (r.eat('AUTOINCREMENT')) col.ai = true;
      } else if (r.eat('KEY')) { col.pk = true; mysql.push('KEY'); }
      else if (r.eat('NOT')) { r.eat('NULL'); col.notnull = true; if (r.eat('ON')) { r.eat('CONFLICT'); r.next(); } }
      else if (r.eat('NULL')) { /* erlaubt leer — Standard */ }
      else if (r.eat('UNIQUE')) { r.eat('KEY'); col.unique = true; if (r.eat('ON')) { r.eat('CONFLICT'); r.next(); } }
      else if (r.eat('CHECK')) { r.expectOp('('); col.check = raw(r.group()); }
      else if (r.eat('DEFAULT')) {
        if (r.isOp('(')) { r.next(); col.dflt = '(' + raw(r.group()) + ')'; }
        else if (r.isOp('-') || r.isOp('+')) { const s = r.next().v; col.dflt = s + r.next().v; }
        else {
          const t = r.next();
          if (t.t === 'str') col.dflt = lit(t.x);
          else if (t.t === 'id' && r.isOp('(') && !/^(CURRENT_TIMESTAMP|NOW|LOCALTIMESTAMP|LOCALTIME)$/i.test(t.v)) {
            // DEFAULT gen_random_uuid() / UUID() wie in PostgreSQL bzw. MySQL —
            // SQLite will eine Funktion als Standardwert in Klammern.
            r.next();
            col.dflt = '(' + t.v + '(' + raw(r.group()) + '))';
            mysql.push('FUNC_DEFAULT');
          } else if (t.t === 'id' && /^(CURRENT_TIMESTAMP|NOW|LOCALTIMESTAMP|LOCALTIME)$/i.test(t.v)) {
            if (r.isOp('(')) { r.next(); r.group(); mysql.push('NOW()'); }
            col.dflt = 'CURRENT_TIMESTAMP';
          } else col.dflt = t.v;
        }
      } else if (r.eat('COLLATE')) {
        const c = r.next().v;
        if (MYSQL_COLLATIONS(c)) mysql.push('COLLATE'); else col.collate = c;
      } else if (r.eat('REFERENCES')) {
        col.fk = fkTail(r, { name: cname, cols: [col.name], ref: null, refCols: [], onDelete: null, onUpdate: null });
      } else if (r.is('GENERATED') || r.is('AS')) {
        if (r.eat('GENERATED')) { r.eat('ALWAYS'); }
        r.eat('AS'); r.expectOp('(');
        const expr = raw(r.group());
        let kind = '';
        if (r.is('STORED', 'VIRTUAL')) kind = r.next().v.toUpperCase();
        col.generated = { expr, kind };
      } else if (r.eat('AUTO_INCREMENT')) { col.ai = true; mysql.push('AUTO_INCREMENT'); }
      else if (r.eat('AUTOINCREMENT')) { col.ai = true; }
      else if (r.eat('COMMENT')) { const t = r.next(); col.comment = t.x || t.v; mysql.push('COMMENT'); }
      else if (r.eat('ON')) { r.eat('UPDATE'); r.next(); if (r.isOp('(')) { r.next(); r.group(); } mysql.push('ON UPDATE'); }
      else if (r.eat('CHARACTER') || r.eat('CHARSET')) { r.eat('SET'); r.next(); mysql.push('CHARSET'); }
      else if (r.eat('INVISIBLE') || r.eat('VISIBLE')) { mysql.push('VISIBLE'); }
      else if (r.is('FIRST', 'AFTER')) break;   // ALTER … AFTER x — gehört dem Aufrufer
      else throw new Error('unbekannt: ' + r.peek().v);
    }
    if (col.enumValues && !col.check) {
      col.check = q(col.name) + ' IN (' + col.enumValues.map(lit).join(', ') + ')';
    }
    return col;
  }

  /* CREATE TABLE … → Modell, oder null, wenn es keins ist. */
  function parseCreate(sigToks) {
    const r = reader(sigToks);
    const mysql = [];
    if (!r.eat('CREATE')) return null;
    const temp = r.eat('TEMP') || r.eat('TEMPORARY');
    if (!r.eat('TABLE')) return null;
    let ifNotExists = false;
    if (r.eat('IF')) { r.eat('NOT'); r.eat('EXISTS'); ifNotExists = true; }
    const m = { name: r.name(), temp, ifNotExists, columns: [], pk: null, uniques: [], checks: [],
                fks: [], indexes: [], withoutRowid: false, strict: false, mysql };
    if (!r.isOp('(')) return null;   // AS SELECT, LIKE … — nicht unser Fall
    r.next();
    for (;;) {
      if (r.isOp(')')) { r.next(); break; }
      let cname = null;
      if (r.eat('CONSTRAINT')) cname = isName(r.peek()) && !r.is('PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN') ? r.name() : null;
      if (r.eat('PRIMARY')) {
        r.eat('KEY');
        if (isName(r.peek()) && !r.isOp('(')) r.next();     // MySQL: PRIMARY KEY name (…)
        m.pk = { name: cname, cols: colList(r) };
        if (r.eat('USING')) r.next();
        if (r.eat('ON')) { r.eat('CONFLICT'); r.next(); }
      } else if (r.eat('UNIQUE')) {
        if (r.eat('KEY') || r.eat('INDEX')) mysql.push('UNIQUE KEY');
        let nm = cname;
        if (isName(r.peek()) && !r.isOp('(')) nm = r.name();
        m.uniques.push({ name: nm, cols: colList(r) });
        if (r.eat('USING')) r.next();
        if (r.eat('ON')) { r.eat('CONFLICT'); r.next(); }
      } else if (r.eat('CHECK')) {
        r.expectOp('(');
        m.checks.push({ name: cname, expr: raw(r.group()) });
      } else if (r.eat('FOREIGN')) {
        r.eat('KEY');
        let nm = cname;
        if (isName(r.peek()) && !r.isOp('(')) nm = r.name();
        const cols = colList(r);
        if (!r.eat('REFERENCES')) throw new Error('REFERENCES fehlt');
        m.fks.push(fkTail(r, { name: nm, cols, ref: null, refCols: [], onDelete: null, onUpdate: null }));
      } else if (r.is('KEY', 'INDEX', 'FULLTEXT', 'SPATIAL')) {
        const kind = r.next().v.toUpperCase();
        if (kind === 'FULLTEXT' || kind === 'SPATIAL') r.eat('KEY') || r.eat('INDEX');
        let nm = null;
        if (isName(r.peek()) && !r.isOp('(')) nm = r.name();
        m.indexes.push({ name: nm, cols: colList(r), unique: false });
        if (r.eat('USING')) r.next();
        mysql.push('KEY');
      } else {
        m.columns.push(parseColumn(r, mysql));
      }
      if (r.eatOp(',')) continue;
      if (r.isOp(')')) continue;
      throw new Error('Komma oder Klammer erwartet');
    }
    // Tabellenoptionen
    while (!r.done()) {
      if (r.eat('WITHOUT')) { r.eat('ROWID'); m.withoutRowid = true; }
      else if (r.eat('STRICT')) m.strict = true;
      else if (r.eatOp(',')) { /* SQLite: WITHOUT ROWID, STRICT */ }
      else { mysql.push('ENGINE'); r.next(); }      // ENGINE=InnoDB, CHARSET=…, COMMENT='…'
    }
    // Spalten-FKs in die Tabellenliste heben, damit es EINE Liste gibt.
    for (const c of m.columns) if (c.fk) { m.fks.push(c.fk); c.fkInline = true; }
    // Spalten-PK in die Tabellen-PK
    const inlinePk = m.columns.filter(c => c.pk);
    if (!m.pk && inlinePk.length) m.pk = { name: null, cols: inlinePk.map(c => c.name) };
    // UNIQUE an der Spalte
    m.columns.forEach(c => { c.orig = c.name; });
    return m;
  }

  const sameName = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const findCol = (m, n) => m.columns.find(c => sameName(c.name, n));

  /* Modell → CREATE TABLE in SQLite. Gibt außerdem Warnungen zurück
     (z. B. AUTO_INCREMENT an einer Spalte, die kein Primärschlüssel
     sein kann). */
  function createSql(m, opts = {}) {
    const warn = [];
    const name = opts.name || m.name;
    const pkCols = m.pk ? m.pk.cols : [];
    const ai = m.columns.filter(c => c.ai);
    let inlinePk = null;
    if (ai.length) {
      const c = ai[0];
      if (pkCols.length === 0) { inlinePk = c.name; }
      else if (pkCols.length === 1 && sameName(pkCols[0], c.name)) inlinePk = c.name;
      else warn.push('AUTO_INCREMENT bei »' + c.name + '« geht nur, wenn sie allein der Primärschlüssel ist — ignoriert.');
      if (ai.length > 1) warn.push('Nur eine Spalte kann AUTO_INCREMENT sein.');
    }
    const lines = [];
    for (const c of m.columns) {
      let s = '  ' + q(c.name);
      const isAiPk = inlinePk && sameName(inlinePk, c.name);
      if (isAiPk) s += ' INTEGER PRIMARY KEY AUTOINCREMENT';
      else if (c.type) s += ' ' + c.type;
      if (!isAiPk && pkCols.length === 1 && sameName(pkCols[0], c.name) && !inlinePk && !(m.pk && m.pk.name)) {
        s += ' PRIMARY KEY' + (c.pkOrder ? ' ' + c.pkOrder : '');
      }
      if (c.notnull && !isAiPk) s += ' NOT NULL';
      if (c.unique) s += ' UNIQUE';
      if (c.dflt !== null && c.dflt !== undefined && c.dflt !== '') s += ' DEFAULT ' + c.dflt;
      if (c.collate) s += ' COLLATE ' + c.collate;
      if (c.generated) s += ' GENERATED ALWAYS AS (' + c.generated.expr + ')' + (c.generated.kind ? ' ' + c.generated.kind : '');
      if (c.check) s += ' CHECK (' + c.check + ')';
      lines.push(s);
    }
    const pkInline = inlinePk || (pkCols.length === 1 && !(m.pk && m.pk.name));
    if (pkCols.length && !pkInline) {
      lines.push('  ' + (m.pk.name ? 'CONSTRAINT ' + q(m.pk.name) + ' ' : '') +
        'PRIMARY KEY (' + pkCols.map(q).join(', ') + ')');
    }
    for (const u of m.uniques) {
      lines.push('  ' + (u.name ? 'CONSTRAINT ' + q(u.name) + ' ' : '') + 'UNIQUE (' + u.cols.map(q).join(', ') + ')');
    }
    for (const c of m.checks) {
      lines.push('  ' + (c.name ? 'CONSTRAINT ' + q(c.name) + ' ' : '') + 'CHECK (' + c.expr + ')');
    }
    for (const f of m.fks) {
      let s = '  ' + (f.name ? 'CONSTRAINT ' + q(f.name) + ' ' : '') +
        'FOREIGN KEY (' + f.cols.map(q).join(', ') + ') REFERENCES ' + q(f.ref);
      if (f.refCols && f.refCols.length) s += ' (' + f.refCols.map(q).join(', ') + ')';
      if (f.onDelete) s += ' ON DELETE ' + f.onDelete;
      if (f.onUpdate) s += ' ON UPDATE ' + f.onUpdate;
      lines.push(s);
    }
    let sql = 'CREATE ' + (m.temp ? 'TEMP ' : '') + 'TABLE ' + (m.ifNotExists && !opts.name ? 'IF NOT EXISTS ' : '') +
      q(name) + ' (\n' + lines.join(',\n') + '\n)';
    const opt = [];
    if (m.withoutRowid) opt.push('WITHOUT ROWID');
    if (m.strict) opt.push('STRICT');
    if (opt.length) sql += ' ' + opt.join(', ');
    return { sql, warn };
  }

  /* ─── Lesen aus der Datenbank ────────────────────────────── */

  function all(db, sql, params) {
    const st = db.prepare(sql);
    try {
      if (params) st.bind(params);
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally { st.free(); }
  }
  const one = (db, sql, params) => all(db, sql, params)[0] || null;

  function tableNames(db) {
    return all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .map(r => r.name);
  }
  function realName(db, name) {
    const r = one(db, "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=lower(?)", [name]);
    return r ? r.name : null;
  }

  /* Modell einer bestehenden Tabelle — aus ihrem CREATE-Text. */
  function modelOf(db, table) {
    const row = one(db, "SELECT name, sql FROM sqlite_master WHERE type='table' AND lower(name)=lower(?)", [table]);
    if (!row) return null;
    let m = null;
    try { m = parseCreate(sig(tokenize(row.sql))); } catch (e) { m = null; }
    if (!m) return null;
    m.name = row.name;
    m.ifNotExists = false;
    return m;
  }

  /* Was die Oberfläche über die Datenbank wissen will: Tabellen,
     Spalten, Schlüssel, Zeilenzahl, Sichten. Grundlage sind die
     PRAGMAs (die stimmen immer), das Modell ergänzt AUTO_INCREMENT,
     ENUM-Werte und FK-Namen. */
  function schema(db) {
    const tables = [];
    for (const name of tableNames(db)) {
      const info = all(db, 'PRAGMA table_xinfo(' + q(name) + ')').filter(c => !c.hidden || c.hidden === 0 || c.hidden > 1);
      const fkl = all(db, 'PRAGMA foreign_key_list(' + q(name) + ')');
      const idx = all(db, 'PRAGMA index_list(' + q(name) + ')');
      const m = modelOf(db, name);
      const pkCols = info.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
      const indexes = idx.map(ix => ({
        name: ix.name, unique: !!ix.unique, origin: ix.origin,
        cols: all(db, 'PRAGMA index_info(' + q(ix.name) + ')').sort((a, b) => a.seqno - b.seqno).map(r => r.name)
      }));
      const fks = [];
      for (const r of fkl) {
        let f = fks.find(x => x.id === r.id);
        if (!f) { f = { id: r.id, cols: [], ref: r.table, refCols: [], onDelete: r.on_delete, onUpdate: r.on_update, name: null }; fks.push(f); }
        f.cols.push(r.from); f.refCols.push(r.to);
      }
      for (const f of fks) {
        // REFERENCES t ohne Spalte heißt: deren Primärschlüssel
        if (f.refCols.some(c => c === null)) {
          const pr = all(db, 'PRAGMA table_info(' + q(f.ref) + ')').filter(c => c.pk > 0).map(c => c.name);
          f.refCols = pr.length ? pr : f.refCols.map(() => 'rowid');
        }
        if (m) {
          const mf = m.fks.find(x => x.cols.join(',').toLowerCase() === f.cols.join(',').toLowerCase() && sameName(x.ref, f.ref));
          if (mf) f.name = mf.name;
        }
      }
      const columns = info.map(c => {
        const mc = m ? findCol(m, c.name) : null;
        const uniq = indexes.some(ix => ix.unique && ix.cols.length === 1 && sameName(ix.cols[0], c.name));
        const fk = fks.find(f => f.cols.length === 1 && sameName(f.cols[0], c.name));
        return {
          name: c.name, type: c.type || '', notnull: !!c.notnull, dflt: c.dflt_value,
          pk: c.pk > 0, ai: !!(mc && mc.ai && c.pk > 0), unique: uniq,
          enumValues: mc ? mc.enumValues || enumFromCheck(mc.check, c.name) : null,
          check: mc ? mc.check : null,
          fk: fk ? { table: fk.ref, col: fk.refCols[0], name: fk.name } : null,
          generated: c.hidden > 1
        };
      });
      let rows = null;
      try { rows = one(db, 'SELECT count(*) AS n FROM ' + q(name)).n; } catch (e) { rows = null; }
      const sqlRow = one(db, "SELECT sql FROM sqlite_master WHERE name=?", [name]);
      tables.push({ name, columns, pk: pkCols, fks, indexes, rows, sql: sqlRow ? sqlRow.sql : '',
                    withoutRowid: !!(m && m.withoutRowid), parsed: !!m });
    }
    const views = all(db, "SELECT name, sql FROM sqlite_master WHERE type='view' ORDER BY name").map(v => {
      let columns = [];
      try { columns = all(db, 'PRAGMA table_info(' + q(v.name) + ')').map(c => ({ name: c.name, type: c.type })); } catch (e) { /* kaputte Sicht */ }
      return { name: v.name, sql: v.sql, columns };
    });
    const triggers = all(db, "SELECT name, tbl_name AS tbl, sql FROM sqlite_master WHERE type='trigger' ORDER BY name");
    return { tables, views, triggers };
  }

  // "farbe" IN ('rot','blau') → ['rot','blau']
  function enumFromCheck(check, col) {
    if (!check) return null;
    try {
      const t = sig(tokenize(check));
      if (t.length < 4 || !sameName(nameOf(t[0]), col) || U(t[1]) !== 'IN' || t[2].v !== '(') return null;
      const vals = [];
      for (let i = 3; i < t.length; i++) {
        if (t[i].t === 'str') vals.push(t[i].x);
        else if (t[i].v === ',') continue;
        else if (t[i].v === ')' && i === t.length - 1) return vals.length ? vals : null;
        else return null;
      }
    } catch (e) { /* kein ENUM */ }
    return null;
  }

  /* ─── Tabelle neu bauen ──────────────────────────────────── */
  /* Das Rezept aus der SQLite-Doku (»Making Other Kinds Of Table
     Schema Changes«): Fremdschlüssel aus, neue Tabelle, Daten
     hinüber, alte weg, umbenennen, Indizes und Trigger zurück,
     Fremdschlüssel prüfen, erst dann festschreiben. Spalten tragen
     `orig` — den Namen, unter dem ihre Daten in der alten Tabelle
     stehen (null = neue Spalte, bleibt leer bzw. DEFAULT). */
  function rebuild(db, oldName, m, extraIndexes) {
    const warn = [];
    const fkWas = one(db, 'PRAGMA foreign_keys').foreign_keys;
    const tmp = '_sqlstudio_neu';
    const { sql: createNew, warn: w } = createSql(m, { name: tmp });
    warn.push(...w);
    const idx = all(db, "SELECT name, sql FROM sqlite_master WHERE type='index' AND lower(tbl_name)=lower(?) AND sql IS NOT NULL", [oldName]);
    const trg = all(db, "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND lower(tbl_name)=lower(?)", [oldName]);
    const keep = m.columns.filter(c => c.orig && !c.generated);
    db.run('PRAGMA foreign_keys = OFF');
    db.run('SAVEPOINT sqlstudio_umbau');
    try {
      db.run(createNew);
      if (keep.length) {
        db.run('INSERT INTO ' + q(tmp) + ' (' + keep.map(c => q(c.name)).join(', ') + ') SELECT ' +
               keep.map(c => q(c.orig)).join(', ') + ' FROM ' + q(oldName));
      }
      db.run('DROP TABLE ' + q(oldName));
      db.run('ALTER TABLE ' + q(tmp) + ' RENAME TO ' + q(m.name));
      // Indizes: Spaltennamen nachziehen, verschwundene Spalten → Index weg
      const ren = {};
      m.columns.forEach(c => { if (c.orig) ren[c.orig.toLowerCase()] = c.name; });
      for (const ix of idx) {
        const toks = tokenize(ix.sql);
        let ok = true, afterOn = false, inCols = false;
        for (let k = 0; k < toks.length; k++) {
          const t = toks[k];
          if (U(t) === 'ON') afterOn = true;
          else if (afterOn && t.t === 'op' && t.v === '(') inCols = true;
          else if (afterOn && !inCols && isName(t) && sameName(nameOf(t), oldName)) { t.v = q(m.name); }
          else if (inCols && isName(t) && U(t) !== 'ASC' && U(t) !== 'DESC' && U(t) !== 'COLLATE') {
            const prev = sig(toks.slice(0, k)).pop();
            if (prev && U(prev) === 'COLLATE') continue;
            const nm = ren[nameOf(t).toLowerCase()];
            if (!nm) { ok = false; break; }
            t.v = q(nm); t.t = 'id';
          }
        }
        if (ok) db.run(toks.map(t => t.v).join(''));
        else warn.push('Index »' + ix.name + '« entfernt — eine seiner Spalten gibt es nicht mehr.');
      }
      for (const ix of extraIndexes || []) db.run(ix);
      for (const t of trg) {
        try { db.run(t.sql); } catch (e) { warn.push('Trigger »' + t.name + '« entfernt: ' + e.message); }
      }
      if (fkWas) {
        const bad = all(db, 'PRAGMA foreign_key_check');
        if (bad.length) {
          const b = bad[0];
          const err = new Error('FOREIGN KEY constraint failed');
          err.fkCheck = { table: b.table, parent: b.parent, n: bad.length };
          throw err;
        }
      }
      db.run('RELEASE sqlstudio_umbau');
    } catch (e) {
      try { db.run('ROLLBACK TO sqlstudio_umbau'); db.run('RELEASE sqlstudio_umbau'); } catch (e2) { /* schon weg */ }
      if (fkWas) db.run('PRAGMA foreign_keys = ON');
      throw e;
    }
    if (fkWas) db.run('PRAGMA foreign_keys = ON');
    return warn;
  }

  /* ─── ALTER TABLE ────────────────────────────────────────── */
  /* Liest alle Aktionen (MySQL erlaubt mehrere mit Komma) und
     entscheidet: geht es mit SQLite selbst (RENAME, einfaches ADD
     COLUMN), sonst Umbau. Rückgabe: Liste der Schritte. */
  function planAlter(db, s) {
    const r = reader(s);
    r.eat('ALTER'); r.eat('IGNORE'); r.eat('ONLINE'); r.eat('TABLE');
    const table = r.name();
    const real = realName(db, table);
    if (!real) { const e = new Error('no such table: ' + table); throw e; }
    const steps = [];          // { native: sql } | { rebuild } | { after: sql }
    const native = [];
    const post = [];
    let m = null;
    const model = () => {
      if (!m) {
        m = modelOf(db, real);
        if (!m) throw new Error('Die Tabelle »' + real + '« lässt sich nicht automatisch umbauen.');
      }
      return m;
    };
    let rebuildNeeded = false;
    let newName = null;
    const place = (col) => {
      if (r.eat('FIRST')) return 0;
      if (r.eat('AFTER')) { const a = r.name(); const k = model().columns.findIndex(c => sameName(c.name, a)); if (k < 0) throw new Error('no such column: ' + a); return k + 1; }
      return -1;
    };
    const putCol = (col, pos, replaceIdx) => {
      const cols = model().columns;
      if (replaceIdx >= 0) cols.splice(replaceIdx, 1);
      if (pos < 0) cols.splice(replaceIdx >= 0 ? replaceIdx : cols.length, 0, col);
      else cols.splice(pos > replaceIdx && replaceIdx >= 0 ? pos - 1 : pos, 0, col);
    };
    const pkFromCol = (col) => {
      if (col.pk) { model().pk = { name: null, cols: [col.name] }; }
      if (col.fk) { model().fks.push(col.fk); col.fk = null; }
    };

    do {
      if (r.eat('ADD')) {
        let cname = null;
        if (r.eat('CONSTRAINT')) cname = !r.is('PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN') ? r.name() : null;
        if (r.eat('PRIMARY')) {
          r.eat('KEY'); if (isName(r.peek()) && !r.isOp('(')) r.next();
          model().pk = { name: cname, cols: colList(r) };
          model().columns.forEach(c => { c.pk = false; });
          rebuildNeeded = true;
        } else if (r.is('UNIQUE') && !(U(r.peek(1)) === 'KEY' || U(r.peek(1)) === 'INDEX') && !isName(r.peek(1)) || (r.is('UNIQUE') && cname)) {
          r.next(); r.eat('KEY') || r.eat('INDEX');
          let nm = cname; if (isName(r.peek()) && !r.isOp('(')) nm = r.name();
          model().uniques.push({ name: nm, cols: colList(r) });
          rebuildNeeded = true;
        } else if (r.is('UNIQUE', 'KEY', 'INDEX', 'FULLTEXT', 'SPATIAL')) {
          const uniq = r.eat('UNIQUE');
          r.eat('FULLTEXT'); r.eat('SPATIAL'); r.eat('KEY') || r.eat('INDEX');
          let nm = null; if (isName(r.peek()) && !r.isOp('(')) nm = r.name();
          const cols = colList(r);
          if (r.eat('USING')) r.next();
          nm = nm || ((uniq ? 'uq_' : 'idx_') + real + '_' + cols.join('_'));
          if (one(db, "SELECT 1 FROM sqlite_master WHERE type='index' AND lower(name)=lower(?)", [nm])) nm = real + '_' + nm;
          post.push('CREATE ' + (uniq ? 'UNIQUE ' : '') + 'INDEX ' + q(nm) + ' ON ' + q(real) + ' (' + cols.map(q).join(', ') + ')');
        } else if (r.eat('CHECK')) {
          r.expectOp('(');
          model().checks.push({ name: cname, expr: raw(r.group()) });
          rebuildNeeded = true;
        } else if (r.eat('FOREIGN')) {
          r.eat('KEY');
          let nm = cname; if (isName(r.peek()) && !r.isOp('(')) nm = r.name();
          const cols = colList(r);
          if (!r.eat('REFERENCES')) throw new Error('REFERENCES fehlt');
          const ref = realName(db, nameOf(r.peek())) || null;
          if (!ref) throw new Error('no such table: ' + nameOf(r.peek()));
          const fk = fkTail(r, { name: nm, cols, ref: null, refCols: [], onDelete: null, onUpdate: null });
          fk.ref = ref;
          model().fks.push(fk);
          rebuildNeeded = true;
        } else {
          r.eat('COLUMN');
          if (r.is('IF')) { r.next(); r.eat('NOT'); r.eat('EXISTS'); }
          if (r.isOp('(')) throw new Error('Bitte jede Spalte mit eigenem ADD COLUMN hinzufügen.');
          const mysql = [];
          const start = r.i;
          const col = parseColumn(r, mysql);
          if (findCol(model(), col.name)) throw new Error('duplicate column name: ' + col.name);
          col.orig = null;
          const pos = place(col);
          const simple = !col.pk && !col.unique && !col.ai && pos < 0 && !mysql.length &&
            !(col.notnull && (col.dflt === null)) && !(col.dflt && /^\(|CURRENT_/i.test(col.dflt));
          if (simple && !rebuildNeeded && steps.length === 0) {
            native.push('ALTER TABLE ' + q(real) + ' ADD COLUMN ' + raw(s.slice(start, r.i)));
          }
          if (!simple) rebuildNeeded = true;
          pkFromCol(col);
          putCol(col, pos, -1);
        }
      } else if (r.eat('DROP')) {
        if (r.eat('PRIMARY')) {
          r.eat('KEY');
          model().pk = null; model().columns.forEach(c => { c.pk = false; c.ai = false; });
          rebuildNeeded = true;
        } else if (r.eat('FOREIGN')) {
          r.eat('KEY');
          const nm = r.name();
          const fks = model().fks;
          let k = fks.findIndex(f => f.name && sameName(f.name, nm));
          if (k < 0) k = fks.findIndex(f => f.cols.length === 1 && sameName(f.cols[0], nm));
          if (k < 0) throw new Error('Fremdschlüssel »' + nm + '« gibt es in »' + real + '« nicht.');
          fks.splice(k, 1);
          rebuildNeeded = true;
        } else if (r.is('INDEX', 'KEY')) {
          r.next();
          const nm = r.name();
          const ui = model().uniques.findIndex(u => u.name && sameName(u.name, nm));
          if (ui >= 0) { model().uniques.splice(ui, 1); rebuildNeeded = true; }
          else post.push('DROP INDEX ' + q(nm));
        } else if (r.eat('CHECK') || r.eat('CONSTRAINT')) {
          const nm = r.name();
          const mm = model();
          let hit = false;
          for (const list of [mm.checks, mm.uniques, mm.fks]) {
            const k = list.findIndex(x => x.name && sameName(x.name, nm));
            if (k >= 0) { list.splice(k, 1); hit = true; }
          }
          if (mm.pk && mm.pk.name && sameName(mm.pk.name, nm)) { mm.pk = null; hit = true; }
          if (!hit) throw new Error('Die Bedingung »' + nm + '« gibt es in »' + real + '« nicht.');
          rebuildNeeded = true;
        } else {
          r.eat('COLUMN');
          if (r.is('IF')) { r.next(); r.eat('EXISTS'); }
          const nm = r.name();
          const mm = model();
          const k = mm.columns.findIndex(c => sameName(c.name, nm));
          if (k < 0) throw new Error('no such column: ' + nm);
          const gone = mm.columns[k].name;
          mm.columns.splice(k, 1);
          if (!mm.columns.length) throw new Error('Die letzte Spalte kann man nicht löschen — lösche dann die ganze Tabelle.');
          if (mm.pk) { mm.pk.cols = mm.pk.cols.filter(c => !sameName(c, gone)); if (!mm.pk.cols.length) mm.pk = null; }
          mm.uniques = mm.uniques.filter(u => !u.cols.some(c => sameName(c, gone)));
          mm.fks = mm.fks.filter(f => !f.cols.some(c => sameName(c, gone)));
          rebuildNeeded = true;
        }
      } else if (r.eat('MODIFY')) {
        r.eat('COLUMN');
        const col = parseColumn(r, []);
        const mm = model();
        const k = mm.columns.findIndex(c => sameName(c.name, col.name));
        if (k < 0) throw new Error('no such column: ' + col.name);
        col.orig = mm.columns[k].orig; col.name = mm.columns[k].name;
        const pos = place(col);
        if (mm.pk && mm.pk.cols.length === 1 && sameName(mm.pk.cols[0], col.name) && !col.pk) col.pk = true;
        if (col.fk) { mm.fks = mm.fks.filter(f => !(f.cols.length === 1 && sameName(f.cols[0], col.name))); }
        pkFromCol(col);
        putCol(col, pos, k);
        rebuildNeeded = true;
      } else if (r.eat('CHANGE')) {
        r.eat('COLUMN');
        const old = r.name();
        const col = parseColumn(r, []);
        const mm = model();
        const k = mm.columns.findIndex(c => sameName(c.name, old));
        if (k < 0) throw new Error('no such column: ' + old);
        const oldName = mm.columns[k].name;
        if (!sameName(oldName, col.name) || oldName !== col.name) {
          // Umbenennen macht SQLite selbst — dabei zieht es auch die
          // Verweise in anderen Tabellen nach. Danach erst umbauen.
          steps.push({ native: 'ALTER TABLE ' + q(real) + ' RENAME COLUMN ' + q(oldName) + ' TO ' + q(col.name) });
          const rn = c => sameName(c, oldName) ? col.name : c;
          if (mm.pk) mm.pk.cols = mm.pk.cols.map(rn);
          mm.uniques.forEach(u => { u.cols = u.cols.map(rn); });
          mm.fks.forEach(f => { f.cols = f.cols.map(rn); });
        }
        col.orig = col.name;
        mm.columns.forEach(c => { if (c !== mm.columns[k] && c.orig) { /* bleibt */ } });
        const pos = place(col);
        if (mm.pk && mm.pk.cols.length === 1 && sameName(mm.pk.cols[0], col.name) && !col.pk) col.pk = true;
        if (col.fk) { mm.fks = mm.fks.filter(f => !(f.cols.length === 1 && sameName(f.cols[0], col.name))); }
        pkFromCol(col);
        putCol(col, pos, k);
        rebuildNeeded = true;
      } else if (r.eat('RENAME')) {
        if (r.eat('COLUMN') || (isName(r.peek()) && !r.is('TO', 'AS') && U(r.peek(1)) === 'TO')) {
          const a = r.name(); r.eat('TO'); const b = r.name();
          const mm = m;
          steps.push({ native: 'ALTER TABLE ' + q(real) + ' RENAME COLUMN ' + q(a) + ' TO ' + q(b) });
          if (mm) {
            const c = findCol(mm, a);
            if (c) { c.name = b; c.orig = b; }
            const rn = x => sameName(x, a) ? b : x;
            if (mm.pk) mm.pk.cols = mm.pk.cols.map(rn);
            mm.uniques.forEach(u => { u.cols = u.cols.map(rn); });
            mm.fks.forEach(f => { f.cols = f.cols.map(rn); });
          }
        } else if (r.eat('INDEX') || r.eat('KEY')) {
          throw new Error('Einen Index umbenennen geht hier nicht — lösche ihn und lege ihn neu an.');
        } else {
          r.eat('TO') || r.eat('AS');
          newName = r.name();
        }
      } else if (r.eat('ALTER')) {
        r.eat('COLUMN');
        const nm = r.name();
        const c = findCol(model(), nm);
        if (!c) throw new Error('no such column: ' + nm);
        if (r.eat('SET')) {
          r.eat('DEFAULT');
          if (r.isOp('(')) { r.next(); c.dflt = '(' + raw(r.group()) + ')'; }
          else if (r.isOp('-')) { r.next(); c.dflt = '-' + r.next().v; }
          else { const t = r.next(); c.dflt = t.t === 'str' ? lit(t.x) : t.v; }
        } else if (r.eat('DROP')) { r.eat('DEFAULT'); c.dflt = null; }
        else throw new Error('ALTER COLUMN kennt hier nur SET DEFAULT und DROP DEFAULT.');
        rebuildNeeded = true;
      } else if (r.is('AUTO_INCREMENT', 'ENGINE', 'DEFAULT', 'CHARSET', 'CHARACTER', 'COLLATE', 'COMMENT', 'ROW_FORMAT', 'CONVERT')) {
        // Tabellenoptionen aus MySQL-Dumps — bedeutungslos in SQLite
        while (!r.done() && !r.isOp(',')) r.next();
      } else {
        throw new Error('ALTER TABLE: »' + (r.peek() ? r.peek().v : '') + '« verstehe ich nicht.');
      }
    } while (r.eatOp(','));
    if (!r.done()) throw new Error('near "' + r.peek().v + '": syntax error');

    if (rebuildNeeded) {
      // Native ADD COLUMN zählen nicht mehr — der Umbau macht alles.
      steps.push({ rebuild: { table: real, model: m, post } });
    } else {
      native.forEach(sql => steps.push({ native: sql }));
      post.forEach(sql => steps.push({ native: sql }));
    }
    if (newName) steps.push({ native: 'ALTER TABLE ' + q(real) + ' RENAME TO ' + q(newName) });
    return { table: real, steps };
  }

  /* ─── Eine Anweisung verstehen ───────────────────────────── */
  /* Liefert { level, kind, … }:
       kind 'sql'      → sql (übersetzt), translated (bool)
       kind 'alter'    → plan (siehe planAlter)
       kind 'multi'    → list von sql (DROP TABLE a, b)
       kind 'show'     → what: tables | create | columns
       kind 'app'      → cmd: create_database | drop_database | use | show_databases
       kind 'noop'     → note
       kind 'deny'     → message (z. B. ATTACH)
  */
  const READ_PRAGMAS = new Set(['TABLE_INFO', 'TABLE_XINFO', 'TABLE_LIST', 'FOREIGN_KEY_LIST', 'INDEX_LIST',
    'INDEX_INFO', 'INDEX_XINFO', 'FOREIGN_KEY_CHECK', 'INTEGRITY_CHECK', 'QUICK_CHECK', 'FOREIGN_KEYS',
    'DATABASE_LIST', 'COLLATION_LIST', 'FUNCTION_LIST', 'COMPILE_OPTIONS']);

  function classify(st, db) {
    const s = st.sig;
    const w0 = U(s[0]), w1 = U(s[1]), w2 = U(s[2]);
    const ret = (o) => o;
    const tr = translateTokens(st.toks);
    const sql = tr.sql;

    switch (w0) {
      case 'SELECT': case 'WITH': case 'VALUES':
        return ret({ level: 1, kind: 'sql', sql, translated: tr.changed, verb: 'SELECT' });
      case 'INSERT': case 'REPLACE':
        return ret({ level: 1, kind: 'sql', sql, translated: tr.changed, verb: 'INSERT' });
      case 'UPDATE':
        return ret({ level: 1, kind: 'sql', sql, translated: tr.changed, verb: 'UPDATE', noWhere: !s.some(t => U(t) === 'WHERE') });
      case 'DELETE':
        return ret({ level: 1, kind: 'sql', sql, translated: tr.changed, verb: 'DELETE', noWhere: !s.some(t => U(t) === 'WHERE') });
      case 'TRUNCATE': {
        const r = reader(s); r.next(); r.eat('TABLE');
        const t = r.name();
        return ret({ level: 1, kind: 'multi', verb: 'DELETE', translated: true, list: [
          'DELETE FROM ' + q(t),
          "DELETE FROM sqlite_sequence WHERE name = " + lit(realName(db, t) || t)
        ], soft: [1] });
      }
      case 'BEGIN': case 'COMMIT': case 'END': case 'ROLLBACK': case 'SAVEPOINT': case 'RELEASE':
        return ret({ level: 1, kind: 'sql', sql, translated: tr.changed, verb: 'TX' });
      case 'START':
        return ret({ level: 1, kind: 'sql', sql: 'BEGIN', translated: true, verb: 'TX' });
      case 'EXPLAIN': case 'DESCRIBE': case 'DESC': {
        // MySQL: DESCRIBE tabelle / EXPLAIN tabelle
        if (s.length >= 2 && s.length <= 4 && isName(s[1]) && !['SELECT', 'QUERY', 'WITH', 'INSERT', 'UPDATE', 'DELETE'].includes(w1)) {
          const r = reader(s); r.next(); const t = r.name();
          return ret({ level: 1, kind: 'show', what: 'columns', table: t });
        }
        return ret({ level: 1, kind: 'sql', sql, translated: tr.changed, verb: 'SELECT' });
      }
      case 'SHOW': {
        if (w1 === 'DATABASES' || w1 === 'SCHEMAS') return { level: 1, kind: 'app', cmd: 'show_databases' };
        if (w1 === 'TABLES' || (w1 === 'FULL' && w2 === 'TABLES')) return { level: 1, kind: 'show', what: 'tables' };
        if (w1 === 'CREATE' && w2 === 'TABLE') { const r = reader(s); r.i = 3; return { level: 1, kind: 'show', what: 'create', table: r.name() }; }
        if (w1 === 'COLUMNS' || w1 === 'FIELDS' || (w1 === 'FULL' && (w2 === 'COLUMNS' || w2 === 'FIELDS'))) {
          const r = reader(s); r.i = w1 === 'FULL' ? 3 : 2; r.eat('FROM') || r.eat('IN'); return { level: 1, kind: 'show', what: 'columns', table: r.name() };
        }
        if (w1 === 'INDEX' || w1 === 'INDEXES' || w1 === 'KEYS') {
          const r = reader(s); r.i = 2; r.eat('FROM') || r.eat('IN'); return { level: 1, kind: 'show', what: 'index', table: r.name() };
        }
        if (w1 === 'TRIGGERS') return { level: 1, kind: 'show', what: 'triggers' };
        return { level: 1, kind: 'noop', note: 'SHOW ' + (s[1] ? s[1].v : '') + ' gibt es hier nicht.' };
      }
      case 'USE': {
        const r = reader(s); r.next(); return { level: 1, kind: 'app', cmd: 'use', name: r.name() };
      }
      case 'SET': {
        if (w1 === 'FOREIGN_KEY_CHECKS' || (s[1] && s[1].t === 'var' && /foreign_key_checks/i.test(s[1].v))) {
          const v = s[s.length - 1].v;
          return { level: 2, kind: 'sql', sql: 'PRAGMA foreign_keys = ' + (v === '0' || /^off$/i.test(v) ? 'OFF' : 'ON'), translated: true, verb: 'PRAGMA' };
        }
        return { level: 1, kind: 'noop', note: 'MySQL-Einstellung – hier ohne Bedeutung, übersprungen.' };
      }
      case 'LOCK': case 'UNLOCK': case 'FLUSH': case 'ANALYZE': case 'OPTIMIZE':
        return { level: 1, kind: 'noop', note: (s[0].v.toUpperCase()) + ' – hier ohne Bedeutung, übersprungen.' };
      case 'ATTACH': case 'DETACH':
        return { level: NEVER, kind: 'deny', message: 'Andere Datenbankdateien einbinden geht in SQL Studio nicht.' };
      case 'PRAGMA': {
        const name = (U(s[1]) || '').toUpperCase();
        if (name === 'WRITABLE_SCHEMA') return { level: NEVER, kind: 'deny', message: 'Diese Einstellung ist gesperrt.' };
        const assigns = s.some(t => t.t === 'op' && t.v === '=');
        const lvl = READ_PRAGMAS.has(name) && !assigns ? 1 : 2;
        return { level: lvl, kind: 'sql', sql, translated: false, verb: 'PRAGMA' };
      }
      case 'VACUUM':
        if (s.some(t => U(t) === 'INTO')) return { level: NEVER, kind: 'deny', message: 'VACUUM INTO geht hier nicht.' };
        return { level: 2, kind: 'sql', sql, verb: 'DDL' };
      case 'REINDEX':
        return { level: 2, kind: 'sql', sql, verb: 'DDL' };
      case 'RENAME': {
        // MySQL: RENAME TABLE a TO b [, c TO d]
        const r = reader(s); r.next(); r.eat('TABLE');
        const list = [];
        do { const a = r.name(); r.eat('TO'); const b = r.name(); list.push('ALTER TABLE ' + q(a) + ' RENAME TO ' + q(b)); } while (r.eatOp(','));
        return { level: 2, kind: 'multi', list, translated: true, verb: 'DDL' };
      }
      case 'ALTER':
        if (w1 === 'DATABASE' || w1 === 'SCHEMA') return { level: 1, kind: 'noop', note: 'ALTER DATABASE – hier ohne Bedeutung, übersprungen.' };
        return { level: 2, kind: 'alter', verb: 'DDL' };
      case 'CREATE': {
        if (w1 === 'DATABASE' || w1 === 'SCHEMA') {
          const r = reader(s); r.i = 2;
          let ine = false; if (r.eat('IF')) { r.eat('NOT'); r.eat('EXISTS'); ine = true; }
          return { level: 3, kind: 'app', cmd: 'create_database', name: r.name(), ifNotExists: ine };
        }
        const isTable = w1 === 'TABLE' || ((w1 === 'TEMP' || w1 === 'TEMPORARY') && w2 === 'TABLE');
        if (isTable) {
          let m = null;
          try { m = parseCreate(s); } catch (e) { m = null; }
          if (m && m.mysql.length) {
            return { level: 2, kind: 'create_table', model: m, verb: 'DDL', translated: true };
          }
          return { level: 2, kind: 'sql', sql, translated: tr.changed, verb: 'DDL' };
        }
        // CREATE INDEX name ON t (col(10)) USING BTREE → ohne Präfixlänge
        if (w1 === 'INDEX' || w1 === 'UNIQUE' || w1 === 'FULLTEXT' || w1 === 'SPATIAL') {
          return { level: 2, kind: 'sql', sql: fixCreateIndex(s, db), translated: true, verb: 'DDL' };
        }
        return { level: 2, kind: 'sql', sql, translated: tr.changed, verb: 'DDL' };
      }
      case 'DROP': {
        if (w1 === 'DATABASE' || w1 === 'SCHEMA') {
          const r = reader(s); r.i = 2;
          let ie = false; if (r.eat('IF')) { r.eat('EXISTS'); ie = true; }
          return { level: 3, kind: 'app', cmd: 'drop_database', name: r.name(), ifExists: ie };
        }
        if (w1 === 'TABLE' || w1 === 'VIEW') {
          const r = reader(s); r.i = 2;
          let ie = false; if (r.eat('IF')) { r.eat('EXISTS'); ie = true; }
          const names = [];
          do { names.push(r.name()); } while (r.eatOp(','));
          // CASCADE/RESTRICT aus MySQL ignorieren
          if (names.length > 1 || !r.done()) {
            return { level: 2, kind: 'multi', verb: 'DDL', translated: true,
                     list: names.map(n => 'DROP ' + w1 + ' ' + (ie ? 'IF EXISTS ' : '') + q(n)) };
          }
          return { level: 2, kind: 'sql', sql, translated: tr.changed, verb: 'DDL' };
        }
        if (w1 === 'INDEX') {
          // MySQL: DROP INDEX name ON tabelle
          const k = s.findIndex(t => U(t) === 'ON');
          if (k > 0) return { level: 2, kind: 'sql', sql: raw(s.slice(0, k)), translated: true, verb: 'DDL' };
        }
        return { level: 2, kind: 'sql', sql, translated: tr.changed, verb: 'DDL' };
      }
      case 'GRANT': case 'REVOKE':
        return { level: NEVER, kind: 'deny', message: 'Rechte vergibt in SQL Studio die Lehrkraft im Raum, nicht per SQL.' };
      default:
        return { level: 1, kind: 'sql', sql, translated: tr.changed, verb: '?' };
    }
  }

  function fixCreateIndex(s, db) {
    const out = [];
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const t = s[i];
      const u = U(t);
      if (i <= 1 && (u === 'FULLTEXT' || u === 'SPATIAL')) continue;
      if (t.t === 'op' && t.v === '(') {
        depth++;
        // (spalte(10)) → (spalte)
        if (depth === 2 && s[i + 1] && s[i + 1].t === 'num' && s[i + 2] && s[i + 2].v === ')') { i += 2; depth--; continue; }
      }
      if (t.t === 'op' && t.v === ')') depth--;
      if (u === 'USING' && depth === 0) { i++; continue; }
      out.push(t);
    }
    let sql = '';
    out.forEach((t, k) => {
      const prev = out[k - 1];
      const glue = !prev || (t.t === 'op' && /^[),.]$/.test(t.v)) || (prev.t === 'op' && /^[(.]$/.test(prev.v)) ? '' : ' ';
      sql += glue + (t.t === 'str' ? lit(t.x) : t.t === 'bq' ? q(t.x) : t.v);
    });
    return sql;
  }

  /* Wort-für-Wort-Übersetzung für alles außer CREATE TABLE/ALTER:
     Funktionen, die SQLite anders heißt, INSERT IGNORE, Strings mit
     Backslash. Leerraum und Kommentare bleiben stehen. */
  const FN_RENAME = { IF: 'IIF', LEFT: 'sqls_left', RIGHT: 'sqls_right', TRUNCATE: 'sqls_truncate',
                      MOD: 'sqls_mod' };
  function translateTokens(toks) {
    let changed = false;
    const sigIdx = [];
    toks.forEach((t, i) => { if (t.t !== 'ws' && t.t !== 'com') sigIdx.push(i); });
    const out = toks.map(t => t.v);
    const nextSig = (i) => { const k = sigIdx.indexOf(i); return k >= 0 ? toks[sigIdx[k + 1]] : null; };
    const prevSig = (i) => { const k = sigIdx.indexOf(i); return k > 0 ? toks[sigIdx[k - 1]] : null; };
    toks.forEach((t, i) => {
      if (t.t === 'str' && lit(t.x) !== t.v) { out[i] = lit(t.x); changed = true; }
      if (t.t !== 'id') return;
      const u = t.v.toUpperCase();
      const nx = nextSig(i);
      if (FN_RENAME[u] && nx && nx.t === 'op' && nx.v === '(') {
        const pv = prevSig(i);
        if (u === 'IF' && pv && U(pv) === 'EXISTS') return;
        out[i] = FN_RENAME[u]; changed = true;
      }
      if (u === 'IGNORE') {
        const pv = prevSig(i);
        if (pv && U(pv) === 'INSERT') { out[i] = 'OR IGNORE'; changed = true; }
      }
      if ((u === 'SIGNED' || u === 'UNSIGNED') && prevSig(i) && U(prevSig(i)) === 'AS') {
        out[i] = 'INTEGER'; changed = true;
        if (nx && U(nx) === 'INTEGER') { const k = sigIdx.indexOf(i); out[sigIdx[k + 1]] = ''; }
      }
    });
    // Kommentare am Rand weglassen, damit die Anweisung sauber ist
    const s = sigIdx.length ? sigIdx[0] : 0, e = sigIdx.length ? sigIdx[sigIdx.length - 1] : -1;
    return { sql: out.slice(s, e + 1).join(''), changed };
  }

  /* ─── MySQL-Funktionen für SQLite ────────────────────────── */
  function pad(n, l = 2) { return String(n).padStart(l, '0'); }
  function parseDate(v) {
    if (v === null || v === undefined) return null;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  }
  function nowLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function installFunctions(db) {
    const f = (name, fn) => { try { db.create_function(name, fn); } catch (e) { /* schon da */ } };
    f('NOW', () => nowLocal());
    f('SYSDATE', () => nowLocal());
    f('CURDATE', () => nowLocal().slice(0, 10));
    f('CURTIME', () => nowLocal().slice(11));
    f('YEAR', v => { const d = parseDate(v); return d ? d.y : null; });
    f('MONTH', v => { const d = parseDate(v); return d ? d.mo : null; });
    f('DAY', v => { const d = parseDate(v); return d ? d.d : null; });
    f('DAYOFMONTH', v => { const d = parseDate(v); return d ? d.d : null; });
    f('HOUR', v => { const d = parseDate(v); return d ? d.h : null; });
    f('MINUTE', v => { const d = parseDate(v); return d ? d.mi : null; });
    f('WEEKDAY', v => { const d = parseDate(v); return d ? (new Date(d.y, d.mo - 1, d.d).getDay() + 6) % 7 : null; });
    f('DAYOFWEEK', v => { const d = parseDate(v); return d ? new Date(d.y, d.mo - 1, d.d).getDay() + 1 : null; });
    f('DATEDIFF', (a, b) => {
      const x = parseDate(a), y = parseDate(b);
      if (!x || !y) return null;
      return Math.round((Date.UTC(x.y, x.mo - 1, x.d) - Date.UTC(y.y, y.mo - 1, y.d)) / 86400000);
    });
    f('DATE_FORMAT', (v, fmt) => {
      const d = parseDate(v);
      if (!d || fmt === null) return null;
      const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
      return String(fmt).replace(/%([a-zA-Z%])/g, (_, c) => ({
        Y: d.y, y: pad(d.y % 100), m: pad(d.mo), c: d.mo, d: pad(d.d), e: d.d, H: pad(d.h), k: d.h,
        i: pad(d.mi), s: pad(d.s), S: pad(d.s), M: MON[d.mo - 1], '%': '%'
      })[c] ?? '%' + c);
    });
    f('UCASE', v => v === null ? null : String(v).toUpperCase());
    f('LCASE', v => v === null ? null : String(v).toLowerCase());
    f('CHAR_LENGTH', v => v === null ? null : [...String(v)].length);
    f('CHARACTER_LENGTH', v => v === null ? null : [...String(v)].length);
    f('sqls_left', (v, n) => v === null ? null : [...String(v)].slice(0, Math.max(0, n)).join(''));
    f('sqls_right', (v, n) => v === null ? null : (n <= 0 ? '' : [...String(v)].slice(-n).join('')));
    f('sqls_truncate', (v, n) => { if (v === null) return null; const p = Math.pow(10, n || 0); return Math.trunc(v * p) / p; });
    f('sqls_mod', (a, b) => (a === null || b === null || b === 0) ? null : a % b);
    f('LOCATE', (sub, s, pos) => s === null || sub === null ? null : String(s).indexOf(String(sub), (pos || 1) - 1) + 1);
    f('RAND', () => Math.random());
    // UUID: zufällige Kennung (Version 4) — MySQL UUID(), PostgreSQL gen_random_uuid()
    const uuid = () => {
      const c = (typeof crypto !== 'undefined') ? crypto : null;
      if (c && c.randomUUID) return c.randomUUID();
      const b = new Uint8Array(16);
      if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
    };
    f('UUID', uuid);
    f('gen_random_uuid', uuid);
    f('uuid_generate_v4', uuid);
    f('REVERSE', v => v === null ? null : [...String(v)].reverse().join(''));
    f('LPAD', (v, n, p) => v === null ? null : String(v).padStart(n, p === null || p === undefined ? ' ' : String(p)).slice(0, n));
    f('RPAD', (v, n, p) => v === null ? null : String(v).padEnd(n, p === null || p === undefined ? ' ' : String(p)).slice(0, n));
    f('REPEAT', (v, n) => v === null ? null : String(v).repeat(Math.max(0, n)));
    f('SPACE', n => ' '.repeat(Math.max(0, n || 0)));
    f('GREATEST', (...a) => a.some(x => x === null) ? null : a.reduce((x, y) => (y > x ? y : x)));
    f('LEAST', (...a) => a.some(x => x === null) ? null : a.reduce((x, y) => (y < x ? y : x)));
  }

  /* ─── Fehler auf Deutsch ─────────────────────────────────── */

  function lev(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length][b.length];
  }
  function closest(word, list) {
    let best = null, bd = Infinity;
    for (const w of list) {
      const d = lev(word, w);
      if (d < bd) { bd = d; best = w; }
    }
    return best && bd <= Math.max(2, Math.floor(word.length / 3)) && bd > 0 ? best : null;
  }
  function allColumns(db) {
    const out = new Set();
    for (const t of tableNames(db)) {
      try { all(db, 'PRAGMA table_info(' + q(t) + ')').forEach(c => out.add(c.name)); } catch (e) { /* egal */ }
    }
    return [...out];
  }

  function german(msg, db, st) {
    const raw0 = String(msg || '');
    let m;
    const say = (message, hint) => ({ message, hint: hint || null, raw: raw0 });
    if ((m = raw0.match(/no such table: (?:main\.)?(.+)$/))) {
      const t = m[1];
      const s = closest(t, tableNames(db));
      return say('Die Tabelle »' + t + '« gibt es nicht.',
        s ? 'Meintest du »' + s + '«?' : 'Links in der Liste stehen alle Tabellen dieser Datenbank.');
    }
    if ((m = raw0.match(/no such column: (.+)$/))) {
      const c = m[1];
      const bare = c.split('.').pop();
      const s = closest(bare, allColumns(db));
      let hint = s ? 'Meintest du »' + s + '«?' : null;
      if (!hint && /^[A-Za-zÄÖÜäöüß ]+$/.test(bare) && st && st.text.includes('"' + bare + '"')) {
        hint = 'Texte stehen in einfachen Anführungszeichen: \'' + bare + '\'.';
      }
      return say('Die Spalte »' + c + '« gibt es nicht.', hint || 'Unter »Struktur« siehst du alle Spalten.');
    }
    if ((m = raw0.match(/near "(.*)": syntax error/s))) {
      const w = m[1];
      let hint = 'Prüfe die Stelle davor: fehlt ein Komma, eine Klammer oder ein Schlüsselwort?';
      if (/^(FROM|WHERE|GROUP|ORDER|HAVING|LIMIT)$/i.test(w)) hint = 'Steht vor »' + w + '« vielleicht ein Komma zu viel?';
      if (/^DUPLICATE$/i.test(w)) hint = 'ON DUPLICATE KEY UPDATE gibt es hier nicht. Nimm INSERT … ON CONFLICT (spalte) DO UPDATE SET …';
      if (/^INTERVAL$/i.test(w)) hint = "Statt DATE_ADD(datum, INTERVAL 3 DAY) schreibe date(datum, '+3 days').";
      if (/^\)$/.test(w)) hint = 'Steht vor der Klammer ein Komma zu viel?';
      if (/^,$/.test(w)) hint = 'Fehlt hier etwas zwischen zwei Kommas?';
      if (/^(select|insert|update|delete|create)$/i.test(w)) hint = 'Fehlt am Ende der Anweisung davor ein Semikolon (;)?';
      return say('Fehler in der Schreibweise bei »' + w + '«.', hint);
    }
    if (/incomplete input/.test(raw0) || /unrecognized token/.test(raw0)) {
      const tok = (raw0.match(/unrecognized token: "(.*)"/) || [])[1];
      return say('Die Anweisung ist unvollständig' + (tok ? ' (bei »' + tok + '«)' : '') + '.',
        'Fehlt eine schließende Klammer oder ein Anführungszeichen?');
    }
    if ((m = raw0.match(/UNIQUE constraint failed: (.+)$/))) {
      return say('Diesen Wert in »' + m[1] + '« gibt es schon.', 'Die Spalte ist eindeutig (PRIMARY KEY oder UNIQUE) — jeder Wert darf nur einmal vorkommen.');
    }
    if ((m = raw0.match(/NOT NULL constraint failed: (.+)$/))) {
      return say('»' + m[1] + '« darf nicht leer bleiben.', 'Die Spalte ist NOT NULL — gib einen Wert an.');
    }
    if ((m = raw0.match(/CHECK constraint failed: (.+)$/))) {
      return say('Dieser Wert ist nicht erlaubt.', 'Bedingung: ' + m[1]);
    }
    if (/FOREIGN KEY constraint failed/.test(raw0)) {
      return say('Fremdschlüssel verletzt.', 'Entweder verweist der Wert auf einen Datensatz, den es nicht gibt — oder es hängen noch Datensätze an dem, den du löschen oder ändern willst.');
    }
    if (/foreign key mismatch/.test(raw0)) {
      return say('Der Fremdschlüssel zeigt auf eine Spalte, die nicht eindeutig ist.', 'Ein Fremdschlüssel muss auf den Primärschlüssel (oder eine UNIQUE-Spalte) der anderen Tabelle zeigen.');
    }
    if ((m = raw0.match(/(?:table|view) (.+) already exists/))) {
      return say('»' + m[1] + '« gibt es schon.', 'Wähle einen anderen Namen oder schreibe CREATE TABLE IF NOT EXISTS.');
    }
    if ((m = raw0.match(/index (.+) already exists/))) return say('Den Index »' + m[1] + '« gibt es schon.');
    if ((m = raw0.match(/duplicate column name: (.+)$/))) return say('Die Spalte »' + m[1] + '« gibt es schon.');
    if ((m = raw0.match(/ambiguous column name: (.+)$/))) {
      return say('»' + m[1] + '« ist mehrdeutig.', 'Die Spalte gibt es in mehreren Tabellen. Schreibe Tabelle.' + m[1] + '.');
    }
    if ((m = raw0.match(/table (.+) has (\d+) columns but (\d+) values were supplied/))) {
      return say('»' + m[1] + '« hat ' + m[2] + ' Spalten, du gibst aber ' + m[3] + ' Werte an.', 'Nenne die Spalten: INSERT INTO ' + m[1] + ' (spalte1, spalte2) VALUES (…).');
    }
    if ((m = raw0.match(/(\d+) values for (\d+) columns/))) {
      return say('Du gibst ' + m[1] + ' Werte für ' + m[2] + ' Spalten an.', 'Anzahl der Spalten und der Werte muss gleich sein.');
    }
    if ((m = raw0.match(/no such function: (.+)$/))) {
      return say('Die Funktion »' + m[1] + '« gibt es nicht.', 'Vielleicht heißt sie hier anders — z. B. LENGTH statt LEN, SUBSTR statt MID.');
    }
    if (/misuse of aggregate/.test(raw0)) {
      return say('COUNT, SUM, AVG … stehen an einer Stelle, wo sie nicht erlaubt sind.', 'Bedingungen auf Gruppen gehören in HAVING, nicht in WHERE.');
    }
    if (/a GROUP BY clause is required before HAVING/.test(raw0)) return say('HAVING geht nur zusammen mit GROUP BY.');
    if (/datatype mismatch/.test(raw0)) return say('Der Wert passt nicht zum Datentyp der Spalte.', 'Ein INTEGER PRIMARY KEY nimmt nur ganze Zahlen.');
    if (/cannot start a transaction within a transaction/.test(raw0)) return say('Es läuft schon eine Transaktion.', 'Erst COMMIT oder ROLLBACK, dann BEGIN.');
    if (/cannot (commit|rollback) - no transaction is active/.test(raw0)) return say('Es läuft gerade keine Transaktion.');
    if ((m = raw0.match(/no such index: (.+)$/))) return say('Den Index »' + m[1] + '« gibt es nicht.');
    if (/Cannot add a PRIMARY KEY column|Cannot add a UNIQUE column/.test(raw0)) return say('So eine Spalte lässt sich nicht nachträglich hinzufügen.');
    if (/Cannot add a NOT NULL column with default value NULL/.test(raw0)) return say('Eine neue NOT-NULL-Spalte braucht einen DEFAULT-Wert.', 'Die vorhandenen Zeilen bekommen sonst keinen Wert.');
    if (/interrupted/.test(raw0)) return say('Abgebrochen.');
    if (/^ALTER TABLE|^Die |^Bitte |^Fremdschlüssel |^Einen |^ALTER COLUMN|^Rechte |^Den |^So /.test(raw0)) return say(raw0);
    return say('SQLite meldet: ' + raw0);
  }

  /* ─── Ausführen ──────────────────────────────────────────── */

  function cellOut(v) {
    if (v instanceof Uint8Array) return { blob: v.length };
    return v;
  }

  function runSelect(db, sql, maxRows) {
    const st = db.prepare(sql);
    try {
      const columns = st.getColumnNames();
      const rows = [];
      let truncated = false;
      while (st.step()) {
        if (rows.length >= maxRows) { truncated = true; break; }
        rows.push(st.get().map(cellOut));
      }
      return { columns, rows, truncated };
    } finally { st.free(); }
  }

  /* Eine einzelne SQL-Anweisung an SQLite. Gibt Zeilen zurück, wenn
     es welche gibt (SELECT, PRAGMA, … RETURNING), sonst die Zahl der
     geänderten Zeilen. */
  function execOne(db, sql, maxRows) {
    const before = db.getRowsModified ? null : null;
    const st = db.prepare(sql);
    try {
      const columns = st.getColumnNames();
      const rows = [];
      let truncated = false;
      while (st.step()) {
        if (rows.length >= maxRows) { truncated = true; continue; }
        rows.push(st.get().map(cellOut));
      }
      return { columns, rows, truncated, changes: db.getRowsModified() };
    } finally { st.free(); void before; }
  }

  function describe(db, table) {
    const real = realName(db, table);
    if (!real) throw new Error('no such table: ' + table);
    const sc = schema(db);
    const t = sc.tables.find(x => x.name === real);
    const cols = t ? t.columns : sc.views.find(v => v.name === real).columns;
    return {
      columns: ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'],
      rows: cols.map(c => [
        c.name, c.enumValues ? 'enum(' + c.enumValues.map(lit).join(',') + ')' : (c.type || ''),
        c.notnull || c.pk ? 'NO' : 'YES',
        c.pk ? 'PRI' : c.unique ? 'UNI' : (c.fk || (t && t.indexes.some(ix => ix.cols[0] === c.name))) ? 'MUL' : '',
        c.dflt === undefined ? null : c.dflt,
        c.ai ? 'auto_increment' : ''
      ])
    };
  }

  /* Hauptfunktion: einen ganzen Text ausführen.
     opts: { rights: 'use'|'modify'|'create', maxRows }
     Rückgabe: { results: [...], changed, schemaChanged, stop }
     stop = { cmd, name, …, rest } — die App muss erst etwas tun
     (Datenbank anlegen/wechseln) und dann `rest` weiterlaufen lassen. */
  function run(db, text, opts = {}) {
    const rights = LEVEL[opts.rights || 'create'] || 3;
    // Eigene Datenbanken sind ein eigener Schalter im Raum („create"),
    // unabhängig vom Recht an der offenen Datenbank: wer in einer
    // geteilten nur abfragen darf, darf trotzdem eine eigene anlegen.
    const canDb = opts.createDb !== undefined ? !!opts.createDb : rights >= 3;
    // Nur ansehen (die Lehrkraft schaut in die Kopie eines Kindes).
    const readOnly = !!opts.readOnly;
    const maxRows = opts.maxRows || 1000;
    const offset = opts.offset || 0;
    const stmts = split(text);
    const results = [];
    let changed = false, schemaChanged = false;
    for (let k = 0; k < stmts.length; k++) {
      const st = stmts[k];
      const t0 = Date.now();
      const base = { sql: st.text, start: st.start + offset, end: st.end + offset };
      let c;
      try { c = classify(st, db); }
      catch (e) {
        results.push(Object.assign(base, { kind: 'error' }, german(e.message, db, st)));
        break;
      }
      const looks = c.level === 1 && (c.verb === 'SELECT' || c.verb === 'TX' || c.verb === 'PRAGMA' ||
        c.kind === 'show' || c.kind === 'noop' || (c.kind === 'app' && (c.cmd === 'use' || c.cmd === 'show_databases')));
      if (readOnly && !looks && c.level !== NEVER) {
        results.push(Object.assign(base, {
          kind: 'error', denied: true,
          message: 'Diese Datenbank kannst du hier nur ansehen.',
          hint: 'Abfragen (SELECT) gehen. Zum Ändern: über ⋯ als eigene Datenbank kopieren.'
        }));
        break;
      }
      const allowed = c.level === NEVER ? false : c.level === 3 ? canDb : c.level <= rights;
      if (!allowed) {
        const need = c.level === NEVER ? null : LEVEL_NAME[c.level];
        results.push(Object.assign(base, {
          kind: 'error', denied: true,
          message: c.kind === 'deny' ? c.message
            : need === 'modify' ? 'Die Struktur dieser Datenbank darfst du nicht verändern.'
            : need === 'create' ? 'Eigene Datenbanken anlegen oder löschen ist hier nicht freigegeben.'
            : 'Das ist hier nicht erlaubt.',
          hint: c.kind === 'deny' ? null
            : need === 'modify' ? 'Dein Recht hier: Daten abfragen und ändern (SELECT, INSERT, UPDATE, DELETE).'
            : 'Frag deine Lehrkraft, wenn du das brauchst.'
        }));
        break;
      }
      if (c.kind === 'app') {
        const restStart = st.endsWithSemicolon ? text.indexOf(';', st.end) + 1 : st.end;
        return { results, changed, schemaChanged,
                 stop: Object.assign({}, c, { sql: st.text, start: base.start, end: base.end, rest: text.slice(restStart), restOffset: offset + restStart }) };
      }
      try {
        let res;
        if (c.kind === 'noop') {
          res = { kind: 'info', message: c.note };
        } else if (c.kind === 'show') {
          if (c.what === 'tables') {
            const rows = all(db, "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
            res = { kind: 'rows', columns: ['Tabelle'], rows: rows.map(r => [r.name + (r.type === 'view' ? ' (Sicht)' : '')]) };
          } else if (c.what === 'create') {
            const real = realName(db, c.table);
            if (!real) throw new Error('no such table: ' + c.table);
            const r = one(db, 'SELECT sql FROM sqlite_master WHERE name=?', [real]);
            res = { kind: 'rows', columns: ['Table', 'Create Table'], rows: [[real, r.sql]] };
          } else if (c.what === 'columns') {
            res = Object.assign({ kind: 'rows' }, describe(db, c.table));
          } else if (c.what === 'index') {
            const real = realName(db, c.table);
            if (!real) throw new Error('no such table: ' + c.table);
            const sc = schema(db).tables.find(x => x.name === real);
            res = { kind: 'rows', columns: ['Table', 'Key_name', 'Unique', 'Columns'],
                    rows: (sc ? sc.indexes : []).map(ix => [real, ix.origin === 'pk' ? 'PRIMARY' : ix.name, ix.unique ? 'ja' : 'nein', ix.cols.join(', ')]) };
          } else if (c.what === 'triggers') {
            res = { kind: 'rows', columns: ['Trigger', 'Table'], rows: all(db, "SELECT name, tbl_name FROM sqlite_master WHERE type='trigger'").map(r => [r.name, r.tbl_name]) };
          }
        } else if (c.kind === 'create_table') {
          const { sql, warn } = createSql(c.model);
          const extra = c.model.indexes.map(ix => {
            let nm = ix.name || ('idx_' + c.model.name + '_' + ix.cols.join('_'));
            if (one(db, "SELECT 1 FROM sqlite_master WHERE type='index' AND lower(name)=lower(?)", [nm])) nm = c.model.name + '_' + nm;
            return 'CREATE INDEX ' + q(nm) + ' ON ' + q(c.model.name) + ' (' + ix.cols.map(q).join(', ') + ')';
          });
          const exists = !!realName(db, c.model.name);
          db.run('SAVEPOINT sqls_ct');
          try {
            db.run(sql);
            if (!(exists && c.model.ifNotExists)) extra.forEach(x => db.run(x));
            db.run('RELEASE sqls_ct');
          } catch (e) { db.run('ROLLBACK TO sqls_ct'); db.run('RELEASE sqls_ct'); throw e; }
          res = { kind: 'done', message: exists && c.model.ifNotExists ? 'Tabelle »' + c.model.name + '« gab es schon.' : 'Tabelle »' + c.model.name + '« angelegt.',
                  translated: [sql].concat(extra).join(';\n') + ';', warn };
          schemaChanged = changed = true;
        } else if (c.kind === 'alter') {
          const plan = planAlter(db, st.sig);
          const warn = [];
          const done = [];
          // PRAGMA foreign_keys wirkt in einer offenen Transaktion nicht.
          // Für den Umbau muss es also VOR dem Savepoint aus sein —
          // sonst scheitert jede Tabelle, auf die andere verweisen
          // (DROP der alten Tabelle). Geprüft wird danach hier.
          const fkOn = plan.steps.some(x => x.rebuild) && one(db, 'PRAGMA foreign_keys').foreign_keys;
          if (fkOn) db.run('PRAGMA foreign_keys = OFF');
          try {
            db.run('SAVEPOINT sqls_alter');
            try {
              for (const step of plan.steps) {
                if (step.native) { db.run(step.native); done.push(step.native); }
                else if (step.rebuild) {
                  const m = step.rebuild.model;
                  warn.push(...rebuild(db, step.rebuild.table, m, step.rebuild.post));
                  done.push(createSql(m).sql);
                  done.push(...step.rebuild.post);
                }
              }
              if (fkOn) {
                const bad = all(db, 'PRAGMA foreign_key_check');
                if (bad.length) {
                  const err = new Error('FOREIGN KEY constraint failed');
                  err.fkCheck = { table: bad[0].table, parent: bad[0].parent, n: bad.length };
                  throw err;
                }
              }
              db.run('RELEASE sqls_alter');
            } catch (e) { try { db.run('ROLLBACK TO sqls_alter'); db.run('RELEASE sqls_alter'); } catch (e2) { /* weg */ } throw e; }
          } finally {
            if (fkOn) db.run('PRAGMA foreign_keys = ON');
          }
          res = { kind: 'done', message: 'Tabelle »' + plan.table + '« geändert.', warn,
                  translated: plan.steps.some(s => s.rebuild) ? '-- neu gebaut als:\n' + done.join(';\n') + ';' : null };
          schemaChanged = changed = true;
        } else if (c.kind === 'multi') {
          let n = 0;
          db.run('SAVEPOINT sqls_multi');
          try {
            c.list.forEach((sql, i) => {
              try { db.run(sql); if (i === 0) n = db.getRowsModified(); }
              catch (e) { if (!(c.soft && c.soft.includes(i))) throw e; }
            });
            db.run('RELEASE sqls_multi');
          } catch (e) { db.run('ROLLBACK TO sqls_multi'); db.run('RELEASE sqls_multi'); throw e; }
          res = { kind: 'done', message: c.verb === 'DELETE' ? n + (n === 1 ? ' Zeile' : ' Zeilen') + ' gelöscht.' : 'Erledigt.',
                  translated: c.list.join(';\n') + ';' };
          changed = true;
          if (c.verb === 'DDL') schemaChanged = true;
        } else {
          const r = execOne(db, c.sql, maxRows);
          if (r.columns.length) {
            res = { kind: 'rows', columns: r.columns, rows: r.rows, truncated: r.truncated };
            if (c.verb !== 'SELECT' && c.verb !== 'PRAGMA') { changed = true; res.changes = r.changes; }
          } else {
            const n = r.changes;
            const zeile = n === 1 ? ' Zeile' : ' Zeilen';
            let message = 'Erledigt.';
            if (c.verb === 'INSERT') message = n + zeile + ' eingefügt.';
            else if (c.verb === 'UPDATE') message = n + zeile + ' geändert.';
            else if (c.verb === 'DELETE') message = n + zeile + ' gelöscht.';
            else if (c.verb === 'DDL') message = ddlMessage(st.sig);
            else if (c.verb === 'TX') message = { BEGIN: 'Transaktion gestartet.', START: 'Transaktion gestartet.', COMMIT: 'Festgeschrieben.', END: 'Festgeschrieben.', ROLLBACK: 'Zurückgerollt.' }[U(st.sig[0])] || 'Erledigt.';
            res = { kind: 'done', message, changes: n };
            if (c.verb === 'INSERT' && n > 0) {
              try { res.lastId = one(db, 'SELECT last_insert_rowid() AS id').id; } catch (e) { /* egal */ }
            }
            if ((c.verb === 'UPDATE' || c.verb === 'DELETE') && c.noWhere && n > 1) {
              res.warn = ['Ohne WHERE betrifft das alle Zeilen der Tabelle.'];
            }
            if (c.verb !== 'TX') changed = true;
          }
          if (c.verb === 'DDL' || c.verb === 'PRAGMA' && /=/.test(c.sql)) schemaChanged = true;
          if (c.verb === 'DDL') changed = true;
          if (c.verb === 'TX') changed = true;
          if (c.translated && c.sql !== st.text) res.translated = c.sql + ';';
        }
        res.ms = Date.now() - t0;
        results.push(Object.assign(base, res));
      } catch (e) {
        const g = e.fkCheck
          ? { message: 'Das passt nicht zu den vorhandenen Daten.', hint: e.fkCheck.n + ' Zeile(n) in »' + e.fkCheck.table + '« verweisen auf etwas, das es in »' + e.fkCheck.parent + '« nicht gibt. Nichts wurde geändert.', raw: e.message }
          : german(e.message, db, st);
        results.push(Object.assign(base, { kind: 'error' }, g));
        break;
      }
    }
    return { results, changed, schemaChanged, stop: null };
  }

  function ddlMessage(s) {
    const w0 = U(s[0]), w1 = U(s[1]);
    const what = { TABLE: 'Tabelle', VIEW: 'Sicht', INDEX: 'Index', TRIGGER: 'Trigger', UNIQUE: 'Index' };
    const k = s.findIndex((t, i) => i > 0 && what[U(t)]);
    const kind = k > 0 ? what[U(s[k])] : 'Objekt';
    let nameTok = null;
    if (k > 0) {
      let j = k + 1;
      if (U(s[j]) === 'IF') j += U(s[j + 1]) === 'NOT' ? 3 : 2;
      nameTok = s[j];
      if (U(s[k]) === 'UNIQUE') { nameTok = s[k + 2]; }
    }
    const nm = nameTok ? '»' + nameOf(nameTok) + '« ' : '';
    if (w0 === 'CREATE') return kind + ' ' + nm + 'angelegt.';
    if (w0 === 'DROP') return kind + ' ' + nm + 'gelöscht.';
    if (w0 === 'ALTER') return 'Tabelle geändert.';
    return 'Erledigt.';
    void w1;
  }

  /* ─── Für die Oberfläche ─────────────────────────────────── */

  /* Eine Seite einer Tabelle für den Reiter »Daten«. */
  function page(db, table, o = {}) {
    const real = realName(db, table);
    if (!real) throw new Error('no such table: ' + table);
    const isView = !!one(db, "SELECT 1 FROM sqlite_master WHERE type='view' AND name=?", [real]);
    const info = all(db, 'PRAGMA table_info(' + q(real) + ')');
    const cols = info.map(c => c.name);
    const pk = info.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
    const withoutRowid = !isView && /WITHOUT\s+ROWID/i.test((one(db, 'SELECT sql FROM sqlite_master WHERE name=?', [real]) || {}).sql || '');
    const key = isView ? null : (withoutRowid ? pk : null);
    const params = [];
    let where = '';
    if (o.filter) {
      where = ' WHERE ' + cols.map(c => 'CAST(' + q(c) + ' AS TEXT) LIKE ?').join(' OR ');
      cols.forEach(() => params.push('%' + o.filter + '%'));
    }
    const total = one(db, 'SELECT count(*) AS n FROM ' + q(real) + where, params).n;
    const order = o.orderBy && cols.includes(o.orderBy) ? ' ORDER BY ' + q(o.orderBy) + (o.desc ? ' DESC' : '') : (isView ? '' : (withoutRowid ? '' : ' ORDER BY rowid'));
    const limit = Math.max(1, Math.min(500, o.limit || 50));
    const offset = Math.max(0, o.offset || 0);
    const sel = (isView || withoutRowid) ? '' : 'rowid AS __rowid__, ';
    const st = db.prepare('SELECT ' + sel + cols.map(q).join(', ') + ' FROM ' + q(real) + where + order + ' LIMIT ' + limit + ' OFFSET ' + offset);
    const rows = [], rowids = [];
    try {
      st.bind(params);
      while (st.step()) {
        const r = st.get().map(cellOut);
        if (sel) rowids.push(r.shift()); else rowids.push(null);
        rows.push(r);
      }
    } finally { st.free(); }
    return { table: real, isView, columns: cols, pk, key, rows, rowids, total, offset, limit };
  }

  /* SQL-Dump: CREATE + INSERT, Eltern vor Kindern. */
  function dump(db, title) {
    const sc = schema(db);
    const order = [];
    const seen = new Set();
    const byName = Object.fromEntries(sc.tables.map(t => [t.name, t]));
    const visit = (t, stack) => {
      if (seen.has(t.name) || stack.has(t.name)) return;
      stack.add(t.name);
      t.fks.forEach(f => { if (byName[f.ref] && f.ref !== t.name) visit(byName[f.ref], stack); });
      stack.delete(t.name);
      seen.add(t.name); order.push(t);
    };
    sc.tables.forEach(t => visit(t, new Set()));
    const out = ['-- SQL Studio · ' + (title || 'Datenbank'), '-- exportiert am ' + nowLocal(), ''];
    out.push('PRAGMA foreign_keys = OFF;', '');
    for (const t of order) {
      out.push(t.sql + ';');
      const rows = all(db, 'SELECT * FROM ' + q(t.name));
      if (rows.length) {
        const cols = Object.keys(rows[0]);
        const chunk = 50;
        for (let i = 0; i < rows.length; i += chunk) {
          out.push('INSERT INTO ' + q(t.name) + ' (' + cols.map(q).join(', ') + ') VALUES\n' +
            rows.slice(i, i + chunk).map(r => '  (' + cols.map(c => {
              const v = r[c];
              if (v instanceof Uint8Array) return "X'" + Array.from(v, b => b.toString(16).padStart(2, '0')).join('') + "'";
              return lit(v);
            }).join(', ') + ')').join(',\n') + ';');
        }
      }
      out.push('');
    }
    all(db, "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").forEach(r => out.push(r.sql + ';'));
    all(db, "SELECT sql FROM sqlite_master WHERE type='view'").forEach(r => out.push(r.sql + ';'));
    all(db, "SELECT sql FROM sqlite_master WHERE type='trigger'").forEach(r => out.push(r.sql + ';'));
    out.push('', 'PRAGMA foreign_keys = ON;', '');
    return out.join('\n');
  }

  /* sql.js schließt und öffnet die Datenbank bei export() neu: danach
     sind die Fremdschlüssel aus UND alle selbst eingebauten Funktionen
     weg (NOW, YEAR, UUID …). Beides wieder herstellen. */
  function exportBytes(db) {
    const fk = one(db, 'PRAGMA foreign_keys').foreign_keys;
    const bytes = db.export();
    if (fk) db.run('PRAGMA foreign_keys = ON');
    installFunctions(db);
    return bytes;
  }

  function open(SQL, bytes) {
    const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    db.run('PRAGMA foreign_keys = ON');
    installFunctions(db);
    return db;
  }

  root.SQLCore = {
    LEVEL, tokenize, split, parseCreate, createSql, schema, run, page, dump, open, exportBytes,
    q, lit, classify, planAlter, german, describe
  };
})(typeof self !== 'undefined' ? self : globalThis);
