/* ══════════════════════════════════════════════════════════════
   Knowledge Stack · Code-Hervorhebung (window.KSCode)

   Im Text steht Code zwischen Backticks: „Was gibt `print(len("abc"))`
   aus?" — so bleibt es reiner Text (Datenbank, Import, Export
   unverändert). Im Editor schaltet Strg+E (Mac ⌘E) die Markierung
   um: markierter Text wird zu Code, steht der Cursor in Code, wird
   er wieder normal. Angezeigt wird es überall gleich (Beamer, Tablet,
   Vorschau): Code-Schrift, Schlüsselwörter von Java, JavaScript,
   Python und SQL farbig, dazu Zeichenketten, Zahlen, Kommentare.

   Farben: aus der Schriftfarbe gemischt (color-mix mit currentColor),
   dadurch passend in Hell UND Dunkel, ohne eigene Variablen. Auf den
   farbigen Antwortkacheln nur Code-Schrift + fette Schlüsselwörter,
   damit „die blaue B" blau bleibt.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KSCode) return;

  const KW = new Set((
    // Java
    'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record String System ' +
    // JavaScript
    'async await let function typeof delete in of yield export from debugger with undefined NaN console document window ' +
    // Python
    'and as def elif except global is lambda nonlocal not or pass raise print range len self None True False ' +
    // gemeinsam
    'true false null'
  ).split(' '));

  // SQL: unabhängig von Groß-/Kleinschreibung
  const SQL = new Set((
    'select from where insert into values update set delete create table drop add column primary key foreign references ' +
    'join inner left right outer full on group by order having limit offset distinct as and or not null is in between like ' +
    'union all exists case when then else end count sum avg min max asc desc index view default unique check constraint ' +
    'integer int varchar char boolean float decimal auto_increment database'
  ).split(' '));

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const TOK = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|--(?=\s|$)[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;

  function faerbe(code) {
    let out = '', last = 0, m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(code))) {
      out += esc(code.slice(last, m.index));
      last = TOK.lastIndex;
      if (m[1]) out += '<span class="kc-c">' + esc(m[1]) + '</span>';
      else if (m[2]) out += '<span class="kc-s">' + esc(m[2]) + '</span>';
      else if (m[3]) out += '<span class="kc-n">' + esc(m[3]) + '</span>';
      else {
        const w = m[4];
        const kw = KW.has(w) || SQL.has(w.toLowerCase());
        out += kw ? '<span class="kc-k">' + esc(w) + '</span>'
          : m[5] ? '<span class="kc-f">' + esc(w) + '</span>'
          : esc(w);
        if (m[5]) out += esc(m[5]);
      }
    }
    return out + esc(code.slice(last));
  }

  const SPAN = /`([^`]+)`/g;

  /* Text → HTML (escaped). Ohne Backticks genau wie esc(). */
  function html(s) {
    s = String(s == null ? '' : s);
    if (s.indexOf('`') < 0) return esc(s);
    let out = '', last = 0, m;
    SPAN.lastIndex = 0;
    while ((m = SPAN.exec(s))) {
      out += esc(s.slice(last, m.index)) + '<code class="kc">' + faerbe(m[1]) + '</code>';
      last = SPAN.lastIndex;
    }
    return out + esc(s.slice(last));
  }

  /* Gegenstück für contenteditable (Vorschau): <code> → `…` */
  function text(el) {
    let s = '';
    el.childNodes.forEach(n => {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeName === 'CODE') s += '`' + n.textContent + '`';
      else if (n.nodeName === 'BR') s += '\n';
      else if (n.nodeType === 1) s += text(n);
    });
    return s;
  }

  const hat = s => /`[^`]+`/.test(String(s || ''));

  /* Markierung im Feld umschalten. Gibt true zurück, wenn etwas geschah. */
  function toggle(f) {
    const v = f.value, a = f.selectionStart, b = f.selectionEnd;
    if (a == null) return false;
    // Liegt die Markierung (oder der Cursor) in einem Code-Stück? → auflösen
    let m;
    SPAN.lastIndex = 0;
    while ((m = SPAN.exec(v))) {
      const s = m.index, e = SPAN.lastIndex;   // e = hinter dem schließenden `
      if (a >= s && b <= e && (a < e || a === b)) {
        f.value = v.slice(0, s) + m[1] + v.slice(e);
        const na = Math.max(s, a - 1), nb = Math.max(na, Math.min(e - 2, b - 1));
        f.setSelectionRange(na, nb);
        return true;
      }
    }
    if (a === b) {
      f.value = v.slice(0, a) + '``' + v.slice(b);
      f.setSelectionRange(a + 1, a + 1);
      return true;
    }
    // Leerraum am Rand bleibt draußen
    let s = a, e = b;
    while (s < e && /\s/.test(v[s])) s++;
    while (e > s && /\s/.test(v[e - 1])) e--;
    if (s === e) return false;
    const inner = v.slice(s, e).replace(/`/g, '');
    f.value = v.slice(0, s) + '`' + inner + '`' + v.slice(e);
    f.setSelectionRange(s, s + inner.length + 2);
    return true;
  }

  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const TASTE = MAC ? '⌘E' : 'Strg+E';
  const istTaste = ev => (MAC ? ev.metaKey : ev.ctrlKey) && !ev.altKey && !ev.shiftKey
    && (ev.key === 'e' || ev.key === 'E');

  const CSS = `
code.kc {
  font-family: ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", "Courier New", monospace;
  font-size: .92em; font-weight: 600;
  white-space: pre-wrap;
  padding: .05em .3em; border-radius: .3em;
  background: color-mix(in srgb, currentColor 12%, transparent);
  -webkit-box-decoration-break: clone; box-decoration-break: clone;
}
code.kc .kc-k { color: color-mix(in srgb, #a855f7 75%, currentColor); font-weight: 800; }
code.kc .kc-f { color: color-mix(in srgb, #3b82f6 70%, currentColor); }
code.kc .kc-s { color: color-mix(in srgb, #16a34a 75%, currentColor); }
code.kc .kc-n { color: color-mix(in srgb, #ea580c 75%, currentColor); }
code.kc .kc-c { opacity: .6; font-style: italic; }
.ks-k code.kc { background: rgba(0, 0, 0, .18); }
.ks-k code.kc span { color: inherit; }
.ks-k code.kc .kc-k { font-weight: 900; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; }
`;
  if (!document.getElementById('kc-css')) {
    const st = document.createElement('style');
    st.id = 'kc-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  window.KSCode = { html, text, hat, toggle, istTaste, TASTE, esc };
})();
