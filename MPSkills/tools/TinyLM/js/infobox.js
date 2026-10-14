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

  return { box, note, key, steps, legend };
})();
