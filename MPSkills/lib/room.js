/* ══════════════════════════════════════════════════════════════
   MPSkills — lib/room.js
   ══════════════════════════════════════════════════════════════
   Alles, was Schüler- und Lehrerseite gemeinsam brauchen: die
   Token-Ablage im Gerät, die Serveraufrufe und der Poller.

   ── Der Token ist das Konto, das es nicht gibt ────────────────
   Ein Teilnehmer hat keine Anmeldung. Was er hat, ist ein
   geheimer Token je Raum, den der Server beim Beitritt einmal
   herausgibt. Er liegt in localStorage['mpskills_rooms'] — und
   genau das ist auf einem Klassensatz-Tablet der Sinn: der Raum
   von gestern ist morgen noch da.

   Wer eingeloggt ist, hängt zusätzlich an seiner User-ID und
   findet seine Räume über skill_my_rooms auch auf einem anderen
   Gerät wieder.

   ── Zwei Anfragen statt einer ─────────────────────────────────
   28 Tablets × alle 3 Sekunden × mehrere Klassen parallel. Der
   Poller fragt deshalb erst die billige Signatur ab und holt die
   vollständige Ansicht nur, wenn sich wirklich etwas geändert
   hat. Die Signatur ist eine Zeichenkette, die hier nur
   verglichen und nie ausgewertet wird — was darin steht, darf
   sich mit jeder Ausbaustufe ändern.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const STORE_KEY = 'mpskills_rooms';
  const POLL_MS   = 3000;

  /* ─── Token-Ablage ──────────────────────────────────────── */
  function readStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(e => e && e.code && e.token) : [];
    } catch (e) {
      console.warn('[mpskills] Raumliste im Gerät unlesbar:', e.message);
      return [];
    }
  }

  function writeStore(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 40)));
    } catch (e) {
      // Voller oder gesperrter Speicher (privater Modus): der
      // laufende Raum funktioniert weiter, nur das Wiederfinden
      // nach dem Neuladen fällt aus. Kein Grund, hier abzubrechen.
      console.warn('[mpskills] Raumliste konnte nicht gespeichert werden:', e.message);
    }
  }

  const list   = () => readStore();
  const get    = (code) => readStore().find(e => e.code === String(code || '').toUpperCase()) || null;
  const forget = (code) => {
    const up = String(code || '').toUpperCase();
    writeStore(readStore().filter(e => e.code !== up));
  };

  // Neueste zuerst — die Liste „Meine Räume" ist eine Chronik.
  function remember(entry) {
    const up   = String(entry.code).toUpperCase();
    const rest = readStore().filter(e => e.code !== up);
    rest.unshift(Object.assign({}, entry, { code: up, saved_at: Date.now() }));
    writeStore(rest);
  }

  /* ─── Serveraufrufe ─────────────────────────────────────── */
  // Teilnehmer sprechen als anon mit der Datenbank und rufen dort
  // ausschließlich die drei benannten Funktionen auf. Ist jemand
  // angemeldet, wird sein Token benutzt — dieselben Funktionen
  // sind an beide Rollen vergeben.
  async function rpc(fn, args) {
    const token = window.__accessToken || window.SUPABASE_ANON_KEY;
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(args || {})
    });
    if (!res.ok) throw new Error(`${fn} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  // Beitritt und Code-Prüfung laufen NICHT über die Datenbank,
  // sondern über die Vercel-Function: nur sie sieht die
  // Client-Adresse und kann mitzählen, wie oft jemand daneben
  // liegt. Siehe api/skill_join.js.
  async function endpoint(payload) {
    const res = await fetch('/api/skill_join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    let body = null;
    const raw = await res.text();
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { _raw: raw }; }
    if (!body || typeof body !== 'object') body = {};
    if (!res.ok && !body.error) body.error = `http_${res.status}`;
    return body;
  }

  const peek = (code) => endpoint({ mode: 'peek', code: String(code || '').toUpperCase() });

  const join = (code, name) => endpoint({
    mode: 'join',
    code: String(code || '').toUpperCase(),
    name: name || '',
    // Nur mitgeschickt, wenn jemand angemeldet ist. Der Server
    // prüft das JWT selbst und leitet die User-ID daraus ab — er
    // übernimmt sie nie aus dem Rumpf.
    access_token: window.__accessToken || null
  });

  const view = (token) => rpc('skill_view', { p_token: token });
  const sig  = (token) => rpc('skill_sig',  { p_token: token });

  /* ─── Poller ────────────────────────────────────────────── */
  // opts: { sig(), view(), onChange(data), onError(err), interval }
  //
  // Ruht, solange der Reiter im Hintergrund ist, und holt beim
  // Zurückkommen sofort nach: ein zugeklapptes Tablet muss den
  // Server nicht alle drei Sekunden fragen, und beim Aufklappen
  // will niemand drei Sekunden auf den aktuellen Stand warten.
  function poll(opts) {
    let timer   = null;
    let stopped = false;
    let last    = null;
    let busy    = false;

    async function tick(force) {
      if (stopped || busy) return;
      if (!force && document.hidden) return;
      busy = true;
      try {
        const s = await opts.sig();
        if (stopped) return;
        if (!s || s.ok !== true) {
          opts.onError && opts.onError(s && s.error ? s.error : 'sig_failed');
          return;
        }
        if (s.sig === last && !force) return;
        const full = await opts.view();
        if (stopped) return;
        if (!full || full.ok !== true) {
          opts.onError && opts.onError(full && full.error ? full.error : 'view_failed');
          return;
        }
        last = s.sig;
        opts.onChange && opts.onChange(full);
      } catch (e) {
        opts.onError && opts.onError(e.message || 'network');
      } finally {
        busy = false;
      }
    }

    function onVisible() { if (!document.hidden) tick(true); }
    document.addEventListener('visibilitychange', onVisible);

    timer = setInterval(() => tick(false), opts.interval || POLL_MS);
    tick(true);

    return {
      refresh: () => tick(true),
      // Nach einer eigenen Änderung: die gemerkte Signatur
      // vergessen, damit der nächste Durchlauf sicher neu lädt.
      invalidate: () => { last = null; },
      stop: () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }

  /* ─── Kleinkram ─────────────────────────────────────────── */
  const CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

  // Aus einer beliebigen Eingabe einen Code machen: Groß-/
  // Kleinschreibung egal, Leerzeichen und Bindestriche fliegen
  // raus. Wer den Code von der Tafel abtippt, tippt ihn nicht
  // formatiert.
  //
  // O→0 wird bewusst NICHT ersetzt: das Alphabet enthält weder O
  // noch 0, ein O ist also immer ein Tippfehler und keine Ziffer.
  function normalizeCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  }
  const isCode = (c) => CODE_RE.test(c);

  // Die Adresse, die im QR-Code steht. Der Code steht im Hash und
  // nicht im Query-String: so landet er nicht in Server-Logs.
  function joinUrl(code) {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    return base + 'j.html#' + String(code).toUpperCase();
  }

  // „läuft ab in 43 Tagen" — Restlaufzeit für die Raumliste.
  function untilText(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (!isFinite(ms)) return '';
    if (ms <= 0) return 'abgelaufen';
    const days = Math.floor(ms / 86400000);
    if (days >= 2) return `noch ${days} Tage`;
    const hours = Math.floor(ms / 3600000);
    if (hours >= 2) return `noch ${hours} Stunden`;
    return 'läuft bald ab';
  }

  window.MPRoom = {
    list, get, remember, forget,
    rpc, peek, join, view, sig, poll,
    normalizeCode, isCode, joinUrl, untilText,
    CODE_RE, POLL_MS
  };
})();
