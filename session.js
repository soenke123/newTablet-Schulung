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

  window.getUserSeason  = () => window.__session?.season ?? 0;
  window.isLoggedIn     = () => !!window.__session?.id;
  window.getSessionUser = () => window.__session;

  // localStorage-Cleanup bei User-Wechsel oder Logout.
  // Räumt alles Lernwelt-spezifische — verhindert, dass User B
  // Fortschritt oder Dirty-Marker von User A vererbt bekommt.
  function clearLocalGameState() {
    try {
      localStorage.removeItem('lernwelt_v3');
      localStorage.removeItem('lernwelt_shop_v1');
      localStorage.removeItem('lernwelt_shop_dirty');
      localStorage.removeItem('lernwelt_avatar_unlocks');
      console.log('[SESSION] localStorage game state + shop + avatars gelöscht.');
    } catch(e) {}
  }
  window.clearLocalGameState = clearLocalGameState;

  const LAST_USER_KEY = 'lernwelt_last_user';

  // bootPromise resolves nach dem ersten Auth-State-Event (INITIAL_SESSION oder SIGNED_IN),
  // damit waitForSession() zuverlässig darauf warten kann.
  let bootResolve;
  const bootPromise = new Promise(r => { bootResolve = r; });
  let bootResolved = false;

  window.waitForSession = () => bootPromise;

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
      console.log('[SESSION] kein authSession → __session = null');
      return;
    }
    let data = null;
    try {
      data = await fetchUserSession(authSession.access_token, authSession.user.id);
    } catch (e) {
      console.warn('[SESSION] user_session fetch fehlgeschlagen:', e.message);
      window.__session = null;
      return;
    }
    console.log('[SESSION] user_session →',
      data ? `season=${data.season}, name=${data.display_name}` : 'null');
    if (!data) {
      console.warn('[SESSION] Auth-User', authSession.user?.email, 'hat KEIN Profil — signOut.');
      clearLocalGameState();
      await client.auth.signOut();
      window.__session = null;
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
