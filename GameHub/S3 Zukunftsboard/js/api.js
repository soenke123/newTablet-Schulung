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

  function token() { return window.__accessToken || null; }

  async function rpc(fn, body) {
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
      if (!res.ok) {
        console.warn('[BOARD] rpc', fn, res.status, await res.text());
        return { ok: false, error: 'server_' + res.status };
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
