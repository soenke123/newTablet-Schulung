/* Zukunftsboard — Oberfläche.

   Grundregel: der Server entscheidet. Phase, Eigentum, Kontingent und
   Quellen-Vollständigkeit prüft board_upsert_note (Migration 0062)
   noch einmal komplett. Was hier passiert, ist Komfort — deaktivierte
   Knöpfe und Fehlermeldungen in verständlichem Deutsch, keine Sicherheit.

   Kein localStorage: die Karten gehören dem Kurs und leben auf dem
   Server. Ansichts-Einstellungen liegen im sessionStorage, damit auf
   einem geteilten Tablet nichts vom Vorgänger übrig bleibt.          */
(function () {
  'use strict';

  /* ── Stammdaten ──────────────────────────────────────── */
  const CATEGORIES = [
    { id: 'persoenlich',      icon: '🧍', label: 'Persönlich'       },
    { id: 'gesellschaftlich', icon: '👥', label: 'Gesellschaftlich' },
    { id: 'politisch',        icon: '🏛️', label: 'Politisch'         },
    { id: 'bildung',          icon: '📚', label: 'Wissen & Bildung' },
    { id: 'wirtschaftlich',   icon: '💶', label: 'Wirtschaftlich'   },
    { id: 'umwelt',           icon: '🌱', label: 'Umwelt'           }
  ];
  const STANCES = [
    { id: 'chance',    icon: '🟢', label: 'Chance'    },
    { id: 'risiko',    icon: '🔴', label: 'Risiko'    },
    { id: 'vermutung', icon: '🟡', label: 'Vermutung' }
  ];

  const PHASE_HINT = {
    1: 'Phase 1 · Sammeln — Was könnten KI, Social Media und Handy-Games bewirken? Halte Chancen, Risiken und Vermutungen fest. Du hast 8 Karten.',
    2: 'Phase 2 · Belegen — Such dir einen Punkt aus und finde einen echten Fakt dazu. Einer ist Pflicht, zwei sind möglich — jeweils mit vollständiger Quelle.',
    3: 'Phase 3 · Besprechen — Das Board ist eingefroren. Jetzt schauen wir gemeinsam drauf.'
  };

  const ERROR_TEXT = {
    not_authenticated:     'Du bist nicht mehr angemeldet. Lade die Seite neu.',
    no_cluster:            'Du gehörst noch zu keinem Kurs — ohne Kurs gibt es kein Board.',
    no_profile:            'Zu deinem Konto fehlt ein Profil. Melde dich bei deiner Lehrkraft.',
    account_not_active:    'Dein Konto ist noch nicht freigeschaltet.',
    season_locked:         'Das Zukunftsboard gehört zu Season 3 und ist für deinen Kurs noch nicht offen.',
    phase_locked:          'In dieser Phase lässt sich das nicht mehr ändern.',
    quota_exceeded:        'Du hast schon alle Karten dieser Art vergeben.',
    not_owner:             'Das ist nicht deine Karte.',
    not_admin:             'Das dürfen nur Admins.',
    not_found:             'Diese Karte gibt es nicht mehr.',
    invalid_input:         'Mit den Eingaben stimmt etwas nicht.',
    invalid_source_url:    'Der Link muss vollständig sein und mit https:// beginnen.',
    invalid_source_author: 'Trag ein, wer den Text geschrieben hat.',
    invalid_source_date:   'Das Veröffentlichungsdatum fehlt oder liegt in der Zukunft.',
    network:               'Keine Verbindung zum Server. Versuch es gleich nochmal.'
  };

  const CLUSTER_KEY = 'bd_cluster';
  const VIEW_KEY    = 'bd_view';
  const POLL_MS     = 5000;

  /* ── Zustand ─────────────────────────────────────────── */
  const state = {
    data:      null,   // letzte Antwort von board_get
    isAdmin:   false,
    clusters:  [],
    clusterId: null,   // nur Admins wählen aktiv; Schüler bleiben auf null
    view:      'board',
    sort:      { col: 'created_at', dir: 'desc' },
    lastSig:   null,
    editing:   null,   // { id|null, kind, category, stance }
    confirmFn: null
  };

  /* ── Kleinkram ───────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const esc = s => (window.escapeHtml
    ? window.escapeHtml(s)
    : String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])));

  const catOf    = id => CATEGORIES.find(c => c.id === id) || { icon: '•', label: id };
  const stanceOf = id => STANCES.find(s => s.id === id)    || { icon: '•', label: id };

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDate(iso) {
    if (!iso) return '';
    // 'T00:00:00' erzwingt lokale Mitternacht. Ohne das liest der Browser
    // ein reines Datum als UTC und zeigt westlich von Greenwich den Vortag.
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function domainOf(url) {
    try { return new URL(url).hostname.replace(/^www\./i, ''); }
    catch (e) { return url; }
  }

  const isSafeUrl = u => /^https?:\/\/[^\s]+\.[^\s]+/i.test(String(u || ''));

  /* Quellenangabe in Schul-Zitierweise. Eine einzige Funktion für Karte
     und Tabelle — zwei Codepfade würden garantiert auseinanderlaufen. */
  function formatSource(note) {
    if (note.kind !== 'fakt' || !note.source_url) return '';
    const link = isSafeUrl(note.source_url)
      ? `<a href="${esc(note.source_url)}" target="_blank" rel="noopener noreferrer" title="${esc(note.source_url)}">${esc(domainOf(note.source_url))} ↗</a>`
      : esc(note.source_url);   // kein Link — javascript: & Co. bleiben Text
    return `${esc(note.source_author)} (${formatDate(note.source_date)}): ${link}`;
  }

  function toast(msg, isError) {
    const t = $('bdToast');
    t.textContent = msg;
    t.className = 'bd-toast' + (isError ? ' bd-toast--error' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  const errText = err => ERROR_TEXT[err] || `Unerwarteter Fehler (${err}).`;

  /* ── Rechte — dieselbe Logik wie serverseitig in 0062 ─── */
  function phase() { return state.data?.phase ?? 1; }

  function canWrite(kind) {
    if (state.isAdmin) return true;
    if (phase() >= 3) return false;
    if (kind === 'fakt') return phase() >= 2;
    return true;
  }

  function canEdit(note) {
    if (state.isAdmin) return true;
    if (!note.is_mine) return false;
    return canWrite(note.kind);
  }

  /* ── Laden ───────────────────────────────────────────── */
  async function load(opts) {
    const quiet = opts && opts.quiet;
    const res = await window.BoardAPI.get(state.clusterId);

    if (!res || !res.ok) {
      // Beim stillen Poll keinen Ladefehler über ein funktionierendes
      // Board legen — ein Aussetzer im WLAN ist kein Grund, dem Kurs
      // den Inhalt wegzunehmen.
      if (quiet && state.data) return;
      showStatus(errText(res?.error), true);
      return;
    }

    state.data = res;
    state.isAdmin = !!res.is_admin;
    if (!state.clusterId) state.clusterId = res.cluster_id;
    render();
  }

  function showStatus(msg, isError) {
    const s = $('bdStatus');
    s.textContent = msg;
    s.className = 'bd-status' + (isError ? ' bd-status--error' : '');
    s.hidden = false;
    $('bdBoard').hidden = true;
    $('bdTable').hidden = true;
    $('bdActions').hidden = true;
    $('bdPhases').hidden  = true;
    $('bdHint').hidden    = true;
    $('bdViewSwitch').hidden = true;
    // Signatur verwerfen: sonst hält render() beim nächsten erfolgreichen
    // Laden die Daten für „unverändert", steigt früh aus — und die
    // Fehlermeldung bliebe über einem versteckten Board stehen.
    state.lastSig = null;
  }

  /* ── Rendern ─────────────────────────────────────────── */
  function signature() {
    const d = state.data;
    if (!d) return '';
    return JSON.stringify([
      d.cluster_id, d.phase, d.is_admin, state.view, state.sort,
      d.me?.ideas_used, d.me?.facts_used,
      d.notes.map(n => [n.id, n.updated_at])
    ]);
  }

  function render() {
    // Unverändert? Dann DOM in Ruhe lassen. Das ist der Normalfall beim
    // 5-Sekunden-Poll und hält Scrollposition und Fokus stabil.
    const sig = signature();
    if (sig === state.lastSig) return;
    state.lastSig = sig;

    const d = state.data;
    $('bdStatus').hidden = true;
    $('bdCourse').textContent = d.cluster_name ? `Kurs: ${d.cluster_name}` : '';

    renderPhases();
    renderHint();
    renderQuota();
    renderActions();
    renderAdminBar();

    $('bdViewSwitch').hidden = false;
    document.querySelectorAll('#bdViewSwitch button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === state.view);
    });

    if (state.view === 'board') {
      $('bdTable').hidden = true;
      $('bdBoard').hidden = false;
      renderBoard();
    } else {
      $('bdBoard').hidden = true;
      $('bdTable').hidden = false;
      renderTable();
    }
  }

  function renderPhases() {
    const p = phase();
    $('bdPhases').hidden = false;
    document.querySelectorAll('.bd-phase').forEach(el => {
      const n = Number(el.dataset.phase);
      el.classList.toggle('bd-phase--active', n === p);
      el.classList.toggle('bd-phase--done', n < p);
    });
  }

  function renderHint() {
    const h = $('bdHint');
    h.textContent = PHASE_HINT[phase()] || '';
    h.hidden = false;
  }

  function renderQuota() {
    const me = state.data.me || {};
    if (state.isAdmin) {
      $('bdQuota').innerHTML = `${state.data.notes.length} Karten im Kurs`;
      return;
    }
    $('bdQuota').innerHTML =
      `Postis <strong>${me.ideas_used ?? 0}/${me.ideas_max ?? 8}</strong>` +
      ` · Fakten <strong>${me.facts_used ?? 0}/${me.facts_max ?? 2}</strong>`;
  }

  function renderActions() {
    const me = state.data.me || {};
    const box = $('bdActions');
    box.hidden = false;

    const ideaBtn = $('bdNewIdea');
    const factBtn = $('bdNewFact');

    const ideaFull = !state.isAdmin && (me.ideas_used ?? 0) >= (me.ideas_max ?? 8);
    const factFull = !state.isAdmin && (me.facts_used ?? 0) >= (me.facts_max ?? 2);

    ideaBtn.hidden = !canWrite('idee');
    factBtn.hidden = !canWrite('fakt');
    ideaBtn.disabled = ideaFull;
    factBtn.disabled = factFull;
    ideaBtn.title = ideaFull ? 'Deine 8 Postis sind vergeben.' : '';
    factBtn.title = factFull ? 'Deine 2 Fakten sind vergeben.' : '';

    box.hidden = ideaBtn.hidden && factBtn.hidden;
  }

  function noteHTML(note) {
    const st  = stanceOf(note.stance);
    const cat = catOf(note.category);
    const cite = formatSource(note);
    const acts = canEdit(note)
      ? `<span class="bd-note__actions">
           <button class="bd-note__act" data-edit="${esc(note.id)}" title="Bearbeiten">✏️</button>
           <button class="bd-note__act" data-del="${esc(note.id)}" title="Löschen">🗑️</button>
         </span>`
      : '';
    return `
      <article class="bd-note bd-note--${esc(note.stance)}${note.is_mine ? ' bd-note--mine' : ''}">
        <div class="bd-note__top">
          <span>${st.icon} ${esc(st.label)}</span>
          ${note.kind === 'fakt' ? '<span class="bd-note__kind">📎 Fakt</span>' : `<span>${cat.icon}</span>`}
        </div>
        <div class="bd-note__text">${esc(note.text)}</div>
        ${cite ? `<div class="bd-source-cite">
                    <span class="bd-source-cite__label">Quelle</span>
                    <span class="bd-source-cite__body">${cite}</span>
                  </div>` : ''}
        <div class="bd-note__foot">
          <span>— ${esc(note.author || 'Unbekannt')}</span>
          ${acts}
        </div>
      </article>`;
  }

  function renderBoard() {
    const notes = state.data.notes;
    const facts = notes.filter(n => n.kind === 'fakt');
    let html = '';

    // Ab Phase 2 stehen die Fakten oben — sie sind das Ergebnis der
    // Recherche und der Anker für das Gespräch in Phase 3.
    if (phase() >= 2 && facts.length > 0) {
      html += `<div class="bd-facts">
                 <h2 class="bd-facts__head">📎 Belegte Fakten (${facts.length})</h2>
                 <div class="bd-facts__grid">${facts.map(noteHTML).join('')}</div>
               </div>`;
    }

    html += '<div class="bd-columns">';
    for (const cat of CATEGORIES) {
      const inCat = notes.filter(n => n.category === cat.id && (phase() < 2 || n.kind !== 'fakt'));
      html += `<div class="bd-col">
                 <div class="bd-col__head">
                   <span>${cat.icon} ${esc(cat.label)}</span>
                   <span class="bd-col__count">${inCat.length}</span>
                 </div>
                 ${inCat.length ? inCat.map(noteHTML).join('')
                                : '<p class="bd-col__empty">Noch nichts hier.</p>'}
               </div>`;
    }
    html += '</div>';

    $('bdBoard').innerHTML = html;
  }

  const TABLE_COLS = [
    { key: 'category',   label: 'Bereich'  },
    { key: 'stance',     label: 'Typ'      },
    { key: 'kind',       label: 'Art'      },
    { key: 'text',       label: 'Text'     },
    { key: 'source',     label: 'Quelle'   },
    { key: 'author',     label: 'Von'      },
    { key: 'created_at', label: 'Wann'     }
  ];

  function sortValue(note, key) {
    if (key === 'category') return catOf(note.category).label;
    if (key === 'stance')   return stanceOf(note.stance).label;
    if (key === 'kind')     return note.kind === 'fakt' ? 'Fakt' : 'Posti';
    if (key === 'source')   return note.source_author || '';
    return note[key] || '';
  }

  function renderTable() {
    const rows = state.data.notes.slice().sort((a, b) => {
      const av = String(sortValue(a, state.sort.col)).toLowerCase();
      const bv = String(sortValue(b, state.sort.col)).toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return state.sort.dir === 'asc' ? cmp : -cmp;
    });

    const head = TABLE_COLS.map(c => {
      const arrow = state.sort.col === c.key ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th data-col="${c.key}">${esc(c.label)}${arrow}</th>`;
    }).join('');

    const body = rows.map(n => {
      const st = stanceOf(n.stance);
      const cite = formatSource(n);
      return `<tr>
        <td>${catOf(n.category).icon} ${esc(catOf(n.category).label)}</td>
        <td><span class="bd-pill bd-pill--${esc(n.stance)}">${esc(st.label)}</span></td>
        <td>${n.kind === 'fakt' ? '📎 Fakt' : 'Posti'}</td>
        <td>${esc(n.text)}</td>
        <td>${cite || '—'}</td>
        <td>${esc(n.author || '—')}</td>
        <td>${formatDate(n.created_at)}</td>
      </tr>`;
    }).join('');

    $('bdTable').innerHTML = rows.length
      ? `<div class="bd-table-wrap"><table class="bd-table">
           <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
      : '<p class="bd-col__empty">Noch nichts auf dem Board.</p>';
  }

  function renderAdminBar() {
    const bar = $('bdAdminBar');
    if (!state.isAdmin) { bar.hidden = true; return; }
    bar.hidden = false;

    const sel = $('bdClusterSelect');
    const wanted = state.clusterId || state.data.cluster_id;
    const optsSig = state.clusters.map(c => c.id).join(',') + '|' + wanted;
    if (sel.dataset.sig !== optsSig) {
      sel.innerHTML = state.clusters.map(c =>
        `<option value="${esc(c.id)}"${c.id === wanted ? ' selected' : ''}>${esc(c.name)} (S${c.season})</option>`
      ).join('');
      sel.dataset.sig = optsSig;
    }

    $('bdPhasePrev').disabled = phase() <= 1;
    $('bdPhaseNext').disabled = phase() >= 3;
  }

  /* ── Erfassungs-Modal ────────────────────────────────── */
  function openModal(kind, note) {
    state.editing = {
      id:       note?.id ?? null,
      kind:     kind,
      category: note?.category ?? null,
      stance:   note?.stance ?? null
    };

    $('bdModalTitle').textContent = note
      ? (kind === 'fakt' ? 'Fakt bearbeiten' : 'Posti bearbeiten')
      : (kind === 'fakt' ? 'Neuer Fakt'      : 'Neues Posti');

    $('bdCatChoice').innerHTML = CATEGORIES.map(c =>
      `<button type="button" data-val="${c.id}" aria-pressed="${c.id === state.editing.category}">${c.icon} ${esc(c.label)}</button>`
    ).join('');
    $('bdStanceChoice').innerHTML = STANCES.map(s =>
      `<button type="button" data-val="${s.id}" aria-pressed="${s.id === state.editing.stance}">${s.icon} ${esc(s.label)}</button>`
    ).join('');

    $('bdText').value = note?.text ?? '';
    $('bdTextCount').textContent = ($('bdText').value || '').length;

    const isFact = kind === 'fakt';
    $('bdSource').hidden = !isFact;
    $('bdSrcUrl').value    = note?.source_url    ?? '';
    $('bdSrcAuthor').value = note?.source_author ?? '';
    $('bdSrcDate').value   = note?.source_date ? String(note.source_date).slice(0, 10) : '';
    $('bdSrcDate').max     = todayIso();

    ['bdText', 'bdSrcUrl', 'bdSrcAuthor', 'bdSrcDate'].forEach(id => $(id).classList.remove('bd-invalid'));
    $('bdModalError').hidden = true;
    $('bdModal').hidden = false;
    validate();
    $('bdText').focus();
  }

  function closeModal() {
    $('bdModal').hidden = true;
    state.editing = null;
  }

  /* Gibt zurück, was noch fehlt — und markiert die Felder. Genau
     dieselben Grenzen wie board_upsert_note; die RPC bleibt aber die
     Instanz, die entscheidet. */
  function validate() {
    if (!state.editing) return false;
    const isFact = state.editing.kind === 'fakt';
    const text   = $('bdText').value.trim();

    const bad = {
      text:   text.length < 3 || text.length > 200,
      url:    isFact && !isSafeUrl($('bdSrcUrl').value.trim()),
      author: isFact && ($('bdSrcAuthor').value.trim().length < 2 || $('bdSrcAuthor').value.trim().length > 120),
      date:   isFact && (!$('bdSrcDate').value || $('bdSrcDate').value > todayIso())
    };

    // Rot erst markieren, wenn im Feld überhaupt etwas steht — sonst
    // leuchtet das Formular schon vor dem ersten Tastendruck rot.
    $('bdText')     .classList.toggle('bd-invalid', bad.text   && text.length > 0);
    $('bdSrcUrl')   .classList.toggle('bd-invalid', bad.url    && $('bdSrcUrl').value.trim().length > 0);
    $('bdSrcAuthor').classList.toggle('bd-invalid', bad.author && $('bdSrcAuthor').value.trim().length > 0);
    $('bdSrcDate')  .classList.toggle('bd-invalid', bad.date   && !!$('bdSrcDate').value);

    const ok = !bad.text && !bad.url && !bad.author && !bad.date
            && !!state.editing.category && !!state.editing.stance;
    $('bdSave').disabled = !ok;
    return ok;
  }

  async function save() {
    if (!validate()) return;
    const e = state.editing;
    const isFact = e.kind === 'fakt';

    $('bdSave').disabled = true;
    const res = await window.BoardAPI.upsert({
      id:            e.id,
      kind:          e.kind,
      category:      e.category,
      stance:        e.stance,
      text:          $('bdText').value.trim(),
      source_url:    isFact ? $('bdSrcUrl').value.trim()    : null,
      source_author: isFact ? $('bdSrcAuthor').value.trim() : null,
      source_date:   isFact ? $('bdSrcDate').value          : null,
      cluster_id:    state.clusterId
    });

    if (!res || !res.ok) {
      $('bdModalError').textContent = errText(res?.error);
      $('bdModalError').hidden = false;
      $('bdSave').disabled = false;
      return;
    }

    closeModal();
    toast(res.updated ? 'Gespeichert.' : 'Auf dem Board!');
    await load();
  }

  /* ── Bestätigen ──────────────────────────────────────── */
  function confirmAsk(title, text, fn) {
    $('bdConfirmTitle').textContent = title;
    $('bdConfirmText').textContent  = text;
    state.confirmFn = fn;
    $('bdConfirm').hidden = false;
  }

  /* ── Verdrahtung ─────────────────────────────────────── */
  function wire() {
    $('bdNewIdea').addEventListener('click', () => openModal('idee', null));
    $('bdNewFact').addEventListener('click', () => openModal('fakt', null));

    $('bdCatChoice').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b || !state.editing) return;
      state.editing.category = b.dataset.val;
      $('bdCatChoice').querySelectorAll('button').forEach(x =>
        x.setAttribute('aria-pressed', String(x === b)));
      validate();
    });
    $('bdStanceChoice').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b || !state.editing) return;
      state.editing.stance = b.dataset.val;
      $('bdStanceChoice').querySelectorAll('button').forEach(x =>
        x.setAttribute('aria-pressed', String(x === b)));
      validate();
    });

    $('bdText').addEventListener('input', () => {
      $('bdTextCount').textContent = $('bdText').value.length;
      validate();
    });
    ['bdSrcUrl', 'bdSrcAuthor', 'bdSrcDate'].forEach(id =>
      $(id).addEventListener('input', validate));

    $('bdSave').addEventListener('click', save);
    $('bdCancel').addEventListener('click', closeModal);
    $('bdModal').addEventListener('click', ev => { if (ev.target === $('bdModal')) closeModal(); });

    $('bdConfirmNo').addEventListener('click', () => { $('bdConfirm').hidden = true; state.confirmFn = null; });
    $('bdConfirmYes').addEventListener('click', async () => {
      const fn = state.confirmFn;
      $('bdConfirm').hidden = true; state.confirmFn = null;
      if (fn) await fn();
    });

    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      if (!$('bdModal').hidden)   closeModal();
      if (!$('bdConfirm').hidden) { $('bdConfirm').hidden = true; state.confirmFn = null; }
    });

    // Karten-Aktionen (Event-Delegation — die Karten werden neu gebaut)
    $('bdBoard').addEventListener('click', async ev => {
      const editBtn = ev.target.closest('[data-edit]');
      const delBtn  = ev.target.closest('[data-del]');
      if (editBtn) {
        const note = state.data.notes.find(n => n.id === editBtn.dataset.edit);
        if (note) openModal(note.kind, note);
        return;
      }
      if (delBtn) {
        const note = state.data.notes.find(n => n.id === delBtn.dataset.del);
        if (!note) return;
        confirmAsk('Karte löschen?', `„${note.text}" wird gelöscht. Das lässt sich nicht rückgängig machen.`,
          async () => {
            const res = await window.BoardAPI.remove(note.id);
            if (!res || !res.ok) { toast(errText(res?.error), true); return; }
            toast('Gelöscht.');
            await load();
          });
      }
    });

    // Tabellen-Sortierung
    $('bdTable').addEventListener('click', ev => {
      const th = ev.target.closest('th[data-col]'); if (!th) return;
      const col = th.dataset.col;
      state.sort = (state.sort.col === col)
        ? { col, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' };
      render();
    });

    // Ansichts-Umschalter
    $('bdViewSwitch').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-view]'); if (!b) return;
      state.view = b.dataset.view;
      try { sessionStorage.setItem(VIEW_KEY, state.view); } catch (e) {}
      render();
    });

    // ── Admin-Leiste ──
    $('bdClusterSelect').addEventListener('change', async ev => {
      state.clusterId = ev.target.value;
      try { sessionStorage.setItem(CLUSTER_KEY, state.clusterId); } catch (e) {}
      state.lastSig = null;
      await load();
    });

    const setPhase = async p => {
      const res = await window.BoardAPI.setPhase(state.clusterId, p);
      if (!res || !res.ok) { toast(errText(res?.error), true); return; }
      toast(`Phase ${p} läuft.`);
      await load();
    };
    $('bdPhaseNext').addEventListener('click', () => setPhase(Math.min(3, phase() + 1)));
    $('bdPhasePrev').addEventListener('click', () => setPhase(Math.max(1, phase() - 1)));

    $('bdReset').addEventListener('click', () => {
      const n = state.data?.notes.length ?? 0;
      confirmAsk('Board zurücksetzen?',
        `Alle ${n} Karten dieses Kurses werden gelöscht und die Phase geht zurück auf 1. Das lässt sich nicht rückgängig machen.`,
        async () => {
          const res = await window.BoardAPI.reset(state.clusterId);
          if (!res || !res.ok) { toast(errText(res?.error), true); return; }
          toast(`Board geleert (${res.deleted} Karten).`);
          await load();
        });
    });

    // Zurückkehren an den Tab = sofort frisch, nicht erst beim nächsten Takt.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load({ quiet: true });
    });
  }

  /* ── Boot ────────────────────────────────────────────── */
  async function boot() {
    wire();

    try { state.view = sessionStorage.getItem(VIEW_KEY) || 'board'; } catch (e) {}

    if (!window.waitForSession) {
      showStatus('Der Session-Layer fehlt — lade die Seite neu.', true);
      return;
    }
    await window.waitForSession();

    const s = window.getSessionUser && window.getSessionUser();
    if (!s) {
      showStatus('Das Zukunftsboard gehört deinem Kurs — dafür musst du angemeldet sein.', true);
      return;
    }

    state.isAdmin = !!(s.is_admin || s.is_superadmin);

    if (state.isAdmin) {
      // Admins hängen in keinem oder in einem fremden Kurs — sie wählen
      // aus. Die Auswahl liegt im sessionStorage: auf einem geteilten
      // Gerät soll sie mit dem Tab verschwinden.
      state.clusters = await window.BoardAPI.listClusters();
      let saved = null;
      try { saved = sessionStorage.getItem(CLUSTER_KEY); } catch (e) {}
      const known = id => state.clusters.some(c => c.id === id);
      state.clusterId = (saved && known(saved)) ? saved
                      : (s.cluster_id && known(s.cluster_id)) ? s.cluster_id
                      : (state.clusters[0]?.id ?? null);
      if (!state.clusterId) {
        showStatus('Für deine Schule ist noch kein Kurs angelegt.', true);
        return;
      }
    }

    await load();
    setInterval(() => {
      if (document.visibilityState === 'visible') load({ quiet: true });
    }, POLL_MS);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
