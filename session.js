/* ══════════════════════════════════════════════════════════════
   session.js — Lernwelt Frontend Session-Layer
   ══════════════════════════════════════════════════════════════
   Muss geladen werden NACH:
     - https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2 (als window.supabase)
     - supabase-config.js (SUPABASE_URL, SUPABASE_ANON_KEY)

   Und VOR jedem Code, der getUserSeason() / isLoggedIn() nutzt.

   Öffentliche API:
     window.supabaseClient        — der initialisierte Supabase-Client
     window.getUserSeason()       — 0 wenn kein Login, sonst Cluster-Season
     window.isLoggedIn()          — bool
     window.getSessionUser()      — Session-Objekt oder null
     window.waitForSession()      — Promise, resolved wenn Boot fertig
     window.escapeHtml(s)         — HTML-Escape für &<>"'
     Event 'lernwelt:session-changed' auf window bei Login/Logout
   ══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  console.log('%c[SESSION] session.js läuft', 'background:#2f6b4e;color:white;padding:2px 6px;border-radius:3px');

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[SESSION] Supabase-SDK fehlt. Prüfe, ob supabase-js VOR session.js geladen wurde.');
    return;
  }
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.error('[SESSION] supabase-config.js fehlt oder unvollständig.');
    return;
  }
  console.log('[SESSION] Client wird initialisiert mit URL:', window.SUPABASE_URL);

  const client = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'lernwelt-auth'
      }
    }
  );

  window.supabaseClient = client;
  window.__session      = null;

  window.escapeHtml = function (s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  };

  window.getUserSeason  = () => window.__session?.season ?? 0;
  window.isLoggedIn     = () => !!window.__session?.id;
  window.getSessionUser = () => window.__session;
  window.__bonbonStatus = null;
  window.getBonbonStatus = () => window.__bonbonStatus;
  window.__clusterJokerStatus = null;
  window.getClusterJokerStatus = () => window.__clusterJokerStatus;

  // localStorage-Cleanup bei User-Wechsel oder Logout.
  // Räumt alles Lernwelt-spezifische — verhindert, dass User B
  // Fortschritt oder Dirty-Marker von User A vererbt bekommt.
  function clearLocalGameState() {
    try {
      localStorage.removeItem('lernwelt_v3');
      localStorage.removeItem('lernwelt_shop_v1');
      localStorage.removeItem('lernwelt_shop_dirty');
      localStorage.removeItem('lernwelt_avatar_unlocks');
      localStorage.removeItem('lernwelt_season');
      // Game-Highscores: pro Game eigener Key, gehören zum User → wegräumen
      localStorage.removeItem('fokusflow_highscore');
      localStorage.removeItem('tippturbo_hs');
      localStorage.removeItem('algorithm_hs_v1');
      console.log('[SESSION] localStorage game state + shop + avatars + highscores gelöscht.');
    } catch(e) {}
  }
  window.clearLocalGameState = clearLocalGameState;

  // ─── Last-Chance-Push für Game-Highscores ─────────────────
  // Muss VOR clearLocalGameState und VOR signOut laufen, sonst
  // gehen Scores verloren, die im Game gesetzt aber noch nicht
  // via Hub-Bridge gepusht wurden (z.B. Logout von Landing).
  //
  // Nutzt den aktuellen Access-Token (also den User, dessen
  // Scores gerade in localStorage stehen). Bei User-Wechsel muss
  // der Aufruf VOR dem Wechsel passieren, sonst pusht man A's
  // Scores mit B's Token.
  async function pushLocalHighscoresToServer(token) {
    const accessToken = token || window.__accessToken;
    if (!accessToken || !window.SUPABASE_URL) return;

    // Nur die drei bekannten Game-Score-Keys — kein pull, kein write local
    const jobs = [];
    // FokusFlow: plain int
    try {
      const v = parseInt(localStorage.getItem('fokusflow_highscore') || '0', 10);
      if (v > 0) jobs.push({ gameId: 'game9', score: v });
    } catch(e) {}
    // Tipp-Turbo: plain int
    try {
      const v = parseInt(localStorage.getItem('tippturbo_hs') || '0', 10);
      if (v > 0) jobs.push({ gameId: 'game11', score: v });
    } catch(e) {}
    // Algorithm: base64-encoded Blob mit .bestTime — Prüfsumme nicht validieren,
    // hier nur Best-Effort. Bei Format-Wechsel fällt der Push aus.
    try {
      const raw = localStorage.getItem('algorithm_hs_v1');
      if (raw) {
        let bestTime = 0;
        try {
          const parsed = JSON.parse(atob(raw));
          const d = (parsed && typeof parsed === 'object' && 'd' in parsed) ? parsed.d : parsed;
          bestTime = Number(d?.bestTime || 0);
        } catch(e) {}
        if (bestTime > 0) jobs.push({ gameId: 'game10', score: bestTime });
      }
    } catch(e) {}

    if (jobs.length === 0) return;
    await Promise.all(jobs.map(({ gameId, score }) => (
      fetch(`${window.SUPABASE_URL}/rest/v1/rpc/upsert_highscore`, {
        method: 'POST',
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ p_game_id: gameId, p_score: score })
      }).catch(e => console.warn('[SESSION] highscore last-push failed', gameId, e.message))
    )));
  }
  window.pushLocalHighscoresToServer = pushLocalHighscoresToServer;

  const LAST_USER_KEY = 'lernwelt_last_user';

  // bootPromise resolves nach dem ersten Auth-State-Event (INITIAL_SESSION oder SIGNED_IN),
  // damit waitForSession() zuverlässig darauf warten kann.
  let bootResolve;
  const bootPromise = new Promise(r => { bootResolve = r; });
  let bootResolved = false;

  window.waitForSession = () => bootPromise;

  // Bonbon-Status per RPC ziehen. Wenn User keine S3-Season hat,
  // liefert die RPC { enabled:false } — merken wir uns trotzdem im
  // Cache, damit renderBonbonDisplay eine klare Antwort hat.
  async function fetchBonbonStatus(accessToken) {
    if (!accessToken || !window.SUPABASE_URL) return null;
    try {
      const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/get_cluster_bonbon_status`, {
        method: 'POST',
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: '{}'
      });
      if (!res.ok) throw new Error(`bonbon-status ${res.status}`);
      const data = await res.json();
      return data && data.ok ? data : null;
    } catch (e) {
      console.warn('[SESSION] bonbon-status fetch failed:', e.message);
      return null;
    }
  }

  // Public helper: kann von Hub/Spielen aufgerufen werden nach add_bonbons,
  // um den lokalen Cache aufzufrischen. Feuert 'lernwelt:bonbon-changed'.
  async function refreshBonbonStatus() {
    if (!window.__accessToken) return null;
    const s = await fetchBonbonStatus(window.__accessToken);
    window.__bonbonStatus = s;
    window.dispatchEvent(new CustomEvent('lernwelt:bonbon-changed', { detail: { status: s } }));
    return s;
  }
  window.refreshBonbonStatus = refreshBonbonStatus;

  // Cluster-Joker-Status (S3-Team-Item „Joker für gemeinsam gewinnen").
  // Liefert used/cap/own_purchases/buyers[] für den aktuellen Cluster.
  async function fetchClusterJokerStatus(accessToken) {
    if (!accessToken || !window.SUPABASE_URL) return null;
    try {
      const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/get_cluster_joker_status`, {
        method: 'POST',
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: '{}'
      });
      if (!res.ok) throw new Error(`joker-status ${res.status}`);
      const data = await res.json();
      return data && data.ok ? data : null;
    } catch (e) {
      console.warn('[SESSION] cluster-joker-status fetch failed:', e.message);
      return null;
    }
  }

  async function refreshClusterJokerStatus() {
    if (!window.__accessToken) return null;
    const s = await fetchClusterJokerStatus(window.__accessToken);
    window.__clusterJokerStatus = s;
    window.dispatchEvent(new CustomEvent('lernwelt:cluster-joker-changed', { detail: { status: s } }));
    return s;
  }
  window.refreshClusterJokerStatus = refreshClusterJokerStatus;

  // Raw fetch statt supabase-js-Query-Builder — vermeidet interne SDK-Locks,
  // die zwischen Tabs streiten und Queries dauerhaft hängen lassen können.
  //
  // WICHTIG: id=eq.{userId} als Filter. Ohne den bekommen Admins ALLE
  // Profile-Zeilen zurück (RLS profiles_select_own erlaubt is_admin() alles),
  // und "rows[0]" trifft dann eine beliebige fremde Zeile.
  async function fetchUserSession(accessToken, userId) {
    const url = `${window.SUPABASE_URL}/rest/v1/user_session`
              + `?select=*&id=eq.${userId}&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
    if (!res.ok) {
      throw new Error(`user_session ${res.status}: ${await res.text()}`);
    }
    const rows = await res.json();
    return rows[0] ?? null;
  }

  async function applyAuthSession(authSession) {
    // Access-Token global cachen — andere Module (creatures.js, script.js)
    // brauchen ihn für direkte REST-Aufrufe ohne SDK-Query-Builder.
    window.__accessToken = authSession?.access_token ?? null;

    if (!authSession) {
      window.__session = null;
      window.__bonbonStatus = null;
      window.__clusterJokerStatus = null;
      try { localStorage.removeItem('lernwelt_season'); } catch(e) {}
      console.log('[SESSION] kein authSession → __session = null');
      return;
    }
    let data = null;
    try {
      data = await fetchUserSession(authSession.access_token, authSession.user.id);
    } catch (e) {
      console.warn('[SESSION] user_session fetch fehlgeschlagen:', e.message);
      window.__session = null;
      try { localStorage.removeItem('lernwelt_season'); } catch(err) {}
      return;
    }
    console.log('[SESSION] user_session →',
      data ? `season=${data.season}, name=${data.display_name}` : 'null');
    if (!data) {
      console.warn('[SESSION] Auth-User', authSession.user?.email, 'hat KEIN Profil — signOut.');
      clearLocalGameState();
      await client.auth.signOut();
      window.__session = null;
      try { localStorage.removeItem('lernwelt_season'); } catch(err) {}
      window.dispatchEvent(new CustomEvent('lernwelt:no-profile', {
        detail: { email: authSession.user?.email }
      }));
      return;
    }
    console.log('[SESSION] Profil geladen:', data.display_name, '· Season:', data.season, '· Status:', data.status);

    // User-Wechsel-Erkennung: wenn der letzte bekannte User != aktueller User,
    // war jemand anderes vorher auf diesem Gerät eingeloggt. localStorage
    // gehört noch dem alten User → clearen, bevor der neue rendert.
    try {
      const lastUserId = localStorage.getItem(LAST_USER_KEY);
      if (lastUserId && lastUserId !== data.id) {
        console.log('[SESSION] User-Wechsel erkannt (', lastUserId, '→', data.id, ') — cleare.');
        clearLocalGameState();
      }
      localStorage.setItem(LAST_USER_KEY, data.id);
    } catch(e) {}

    window.__session = data;
    // Season in localStorage cachen — Einzel-Spiele laden session.js nicht
    // und können so trotzdem den korrekten Season-Kontext (z.B. für S3-Drops
    // in determineCreature) lesen.
    try { localStorage.setItem('lernwelt_season', String(data.season ?? 0)); } catch(e) {}

    // Bonbon-Status parallel ziehen — Hub-HUD und Legi-Kachel brauchen ihn
    // beim ersten Rendern. Kein blocking der Session — schlägt der Fetch
    // fehl, ist der Cache halt null und die Anzeige zeigt 0/hidden.
    window.__bonbonStatus = await fetchBonbonStatus(authSession.access_token);
    window.__clusterJokerStatus = await fetchClusterJokerStatus(authSession.access_token);
  }

  // Auth-State-Handler: das ist der einzige Ort wo wir authSession bekommen.
  // Die vom Callback gelieferte session direkt nutzen — kein zweiter getSession()-Call
  // (der könnte durch das interne Lock des SDK ewig blockieren).
  // touch_login pflegt profiles.last_login_at für die Dashboard-Metrik.
  // Fire-and-forget: Fehler ignorieren, kein Blocker für den Login-Flow.
  async function touchLogin(accessToken) {
    try {
      await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/touch_login`, {
        method: 'POST',
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
    } catch (e) {
      console.warn('[SESSION] touch_login failed (ignored):', e.message);
    }
  }

  client.auth.onAuthStateChange(async (event, authSession) => {
    console.log('[SESSION] event:', event, authSession ? `user=${authSession.user.email}` : '(no session)');
    if (event === 'TOKEN_REFRESHED') return;
    await applyAuthSession(authSession);
    if (event === 'SIGNED_IN' && authSession?.access_token) {
      touchLogin(authSession.access_token);  // fire-and-forget
    }
    if (!bootResolved) {
      bootResolved = true;
      bootResolve(window.__session);
    }
    window.dispatchEvent(new CustomEvent('lernwelt:session-changed', {
      detail: { session: window.__session }
    }));
  });

  // Safety-Net: falls das SDK aus irgendeinem Grund keinen initial event feuert,
  // resolven wir bootPromise nach 3 s trotzdem als "kein Login".
  setTimeout(() => {
    if (!bootResolved) {
      console.warn('[SESSION] Kein Auth-Event nach 3 s — resolve als guest.');
      bootResolved = true;
      bootResolve(null);
    }
  }, 3000);
})();
