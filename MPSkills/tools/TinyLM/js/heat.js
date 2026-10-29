/* Gemeinsame Wahrscheinlichkeits-Komponente: dieselbe Darstellung für zählbasierte Kandidaten (Phase 1/2)
   und Softmax-Ausgaben (Phase 3) — der rote Faden: "es ist immer eine Wahrscheinlichkeit".
   Im Look „Token-Bausteine“ als Säulen nebeneinander: Höhe = Wahrscheinlichkeit (absolut, nicht relativ
   zur größten — sonst sähe ein untrainiertes Netz sicherer aus, als es ist), darunter Wort und Prozent.
   Mehr als 5 Säulen werden auf einem Tablet zu schmal: Aufrufer geben maxRows ≤ 5.

   Heat.render(container, cands, { maxRows, compact, accent, onSelect })
     cands: [{ word, label, p, chosen, tag, breakdown: [{ share, color, label }] }]
     breakdown stapelt die Säule nach Quellen (Phase 2: Text A · B · C). */
const Heat = (() => {
  const H = 84;   /* Säulenhöhe bei 100 % in px */
  function render(container, cands, opts) {
    opts = Object.assign({ maxRows: 5, compact: false, accent: 'var(--cat-candidates)' }, opts || {});
    container.replaceChildren();
    const list = cands.slice(0, opts.maxRows);
    const box = el('div', 'cands' + (opts.compact ? ' compact' : ''));
    box.style.setProperty('--cols', String(Math.max(3, list.length)));
    box.style.setProperty('--acc', opts.accent);
    list.forEach((c, i) => {
      const col = el(opts.onSelect ? 'button' : 'div', 'cand' + (c.chosen ? ' chosen' : ''));
      if (opts.onSelect) { col.type = 'button'; col.addEventListener('click', () => opts.onSelect(c.word)); }
      const label = c.label != null ? c.label : c.word;
      col.title = label + ': ' + fmtP(c.p);
      const well = el('span', 'cand-well');
      const bar = el('span', 'cand-bar');
      bar.style.height = Math.max(4, Math.min(1, c.p) * (opts.compact ? H * 0.75 : H)) + 'px';
      if (c.breakdown && c.breakdown.length) {
        c.breakdown.forEach(b => {
          const seg = el('i');
          seg.style.height = Math.max(0, b.share * 100) + '%';
          seg.style.background = b.color || 'var(--ink)';
          if (b.label) seg.title = b.label;
          bar.appendChild(seg);
        });
        bar.classList.add('stacked');
      } else {
        /* Je weiter hinten, desto heller — wie Bausteine, die verblassen. */
        bar.style.background = 'color-mix(in srgb, var(--acc) ' + Math.max(35, 100 - i * 16) + '%, var(--surface))';
      }
      well.appendChild(bar);
      col.appendChild(well);
      const name = el('b', 'cand-w', label);
      col.appendChild(name);
      if (c.tag) col.appendChild(el('span', 'tag', c.tag));
      col.appendChild(el('span', 'num', fmtP(c.p)));
      box.appendChild(col);
    });
    container.appendChild(box);
    const more = cands.length - list.length;
    if (more > 0) container.appendChild(el('p', 'small muted', '… und ' + more + ' weitere.'));
  }
  function fmtP(p) { return p >= 0.005 ? Math.round(p * 100) + ' %' : '<1 %'; }
  return { render };
})();
