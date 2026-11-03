/* ══════════════════════════════════════════════════════════════
   Social Hub — js/api.js   ·   Brücke zum Raum, Sitzungen, Texte
   ══════════════════════════════════════════════════════════════
   Alle Serveraufrufe gehen über den Rahmen (tool.js): der hängt
   p_token (Schüler) bzw. p_code (Lehrkraft) selbst an. Hier kommen
   nur noch Hub und Sitzung dazu.

   Sitzung je Hub im Gerät: auf Schulgeräten (mpskills.device =
   school, Standard) nur in sessionStorage — Tab zu = abgemeldet;
   auf eigenen Geräten in localStorage.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const P = new URLSearchParams(location.search);
  const TEACHER = P.get('rolle') === 'presenter';
  const CODE = (P.get('raum') || '').toUpperCase();
  const IN_FRAME = window.parent && window.parent !== window;

  let seq = 0;
  const waits = new Map();
  let stateCb = null;
  let lastState = null;

  window.addEventListener('message', (ev) => {
    if (!IN_FRAME || ev.source !== window.parent || ev.origin !== location.origin) return;
    const m = ev.data;
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'sh:result' && waits.has(m.id)) {
      const w = waits.get(m.id);
      waits.delete(m.id);
      clearTimeout(w.t);
      w.res(m.res || { ok: false, error: 'bad_response' });
    } else if (m.type === 'sh:state') {
      lastState = m.data || {};
      if (stateCb) stateCb(lastState);
    }
  });

  function send(type, payload) {
    return new Promise((res) => {
      if (!IN_FRAME) { res({ ok: false, error: 'no_room' }); return; }
      const id = ++seq;
      const t = setTimeout(() => { waits.delete(id); res({ ok: false, error: 'network' }); }, 25000);
      waits.set(id, { res, t });
      window.parent.postMessage(Object.assign({ type, id }, payload), location.origin);
    });
  }

  const call = (fn, args) => send('sh:call', { fn, args: args || {} });
  const setData = (data) => send('sh:setData', { data });

  /* ── Sitzung je Hub ─────────────────────────────────────── */
  const store = (() => {
    let own = false;
    try { own = localStorage.getItem('mpskills.device') === 'own'; } catch (e) { /* aus */ }
    const st = own ? window.localStorage : window.sessionStorage;
    return {
      get(k) { try { return st.getItem(k); } catch (e) { return null; } },
      set(k, v) { try { if (v == null) st.removeItem(k); else st.setItem(k, v); } catch (e) { /* aus */ } }
    };
  })();
  const sessKey = hub => 'sh.s.' + CODE + '.' + hub;

  const ERR = {
    invalid_name: 'Der Name braucht 2 bis 30 Zeichen.',
    invalid_username: 'Benutzername: 3 bis 24 Zeichen, nur a–z, 0–9, Punkt und Unterstrich.',
    invalid_password: 'Das Passwort braucht 4 bis 60 Zeichen.',
    invalid_birthday: 'Das Geburtsdatum stimmt nicht.',
    invalid_logo: 'Bitte wähle ein Logo.',
    invalid_image: 'Bitte wähle zuerst ein Bild.',
    invalid_input: 'Das passt so nicht.',
    username_taken: 'Diesen Benutzernamen gibt es in diesem Hub schon.',
    wrong_login: 'Benutzername oder Passwort falsch.',
    blacklisted: 'Da steckt ein Wort drin, das hier nicht erlaubt ist.',
    already_founded: 'Du hast schon einen Hub.',
    hub_locked: 'Dieser Hub ist gesperrt.',
    hub_not_found: 'Diesen Hub gibt es nicht mehr.',
    not_logged_in: 'Bitte melde dich zuerst an.',
    not_admin: 'Das dürfen nur Admins.',
    table_off: 'Das geht noch nicht – die Tabelle dazu fehlt noch.',
    upload_off: 'Bilder hochladen ist gerade ausgeschaltet.',
    quota_exceeded: 'Hier ist die Grenze erreicht.',
    room_full: 'Der Speicher dieses Raums ist voll.',
    payload_too_big: 'Das Bild ist zu groß.',
    too_many_accounts: 'Höchstens 3 Konten je Gerät in einem Hub.',
    not_found: 'Nicht gefunden.',
    blocked: 'Dieses Gerät wurde von der Lehrkraft stillgelegt.',
    room_gone: 'Dieser Raum ist abgelaufen.',
    unknown_token: 'Dieser Raum gehört nicht mehr zu diesem Gerät. Lade die Seite neu.',
    network: 'Keine Verbindung – bitte gleich noch einmal.',
    no_room: 'Social Hub läuft nur in einem MPSkills-Raum.',
    fn_missing: 'Der Server kennt diese Funktion noch nicht (Migration 0262 fehlt).'
  };
  const errText = (r) => (r && (r.message || ERR[r.error])) || 'Das hat nicht geklappt (' + ((r && r.error) || '?') + ').';

  window.SHApi = {
    TEACHER, CODE, IN_FRAME, call, setData,
    onState(cb) { stateCb = cb; if (lastState) cb(lastState); },
    get state() { return lastState || {}; },
    hello() { if (IN_FRAME) window.parent.postMessage({ type: 'sh:hello' }, location.origin); },
    session: {
      get: hub => store.get(sessKey(hub)),
      set: (hub, s) => store.set(sessKey(hub), s)
    },
    errText
  };
})();
