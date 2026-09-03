/* ══════════════════════════════════════════════════════════════
   MPSkills — lib/tool.js   ·   Was ein Werkzeug ist
   ══════════════════════════════════════════════════════════════
   Damit die Sammlung wachsen kann, muss „ein Werkzeug hinzufügen"
   klein bleiben. Deshalb steht hier fest, was ein Werkzeug vom
   System bekommt und was es selbst mitbringt (Konzept Abschnitt
   10).

   ── Das System stellt ─────────────────────────────────────────
   Raum, Code, QR, Beitritt, Teilnehmerliste, Aktualisierung,
   Zustand der Lehrkraft, Beiträge, Zustimmung, Moderation,
   Ablauf. Und diese Datei: das Laden, den Kontext und die
   Handlungen.

   ── Das Werkzeug bringt ───────────────────────────────────────
   Einen Ordner mit genau zwei Dateien — tools/<ordner>/tool.js
   und tool.css — und die Bedeutung dessen, was in payload steht.

   ── Ein Werkzeug, zwei Rollen, EIN Modul ──────────────────────
   Die Wolke läuft auf dem Schülertablet und am Beamer. Das ist
   dasselbe Werkzeug in zwei Rollen und nicht zweimal dasselbe
   Werkzeug: ctx.role sagt, wo man ist, und ctx.actions führt in
   beiden Fällen zum richtigen Serveraufruf.

   Zwei getrennte Seiten je Werkzeug wären die Alternative
   gewesen. Sie dupliziert Poller, Fehlerbilder und
   Zustandsverwaltung je Werkzeug — beim dritten wird das teuer,
   und spätestens dann laufen Beamer und Tablet auseinander.

   ── Der Lebenslauf eines Werkzeugs ────────────────────────────
     mount(el, ctx)   einmal. Baut sein DOM in el.
     update(view)     bei jeder Änderung. view ist die Antwort von
                      skill_view bzw. skill_room_get — dieselben
                      Felder, nur role unterscheidet sich.
     unmount()        beim Verlassen. Räumt eigene Listener ab;
                      el wird vom Aufrufer geleert.

   Es gibt bewusst KEIN render() von außen und keinen
   Zustandsspeicher hier: was das Werkzeug zwischen zwei update()
   behalten will, behält es selbst.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const registry = {};   // id → impl
  const loading  = {};   // id → Promise

  /* ─── Anmelden ──────────────────────────────────────────── */
  // Ruft das Werkzeug selbst am Ende seiner tool.js auf.
  function register(id, impl) {
    if (!id || !impl || typeof impl.mount !== 'function') {
      console.error('[mpskills] Werkzeug "%s" meldet sich unvollständig an.', id);
      return;
    }
    registry[id] = impl;
  }

  const get = (id) => registry[id] || null;

  /* ─── Laden ─────────────────────────────────────────────── */
  // Zwei Dateien, fester Ort. Kein Bündler, kein Modulsystem —
  // dieselbe Bauweise wie der Rest des Projekts.
  //
  // Der Ordnername kommt aus der Registry (skill_tools.folder) und
  // nicht aus der ID: so lässt sich ein Werkzeug umbenennen, ohne
  // dass bestehende Räume ihre tool_id verlieren.
  function load(id, folder) {
    if (registry[id]) return Promise.resolve(registry[id]);
    if (loading[id])  return loading[id];

    const dir = 'tools/' + (folder || id) + '/';
    /* Cache-Stempel wie bei den Seiten-Skripten. Ohne ihn behält ein
       Gerät, das ein Werkzeug schon einmal geladen hat, dessen altes
       CSS — beim Umbau auf hell/dunkel (19.08.2026) wäre die halbe
       Kachel im alten Kleid stehengeblieben.

       ⚠️ DIESE ZEILE GEHÖRT ZU JEDER ÄNDERUNG AN EINER tool.js ODER
       tool.css. Wird sie vergessen, läuft auf dem Tablet weiter das
       alte Werkzeug gegen die neue Datenbank — und das sieht nicht aus
       wie ein alter Stand, sondern wie ein Fehler: beim Einzug der
       Terme (0115) stand die getippte Variable in Versalien da, die
       Hochzahl als „^" und die Hochzahl-Taste tat nichts, weil das
       Gerät noch die tool.js von davor hatte. */
    const v = '?v=20260903c';

    loading[id] = new Promise((resolve, reject) => {
      // Das Stylesheet wird nicht abgewartet: ein Werkzeug, das auf
      // sein CSS wartet, startet auf einer langsamen Verbindung gar
      // nicht. Ungestylt und da ist besser als schön und zu spät.
      if (!document.querySelector(`link[data-tool="${id}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = dir + 'tool.css' + v;
        link.dataset.tool = id;
        document.head.appendChild(link);
      }

      const s = document.createElement('script');
      s.src = dir + 'tool.js' + v;
      s.async = false;
      s.onload = () => {
        if (registry[id]) resolve(registry[id]);
        // Skript geladen, aber niemand hat sich angemeldet: fast
        // immer ein Tippfehler in der ID. Die Meldung nennt beide
        // Seiten, sonst sucht man an der falschen.
        else reject(new Error(`Werkzeug "${id}" hat sich nach dem Laden von ${dir}tool.js nicht angemeldet.`));
      };
      s.onerror = () => reject(new Error(`Werkzeug "${id}" nicht gefunden (${dir}tool.js).`));
      document.head.appendChild(s);
    });

    // Fehlschlag nicht festhalten: beim nächsten Betreten des Raums
    // darf es noch einmal versucht werden (typisch: WLAN weg).
    loading[id] = loading[id].catch(err => { delete loading[id]; throw err; });
    return loading[id];
  }

  /* ─── Handlungen ────────────────────────────────────────────
     Das eigentliche Stück Arbeit dieser Datei. Ein Werkzeug
     schreibt NIE einen RPC-Namen hin — es sagt, was es will, und
     hier steht, wie das in der jeweiligen Rolle heißt.

     Genau daran hängt, dass ein Werkzeug ein Modul bleibt: sonst
     stünde in jeder tool.js eine Weiche zwischen Token und Code,
     und die zweite davon wäre falsch.

     Alle Antworten kommen im Repo-Standard { ok: true, … } bzw.
     { ok: false, error: '…' }; Netzfehler werden hier in dasselbe
     Format übersetzt, damit das Werkzeug nur einen Fall kennt. */

  async function safe(promise) {
    try {
      const r = await promise;
      return (r && typeof r === 'object') ? r : { ok: false, error: 'bad_response' };
    } catch (e) {
      console.warn('[mpskills] Aufruf fehlgeschlagen:', e.message);
      return { ok: false, error: 'network' };
    }
  }

  // Schülerseite: alles hängt am Token, nichts an einer Raum-ID.
  // Das ist Regel 2 des Sicherheitsmodells und nicht Bequemlichkeit
  // — eine Raum-ID gibt es hier gar nicht zu übergeben.
  function participantActions(token) {
    const rpc = (fn, args) => safe(window.MPRoom.rpc(fn, Object.assign({ p_token: token }, args)));
    return {
      role: 'participant',
      upsert: (payload, id, kind) =>
        rpc('skill_entry_upsert', { p_payload: payload, p_id: id ?? null, p_kind: kind || 'entry' }),
      remove: (id)   => rpc('skill_entry_delete', { p_id: id }),
      vote:   (id)   => rpc('skill_vote_toggle',  { p_entry: id }),
      // Durchreiche für Werkzeuge mit eigenen RPC-Namen (z.B. Clash of
      // Math): dieselbe Token-Bindung wie die Verben oben, nur ohne
      // dass diese Datei den Namen kennen müsste. Ein Werkzeug, das
      // nicht in die feste Verben-Liste der generischen Inhaltsschicht
      // passt, braucht sonst einen zweiten Weg zum Server — und der
      // wäre am Ende falsch.
      call: (fn, args) => rpc(fn, args),

      // Was nur die Lehrkraft kann, sagt hier ehrlich Nein — statt
      // still nichts zu tun. Ein Werkzeug soll den Knopf gar nicht
      // erst anbieten, aber wenn doch, ist eine Meldung besser als
      // ein toter Klick.
      move:     () => Promise.resolve({ ok: false, error: 'not_allowed' }),
      hide:     () => Promise.resolve({ ok: false, error: 'not_allowed' }),
      setPhase: () => Promise.resolve({ ok: false, error: 'not_allowed' }),
      setData:  () => Promise.resolve({ ok: false, error: 'not_allowed' }),
      reset:    () => Promise.resolve({ ok: false, error: 'not_allowed' })
    };
  }

  // Beamer-Seite: angemeldet, alles hängt am Code des eigenen
  // Raums. `call` wird von der Seite hereingereicht, weil sie den
  // Access-Token bei JEDEM Aufruf frisch lesen muss (siehe
  // lehrer.js) — eine hier festgehaltene Kopie wäre nach einer
  // Stunde tot, und die Beamer-Ansicht steht länger.
  function presenterActions(code, call) {
    const rpc = (fn, args) => safe(call(fn, Object.assign({ p_code: code }, args)));
    return {
      role: 'presenter',
      // Die Lehrkraft legt an und löscht ihr Eigenes; ändern kann
      // sie es nicht. Bewusst so klein gehalten: ein zweiter
      // Schreibweg auf fremden Inhalt wäre Moderation durch die
      // Hintertür, und dafür gibt es hide().
      upsert: (payload, id, kind) => id
        ? Promise.resolve({ ok: false, error: 'not_editable' })
        : rpc('skill_room_entry_add', { p_payload: payload, p_kind: kind || 'entry' }),
      remove:   (id)      => rpc('skill_room_entry_delete', { p_id: id }),

      /* Zustimmen darf sie seit 0087 auch. Die Entscheidung von 0080
         („die Lehrkraft moderiert und wiegt nicht auf") galt einer
         Auswertung, die es nicht gibt: an den Stimmen hängt keine
         Note, sie ordnen die Anzeige. Wer vorne steht und mitredet,
         hat dazu eine Meinung wie alle — eine Stimme unter vielen. */
      vote:     (id)      => rpc('skill_room_vote_toggle', { p_entry: id }),

      /* Sortieren statt löschen: ein Beitrag im falschen Fach behält
         beim Verschieben seine Zustimmungen. Ihn löschen und neu
         schreiben zu lassen, wärfe genau das weg, was der Kurs daran
         getan hat. Welcher payload-Schlüssel die Gruppe trägt, weiß
         der Server aus skill_tools.limits — hier steht nur ihr Name. */
      move:     (id, grp) => rpc('skill_room_entry_move', { p_id: id, p_group: grp }),
      hide:     (id, on)  => rpc('skill_room_entry_hide', { p_id: id, p_hidden: on !== false }),
      setPhase: (n)       => rpc('skill_room_set_state', { p_phase: n }),
      setData:  (obj)     => rpc('skill_room_set_state', { p_data: obj }),
      reset:    ()        => rpc('skill_room_reset', {}),
      // Dasselbe Ventil wie bei participantActions, nur mit p_code
      // statt p_token gebunden.
      call:     (fn, args) => rpc(fn, args)
    };
  }

  /* ─── Fehlertexte ───────────────────────────────────────────
     Die Fehler der generischen Schicht — jedes Werkzeug erbt sie,
     keines schreibt sie ab. Werkzeug-eigene Fälle ergänzt das
     Werkzeug selbst über ctx.errText.own. */
  const ERRORS = {
    unknown_token:   'Dieser Raum gehört nicht mehr zu diesem Gerät. Lade die Seite neu.',
    room_gone:       'Diesen Raum gibt es nicht mehr.',
    not_found:       'Das gibt es nicht (mehr).',
    phase_locked:    'Dafür ist die Zeit vorbei — jetzt wird nur noch besprochen.',
    quota_exceeded:  'Du hast schon alles geschrieben, was du darfst.',
    invalid_input:   'Damit stimmt etwas nicht.',
    payload_too_big: 'Das ist zu viel auf einmal.',
    votes_disabled:  'Hier wird nicht abgestimmt.',
    group_unknown:   'Dieses Fach gibt es nicht mehr.',
    own_entry:       'Deinem eigenen Beitrag kannst du nicht zustimmen.',
    text_blocked:    'Solche Wörter bitte nicht. Schreib es anders.',
    blocked:         'Deine Lehrkraft hat dieses Tablet gerade stillgelegt.',
    not_allowed:     'Das darfst du hier nicht.',
    not_editable:    'Das lässt sich nicht mehr ändern — nur löschen und neu schreiben.',
    not_deletable:   'Das kannst du nicht löschen. Blende es aus, wenn es stören soll.',
    phase_invalid:   'Diese Phase gibt es hier nicht.',
    not_authenticated: 'Du bist nicht mehr angemeldet. Lade die Seite neu.',
    bad_response:    'Der Server hat unverständlich geantwortet.',
    network:         'Keine Verbindung. Gleich noch einmal versuchen.'
  };

  function errText(code, own) {
    return (own && own[code]) || ERRORS[code] || `Unerwarteter Fehler (${code}).`;
  }

  /* ─── Kontext bauen ─────────────────────────────────────────
     Das Bündel, das ein Werkzeug bei mount() bekommt. Alles, was
     es über seine Umgebung wissen darf — und nichts darüber
     hinaus: weder den Token noch den Raum-Code noch den
     Access-Token. Braucht es nicht; die Handlungen tragen das
     schon in sich.                                              */
  function makeCtx(opts) {
    const own = opts.errors || null;
    return {
      role:    opts.actions.role,
      actions: opts.actions,
      // Kein Raumgeheimnis: der Titel steht am Beamer, der Code
      // ohnehin an der Tafel. Der Token bleibt hier draußen.
      title:   opts.title || '',
      /* Läuft hier ein Schaufenster statt eines Raums (lib/preview.js)?
         Für die meisten Werkzeuge ohne Bedeutung — ihr Stand kommt aus
         der view, und ob die erfunden ist, geht sie nichts an. Wer
         aber NEBEN der view etwas auf dem Gerät ablegt, muss es
         wissen: in der Auslage darf nichts hängenbleiben und nichts
         von früher hereinragen. */
      preview: !!opts.preview,
      toast:   opts.toast || function () {},
      confirm: opts.confirm || (msg => Promise.resolve(window.confirm(msg))),
      // Nach einer eigenen Änderung sofort nachladen, statt bis zum
      // nächsten Takt zu warten — ein Tipp muss wirken.
      refresh: opts.refresh || function () {},
      errText: code => errText(code, own),
      esc:     (s) => (window.escapeHtml
        ? window.escapeHtml(s)
        : String(s ?? '').replace(/[&<>"']/g,
            c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])))
    };
  }

  /* ─── Vorgaben eines Werkzeugs ──────────────────────────────
     Was in skill_rooms.settings landet, wenn niemand gefragt wird —
     der Testraum entsteht auf der Landing mit einem Klick und ohne
     Dialog. Ohne das hätte er die Einstellungen nicht, die das
     Werkzeug für seine Anzeige braucht. */
  function defaultSettings(impl) {
    const out = {};
    for (const f of (impl && impl.settingsFields) || []) {
      if (f.default != null && f.default !== '') out[f.key] = f.default;
    }
    return out;
  }

  window.MPTool = {
    register, get, load, defaultSettings,
    participantActions, presenterActions,
    makeCtx, errText, ERRORS
  };
})();
