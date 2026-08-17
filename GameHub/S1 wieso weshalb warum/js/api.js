/* Server-Anbindung der Wortwolke „Warum Tablets?" (Migration 0075).

   Direkter fetch statt supabase-js-Query-Builder — genau wie in
   session.js, Startup Storys cloud.js und dem Reality-Check-Board. Das
   SDK hält interne Locks, die sich zwischen Tabs in die Quere kommen;
   bei einer Seite, die im Sekundentakt pollt und auf 30 Tablets
   gleichzeitig offen ist, will man das nicht.

   Alle RPCs antworten im Repo-Standard { ok: true, … } bzw.
   { ok: false, error: '…' }. Netzfehler werden hier in dasselbe
   Format übersetzt, damit der Aufrufer nur einen Fall kennt.

   BOARD ist der Schlüssel, unter dem die Zettel liegen (Migration 0075:
   board_key). Er ist zugleich die Spiel-ID und wird serverseitig gegen
   `games` geprüft. Eine zweite einfache Wortwolke wäre eine Kopie
   dieses Ordners mit einem anderen Wert hier — die Tabellen und RPCs
   bleiben dieselben.                                                 */
(function () {
  'use strict';

  const BOARD = 'game20';

  /* ── Access-Token ──────────────────────────────────────────
     session.js steigt bei 'TOKEN_REFRESHED' früh aus und aktualisiert
     window.__accessToken dabei NICHT. Für kurze Spielrunden fällt das
     nicht auf; diese Seite steht aber eine ganze Schulstunde offen, und
     Supabase-Tokens laufen nach einer Stunde ab — der Boot-Token wäre
     also garantiert irgendwann tot und jeder Schreibversuch liefe in
     ein 401.

     Zwei Sicherungen, absichtlich beide:
       1. Eigener Auth-Listener, der den frischen Token mitnimmt.
          Ereignisgesteuert, kein Polling, keine SDK-Locks.
       2. Bei 401 einmal aktiv beim SDK nachfragen und den Aufruf
          wiederholen — für den Fall, dass das Ereignis verpasst wurde
          (Tab war ausgeblendet, Listener kam zu spät).                */
  if (window.supabaseClient?.auth?.onAuthStateChange) {
    window.supabaseClient.auth.onAuthStateChange((event, s) => {
      if (s?.access_token && s.access_token !== window.__accessToken) {
        window.__accessToken = s.access_token;
        console.log('[WC] Access-Token aufgefrischt (' + event + ')');
      }
    });
  }

  function token() { return window.__accessToken || null; }

  // Holt den aktuellen Token aktiv beim SDK. Nur im 401-Fall benutzt —
  // getSession() greift auf das interne Auth-Lock zu, und genau davor
  // weicht der Rest der Plattform aus (siehe CLAUDE.md).
  async function refreshToken() {
    try {
      // Das Lock kann bei mehreren offenen Tabs hängen bleiben — ohne
      // Zeitlimit bliebe der Speichern-Knopf dann für immer deaktiviert.
      // Lieber nach 4 s aufgeben und ehrlich sagen, dass die Anmeldung
      // erneuert werden muss.
      const fresh = await Promise.race([
        window.supabaseClient.auth.getSession().then(r => r?.data?.session?.access_token || null),
        new Promise(resolve => setTimeout(() => resolve(null), 4000))
      ]);
      if (fresh) window.__accessToken = fresh;
      return fresh;
    } catch (e) {
      console.warn('[WC] getSession fehlgeschlagen:', e.message);
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
        console.warn('[WC] rpc', fn, res.status, await res.text());
        return { ok: false, error: res.status === 401 ? 'session_expired' : 'server_' + res.status };
      }
      return await res.json();
    } catch (e) {
      console.warn('[WC] rpc', fn, 'network:', e.message);
      return { ok: false, error: 'network' };
    }
  }

  window.WordcloudAPI = {
    rpc,
    board: BOARD,

    // p_cluster_id null = eigener Kurs. Admins geben einen fremden an.
    get: clusterId => rpc('wc_get', { p_cluster_id: clusterId ?? null, p_board: BOARD }),

    // note.id null = neuer Zettel
    upsert: note => rpc('wc_upsert_note', {
      p_id:         note.id ?? null,
      p_text:       note.text,
      p_cluster_id: note.cluster_id ?? null,
      p_board:      BOARD
    }),

    // Umschalter: der Server weiß, ob schon zugestimmt wurde, und
    // antwortet mit dem Ergebnis { liked, likes }.
    toggleLike: noteId => rpc('wc_toggle_like', { p_note_id: noteId }),

    /* Belohnung abholen. Idempotent: der Server gibt sie genau einmal
       aus und antwortet danach mit event: 'none'. Deshalb darf der
       Aufruf ruhig mehrfach kommen — aber nicht beliebig oft, siehe
       maybeClaimReward() in wordcloud.js. */
    claimReward: clusterId => rpc('wc_claim_reward', { p_cluster_id: clusterId ?? null, p_board: BOARD }),

    remove:   id                 => rpc('wc_delete_note', { p_id: id }),
    setPhase: (clusterId, phase) => rpc('wc_set_phase', { p_cluster_id: clusterId, p_phase: phase, p_board: BOARD }),
    reset:    clusterId          => rpc('wc_reset',     { p_cluster_id: clusterId, p_board: BOARD }),

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
        console.warn('[WC] Kursliste fehlgeschlagen:', e.message);
        return [];
      }
    }
  };
})();
