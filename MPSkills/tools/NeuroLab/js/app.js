/* ══════════════════════════════════════════════════════════════
   NeuroLab · app.js — Startseite, Freigaben, Arbeitsfläche, Training
   ══════════════════════════════════════════════════════════════
   Drei Bereiche (szenarien.js AREAS): „Das Neuron“ (neuron.js),
   „Netze bauen“ (Aufbauen → Testen, Gewichte von Hand) und „Netze
   trainieren“ (Aufbauen → Trainieren, Gewichte stellt das Training ein).

   Im Raum bekommt die Seite ?raum=lehrer bzw. ?raum=schueler (Gegenseite
   tool.js):
     hinein  { type: 'nl:cmd', parts: [...] }   was die Klasse darf
     heraus  { type: 'nl:ready' }               Seite steht
             { type: 'nl:parts', parts: [...] } Lehrkraft teilt/entzieht
   parts enthält Bereichs-ids ('neuron', 'bauen', 'trainieren') und
   Kachel-ids ('n1', 'b-xor', 't-vogel2', …). Eine Kachel ist für die
   Klasse offen, wenn ihr Bereich UND sie selbst geteilt sind.
   Allein geöffnet und im Schaufenster (?demo=1) ist alles offen.

   Stand je Gerät (nicht im Schaufenster): localStorage
     nl.sc.<id>  Netz + Schritt + Trainingsstand je Szenario
     nl.done     gelöste Aufgaben (Sterne)
     nl.where    zuletzt offene Seite
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const N = window.NLNetz, F = window.NLFeld, P = window.NLPlot;
  const { AREAS, S, ALL_PARTS } = window.NLSzenarien;
  const fmt = F.fmt;
  const $ = id => document.getElementById(id);

  const Q = new URLSearchParams(location.search);
  const ROOM = Q.get('raum') === 'lehrer' || Q.get('raum') === 'schueler' ? Q.get('raum') : null;
  const TEACHER = ROOM === 'lehrer', STUDENT = ROOM === 'schueler';
  const DEMO = Q.get('demo') === '1';

  /* ── Speicher (im Schaufenster nur im Arbeitsspeicher) ─────── */
  const mem = {};
  const store = {
    get(k) { if (DEMO) return mem[k] ?? null; try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { if (DEMO) { mem[k] = v; return; } try { localStorage.setItem(k, v); } catch (e) { /* voll / gesperrt */ } },
    del(k) { if (DEMO) { delete mem[k]; return; } try { localStorage.removeItem(k); } catch (e) { /* egal */ } }
  };
  const jget = (k, fb) => { try { const v = store.get(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };

  let done = new Set(jget('nl.done', []));
  const isDone = id => done.has(id);
  function markDone(id) {
    if (done.has(id)) return;
    done.add(id);
    store.set('nl.done', JSON.stringify([...done]));
    toast('★ Geschafft!');
  }

  /* ── Freigaben ────────────────────────────────────────────── */
  const DEFAULT_PARTS = ['neuron', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
  let parts = ROOM ? null : ALL_PARTS.slice();
  const areaOf = id => AREAS.find(a => a.id === id || a.items.includes(id));
  const shared = id => !!parts && parts.includes(id);
  function usable(id) {
    if (!STUDENT) return true;
    const a = areaOf(id);
    return !!a && shared(a.id) && (id === a.id || shared(id));
  }
  function sendUp(m) { if (window.parent === window) return; try { window.parent.postMessage(m, location.origin); } catch (e) { /* zu */ } }
  function setParts(list, fromServer) {
    parts = (list || []).filter(x => ALL_PARTS.includes(x));
    if (!fromServer) sendUp({ type: 'nl:parts', parts });
    if (!booted) boot();
    // Schüler: Teil entzogen, während man drin ist → Übersicht
    if (STUDENT && where.id && !usable(where.id)) goHome();
    else if (where.screen === 'home') renderHome();
    else if (where.screen === 'neuron') renderNeuron();
  }
  function toggleShare(id) {
    if (!TEACHER || !parts) return;
    const a = AREAS.find(x => x.id === id);
    let next;
    if (shared(id)) next = parts.filter(x => x !== id);
    else if (a && !a.items.some(shared)) next = parts.concat(id, a.items);
    else next = parts.concat(id);
    setParts(next, false);
  }

  /* ── Hilfen ───────────────────────────────────────────────── */
  let toastT = 0;
  function toast(s) {
    const t = $('toast'); t.textContent = s; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function h(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
  function dialog(html) {
    $('dlg-body').innerHTML = html;
    $('dlg').showModal();
  }
  $('dlg-ok').onclick = () => $('dlg').close();
  $('dlg').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  const SHARE_SVG = '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>';

  /* ── Navigation ───────────────────────────────────────────── */
  let where = { screen: 'home', id: null };
  function saveWhere() { store.set('nl.where', JSON.stringify(where)); }
  function setScreen(s) {
    document.body.dataset.screen = s;
    const home = s === 'home';
    $('back').hidden = home;
    $('crumb').hidden = home;
    $('steps').hidden = s !== 'work';
    $('btn-task').hidden = s !== 'work';
    $('btn-print').hidden = s !== 'work' || STUDENT;
    window.scrollTo(0, 0);
  }
  function goHome() {
    stopTrain(); closeEditor();
    if (window.NLDruck.isOpen()) window.NLDruck.close();
    where = { screen: 'home', id: null }; saveWhere();
    setScreen('home'); renderHome();
  }
  function openItem(id) {
    if (!usable(id)) return;
    if (id.startsWith('n')) openNeuron(id); else openScenario(id, true);
  }
  $('brand').onclick = goHome;
  $('back').onclick = goHome;

  /* ── Startseite ───────────────────────────────────────────── */
  function renderHome() {
    const box = $('areas');
    box.innerHTML = '';
    let any = false;
    AREAS.forEach((a, ai) => {
      const open = usable(a.id);
      if (STUDENT && !open) return;
      any = true;
      const sec = h(`<section class="area${open ? '' : ' locked'}">
        <div class="area-head"><span class="area-num">${ai + 1}</span>
          <div><p class="kicker">${a.kicker}</p><h2>${a.title}</h2><p>${a.text}</p></div>
          <div class="area-tools"></div></div>
        <div class="tiles"></div></section>`);
      if (TEACHER) {
        const sb = h(`<button class="share${shared(a.id) ? ' on' : ''}" type="button">${SHARE_SVG}${shared(a.id) ? 'Bereich geteilt' : 'Bereich teilen'}</button>`);
        sb.onclick = () => toggleShare(a.id);
        sec.querySelector('.area-tools').append(sb);
      }
      const tiles = sec.querySelector('.tiles');
      a.items.forEach((id, i) => {
        const sc = S[id];
        const st = sc || window.NLNeuron.STATIONS.find(x => x.id === id);
        const title = sc ? sc.title : st.title;
        const short = sc ? sc.short : 'Station ' + (i + 1);
        const ok = usable(id);
        const t = h(`<div class="tile${ok ? '' : ' locked'}" data-id="${id}" role="button" tabindex="0">
          <div class="art">${art(sc ? sc.art : 'n' + (i + 1))}</div>
          <span class="num">${i + 1}</span>${isDone(id) ? '<span class="star">★</span>' : ''}
          <div class="tt"><b>${title}</b><small>${short}</small></div></div>`);
        t.onclick = (e) => { if (!e.target.closest('.tile-bar')) openItem(id); };
        if (TEACHER) {
          const bar = h('<div class="tile-bar"></div>');
          const sb = h(`<button class="share${shared(id) ? ' on' : ''}" type="button">${SHARE_SVG}${shared(id) ? 'geteilt' : 'teilen'}</button>`);
          sb.onclick = (e) => { e.stopPropagation(); toggleShare(id); };
          bar.append(sb);
          if (sc && sc.teacher) {
            const ib = h('<button class="info-i" type="button" title="Für die Lehrkraft">i</button>');
            ib.onclick = (e) => { e.stopPropagation(); teacherInfo(sc); };
            bar.append(ib);
          }
          t.append(bar);
        }
        tiles.append(t);
      });
      box.append(sec);
    });
    $('wait').hidden = !(STUDENT && (!any || !parts));
  }

  function teacherInfo(sc) {
    dialog(`<h2>${sc.title}</h2><p>${sc.task}</p>
      <h4>Ziel</h4><p>${sc.teacher.ziel}</p>
      ${sc.teacher.impuls ? `<h4>Impuls fürs Gespräch</h4><p>${sc.teacher.impuls}</p>` : ''}
      ${sc.hints && sc.hints.length ? `<h4>Tipps, die die Klasse nacheinander bekommt</h4><ol>${sc.hints.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}`);
  }

  /* Kachelbilder — einfache Zeichnungen, je Art eine */
  function art(k) {
    const dots = (pts, c) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${c}"/>`).join('');
    const bg = 'viewBox="0 0 200 110" preserveAspectRatio="xMidYMid meet"';
    const birds = (lines) => `<svg ${bg}>${dots([[30, 85], [42, 78], [38, 92], [52, 88], [46, 70]], '#3f8fe0')}${dots([[70, 72], [82, 66], [76, 80], [90, 60]], '#8d63d2')}${dots([[110, 50], [122, 58], [118, 42], [130, 48]], '#e39a2d')}${dots([[155, 25], [168, 32], [160, 18], [176, 22], [170, 40]], '#d64b4b')}
      ${lines.map(([x1, y1, x2, y2, c]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="3" stroke-dasharray="7 4"/>`).join('')}
      <path d="M150 70 q10 -12 22 -6 q6 -8 14 -4 q-6 2 -8 8 q-10 10 -28 2z" fill="var(--ink-soft)" opacity=".55"/></svg>`;
    const NART = {
      1: `<svg ${bg}><g fill="none" stroke="var(--ink-soft)" stroke-width="3" stroke-linecap="round"><path d="M30 25 L72 50 M22 58 L68 58 M30 92 L72 66 M100 58 C130 58 140 58 175 58 M175 58 l12 -10 M175 58 l14 0 M175 58 l12 10"/></g><ellipse cx="86" cy="58" rx="20" ry="18" fill="var(--accent-dim)" stroke="var(--ink-soft)" stroke-width="3"/><circle cx="86" cy="58" r="5" fill="var(--ink-soft)"/></svg>`,
      2: `<svg ${bg}><circle cx="40" cy="32" r="13" fill="var(--surface)" stroke="#e3a008" stroke-width="2.5"/><circle cx="40" cy="80" r="13" fill="var(--surface)" stroke="#e3a008" stroke-width="2.5"/><line x1="53" y1="32" x2="140" y2="52" stroke="var(--pos)" stroke-width="7"/><line x1="53" y1="80" x2="140" y2="62" stroke="var(--pos)" stroke-width="2"/><text x="95" y="30" font-size="14" font-weight="700" fill="var(--pos)">w = 3</text><text x="95" y="95" font-size="14" font-weight="700" fill="var(--pos)">w = 0,5</text><circle cx="152" cy="57" r="13" fill="var(--accent-dim)" stroke="var(--accent)" stroke-width="2.5"/></svg>`,
      3: `<svg ${bg}><text x="100" y="66" text-anchor="middle" font-size="26" font-family="JetBrains Mono" font-weight="700" fill="var(--ink)">Σ + <tspan fill="var(--accent-ink)">b</tspan></text></svg>`,
      4: `<svg ${bg}><line x1="20" y1="85" x2="185" y2="85" stroke="var(--line)" stroke-width="2"/><line x1="100" y1="15" x2="100" y2="95" stroke="var(--line)" stroke-width="2"/><path d="M20 84 C80 84 90 22 180 22" fill="none" stroke="var(--act-sigmoid)" stroke-width="4"/><circle cx="124" cy="34" r="6" fill="var(--accent)"/></svg>`,
      5: `<svg ${bg}>${dots([[40, 30], [60, 50], [45, 75], [80, 35]], '#5c7cfa')}${dots([[130, 70], [150, 40], [160, 85], [120, 92]], '#f08c00')}<line x1="70" y1="105" x2="135" y2="5" stroke="#2f80ed" stroke-width="3.5" stroke-dasharray="8 5"/></svg>`,
      6: `<svg ${bg}>${[30, 80].map(y => `<circle cx="30" cy="${y}" r="9" fill="var(--surface)" stroke="#e3a008" stroke-width="2.5"/>`).join('')}${[22, 55, 88].map(y => [30, 80].map(y0 => `<line x1="39" y1="${y0}" x2="91" y2="${y}" stroke="var(--pos)" stroke-width="1.6"/>`).join('') + `<line x1="109" y1="${y}" x2="151" y2="55" stroke="var(--pos)" stroke-width="1.6"/><circle cx="100" cy="${y}" r="10" fill="var(--surface)" stroke="var(--act-sigmoid)" stroke-width="2.5"/>`).join('')}<circle cx="160" cy="55" r="10" fill="var(--surface)" stroke="var(--act-sigmoid)" stroke-width="2.5"/><line x1="170" y1="55" x2="190" y2="55" stroke="var(--wire)" stroke-width="3"/></svg>`
    };
    const n = (num) => NART[num];
    const A = {
      pool: `<svg ${bg}><circle cx="150" cy="32" r="16" fill="#f5b700"/><path d="M10 80 q15 -10 30 0 t30 0 t30 0 t30 0 t30 0 t30 0" fill="none" stroke="#2f80ed" stroke-width="4"/><path d="M10 95 q15 -10 30 0 t30 0 t30 0 t30 0 t30 0 t30 0" fill="none" stroke="#2f80ed" stroke-width="4" opacity=".6"/><rect x="40" y="30" width="6" height="45" fill="var(--ink-soft)"/><rect x="62" y="30" width="6" height="45" fill="var(--ink-soft)"/><rect x="40" y="40" width="28" height="4" fill="var(--ink-soft)"/></svg>`,
      gate: `<svg ${bg}><path d="M70 25 h30 a30 30 0 0 1 0 60 h-30z" fill="var(--surface)" stroke="var(--accent)" stroke-width="3"/><line x1="40" y1="42" x2="70" y2="42" stroke="var(--ink-soft)" stroke-width="3"/><line x1="40" y1="68" x2="70" y2="68" stroke="var(--ink-soft)" stroke-width="3"/><line x1="130" y1="55" x2="165" y2="55" stroke="var(--wire)" stroke-width="3"/><text x="98" y="61" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink)">&amp;</text><circle cx="172" cy="55" r="7" fill="var(--wire)"/></svg>`,
      vote: `<svg ${bg}>${[50, 100, 150].map((x, i) => `<circle cx="${x}" cy="45" r="16" fill="${i < 2 ? '#1fa971' : '#e5484d'}"/><text x="${x}" y="51" text-anchor="middle" font-size="18" fill="#fff" font-weight="700">${i < 2 ? '✓' : '✗'}</text>`).join('')}<text x="100" y="95" text-anchor="middle" font-size="16" font-weight="700" fill="var(--ink)">2 von 3</text></svg>`,
      smoke: `<svg ${bg}><circle cx="100" cy="40" r="26" fill="var(--surface)" stroke="var(--ink-soft)" stroke-width="3"/><circle cx="100" cy="40" r="6" fill="#e5484d"/><path d="M60 95 q10 -15 0 -25 q-10 -10 5 -20" fill="none" stroke="var(--ink-faint)" stroke-width="4" stroke-linecap="round"/><path d="M140 95 q10 -15 0 -25 q-10 -10 5 -20" fill="none" stroke="var(--ink-faint)" stroke-width="4" stroke-linecap="round"/></svg>`,
      xor: `<svg ${bg}>${dots([[60, 30], [140, 80]], '#f08c00')}${dots([[60, 80], [140, 30]], '#5c7cfa')}<line x1="40" y1="70" x2="110" y2="10" stroke="#2f80ed" stroke-width="3" stroke-dasharray="6 4"/><line x1="90" y1="100" x2="160" y2="40" stroke="#e5484d" stroke-width="3" stroke-dasharray="6 4"/><text x="100" y="62" text-anchor="middle" font-size="22" fill="var(--ink-faint)">?</text></svg>`,
      add: `<svg ${bg}><text x="100" y="66" text-anchor="middle" font-size="32" font-weight="700" font-family="JetBrains Mono" fill="var(--ink)">1+1=<tspan fill="var(--accent-ink)">10</tspan></text></svg>`,
      seg: `<svg ${bg}><g stroke-width="8" stroke-linecap="round">${[[80, 20, 120, 20, 1], [124, 24, 124, 51, 1], [124, 59, 124, 86, 1], [80, 90, 120, 90, 1], [76, 59, 76, 86, 1], [76, 24, 76, 51, 1], [80, 55, 120, 55, 0]].map(([a, b, c, d, on]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${on ? 'var(--accent)' : 'var(--line)'}"/>`).join('')}</g></svg>`,
      bird: birds([[20, 30, 150, 100, '#2f80ed']]),
      bird2: birds([[40, 20, 110, 100, '#2f80ed'], [95, 10, 175, 80, '#e5484d']]),
      bird3: birds([[20, 50, 80, 100, '#2f80ed'], [40, 20, 110, 100, '#e5484d'], [95, 10, 175, 80, '#1fa971']]),
      bird3d: `<svg ${bg}><path d="M60 25 l60 -12 l50 20 l-60 12z M60 25 v60 l50 20 v-60 M110 45 l60 -12 v60 l-60 12" fill="none" stroke="var(--ink-faint)" stroke-width="2"/><path d="M70 85 L160 35 L160 70 L70 100z" fill="#2f80ed" opacity=".25" stroke="#2f80ed"/>${dots([[85, 60], [95, 70], [130, 45], [140, 55], [120, 80]], '#d64b4b')}</svg>`,
      target: `<svg ${bg}>${[44, 34, 24, 14, 6].map((r, i) => `<circle cx="100" cy="55" r="${r}" fill="${['#f5f0e1', '#e5484d', '#f5f0e1', '#e5484d', '#f5b700'][i]}" stroke="var(--ink-soft)"/>`).join('')}</svg>`,
      curve: `<svg ${bg}><path d="M15 90 C60 -10 120 -10 185 85" fill="none" stroke="#f08c00" stroke-width="3.5"/>${dots([[20, 80], [45, 40], [70, 22], [100, 18], [130, 25], [155, 45], [180, 78]], '#5c7cfa')}</svg>`,
      free: `<svg ${bg}><rect x="30" y="30" width="40" height="40" rx="8" fill="#f5b700"/><rect x="80" y="45" width="40" height="40" rx="8" fill="#2f80ed"/><rect x="130" y="20" width="40" height="40" rx="8" fill="#1fa971"/></svg>`
    };
    if (k && k[0] === 'n' && k.length === 2) return n(k[1]);
    return A[k] || A.free;
  }

  /* ── Bereich 1: Das Neuron ────────────────────────────────── */
  function openNeuron(id) {
    stopTrain(); closeEditor();
    where = { screen: 'neuron', id }; saveWhere();
    setScreen('neuron');
    $('crumb-area').textContent = 'Bereich 1 · Das Neuron';
    $('crumb-title').textContent = window.NLNeuron.STATIONS.find(s => s.id === id).title;
    renderNeuron();
  }
  function renderNeuron() {
    window.NLNeuron.render($('st-nav'), $('st-card'), {
      id: where.id, usable, isDone,
      markDone: (id) => { markDone(id); renderNeuronNav(); },
      go: openNeuron, home: goHome
    });
  }
  function renderNeuronNav() {
    document.querySelectorAll('#st-nav button').forEach((b, i) => {
      const s = window.NLNeuron.STATIONS[i];
      b.classList.toggle('done', isDone(s.id));
      b.querySelector('i').textContent = isDone(s.id) ? '✓' : i + 1;
    });
  }

  /* ── Bereich 2/3: Arbeitsfläche ───────────────────────────── */
  let sc = null, ws = null;    // aktuelles Szenario + sein Arbeitsstand
  let selected = null;         // { l, n } im Editor
  let edFocus = null;

  function freshState(s) {
    const net = s.start();
    N.sync(net);
    if (s.train) N.randomize(net);
    return { net, step: 0, row: 0, slot: 0, hint: 0, epoch: 0, hist: [], lr: s.lr || 0.5, speed: 3, slow: null };
  }
  function loadState(s) {
    if (DEMO && s.demo && !mem['nl.sc.' + s.id]) {
      const st = freshState(s);
      st.net = s.demo();
      N.sync(st.net);
      if (s.train) N.randomize(st.net, 11);
      return st;
    }
    const st = jget('nl.sc.' + s.id, null);
    if (!st || !st.net || !st.net.outputs || st.net.outputs.length !== s.outputs.length && !s.free) return freshState(s);
    st.net.outputs.forEach((o, k) => { if (!s.free) o.label = s.outputs[k].label; });
    N.sync(st.net);
    st.slow = null;
    return Object.assign(freshState(s), st, { slow: null });
  }
  let saveT = 0;
  function saveState() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      if (!sc || !ws) return;
      const { slow, ...rest } = ws;
      store.set('nl.sc.' + sc.id, JSON.stringify(rest));
    }, 300);
  }

  function openScenario(id, withTask) {
    stopTrain(); closeEditor();
    sc = S[id];
    ws = loadState(sc);
    if (sc.free) { sc.inputs = ws.net.inputs; sc.outputs = ws.net.outputs; }
    selected = null;
    F.clearPending();
    where = { screen: 'work', id }; saveWhere();
    setScreen('work');
    const a = areaOf(id);
    $('crumb-area').textContent = AREAS.indexOf(a) + 1 + ' · ' + (a.id === 'bauen' ? 'Netze bauen' : 'Netze trainieren');
    $('crumb-title').textContent = sc.title;
    $('step1').textContent = sc.train ? 'Trainieren' : 'Testen';
    renderWork();
    if (withTask && !DEMO && !jget('nl.seen.' + id, false)) { showTask(); store.set('nl.seen.' + id, 'true'); }
  }

  function showTask() {
    dialog(`<p class="kicker">${sc.train ? 'Netze trainieren' : 'Netze bauen'}</p><h2>${sc.title}</h2><p>${sc.task}</p>
      ${sc.goal ? `<p><b>Ziel:</b> mindestens ${Math.round(sc.goal.acc * 100)} % richtig${sc.rows.some(r => r.test) ? ' (bei den Testdaten, die das Netz nie gesehen hat)' : ''}.</p>` : ''}
      <h4>So geht's</h4><ol>
        <li><b>${'Aufbauen'}:</b> Neuronen und Schichten mit <b>+</b> und <b>−</b> anlegen, dann jedes gebrauchte Neuron an seinen <b>Ausgang</b> rechts andocken (Punkt am Neuron ziehen oder antippen, dann Ausgang antippen).</li>
        ${sc.train ? '<li><b>Trainieren:</b> Start drücken und zusehen, wie das Netz die Gewichte selbst findet. „Zeitlupe“ zeigt einen einzelnen Lernschritt.</li>'
                   : '<li><b>Gewichte:</b> Neuron oder Zahl an einer Leitung antippen und einstellen.</li><li><b>Testen:</b> alle Fälle durchrechnen lassen — jede Zeile bekommt ✓ oder ✗.</li>'}
      </ol>`);
  }
  $('btn-task').onclick = () => sc && showTask();

  document.querySelectorAll('#steps button').forEach(b => b.addEventListener('click', () => setStep(+b.dataset.step)));
  function setStep(s) {
    if (!ws) return;
    if (s === 1 && sc.train && !allConnected()) { toast('Erst alle Ausgänge mit einem Neuron verbinden.'); return; }
    if (s === 0) stopTrain();
    ws.step = s;
    if (s === 1 && sc.train) ws.slow = null;
    closeEditor();
    F.clearPending();
    saveState();
    renderWork();
  }

  const allConnected = () => ws.net.outputs.every(o => o.src);
  const trainRows = () => sc.rows.filter(r => !r.test);
  const testRows = () => sc.rows.filter(r => r.test);
  const isStepOut = k => { const o = ws.net.outputs[k]; return o.src && ws.net.layers[o.src.l][o.src.n].act === 'step'; };
  function rowOk(y, t, k) {
    if (y == null || t == null) return false;
    return Math.abs(y - t) < (sc.tol || (isStepOut(k) ? 0.01 : 0.5));
  }
  function score(rows) {
    if (!rows.length) return null;
    if (sc.cls) return N.evaluate(ws.net, rows, { cls: true }).acc;
    let ok = 0;
    rows.forEach(r => { const y = N.predict(ws.net, r.x); if (r.t.every((t, k) => rowOk(y[k], t, k))) ok++; });
    return ok / rows.length;
  }
  function checkSolved() {
    if (sc.free || !allConnected()) return false;
    const goal = sc.goal ? sc.goal.acc : 1;
    let s;
    if (sc.train) { const te = testRows(); s = score(te.length ? te : sc.rows); }
    else s = score(sc.rows);
    const ok = s != null && s >= goal - 1e-9;
    if (ok && !isDone(sc.id)) markDone(sc.id);
    return ok;
  }

  /* Was darf hier verändert werden? */
  function editRights() {
    const R = sc.rules || {};
    if (sc.train) return ws.step === 0 ? { structure: true, connect: true, view: true } : { view: true };
    return ws.step === 0
      ? { structure: !R.fixed, connect: !R.fixed, weights: true, ioCount: !!sc.free }
      : { weights: true };
  }

  function curRow() { return sc.rows.length ? sc.rows[Math.min(ws.row, sc.rows.length - 1)] : null; }
  function curInputs() {
    const r = curRow();
    if (r) return r.x;
    if (!ws.free) ws.free = ws.net.inputs.map(() => 0);
    while (ws.free.length < ws.net.inputs.length) ws.free.push(0);
    return ws.free.slice(0, ws.net.inputs.length);
  }

  function renderNet() {
    const ed = editRights();
    const showVals = ws.step === 1 || (sc.train && ws.slow);
    const x = curInputs();
    const values = showVals ? N.forward(ws.net, x) : null;
    const r = curRow();
    F.render($('net'), {
      net: ws.net, sc, values, targets: showVals && r ? r.t : null,
      edit: ed, rules: sc.rules, selected,
      deltas: ws.slow && ws.slow.phase === 1 ? ws.slow.deltas : null,
      isOk: (v, t, k) => rowOk(v, t, k),
      on: {
        change: onChange,
        neuron: (l, n, f) => openEditor(l, n, f),
        input: (i) => { if (sc.free && ws.step === 1) editFreeInput(i); else if (sc.free && ws.step === 0) renameIO('in', i); },
        output: (k) => { if (sc.free && ws.step === 0) renameIO('out', k); }
      }
    });
    const hint = $('stage-hint');
    if (ws.step === 0 && !allConnected()) hint.textContent = 'Docke Neuronen an die Ausgänge rechts: Punkt am Neuron auf den Ausgang ziehen (oder antippen, dann den Ausgang antippen).';
    else if (ws.step === 0 && !sc.train) hint.textContent = 'Neuron oder Zahl an einer Leitung antippen, um Gewichte, Bias und Aktivierung einzustellen.';
    else if (ws.step === 0) hint.textContent = 'Neuron antippen, um seine Aktivierungsfunktion zu wählen. Die Gewichte stellt gleich das Training ein.';
    else hint.textContent = '';
  }

  function renderWork() {
    document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('on', +b.dataset.step === ws.step));
    const sb = document.querySelector('#steps button[data-step="1"]');
    sb.disabled = sc.train && !allConnected();
    renderNet();
    renderSide();
  }

  /* ── Bau-Änderungen ───────────────────────────────────────── */
  function defaultAct() {
    const R = sc.rules || {};
    if (R.acts) return R.acts[0];
    if (sc.defaultActs) return sc.defaultActs[0];
    return sc.train ? 'sigmoid' : 'step';
  }
  function onChange(kind, arg) {
    const net = ws.net;
    const R = sc.rules || {};
    const total = N.countNeurons(net);
    const maxN = R.maxNeurons || 40;
    if (kind === 'neuron+') {
      if (total >= maxN) { toast(`Höchstens ${maxN} Neuronen in dieser Aufgabe.`); return; }
      net.layers[arg].push(N.makeNeuron(N.inCount(net, arg), defaultAct()));
    } else if (kind === 'neuron-') {
      const L = net.layers[arg];
      const n = L.length - 1;
      L.pop();
      net.outputs.forEach(o => { if (o.src && o.src.l === arg && o.src.n === n) o.src = null; });
      if (!L.length) removeLayer(arg);
    } else if (kind === 'layer+') {
      if ((R.maxLayers || 4) <= net.layers.length) { toast('Mehr Schichten sind hier nicht erlaubt.'); return; }
      const k = Math.max(1, Math.min(2, maxN - total));
      if (maxN - total < 1) { toast(`Höchstens ${maxN} Neuronen in dieser Aufgabe.`); return; }
      net.layers.splice(arg, 0, Array.from({ length: k }, () => N.makeNeuron(N.inCount(net, arg), defaultAct())));
      net.outputs.forEach(o => { if (o.src && o.src.l >= arg) o.src.l++; });
    } else if (kind === 'layer-') {
      removeLayer(arg);
    } else if (kind === 'inputs+' || kind === 'inputs-') {
      if (kind === 'inputs+') net.inputs.push({ key: 'x' + (net.inputs.length + 1), label: 'x' + sub(net.inputs.length + 1) });
      else net.inputs.pop();
    } else if (kind === 'outputs+' || kind === 'outputs-') {
      if (kind === 'outputs+') net.outputs.push({ key: 'y' + (net.outputs.length + 1), label: 'y' + sub(net.outputs.length + 1), src: null });
      else net.outputs.pop();
    }
    N.sync(net);
    if (kind !== 'connect' && sc.train) resetTraining(true);
    if (kind === 'connect' && sc.train) resetTraining(false);
    if (selected && !(net.layers[selected.l] && net.layers[selected.l][selected.n])) closeEditor();
    saveState();
    renderWork();
    if (selected) renderEditor();
  }
  function removeLayer(l) {
    const net = ws.net;
    net.layers.splice(l, 1);
    net.outputs.forEach(o => {
      if (!o.src) return;
      if (o.src.l === l) o.src = null; else if (o.src.l > l) o.src.l--;
    });
  }
  const sub = n => String(n).split('').map(c => '₀₁₂₃₄₅₆₇₈₉'[+c]).join('');

  function renameIO(kind, i) {
    const list = kind === 'in' ? ws.net.inputs : ws.net.outputs;
    const v = prompt(kind === 'in' ? 'Name des Eingangs' : 'Name des Ausgangs', list[i].label);
    if (v == null) return;
    list[i].label = v.trim().slice(0, 16) || list[i].label;
    saveState(); renderNet();
  }
  function editFreeInput(i) {
    const v = prompt('Wert für ' + ws.net.inputs[i].label, String(curInputs()[i]).replace('.', ','));
    if (v == null) return;
    const n = parseFloat(v.replace(',', '.'));
    if (!isNaN(n)) { ws.free[i] = n; saveState(); renderWork(); }
  }

  /* ── Neuron-Editor ────────────────────────────────────────── */
  function openEditor(l, n, focus) {
    selected = { l, n };
    edFocus = focus || {};
    $('editor').hidden = false;
    renderEditor();
    renderNet();
    drawPlotOnly();
  }
  function closeEditor() {
    $('editor').hidden = true;
    if (selected) { selected = null; if (ws && sc && document.body.dataset.screen === 'work') { renderNet(); drawPlotOnly(); } }
  }
  $('ed-close').onclick = closeEditor;

  function inName(l, i) { return l === 0 ? ws.net.inputs[i].label : 'N' + l + '.' + (i + 1); }

  function renderEditor() {
    if (!selected) return;
    const { l, n } = selected;
    const nr = ws.net.layers[l] && ws.net.layers[l][n];
    if (!nr) { closeEditor(); return; }
    const ed = editRights();
    const R = sc.rules || {};
    const body = $('ed-body');
    body.innerHTML = '';
    body.append(h(`<h3>Neuron N${l + 1}.${n + 1}</h3>`));
    body.append(h(`<p class="muted">${l === 0 ? 'Schicht 1 — bekommt die Eingänge.' : 'Schicht ' + (l + 1) + ' — bekommt die Ausgaben von Schicht ' + l + '.'}${l === 0 && ws.net.inputs.length === 2 ? ' Im Diagramm ist es die Gerade in seiner Farbe.' : ''}</p>`));

    // Aktivierung
    const acts = R.acts || ['step', 'sigmoid', 'relu', 'tanh', 'linear'];
    const canAct = (ed.structure || (!sc.train && ws.step === 0 && !R.acts)) && acts.length > 1;
    body.append(h('<h4>Aktivierungsfunktion</h4>'));
    const chips = h('<div class="chips"></div>');
    (canAct ? acts : [nr.act]).forEach(a => {
      const c = h(`<button class="chip${a === nr.act ? ' on' : ''}" type="button">${N.ACTS[a].name}</button>`);
      c.disabled = !canAct;
      c.onclick = () => { nr.act = a; if (sc.train) resetTraining(true); saveState(); renderWork(); renderEditor(); };
      chips.append(c);
    });
    body.append(chips);
    if (!canAct && R.acts) body.append(h('<p class="muted">In dieser Aufgabe fest vorgegeben.</p>'));

    // Gewichte
    body.append(h('<h4>Gewichte und Bias</h4>'));
    if (ed.weights) {
      const addRow = (label, val, set, focus) => {
        const row = h(`<div class="wrow${focus ? ' focus' : ''}"><label title="${label}">${label}</label><input type="range" min="-5" max="5" step="0.1" value="${val}"><input type="number" step="0.1" value="${+val.toFixed(2)}"></div>`);
        const [rg, num] = row.querySelectorAll('input');
        const upd = (v) => { set(v); saveState(); renderNet(); updCalc(); drawPlotOnly(); updateSideLive(); };
        rg.addEventListener('input', () => { num.value = rg.value; upd(+rg.value); });
        num.addEventListener('input', () => { const v = parseFloat(num.value); if (!isNaN(v)) { rg.value = v; upd(v); } });
        body.append(row);
        if (focus) setTimeout(() => num.focus({ preventScroll: true }), 30);
      };
      nr.w.forEach((w, i) => addRow('w · ' + inName(l, i), w, v => { nr.w[i] = v; }, edFocus && edFocus.w === i));
      addRow('Bias b', nr.b, v => { nr.b = v; }, false);
    } else {
      const list = nr.w.map((w, i) => `${inName(l, i)}: <b>${fmt(w, 2)}</b>`).join(' · ');
      body.append(h(`<p class="muted">${list} · Bias: <b>${fmt(nr.b, 2)}</b><br>${sc.train ? 'Diese Zahlen stellt das Training ein.' : ''}</p>`));
    }

    // Rechnung für die ausgewählte Zeile
    const calc = h('<div class="calc" style="margin-top:10px"></div>');
    body.append(calc);
    const updCalc = () => {
      const run = N.forward(ws.net, curInputs());
      const prev = l === 0 ? run.x : run.ys[l - 1];
      const terms = nr.w.map((w, i) => `${fmt(w, 2)}·${fmt(prev[i], 2)}`).join(' + ');
      calc.innerHTML = `z = ${terms} + (${fmt(nr.b, 2)}) = <b>${fmt(run.zs[l][n], 2)}</b><br>y = ${N.ACTS[nr.act].name}(${fmt(run.zs[l][n], 2)}) = <b>${fmt(run.ys[l][n], 3)}</b>`;
    };
    updCalc();
    const r = curRow();
    if (r) body.append(h(`<p class="muted">gerechnet für ${r.name ? r.name : 'Zeile ' + (sc.rows.indexOf(r) + 1)} (${r.x.map(v => fmt(v, 2)).join(' | ')})</p>`));

    // Ausgang andocken
    if (ed.connect) {
      body.append(h('<h4>An Ausgang andocken</h4>'));
      const oc = h('<div class="chips"></div>');
      ws.net.outputs.forEach((o, k) => {
        const on = o.src && o.src.l === l && o.src.n === n;
        const c = h(`<button class="chip${on ? ' on' : ''}" type="button">${o.label}</button>`);
        c.onclick = () => {
          ws.net.outputs.forEach(x => { if (x.src && x.src.l === l && x.src.n === n) x.src = null; });
          if (!on) ws.net.outputs[k].src = { l, n };
          onChange('connect');
        };
        oc.append(c);
      });
      body.append(oc);
    }
  }

  /* ── Seitenleiste ─────────────────────────────────────────── */
  let plotCanvas = null, lossCanvas = null, sideLive = null, statsCard = null;

  function renderSide() {
    const side = $('side');
    side.innerHTML = '';
    plotCanvas = lossCanvas = null; sideLive = null;

    // Aufgabe
    const tc = h(`<details class="card"${ws.step === 0 || !sc.train ? ' open' : ''}><summary><h3>Aufgabe</h3></summary><p class="task">${sc.task}</p></details>`);
    if (sc.goal) tc.append(h(`<p class="goal">Ziel: ${Math.round(sc.goal.acc * 100)} % richtig</p>`));
    if (sc.hints && sc.hints.length) {
      const shown = sc.hints.slice(0, ws.hint);
      shown.forEach((t, i) => tc.append(h(`<div class="hint"><b>Tipp ${i + 1}:</b> ${t}</div>`)));
      if (ws.hint < sc.hints.length) {
        const b = h(`<button class="btn" type="button" style="margin-top:8px">${ws.hint ? 'Noch ein Tipp' : 'Tipp'}</button>`);
        b.onclick = () => { ws.hint++; saveState(); renderSide(); };
        tc.append(b);
      }
    }
    side.append(tc);

    if (isDone(sc.id)) side.append(h('<div class="solved"><span class="big">★</span> Gelöst! Du kannst weiter ausprobieren.</div>'));

    // Ausgänge angeschlossen?
    if (ws.step === 0) {
      const c = h('<div class="card"><h3>Ausgänge</h3></div>');
      ws.net.outputs.forEach(o => c.append(h(`<div class="check${o.src ? ' ok' : ''}"><i>${o.src ? '✓' : ''}</i>${o.label}${o.src ? ' ← N' + (o.src.l + 1) + '.' + (o.src.n + 1) : ' — noch frei'}</div>`)));
      const next = h(`<button class="btn primary big" type="button" style="margin-top:10px">Weiter: ${sc.train ? 'Trainieren' : 'Testen'} →</button>`);
      next.disabled = !allConnected();
      next.onclick = () => setStep(1);
      c.append(next);
      side.append(c);
    }

    statsCard = null;
    if (sc.train && ws.step === 1) side.append(trainPanel());
    if (!sc.train && ws.step === 1) side.append(testPanel());
    if (sc.free && ws.step === 1) side.append(freeInputsPanel());

    if (sc.plot) side.append(plotPanel());
    if (statsCard) side.append(statsCard);
    if (sc.seg) side.append(segPanel());
    drawPlotOnly();
    if (sideLive) sideLive();
  }

  function updateSideLive() {
    if (sideLive) sideLive();
  }

  /* Wertetabelle (Bauen → Testen) */
  function testPanel() {
    const c = h('<div class="card"><h3>Testen</h3></div>');
    const live = h('<div></div>');
    c.append(live);
    const big = sc.rows.length > 16;
    const draw = () => {
      live.innerHTML = '';
      if (!sc.rows.length) { live.append(h('<p class="muted">Ohne Aufgabe gibt es keine Wertetabelle. Tippe die Eingänge im Netz an, um Werte einzugeben.</p>')); return; }
      const s = score(sc.rows);
      const n = Math.round(s * sc.rows.length);
      live.append(h(`<p class="score">${n} von ${sc.rows.length} richtig <small>${big ? '(' + Math.round(s * 100) + ' %)' : ''}</small></p>`));
      if (!big) {
        const preds = sc.rows.map(r => N.predict(ws.net, r.x));
        let html = '<table class="ttab"><thead><tr>' + sc.inputs.map(i => `<th>${i.label}</th>`).join('');
        sc.outputs.forEach(o => { html += `<th class="sep">${o.label}<br>soll</th><th>ist</th>`; });
        html += '</tr></thead><tbody>';
        sc.rows.forEach((r, i) => {
          html += `<tr data-i="${i}" class="${i === ws.row ? 'sel' : ''}">` + r.x.map(v => `<td>${fmt(v, 2)}</td>`).join('');
          r.t.forEach((t, k) => {
            const y = preds[i][k];
            const ok = rowOk(y, t, k);
            html += `<td class="sep">${fmt(t, 2)}</td><td class="${y == null ? '' : ok ? 'ok' : 'bad'}">${y == null ? '–' : fmt(y, 2)} ${y == null ? '' : ok ? '✓' : '✗'}</td>`;
          });
          html += '</tr>';
        });
        const tbl = h(html + '</tbody></table>');
        tbl.querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = () => { ws.row = +tr.dataset.i; saveState(); renderNet(); draw(); drawPlotOnly(); if (selected) renderEditor(); });
        live.append(tbl);
        live.append(h('<p class="muted">Zeile antippen = diese Eingaben ins Netz schicken.</p>'));
      } else {
        live.append(h('<p class="muted">Rot umrandete Punkte im Diagramm sind falsch eingeordnet. Punkt antippen = diesen Vogel ins Netz schicken.</p>'));
      }
      const was = isDone(sc.id);
      checkSolved();
      if (!was && isDone(sc.id)) setTimeout(renderSide, 0);
    };
    draw();
    sideLive = draw;
    return c;
  }

  function freeInputsPanel() {
    const c = h('<div class="card"><h3>Eingaben</h3></div>');
    curInputs();
    ws.net.inputs.forEach((inp, i) => {
      const row = h(`<div class="slider"><span>${inp.label}</span><input type="range" min="-2" max="2" step="0.1" value="${ws.free[i]}"><output>${fmt(ws.free[i], 1)}</output></div>`);
      const rg = row.querySelector('input'), out = row.querySelector('output');
      rg.addEventListener('input', () => { ws.free[i] = +rg.value; out.textContent = fmt(+rg.value, 1); saveState(); renderNet(); if (selected) renderEditor(); });
      c.append(row);
    });
    return c;
  }

  function segPanel() {
    const r = curRow();
    const on = i => r && r.x[i] > 0.5;
    const c = h(`<div class="card"><h3>Anzeige</h3><div class="mini" style="max-width:140px;margin:auto"><svg viewBox="0 0 90 120"><g stroke-width="9" stroke-linecap="round">
      ${[[20, 12, 70, 12], [76, 18, 76, 54], [76, 66, 76, 102], [20, 108, 70, 108], [14, 66, 14, 102], [14, 18, 14, 54], [20, 60, 70, 60]].map((p, i) => `<line x1="${p[0]}" y1="${p[1]}" x2="${p[2]}" y2="${p[3]}" stroke="${on(i) ? 'var(--accent)' : 'var(--line)'}"/>`).join('')}
      </g></svg></div><p class="muted" style="text-align:center">${r ? r.name : ''} — Segmente a (oben) bis g (Mitte)</p></div>`);
    const chips = h('<div class="chips" style="justify-content:center"></div>');
    sc.rows.forEach((row, i) => {
      const b = h(`<button class="chip${i === ws.row ? ' on' : ''}" type="button">${i}</button>`);
      b.onclick = () => { ws.row = i; saveState(); renderWork(); if (selected) renderEditor(); };
      chips.append(b);
    });
    c.append(chips);
    return c;
  }

  function plotPanel() {
    const t = sc.plot.type;
    const c = h(`<div class="card plotbox${t === '3d' ? ' tall' : ''}"><h3>${t === '3d' ? 'Würfel — mit dem Finger drehen' : t === 'curve' ? 'Kurve' : 'Diagramm'}</h3></div>`);
    if (!sc.cls && sc.outputs.length > 1 && t === '2d') {
      const chips = h('<div class="chips" style="margin-bottom:6px"></div>');
      ws.net.outputs.forEach((o, k) => {
        const b = h(`<button class="chip${k === ws.slot ? ' on' : ''}" type="button">${o.label}</button>`);
        b.onclick = () => { ws.slot = k; saveState(); renderSide(); };
        chips.append(b);
      });
      c.append(chips);
    }
    plotCanvas = document.createElement('canvas');
    c.append(plotCanvas);
    const lg = h('<div class="legend"></div>');
    if (sc.groups) {
      const used = [...new Set(sc.rows.map(r => r.grp))];
      used.forEach(g => lg.append(h(`<span><i style="background:${sc.groups[g].color}"></i>${sc.groups[g].name}</span>`)));
    } else if (t !== 'curve') {
      lg.append(h('<span><i style="background:#5c7cfa"></i>soll 0</span>'), h('<span><i style="background:#f08c00"></i>soll 1</span>'));
    }
    if (sc.rows.some(r => r.test)) lg.append(h('<span><i class="ring" style="border-color:var(--ink-faint)"></i>Testdaten</span>'));
    if (t !== 'curve') lg.append(h('<span>roter Ring = falsch</span>'));
    if (ws.net.inputs.length <= 3 && t !== 'curve') lg.append(h(`<span>gestrichelt = ${t === '3d' ? 'Ebene' : 'Gerade'} je Neuron der 1. Schicht</span>`));
    c.append(lg);
    return c;
  }

  function drawPlotOnly() {
    if (!plotCanvas || !sc || !sc.plot) return;
    const step0Train = sc.train && ws.step === 0;
    P.draw(plotCanvas, {
      sc, net: ws.net, rows: sc.rows, slot: ws.slot, selected,
      regions: !step0Train, lines: true, selRow: (ws.step === 1 || ws.slow) ? ws.row : null,
      pick: (i) => { ws.row = i; saveState(); renderNet(); drawPlotOnly(); if (selected) renderEditor(); if (ws.slow) { ws.slow = null; renderSide(); } }
    });
  }

  /* ── Training ─────────────────────────────────────────────── */
  let raf = 0, running = false, lastDraw = 0, order = [], pos = 0, acc = 0;
  const SPEEDS = [
    { name: 'sehr langsam', perSec: 2 }, { name: 'langsam', perSec: 15 }, { name: 'mittel', perSec: 120 },
    { name: 'schnell', perSec: 900 }, { name: 'sehr schnell', perSec: 6000 }];

  function resetTraining(randomize) {
    stopTrain();
    if (randomize) N.randomize(ws.net);
    ws.epoch = 0; ws.hist = []; ws.slow = null; order = []; pos = 0;
  }
  function shuffle() {
    const rows = trainRows();
    order = rows.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    pos = 0;
  }
  function trainOne() {
    const rows = trainRows();
    if (!rows.length) return null;
    if (pos >= order.length) {
      if (order.length) { ws.epoch++; pushLoss(); }
      shuffle();
    }
    const r = rows[order[pos++]];
    N.trainSample(ws.net, r.x, r.t, ws.lr);
    return r;
  }
  function pushLoss() {
    const l = N.evaluate(ws.net, trainRows(), { cls: sc.cls }).loss;
    ws.hist.push(l);
    if (ws.hist.length > 400) ws.hist = ws.hist.filter((_, i) => i % 2 === 0);
  }
  function startTrain() {
    if (running || !allConnected()) return;
    ws.slow = null;
    running = true; acc = 0; lastDraw = 0;
    let last = performance.now();
    const loop = (now) => {
      if (!running) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      acc += SPEEDS[ws.speed - 1].perSec * dt;
      let k = Math.floor(acc); acc -= k;
      const t0 = performance.now();
      while (k-- > 0 && performance.now() - t0 < 12) {
        const r = trainOne();
        if (r && ws.speed <= 2) ws.row = sc.rows.indexOf(r);
      }
      if (now - lastDraw > (ws.speed <= 2 ? 0 : 70)) { lastDraw = now; liveRender(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    renderSide();
  }
  function stopTrain() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    saveState();
    if (ws && sc && document.body.dataset.screen === 'work') renderSide();
  }
  function liveRender() {
    renderNet();
    drawPlotOnly();
    if (sideLive) sideLive();
  }

  function trainPanel() {
    const c = h('<div class="card"><h3>Training</h3></div>');
    const btns = h('<div class="row"></div>');
    const go = h(`<button class="btn primary big" id="train-go" type="button">${running ? '❚❚ Pause' : '▶ Trainieren'}</button>`);
    go.onclick = () => { if (running) stopTrain(); else startTrain(); };
    const slow = h('<button class="btn" id="slow-btn" type="button" title="Ein einzelnes Beispiel Schritt für Schritt">Zeitlupe</button>');
    slow.onclick = () => slowStep();
    const rs = h('<button class="btn" type="button" title="Gewichte neu auswürfeln">Neu würfeln</button>');
    rs.onclick = () => { resetTraining(true); saveState(); renderWork(); };
    btns.append(go, slow, rs);
    c.append(btns);

    // Lernrate (logarithmisch) und Tempo
    const lrv = Math.log10(ws.lr);
    const lr = h(`<div class="slider"><span>Lernrate</span><input type="range" min="-2" max="1" step="0.05" value="${lrv}"><output>${fmt(ws.lr, 2)}</output></div>`);
    lr.querySelector('input').addEventListener('input', e => {
      ws.lr = +Math.pow(10, +e.target.value).toPrecision(2);
      lr.querySelector('output').textContent = fmt(ws.lr, 2);
      saveState();
    });
    const sp = h(`<div class="slider"><span>Tempo</span><input type="range" min="1" max="5" step="1" value="${ws.speed}"><output>${SPEEDS[ws.speed - 1].name}</output></div>`);
    sp.querySelector('input').addEventListener('input', e => {
      ws.speed = +e.target.value; sp.querySelector('output').textContent = SPEEDS[ws.speed - 1].name; saveState();
    });
    c.append(lr, sp);

    if (ws.slow) c.append(slowCard());
    const stats = h('<div class="stats"></div>');
    const lc = document.createElement('canvas'); lc.className = 'lossc';
    lossCanvas = lc;
    statsCard = h('<div class="card"><h3>Fortschritt</h3></div>');
    statsCard.append(stats, h('<p class="muted" style="margin:8px 0 0">Fehlerkurve (je Durchgang durch alle Trainingsdaten)</p>'), lc);

    const hasTest = testRows().length > 0;
    const draw = () => {
      const tr = score(trainRows()), te = hasTest ? score(testRows()) : null;
      const goal = sc.goal ? sc.goal.acc : 1;
      const loss = N.evaluate(ws.net, trainRows(), { cls: sc.cls }).loss;
      stats.innerHTML = `
        <div class="stat"><small>Durchgänge</small><b>${ws.epoch}</b></div>
        <div class="stat"><small>Fehler</small><b>${loss.toFixed(4).replace('.', ',')}</b></div>
        <div class="stat"><small>Training richtig</small><b class="${tr >= goal ? 'good' : ''}">${Math.round(tr * 100)} %</b></div>
        ${hasTest ? `<div class="stat"><small>Test richtig</small><b id="stat-test" class="${te >= goal ? 'good' : ''}">${Math.round(te * 100)} %</b></div>` : ''}`;
      P.drawLoss(lc, ws.hist);
      const was = isDone(sc.id);
      checkSolved();
      if (!was && isDone(sc.id) && !running) setTimeout(renderSide, 0);
    };
    draw();
    sideLive = draw;
    if (ws.lr > 3) c.append(h('<p class="hint">Achtung: Bei sehr großer Lernrate springt das Netz hin und her — wie der Pinguin in Nebeltal, der über das Tal hinwegspringt.</p>'));
    return c;
  }

  /* Zeitlupe: ein Beispiel, sichtbare Änderung je Gewicht, dann anwenden */
  function slowStep() {
    stopTrain();
    if (!ws.slow || ws.slow.phase === 2) {
      const rows = trainRows();
      if (pos >= order.length) shuffle();
      const r = rows[order[pos++]];
      const g = N.gradients(ws.net, r.x, r.t);
      const deltas = { gw: g.gw.map(L => L.map(w => w.map(v => -ws.lr * v))), gb: g.gb.map(L => L.map(v => -ws.lr * v)) };
      ws.row = sc.rows.indexOf(r);
      ws.slow = { phase: 1, r, g, deltas, before: N.predict(ws.net, r.x) };
    } else {
      N.apply(ws.net, ws.slow.g, ws.lr);
      ws.slow.after = N.predict(ws.net, ws.slow.r.x);
      ws.slow.phase = 2;
    }
    renderWork();
  }
  function slowCard() {
    const s = ws.slow;
    const r = s.r;
    const name = r.name || 'Beispiel ' + (sc.rows.indexOf(r) + 1);
    const real = sc.inputs.map((inp, i) => `${inp.label}: <b>${inp.real ? inp.real(r.x[i]) + ' ' + inp.unit : fmt(r.x[i], 2)}</b>`).join('<br>');
    const outs = ws.net.outputs.map((o, k) => {
      const b = s.before[k], a = s.after ? s.after[k] : null;
      return `<div>${o.label}</div><div>soll <b>${fmt(r.t[k], 2)}</b> · Netz <b>${fmt(b, 4)}</b>${a != null ? ` → <b>${fmt(a, 4)}</b> ${Math.abs(a - r.t[k]) < Math.abs(b - r.t[k]) ? '✓ näher dran' : ''}` : ''}</div>`;
    }).join('');
    const c = h(`<div class="card slow" style="margin-top:12px"><h3>Zeitlupe · ${s.phase === 1 ? 'Schritt 1: Fehler finden' : 'Schritt 2: Gewichte geändert'}</h3>
      <p><b>${name}</b><br>${real}</p>
      <div class="io">${outs}</div>
      <p class="muted">${s.phase === 1
        ? 'Das Netz vergleicht seine Antwort mit der Lösung. Der Fehler läuft <b>rückwärts</b> durchs Netz: An jeder Leitung steht, um wie viel sich das Gewicht ändern wird (grün = größer, rot = kleiner). Wie stark, bestimmt die Lernrate.'
        : 'Die Gewichte sind ein kleines Stück in die richtige Richtung gerückt. Training heißt: das tausendfach, mit allen Beispielen.'}</p></div>`);
    const b = h(`<button class="btn primary" id="slow-next" type="button">${s.phase === 1 ? 'Gewichte ändern' : 'Nächstes Beispiel'}</button>`);
    b.onclick = slowStep;
    c.append(b);
    return c;
  }

  /* ── Druck ────────────────────────────────────────────────── */
  $('btn-print').onclick = () => {
    if (!sc || STUDENT) return;
    stopTrain(); closeEditor();
    window.NLDruck.open({ sc, net: ws.net, row: ws.row, onClose: () => renderWork() });
  };

  /* ── Start ────────────────────────────────────────────────── */
  let booted = false;
  function boot() {
    booted = true;
    const w = jget('nl.where', null);
    if (w && w.screen === 'neuron' && w.id && usable(w.id)) openNeuron(w.id);
    else if (w && w.screen === 'work' && S[w.id] && usable(w.id)) openScenario(w.id, false);
    else goHome();
  }

  // Hell/Dunkel wie die Seite drumherum
  (function syncTheme() {
    let pd = null;
    try { pd = window.parent !== window ? window.parent.document.documentElement : null; } catch (e) { pd = null; }
    if (!pd) return;
    const apply = () => {
      const t = pd.getAttribute('data-theme');
      if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
      else document.documentElement.removeAttribute('data-theme');
      if (sc && document.body.dataset.screen === 'work') drawPlotOnly();
    };
    apply();
    try { new MutationObserver(apply).observe(pd, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* egal */ }
  })();
  (function measureHead() {
    const head = $('head');
    const set = () => document.documentElement.style.setProperty('--head-h', head.offsetHeight + 'px');
    set();
    if (window.ResizeObserver) new ResizeObserver(set).observe(head);
  })();
  window.addEventListener('resize', () => { if (sc && document.body.dataset.screen === 'work') drawPlotOnly(); });

  if (STUDENT) { setScreen('home'); renderHome(); }
  else if (!TEACHER) boot();
  if (ROOM) {
    window.addEventListener('message', e => {
      if (e.origin !== location.origin || e.source !== window.parent || !e.data || e.data.type !== 'nl:cmd') return;
      if (Array.isArray(e.data.parts)) setParts(e.data.parts.map(String), true);
      else setParts(DEFAULT_PARTS, true);
    });
    sendUp({ type: 'nl:ready' });
    // Lehrkraft ohne Antwort (z. B. allein getestet): nach kurzer Zeit trotzdem starten
    if (TEACHER) setTimeout(() => { if (!booted) { parts = DEFAULT_PARTS.slice(); boot(); } }, 1500);
  }

  window.NL = { openScenario, openNeuron, goHome, startTrain, stopTrain, refresh: () => { saveState(); renderWork(); }, get ws() { return ws; }, get sc() { return sc; } };
})();
