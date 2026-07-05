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

  let bootPromise = null;

  async function loadSession() {
    console.log('[SESSION] loadSession() start');
    const { data: { session: authSession }, error: authErr } = await client.auth.getSession();
    console.log('[SESSION] getSession() →',
      authSession ? `user=${authSession.user.email}` : 'null',
      authErr ? `err=${authErr.message}` : '');
    if (!authSession) {
      window.__session = null;
      return null;
    }
    const { data, error } = await client
      .from('user_session')
      .select('*')
      .maybeSingle();
    console.log('[SESSION] user_session →', data ? `season=${data.season}, name=${data.display_name}` : 'null',
      error ? `err=${error.message}` : '');
    if (error) {
      console.warn('[SESSION] user_session query failed:', error.message);
      window.__session = null;
      return null;
    }
    if (!data) {
      console.warn('[SESSION] Auth-User', authSession.user?.email, 'hat KEIN Profil — signOut.');
      await client.auth.signOut();
      window.__session = null;
      window.dispatchEvent(new CustomEvent('lernwelt:no-profile', {
        detail: { email: authSession.user?.email }
      }));
      return null;
    }
    console.log('[SESSION] Profil geladen:', data.display_name, '· Season:', data.season, '· Status:', data.status);
    window.__session = data;
    return data;
  }

  window.waitForSession = () => (bootPromise ??= loadSession());

  // WICHTIG: Erst Listener registrieren, DANN initial laden.
  // Sonst kann INITIAL_SESSION vom SDK gefeuert werden, bevor wir zuhören.
  client.auth.onAuthStateChange(async (event) => {
    console.log('[SESSION] onAuthStateChange event:', event);
    if (event === 'TOKEN_REFRESHED') return;
    bootPromise = loadSession();
    await bootPromise;
    window.dispatchEvent(new CustomEvent('lernwelt:session-changed', {
      detail: { session: window.__session }
    }));
  });

  // Initial boot
  window.waitForSession();
})();
