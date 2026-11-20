/* ══════════════════════════════════════════════════════════════
   NeuroLab · theme.js — Hell/Dunkel für gezeichnete Teile
   ══════════════════════════════════════════════════════════════
   app.js und js/neuron.js zeichnen ihre SVGs mit festen Farben als
   Attribut (fill="#fff"). Ein Attribut kann kein var(--…), deshalb setzt
   ein Beobachter jede bekannte Farbe als style um — dieselbe Tabelle wie
   in style.css (Farben aus Nebeltal). Unbekannte Farben (Typfarben der
   Neuronen, Vogelarten) bleiben, wie sie sind.

   Canvas kennt erst recht kein var(): NLTheme.c('#fff') gibt die Farbe
   für das aktuelle Thema zurück. Bei Themawechsel kommt 'nl:theme'.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const V = n => 'var(--' + n + ')';
  // Farbe -> [Fläche, Schrift, Rand]
  const M = {};
  const put = (keys, val) => keys.split(' ').forEach(k => { M[k] = val; });
  const T = v => [v, v, v];
  put('#fff #ffffff white', [V('surface'), V('on-accent'), V('surface')]);
  put('#fafafa #f8fafc #f4f6f9 #f1f5f9 #f0f0f0 #e8edf2 #eef2f6 #e8edf3', [V('surface-2'), V('ink-faint'), V('line-soft')]);
  put('#e5e7eb #e2e8f0 #d1d5db #cbd5e1 #dde1e7', [V('line-soft'), V('ink-faint'), V('line')]);
  put('#94a3b8 #aaa #888 #7a8794', T(V('ink-faint')));
  put('#64748b #475569 #444', T(V('ink-soft')));
  put('#374151 #334155 #1e293b #0f172a #222 #111', T(V('ink')));
  put('#f59e0b #d97706', T(V('in')));
  put('#92400e #b45309 #9a3412', [V('in'), V('in-ink'), V('in')]);
  put('#fffbeb #fef3c7', [V('in-dim'), V('in-ink'), V('in-dim')]);
  put('#fde68a #fed7aa', [V('in-dim'), V('in-ink'), V('in-line')]);
  put('#fef9c3', [V('gold-dim'), V('gold'), V('gold')]);
  put('#eab308', T(V('gold')));
  put('#854d0e', T(V('gold')));
  put('#dc2626 #991b1b #ef4444', T(V('neg')));
  put('#fef2f2 #fee2e2 #fecaca', [V('neg-dim'), V('neg'), V('neg-dim')]);
  put('#fca5a5', [V('neg-dim'), V('neg'), V('neg-line')]);
  put('#10b981 #4caf8a #14b8a6 #0d9488 #3b82f6 #1d4ed8', T(V('accent')));
  put('#2e7d5e #166534 #065f46 #0f766e #115e59 #1e40af #1e3a8a #0369a1', [V('accent'), V('accent-ink'), V('accent')]);
  put('#d1fae5 #dcfce7 #f0fdf4 #ecfdf5 #e8f5ef #f0fdfa #ccfbf1 #eff6ff #f0f9ff #eef2ff', [V('accent-dim'), V('accent-ink'), V('accent-line')]);
  put('#bbf7d0 #86efac #a7f3d0 #99f6e4 #7dd3fc', [V('accent-dim'), V('accent-ink'), V('accent-line')]);
  put('#6366f1', [V('ink-soft'), V('ink-soft'), V('line')]);
  put('#4338ca #3730a3', T(V('ink')));
  put('#fdecc0', [V('gold-dim'), V('gold'), V('gold')]);
  put('#059669 #2563eb', T(V('accent')));
  put('#a855f7 #c084fc', T(V('bio')));
  put('#6b21a8', [V('bio'), V('bio-ink'), V('bio')]);
  put('#e9d5ff #faf5ff #f0abfc #d8b4fe', [V('bio-dim'), V('bio-ink'), V('bio-line')]);

  const TEXTY = { text: 1, tspan: 1, textPath: 1 };
  function role(el, prop) {
    if (prop === 'stroke' || prop === 'stop-color') return 2;
    return TEXTY[el.localName] ? 1 : 0;
  }
  function fixAttr(el, prop) {
    const raw = el.getAttribute(prop);
    const v = raw && M[raw.trim().toLowerCase()];
    if (v) el.style.setProperty(prop, v[role(el, prop)]);
    else if (el.style.getPropertyValue(prop).startsWith('var(')) el.style.removeProperty(prop);
  }
  function fixTree(root) {
    if (!(root instanceof Element)) return;
    if (root.namespaceURI === 'http://www.w3.org/2000/svg') {
      if (root.hasAttribute('fill')) fixAttr(root, 'fill');
      if (root.hasAttribute('stroke')) fixAttr(root, 'stroke');
    }
    const list = root.querySelectorAll('[fill],[stroke]');
    for (const el of list) {
      if (el.hasAttribute('fill')) fixAttr(el, 'fill');
      if (el.hasAttribute('stroke')) fixAttr(el, 'stroke');
    }
  }
  new MutationObserver(recs => {
    for (const r of recs) {
      if (r.type === 'attributes') fixAttr(r.target, r.attributeName);
      else for (const n of r.addedNodes) fixTree(n);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['fill', 'stroke'] });

  /* Canvas: Farbe für das aktuelle Thema. role: 0 Fläche, 1 Schrift, 2 Rand */
  let cache = {};
  function c(hex, r = 0) {
    const v = M[String(hex).toLowerCase()];
    if (!v) return hex;
    const key = hex + r;
    if (cache[key]) return cache[key];
    const name = v[r].slice(4, -1);
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || hex;
    return (cache[key] = val);
  }
  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const changed = () => { cache = {}; window.dispatchEvent(new Event('nl:theme-redraw')); };
  window.addEventListener('nl:theme', changed);
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => window.dispatchEvent(new Event('nl:theme'))); } catch (e) { /* alt */ }

  window.NLTheme = { c, isDark, var: n => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim() };
})();
