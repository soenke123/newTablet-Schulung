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

  // bootPromise resolves nach dem ersten Auth-State-Event (INITIAL_SESSION oder SIGNED_IN),
  // damit waitForSession() zuverlässig darauf warten kann.
  let bootResolve;
  const bootPromise = new Promise(r => { bootResolve = r; });
  let bootResolved = false;

  window.waitForSession = () => bootPromise;

  async function applyAuthSession(authSession) {
    if (!authSession) {
      window.__session = null;
      console.log('[SESSION] kein authSession → __session = null');
      return;
    }
    const { data, error } = await client
      .from('user_session')
      .select('*')
      .maybeSingle();
    console.log('[SESSION] user_session →',
      data ? `season=${data.season}, name=${data.display_name}` : 'null',
      error ? `err=${error.message}` : '');
    if (error) {
      window.__session = null;
      return;
    }
    if (!data) {
      console.warn('[SESSION] Auth-User', authSession.user?.email, 'hat KEIN Profil — signOut.');
      await client.auth.signOut();
      window.__session = null;
      window.dispatchEvent(new CustomEvent('lernwelt:no-profile', {
        detail: { email: authSession.user?.email }
      }));
      return;
    }
    console.log('[SESSION] Profil geladen:', data.display_name, '· Season:', data.season, '· Status:', data.status);
    window.__session = data;
  }

  // Auth-State-Handler: das ist der einzige Ort wo wir authSession bekommen.
  // Die vom Callback gelieferte session direkt nutzen — kein zweiter getSession()-Call
  // (der könnte durch das interne Lock des SDK ewig blockieren).
  client.auth.onAuthStateChange(async (event, authSession) => {
    console.log('[SESSION] event:', event, authSession ? `user=${authSession.user.email}` : '(no session)');
    if (event === 'TOKEN_REFRESHED') return;
    await applyAuthSession(authSession);
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
