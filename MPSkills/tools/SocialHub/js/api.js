/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/api.js   ·   Brücke zum Raum, Sitzungen, Texte
   ══════════════════════════════════════════════════════════════
   Alle Serveraufrufe gehen über den Rahmen (tool.js): der hängt
   p_token (Schüler) bzw. p_code (Lehrkraft) selbst an. Hier kommen
   nur noch Netzwerk (p_hub) und Sitzung dazu.

   Sitzung je Netzwerk im Gerät: mit „Angemeldet bleiben“ in
   localStorage, sonst in sessionStorage (Tab zu = abgemeldet). Der
   Haken ist auf eigenen Geräten (mpskills.device = own) vorbelegt.
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

  /* ── Sitzung je Netzwerk ────────────────────────────────── */
  // „Angemeldet bleiben“ = localStorage, sonst sessionStorage (Tab zu =
  // abgemeldet). Die Lehrkraft bleibt immer angemeldet.
  const OWN = (() => { try { return localStorage.getItem('mpskills.device') === 'own'; } catch (e) { return false; } })();
  const st = (kind) => { try { return kind === 'l' ? window.localStorage : window.sessionStorage; } catch (e) { return null; } };
  const sget = (kind, k) => { try { const x = st(kind); return x ? x.getItem(k) : null; } catch (e) { return null; } };
  const sput = (kind, k, v) => { try { const x = st(kind); if (!x) return; if (v == null) x.removeItem(k); else x.setItem(k, v); } catch (e) { /* aus */ } };
  const sessKey = hub => 'sh.s.' + CODE + '.' + hub;
  const session = {
    get: hub => sget('s', sessKey(hub)) || sget('l', sessKey(hub)),
    // keep: true/false = dorthin; undefined = da lassen, wo sie schon liegt
    set(hub, s, keep) {
      const k = sessKey(hub);
      if (keep === undefined) keep = TEACHER || (sget('l', k) != null && sget('s', k) == null);
      if (TEACHER) keep = true;
      sput(keep ? 's' : 'l', k, null);
      sput(keep ? 'l' : 's', k, s);
    },
    // Vorschlag für den Haken „Angemeldet bleiben“
    keepDefault: () => TEACHER || OWN
  };

  const ERR = {
    invalid_name: 'Der Name braucht 2 bis 30 Zeichen.',
    invalid_username: 'Benutzername: 3 bis 24 Zeichen, nur a–z, 0–9, Punkt und Unterstrich.',
    invalid_password: 'Das Passwort braucht 4 bis 60 Zeichen.',
    invalid_birthday: 'Das Geburtsdatum stimmt nicht.',
    invalid_logo: 'Bitte wähle ein Logo.',
    invalid_color: 'Die Farbe muss als #rrggbb angegeben sein.',
    invalid_image: 'Bitte wähle zuerst ein Bild.',
    invalid_input: 'Das passt so nicht.',
    username_taken: 'Diesen Benutzernamen gibt es in diesem Netzwerk schon.',
    invalid_gender: 'Geschlecht: männlich, weiblich oder divers.',
    pw_mismatch: 'Die beiden Passwörter sind nicht gleich.',
    hub_private: 'Dieses Netzwerk gehört jemand anderem.',
    no_admin: 'Dieses Netzwerk hat noch kein Admin-Konto.',
    wrong_login: 'Benutzername oder Passwort falsch.',
    blacklisted: 'Da steckt ein Wort drin, das hier nicht erlaubt ist.',
    already_founded: 'Du hast schon ein Netzwerk.',
    hub_locked: 'Dieses Netzwerk ist gesperrt.',
    hub_not_found: 'Dieses Netzwerk gibt es nicht mehr.',
    not_logged_in: 'Bitte melde dich zuerst an.',
    not_admin: 'Das dürfen nur Admins.',
    table_off: 'Das geht noch nicht – die Tabelle dazu fehlt noch.',
    upload_off: 'Bilder hochladen ist gerade ausgeschaltet.',
    quota_exceeded: 'Hier ist die Grenze erreicht.',
    room_full: 'Der Speicher dieses Raums ist voll.',
    payload_too_big: 'Das Bild ist zu groß.',
    too_many_accounts: 'Hier ist die Grenze für Konten von diesem Gerät erreicht.',
    not_found: 'Nicht gefunden.',
    blocked: 'Dieses Gerät wurde von der Lehrkraft stillgelegt.',
    room_gone: 'Dieser Raum ist abgelaufen.',
    unknown_token: 'Dieser Raum gehört nicht mehr zu diesem Gerät. Lade die Seite neu.',
    network: 'Keine Verbindung – bitte gleich noch einmal.',
    no_room: 'YourSozialNet läuft nur in einem MPSkills-Raum.',
    fn_missing: 'Der Server kennt diese Funktion noch nicht (Migrationen 0262–0265 fehlen).'
  };
  const errText = (r) => (r && (r.message || ERR[r.error])) || 'Das hat nicht geklappt (' + ((r && r.error) || '?') + ').';

  window.SHApi = {
    TEACHER, CODE, IN_FRAME, call, setData,
    onState(cb) { stateCb = cb; if (lastState) cb(lastState); },
    get state() { return lastState || {}; },
    hello() { if (IN_FRAME) window.parent.postMessage({ type: 'sh:hello' }, location.origin); },
    session,
    errText
  };
})();
