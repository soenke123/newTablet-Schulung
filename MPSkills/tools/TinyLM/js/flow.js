/* Maschinen-Ablauf: das farbcodierte Fließband oben in jeder Phase.
   Zeigt in einem Bild, welche Schritte die KI gerade abarbeitet; die Farbe jedes Schrittes ist
   dieselbe wie die der zugehörigen Karte rechts (panel.js CAT) — Tipp springt dorthin.

   Flow.render(container, stages, { onPick, help })
     stages: [{ id, label, sub, cat, active, done, target }]
     target/id = Panel-Item-Id, die beim Tipp aufgeklappt und angesprungen wird.
     help      = Schlüssel in HELP: ein ?-Knopf am Ende des Bandes (statt eines Erklärsatzes).
   Flow.pulse(container, ms) — lässt die Schritte einmal nacheinander aufleuchten
     (bei jedem neuen Wort: "die Kette ist gerade einmal durchgelaufen").
*/
const Flow = (() => {
  function render(container, stages, opts) {
    opts = opts || {};
    container.replaceChildren();
    const wrap = el('div', 'flow');
    stages.forEach((s, i) => {
      if (i) {
        const ar = el('span', 'flow-arrow', '›');
        ar.setAttribute('aria-hidden', 'true');
        wrap.appendChild(ar);
      }
      const cat = CAT[s.cat];
      const pickable = !!opts.onPick && (s.target || s.id);
      const node = el(pickable ? 'button' : 'div', 'flow-step'
        + (s.active ? ' active' : '') + (s.done ? ' done' : ''));
      if (pickable) {
        node.type = 'button';
        node.title = '„' + s.label + '“ ansehen';
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
    if (opts.help) {
      const end = el('span', 'flow-end');
      end.appendChild(el('span', 'flow-loop-ico', '↻'));
      end.appendChild(Help.btn(opts.help, 'sm'));
      wrap.appendChild(end);
    }
    container.appendChild(wrap);
    return wrap;
  }

  function pulse(container, ms) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const steps = [...container.querySelectorAll('.flow-step')];
    const each = Math.max(40, (ms || 400) / Math.max(1, steps.length));
    steps.forEach((st, i) => {
      setTimeout(() => {
        st.classList.add('run');
        setTimeout(() => st.classList.remove('run'), each * 1.4);
      }, i * each);
    });
  }
  return { render, pulse };
})();
