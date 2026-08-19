/* ══════════════════════════════════════════════════════════════
   MPSkills — lib/preview.js   ·   Das Schaufenster
   ══════════════════════════════════════════════════════════════
   Eine Kachel im Reiter „Alle Skills" sagt bisher, wie ein Skill
   HEISST und wozu er da ist. Was dabei auf der Wand entsteht,
   sagt sie nicht — und genau das ist die Frage, die jemand hat,
   der überlegt, ob er damit eine Stunde macht.

   ── Warum kein Screenshot ─────────────────────────────────────
   Drei Gründe, und alle drei sind nicht ästhetisch:

   (1) Ein Bild kann keinen Darkmode. Seit dem 19.08.2026 hat die
       Seite zwei Fassungen; ein PNG steht in einer davon falsch
       da, und zwei PNGs pflegen heißt, beim nächsten Anfassen
       der Zettel eines zu vergessen.
   (2) Ein Bild veraltet still. Es liegt als Binärstand im Repo
       und niemand merkt, dass es einen Umbau nicht mitgemacht
       hat — anders als Code, der bricht.
   (3) Die Wolke IST Bewegung. Das Neuordnen beim Zustimmen ist
       das, was man zeigen will, und ein Standbild verschweigt es.

   ── Was hier stattdessen passiert ─────────────────────────────
   Es läuft das ECHTE Werkzeug. lib/tool.js gibt einem Werkzeug
   seine Umgebung als ctx mit — Handlungen, Toast, Nachladen —,
   und ein Werkzeug schreibt nie einen RPC-Namen hin. Also
   bekommt es hier ein ctx, dessen actions kein Serveraufruf
   sind, sondern eine Änderung an einem Blatt Papier: einer
   view, die im Speicher liegt.

   Folge: kein Netz, kein Token, kein Raum, keine Anmeldung —
   und trotzdem kann die Vorschau nicht anders aussehen als das
   Werkzeug, weil sie das Werkzeug IST. Ein Nachbau, der beim
   nächsten Umbau der Zettel stillschweigend veraltet, entsteht
   gar nicht erst.

   ── Was das Schaufenster NICHT tut ────────────────────────────
   Es fasst keine der Tabellen an und kennt keinen RPC. Wer hier
   etwas ergänzt und dabei einen Serveraufruf braucht, hat sich
   verlaufen: dann gehört es in den Raum und nicht in die
   Auslage.

   ── Wer was mitbringt ─────────────────────────────────────────
   Diese Datei ist generisch. Sie kennt das Schema der
   Inhaltsschicht (Migration 0080: entries mit payload, votes,
   hidden) und sonst nichts — was in payload steht, weiß nur das
   Werkzeug. Deshalb steht das Drehbuch je Skill in
   preview/<id>.js und meldet sich mit MPPreview.register an,
   genau wie ein Werkzeug sich bei MPTool anmeldet.

   Das Standbild für die Kachel kommt aus derselben Datei, ist
   aber bewusst ein LEICHTER Nachbau und nicht das Werkzeug: die
   Wolke skaliert ihre Tafel ins Fenster, und in einer 320 px
   breiten Kachel landeten die Zettel bei Maßstab 0,25. Matsch.
   Nachgebildet ist deshalb nur die ANORDNUNG — die stammt aus
   derselben Packlogik, einmal offline gerechnet —, die Wörter
   sind angedeutet. Lesbar wird es im Schaufenster.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const shows = {};          // toolId → Drehbuch
  const register = (id, show) => { shows[id] = show; };
  const has = id => !!shows[id];

  // Das Standbild für die Kachel. Kommt aus demselben Drehbuch,
  // ist aber ein leichter Nachbau — Begründung im Kopf dieser
  // Datei und in preview/wordcloud.js.
  const tileHTML = id => (shows[id]?.tile ? shows[id].tile() : '');

  /* ─── Laufender Zustand ─────────────────────────────────────
     Genau eine Vorstellung zur Zeit; das Modal ist eines. */
  let cur = null;   // { id, tool, view, host, stop, paused, seq }
  let seq = 0;      // Vorstellungs-Nummer, siehe alive()

  /* ═══════════════════════════════════════════════════════════
     Die gefälschten Handlungen
     ═══════════════════════════════════════════════════════════
     Das Gegenstück zu participantActions/presenterActions aus
     lib/tool.js: dieselbe Schnittstelle, dieselben Antwortformen
     ({ ok: true, … }), nur dass die Wirkung im Speicher bleibt.

     Generisch, weil das Schema es ist — skill_room_entries kennt
     payload, votes und hidden, ganz gleich welches Werkzeug
     darauf sitzt. Was IN payload steht, wird hier nirgends
     gelesen. */
  function fakeActions(getView, role) {
    let n = 0;
    const entries = () => (getView().entries || (getView().entries = []));
    const find    = id => entries().find(e => e.id === id) || null;

    return {
      role: role,

      upsert(payload, id) {
        const e = id ? find(id) : null;
        if (id && !e) return Promise.resolve({ ok: false, error: 'not_found' });

        if (e) {
          e.payload    = Object.assign({}, e.payload, payload);
          e.updated_at = new Date().toISOString();
          return Promise.resolve({ ok: true, updated: true, id: e.id });
        }

        const fresh = {
          id:         'pv-neu-' + (++n),
          payload:    Object.assign({}, payload),
          votes:      0,
          voted:      false,
          // Wer im Schaufenster schreibt, ist der Gast davor.
          is_mine:    true,
          by_teacher: role === 'presenter',
          hidden:     false,
          author:     'Du',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        entries().push(fresh);
        return Promise.resolve({ ok: true, updated: false, id: fresh.id });
      },

      remove(id) {
        const list = entries();
        const i = list.findIndex(e => e.id === id);
        if (i < 0) return Promise.resolve({ ok: false, error: 'not_found' });
        list.splice(i, 1);
        return Promise.resolve({ ok: true });
      },

      /* Die Antwort trägt votes und voted zurück — das Werkzeug
         übernimmt sie sofort in seinen Stand, statt auf den
         nächsten Takt zu warten (toggleLike in tool.js). Wer das
         hier weglässt, bekommt eine Karte, die erst beim übernächsten
         Zeichnen wächst. */
      vote(id) {
        const e = find(id);
        if (!e) return Promise.resolve({ ok: false, error: 'not_found' });
        if (e.is_mine) return Promise.resolve({ ok: false, error: 'own_entry' });
        e.voted = !e.voted;
        e.votes = Math.max(0, Number(e.votes || 0) + (e.voted ? 1 : -1));
        return Promise.resolve({ ok: true, votes: e.votes, voted: e.voted });
      },

      move(id, grp) {
        const e = find(id);
        if (!e) return Promise.resolve({ ok: false, error: 'not_found' });
        const key = getView()?.limits?.group_field || 'q';
        e.payload = Object.assign({}, e.payload, { [key]: grp });
        return Promise.resolve({ ok: true });
      },

      hide(id, on) {
        const e = find(id);
        if (!e) return Promise.resolve({ ok: false, error: 'not_found' });
        e.hidden = (on !== false);
        return Promise.resolve({ ok: true });
      },

      setPhase(p) {
        const v = getView();
        v.state = Object.assign({}, v.state, { phase: Number(p) || 1 });
        return Promise.resolve({ ok: true });
      },

      setData(obj) {
        const v = getView();
        v.state = Object.assign({}, v.state, {
          data: Object.assign({}, v.state?.data, obj)
        });
        return Promise.resolve({ ok: true });
      },

      reset() {
        getView().entries = [];
        return Promise.resolve({ ok: true });
      }
    };
  }

  /* ═══════════════════════════════════════════════════════════
     Das Drehbuch fahren
     ═══════════════════════════════════════════════════════════
     Die Schritte klicken mit ECHTEN Klick-Ereignissen in das
     Werkzeug hinein, statt seine Funktionen aufzurufen: nur so
     läuft wirklich das durch, was auch ein Finger auslöst —
     Doppeltipp-Erkennung, Formularprüfung, Toast. Ein Drehbuch,
     das stattdessen ctx.actions aufruft, zeigt ein Ergebnis, aber
     keine Bedienung.

     Der Preis ist eine Kopplung an ein paar DOM-Namen des
     Werkzeugs. Sie ist eingepreist und abgesichert: fehlt ein
     Knoten, bricht der Schritt still ab (siehe click/type) statt
     die Vorstellung mit einer Ausnahme zu beenden. */
  function makeApi() {
    const mySeq = seq;
    const alive = () => cur && cur.seq === mySeq;

    // Warten, das sich unterbrechen lässt — beim Schließen soll
    // eine laufende Vorstellung nicht noch zwei Sekunden
    // weiterlaufen und in ein abgeräumtes DOM greifen.
    function wait(ms) {
      return new Promise(res => {
        const t = setTimeout(res, ms);
        if (alive()) cur.timers.push(t);
      });
    }

    // Pause hält an der nächsten Wartestelle an, nicht mitten in
    // einem Schritt: ein halb getipptes Wort einzufrieren sähe
    // nach Absturz aus.
    async function gate() {
      while (alive() && cur.paused) await wait(120);
      return alive();
    }

    /* Ein Skill kann in einem <iframe> stecken statt im Wirt selbst —
       NeuroLab tut das, weil es eine gewachsene eigene Seite ist
       (Begründung in tools/NeuroLab/tool.js). Für das Drehbuch soll
       das kein Unterschied sein: es sagt weiter `#btn-run`, und hier
       steht, wo gesucht wird.

       Erst im Wirt, dann im Rahmen — nie umgekehrt: was das Werkzeug
       selbst gebaut hat, gehört ihm, und ein Rahmen darf es nicht
       überstimmen.

       Nur bei gleichem Ursprung. Fremde Rahmen gibt es hier nicht
       (alles liegt im selben Deployment), aber der try/catch steht
       da, damit ein künftiger doch nicht die ganze Vorstellung mit
       einer Ausnahme beendet — er ist dann eben nicht erreichbar. */
    function frameDoc() {
      if (!alive()) return null;
      const f = cur.host.querySelector('iframe');
      try { return (f && f.contentDocument) || null; } catch (e) { return null; }
    }

    const q = sel => {
      if (!alive()) return null;
      return cur.host.querySelector(sel) || frameDoc()?.querySelector(sel) || null;
    };

    function fire(el, type) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    }

    return {
      alive,
      async wait(ms) { await wait(ms); return gate(); },

      /* Warten, bis etwas da ist. Braucht, wer auf einen Rahmen
         zielt: der lädt eine eigene Seite, und bis die steht, gibt es
         nichts zu klicken. Ein Drehbuch, das stattdessen blind eine
         feste Zeit abwartet, ist auf einem langsamen Gerät zu früh
         und auf jedem anderen zu langsam. */
      async waitFor(sel, ms) {
        const until = Date.now() + (ms || 4000);
        while (alive() && Date.now() < until) {
          if (q(sel)) return gate();
          if (!await this.wait(120)) return false;
        }
        return false;
      },

      click(sel) {
        const el = q(sel);
        if (!el) return false;
        fire(el, 'click');
        return true;
      },

      // Zustimmen ist ein Doppeltipp — zwei Klicks innerhalb der
      // 260 ms, die tool.js abwartet. Genau derselbe Weg wie mit
      // dem Finger, inklusive 👍-Blase.
      async doubleTap(noteId) {
        const el = q(`[data-note="${noteId}"]`);
        if (!el) return false;
        fire(el, 'click');
        await wait(110);
        if (!alive()) return false;
        fire(el, 'click');
        return true;
      },

      /* Buchstabe für Buchstabe, mit input-Ereignis: das Werkzeug
         zählt die Zeichen mit und schaltet den Speichern-Knopf
         daran frei.

         Ohne focus() — das Werkzeug setzt den Cursor beim Öffnen
         des Formulars selbst, und ein zweites Mal hineinzugreifen
         hieße, auf einem Tablet womöglich die Bildschirmtastatur
         hochzuholen. Für den Text braucht es den Fokus nicht. */
      async type(sel, text) {
        const el = q(sel);
        if (!el) return false;
        el.value = '';
        for (const ch of String(text)) {
          if (!alive()) return false;
          el.value += ch;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(38);
        }
        return true;
      },

      /* Was steht da gerade? Für Drehbücher, die nicht nur klicken,
         sondern auf etwas warten wollen, das der Skill selbst
         ausrechnet — NeuroLab hält an, sobald der Verlust unten ist,
         statt eine Zahl Sekunden abzuwarten, die beim nächsten
         Rechner nicht mehr stimmt. Lesen, nicht deuten: was die
         Zeichenkette bedeutet, weiß nur das Drehbuch. */
      text(sel) {
        const el = q(sel);
        return el ? (el.textContent || '').trim() : null;
      },

      // Für Drehbücher, die eine Karte suchen wollen, ohne die
      // Zettel-IDs fest zu verdrahten.
      noteIds() {
        return alive()
          ? Array.from(cur.host.querySelectorAll('[data-note]')).map(el => el.dataset.note)
          : [];
      }
    };
  }

  async function runLoop(show, api) {
    /* Endlos, bis geschlossen wird. Zwischen zwei Durchgängen
       blendet die Bühne kurz ab: das Zurücksetzen entfernt drei
       Karten auf einmal, und das sieht mitten in der Bewegung nach
       Fehler aus statt nach Anfang.

       `fade: false` schaltet das ab — für Skills, die ihren Stand
       nicht aus der view beziehen und ihn deshalb im Drehbuch selbst
       zurückstellen (NeuroLab). Dort verschwindet nichts auf einmal,
       und eine Blende ohne Anlass sieht aus wie ein Aussetzer. */
    const fade = show.fade !== false;

    while (api.alive()) {
      try {
        await show.play(api);
        if (!api.alive()) return;

        const host = cur.host;
        if (fade) {
          host.classList.add('pv-fade');
          await api.wait(260);
          if (!api.alive()) return;
        }

        cur.view = show.view();
        cur.tool.update(cur.view);
        host.classList.remove('pv-fade');
        await api.wait(fade ? 240 : 400);
      } catch (e) {
        // Eine Vorschau, die sich verschluckt, wird still zur
        // Standanzeige — der Kasten bleibt, was darin liegt, ist
        // immer noch die Antwort auf „wie sieht das aus".
        console.warn('[mpskills] Vorschau abgebrochen:', e.message);
        if (cur) cur.host.classList.remove('pv-fade');
        return;
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Öffnen und Schließen
     ═══════════════════════════════════════════════════════════ */

  /* lib/tool.js liegt bewusst NICHT im HTML der Landing (siehe
     Kommentar dort): auf einer Seite, auf der kein Werkzeug läuft,
     hat der Lader nichts zu suchen. Er kommt deshalb erst, wenn
     jemand eine Kachel öffnet — und mit ihm, über MPTool.load,
     die 137 KB des Werkzeugs. Wer nur die Liste anschaut, lädt
     nichts davon. */
  function ensureLoader() {
    if (window.MPTool) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'lib/tool.js?v=20260819c';
      s.onload  = () => window.MPTool ? resolve() : reject(new Error('MPTool fehlt'));
      s.onerror = () => reject(new Error('lib/tool.js nicht gefunden'));
      document.head.appendChild(s);
    });
  }

  function setBusy(on, text) {
    const el = document.getElementById('pvBusy');
    if (!el) return;
    el.hidden = !on;
    if (text) el.textContent = text;
  }

  async function open(meta) {
    const show = shows[meta.id];
    if (!show) return;
    if (cur) close();

    const overlay = document.getElementById('previewModal');
    const host    = document.getElementById('pvHost');
    if (!overlay || !host) return;

    document.getElementById('pvTitle').textContent = meta.title || '';
    document.getElementById('pvBlurb').innerHTML   = show.blurb || '';

    /* Ein Werkzeug füllt den Kasten, eine ganze Anwendung braucht mehr
       (NeuroLab: Kopfleiste, fünf Spalten). Die Breite steht deshalb am
       Drehbuch und nicht als Regel im Stylesheet — sie hängt daran, was
       gezeigt wird. Immer gesetzt, nie nur hinzugefügt: der Kasten ist
       bei jedem Öffnen derselbe Knoten. */
    overlay.querySelector('.pv-modal')?.classList.toggle('pv-modal--wide', !!show.wide);
    // Und am Overlay selbst: die breite Auslage bekommt oben und unten
    // weniger Polster, damit die Anwendung darin ihre Höhe bekommt,
    // statt sich Rollbalken zu holen.
    overlay.classList.toggle('overlay--wide', !!show.wide);

    /* „+ Raum eröffnen" führt genau dorthin, wo es auch von der
       Kachel aus hinführt. Den Weg kennt app.js — hier steht nur,
       um welchen Skill es geht. */
    const openBtn = document.getElementById('pvOpen');
    if (openBtn) openBtn.dataset.tool = meta.id;

    /* Die Seite steht still, solange die Vorstellung läuft — und
       zwar ganz oben. Nicht aus Ordnungsliebe: das Werkzeug rechnet
       die Höhe seines Feldes aus window.innerHeight minus der
       Oberkante, und in die Oberkante geht scrollY ein (portHeight
       in tool.js). Auf einer Seite, die 800 px weit gescrollt ist,
       bliebe der Wolke die Mindesthöhe von 260 px. Hinter dem
       Overlay sieht den Sprung niemand; beim Schließen steht die
       Seite wieder da, wo sie stand. */
    const back = window.scrollY;
    window.scrollTo(0, 0);
    document.body.classList.add('pv-lock');

    overlay.hidden = false;

    cur = {
      id: meta.id, seq: ++seq, host, back,
      tool: null, view: null, timers: [], paused: false,
      abort: new AbortController()
    };
    const mySeq = cur.seq;

    setBusy(true, 'Vorschau wird geladen …');
    let tool;
    try {
      await ensureLoader();
      tool = await window.MPTool.load(meta.id, meta.folder || meta.id);
    } catch (e) {
      console.warn('[mpskills] Vorschau laden fehlgeschlagen:', e.message);
      setBusy(true, 'Die Vorschau lässt sich gerade nicht laden.');
      return;
    }
    // Zwischenzeitlich geschlossen? Dann nichts mehr aufbauen.
    if (!cur || cur.seq !== mySeq) return;
    setBusy(false);

    cur.tool = tool;
    cur.view = show.view();

    const ctx = window.MPTool.makeCtx({
      actions: fakeActions(() => cur && cur.view, show.role || 'participant'),
      title:   meta.title || '',
      /* „Du stehst in der Auslage und nicht in einer Stunde." Die
         meisten Werkzeuge interessiert das nicht — ihr ganzer Stand
         kommt aus der view, und die ist hier erfunden. Wer aber
         nebenher etwas auf dem Gerät ablegt, darf das hier nicht:
         NeuroLab merkt sich sein Netz im localStorage und bekäme
         sonst das halbfertige von gestern zu sehen — und ließe das
         Drehbuch darüber schreiben. */
      preview: true,
      toast:   (m, err) => window.toast?.(m, err ? 'err' : ''),
      // Im Schaufenster fragt niemand nach: eine Rückfrage, die
      // niemand beantwortet, hielte das Drehbuch an.
      confirm: () => Promise.resolve(true),
      refresh: () => { if (cur && cur.seq === mySeq) cur.tool.update(cur.view); }
    });

    host.innerHTML = '';
    tool.mount(host, ctx);
    tool.update(cur.view);
    // Das Werkzeug misst beim Zeichnen; ein Takt später steht das
    // Modal sicher an seinem Platz.
    setTimeout(() => window.dispatchEvent(new Event('resize')), 0);

    /* Wer Bewegung abbestellt hat, bekommt keine — aber auch keinen
       leeren Kasten: die Wolke steht da, und der Knopf daneben
       startet sie auf Wunsch. */
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    cur.paused = !!reduced;
    syncPlayBtn();

    /* Wer selbst hineingreift, hat das Zusehen beendet — dann hält
       das Drehbuch an, statt ihm eine halb getippte Karte unter den
       Fingern wegzuräumen. Die Vorschau ist keine Aufzeichnung: sie
       lässt sich bedienen, und das darf man merken.

       isTrusted trennt den Finger vom Regisseur — dessen Klicks
       sind synthetisch und dürfen sich nicht selbst anhalten. */
    function grabbed(ev) {
      if (!ev.isTrusted || !cur || cur.seq !== mySeq || cur.paused) return;
      cur.paused = true;
      syncPlayBtn();
      // Der Knopf sagt es schon („▶ Abspielen"), aber nicht laut
      // genug für jemanden, der gerade woanders hingesehen hat.
      window.toast?.('Angehalten — probier es selbst aus.');
    }
    // Über den Abbruch abgemeldet und nicht von Hand: die Bühne ist
    // bei jedem Öffnen derselbe Knoten, ein zweiter Besuch hinge
    // sonst einen zweiten Zuhörer daran.
    host.addEventListener('pointerdown', grabbed, { signal: cur.abort.signal });

    /* ⚠️ Ein <iframe> verschluckt die Finger: was darin passiert,
       steigt nicht in den Wirt auf. Ohne diese zweite Anmeldung
       liefe das Drehbuch bei NeuroLab munter weiter, während jemand
       es selbst bedient — und schaltete ihm alle zwei Sekunden die
       Phase um.

       Beim `load` und nicht nur sofort: bis die Seite im Rahmen
       steht, ist sein Dokument ein anderes (about:blank), und der
       Zuhörer hinge am falschen. Beides, weil ein aus dem Cache
       geholter Rahmen schon fertig sein kann, bevor wir hier
       ankommen. */
    const fr = host.querySelector('iframe');
    if (fr) {
      const listen = () => {
        try { fr.contentDocument?.addEventListener('pointerdown', grabbed, { signal: cur.abort.signal }); }
        catch (e) { /* fremder Ursprung — dann eben nicht */ }
      };
      fr.addEventListener('load', listen, { signal: cur.abort.signal });
      listen();
    }

    runLoop(show, makeApi());
  }

  function syncPlayBtn() {
    const b = document.getElementById('pvPlay');
    if (!b || !cur) return;
    b.textContent = cur.paused ? '▶ Abspielen' : '❙❙ Pause';
    b.setAttribute('aria-pressed', String(!cur.paused));
  }

  function togglePlay() {
    if (!cur) return;
    cur.paused = !cur.paused;
    syncPlayBtn();
  }

  function close() {
    const overlay = document.getElementById('previewModal');
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('pv-lock');

    if (!cur) return;
    for (const t of cur.timers) clearTimeout(t);
    cur.abort.abort();

    // unmount räumt die Listener des Werkzeugs ab; das Leeren ist
    // laut lib/tool.js Sache des Aufrufers.
    try { cur.tool?.unmount(); } catch (e) { /* egal, es geht weg */ }
    cur.host.innerHTML = '';
    cur.host.classList.remove('pv-fade');

    const back = cur.back;
    cur = null;
    window.scrollTo(0, back);
  }

  /* ─── Bedienung ─────────────────────────────────────────────
     Delegiert am document, weil der Inhalt des Modals bei jedem
     Öffnen neu geschrieben wird. */
  document.addEventListener('click', ev => {
    if (ev.target.closest('#pvPlay'))  { togglePlay(); return; }
    if (ev.target.closest('[data-close="previewModal"]')) { close(); return; }
    // Klick auf den Grund neben dem Kasten schließt — wie bei den
    // anderen Overlays der Seite.
    if (ev.target.id === 'previewModal') close();
  });

  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || !cur) return;
    /* Nur, wenn das Werkzeug nicht selbst gerade ein Fenster offen
       hat — sonst schlösse ein Escape beides auf einmal. Das
       Werkzeug hört auf dasselbe Ereignis. */
    if (cur.host.querySelector('.bd-modal-backdrop:not([hidden])')) return;
    close();
  });

  window.MPPreview = { register, has, tileHTML, open, close };
})();
