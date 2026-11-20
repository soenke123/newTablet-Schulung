/* ══════════════════════════════════════════════════════════════
   NeuroLab · druck.js — Druckansicht für Arbeitsblätter und Klausuren
   ══════════════════════════════════════════════════════════════
   Nur für die Lehrkraft (und allein geöffnet), nie für die Klasse.
   Links Haken, was aufs Blatt soll, rechts das Blatt (weiß, A4).
   Die Wahl merkt sich das Gerät (localStorage nl.print).

   NLDruck.open({ sc, net, row, onClose })
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const N = window.NLNetz;
  const F = window.NLFeld;

  const DEF = {
    title: true, task: true,
    weights: 'num',      // num | gap | off
    bias: 'num',         // num | gap | off
    act: 'real',         // real | fz
    values: false, inputs: false, slots: true,
    table: true, tableIst: 'blank',   // blank | num | off
    plot: true, bw: false
  };
  let opt = Object.assign({}, DEF);
  try { Object.assign(opt, JSON.parse(localStorage.getItem('nl.print') || '{}')); } catch (e) { /* egal */ }
  const save = () => { try { localStorage.setItem('nl.print', JSON.stringify(opt)); } catch (e) { /* egal */ } };

  let cur = null;

  function open(c) {
    cur = c;
    document.getElementById('print-wrap').hidden = false;
    document.body.classList.add('printing');
    buildOpts();
    buildSheet();
  }
  function close() {
    document.getElementById('print-wrap').hidden = true;
    document.body.classList.remove('printing');
    if (cur && cur.onClose) cur.onClose();
    cur = null;
  }
  const isOpen = () => !!cur;

  function buildOpts() {
    const el = document.getElementById('print-opts');
    const hasRows = cur.sc.rows && cur.sc.rows.length && cur.sc.rows.length <= 16;
    const hasPlot = !!cur.sc.plot;
    const cb = (k, label, dis) => `<label><input type="checkbox" data-k="${k}" ${opt[k] ? 'checked' : ''} ${dis ? 'disabled' : ''}> ${label}</label>`;
    const sel = (k, label, choices) => `<label>${label}<select data-k="${k}">${choices.map(([v, t]) => `<option value="${v}" ${opt[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    el.innerHTML = `
      <h3>Druckansicht</h3>
      <p class="muted">Was soll auf das Blatt? Gut für Arbeitsblätter und Klausuren.</p>
      <h4>Kopf</h4>
      ${cb('title', 'Überschrift')}
      ${cb('task', 'Aufgabentext')}
      <h4>Netz</h4>
      ${sel('weights', 'Gewichte', [['num', 'Zahlen'], ['gap', 'Lücken ____'], ['off', 'ohne']])}
      ${sel('bias', 'Bias', [['num', 'Zahlen'], ['gap', 'Lücken ____'], ['off', 'ohne']])}
      ${sel('act', 'Aktivierung', [['real', 'echte Funktion'], ['fz', 'nur „f(z)“']])}
      ${cb('slots', 'Ausgänge und Leitungen')}
      ${cb('inputs', 'Eingabewerte (ausgewählte Zeile)')}
      ${cb('values', 'Werte z und y (ausgewählte Zeile)')}
      ${cb('bw', 'Schwarz-weiß')}
      <h4>Dazu</h4>
      ${cb('table', 'Wertetabelle', !hasRows)}
      ${sel('tableIst', 'Spalte „Ist“', [['blank', 'leer zum Ausfüllen'], ['num', 'ausgefüllt'], ['off', 'ohne']])}
      ${cb('plot', 'Diagramm', !hasPlot)}
      <div class="row" style="margin-top:16px">
        <button class="btn primary" id="pr-go" type="button">Drucken</button>
        <button class="btn" id="pr-close" type="button">Fertig</button>
      </div>
      <p class="muted" style="margin-top:12px">Tipp: Im Druckdialog „Als PDF speichern“ wählen, dann lässt sich das Blatt in Word oder im Master PDF Skill weiterverwenden.</p>`;
    el.querySelectorAll('[data-k]').forEach(i => i.addEventListener('change', () => {
      opt[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value;
      save(); buildSheet();
    }));
    el.querySelector('#pr-go').onclick = () => window.print();
    el.querySelector('#pr-close').onclick = close;
  }

  function buildSheet() {
    const sh = document.getElementById('print-sheet');
    const { sc, net } = cur;
    sh.innerHTML = '';
    if (opt.title) { const h = document.createElement('h1'); h.textContent = sc.title; sh.append(h); }
    if (opt.task && sc.task) { const p = document.createElement('p'); p.className = 'ptask'; p.innerHTML = sc.task; sh.append(p); }
    const row = cur.row != null && sc.rows[cur.row] ? sc.rows[cur.row] : null;
    const values = (opt.values || opt.inputs) && row ? N.forward(net, row.x) : null;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('net', 'pnet');
    sh.append(svg);
    F.render(svg, { net, sc, values, targets: row ? row.t : null, edit: {}, print: opt, on: { neuron() {}, change() {} } });
    // Höhe passend zum Inhalt
    const vb = svg.viewBox.baseVal; svg.setAttribute('height', Math.min(560, vb.height * (680 / vb.width)));

    const wantTable = opt.table && sc.rows && sc.rows.length && sc.rows.length <= 16;
    const wantPlot = opt.plot && sc.plot;
    if (!wantTable && !wantPlot) return;
    const grid = document.createElement('div');
    grid.className = 'pgrid' + (wantTable && wantPlot ? '' : ' one');
    sh.append(grid);
    if (wantTable) {
      const outs = N.predict.bind(null, net);
      let html = '<table class="ttab"><thead><tr>' + sc.inputs.map(i => `<th>${i.label}</th>`).join('');
      sc.outputs.forEach(o => { html += `<th class="sep">${o.label}<br>soll</th>`; if (opt.tableIst !== 'off') html += '<th>ist</th>'; });
      html += '</tr></thead><tbody>';
      sc.rows.forEach(r => {
        const y = outs(r.x);
        html += '<tr>' + r.x.map(v => `<td>${F.fmt(v, 2)}</td>`).join('');
        sc.outputs.forEach((o, k) => {
          html += `<td class="sep">${F.fmt(r.t[k], 2)}</td>`;
          if (opt.tableIst === 'num') html += `<td>${y[k] == null ? '–' : F.fmt(y[k], 2)}</td>`;
          else if (opt.tableIst === 'blank') html += '<td class="blank"></td>';
        });
        html += '</tr>';
      });
      grid.insertAdjacentHTML('beforeend', html + '</tbody></table>');
    }
    if (wantPlot) {
      const cv = document.createElement('canvas');
      cv.style.cssText = 'width:640px;height:460px;position:absolute;left:-9999px';
      document.body.append(cv);
      window.NLPlot.draw(cv, { sc, net, rows: sc.rows, print: opt, slot: 0 });
      const img = new Image();
      img.src = cv.toDataURL('image/png');
      cv.remove();
      grid.append(img);
    }
  }

  window.NLDruck = { open, close, isOpen };
})();
