/* Gemeinsame Wahrscheinlichkeits-Komponente: dieselbe Darstellung für zählbasierte Kandidaten (Phase 1/2)
   und Softmax-Ausgaben (Phase 3) — der rote Faden: "es ist immer eine Wahrscheinlichkeit". */
const Heat = (() => {
  function render(container, cands, opts) {
    opts = Object.assign({ maxRows: 7, compact: false, accent: 'var(--ink)' }, opts || {});
    container.replaceChildren();
    const box = el('div', 'cands' + (opts.compact ? ' compact' : ''));
    const list = cands.slice(0, opts.maxRows);
    list.forEach(c => {
      const row = el('div', 'cand' + (c.chosen ? ' chosen' : '') + (opts.onSelect ? ' clickable' : ''));
      const name = el('b', null, c.label != null ? c.label : c.word);
      if (c.tag) name.appendChild(el('span', 'tag', c.tag));
      row.appendChild(name);

      const sbar = el('span', 'sbar');
      const inner = el('span');
      inner.style.width = Math.max(0, Math.min(100, c.p * 100)) + '%';
      if (c.breakdown && c.breakdown.length) {
        c.breakdown.forEach(b => {
          const seg = el('i');
          seg.style.width = Math.max(0, b.share * 100) + '%';
          seg.style.background = b.color || 'var(--ink)';
          if (b.label) seg.title = b.label;
          inner.appendChild(seg);
        });
      } else {
        inner.style.background = 'linear-gradient(90deg, color-mix(in srgb, ' + opts.accent + ' 25%, var(--surface)), ' + opts.accent + ')';
      }
      sbar.appendChild(inner);
      row.appendChild(sbar);
      row.appendChild(el('span', 'num', c.p >= 0.005 ? Math.round(c.p * 100) + ' %' : '<1 %'));

      if (opts.onSelect) row.addEventListener('click', () => opts.onSelect(c.word));
      box.appendChild(row);
    });
    container.appendChild(box);
    const more = cands.length - list.length;
    if (more > 0) container.appendChild(el('p', 'small muted', '… und ' + more + ' weitere.'));
  }
  return { render };
})();
