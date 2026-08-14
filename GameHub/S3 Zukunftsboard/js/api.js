/* Server-Anbindung des Zukunftsboards (Migration 0062).

   Direkter fetch statt supabase-js-Query-Builder — genau wie in
   session.js und Startup Storys cloud.js. Das SDK hält interne Locks,
   die sich zwischen Tabs in die Quere kommen; bei einem Board, das
   im Sekundentakt pollt und auf 30 Tablets gleichzeitig offen ist,
   will man das nicht.

   Alle RPCs antworten im Repo-Standard { ok: true, … } bzw.
   { ok: false, error: '…' }. Netzfehler werden hier in dasselbe
   Format übersetzt, damit der Aufrufer nur einen Fall kennt.        */
(function () {
  'use strict';

  /* ── Access-Token ──────────────────────────────────────────
     session.js steigt bei 'TOKEN_REFRESHED' früh aus (session.js:395)
     und aktualisiert window.__accessToken dabei NICHT. Für kurze
     Spielrunden fällt das nicht auf; dieses Board steht aber eine
     ganze Schulstunde offen, und Supabase-Tokens laufen nach einer
     Stunde ab — der Boot-Token wäre also garantiert irgendwann tot
     und jeder Schreibversuch liefe in ein 401.

     Zwei Sicherungen, absichtlich beide:
       1. Eigener Auth-Listener, der den frischen Token mitnimmt.
          Ereignisgesteuert, kein Polling, keine SDK-Locks.
       2. Bei 401 einmal aktiv beim SDK nachfragen und den Aufruf
          wiederholen — für den Fall, dass das Ereignis verpasst
          wurde (Tab war ausgeblendet, Listener kam zu spät).
     Bewusst nur hier und nicht in session.js: der Session-Layer
     hängt an jeder Seite der Plattform, das ist ein größerer Eingriff
     als das, worum es gerade geht.                                  */
  if (window.supabaseClient?.auth?.onAuthStateChange) {
    window.supabaseClient.auth.onAuthStateChange((event, s) => {
      if (s?.access_token && s.access_token !== window.__accessToken) {
        window.__accessToken = s.access_token;
        console.log('[BOARD] Access-Token aufgefrischt (' + event + ')');
      }
    });
  }

  function token() { return window.__accessToken || null; }

  // Holt den aktuellen Token aktiv beim SDK. Nur im 401-Fall benutzt —
  // getSession() greift auf das interne Auth-Lock zu, und genau davor
  // weicht der Rest der Plattform aus (siehe CLAUDE.md).
  async function refreshToken() {
    try {
      // Das Lock kann bei mehreren offenen Tabs hängen bleiben (siehe
      // CLAUDE.md) — ohne Zeitlimit bliebe der Speichern-Knopf dann für
      // immer deaktiviert. Lieber nach 4 s aufgeben und ehrlich sagen,
      // dass die Anmeldung erneuert werden muss.
      const fresh = await Promise.race([
        window.supabaseClient.auth.getSession().then(r => r?.data?.session?.access_token || null),
        new Promise(resolve => setTimeout(() => resolve(null), 4000))
      ]);
      if (fresh) window.__accessToken = fresh;
      return fresh;
    } catch (e) {
      console.warn('[BOARD] getSession fehlgeschlagen:', e.message);
      return null;
    }
  }

  async function rpc(fn, body, _retried) {
    const t = token();
    if (!t || !window.SUPABASE_URL) return { ok: false, error: 'not_authenticated' };
    try {
      const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(body || {})
      });

      // 401 = Token abgelehnt (abgelaufen). Einmal frischen holen und
      // denselben Aufruf wiederholen. _retried verhindert die Schleife,
      // wenn der Token auch danach nicht akzeptiert wird.
      if (res.status === 401 && !_retried) {
        const fresh = await refreshToken();
        if (fresh && fresh !== t) return rpc(fn, body, true);
        return { ok: false, error: 'session_expired' };
      }

      if (!res.ok) {
        console.warn('[BOARD] rpc', fn, res.status, await res.text());
        return { ok: false, error: res.status === 401 ? 'session_expired' : 'server_' + res.status };
      }
      return await res.json();
    } catch (e) {
      console.warn('[BOARD] rpc', fn, 'network:', e.message);
      return { ok: false, error: 'network' };
    }
  }

  window.BoardAPI = {
    rpc,

    // p_cluster_id null = eigener Kurs. Admins geben einen fremden an.
    get: clusterId => rpc('board_get', { p_cluster_id: clusterId ?? null }),

    // note.id null = neue Karte
    upsert: note => rpc('board_upsert_note', {
      p_id:            note.id ?? null,
      p_kind:          note.kind,
      p_category:      note.category,
      p_stance:        note.stance,
      p_text:          note.text,
      p_source_url:    note.source_url    ?? null,
      p_source_author: note.source_author ?? null,
      p_source_date:   note.source_date   ?? null,
      p_cluster_id:    note.cluster_id    ?? null
    }),

    remove:   id                 => rpc('board_delete_note', { p_id: id }),
    setPhase: (clusterId, phase) => rpc('board_set_phase', { p_cluster_id: clusterId, p_phase: phase }),
    reset:    clusterId          => rpc('board_reset',     { p_cluster_id: clusterId }),

    /* Kursliste für den Kurs-Wähler der Admins. Kein eigener RPC nötig:
       clusters_select_own_school (Migration 0002/0053) gibt Admins schon
       die Kurse ihrer Schule — und dem Volladmin alle. */
    async listClusters() {
      const t = token();
      if (!t || !window.SUPABASE_URL) return [];
      try {
        const res = await fetch(
          `${window.SUPABASE_URL}/rest/v1/clusters?select=id,name,season&order=name.asc`,
          {
            headers: {
              apikey: window.SUPABASE_ANON_KEY,
              Authorization: `Bearer ${t}`,
              Accept: 'application/json'
            }
          }
        );
        if (!res.ok) throw new Error(`clusters ${res.status}`);
        return await res.json();
      } catch (e) {
        console.warn('[BOARD] Kursliste fehlgeschlagen:', e.message);
        return [];
      }
    }
  };
})();
