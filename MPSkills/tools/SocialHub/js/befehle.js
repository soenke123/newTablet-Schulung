/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/befehle.js   ·   Befehle speichern (0280)
   ══════════════════════════════════════════════════════════════
   Ergebnissicherung im Reiter SQL: neben „Ausführen“ steht
   „Befehl speichern“ (Aufgabe + SQL) und ein Symbol für die
   gespeicherten Befehle (großes Fenster, zwei Spalten, Stift =
   bearbeiten, Mülltonne = löschen, am Griff ziehen = sortieren).

   Schüler haben an jedem Befehl „Teilen“ → die Lehrkraft bekommt
   eine KOPIE in den Reiter „Geteilt“ („Aufgabe 1b von Mia“), kann
   sie in den Editor übernehmen, kopieren und wieder löschen.

   Bewusst ohne Bezug zum Netzwerk: wer es benutzt, gibt nur
     SHCmds.mount(barEl, { call(name, args) → Promise, getSql(), setSql(sql), toast, errText })
   mit; call bekommt die kurzen Namen list/save/delete/order/share/
   inbox_delete (hier → sh_cmd_*). So lässt es sich auch in anderen
   SQL-Skills einbauen.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const IC = {
    save:  '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/></svg>',
    list:  '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>',
    pen:   '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    grip:  '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/></svg>',
    use:   '<svg viewBox="0 0 24 24"><path d="M5 12h12M12 6l6 6-6 6"/></svg>',
    copy:  '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    x:     '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>'
  };

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(() => true, () => copyOld(t));
    }
    return Promise.resolve(copyOld(t));
  }
  function copyOld(t) {
    const ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* egal */ }
    ta.remove();
    return ok;
  }

  function mount(bar, o) {
    const toast = o.toast || (() => {});
    const errText = o.errText || (r => (r && (r.message || r.error)) || 'Das hat nicht geklappt.');
    let teacher = false, own = [], inbox = [], seen = 0, win = null, tab = 'own';

    bar.classList.add('cmd-bar');
    bar.innerHTML =
      '<button type="button" class="btn btn--ghost btn--s cmd-save" data-cmd="save" title="Aufgabe und Befehl speichern">' + IC.save + '<span>Befehl speichern</span></button>' +
      '<button type="button" class="cmd-open" data-cmd="open" title="Gespeicherte Befehle">' + IC.list + '<b class="cmd-badge" hidden></b></button>';
    bar.querySelector('[data-cmd="save"]').onclick = () => editDialog(null);
    bar.querySelector('[data-cmd="open"]').onclick = () => openWin();

    async function load() {
      const r = await o.call('list', {});
      if (!r || !r.ok) return r;
      teacher = !!r.teacher;
      own = r.own || [];
      inbox = r.inbox || [];
      badge();
      return r;
    }
    // Lehrkraft: rote Zahl = neue geteilte Befehle seit dem letzten Blick
    function badge() {
      const b = bar.querySelector('.cmd-badge');
      const n = teacher ? Math.max(0, inbox.length - seen) : 0;
      b.hidden = !n;
      b.textContent = n > 99 ? '99+' : String(n);
    }
    let first = true;
    async function poll() {
      const before = JSON.stringify([own, inbox]);
      const r = await load();
      if (first && r && r.ok) { first = false; seen = inbox.length; badge(); }
      if (win && JSON.stringify([own, inbox]) !== before) paintWin();
    }
    poll();
    const timer = setInterval(() => {
      if (teacher && document.visibilityState === 'visible' && bar.isConnected) poll();
    }, 20000);

    /* ── Speichern / Bearbeiten ─────────────────────────────── */
    function editDialog(item) {
      const sql = item ? item.sql : String(o.getSql() || '').replace(/\s+$/, '');
      const el = document.createElement('div');
      el.className = 'dlg-back cmd-dlg-back';
      el.innerHTML = '<form class="dlg cmd-dlg" role="dialog">' +
        '<h3>' + (item ? 'Befehl bearbeiten' : 'Befehl speichern') + '</h3>' +
        '<label class="cmd-lbl">Aufgabe<input type="text" name="task" maxlength="60" autocomplete="off" placeholder="z. B. Aufgabe 1b" value="' + esc(item ? item.task : '') + '"></label>' +
        '<label class="cmd-lbl">SQL-Befehl<textarea name="sql" rows="7" spellcheck="false" autocapitalize="off" autocorrect="off">' + esc(sql) + '</textarea></label>' +
        '<p class="cmd-err" hidden></p>' +
        '<div class="dlg-acts"><button type="button" class="btn btn--ghost" data-x>Abbrechen</button>' +
        '<button type="submit" class="btn btn--accent">' + (item ? 'Ändern' : 'Speichern') + '</button></div></form>';
      document.body.appendChild(el);
      const f = el.querySelector('form');
      const close = () => el.remove();
      el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-x]')) close(); });
      setTimeout(() => f.task.focus(), 30);
      f.onsubmit = async (e) => {
        e.preventDefault();
        const err = el.querySelector('.cmd-err');
        const s = f.sql.value.replace(/\s+$/, '');
        if (!s.trim()) { err.hidden = false; err.textContent = 'Der Befehl ist leer.'; return; }
        const btn = f.querySelector('[type="submit"]');
        btn.disabled = true;
        const r = await o.call('save', { p_id: item ? item.id : null, p_task: f.task.value.trim(), p_sql: s });
        btn.disabled = false;
        if (!r || !r.ok) { err.hidden = false; err.textContent = errText(r); return; }
        const i = item ? own.findIndex(x => x.id === item.id) : -1;
        if (i >= 0) own[i] = r.item; else if (!item) own.push(r.item);
        close();
        toast(item ? 'Geändert' : 'Befehl gespeichert');
        if (win) paintWin();
      };
    }

    /* ── Fenster mit allen Befehlen ─────────────────────────── */
    async function openWin() {
      if (win) return;
      win = document.createElement('div');
      win.className = 'dlg-back cmd-win-back';
      win.innerHTML = '<div class="cmd-win" role="dialog"><header class="cmd-win-h"><h3>Gespeicherte Befehle</h3>' +
        '<nav class="cmd-tabs" hidden></nav><span class="cmd-sp"></span>' +
        '<button type="button" class="icon-btn icon-btn--s" data-close title="Schließen">' + IC.x + '</button></header>' +
        '<div class="cmd-body"><p class="muted">lädt …</p></div></div>';
      document.body.appendChild(win);
      win.addEventListener('click', e => { if (e.target === win || e.target.closest('[data-close]')) closeWin(); });
      document.addEventListener('keydown', onKey);
      const had = !first;
      if (had) paintWin();
      const before = JSON.stringify([own, inbox]);
      const r = await load();
      if (!win) return;
      if (!r || !r.ok) { win.querySelector('.cmd-body').innerHTML = '<p class="cmd-err">' + esc(errText(r)) + '</p>'; return; }
      // nur neu zeichnen, wenn sich etwas geändert hat (sonst flackert es, und Knöpfe verschwinden unter dem Finger)
      if (!had || JSON.stringify([own, inbox]) !== before) paintWin();
    }
    function onKey(e) { if (e.key === 'Escape' && win && !document.querySelector('.cmd-dlg-back')) closeWin(); }
    function closeWin() {
      if (!win) return;
      win.remove(); win = null;
      document.removeEventListener('keydown', onKey);
    }

    function paintWin() {
      if (!win) return;
      if (teacher && tab === 'inbox') { seen = inbox.length; badge(); }
      const nav = win.querySelector('.cmd-tabs');
      nav.hidden = !teacher;
      if (teacher) {
        const fresh = Math.max(0, inbox.length - seen);
        nav.innerHTML = '<button type="button" data-tab="own" class="' + (tab === 'own' ? 'on' : '') + '">Eigene <span>' + own.length + '</span></button>' +
          '<button type="button" data-tab="inbox" class="' + (tab === 'inbox' ? 'on' : '') + '">Geteilt <span' + (fresh ? ' class="new"' : '') + '>' + inbox.length + '</span></button>';
        nav.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; paintWin(); });
      } else tab = 'own';
      const body = win.querySelector('.cmd-body');
      const top = body.scrollTop;
      if (tab === 'inbox') paintInbox(body); else paintOwn(body);
      body.scrollTop = top;
    }

    function sqlHtml(s) { return '<pre class="cmd-sql">' + esc(s) + '</pre>'; }
    function useBtns() {
      return '<button type="button" class="btn btn--ghost btn--s" data-a="use">' + IC.use + 'In den Editor</button>' +
             '<button type="button" class="btn btn--ghost btn--s" data-a="copy">' + IC.copy + 'Kopieren</button>';
    }

    function paintOwn(body) {
      if (!own.length) {
        body.innerHTML = '<div class="cmd-empty">' + IC.save + '<p>Noch keine Befehle gespeichert.</p>' +
          '<p class="small">Schreib einen Befehl und tippe oben auf „Befehl speichern“. Davor kommt die Aufgabe, z. B. „Aufgabe 1b“.</p></div>';
        return;
      }
      body.innerHTML = '<div class="cmd-grid">' + own.map(c =>
        '<article class="cmd-card" data-id="' + c.id + '">' +
          '<div class="cmd-card-h"><span class="cmd-grip" title="Ziehen zum Sortieren">' + IC.grip + '</span>' +
          '<b class="cmd-task' + (c.task ? '' : ' none') + '">' + esc(c.task || 'ohne Aufgabe') + '</b>' +
          (teacher ? '' : '<button type="button" class="btn btn--ghost btn--s cmd-share" data-a="share" title="Kopie an die Lehrkraft schicken">' + IC.share + 'Teilen</button>') +
          '<button type="button" class="icon-btn icon-btn--s" data-a="edit" title="Bearbeiten">' + IC.pen + '</button>' +
          '<button type="button" class="icon-btn icon-btn--s icon-btn--bad" data-a="del" title="Löschen">' + IC.trash + '</button></div>' +
          sqlHtml(c.sql) +
          '<div class="cmd-card-f">' + useBtns() + '</div>' +
        '</article>').join('') + '</div>';
      body.querySelectorAll('.cmd-card').forEach(card => {
        // erst beim Antippen nachschlagen: load() kann die Liste inzwischen ersetzt haben
        card.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b, own.find(x => String(x.id) === card.dataset.id), false));
        dragable(card, body);
      });
    }

    function paintInbox(body) {
      if (!inbox.length) {
        body.innerHTML = '<div class="cmd-empty">' + IC.share + '<p>Noch nichts geteilt.</p>' +
          '<p class="small">Schüler schicken hier über „Teilen“ eine Kopie ihres Befehls hin – zum Besprechen der Aufgaben.</p></div>';
        return;
      }
      body.innerHTML = '<div class="cmd-inbar"><span class="muted small">Nur Kopien – Löschen ändert bei den Schülern nichts.</span>' +
        '<button type="button" class="btn btn--ghost btn--s" data-a="clear">' + IC.trash + 'Alle löschen</button></div>' +
        '<div class="cmd-grid">' + inbox.map(c =>
        '<article class="cmd-card cmd-card--in" data-id="' + c.id + '">' +
          '<div class="cmd-card-h"><b class="cmd-task">' + (c.task ? esc(c.task) + ' ' : '') + '<span class="cmd-from">von ' + esc(c.from || c.username || '?') + '</span></b>' +
          '<button type="button" class="icon-btn icon-btn--s icon-btn--bad" data-a="del" title="Löschen">' + IC.trash + '</button></div>' +
          '<div class="cmd-meta">' + (c.username ? '@' + esc(c.username) + ' · ' : '') + esc(c.hub || '') + (c.at ? ' · ' + esc(c.at) : '') + '</div>' +
          sqlHtml(c.sql) +
          '<div class="cmd-card-f">' + useBtns() + '</div>' +
        '</article>').join('') + '</div>';
      body.querySelector('[data-a="clear"]').onclick = (e) => confirmBtn(e.currentTarget, 'Wirklich alle?', async () => {
        const r = await o.call('inbox_delete', { p_id: null });
        if (!r || !r.ok) { toast(errText(r)); return; }
        inbox = []; seen = 0; paintWin();
      });
      body.querySelectorAll('.cmd-card').forEach(card => {
        card.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b, inbox.find(x => String(x.id) === card.dataset.id), true));
      });
    }

    // zweimal tippen statt Rückfrage-Fenster: erst „Löschen?“, dann weg
    function confirmBtn(btn, label, fn) {
      if (btn.classList.contains('is-sure')) { fn(); return; }
      btn.classList.add('is-sure');
      const old = btn.innerHTML;
      btn.innerHTML = IC.check + '<span>' + esc(label) + '</span>';
      setTimeout(() => { if (btn.isConnected) { btn.classList.remove('is-sure'); btn.innerHTML = old; } }, 3000);
    }

    async function act(btn, c, isInbox) {
      if (!c) return;
      const a = btn.dataset.a;
      if (a === 'use') {
        o.setSql(c.sql);
        closeWin();
        toast('Im Editor – jetzt „Ausführen“');
      } else if (a === 'copy') {
        const ok = await copyText(c.sql);
        toast(ok ? 'Kopiert' : 'Kopieren ging nicht – markieren und Strg + C');
      } else if (a === 'edit') {
        editDialog(c);
      } else if (a === 'del') {
        confirmBtn(btn, 'Löschen?', async () => {
          const r = await o.call(isInbox ? 'inbox_delete' : 'delete', { p_id: c.id });
          if (!r || !r.ok) { toast(errText(r)); return; }
          if (isInbox) { inbox = inbox.filter(x => x.id !== c.id); seen = Math.max(0, seen - 1); }
          else own = own.filter(x => x.id !== c.id);
          paintWin();
        });
      } else if (a === 'share') {
        btn.disabled = true;
        const r = await o.call('share', { p_id: c.id });
        btn.disabled = false;
        if (!r || !r.ok) { toast(errText(r)); return; }
        btn.classList.add('is-done');
        btn.innerHTML = IC.check + 'Geteilt';
        toast('An die Lehrkraft geschickt');
      }
    }

    /* ── Sortieren per Drag & Drop (Zeiger-Events, geht am Tablet) ── */
    function dragable(card, body) {
      const grip = card.querySelector('.cmd-grip');
      grip.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        e.preventDefault();
        const grid = card.parentNode;
        const startOrder = [...grid.children].map(x => x.dataset.id).join();
        card.classList.add('is-drag');
        grid.classList.add('is-sorting');
        // am Fenster horchen: das Umhängen der Karte im DOM löst die Zeiger-Bindung am Griff
        const pid = e.pointerId;
        let lastY = e.clientY, raf = 0;
        const scroll = () => {
          const r = body.getBoundingClientRect();
          if (lastY < r.top + 50) body.scrollTop -= 12;
          else if (lastY > r.bottom - 50) body.scrollTop += 12;
          raf = requestAnimationFrame(scroll);
        };
        raf = requestAnimationFrame(scroll);
        const move = (ev) => {
          if (ev.pointerId !== pid) return;
          ev.preventDefault();
          lastY = ev.clientY;
          const hit = document.elementFromPoint(ev.clientX, ev.clientY);
          const over = hit && hit.closest('.cmd-card');
          if (!over || over === card || over.parentNode !== grid) return;
          const list = [...grid.children];
          const from = list.indexOf(card), to = list.indexOf(over);
          grid.insertBefore(card, from < to ? over.nextSibling : over);
        };
        const up = async (ev) => {
          if (ev.pointerId !== pid) return;
          cancelAnimationFrame(raf);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          card.classList.remove('is-drag');
          grid.classList.remove('is-sorting');
          const ids = [...grid.children].map(x => x.dataset.id);
          if (ids.join() === startOrder) return;
          own.sort((a, b) => ids.indexOf(String(a.id)) - ids.indexOf(String(b.id)));
          const r = await o.call('order', { p_ids: ids.map(Number) });
          if (!r || !r.ok) { toast(errText(r)); load().then(paintWin); }
        };
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
    }

    return {
      destroy() { clearInterval(timer); closeWin(); }
    };
  }

  window.SHCmds = { mount };
})();
