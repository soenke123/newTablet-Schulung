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

   ── Jeder Eintrag gehört jemandem ─────────────────────────────
   Ein Klassensatz-Tablet wird geteilt, und die Ablage ist eine
   pro Gerät. Deshalb steht an jedem Eintrag, WER ihn angelegt hat:
   eine User-ID, oder null für „ohne Anmeldung". Gelesen wird nur,
   was zur gerade angemeldeten Person passt — wer sich abmeldet,
   sieht seine Räume nicht mehr, und die nächste Person am Gerät
   sieht sie erst recht nicht.

   Die Trennung ist strikt und geht in beide Richtungen: die
   anonymen Räume des Geräts sind für einen Angemeldeten ebenso
   unsichtbar. Zwei Fragen, zwei Antworten — „was hat dieses Gerät
   gemacht" und „was habe ich gemacht" sind nicht dasselbe.

   Sie sitzt HIER und nicht in der Landing: j.html liest dieselbe
   Ablage, und eine Trennung, die nur auf einer von zwei Seiten
   gilt, ist keine.

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

  /* Wer sitzt gerade davor? null heißt „niemand angemeldet" — und
     ist damit selbst eine Identität, nämlich die des Geräts.

     Bewusst bei jedem Aufruf frisch aus der Session gelesen und
     nicht einmal gemerkt: An- und Abmelden passieren mitten in der
     Sitzung, und eine festgehaltene Kopie zeigte danach die Räume
     der vorigen Person. */
  const uid = () => window.getSessionUser?.()?.id ?? null;

  // Alteinträge ohne uid zählen als Geräte-Einträge. Sie stammen
  // aus der Zeit vor dieser Trennung und sind Testbestand.
  const isMine = (e) => (e.uid ?? null) === uid();

  const list   = () => readStore().filter(isMine);
  const get    = (code) => list().find(e => e.code === String(code || '').toUpperCase()) || null;

  // forget arbeitet auf der Rohschicht: gemeint ist immer ein
  // Eintrag, den der Aufrufer gerade in der Hand hat.
  const forget = (code) => {
    const up = String(code || '').toUpperCase();
    writeStore(readStore().filter(e => e.code !== up));
  };

  // Neueste zuerst — die Liste „Meine Räume" ist eine Chronik.
  function remember(entry) {
    const up   = String(entry.code).toUpperCase();
    const rest = readStore().filter(e => e.code !== up);
    const now  = Date.now();
    rest.unshift(Object.assign({}, entry, {
      code: up, uid: uid(), saved_at: now, seen_at: now
    }));
    writeStore(rest);
  }

  /* Zuletzt drin gewesen. Steht getrennt vom Beitrittsdatum, weil
     auf der Kachel „zuletzt besucht" steht — und wer seit drei
     Wochen jeden Tag in demselben Raum arbeitet, war nicht vor
     drei Wochen zuletzt drin. Beim Server macht das last_seen_at,
     hier dieser Aufruf beim Betreten eines Raums. */
  function touch(code) {
    const up   = String(code || '').toUpperCase();
    const all  = readStore();
    const hit  = all.find(e => e.code === up);
    if (!hit) return;
    hit.seen_at = Date.now();
    writeStore(all);
  }

  /* Einen Raum aus der eigenen Liste nehmen.

     Zwei Schritte, einer davon darf scheitern: der Server-Merker
     (0088) gilt der Liste eines angemeldeten Teilnehmers auf allen
     seinen Geräten, die Ablage hier gilt diesem Gerät. Kommt der
     Aufruf nicht durch, verschwindet der Raum trotzdem von hier —
     „weg" darf nicht am WLAN hängen. Für ein Gerät ohne Anmeldung
     ist der Aufruf ohnehin folgenlos, aber ein zweiter Codeweg für
     denselben Knopf wäre der teurere Preis. */
  async function leave(code) {
    const hit = get(code);
    if (hit?.token) {
      try { await rpc('skill_room_leave', { p_token: hit.token }); }
      catch (e) { console.warn('[mpskills] skill_room_leave:', e.message); }
    }
    forget(code);
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

  /* ─── Poller ────────────────────────────────────────────────
     opts: { sig(), view(), onChange(data), onError(err), onNet(state), interval }

     Ruht, solange der Reiter im Hintergrund ist, und holt beim
     Zurückkommen sofort nach: ein zugeklapptes Tablet muss den
     Server nicht alle drei Sekunden fragen, und beim Aufklappen
     will niemand drei Sekunden auf den aktuellen Stand warten.

     ── Verbindungsabbruch ──────────────────────────────────────
     Das Schulnetz fällt aus, das WLAN wechselt den Accesspoint,
     jemand geht mit dem Tablet um die Ecke. Dafür meldet der Poller
     'offline' und später wieder 'online' — getrennt von onError,
     weil das kein Fehler EINES Aufrufs ist, sondern ein Zustand.

     ZWEI aufeinanderfolgende Fehlversuche, nicht einer: ein
     einzelner Aussetzer ist im Schulnetz normal, und eine Warnung,
     die im Sekundentakt auf- und zugeht, liest bald niemand mehr.
     Sagt der Browser selbst, dass er offline ist (navigator.onLine),
     gilt das dagegen sofort — dann ist es kein Aussetzer.

     Der Poller läuft im Abbruch WEITER. Das ist der Punkt: die
     Rückkehr soll von selbst ankommen und kein Neuladen verlangen —
     eine Beamer-Ansicht lädt mitten in der Stunde niemand neu.     */
  function poll(opts) {
    let timer   = null;
    let stopped = false;
    let last    = null;
    let busy    = false;
    let fails   = 0;
    let offline = false;

    function setNet(down) {
      if (down === offline) return;
      offline = down;
      opts.onNet && opts.onNet(down ? 'offline' : 'online');
    }

    async function tick(force) {
      if (stopped || busy) return;
      if (!force && document.hidden) return;
      busy = true;
      try {
        const s = await opts.sig();
        if (stopped) return;
        if (!s || s.ok !== true) {
          // Der Server hat geantwortet — die Verbindung steht also,
          // auch wenn die Antwort ein Nein ist.
          fails = 0; setNet(false);
          opts.onError && opts.onError(s && s.error ? s.error : 'sig_failed');
          return;
        }
        fails = 0; setNet(false);
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
        // Hier landen Netzfehler UND HTTP-Fehler (siehe rpc()). Beides
        // heißt für den Benutzer dasselbe: gerade kommt nichts durch.
        fails++;
        if (fails >= 2) setNet(true);
        opts.onError && opts.onError(e.message || 'network');
      } finally {
        busy = false;
      }
    }

    function onVisible() { if (!document.hidden) tick(true); }
    // Der Browser weiß es oft früher als der nächste fehlgeschlagene
    // Aufruf — und beim Zurückkommen soll nicht bis zum nächsten Takt
    // gewartet werden.
    function onOffline() { fails = 2; setNet(true); }
    function onOnline()  { fails = 0; tick(true); }

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online',  onOnline);

    timer = setInterval(() => tick(false), opts.interval || POLL_MS);
    tick(true);

    return {
      refresh: () => tick(true),
      // Nach einer eigenen Änderung: die gemerkte Signatur
      // vergessen, damit der nächste Durchlauf sicher neu lädt.
      invalidate: () => { last = null; },
      isOffline: () => offline,
      stop: () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('offline', onOffline);
        window.removeEventListener('online',  onOnline);
        // Die Leiste gehört dem laufenden Poller: wer stoppt, räumt sie
        // ab, sonst bliebe sie über einer Seite stehen, die gar nicht
        // mehr fragt.
        if (offline) { offline = false; opts.onNet && opts.onNet('online'); }
      }
    };
  }

  /* ─── Verbindungs-Leiste ────────────────────────────────────
     Eine Zeile am oberen Rand, gemeinsam für Schüler- und
     Lehrerseite — derselbe Zustand soll überall gleich aussehen.

     Sie räumt die Seite ABSICHTLICH nicht ab: was zuletzt da war,
     bleibt stehen. Ein leerer Beamer mitten in der Stunde ist
     schlimmer als ein Bild, das ein paar Sekunden alt ist, und ein
     Schüler soll seinen halb getippten Zettel nicht verlieren, weil
     das WLAN kurz gehustet hat. */
  function showNet(state) {
    let bar = document.getElementById('netbar');
    if (state !== 'offline') {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'netbar';
      bar.className = 'netbar';
      bar.setAttribute('role', 'status');
      bar.innerHTML = '<span class="netbar-dot" aria-hidden="true"></span>'
        + 'Keine Verbindung — angezeigt wird der letzte Stand. '
        + 'Es geht von selbst weiter, sobald das Netz zurück ist.';
      document.body.appendChild(bar);
    }
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

  /* „vor 3 Stunden" — die andere Richtung, für die besuchten Räume
     auf der Landing. Bewusst grob: die Frage dahinter ist „welcher
     war das nochmal?", und die beantwortet man nicht auf die
     Minute. Ab einer Woche steht das Datum da, weil „vor 23 Tagen"
     niemand in einen Wochentag zurückrechnet. */
  function agoText(ts) {
    if (!ts) return '';
    const ms = Date.now() - Number(ts);
    if (!isFinite(ms) || ms < 0) return '';
    const min = Math.floor(ms / 60000);
    if (min < 2)  return 'gerade eben';
    if (min < 60) return `vor ${min} Minuten`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `vor ${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'gestern';
    if (days < 7)   return `vor ${days} Tagen`;
    return 'am ' + new Date(Number(ts)).toLocaleDateString('de-DE',
      { day: '2-digit', month: '2-digit' });
  }

  window.MPRoom = {
    list, get, remember, forget, touch, leave, uid,
    rpc, peek, join, view, sig, poll, showNet,
    normalizeCode, isCode, joinUrl, untilText, agoText,
    CODE_RE, POLL_MS
  };
})();
