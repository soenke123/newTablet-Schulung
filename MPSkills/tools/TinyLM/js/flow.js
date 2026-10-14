/* Maschinen-Ablauf: das farbcodierte Fließband oben in jeder Phase.
   Zeigt in einem Bild, welche Schritte die KI gerade abarbeitet; die Farbe jedes Schrittes ist
   dieselbe wie die der zugehörigen Erklärkarte rechts (panel.js CAT) — Klick springt dorthin.

   Flow.render(container, stages, { onPick })
     stages: [{ id, label, sub, cat, active, done, target }]
     target/id = Panel-Item-Id, die beim Klick aufgeklappt und angesprungen wird.
*/
const Flow = (() => {
  function render(container, stages, opts) {
    opts = opts || {};
    container.replaceChildren();
    const wrap = el('div', 'flow');
    stages.forEach((s, i) => {
      if (i) {
        const ar = el('span', 'flow-arrow', '→');
        ar.setAttribute('aria-hidden', 'true');
        wrap.appendChild(ar);
      }
      const cat = CAT[s.cat];
      const pickable = !!opts.onPick && (s.target || s.id);
      const node = el(pickable ? 'button' : 'div', 'flow-step'
        + (s.active ? ' active' : '') + (s.done ? ' done' : ''));
      if (pickable) {
        node.type = 'button';
        node.title = 'Erklärung „' + s.label + '“ zeigen';
        node.addEventListener('click', () => opts.onPick(s.target || s.id));
      }
      if (cat) {
        node.style.setProperty('--c', cat.color);
        node.style.setProperty('--ct', cat.tint);
      }
      node.appendChild(el('span', 'flow-n', String(i + 1)));
      const tx = el('span', 'flow-txt');
      tx.appendChild(el('b', null, s.label));
      if (s.sub) tx.appendChild(el('span', 'flow-sub', s.sub));
      node.appendChild(tx);
      wrap.appendChild(node);
    });
    container.appendChild(wrap);
    if (opts.loop) {
      const lp = el('p', 'flow-loop');
      lp.append(el('span', 'flow-loop-ico', '↻'), document.createTextNode(opts.loop));
      container.appendChild(lp);
    }
    return wrap;
  }
  return { render };
})();
