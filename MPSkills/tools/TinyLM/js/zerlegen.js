/* „Handy + Zerlegen“ für Phase 2 und 3 — dieselbe Ansicht wie Phase 1 (Sönke 02.11.2026: „übertrage
   die Ansicht und die Ideen von Phase 1 auf die anderen beiden Phasen“).

   Links ein schmales HANDY (das Sprachmodell von außen), rechts Spalten, die das Wort zerlegen.
   Jede Spalte ist ein Reiter (zu Beginn zu); erst wer sie öffnet, sieht ihre Ebene auch im Handy
   (die Phase setzt dafür Klassen am Handy). Offen/zu je Gerät in localStorage (Schlüssel je Phase),
   im Schaufenster (?demo=1) ist alles offen. Phase 1 hat dieselbe Mechanik noch in phase1.js.

   Zerlegen.columns({ store, defaults, onChange(id, on), onPointer() })
     -> { column(id, cat, icon, title, question, helpKey, opts) -> <section>,
          isOpen(id), setOpen(id, on), cols }
        opts.wide = über die ganze Breite (Training, Wortkarte, Netz-Bild)
        demoClosed = Spalten, die im Schaufenster zu bleiben (teure Wortkarte)
   Zerlegen.phone({ label, help }) -> { el, head, screen }  (Rest hängt die Phase selbst an)
   Zerlegen.findOcc(session, tail, next, any) / Zerlegen.snippet(session, o) — Fundstellen wie in
     Phase 1 (Kontext teal, Wort danach koralle). */
const Zerlegen = (() => {
  const DEMO = /[?&]demo=1(&|$)/.test(location.search);

  function columns(opt) {
    const cols = {};
    const opened = (() => {
      if (DEMO) return {};
      try { const o = JSON.parse(localStorage.getItem(opt.store) || 'null'); return (o && typeof o === 'object') ? o : null; }
      catch (e) { return null; }
    })() || {};
    const demoClosed = opt.demoClosed || [];
    const isOpen = id => (id in opened) ? !!opened[id] : (DEMO ? !demoClosed.includes(id) : !!(opt.defaults || {})[id]);

    function apply(id) {
      const c = cols[id], on = isOpen(id);
      c.el.classList.toggle('closed', !on);
      c.toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      c.tools.hidden = c.body.hidden = !on;
    }
    function setOpen(id, on) {
      opened[id] = !!on;
      if (!DEMO) try { localStorage.setItem(opt.store, JSON.stringify(opened)); } catch (e) { /* egal */ }
      apply(id);
      if (opt.onChange) opt.onChange(id, !!on);
    }

    function column(id, cat, icon, title, question, helpKey, o) {
      const c = el('section', 'p1-col' + (o && o.wide ? ' wide' : ''));
      c.dataset.card = id;
      c.style.setProperty('--cat-color', 'var(--cat-' + cat + ')');
      c.style.setProperty('--cat-tint', 'var(--cat-' + cat + '-tint)');
      const head = el('div', 'p1-col-head');
      const toggle = el('button', 'p1-col-toggle');
      toggle.type = 'button';
      const t = el('div', 'p1-col-t');
      t.append(el('h3', null, title), el('p', null, question));
      const chev = el('span', 'panel-chev');
      chev.setAttribute('aria-hidden', 'true');
      toggle.append(el('span', 'p1-col-ico', icon), t, chev);
      head.appendChild(toggle);
      const hb = el('button', 'help-btn', '?');
      hb.type = 'button';
      hb.dataset.help = helpKey;
      hb.setAttribute('aria-label', 'Erklärung: ' + title);
      hb.addEventListener('click', () => { if (!isOpen(id)) setOpen(id, true); requestAnimationFrame(() => Explain.show(helpKey, c)); });
      head.appendChild(hb);
      const tools = el('div', 'p1-col-tools');
      const body = el('div', 'p1-col-body');
      /* In eine Liste tippen = Schreiben anhalten (sonst wäre der Eintrag beim Loslassen schon neu). */
      if (opt.onPointer) body.addEventListener('pointerdown', () => opt.onPointer());
      c.append(head, tools, body);
      cols[id] = { el: c, tools, body, toggle };
      toggle.addEventListener('click', () => setOpen(id, !isOpen(id)));
      apply(id);
      return c;
    }

    return { column, isOpen, setOpen, cols };
  }

  function phone(o) {
    const ph = el('div', 'phone');
    const head = el('div', 'phone-head');
    const who = el('div', 'phone-who');
    who.append(el('b', null, 'Tiny'), el('span', null, o.label));
    head.append(tinyEl('normal'), who);
    if (o.help) head.appendChild(Help.btn(o.help, 'sm'));
    const screen = el('div', 'phone-screen');
    ph.append(el('span', 'phone-notch'), head, screen);
    return { el: ph, head, screen };
  }

  function findOcc(session, tail, next, any) {
    const k = tail.length, out = [];
    session.sources.forEach(s => {
      const T = s.toks;
      for (let i = Math.max(0, k - 1); i < T.length - 1; i++) {
        if (k === 0) { if (!any && T[i].t !== '.') continue; }
        else {
          let ok = true;
          for (let j = 0; j < k; j++) { if (T[i - j].t !== tail[k - 1 - j]) { ok = false; break; } }
          if (!ok) continue;
        }
        if (next && T[i + 1].t !== next) continue;
        out.push({ si: s.si, start: i - k + 1, pos: i + 1 });
      }
    });
    return out;
  }

  function snippet(session, o) {
    const T = session.sources[o.si].toks;
    const from = Math.max(1, o.start - 5), to = Math.min(T.length - 1, o.pos + 4);
    const p = el('p', 'fsnip');
    if (from > 1) p.appendChild(document.createTextNode('… '));
    for (let i = from; i <= to; i++) {
      const tk = T[i];
      if (i > from && !tk.punct) p.appendChild(document.createTextNode(' '));
      const cls = i === o.pos ? 'fx-next' : (i >= o.start && i < o.pos ? 'fx-ctx' : null);
      if (cls) p.appendChild(el('mark', cls, tk.raw));
      else p.appendChild(document.createTextNode(tk.raw));
    }
    if (to < T.length - 1) p.appendChild(document.createTextNode(' …'));
    return p;
  }

  /* Banner „Du zerlegst Token k: Wort  × zurück“ (wie Phase 1). */
  function focusBanner(hostEl, idx, label, onBack, hint) {
    hostEl.replaceChildren();
    if (idx != null) {
      hostEl.className = 'p1-focus on';
      hostEl.hidden = false;
      const back = el('button', 'btn sm', '× zurück zum nächsten Wort');
      back.type = 'button';
      back.addEventListener('click', onBack);
      hostEl.append(el('span', null, 'Du zerlegst Token ' + (idx + 1) + ': '), el('b', 'p1-focus-w', label), back);
      return;
    }
    hostEl.className = 'p1-focus';
    hostEl.hidden = !hint;
    if (hint) hostEl.append(el('span', null, hint));
  }

  /* „Aus welchen Quellen?“ (Sönke 12.11.2026): nur noch, wie viele Token Tiny aus jedem Text
     genommen hat. Antippen klappt den ganzen Text auf, die genommenen Token sind markiert
     (das angetippte Wort im Handy noch kräftiger). Satzzeichen zählen mit — sie sind auch Token.
     o = { state: {open}, repaint(), color(si), letter(si)?, focus: {si, pos}?, head?,
           all? = alle Quellen der Sitzung zeigen, auch mit 0 Token, in ihrer Reihenfolge (Phase 2: A · B · C) } */
  function usedSources(session, o) {
    const box = el('div', 'usedsrc');
    const taken = new Map();
    session.steps.forEach(st => {
      if (st.si == null || st.si < 0 || st.pos == null) return;
      if (!taken.has(st.si)) taken.set(st.si, new Set());
      taken.get(st.si).add(st.pos);
    });
    if (o.all) session.sources.forEach((s, si) => { if (!taken.has(si)) taken.set(si, new Set()); });
    /* o.always: diese Quellen immer listen (Phase 3: A · B · C, dazu weitere benutzte Texte). */
    if (o.always) o.always.forEach(si => { if (!taken.has(si)) taken.set(si, new Set()); });
    if (!taken.size) { box.appendChild(el('p', 'card-empty', 'Noch kein Token genommen.')); return box; }
    const total = [...taken.values()].reduce((a, t) => a + t.size, 0);
    const usedN = [...taken.values()].filter(t => t.size).length;
    box.appendChild(el('p', 'p1-sub', o.head || (total + ' Token aus ' + usedN + (usedN === 1 ? ' Quelle' : ' Quellen'))));
    const max = Math.max(1, ...[...taken.values()].map(t => t.size));
    const order = [...taken.entries()];
    if (o.all || o.always) order.sort((a, b) => a[0] - b[0]); else order.sort((a, b) => b[1].size - a[1].size);
    order.forEach(([si, set]) => {
      const s = session.sources[si];
      const open = o.state.open === si;
      const item = el('div', 'usrc' + (open ? ' open' : ''));
      item.dataset.si = String(si);
      item.style.setProperty('--sc', o.color(si));
      const row = el('button', 'usrc-row');
      row.type = 'button';
      row.setAttribute('aria-expanded', open ? 'true' : 'false');
      row.title = open ? 'Text zuklappen' : 'Text aufklappen – die genommenen Token sind markiert';
      const lt = o.letter && o.letter(si);
      row.appendChild(lt ? Object.assign(el('span', 'letter sm', lt), { style: 'background:' + o.color(si) }) : el('i', 'dot'));
      const bar = el('span', 'usrc-bar');
      const fill = el('i');
      fill.style.width = (set.size ? Math.max(4, 100 * set.size / max) : 0) + '%';
      bar.appendChild(fill);
      const tw = el('span', 'usrc-tw');
      tw.append(el('span', 'usrc-t', s.doc.title), bar);
      row.append(tw, el('span', 'usrc-n', set.size + ' Token'), el('span', 'usrc-chev', open ? '▴' : '▾'));
      row.addEventListener('click', () => { o.state.open = open ? null : si; o.repaint(); });
      item.appendChild(row);
      if (open) {
        const T = s.toks;
        const p = el('p', 'usrc-text');
        for (let i = 1; i < T.length; i++) {
          const tk = T[i];
          if (i > 1 && !tk.punct) p.appendChild(document.createTextNode(' '));
          if (set.has(i)) {
            const m = el('mark', 'fx-take' + (o.focus && o.focus.si === si && o.focus.pos === i ? ' focus' : ''), tk.raw);
            p.appendChild(m);
          } else p.appendChild(document.createTextNode(tk.raw));
        }
        /* Das angetippte Token (sonst das zuletzt genommene) in den sichtbaren Teil scrollen. */
        requestAnimationFrame(() => {
          const ms = p.querySelectorAll('mark');
          const m = p.querySelector('mark.focus') || ms[ms.length - 1];
          if (m && p.scrollHeight > p.clientHeight) p.scrollTop = Math.max(0, m.offsetTop - p.clientHeight / 3);
        });
        const foot = el('p', 'usrc-foot');
        if (set.size) foot.append(el('mark', 'fx-take', 'markiert'), document.createTextNode(' = hat Tiny hier genommen'));
        else foot.appendChild(document.createTextNode('Aus diesem Text hat Tiny noch kein Token genommen.'));
        item.append(p, foot);
      }
      box.appendChild(item);
    });
    return box;
  }

  return { columns, phone, findOcc, snippet, focusBanner, usedSources, DEMO };
})();
