/* Info-Boxen: JEDER Erklärtext in der App steckt in einer sichtbaren Box, damit Schüler sofort
   sehen "das hier ist die Erklärung" und nicht nur grauen Kleintext lesen.
   Die Box erbt die Kategoriefarbe der Karte, in der sie steht (--cat-color aus panel.js).

   Info.box(titel, text|[text], {icon, tone})  -> große Erklärbox ("Was passiert hier?")
   Info.note(text, icon)                       -> kleine Fußnote mit Farbbalken
   Info.key(text)                              -> Merksatz (die eine Sache, die hängen bleiben soll)
   Info.steps([[fett, rest], …])               -> nummerierte Schritt-für-Schritt-Erklärung
   Info.legend([{color, label, sub}])          -> Farblegende (Punkt + Text)
*/
const Info = (() => {
  function box(title, text, opts) {
    opts = opts || {};
    const b = el('div', 'infobox' + (opts.tone ? ' ' + opts.tone : ''));
    b.appendChild(el('span', 'infobox-ico', opts.icon || '💡'));
    const t = el('div', 'infobox-txt');
    if (title) t.appendChild(el('b', null, title));
    (Array.isArray(text) ? text : [text]).forEach(p => { if (p) t.appendChild(el('p', null, p)); });
    b.appendChild(t);
    return b;
  }

  function note(text, icon) {
    const b = el('div', 'infobox mini');
    b.appendChild(el('span', 'infobox-ico', icon || 'ℹ️'));
    const t = el('div', 'infobox-txt');
    t.appendChild(el('p', null, text));
    b.appendChild(t);
    return b;
  }

  function key(text) {
    return box('Merk dir', text, { icon: '⭐', tone: 'key' });
  }

  function steps(list) {
    const ol = el('ol', 'howto');
    list.forEach(([a, b]) => {
      const li = el('li');
      li.appendChild(el('b', null, a));
      if (b) li.appendChild(document.createTextNode(' ' + b));
      ol.appendChild(li);
    });
    return ol;
  }

  function legend(entries) {
    const wrap = el('div', 'legend');
    entries.forEach(e => {
      const row = el('div', 'legend-row');
      const sw = el('i', 'legend-dot');
      sw.style.background = e.color;
      row.appendChild(sw);
      const tx = el('span', 'legend-txt');
      tx.appendChild(el('b', null, e.label));
      if (e.sub) tx.appendChild(el('span', 'legend-sub', e.sub));
      row.appendChild(tx);
      wrap.appendChild(row);
    });
    return wrap;
  }

  /* Regler mit Wert, optionalem ?-Knopf und Beschriftung der beiden Enden.
     Info.slider({ label, min, max, step, value, fmt, help, spot, ends: [links, rechts], onInput })
       -> { el, input, out } */
  function slider(o) {
    const wrap = el('div', 'slider');
    if (o.spot) wrap.dataset.spot = o.spot;
    const lab = el('div', 'slider-lab');
    const name = el('label', null, o.label);
    const out = el('output', null, o.fmt ? o.fmt(o.value) : String(o.value));
    lab.append(name, out);
    if (o.help) lab.appendChild(Help.btn(o.help, 'sm'));
    const inp = el('input');
    inp.type = 'range'; inp.min = String(o.min); inp.max = String(o.max); inp.step = String(o.step || 1);
    inp.value = String(o.value);
    /* Gefüllter Teil der Spur als Variable (CSS malt den Verlauf) — in allen Browsern gleich. */
    const fill = () => inp.style.setProperty('--pct', ((parseFloat(inp.value) - o.min) / (o.max - o.min) * 100) + '%');
    fill();
    const id = 'sl-' + Math.random().toString(36).slice(2, 8);
    inp.id = id; name.htmlFor = id;
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      fill();
      out.textContent = o.fmt ? o.fmt(v) : String(v);
      if (o.onInput) o.onInput(v);
    });
    wrap.append(lab, inp);
    if (o.ends) {
      const ends = el('div', 'slider-ends');
      ends.append(el('span', null, o.ends[0]), el('span', null, o.ends[1]));
      wrap.appendChild(ends);
    }
    return { el: wrap, input: inp, out };
  }

  /* Kopf einer Zentrum-Karte: kleine Phasenzeile, Titel, ?-Knopf zur Phase. */
  function centerHead(kicker, title, helpKey) {
    const h = el('div', 'mc-head');
    const t = el('div', 'mc-title');
    t.append(el('p', 'eyebrow', kicker), el('h2', null, title));
    h.appendChild(t);
    if (helpKey) h.appendChild(Help.btn(helpKey));
    return h;
  }

  return { box, note, key, steps, legend, slider, centerHead };
})();
