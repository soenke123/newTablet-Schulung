/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Definitions Derby"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Begriffe und Definitionen als Karten (Migration 0233, Beta).
   Lehrkräfte legen STAPEL an (Titel, Fach, Thema, Klassenstufe,
   Karten aus Begriff · Definition · Bild), teilen sie mit dem Raum,
   und die Klasse übt sie mit SPIELEN. Plan und Entscheidungen:
   CLAUDE.md in diesem Ordner.

   ── Startseite: erst die Lernformen, dann die Stapel ─────────
   Oben/links kleine Kacheln mit den LERNFORMEN (intern GAMES),
   Übersicht zuerst, gegliedert in Allein · Gemeinsam an einem
   Gerät · Zusammen im Netz (GAMES/GROUPS). Kachel antippen startet
   sie, „i“ zeigt die Beschreibung mit Bildschirmfoto (img/), das
   Teilen-Symbol hat nur die Lehrkraft. Darunter/rechts die Stapel
   (Lehrkraft: eigene, mit Bearbeiten/Teilen; Tablet: die geteilten).
   Ausgewählt wird auf der Startseite nichts mehr (Sönke 29.10.2026):
   Stapel antippen springt in die vorderste Lernform (firstForm), nur
   mit diesem Stapel. In der Lernform stehen oben ALLE Stapel mit
   ihrer Begriffszahl, antippen schaltet sie an/aus (sel, im Gerät
   gemerkt). Auf der Insel geht das auch links an den Familien.

   ── Wer sieht was ────────────────────────────────────────────
   presenter (Lehrkraft, lehrer.html)  eigene Stapel aus dem Konto
        (dd_stacks_list/get/save/delete), anlegen/ändern/löschen,
        Stapel und Spiele mit dem Raum teilen, und selbst spielen.
   participant (Tablet, j.html)         die geteilten Stapel und
        Spiele dieses Raums (dd_shared_get).
   Geteilt wird über skill_room_state.data:
        shared: [{id,t,n,s,p,g,u}]   Stapel (siehe CLAUDE.md)
        games:  ['cards', …]          Spiele; fehlt der Schlüssel
                (Räume von vor den Spielen), gelten Karteikarten
                und Übersicht als geteilt (DEFAULT_GAMES).

   ── Lernstand ────────────────────────────────────────────────
   Je Karte unsicher · teilweise · sicher (oder neu), gesetzt von
   der Person selbst NACH dem Umdrehen. Er bestimmt, wie oft eine
   Karte wiederkommt (weight()) und wie die Übersicht ordnet.
   Gespeichert wird er je STAPEL; im Spiel mit mehreren Stapeln
   heißen die Karten „<stapel>:<karte>“ und prog hält alle
   zusammen (buildProg/stackProg teilen wieder auf).

   Die Arbeitskopie liegt immer im localStorage des Geräts
   (dd.p.<stapel>) — schnell und auch ohne Netz. MIT KONTO wird sie
   zusätzlich in dd_progress gespiegelt (Migration 0234): beim
   Öffnen eines Stapels holen + je Karte zusammenführen (die neuere
   Zeit t gewinnt), nach jeder Bewertung gedrosselt zurückschreiben.
   Ohne Konto (Gast im Raum) antwortet der Server 'no_account', und
   alles bleibt beim Gerät. „Zurück auf neu“ ist ein Grabstein
   (l = 0), kein Löschen — sonst weckt ein älterer Stand auf einem
   anderen Gerät die Karte wieder auf. Memory schreibt KEINEN
   Lernstand: zwei spielen an einem Gerät, das Konto gehört einer.
   Die Insel (Etappe 3) führt ihre Stufe im SELBEN Eintrag: e (0…5)
   und x (Fehler in Folge) neben l/s — wer einen Eintrag schreibt,
   behält die Felder der anderen (Object.assign), sonst löscht eine
   Karteikarten-Bewertung das gewachsene Wesen.

   ── Ohne Raum (derby.html) ───────────────────────────────────
   ctx.standalone: dieselbe Lehrkraft-Ansicht, aber ohne Teilen —
   Stapel vorbereiten, selbst spielen. Die Seite baut ctx.actions
   selbst (Aufrufe ohne Raum-Code).

   ── Aufbau dieser Datei ──────────────────────────────────────
   Eine Zustandsmaschine: screen = home | play | edit, dazu die
   Beschreibung einer Lernform als Fenster darüber (info, .dd-layer).
   render…() baut die Ansicht neu; getippt wird NIE in einem Teil,
   der während des Tippens neu gebaut wird (Editor und Suche
   aktualisieren nur ihre Listen). update() des Systems kommt
   alle paar Sekunden und baut nur die Startseite neu, und auch
   die nur, wenn sich Geteiltes geändert hat.
   Klassen heißen dd-… (tool.css).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261030g';
  const BASE = 'tools/DefinitionsDerby/';
  const MAX_SHARED = 20;          // data.shared muss in 8 KB passen
  const LEVELS = ['neu', 'unsicher', 'teilweise', 'sicher'];
  const FAECHER = ['Mathematik', 'Deutsch', 'Englisch', 'Biologie', 'Physik', 'Chemie', 'Informatik',
                   'Geschichte', 'Geografie', 'Politik & Gesellschaft', 'Religion & Ethik', 'Musik',
                   'Kunst', 'Sport', 'Wirtschaft', 'Sachunterricht', 'Allgemeinwissen'];
  const STUFEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];

  /* ─── Lernformen (im Code „Spiele“, GAMES) ───
     Neue Lernform: Eintrag hier (Reihenfolge = Startseite, die erste
     freigegebene öffnet ein angetippter Stapel), Mini-Bild in MINI,
     Bildschirmfoto in img/, render-Zweig in renderPane(). Sie bekommt
     opened.cards (alle Karten der aktiven Stapel) und schreibt
     Lernstand, wenn überhaupt, nur über prog/saveProg. */
  const GROUPS = [
    { id: 'solo',   name: 'Allein' },
    { id: 'device', name: 'Gemeinsam an einem Gerät' },
    { id: 'net',    name: 'Zusammen im Netz' }
  ];
  const GAMES = [
    { id: 'overview', g: 'solo', name: 'Übersicht', min: 1, shot: 'spiel-uebersicht.jpg',
      short: 'Alle Begriffe als Glossar – suchen, filtern, verdecken.',
      text: 'Alle Karten der aktiven Stapel auf einen Blick, geordnet nach Lernstand. Zum Nachschlagen, Wiederholen und für den schnellen Selbsttest.',
      how: ['Suchen in Begriff und Definition.',
            'Filtern und ordnen nach Lernstand, A–Z oder Stapel.',
            '„Definitionen verdecken“ zum Selbsttest – antippen deckt auf.',
            'Den Lernstand direkt an der Karte ändern.'] },
    { id: 'cards', g: 'solo', name: 'Karteikarten', min: 1, shot: 'spiel-karteikarten.jpg',
      short: 'Umdrehen, selbst stempeln – Unsicheres kommt öfter.',
      text: 'Eine Karte nach der anderen: erst überlegen, dann umdrehen und ehrlich stempeln. Unsichere Karten kommen öfter wieder, sichere seltener – so übt man genau das, was noch fehlt.',
      how: ['Karte antippen (oder Leertaste) dreht sie um.',
            'Danach stempeln: Unsicher, Teilweise oder Sicher (Tasten 1–3).',
            'Richtung wählbar: Begriff → Definition, umgekehrt oder gemischt.',
            'Der Lernstand bleibt gespeichert – mit Konto auf jedem Gerät.'] },
    { id: 'island', g: 'solo', name: 'Insel', min: 2, room: true, shot: 'spiel-insel.jpg',
      short: 'Jeder Begriff ist ein Wesen: vom Ei bis zum Leuchten.',
      text: 'Alle Begriffe des Raums leben als Wesen auf einer Insel, jeder Stapel ist eine Familie in eigener Farbe. Wer Aufgaben löst, lässt die Eier schlüpfen und die Wesen wachsen – bis sie leuchten. Die Aufgaben werden mit jeder Stufe schwerer.',
      how: ['„Runde starten“: jeder Begriff einmal. Was falsch war, kommt in der Runde noch einmal – und ist es wieder falsch, auch in der nächsten.',
            'Welche Stapel in der Runde dran sind: oben an den Stapeln oder links an den Familien an- und ausschalten.',
            'Ein Wesen auf der Insel antippen, um genau dieses zu trainieren.',
            'Ei → Baby: zur Definition den Begriff wählen. Baby → Klein: zum Begriff die Definition wählen.',
            'Klein → Mittel: die Definition aus Bausteinen bauen. Mittel → Groß: den Begriff eintippen.',
            'Groß → Leuchtend: Lücken in der Definition füllen (Anfangsbuchstabe und Länge stehen da). Kleine Tippfehler sind kein Problem.',
            'Leuchtende Wesen bleiben dabei: sie bekommen eine zufällige der fünf Aufgaben.',
            'Einmal richtig = eine Stufe hoch, zweimal hintereinander falsch = eine Stufe zurück.'] },
    { id: 'memory', g: 'device', name: 'Memory', min: 2, shot: 'spiel-memory.jpg',
      short: 'Zu zweit: Begriff und passende Definition finden.',
      text: 'Links liegen die Begriffe, rechts die Definitionen, alle verdeckt. Wer dran ist, deckt einen Begriff und eine Definition auf. Beide Karten kommen groß in die Mitte, und dann wird entschieden: Passen sie zusammen?',
      how: ['Je Zug eine Karte links und eine rechts aufdecken.',
            '„Ja, Paar!“ – stimmt es, gibt es einen Punkt, und man ist noch einmal dran.',
            '„Ja, Paar!“, aber es ist keins: ein Minuspunkt, die andere Person ist dran.',
            '„Nein“: die andere Person ist dran. Ob es doch ein Paar war, wird nicht verraten.',
            'Zu zweit oder allein (dann zählen die Züge), 6 bis 24 Paare.'] },
    { id: 'duel', g: 'device', name: 'Duell', min: 3, shot: 'spiel-duell.jpg',
      short: 'Zu zweit gleichzeitig: wer zieht schneller den richtigen Begriff?',
      text: 'In der Mitte liegen die Begriffe durcheinander. Links und rechts bekommt jede Person eine eigene Definition und zieht so schnell wie möglich den passenden Begriff zu sich. Beide spielen gleichzeitig – das braucht ein Tablet, das zwei Finger auf einmal erkennt.',
      how: ['Links spielt Spieler 1, rechts Spieler 2, beide zur selben Zeit.',
            'Den passenden Begriff aus der Mitte auf die eigene Seite ziehen.',
            'Richtig: ein Punkt und die nächste Definition.',
            'Falsch: eine andere Definition, und die eigene Seite ist kurz gesperrt.',
            'Wer zuerst 5 Begriffe richtig hat, gewinnt (einstellbar: 3 bis 10).',
            'Am Ende stehen alle Definitionen der Runde mit ihrem Begriff da.'] },
    { id: 'storm', g: 'net', name: 'Kistensturm', min: 4, net: true, shot: 'spiel-kistensturm.jpg',
      short: 'Teams stapeln um die Wette – jede richtige Antwort ist eine Kiste.',
      text: 'Die Klasse spielt in Teams gegeneinander, jedes Tablet für sich. Jede richtige Antwort ist eine Kiste für das eigene Team: die Teamfigur hebt den Turm an, und darunter rutscht die neue Kiste hinein. Wer zuerst die Zielhöhe erreicht, gewinnt. Am Beamer sieht man alle Türme wachsen.',
      how: ['Die Lehrkraft öffnet Kistensturm am Beamer, wählt die Teams (Figuren), Zielhöhe und Stapel und startet.',
            'Die Klasse kommt über „Mitmachen“ dazu, die Teams werden automatisch verteilt.',
            'Jede richtige Antwort ist eine Kiste für das eigene Team. Falsch kostet nichts, nur einen Moment Zeit.',
            'Je höher der eigene Turm, desto schwerer die Aufgaben – vom Begriff wählen bis zum Lückentext. Wer hinten liegt, holt so leichter auf.',
            'Wer zuerst die Zielhöhe erreicht, gewinnt. Setzt die Lehrkraft im Spiel ein Rundenende, gewinnt bei Zeitende der höchste Turm.',
            'Items wie bei Mario Kart: Überquert der Turm eine gestrichelte Linie, bekommt das Team ein Item – je weiter hinten, desto stärker (Möwe, Bus, Boom, Teatime …). Jeder im Team kann es einsetzen.',
            'Die Lehrkraft schaltet Items in der Lobby an oder aus, jedes einzeln, und kann „häufig“ wählen.'] }
  ];
  const DEFAULT_GAMES = ['overview', 'cards'];
  const gameOf = id => GAMES.find(g => g.id === id) || null;

  const OWN_ERRORS = {
    not_shared:    'Dieser Stapel ist nicht (mehr) geteilt.',
    not_a_teacher: 'Stapel anlegen können nur Lehrkräfte.',
    quota_exceeded:'Du hast die Höchstzahl an Stapeln erreicht (100).',
    invalid_input: 'Eine Karte ist unvollständig oder zu lang (Begriff 120, Definition 1200 Zeichen).',
    payload_too_big: 'Der Stapel ist zu groß — am meisten Platz brauchen Bilder.'
  };

  /* ─── Zustand ─── */
  let root = null, ctx = null, view = null;
  let isTeacher = false, demo = false, standalone = false;
  let acct = null;               // null = unbekannt · true = Lernstand im Konto · false = nur im Gerät
  let remoteSum = {};            // id → { sum, t } aus dd_prog_list
  let pushTimer = null;
  const dirty = new Set();       // Stapel, deren Lernstand noch zum Konto muss
  let screen = 'home';
  let list = null;               // Stapelliste (null = lädt)
  let listErr = '';
  let cache = {};                // id → { u, stack }
  let sel = null;                // aktive Stapel (ids, im Gerät gemerkt); null = Standard (activeIds)
  let info = null;               // id der Lernform, deren Beschreibung offen ist
  let opened = null;             // { stacks, cards, game } — das laufende Spiel
  let prog = {};                 // Lernstand der Karten im Spiel („<stapel>:<karte>“ → {l,s,t})
  let learn = null;              // Zustand des Lerners
  let ov = null;                 // Zustand der Übersicht
  let mm = null;                 // Zustand des Memorys
  let du = null;                 // Zustand des Duells
  let ed = null;                 // Zustand des Editors
  let homeFilter = { q: '', fach: '' };
  let lastSharedKey = '';
  let onKey = null, onClick = null, onInput = null, onChange = null, onResize = null, onFs = null;
  let parseReady = null;
  const mem = {};                // Ersatz für localStorage (Schaufenster, gesperrter Speicher)
  const E = s => (ctx ? ctx.esc(s) : String(s ?? ''));

  /* ─── Speicher im Gerät ─── */
  const store = {
    get(k) {
      if (!demo) { try { const v = localStorage.getItem(k); if (v != null) return v; } catch (e) { /* weiter */ } }
      return mem[k] != null ? mem[k] : null;
    },
    set(k, v) {
      mem[k] = v;
      if (demo) return;
      try { localStorage.setItem(k, v); } catch (e) { /* bleibt im Arbeitsspeicher */ }
    }
  };
  const jget = (k, d) => { try { const v = store.get(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => store.set(k, JSON.stringify(v));

  function loadProg(id) {
    const p = jget('dd.p.' + id, {});
    return p && typeof p === 'object' ? p : {};
  }
  function counts(stack, p) {
    const c = [0, 0, 0, 0];
    for (const k of stack.cards) { const e = p[k.id]; c[e && e.l >= 1 && e.l <= 3 ? e.l : 0]++; }
    return c;
  }
  /* Lernstand des Spiels aus den Ständen der einzelnen Stapel … */
  function buildProg() {
    prog = {};
    for (const s of opened.stacks) {
      const p = loadProg(s.id);
      for (const k of Object.keys(p)) prog[s.id + ':' + k] = p[k];
    }
  }
  /* … und zurück: der Stand eines Stapels, nur Karten, die es noch gibt. */
  function stackProg(s) {
    const p = {};
    for (const c of s.cards) { const e = prog[s.id + ':' + c.id]; if (e) p[c.id] = e; }
    return p;
  }
  function saveProg(onlyId) {
    if (!opened) return;
    for (const s of opened.stacks) {
      if (onlyId && s.id !== onlyId) continue;
      const p = stackProg(s);
      jset('dd.p.' + s.id, p);
      jset('dd.sum.' + s.id, { n: s.cards.length, c: counts(s, p), t: Date.now() });
      dirty.add(s.id);
    }
    schedulePush();
  }
  const sidOf = key => String(key).split(':')[0];

  /* ─── Lernstand im Konto ─── */
  const progFn = n => (isTeacher ? 'dd_prog_' : 'dd_mprog_') + n;
  const syncOn = () => !demo && acct !== false && !!ctx;
  function noAccount(code) {
    if (code === 'no_account' || code === 'not_authenticated') { acct = false; return true; }
    return false;
  }
  function mergeProg(a, b) {
    const out = Object.assign({}, a);
    for (const k of Object.keys(b || {})) {
      const x = out[k], y = b[k];
      if (!y || typeof y !== 'object') continue;
      if (!x || (y.t || 0) > (x.t || 0)) out[k] = y;
    }
    return out;
  }
  async function pullProg(id) {
    if (!syncOn()) return;
    const res = await ctx.actions.call(progFn('get'), { p_stack: id });
    if (!root || !opened) return;
    const s = opened.stacks.find(x => x.id === id);
    if (!s) return;
    if (res.ok) {
      acct = true;
      const cur = stackProg(s);
      const merged = mergeProg(cur, res.data);
      if (JSON.stringify(merged) !== JSON.stringify(cur)) {
        for (const k of Object.keys(merged)) prog[id + ':' + k] = merged[k];
        saveProg(id);
      }
    } else noAccount(res.error);
    // Neu zeichnen nur, wo es nichts kaputt macht: nicht mitten im Memory/Duell, nicht bei umgedrehter Karte.
    if (screen !== 'play') return;
    if (opened.game === 'island') islRefresh();
    else if (opened.game !== 'memory' && opened.game !== 'duel' && !(learn && learn.flipped)) renderPane();
  }
  function schedulePush() {
    if (!syncOn() || !opened) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushProg, 1500);
  }
  async function pushProg() {
    clearTimeout(pushTimer); pushTimer = null;
    if (!syncOn() || !opened) { dirty.clear(); return; }
    // Alles vorher einsammeln: unmount räumt ctx und opened ab, während das hier noch läuft.
    const call = ctx.actions.call;
    const todo = opened.stacks.filter(s => dirty.has(s.id))
      .map(s => { const p = stackProg(s); return { p_stack: s.id, p_data: p, p_sum: { n: s.cards.length, c: counts(s, p) } }; });
    dirty.clear();
    for (const args of todo) {
      const res = await call(progFn('put'), args);
      if (!res.ok && !noAccount(res.error)) console.warn('[derby] Lernstand nicht gespeichert:', res.error);
      else if (res.ok) acct = true;
    }
  }
  async function pullSums() {
    if (!syncOn()) return;
    const res = await ctx.actions.call(progFn('list'), {});
    if (!root) return;
    if (!res.ok) { noAccount(res.error); if (screen === 'home') renderHome(); return; }
    acct = true;
    remoteSum = {};
    for (const it of res.items || []) remoteSum[it.id] = { sum: it.sum, t: Number(it.t) || 0 };
    if (screen === 'home') renderHome();
  }
  const acctNote = () => demo ? '' : acct === true
    ? '<p class="dd-acct dd-acct--on">Dein Lernstand wird in deinem Konto gespeichert und ist auf jedem Gerät da.</p>'
    : acct === false
      ? '<p class="dd-acct">Ohne Anmeldung bleibt dein Lernstand auf diesem Gerät.</p>' : '';

  /* ─── Helfer ─── */
  const okImg = s => typeof s === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
  const newId = () => 'k' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const toast = m => { if (ctx && ctx.toast) ctx.toast(m); };
  const errMsg = code => OWN_ERRORS[code] || (ctx ? ctx.errText(code) : String(code));
  const sortKey = s => String(s || '').toLocaleLowerCase('de');
  const meta = s => [s.subject, s.topic, s.grade ? 'Klasse ' + s.grade : ''].filter(Boolean);
  const metaChips = s => meta(s).map(m => '<span class="dd-chip">' + E(m) + '</span>').join('');
  const kart = n => n + (n === 1 ? ' Karte' : ' Karten');
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const ico = {
    back:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    plus:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    edit:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/></svg>',
    img:   '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"/></svg>',
    up:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    down:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    flip:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    play:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    info:  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    again: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15"/></svg>',
    full:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
    unfull:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.5l3 2M10 3h4"/></svg>'
  };

  /* Kleine Darstellung des Spiels auf der Kachel (nur CSS, tool.css .dd-mini). */
  const MINI = {
    cards: '<span class="dd-mini dd-mini--cards" aria-hidden="true"><i class="dd-mini__card"><b></b><u></u></i>' +
           '<i class="dd-mini__st dd-mini__st--1"></i><i class="dd-mini__st dd-mini__st--2"></i><i class="dd-mini__st dd-mini__st--3"></i></span>',
    overview: '<span class="dd-mini dd-mini--ov" aria-hidden="true">' +
           [1, 2, 3, 0].map(l => '<i><em class="dd-s' + l + '"></em><b></b><u></u></i>').join('') + '</span>',
    memory: '<span class="dd-mini dd-mini--mem" aria-hidden="true">' +
           ['t', 'd'].map(s => '<span class="dd-mini__side dd-mini__side--' + s + '">' +
             [0, 1, 2, 3, 4, 5].map(i => '<i' + (i === (s === 't' ? 1 : 4) ? ' class="is-up"' : '') + '></i>').join('') + '</span>').join('') + '</span>',
    duel: '<span class="dd-mini dd-mini--duel" aria-hidden="true"><i class="dd-mini__def"></i>' +
           '<span class="dd-mini__pool">' + [1, 2, 3, 4, 5, 6].map(i => '<i class="dd-mini__chip dd-mini__chip--' + i + '"></i>').join('') + '</span>' +
           '<i class="dd-mini__def dd-mini__def--2"></i></span>',
    storm: '<span class="dd-mini dd-mini--storm" aria-hidden="true">' +
           [[3, 1], [5, 2], [2, 3], [4, 4]].map(([h, c]) => '<span class="dd-mini__tw dd-mini__tw--' + c + '">' + '<i></i>'.repeat(h) + '</span>').join('') +
           '<i class="dd-mini__goal"></i></span>',
    island: '<span class="dd-mini dd-mini--isl" aria-hidden="true"><span class="dd-mini__land"></span>' +
           [1, 2, 3, 4, 5, 6].map(i => '<i class="dd-mini__w dd-mini__w--' + i + '"></i>').join('') + '</span>'
  };

  /* ─── Quelle der Stapel: Lehrkraft (Konto) · Teilnehmer (geteilt) · Schaufenster ─── */
  const DEMO_STACKS = () => ([
    { id: 'demo-zelle', title: 'Die Zelle', subject: 'Biologie', topic: 'Aufbau der Zelle', grade: '7',
      updated_at: '2026-10-20', cards: [
        { id: 'a1', t: 'Zellkern', d: 'Steuerzentrale der Zelle; enthält die Erbinformation (DNA).' },
        { id: 'a2', t: 'Mitochondrium', d: 'Kraftwerk der Zelle: setzt aus Traubenzucker und Sauerstoff Energie frei.' },
        { id: 'a3', t: 'Ribosom', d: 'Bildet aus Aminosäuren Eiweiße (Proteinbiosynthese).' },
        { id: 'a4', t: 'Zellmembran', d: 'Dünne Haut um die Zelle; regelt, was hinein- und hinausdarf.' },
        { id: 'a5', t: 'Zellwand', d: 'Feste Hülle um pflanzliche Zellen; gibt Halt und Form.' },
        { id: 'a6', t: 'Chloroplast', d: 'Zellorganell der Pflanzen, in dem die Photosynthese stattfindet.' },
        { id: 'a7', t: 'Vakuole', d: 'Gefüllter Raum der Pflanzenzelle; speichert Wasser und Stoffe.' },
        { id: 'a8', t: 'Zytoplasma', d: 'Flüssige Grundsubstanz im Inneren der Zelle.' }
      ] },
    { id: 'demo-brueche', title: 'Brüche', subject: 'Mathematik', topic: 'Bruchrechnung', grade: '6',
      updated_at: '2026-10-18', cards: [
        { id: 'b1', t: 'Zähler', d: 'Die Zahl über dem Bruchstrich; sie sagt, wie viele Teile genommen werden.' },
        { id: 'b2', t: 'Nenner', d: 'Die Zahl unter dem Bruchstrich; sie sagt, in wie viele gleiche Teile das Ganze geteilt ist.' },
        { id: 'b3', t: 'Kürzen', d: 'Zähler und Nenner durch dieselbe Zahl teilen; der Wert bleibt gleich.' },
        { id: 'b4', t: 'Erweitern', d: 'Zähler und Nenner mit derselben Zahl malnehmen; der Wert bleibt gleich.' },
        { id: 'b5', t: 'Gleichnamig', d: 'Brüche mit demselben Nenner.' },
        { id: 'b6', t: 'Kehrbruch', d: 'Der Bruch, bei dem Zähler und Nenner vertauscht sind.' }
      ] }
  ]);
  let demoStacks = null;

  const src = {
    async list() {
      if (demo) { demoStacks = demoStacks || DEMO_STACKS(); return { ok: true, items: demoStacks.map(summary) }; }
      if (isTeacher) return ctx.actions.call('dd_stacks_list', {});
      return { ok: true, items: sharedList() };
    },
    async get(id) {
      if (demo) {
        const s = (demoStacks || (demoStacks = DEMO_STACKS())).find(x => x.id === id);
        return s ? Object.assign({ ok: true }, JSON.parse(JSON.stringify(s))) : { ok: false, error: 'not_found' };
      }
      return ctx.actions.call(isTeacher ? 'dd_stack_get' : 'dd_shared_get', { p_id: id });
    },
    async save(s) {
      if (demo) {
        demoStacks = demoStacks || DEMO_STACKS();
        const id = s.id || 'demo-' + Math.random().toString(36).slice(2, 8);
        const rec = { id, title: s.title, subject: s.subject, topic: s.topic, grade: s.grade,
                      cards: s.cards, updated_at: new Date().toISOString() };
        const i = demoStacks.findIndex(x => x.id === id);
        if (i >= 0) demoStacks[i] = rec; else demoStacks.unshift(rec);
        return { ok: true, id, created: i < 0 };
      }
      return ctx.actions.call('dd_stack_save', {
        p_id: s.id || null, p_title: s.title, p_subject: s.subject, p_topic: s.topic,
        p_grade: s.grade, p_cards: s.cards });
    },
    async del(id) {
      if (demo) { demoStacks = (demoStacks || []).filter(x => x.id !== id); return { ok: true }; }
      return ctx.actions.call('dd_stack_delete', { p_id: id });
    }
  };
  const summary = s => ({ id: s.id, title: s.title, subject: s.subject, topic: s.topic, grade: s.grade,
                          n: s.cards.length, updated_at: s.updated_at });

  /* Geteiltes aus dem Raumzustand (Teilnehmer lesen, Lehrkraft schreibt). */
  const roomData = () => (view && view.state && view.state.data && typeof view.state.data === 'object') ? view.state.data : {};
  function sharedRaw() { const s = roomData().shared; return Array.isArray(s) ? s : []; }
  function sharedList() {
    return sharedRaw().filter(e => e && typeof e.id === 'string').map(e => ({
      id: e.id, title: e.t || 'Stapel', subject: e.s || '', topic: e.p || '', grade: e.g || '',
      n: Number(e.n) || 0, u: e.u || '' }));
  }
  const isShared = id => sharedRaw().some(e => e && e.id === id);
  function sharedGames() {
    const g = roomData().games;
    return Array.isArray(g) ? g.filter(x => gameOf(x)) : DEFAULT_GAMES.slice();
  }
  const gameShared = id => sharedGames().includes(id);
  /* Welche Spiele diese Ansicht zeigt: Lehrkraft alle, Tablet nur geteilte. */
  const visibleGames = () => (isTeacher ? GAMES : GAMES.filter(g => gameShared(g.id)))
    .filter(g => !(g.net && (standalone || demo)));   // Zusammen im Netz geht nur im Raum

  async function writeData(patch) {
    const next = Object.assign({}, roomData(), patch);
    if (demo) { view = Object.assign({}, view || {}, { state: Object.assign({}, (view && view.state) || {}, { data: next }) }); return { ok: true }; }
    // Gleich lokal einsetzen, damit der nächste Takt nicht das Alte zurückschickt.
    if (view) view.state = Object.assign({}, view.state || {}, { data: next });
    const res = await ctx.actions.setData(next);
    ctx.refresh();
    return res;
  }
  const writeShared = shared => writeData({ shared });
  const entryOf = s => ({ id: s.id, t: String(s.title || '').slice(0, 80), n: s.n != null ? s.n : (s.cards ? s.cards.length : 0),
                          s: String(s.subject || '').slice(0, 40), p: String(s.topic || '').slice(0, 50),
                          g: String(s.grade || '').slice(0, 10), u: Date.now().toString(36) });

  async function toggleShare(id) {
    const it = (list || []).find(x => x.id === id);
    if (!it) return;
    const cur = sharedRaw();
    if (cur.some(e => e.id === id)) {
      const res = await writeShared(cur.filter(e => e.id !== id));
      if (!res.ok) toast(errMsg(res.error));
    } else {
      if (cur.length >= MAX_SHARED) { toast('Mehr als ' + MAX_SHARED + ' Stapel gleichzeitig passen nicht in einen Raum. Nimm erst einen zurück.'); return; }
      const res = await writeShared(cur.concat([entryOf(it)]));
      if (!res.ok) toast(errMsg(res.error));
    }
    if (screen === 'home') renderHome();
  }

  async function toggleGame(id) {
    if (!gameOf(id)) return;
    const cur = sharedGames();
    const on = !cur.includes(id);
    const res = await writeData({ games: on ? cur.concat([id]) : cur.filter(x => x !== id) });
    if (!res.ok) toast(errMsg(res.error));
    else toast(gameOf(id).name + (on ? ' ist für die Klasse freigegeben.' : ' ist für die Klasse zurückgenommen.'));
    if (screen === 'home') renderHome();
    if (info === id) renderInfo();
  }

  /* ─── Wechsel zwischen Ansichten ─── */
  function go(s) {
    if (s !== 'play') leavePlay();
    screen = s;
    if (s === 'home') renderHome();
    else if (s === 'play') renderPlay();
    else if (s === 'edit') renderEdit();
    stBanner();
  }
  /* Spiel verlassen: Lernstand noch weg, Vollbild zu, Memory-Takte ins Leere laufen lassen. */
  function leavePlay() {
    if (!opened) return;
    if (pushTimer) pushProg();
    if (fsEl()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* egal */ } }
    islStop();
    duStop();
    stStop();
    opened = null; mm = null; du = null; learn = null; ov = null;
  }

  async function loadList() {
    list = null; listErr = '';
    if (screen === 'home') renderHome();
    const res = await src.list();
    if (!root) return;
    if (res.ok) list = res.items || []; else { list = []; listErr = errMsg(res.error); }
    if (screen === 'home') renderHome();
  }

  /* Einen Stapel holen (aus dem Speicher, solange sein Stempel u stimmt). */
  async function getStack(id) {
    const known = (list || []).find(x => x.id === id);
    const hit = cache[id];
    if (hit && (!known || !known.u || hit.u === known.u)) return hit.stack;
    const res = await src.get(id);
    if (!res.ok) { toast(errMsg(res.error)); return null; }
    const stack = { id: res.id || id, title: res.title, subject: res.subject, topic: res.topic, grade: res.grade,
                    cards: (res.cards || []).filter(c => c && c.id && c.t), updated_at: res.updated_at };
    cache[id] = { u: known ? known.u : '', stack };
    return stack;
  }
  function busy(on) { if (root) root.classList.toggle('dd-busy', !!on); }

  /* ─── Aktive Stapel ───
     Welche Stapel in einer Lernform mitmachen. Standard: alle des Raums
     (islandIds). Wer oben in der Lernform einen Stapel an- oder
     ausschaltet oder auf der Startseite einen Stapel antippt, setzt
     sel; gemerkt im Gerät, damit die nächste Lernform genauso startet.
     Mindestens einer bleibt immer an. */
  const SEL = 'dd.sel';
  function activeIds() {
    const have = (list || []).map(x => x.id);
    const s = (sel || []).filter(id => have.includes(id));
    return s.length ? s : islandIds();
  }
  function setSel(ids) { sel = ids.slice(); jset(SEL, sel); }
  /* Was eine Lernform lädt: die aktiven Stapel; die Insel alle des Raums
     dazu (dort leben alle, in die Runde kommen nur die aktiven). */
  function formIds(G) {
    const act = activeIds();
    if (!G.room) return act;
    const base = islandIds();
    return (list || []).map(x => x.id).filter(id => act.includes(id) || base.includes(id));
  }
  /* Die Lernform, die auf der Startseite ganz vorn steht (Reihenfolge wie
     gamesHTML: nach GROUPS, darin nach GAMES) und mit n Karten geht. Die
     Klasse sieht nur Geteiltes, die Lehrkraft alle — auch nicht geteilte
     (Sönke 29.10.2026: „immer die erste Lernform, die ganz vorne steht“). */
  function firstForm(n) {
    const shown = visibleGames();
    const gs = GROUPS.flatMap(grp => shown.filter(g => g.g === grp.id));
    return gs.find(g => n >= g.min) || gs[0] || null;
  }

  /* Lernform mit den aktiven Stapeln starten. keep = dieselbe Lernform
     mit anderen Stapeln neu laden (Einstellungen bleiben). Gibt zurück,
     ob sie läuft. */
  async function startGame(gid, keep) {
    const G = gameOf(gid);
    if (!G) return false;
    if (G.net) {                    // Kistensturm: Stapel wählt die Lehrkraft in der Lobby
      if (standalone || demo) return false;
      info = null; renderInfo();
      if (opened) leavePlay();
      opened = { stacks: [], cards: [], game: gid };
      go('play');
      return true;
    }
    const ids = formIds(G);
    if (!ids.length) {
      toast(isTeacher ? 'Lege zuerst einen Stapel an.' : 'Noch ist kein Stapel da.');
      return false;
    }
    busy(true);
    const got = await Promise.all(ids.map(getStack));
    busy(false);
    if (!root || got.some(s => !s)) return false;
    const cards = [];
    for (const s of got) for (const c of s.cards) cards.push({ id: s.id + ':' + c.id, sid: s.id, t: c.t, d: c.d, i: c.i });
    if (cards.length < G.min) {
      toast(G.name + ' braucht mindestens ' + G.min + ' Karten.' + (G.room ? '' : ' Schalte oben mehr Stapel an.'));
      return false;
    }
    const prev = keep && opened && opened.game === gid ? { learn, ov, mm, du } : null;
    info = null; renderInfo();
    if (opened) leavePlay();
    opened = { stacks: got, cards, game: gid };
    buildProg();
    learn = newLearn();
    if (prev && prev.learn) { learn.focus = prev.learn.focus; learn.dir = prev.learn.dir; }
    ov = prev && prev.ov ? Object.assign(prev.ov, { open: {} }) : { q: '', f: 'alle', sort: 'stand', mode: 'liste', hide: false, open: {} };
    mm = null;
    if (prev && prev.mm) newMemory(prev.mm.pairs, prev.mm.players);
    du = null;
    if (prev && prev.du) newDuel(prev.du.goal, prev.du.size);
    saveProg();
    go('play');
    got.forEach(s => pullProg(s.id));
    return true;
  }

  /* Stapel antippen (Startseite): die vorderste Lernform (firstForm), nur mit diesem Stapel. */
  function openStack(id) {
    const it = (list || []).find(x => x.id === id);
    if (!it) return;
    const G = firstForm(it.n || 0);
    if (!G) { toast('Noch ist keine Lernform freigegeben.'); return; }
    setSel([id]);
    startGame(G.id);
  }

  /* In der Lernform einen Stapel an- oder ausschalten. */
  async function toggleActive(id) {
    if (!opened || !(list || []).some(x => x.id === id)) return;
    const before = activeIds();
    const on = before.includes(id);
    if (on && before.length === 1) { toast('Ein Stapel bleibt immer an.'); return; }
    const next = on ? before.filter(x => x !== id) : (list || []).map(x => x.id).filter(x => x === id || before.includes(x));
    const G = gameOf(opened.game);
    // Insel: liegt der Stapel schon auf der Insel, ändert sich nur die Runde.
    if (G.room && opened.stacks.some(s => s.id === id)) {
      setSel(next);
      paintUsing(); paintSide();
      return;
    }
    if (G.room && isl && isl.round) { toast('Erst die Runde beenden, dann kommt der Stapel auf die Insel.'); return; }
    setSel(next);
    if (!(await startGame(opened.game, true))) { setSel(before); paintUsing(); }
  }

  /* ══════════════════════════════════════════════════════════════
     STARTSEITE: erst die Lernformen, dann die Stapel
     ══════════════════════════════════════════════════════════════ */
  function sumOf(id, n) {
    let s = jget('dd.sum.' + id, null);
    const r = remoteSum[id];
    if (r && r.sum && Array.isArray(r.sum.c) && (!s || !Array.isArray(s.c) || r.t > (s.t || 0))) s = r.sum;
    if (!s || !Array.isArray(s.c)) return null;
    const tot = s.c.reduce((a, b) => a + b, 0);
    if (!tot) return null;
    // Wurde der Stapel inzwischen größer, zählen die neuen Karten als „neu“.
    const c = s.c.slice();
    if (n > tot) c[0] += n - tot;
    return c;
  }
  function barHTML(c) {
    const tot = c.reduce((a, b) => a + b, 0) || 1;
    return '<span class="dd-bar" role="img" aria-label="' + E(LEVELS.map((l, i) => c[i] + ' ' + l).join(', ')) + '">' +
      c.map((n, i) => n ? '<i class="dd-s' + i + '" style="width:' + (n / tot * 100) + '%"></i>' : '').join('') + '</span>';
  }

  function renderHome() {
    if (!root) return;
    const items = list;
    let left = '<div class="dd-hub__head"><h2 class="dd-h">' + (isTeacher ? 'Meine Stapel' : 'Stapel') + '</h2>' +
      (isTeacher ? '<button type="button" class="btn btn--primary btn--sm dd-new" data-act="new">' + ico.plus + 'Neuer Stapel</button>' : '') + '</div>' +
      '<p class="dd-sub">' + (standalone
        ? 'Stapel vorbereiten, ohne dass ein Raum offen sein muss. Sie stehen in jedem deiner Räume, dort teilst du sie mit der Klasse.'
        : isTeacher
        ? 'Antippen öffnet den Stapel in der ersten Lernform oben. Teilen gibt ihn der Klasse frei.'
        : 'Antippen öffnet den Stapel. In jeder Lernform schaltest du oben weitere Stapel dazu.') + '</p>';

    if (items === null) {
      left += '<p class="dd-empty">Lade …</p>';
    } else if (listErr) {
      left += '<p class="dd-empty dd-empty--err">' + E(listErr) + ' <button type="button" class="btn btn--sm" data-act="reload">Noch einmal</button></p>';
    } else if (!items.length) {
      left += isTeacher
        ? '<div class="dd-empty"><strong>Noch kein Stapel.</strong> Lege den ersten an — Karte für Karte oder einfach als Text einfügen.' +
          '<br><button type="button" class="btn btn--primary" data-act="new">' + ico.plus + 'Ersten Stapel anlegen</button></div>'
        : '<p class="dd-empty"><strong>Noch nichts geteilt.</strong> Sobald deine Lehrkraft einen Stapel freigibt, erscheint er hier.</p>';
    } else {
      const faecher = [...new Set(items.map(i => i.subject).filter(Boolean))].sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'));
      if (items.length > 5) {
        left += '<div class="dd-filter"><input type="search" class="dd-input" data-f="q" placeholder="Stapel suchen …" value="' + E(homeFilter.q) + '" aria-label="Stapel suchen">' +
          (faecher.length > 1 ? '<select class="dd-input" data-f="fach" aria-label="Fach"><option value="">Alle Fächer</option>' +
            faecher.map(f => '<option' + (homeFilter.fach === f ? ' selected' : '') + '>' + E(f) + '</option>').join('') + '</select>' : '') + '</div>';
      }
      const q = sortKey(homeFilter.q);
      const shown = items.filter(i => (!homeFilter.fach || i.subject === homeFilter.fach) &&
        (!q || sortKey([i.title, i.subject, i.topic, i.grade].join(' ')).includes(q)));
      left += '<div class="dd-grid">' + shown.map(stackCard).join('') + '</div>';
      if (!shown.length) left += '<p class="dd-empty">Nichts gefunden.</p>';
      left += acctNote();
    }

    root.querySelector('.dd-main').innerHTML =
      '<div class="dd-hub">' +
        '<section class="dd-hub__col dd-hub__games" aria-label="Lernformen">' + gamesHTML() + '</section>' +
        '<section class="dd-hub__col dd-hub__stacks" aria-label="Stapel">' + left + '</section>' +
      '</div>';
  }

  function stackCard(s) {
    const c = sumOf(s.id, s.n);
    const shared = isTeacher && !standalone && isShared(s.id);
    return '<article class="dd-stack" data-id="' + E(s.id) + '" data-act="open" tabindex="0" role="button" aria-label="' + E(s.title) + ', ' + kart(s.n) + ' – öffnen">' +
      '<div class="dd-stack__head"><h3>' + E(s.title) + '</h3>' +
        '<span class="dd-stack__n" aria-hidden="true"><b>' + s.n + '</b><small>Karten</small></span></div>' +
      '<div class="dd-chips">' + metaChips(s) +
        (shared ? '<span class="dd-badge" title="Die Klasse sieht diesen Stapel">geteilt</span>' : '') + '</div>' +
      (c ? barHTML(c) : '<span class="dd-bar dd-bar--leer"></span>') +
      (isTeacher ? '<div class="dd-stack__act">' +
        '<button type="button" class="btn btn--sm dd-ic" data-act="edit" title="Bearbeiten" aria-label="' + E(s.title) + ' bearbeiten">' + ico.edit + '</button>' +
        (standalone ? '' : '<button type="button" class="btn btn--sm dd-ic' + (shared ? ' is-on' : '') + '" data-act="share" aria-pressed="' + shared + '" title="' +
          (shared ? 'Für die Klasse zurücknehmen' : 'Mit der Klasse teilen') + '" aria-label="' + E(s.title) + ' teilen">' + ico.share + '</button>') +
      '</div>' : '') + '</article>';
  }

  /* ─── Kacheln der Lernformen: antippen startet, „i“ beschreibt, Teilen nur Lehrkraft ─── */
  function gamesHTML() {
    const shown = visibleGames();
    let html = '<div class="dd-hub__head"><h2 class="dd-h dd-h--b">Lernformen</h2></div>';
    if (!shown.length) {
      return html + '<p class="dd-empty"><strong>Noch keine Lernform freigegeben.</strong> Sobald deine Lehrkraft eine teilt, erscheint sie hier.</p>';
    }
    for (const grp of GROUPS) {
      const gs = shown.filter(g => g.g === grp.id);
      if (!gs.length && (!isTeacher || (grp.id === 'net' && (standalone || demo)))) continue;
      html += '<h3 class="dd-ghead">' + grp.name + '</h3>';
      html += gs.length
        ? '<div class="dd-games">' + gs.map(gameTile).join('') + '</div>'
        : '<p class="dd-soon">Kommt bald: Lernformen für die ganze Klasse, bei denen jedes Tablet mitspielt.</p>';
    }
    return html;
  }
  function gameTile(G) {
    const canShare = isTeacher && !standalone;
    const shared = canShare && gameShared(G.id);
    return '<div class="dd-game' + (shared ? ' is-shared' : '') + '" data-act="game" data-g="' + G.id + '" tabindex="0" role="button" aria-label="' +
        E(G.name + ' starten') + '">' +
      '<span class="dd-game__pic">' + MINI[G.id] + '</span>' +
      '<span class="dd-game__t"><b>' + G.name + '</b><small>' + G.short + '</small></span>' +
      '<span class="dd-game__act">' +
        (shared ? '<span class="dd-badge">geteilt</span>' : '') +
        (canShare ? '<button type="button" class="btn btn--sm dd-ic' + (shared ? ' is-on' : '') + '" data-act="gshare" aria-pressed="' + shared + '" title="' +
          (shared ? 'Für die Klasse zurücknehmen' : 'Mit der Klasse teilen') + '" aria-label="' + E(G.name) + ' teilen">' + ico.share + '</button>' : '') +
        '<button type="button" class="btn btn--sm dd-ic" data-act="ginfo" title="Wie geht das?" aria-label="' + E(G.name) + ': Beschreibung">' + ico.info + '</button>' +
      '</span></div>';
  }

  /* ─── Beschreibung einer Lernform (Fenster über der Startseite) ─── */
  function openInfo(gid) { if (!gameOf(gid)) return; info = gid; renderInfo(); }
  function closeInfo() { if (!info) return; const was = info; info = null; renderInfo();
    const t = root && root.querySelector('.dd-game[data-g="' + was + '"]'); if (t) t.focus(); }
  function renderInfo() {
    const layer = root && root.querySelector('.dd-layer');
    if (!layer) return;
    const G = info && gameOf(info);
    if (!G || screen !== 'home') { layer.innerHTML = ''; return; }
    const grp = GROUPS.find(g => g.id === G.g);
    const canShare = isTeacher && !standalone;
    const shared = canShare && gameShared(G.id);
    const it = formIds(G).map(id => (list || []).find(x => x.id === id)).filter(Boolean);
    const hadFocus = layer.contains(document.activeElement);
    layer.innerHTML =
      '<div class="dd-modal" role="dialog" aria-modal="true" aria-labelledby="ddInfoH">' +
        '<div class="dd-modal__bg" data-act="info-x"></div>' +
        '<div class="dd-sheet">' +
          '<button type="button" class="dd-x" data-act="info-x" aria-label="Schließen">×</button>' +
          // Knöpfe oben rechts neben dem ×, Starten ganz rechts (Sönke 29.10.2026)
          '<div class="dd-sheet__act">' +
            (canShare ? '<button type="button" class="btn' + (shared ? ' is-on' : '') + '" data-act="info-share" aria-pressed="' + shared + '">' + ico.share +
              (shared ? 'Für die Klasse zurücknehmen' : 'Mit der Klasse teilen') + '</button>' : '') +
            '<button type="button" class="btn btn--primary" data-act="info-start"' + (it.length ? '' : ' disabled') + '>' + ico.play +
              (G.net ? 'Öffnen' : G.room ? 'Insel öffnen' : 'Starten') + '</button>' +
            (it.length ? '' : '<p class="dd-sheet__hint">' + (isTeacher ? 'Noch kein Stapel da – lege zuerst einen an.' : 'Noch ist kein Stapel geteilt.') + '</p>') +
          '</div>' +
          // Oben das Bild, darunter die Erklärung in zwei Spalten (Sönke 29.10.2026)
          '<figure class="dd-shot"><img src="' + BASE + 'img/' + G.shot + '?v=' + V + '" alt="Bildschirmfoto: ' + E(G.name) + '" loading="lazy" decoding="async">' +
            '<figcaption>So sieht es aus</figcaption></figure>' +
          '<div class="dd-sheet__txt">' +
            '<span class="dd-chip">' + grp.name + '</span>' +
            '<h2 class="dd-sheet__h" id="ddInfoH">' + G.name + (shared ? ' <span class="dd-badge">geteilt</span>' : '') + '</h2>' +
            '<p>' + G.text + '</p>' +
          '</div>' +
          '<div class="dd-sheet__how">' +
            '<h3>So geht’s</h3><ul>' + G.how.map(h => '<li>' + h + '</li>').join('') + '</ul>' +
          '</div>' +
        '</div>' +
      '</div>';
    if (!hadFocus) { const x = layer.querySelector('.dd-x'); if (x) x.focus(); }
  }

  /* ══════════════════════════════════════════════════════════════
     IM SPIEL
     ══════════════════════════════════════════════════════════════ */
  function renderPlay() {
    const G = gameOf(opened.game);
    root.querySelector('.dd-main').innerHTML =
      '<div class="dd-stackhead dd-playhead">' +
        '<button type="button" class="btn btn--sm dd-backbtn" data-act="home">' + ico.back + 'Lernformen</button>' +
        '<div class="dd-stackhead__t"><h2 class="dd-h">' + G.name + '</h2>' +
        (G.net ? '' : '<div class="dd-chips dd-using" id="ddUsing" role="group" aria-label="Stapel an- und ausschalten"></div>') + '</div>' +
      '</div>' +
      '<div class="dd-pane" id="ddPane"></div>';
    paintUsing();
    renderPane();
  }
  /* Oben alle Stapel mit ihrer Begriffszahl; antippen schaltet an/aus (toggleActive). */
  function paintUsing() {
    const box = root && root.querySelector('#ddUsing');
    if (!box || !opened) return;
    const act = activeIds();
    box.innerHTML = '<span class="dd-using__l">Stapel:</span>' + (list || []).map(s => {
      const on = act.includes(s.id);
      return '<button type="button" class="dd-chip dd-chip--stack' + (on ? ' is-on' : '') + '" data-act="stk" data-id="' + E(s.id) + '" aria-pressed="' + on + '" title="' +
        (on ? 'Ausschalten' : 'Dazuschalten') + '">' + (on ? ico.check : '') + E(s.title) + ' <i>' + s.n + '</i></button>';
    }).join('');
  }
  function renderPane() {
    if (!opened || screen !== 'play') return;
    if (opened.game === 'cards') renderLearn();
    else if (opened.game === 'overview') renderOverview();
    else if (opened.game === 'memory') renderMemory();
    else if (opened.game === 'duel') renderDuel();
    else if (opened.game === 'island') renderIsland();
    else if (opened.game === 'storm') renderStorm();
  }
  const multi = () => opened && opened.stacks.length > 1;
  const stackTitle = sid => { const s = opened && opened.stacks.find(x => x.id === sid); return s ? s.title : ''; };
  function countsAll() {
    const c = [0, 0, 0, 0];
    for (const k of opened.cards) c[lvl(k.id)]++;
    return c;
  }

  /* ─── Karteikarten-Lerner ─── */
  function newLearn() {
    return { focus: 'alle', dir: store.get('dd.dir') || 'td', cur: null, flipped: false, recent: [], done: 0, row: 0 };
  }
  const lvl = id => { const e = prog[id]; return e && e.l >= 1 && e.l <= 3 ? e.l : 0; };

  function weight(id) {
    const e = prog[id];
    if (!e || !e.l) return 5;                   // neu (auch: zurückgesetzt)
    if (e.l === 1) return 8;                    // unsicher kommt am häufigsten
    if (e.l === 2) return 3;
    return e.s >= 2 ? 0.4 : 1;                  // zweimal hintereinander sicher: fast Ruhe
  }
  function pool() {
    const cards = opened.cards;
    if (learn.focus === 'unsicher') return cards.filter(c => lvl(c.id) === 1);
    if (learn.focus === 'offen')    return cards.filter(c => lvl(c.id) !== 3);
    return cards;
  }
  function pick() {
    let cand = pool();
    if (!cand.length) return null;
    const avoid = new Set(learn.recent.slice(-Math.min(2, cand.length - 1)));
    const fresh = cand.filter(c => !avoid.has(c.id));
    if (fresh.length) cand = fresh;
    let tot = 0;
    const w = cand.map(c => { const x = weight(c.id); tot += x; return x; });
    let r = Math.random() * tot;
    for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) return cand[i]; }
    return cand[cand.length - 1];
  }
  function nextCard() {
    const c = pick();
    learn.cur = c;
    learn.flipped = false;
    if (c) {
      learn.recent.push(c.id);
      if (learn.recent.length > 6) learn.recent.shift();
      learn.side = learn.dir === 'mix' ? (Math.random() < 0.5 ? 'td' : 'dt') : learn.dir;   // td = Begriff zuerst
    }
  }

  function renderLearn() {
    const pane = root.querySelector('#ddPane');
    const cards = opened.cards;
    if (!cards.length) { pane.innerHTML = '<p class="dd-empty">Diese Stapel haben noch keine Karten.</p>'; return; }
    if (!learn.cur || !cards.some(c => c.id === learn.cur.id)) nextCard();
    const c = countsAll();
    const allSure = c[3] === cards.length;
    const focusBtn = (k, l, n) => '<button type="button" class="dd-seg' + (learn.focus === k ? ' is-on' : '') + '" data-act="focus" data-v="' + k + '">' + l +
      (n != null ? ' <span>' + n + '</span>' : '') + '</button>';
    const dirBtn = (k, l) => '<button type="button" class="dd-seg' + (learn.dir === k ? ' is-on' : '') + '" data-act="dir" data-v="' + k + '">' + l + '</button>';

    pane.innerHTML =
      '<div class="dd-prog">' + barHTML(c) +
        '<ul class="dd-legend">' + LEVELS.map((l, i) => '<li><i class="dd-s' + i + '"></i>' + l + ' <b>' + c[i] + '</b></li>').join('') + '</ul></div>' +
      '<div class="dd-opts">' +
        '<div class="dd-segs" role="group" aria-label="Welche Karten">' +
          focusBtn('alle', 'Alle') + focusBtn('offen', 'Noch nicht sicher', c[0] + c[1] + c[2]) + focusBtn('unsicher', 'Nur unsichere', c[1]) + '</div>' +
        '<div class="dd-segs" role="group" aria-label="Richtung">' +
          dirBtn('td', 'Begriff → Definition') + dirBtn('dt', 'Definition → Begriff') + dirBtn('mix', 'Gemischt') + '</div>' +
      '</div>' +
      (allSure ? '<div class="dd-win" role="status"><strong>Alle Karten sitzen.</strong> Stark — du kannst trotzdem weiterüben oder dir die Übersicht ansehen.</div>' : '') +
      '<div id="ddCard"></div>';
    paintCard();
  }

  function faceHTML(c, which, label) {
    // Das Bild gehört zum BEGRIFF und steht darum auf der Seite, die den Begriff zeigt.
    const t = which === 'term';
    return '<span class="dd-face dd-face--' + (t ? 'term' : 'def') + '"><span class="dd-face__l">' + label + '</span>' +
      (t && okImg(c.i) ? '<img class="dd-face__img" src="' + c.i + '" alt="">' : '') +
      '<span class="dd-face__t' + ((t ? c.t : c.d).length > 90 ? ' is-long' : '') + '"><span class="dd-hl">' + E(t ? c.t : c.d) + '</span></span>' +
      (multi() ? '<span class="dd-face__src">' + E(stackTitle(c.sid)) + '</span>' : '') + '</span>';
  }

  function paintCard() {
    const box = root.querySelector('#ddCard');
    if (!box) return;
    const c = learn.cur;
    if (!c) {
      box.innerHTML = '<div class="dd-empty"><strong>' + (learn.focus === 'unsicher' ? 'Keine unsicheren Karten.' : 'Alles sicher.') + '</strong> ' +
        'Wähle oben „Alle“, um weiterzuüben.<br><button type="button" class="btn btn--primary" data-act="focus" data-v="alle">Alle Karten</button></div>';
      return;
    }
    const termFirst = learn.side !== 'dt';
    const front = termFirst ? faceHTML(c, 'term', 'Begriff') : faceHTML(c, 'def', 'Definition');
    const back  = termFirst ? faceHTML(c, 'def', 'Definition') : faceHTML(c, 'term', 'Begriff');
    const lv = lvl(c.id);
    box.innerHTML =
      '<button type="button" class="dd-flip' + (learn.flipped ? ' is-flipped' : '') + '" data-act="flip" aria-label="' +
        (learn.flipped ? 'Karte zurückdrehen' : 'Karte umdrehen') + '">' +
        '<span class="dd-flip__in"><span class="dd-flip__f">' + front + '</span><span class="dd-flip__b">' + back + '</span></span>' +
        '<span class="dd-flip__hint">' + ico.flip + (learn.flipped ? 'Tippen: zurück' : 'Tippen zum Umdrehen') + '</span>' +
        '<span class="dd-lvl dd-s' + lv + '">' + LEVELS[lv] + '</span>' +
      '</button>' +
      '<div class="dd-rate' + (learn.flipped ? ' is-open' : '') + '" role="group" aria-label="Wie gut kanntest du das?">' +
        '<p class="dd-rate__q">Wie gut kanntest du das?</p>' +
        '<div class="dd-rate__b">' +
          '<button type="button" class="dd-r dd-r--1" data-act="rate" data-v="1"' + (learn.flipped ? '' : ' disabled') + '><b>Unsicher</b><span>kommt bald wieder</span></button>' +
          '<button type="button" class="dd-r dd-r--2" data-act="rate" data-v="2"' + (learn.flipped ? '' : ' disabled') + '><b>Teilweise</b><span>noch etwas üben</span></button>' +
          '<button type="button" class="dd-r dd-r--3" data-act="rate" data-v="3"' + (learn.flipped ? '' : ' disabled') + '><b>Sicher</b><span>seltener</span></button>' +
        '</div></div>' +
      '<p class="dd-count">' + learn.done + ' Karten geübt' + (learn.row >= 3 ? ' · ' + learn.row + ' in Folge sicher' : '') + '</p>' + acctNote();
  }

  function flip() {
    if (!learn || !learn.cur || learn.stamping) return;
    learn.flipped = !learn.flipped;
    const f = root.querySelector('.dd-flip');
    if (!f) return;
    f.classList.toggle('is-flipped', learn.flipped);
    f.setAttribute('aria-label', learn.flipped ? 'Karte zurückdrehen' : 'Karte umdrehen');
    const h = f.querySelector('.dd-flip__hint');
    if (h) h.lastChild.textContent = learn.flipped ? 'Tippen: zurück' : 'Tippen zum Umdrehen';
    const r = root.querySelector('.dd-rate');
    if (r) r.classList.toggle('is-open', learn.flipped);
    root.querySelectorAll('.dd-r').forEach(b => { b.disabled = !learn.flipped; });
  }

  /* Bewerten: der Stempel landet erst auf der Karte, dann kommt die nächste.
     Während der kurzen Pause (learn.stamping) zählt kein weiteres Tippen. */
  const STAMPS = ['', 'Unsicher', 'Teilweise', 'Sicher'];
  function rate(v) {
    if (!learn || !learn.cur || !learn.flipped || learn.stamping) return;
    const cur = learn.cur, id = cur.id, p = prog[id];
    prog[id] = Object.assign({}, p, { l: v, s: v === 3 ? (p && p.l === 3 ? (p.s || 1) + 1 : 1) : 0, t: Date.now() });
    saveProg(sidOf(id));
    learn.done++;
    learn.row = v === 3 ? learn.row + 1 : 0;
    learn.stamping = true;
    const f = root.querySelector('.dd-flip');
    if (f) {
      f.classList.add('is-stamped');
      f.insertAdjacentHTML('beforeend', '<span class="dd-stamp dd-stamp--' + v + '" aria-hidden="true">' + STAMPS[v] + '</span>');
    }
    root.querySelectorAll('.dd-r').forEach(b => { b.disabled = true; });
    const l = learn;
    setTimeout(() => {
      l.stamping = false;
      if (!root || learn !== l || l.cur !== cur) return;     // inzwischen woanders hin
      nextCard();
      if (screen !== 'play' || !opened || opened.game !== 'cards') return;
      renderLearn();
      const nb = root.querySelector('#ddCard');
      if (nb) nb.classList.add('dd-in');
    }, still() ? 150 : 560);
  }
  const still = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ─── Übersicht / Glossar ─── */
  function ovCards() {
    const q = sortKey(ov.q);
    let cs = opened.cards.filter(c => (ov.f === 'alle' || lvl(c.id) === LEVELS.indexOf(ov.f)) &&
      (!q || sortKey(c.t + ' ' + c.d).includes(q)));
    if (ov.sort === 'az') cs = cs.slice().sort((a, b) => sortKey(a.t).localeCompare(sortKey(b.t), 'de'));
    return cs;
  }
  const ORDNUNG = [1, 2, 0, 3];       // Unsicher, Teilweise, Neu, Sicher

  function renderOverview() {
    const pane = root.querySelector('#ddPane');
    const c = countsAll();
    const fBtn = (k, l, n) => '<button type="button" class="dd-seg dd-seg--' + k + (ov.f === k ? ' is-on' : '') + '" data-act="ovf" data-v="' + k + '">' + l +
      (n != null ? ' <span>' + n + '</span>' : '') + '</button>';
    pane.innerHTML =
      '<div class="dd-ovbar">' +
        '<input type="search" class="dd-input" data-ov="q" placeholder="Suchen …" value="' + E(ov.q) + '" aria-label="In den Karten suchen">' +
        '<select class="dd-input" data-ov="sort" aria-label="Sortierung">' +
          '<option value="stand"' + (ov.sort === 'stand' ? ' selected' : '') + '>Nach Lernstand</option>' +
          '<option value="az"' + (ov.sort === 'az' ? ' selected' : '') + '>A–Z</option>' +
          '<option value="stapel"' + (ov.sort === 'stapel' ? ' selected' : '') + '>Reihenfolge im Stapel</option></select>' +
        '<div class="dd-segs"><button type="button" class="dd-seg' + (ov.mode === 'liste' ? ' is-on' : '') + '" data-act="ovm" data-v="liste">Liste</button>' +
          '<button type="button" class="dd-seg' + (ov.mode === 'kacheln' ? ' is-on' : '') + '" data-act="ovm" data-v="kacheln">Kacheln</button></div>' +
      '</div>' +
      '<div class="dd-ovbar dd-ovbar--f">' +
        '<div class="dd-segs" role="group" aria-label="Filter">' + fBtn('alle', 'Alle', opened.cards.length) +
          ORDNUNG.map(i => fBtn(LEVELS[i], LEVELS[i][0].toUpperCase() + LEVELS[i].slice(1), c[i])).join('') + '</div>' +
        '<label class="dd-check"><input type="checkbox" data-ov="hide"' + (ov.hide ? ' checked' : '') + '> Definitionen verdecken (zum Testen)</label>' +
      '</div>' +
      '<div id="ddOvList"></div>' + acctNote();
    paintOv();
  }

  function rowHTML(c) {
    const l = lvl(c.id);
    const hidden = ov.hide && !ov.open[c.id];
    const img = okImg(c.i) ? '<img class="dd-ov__img" src="' + c.i + '" alt="">' : '';
    return '<li class="dd-ov dd-ov--' + ov.mode + (hidden ? ' is-hidden' : '') + '" data-cid="' + E(c.id) + '">' +
      '<button type="button" class="dd-dot dd-s' + l + '" data-act="cycle" title="Lernstand: ' + LEVELS[l] + ' — antippen zum Ändern" aria-label="Lernstand ' + LEVELS[l] + ', antippen zum Ändern"><span>' + LEVELS[l] + '</span></button>' +
      img +
      '<div class="dd-ov__txt" data-act="reveal"><strong>' + E(c.t) + '</strong><p>' + E(c.d) + '</p>' +
        (multi() ? '<small class="dd-ov__src">' + E(stackTitle(c.sid)) + '</small>' : '') + '</div></li>';
  }

  function paintOv() {
    const box = root.querySelector('#ddOvList');
    if (!box) return;
    const cs = ovCards();
    if (!cs.length) { box.innerHTML = '<p class="dd-empty">Keine Karte passt zu Suche und Filter.</p>'; return; }
    let html = '';
    if (ov.sort === 'stand') {
      for (const l of ORDNUNG) {
        const g = cs.filter(c => lvl(c.id) === l);
        if (!g.length) continue;
        html += '<h3 class="dd-grp dd-grp--' + l + '"><i class="dd-s' + l + '"></i>' + LEVELS[l][0].toUpperCase() + LEVELS[l].slice(1) + ' <span>' + g.length + '</span></h3>' +
          '<ul class="dd-ovlist dd-ovlist--' + ov.mode + '">' + g.map(rowHTML).join('') + '</ul>';
      }
    } else {
      html = '<ul class="dd-ovlist dd-ovlist--' + ov.mode + '">' + cs.map(rowHTML).join('') + '</ul>';
    }
    box.innerHTML = html;
  }

  function cycle(id) {
    const next = { 0: 1, 1: 2, 2: 3, 3: 0 }[lvl(id)];
    prog[id] = Object.assign({}, prog[id], { l: next, s: next === 3 ? 1 : 0, t: Date.now() });   // l 0 = Grabstein „wieder neu“
    saveProg(sidOf(id));
    renderOverview();
  }

  /* ══════════════════════════════════════════════════════════════
     MEMORY (gemeinsam an einem Gerät)
     ══════════════════════════════════════════════════════════════
     Nach dem Vorbild von Sönkes „Evolutionsfaktoren“-Memory: links
     die Begriffe, rechts die Definitionen, beide Bretter gleich
     gebaut (gleiche Kartengröße). Wer dran ist, deckt je eine Karte
     links und rechts auf; beide fliegen groß in die Mitte, und die
     Spielenden entscheiden „Ja, Paar!“ / „Nein“. Vier Fälle:
       Paar + „Ja“    → Punkt, Karten fliegen zum Punktestand, nochmal dran
       Paar + „Nein“  → zurück, umdrehen, Wechsel
       kein Paar + „Nein“ → zurück, umdrehen, Wechsel
       kein Paar + „Ja“   → Minuspunkt (zu zweit), zurück, Wechsel
     Nach „Nein“ verrät das Spiel NICHT, ob es doch ein Paar war:
     beide Nein-Fälle sehen gleich aus. Allein: es zählen Paare und
     Züge (kein Minuspunkt).
     Der Text der Karten steht erst nach dem Aufdecken im DOM (kein
     Spicken) und wird mit fitText() in die Karte eingepasst. Jeder
     Takt prüft, ob sein Spiel (m) noch läuft.
     Tippen irgendwo, während etwas läuft, überspringt die Bewegungen
     bis zur nächsten Entscheidung (mmWait/mmSkip). */
  const FLY_MS = 420, FLIP_MS = 280, HOLD_MS = 250;
  const SAY_OK_MS = 650, SAY_NO_MS = 1000;   // Ergebnis lesen, dann fliegen die Karten

  /* Nächster Takt des Memorys. Im Überspring-Lauf (m.fast) sofort. */
  function mmWait(m, ms, fn) {
    if (m.fast) { fn(); return; }
    clearTimeout(m.timer);
    m.wait = fn;
    m.timer = setTimeout(() => { m.wait = null; if (mm === m && root) fn(); }, ms);
  }
  /* Alle Takte bis zur nächsten Entscheidung ohne Bewegung ablaufen lassen. */
  function mmSkip() {
    const m = mm, sec = root && root.querySelector('#ddMem');
    if (!m || !m.wait || !sec) return false;
    clearTimeout(m.timer);
    const fn = m.wait;
    m.wait = null;
    m.fast = true;
    sec.classList.add('is-fast');
    try { fn(); } finally {
      sec.getBoundingClientRect();                     // Endstand ohne Übergang festschreiben
      sec.classList.remove('is-fast');
      m.fast = false;
    }
    return true;
  }
  const MM_MAX = 24;

  /* Karten mit gleichem Begriff zählen nur einmal (zwei Stapel mit „Zelle“). */
  function memPool() {
    const seen = new Set(), out = [];
    for (const c of opened.cards) { const k = sortKey(c.t).trim(); if (!seen.has(k)) { seen.add(k); out.push(c); } }
    return out;
  }
  function memOptions(n) {
    const o = [6, 8, 12, 18, 24].filter(x => x < n && x <= MM_MAX);
    o.push(Math.min(n, MM_MAX));
    return o;
  }
  function newMemory(pairs, players) {
    const poolC = memPool();
    const opts = memOptions(poolC.length);
    const p = opts.includes(pairs) ? pairs : (opts.includes(8) ? 8 : opts[opts.length - 1]);
    const chosen = shuffle(poolC.slice()).slice(0, p);
    mm = {
      pairs: p, players: players === 1 ? 1 : 2, n: poolC.length,
      t: shuffle(chosen.map(c => ({ pid: c.id, text: c.t, up: false, done: false }))),
      d: shuffle(chosen.map(c => ({ pid: c.id, text: c.d, up: false, done: false }))),
      picked: [], active: 1, scores: { 1: 0, 2: 0 }, moves: 0, matched: 0, busy: false, fly: []
    };
  }
  const fsOk = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;

  function renderMemory() {
    const pane = root.querySelector('#ddPane');
    if (!mm) newMemory(8, 2);
    const opts = memOptions(mm.n);
    const pl = (k, l) => '<button type="button" class="dd-seg' + (mm.players === k ? ' is-on' : '') + '" data-act="mm-players" data-v="' + k + '">' + l + '</button>';
    pane.innerHTML =
      '<section class="dd-mem" id="ddMem">' +
        '<div class="dd-membar">' +
          '<div class="dd-membar__set">' +
            '<select class="dd-input dd-input--s" data-mm="pairs" aria-label="Anzahl Paare">' + opts.map(o =>
              '<option value="' + o + '"' + (o === mm.pairs ? ' selected' : '') + '>' + o + ' Paare' + (o === mm.n && o <= MM_MAX ? ' (alle)' : '') + '</option>').join('') + '</select>' +
            '<div class="dd-segs dd-segs--s" role="group" aria-label="Wie viele spielen">' + pl(1, 'Allein') + pl(2, 'Zu zweit') + '</div>' +
            '<button type="button" class="btn btn--sm" data-act="mm-new">' + ico.again + 'Neustart</button>' +
          '</div>' +
          '<div class="dd-players" id="ddPlayers"></div>' +
          '<p class="dd-turn" id="ddTurn" aria-live="polite"></p>' +
          (fsOk() ? '<button type="button" class="btn btn--sm dd-ic dd-fsbtn" data-act="mm-fs" title="Vollbild" aria-label="Vollbild">' + (fsEl() ? ico.unfull : ico.full) + '</button>' : '') +
        '</div>' +
        '<div class="dd-memboards">' +
          '<div class="dd-memside dd-memside--t"><h3 class="dd-memside__h"><span>Begriffe</span></h3><div class="dd-memgrid" id="ddMemT"></div></div>' +
          '<div class="dd-memside dd-memside--d"><h3 class="dd-memside__h"><span>Definitionen</span></h3><div class="dd-memgrid" id="ddMemD"></div></div>' +
        '</div>' +
        '<div class="dd-review" id="ddReview" hidden>' +
          '<div class="dd-review__bg"></div>' +
          '<p class="dd-review__msg" aria-live="polite"></p>' +
          '<div class="dd-review__act">' +
            '<button type="button" class="dd-r dd-r--3 dd-yes" data-act="mm-yes"><b>Ja, Paar!</b></button>' +
            '<button type="button" class="dd-r dd-r--1 dd-no" data-act="mm-no"><b>Nein</b></button>' +
          '</div>' +
        '</div>' +
        '<div class="dd-memwin" id="ddMemWin" hidden></div>' +
      '</section>';
    paintPlayers();
    paintBoards();
  }

  function paintPlayers() {
    const box = root.querySelector('#ddPlayers'), turn = root.querySelector('#ddTurn');
    if (!box || !mm) return;
    if (mm.players === 1) {
      box.innerHTML =
        '<span class="dd-pl dd-pl--1 is-on" id="ddP1"><span class="dd-pl__n">Paare</span><b id="ddS1">' + mm.matched + '/' + mm.pairs + '</b></span>' +
        '<span class="dd-pl dd-pl--z"><span class="dd-pl__n">Züge</span><b>' + mm.moves + '</b></span>';
      turn.textContent = 'Einen Begriff und eine Definition aufdecken.';
    } else {
      box.innerHTML = [1, 2].map(k =>
        '<span class="dd-pl dd-pl--' + k + (mm.active === k ? ' is-on' : '') + '" id="ddP' + k + '"><span class="dd-pl__n">Spieler ' + k + '</span><b id="ddS' + k + '">' + mm.scores[k] + '</b></span>').join('');
      turn.innerHTML = '<i class="dd-turn__dot dd-turn__dot--' + mm.active + '"></i>Spieler ' + mm.active + ' ist dran: einen Begriff und eine Definition aufdecken.';
    }
  }

  /* Spalten so wählen, dass die Karten möglichst groß und etwas breiter als hoch werden. */
  function memCols(w, h, n) {
    let best = 1, score = -1;
    for (let c = 1; c <= 6; c++) {
      const r = Math.ceil(n / c);
      const s = Math.min(w / c, (h / r) * 1.45);
      if (s > score + 0.5) { score = s; best = c; }
    }
    return best;
  }
  function layoutBoards() {
    if (!mm) return;
    const gt = root.querySelector('#ddMemT'), gd = root.querySelector('#ddMemD');
    if (!gt || !gd) return;
    const cols = memCols(gt.clientWidth || 300, gt.clientHeight || 300, mm.pairs);
    const rows = Math.ceil(mm.pairs / cols);
    for (const g of [gt, gd]) {
      g.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
      g.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))';
    }
  }
  function memCardHTML(card, side, i) {
    if (card.done) return '<div class="dd-mc dd-mc--done" id="ddMc' + side + i + '"></div>';
    return '<button type="button" class="dd-mc dd-mc--' + side + (card.up ? ' is-up' : '') + '" id="ddMc' + side + i + '" data-act="mm-pick" data-side="' + side + '" data-i="' + i + '" aria-label="' +
        (side === 't' ? 'Begriff' : 'Definition') + ' ' + (i + 1) + ' aufdecken">' +
      '<span class="dd-mc__in">' +
        '<span class="dd-mc__cover"><span class="dd-mc__q">?</span><span class="dd-mc__l">' + (side === 't' ? 'Begriff' : 'Definition') + '</span></span>' +
        '<span class="dd-mc__face dd-mc__face--' + side + '"><span class="dd-mc__box"><span class="dd-mc__p">' + (card.up ? E(card.text) : '') + '</span></span></span>' +
      '</span></button>';
  }
  function paintBoards() {
    const gt = root.querySelector('#ddMemT'), gd = root.querySelector('#ddMemD');
    if (!gt || !gd || !mm) return;
    gt.innerHTML = mm.t.map((c, i) => memCardHTML(c, 't', i)).join('');
    gd.innerHTML = mm.d.map((c, i) => memCardHTML(c, 'd', i)).join('');
    layoutBoards();
  }

  /* Text in seine Box einpassen, indem die Schrift kleiner wird (kein Scrollen). */
  function fitText(p, box, max, min) {
    let lo = min, hi = max;
    const fits = px => { p.style.fontSize = px + 'px'; return p.offsetHeight <= box.clientHeight && p.scrollWidth <= box.clientWidth; };
    if (fits(hi)) return hi;
    while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    p.style.fontSize = lo + 'px';
    return lo;
  }
  const boardFont = el => Math.max(9, Math.min(20, el.clientHeight / 4.2));

  function memPick(side, i) {
    const m = mm;
    if (!m || m.busy) return;
    const card = m[side][i];
    if (!card || card.up || card.done) return;
    if (m.picked.length === 1 && m.picked[0].side === side) return;   // je Seite nur eine
    card.up = true;
    m.picked.push({ side, i, card });
    const el = root.querySelector('#ddMc' + side + i);
    if (el) {
      const p = el.querySelector('.dd-mc__p');
      p.textContent = card.text;
      el.classList.add('is-up');
      fitText(p, el.querySelector('.dd-mc__box'), boardFont(el), 4);
    }
    if (m.picked.length === 2) {
      m.busy = true;
      mmWait(m, FLIP_MS + HOLD_MS, () => startReview(m));
    }
  }

  function setRect(el, r) {
    el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
    el.style.width = r.width + 'px'; el.style.height = r.height + 'px';
  }
  /* Kopie einer aufgedeckten Karte, die in die Mitte fliegt; Größe, Schrift und Rand wachsen mit. */
  function buildFly(card, side, origin, target, layer) {
    const wrap = document.createElement('div');
    wrap.className = 'dd-fly';
    wrap.innerHTML = '<span class="dd-mc__face dd-mc__face--' + side + '"><span class="dd-mc__box"><span class="dd-mc__p"></span></span></span>';
    const face = wrap.firstChild, box = face.firstChild, p = box.firstChild;
    p.textContent = card.text;
    layer.appendChild(wrap);
    const pad = r => Math.max(4, Math.min(r.width, r.height) * 0.08);
    const measure = (r, max) => { setRect(wrap, r); face.style.padding = pad(r) + 'px'; return fitText(p, box, max, 4); };
    const fontTarget = measure(target, side === 't' ? 44 : 26);
    const fontOrigin = measure(origin, 20);
    wrap.getBoundingClientRect();                       // Startzustand festschreiben
    const ease = FLY_MS + 'ms cubic-bezier(.2,.8,.2,1)';
    wrap.style.transition = 'left ' + ease + ',top ' + ease + ',width ' + ease + ',height ' + ease + ',opacity 300ms,transform ' + ease;
    face.style.transition = 'padding ' + ease;
    p.style.transition = 'font-size ' + ease;
    return { wrap, face, p, fontOrigin, fontTarget, padOrigin: pad(origin), padTarget: pad(target) };
  }

  function startReview(m) {
    const layer = root.querySelector('#ddReview');
    if (!layer) return;
    const msg = layer.querySelector('.dd-review__msg'), act = layer.querySelector('.dd-review__act');
    const vw = window.innerWidth, vh = window.innerHeight;
    const gap = 16;
    const cardW = Math.min((vw - 3 * gap) / 2, 460);
    const cardH = Math.min(vh * 0.56, 380);
    const top = Math.max(64, (vh - cardH) / 2 - 30);
    const targets = {
      t: { left: vw / 2 - gap / 2 - cardW, top, width: cardW, height: cardH },
      d: { left: vw / 2 + gap / 2, top, width: cardW, height: cardH }
    };
    msg.style.top = Math.max(8, top - 54) + 'px';
    msg.textContent = 'Passen diese beiden Karten zusammen?';
    act.style.top = (top + cardH + 20) + 'px';
    layer.hidden = false;
    m.fly = m.picked.map(({ side, i, card }) => {
      const el = root.querySelector('#ddMc' + side + i);
      const r = el.getBoundingClientRect();
      const origin = { left: r.left, top: r.top, width: r.width, height: r.height };
      const f = buildFly(card, side, origin, targets[side], layer);
      el.style.visibility = 'hidden';
      return Object.assign(f, { origin, target: targets[side], el, side });
    });
    const go = () => {
      if (mm !== m) return;
      layer.classList.add('is-open');
      m.fly.forEach(f => { setRect(f.wrap, f.target); f.p.style.fontSize = f.fontTarget + 'px'; f.face.style.padding = f.padTarget + 'px'; });
      mmWait(m, FLY_MS - 100, () => {
        layer.classList.add('is-ask');
        const y = layer.querySelector('.dd-yes'); if (y) y.focus({ preventScroll: true });
      });
    };
    if (m.fast) go(); else requestAnimationFrame(() => requestAnimationFrame(go));
  }
  function hideReview(m) {
    (m.fly || []).forEach(f => f.wrap.remove());
    m.fly = [];
    const layer = root && root.querySelector('#ddReview');
    if (!layer) return;
    layer.hidden = true;
    layer.classList.remove('is-open', 'is-ask', 'is-said');
  }

  /* Ja/Nein. Ob es ein Paar ist: dieselbe Karte — oder zwei Karten mit gleichem Begriff. */
  function memDecide(yes) {
    const m = mm;
    if (!m || m.picked.length !== 2 || m.fly.length !== 2) return;
    const layer = root.querySelector('#ddReview');
    if (!layer || !layer.classList.contains('is-ask') || layer.classList.contains('is-said')) return;
    layer.classList.add('is-said');
    const [a, b] = m.picked;
    const ct = opened.cards.find(c => c.id === (a.side === 't' ? a : b).card.pid);
    const cd = opened.cards.find(c => c.id === (a.side === 'd' ? a : b).card.pid);
    const match = a.card.pid === b.card.pid || (ct && cd && sortKey(ct.t).trim() === sortKey(cd.t).trim());
    const ok = yes && match;
    m.moves++;
    const msg = layer.querySelector('.dd-review__msg');
    // Bei „Nein“ immer derselbe Satz: kein Hinweis, ob es doch ein Paar war.
    msg.textContent = ok ? (m.players === 2 ? 'Richtig! Punkt für Spieler ' + m.active + '.' : 'Richtig!')
      : yes ? (m.players === 2 ? 'Leider falsch – kein Paar. Minuspunkt für Spieler ' + m.active + '.' : 'Leider falsch – das war kein Paar.')
      : 'Kein Paar – die Karten werden wieder umgedreht.';
    msg.className = 'dd-review__msg' + (ok ? ' is-ok' : yes ? ' is-no' : '');
    if (yes && !match && m.players === 2) {
      m.scores[m.active]--;
      const sc = root.querySelector('#ddS' + m.active);
      if (sc) {
        sc.textContent = m.scores[m.active];
        if (sc.animate && !still()) sc.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 300, iterations: 2 });
      }
    }
    mmWait(m, ok ? SAY_OK_MS : yes ? SAY_NO_MS : SAY_OK_MS, () => (ok ? flyToPlayer : flyBack)(m));
  }

  function flyToPlayer(m) {
    const chip = root.querySelector('#ddP' + (m.players === 1 ? 1 : m.active));
    const layer = root.querySelector('#ddReview');
    const r = chip ? chip.getBoundingClientRect() : { left: 0, top: 0, width: 40, height: 28 };
    const w = 40, h = 28;
    const target = { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - h / 2, width: w, height: h };
    layer.classList.remove('is-open', 'is-ask');
    m.fly.forEach(f => { setRect(f.wrap, target); f.p.style.fontSize = '3px'; f.face.style.padding = '1px'; f.wrap.style.opacity = '0.2'; });
    mmWait(m, FLY_MS + 50, () => {
      m.picked.forEach(x => { x.card.done = true; x.card.up = false; });
      m.scores[m.active]++;
      m.matched++;
      m.picked = [];
      hideReview(m);
      paintBoards();
      paintPlayers();
      const s = root.querySelector('#ddS' + (m.players === 1 ? 1 : m.active));
      if (s && s.animate && !still()) s.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }, { transform: 'scale(1)' }], { duration: 350 });
      m.busy = false;
      if (m.matched === m.pairs) mmWait(m, 500, () => memWin(m));
    });
  }

  function flyBack(m) {
    const layer = root.querySelector('#ddReview');
    layer.classList.remove('is-open', 'is-ask');
    m.fly.forEach(f => { setRect(f.wrap, f.origin); f.p.style.fontSize = f.fontOrigin + 'px'; f.face.style.padding = f.padOrigin + 'px'; });
    const els = m.fly.map(f => f.el);
    // Die Karten landen offen auf ihrem Platz, liegen kurz und drehen sich dann um.
    mmWait(m, FLY_MS + 50, () => {
      els.forEach(el => { el.style.visibility = ''; });
      hideReview(m);
      mmWait(m, HOLD_MS, () => {
        els.forEach(el => el.classList.remove('is-up'));
        mmWait(m, FLIP_MS + 50, () => {
          m.picked.forEach(x => { x.card.up = false; });
          els.forEach(el => { const p = el.querySelector('.dd-mc__p'); if (p) p.textContent = ''; });
          m.picked = [];
          if (m.players === 2) m.active = m.active === 1 ? 2 : 1;
          paintPlayers();
          m.busy = false;
        });
      });
    });
  }

  function memWin(m) {
    const box = root.querySelector('#ddMemWin');
    if (!box) return;
    let h, t;
    if (m.players === 1) {
      h = 'Alle Paare gefunden!';
      t = m.pairs + ' Paare in ' + m.moves + ' Zügen' + (m.moves === m.pairs ? ' – ohne einen Fehler!' : '.');
    } else if (m.scores[1] === m.scores[2]) {
      h = 'Unentschieden!'; t = 'Beide haben ' + m.scores[1] + ' Punkte.';
    } else {
      const w = m.scores[1] > m.scores[2] ? 1 : 2;
      h = 'Spieler ' + w + ' gewinnt!'; t = m.scores[w] + ' zu ' + m.scores[w === 1 ? 2 : 1] + ' Punkten.';
    }
    box.innerHTML = '<div class="dd-memwin__bg"></div><div class="dd-memwin__sheet" role="dialog" aria-modal="true" aria-labelledby="ddWinH">' +
      '<span class="dd-memwin__stamp">Fertig</span>' +
      '<h2 id="ddWinH">' + h + '</h2><p>' + t + '</p>' +
      (m.players === 2 ? '<div class="dd-memwin__sc"><span class="dd-pl dd-pl--1"><span class="dd-pl__n">Spieler 1</span><b>' + m.scores[1] + '</b></span>' +
        '<span class="dd-pl dd-pl--2"><span class="dd-pl__n">Spieler 2</span><b>' + m.scores[2] + '</b></span></div>' : '') +
      '<div class="dd-memwin__act"><button type="button" class="btn btn--primary" data-act="mm-new">' + ico.again + 'Neues Spiel</button>' +
      '<button type="button" class="btn" data-act="home">' + ico.back + 'Zurück zu den Lernformen</button></div></div>';
    box.hidden = false;
    const b = box.querySelector('.btn--primary'); if (b) b.focus({ preventScroll: true });
  }

  function memFullscreen() {
    const el = root.querySelector('#ddMem') || root.querySelector('#ddDuel') || root.querySelector('#ddSt');
    if (!el) return;
    if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    const p = req.call(el);
    if (p && p.catch) p.catch(() => {});
  }


  /* ══════════════════════════════════════════════════════════════
     DUELL (gemeinsam an einem Gerät, gleichzeitig)
     ══════════════════════════════════════════════════════════════
     Sönke 29.10.2026: In der Mitte liegen bis zu 30 Begriffe
     durcheinander (du.slots, je Platz ein Begriff), links Spieler 1,
     rechts Spieler 2, jede Seite mit ihrer eigenen Definition (nie
     dieselbe wie drüben). Beide ziehen GLEICHZEITIG: jeder Finger hat
     seine pointerId, jeder Begriff hängt an höchstens einem Finger
     (du.drag: pointerId → Zug). Abgerechnet wird nach der Seite, auf
     der der Begriff landet, nicht nach dem Finger:
       richtig → Punkt, der Begriff verschwindet, sein Platz bekommt
                 einen neuen aus dem Rest (du.rest), neue Definition
       falsch  → Begriff zurück, eine ANDERE Definition, und die Seite
                 ist DU_LOCK_MS gesperrt (dort Abgelegtes springt zurück)
     Wer zuerst du.goal richtig hat, gewinnt; findet sich keine
     Definition mehr, gewinnt, wer vorn liegt. Am Ende stehen alle
     Definitionen der Runde mit ihrem Begriff da. Schreibt KEINEN
     Lernstand (zwei Personen, ein Konto). Mit der Maus geht es auch,
     nur eben einer nach dem anderen. */
  const DU_LOCK_MS = 1200, DU_GOALS = [3, 5, 8, 10], DU_SIZES = [12, 20, 30], DU_MAX = 30;

  function duOptions(n) {
    const o = DU_SIZES.filter(x => x < n);
    if (!o.includes(Math.min(n, DU_MAX))) o.push(Math.min(n, DU_MAX));
    return o;
  }
  function newDuel(goal, size) {
    duStop();
    const pool = shuffle(memPool().slice());
    const opts = duOptions(pool.length);
    const sz = opts.includes(size) ? size : opts[opts.length - 1];
    const r = () => Math.random() * 2 - 1;
    du = {
      goal: DU_GOALS.includes(goal) ? goal : 5, size: sz, n: pool.length, opts,
      // rot: leicht schräg; x/y: Mitte des Zettels im Brett (duLayout/duPlace)
      slots: pool.slice(0, sz).map((c, i) => ({ i, c, rot: r() * 6, x: 0, y: 0 })),
      rest: pool.slice(sz),
      p: { 1: { card: null, prev: null, score: 0, lock: 0 }, 2: { card: null, prev: null, score: 0, lock: 0 } },
      log: [], drag: new Map(), state: 'ready', timers: []
    };
  }
  /* Alle Takte und Finger des Duells loslassen (Neustart, Verlassen). */
  function duStop() {
    if (!du) return;
    du.timers.forEach(clearTimeout);
    du.timers = [];
    du.drag.clear();
    du.state = 'off';
  }
  function duLater(d, ms, fn) {
    const t = setTimeout(() => { if (du === d && root && d.state !== 'off') fn(); }, ms);
    d.timers.push(t);
  }

  function renderDuel() {
    const pane = root.querySelector('#ddPane');
    if (!du) newDuel(5, DU_MAX);
    const side = k => '<div class="dd-duside dd-duside--' + k + '" id="ddDu' + k + '">' +
        '<div class="dd-duside__h"><span class="dd-pl dd-pl--' + k + ' is-on"><span class="dd-pl__n">Spieler ' + k + '</span><b id="ddDuS' + k + '"></b></span>' +
          '<span class="dd-dudots" id="ddDuDots' + k + '"></span></div>' +
        '<div class="dd-dudef" id="ddDuDef' + k + '">' +
          '<span class="dd-dudef__box"><span class="dd-dudef__p"></span></span>' +
          '<span class="dd-dulock" aria-hidden="true"><b>Falsch!</b><i></i></span></div>' +
      '</div>';
    pane.innerHTML =
      '<section class="dd-mem dd-duel" id="ddDuel">' +
        '<div class="dd-membar">' +
          '<div class="dd-membar__set">' +
            '<select class="dd-input dd-input--s" data-du="goal" aria-label="Wie viele richtig zum Sieg">' + DU_GOALS.map(g =>
              '<option value="' + g + '"' + (g === du.goal ? ' selected' : '') + '>Sieg bei ' + g + '</option>').join('') + '</select>' +
            '<select class="dd-input dd-input--s" data-du="size" aria-label="Begriffe in der Mitte">' + du.opts.map(o =>
              '<option value="' + o + '"' + (o === du.size ? ' selected' : '') + '>' + o + ' Begriffe' + (o === du.n ? ' (alle)' : '') + '</option>').join('') + '</select>' +
            '<button type="button" class="btn btn--sm" data-act="du-new">' + ico.again + 'Neustart</button>' +
          '</div>' +
          '<p class="dd-turn">Beide gleichzeitig: den passenden Begriff auf die eigene Seite ziehen.</p>' +
          (fsOk() ? '<button type="button" class="btn btn--sm dd-ic dd-fsbtn" data-act="mm-fs" title="Vollbild" aria-label="Vollbild">' + (fsEl() ? ico.unfull : ico.full) + '</button>' : '') +
        '</div>' +
        '<div class="dd-duboard" id="ddDuBoard">' +
          side(1) +
          '<div class="dd-dupool" id="ddDuPool"></div>' +
          side(2) +
          '<div class="dd-duready" id="ddDuReady"></div>' +
        '</div>' +
        '<div class="dd-memwin" id="ddDuWin" hidden></div>' +
      '</section>';
    const pool = root.querySelector('#ddDuPool');
    pool.innerHTML = du.slots.map(duChipHTML).join('');
    bindDuelDrag(pool);
    duPaintSide(1); duPaintSide(2);
    duLayout();
    duPaintReady();
  }
  const duChipHTML = s => s.c
    ? '<span class="dd-duchip" id="ddDuC' + s.i + '" data-slot="' + s.i + '"' + (demo ? ' data-cid="' + E(s.c.id) + '"' : '') + ' style="--r:' + s.rot.toFixed(1) + 'deg"><span class="dd-duchip__p">' + E(s.c.t) + '</span></span>'
    : '<span class="dd-duchip is-gone" id="ddDuC' + s.i + '" data-slot="' + s.i + '"></span>';

  /* Die Begriffe liegen verstreut über das Brett, ohne sich zu
     überlappen und ohne die beiden Ecken unten mit den Definitionen
     (Sönke 29.10.2026: „nicht in Reihen, einfach auf dem Feld
     verteilt“). Eine Schrift für alle: so groß, dass alle Zettel
     zusammen höchstens DU_FILL der freien Fläche belegen; dann wird
     Zettel für Zettel ein freier Platz ausgelost — von mehreren
     freien Kandidaten der, der am weitesten von den anderen weg ist,
     damit es sich gleichmäßig verteilt. Passt nicht alles, wird die
     Schrift kleiner. Ein neuer Begriff (duPlace) kommt in eine Lücke,
     die anderen bleiben liegen. Ändert sich nur die Größe des Bretts
     wenig (Adressleiste), werden die Plätze mitgezogen statt neu
     gelost. */
  const DU_FILL = 0.58, DU_GAP = 10;
  function duGeom() {
    const pool = root && root.querySelector('#ddDuPool');
    if (!du || !pool) return null;
    const w = pool.clientWidth || 400, h = pool.clientHeight || 400, pr = pool.getBoundingClientRect();
    const holes = [1, 2].map(k => root.querySelector('#ddDu' + k)).filter(Boolean).map(el => {
      const r = el.getBoundingClientRect();
      return { x0: r.left - pr.left, y0: r.top - pr.top, x1: r.right - pr.left, y1: r.bottom - pr.top };
    });
    return { pool, w, h, holes };
  }
  /* Schrift setzen und den Zettel messen (Drehung als Rand dazu). */
  function duMeasure(G, s, font) {
    const el = G.pool.querySelector('#ddDuC' + s.i);
    if (!el || !s.c) return null;
    const p = el.querySelector('.dd-duchip__p');
    const maxW = Math.min(G.w * 0.34, 280);
    el.style.maxWidth = maxW + 'px';
    p.style.fontSize = font + 'px';
    if (p.scrollWidth > el.clientWidth) fitText(p, el, font, 9);   // ein einzelnes sehr langes Wort
    const sin = Math.abs(Math.sin(s.rot * Math.PI / 180));
    const bw = el.offsetWidth, bh = el.offsetHeight;
    return { el, w: bw + bh * sin, h: bh + bw * sin };
  }
  const duHit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  /* Einen freien Platz für einen Zettel (m = Maße) suchen; taken = Rechtecke
     der anderen. Geprüft wird ein feines Netz möglicher Mitten (mit
     zufälligem Versatz); genommen wird zufällig einer der Plätze, die
     fast so weit von allen anderen weg sind wie der beste. */
  function duSpot(G, m, taken) {
    const hw = m.w / 2 + DU_GAP / 2, hh = m.h / 2 + DU_GAP / 2;
    if (G.w < 2 * hw || G.h < 2 * hh) return null;
    const step = Math.max(8, Math.min(G.w, G.h) / 40);
    const ox = Math.random() * step, oy = Math.random() * step;
    const cand = [];
    let bestD = 0;
    for (let y = hh + oy; y <= G.h - hh; y += step) {
      for (let x = hw + ox; x <= G.w - hw; x += step) {
        const r = { x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh };
        if (G.holes.some(o => duHit(r, o)) || taken.some(o => duHit(r, o))) continue;
        // Abstand zum nächsten Zettel (Rand zu Rand), die Wand zählt halb
        let d = Math.min(x - hw, G.w - hw - x, y - hh, G.h - hh - y) * 2 + 40;
        for (const o of taken) d = Math.min(d, Math.max(o.x0 - r.x1, r.x0 - o.x1, o.y0 - r.y1, r.y0 - o.y1, 0) + 1);
        cand.push({ x, y, r, d });
        if (d > bestD) bestD = d;
      }
    }
    if (!cand.length) return null;
    const good = cand.filter(c => c.d >= bestD * 0.6);
    return good[Math.floor(Math.random() * good.length)];
  }
  function duSet(m, s, x, y) {
    s.x = x; s.y = y;
    m.el.style.left = x + 'px';
    m.el.style.top = y + 'px';
  }
  function duLayout() {
    const G = duGeom();
    if (!G) return;
    const live = du.slots.filter(s => s.c);
    // Nur etwas größer/kleiner geworden: Plätze mitziehen statt neu losen.
    if (du.lw && Math.abs(G.w / du.lw - 1) < 0.2 && Math.abs(G.h / du.lh - 1) < 0.2) {
      const fx = G.w / du.lw, fy = G.h / du.lh;
      for (const s of live) {
        const m = duMeasure(G, s, du.font);
        if (m) duSet(m, s, s.x * fx, s.y * fy);
      }
      du.lw = G.w; du.lh = G.h;
      for (const k of [1, 2]) duFitDef(k);
      return;
    }
    const free = G.w * G.h - G.holes.reduce((a, o) => a + (o.x1 - o.x0) * (o.y1 - o.y0), 0);
    let font = 22, placed = false, ms = [];
    for (;;) {
      ms = live.map(s => ({ s, m: duMeasure(G, s, font) })).filter(x => x.m);
      const area = ms.reduce((a, x) => a + (x.m.w + DU_GAP) * (x.m.h + DU_GAP), 0);
      if (area > free * DU_FILL && font > 11) { font = Math.max(11, font * Math.max(0.85, Math.sqrt(free * DU_FILL / area))); continue; }
      // große Zettel zuerst, sonst finden sie am Ende keinen Platz mehr
      ms.sort((a, b) => b.m.w * b.m.h - a.m.w * a.m.h);
      for (let tries = 0; tries < 3 && !placed; tries++) {
        const taken = [], spots = [];
        placed = ms.every(x => { const sp = duSpot(G, x.m, taken); if (!sp) return false; taken.push(sp.r); spots.push(sp); return true; });
        if (placed) ms.forEach((x, i) => duSet(x.m, x.s, spots[i].x, spots[i].y));
      }
      if (placed || font <= 11) break;
      font = Math.max(11, font * 0.92);
    }
    if (!placed) {   // zu wenig Platz (sehr kleines Brett): so viele wie möglich frei, der Rest notfalls überlappend
      const taken = [];
      for (const x of ms) {
        const sp = duSpot(G, x.m, taken);
        if (sp) { taken.push(sp.r); duSet(x.m, x.s, sp.x, sp.y); }
        else duSet(x.m, x.s, x.m.w / 2 + Math.random() * Math.max(1, G.w - x.m.w), x.m.h / 2 + Math.random() * Math.max(1, G.h * 0.6 - x.m.h));
      }
    }
    du.font = font; du.lw = G.w; du.lh = G.h;
    for (const k of [1, 2]) duFitDef(k);
  }
  /* Ein neuer Begriff in eine Lücke; die anderen bleiben liegen. */
  function duPlace(s) {
    const G = duGeom();
    if (!G || !s.c || !du.font) { duLayout(); return; }
    const taken = [];
    for (const o of du.slots) {
      if (o === s || !o.c) continue;
      const el = G.pool.querySelector('#ddDuC' + o.i);
      if (!el || el.classList.contains('is-away')) continue;
      const sin = Math.abs(Math.sin(o.rot * Math.PI / 180)), bw = el.offsetWidth, bh = el.offsetHeight;
      const hw = (bw + bh * sin) / 2 + DU_GAP / 2, hh = (bh + bw * sin) / 2 + DU_GAP / 2;
      taken.push({ x0: o.x - hw, y0: o.y - hh, x1: o.x + hw, y1: o.y + hh });
    }
    for (let f = du.font; f >= 10; f *= 0.88) {
      const m = duMeasure(G, s, f);
      if (!m) return;
      const sp = duSpot(G, m, taken);
      if (sp) { duSet(m, s, sp.x, sp.y); return; }
    }
    duLayout();
  }
  function duFitDef(k) {
    const box = root.querySelector('#ddDuDef' + k);
    if (!box) return;
    const p = box.querySelector('.dd-dudef__p'), b = box.querySelector('.dd-dudef__box');
    if (p && b && p.textContent) fitText(p, b, Math.max(14, Math.min(24, b.clientWidth / 10)), 10);
  }

  function duPaintSide(k) {
    const d = du, P = d.p[k], box = root.querySelector('#ddDuDef' + k);
    if (!box) return;
    root.querySelector('#ddDuS' + k).textContent = P.score;
    root.querySelector('#ddDuDots' + k).innerHTML = Array.from({ length: d.goal }, (_, i) => '<i' + (i < P.score ? ' class="is-on"' : '') + '></i>').join('');
    const p = box.querySelector('.dd-dudef__p');
    p.textContent = P.card ? P.card.d : (d.state === 'ready' || d.state === 'count' ? '?' : '');
    box.classList.toggle('is-wait', !P.card);
    // Nur im Schaufenster: das Drehbuch (preview/derby.js) muss wissen, welcher Begriff passt.
    if (demo) box.dataset.cid = P.card ? P.card.id : '';
    duFitDef(k);
  }

  /* Vor dem Start: „Los!“ und ein Countdown, damit beide gleich anfangen. */
  function duPaintReady(n) {
    const box = root.querySelector('#ddDuReady');
    if (!box) return;
    if (du.state === 'ready') {
      box.hidden = false;
      box.innerHTML = '<div class="dd-duready__sheet"><h3>Bereit?</h3>' +
        '<p>Spieler 1 links, Spieler 2 rechts. Wer zuerst <b>' + du.goal + '</b> Begriffe richtig zu sich zieht, gewinnt.</p>' +
        '<button type="button" class="btn btn--primary dd-duready__go" data-act="du-start">Los!</button></div>';
    } else if (du.state === 'count') {
      box.hidden = false;
      box.innerHTML = '<span class="dd-duready__n" aria-live="assertive">' + n + '</span>';
    } else box.hidden = true;
  }
  function duStart() {
    const d = du;
    if (!d || d.state !== 'ready') return;
    d.state = 'count';
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = n => {
      if (n === 0) {
        d.state = 'play';
        duPaintReady();
        duNewCard(1); duNewCard(2);
        if (d.state === 'play') { duPaintSide(1); duPaintSide(2); }
        return;
      }
      duPaintReady(n);
      duLater(d, reduced ? 300 : 700, () => step(n - 1));
    };
    step(3);
  }

  /* Neue Definition für Seite k: ein Begriff aus der Mitte, nicht der
     von drüben und möglichst nicht der eben gehabte. */
  function duNewCard(k) {
    const d = du, P = d.p[k], other = d.p[k === 1 ? 2 : 1].card;
    const live = d.slots.filter(s => s.c && !(other && s.c.id === other.id)).map(s => s.c);
    const fresh = live.filter(c => !(P.prev && c.id === P.prev.id));
    const pick = (fresh.length ? fresh : live);
    P.card = pick.length ? pick[Math.floor(Math.random() * pick.length)] : null;
    if (P.card) P.prev = P.card;
    if (!P.card) duWin(null);
  }

  /* Ziehen mit beliebig vielen Fingern zugleich (je pointerId ein Begriff). */
  function bindDuelDrag(pool) {
    const sideAt = (x, y) => {
      for (const k of [1, 2]) {
        const el = root.querySelector('#ddDu' + k);
        const r = el && el.getBoundingClientRect();
        if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return k;
      }
      return 0;
    };
    const markOver = () => {
      const over = new Set();
      for (const g of du.drag.values()) if (g.over) over.add(g.over);
      for (const k of [1, 2]) { const el = root.querySelector('#ddDu' + k); if (el) el.classList.toggle('is-over', over.has(k)); }
    };
    pool.addEventListener('pointerdown', ev => {
      const el = ev.target.closest('.dd-duchip');
      if (!el || !du || du.state !== 'play' || el.classList.contains('is-gone') || el.classList.contains('is-drag') || el.classList.contains('is-away')) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      ev.preventDefault();
      const s = du.slots[Number(el.dataset.slot)];
      if (!s || !s.c) return;
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* alter Browser */ }
      du.drag.set(ev.pointerId, { el, s, c: s.c, x0: ev.clientX, y0: ev.clientY, over: 0 });
      el.classList.add('is-drag');
      el.style.setProperty('--dx', '0px'); el.style.setProperty('--dy', '0px');
    });
    const move = ev => {
      const g = du && du.drag.get(ev.pointerId);
      if (!g) return;
      ev.preventDefault();
      g.el.style.setProperty('--dx', (ev.clientX - g.x0) + 'px');
      g.el.style.setProperty('--dy', (ev.clientY - g.y0) + 'px');
      const o = sideAt(ev.clientX, ev.clientY);
      if (o !== g.over) { g.over = o; markOver(); }
    };
    const up = ev => {
      const d = du, g = d && d.drag.get(ev.pointerId);
      if (!g) return;
      d.drag.delete(ev.pointerId);
      markOver();
      const k = ev.type === 'pointerup' ? sideAt(ev.clientX, ev.clientY) : 0;
      if (!k || d.state !== 'play' || g.s.c !== g.c) { duBack(g.el); return; }
      duDrop(k, g);
    };
    pool.addEventListener('pointermove', move);
    pool.addEventListener('pointerup', up);
    pool.addEventListener('pointercancel', up);
    pool.addEventListener('lostpointercapture', up);
  }
  function duBack(el, wrong) {
    el.classList.remove('is-drag');
    el.style.setProperty('--dx', '0px'); el.style.setProperty('--dy', '0px');
    if (wrong) { el.classList.remove('is-no'); void el.offsetWidth; el.classList.add('is-no'); }
  }

  function duDrop(k, g) {
    const d = du, P = d.p[k], side = root.querySelector('#ddDu' + k);
    if (!P.card || P.lock > Date.now()) { duBack(g.el); return; }   // gesperrt: einfach zurück
    if (g.c.id === P.card.id) {
      P.score++;
      d.log.push({ k, card: P.card, ok: true });
      // Der Begriff fliegt in die Definition und ist weg; sein Platz bekommt einen neuen.
      const def = root.querySelector('#ddDuDef' + k).getBoundingClientRect();
      const r = g.el.getBoundingClientRect();
      const dx = parseFloat(g.el.style.getPropertyValue('--dx')) || 0, dy = parseFloat(g.el.style.getPropertyValue('--dy')) || 0;
      g.el.classList.remove('is-drag');
      g.el.classList.add('is-away');
      g.el.style.setProperty('--dx', (dx + def.left + def.width / 2 - (r.left + r.width / 2)) + 'px');
      g.el.style.setProperty('--dy', (dy + def.top + def.height / 2 - (r.top + r.height / 2)) + 'px');
      side.classList.remove('is-ok'); void side.offsetWidth; side.classList.add('is-ok');
      const s = g.s;
      s.c = d.rest.length ? d.rest.shift() : null;
      s.rot = (Math.random() * 2 - 1) * 6;
      duLater(d, 320, () => {
        const old = root.querySelector('#ddDuC' + s.i);
        if (!old) return;
        old.outerHTML = duChipHTML(s);
        const nu = root.querySelector('#ddDuC' + s.i);
        if (nu && s.c) { nu.classList.add('is-new'); duPlace(s); }
      });
      if (P.score >= d.goal) { duPaintSide(k); duWin(k); return; }
      duNewCard(k);
    } else {
      d.log.push({ k, card: P.card, ok: false, got: g.c });
      duBack(g.el, true);
      P.lock = Date.now() + DU_LOCK_MS;
      side.classList.add('is-lock');
      side.style.setProperty('--lock', DU_LOCK_MS + 'ms');
      duLater(d, DU_LOCK_MS, () => { side.classList.remove('is-lock'); });
      duNewCard(k);
    }
    if (d.state === 'play') duPaintSide(k);
  }

  /* Ende: Sieger (k), oder null = kein Begriff mehr übrig → wer vorn liegt. */
  function duWin(k) {
    const d = du;
    if (!d || d.state === 'over') return;
    d.state = 'over';
    for (const g of d.drag.values()) duBack(g.el);
    d.drag.clear();
    const a = d.p[1].score, b = d.p[2].score;
    const w = k || (a === b ? 0 : a > b ? 1 : 2);
    const h = w ? 'Spieler ' + w + ' gewinnt!' : 'Unentschieden!';
    const t = k ? d.p[w].score + ' zu ' + d.p[w === 1 ? 2 : 1].score + '.' : 'Keine Begriffe mehr übrig. ' + (w ? a + ' zu ' + b + '.' : 'Beide haben ' + a + '.');
    // Jede Definition einmal, mit dem, was daraus wurde
    const seen = new Map();
    for (const e of d.log) {
      const x = seen.get(e.card.id) || { card: e.card, ok: 0, no: [] };
      if (e.ok) x.ok = e.k; else x.no.push(e.k);
      seen.set(e.card.id, x);
    }
    const rows = [...seen.values()].map(x =>
      '<li class="dd-dulog__i' + (x.ok ? ' is-ok dd-dulog__i--' + x.ok : '') + '"><b>' + E(x.card.t) + '</b><span>' + E(x.card.d) + '</span>' +
        '<em>' + (x.ok ? 'Spieler ' + x.ok : 'nicht gefunden') + '</em></li>').join('');
    const box = root.querySelector('#ddDuWin');
    if (!box) return;
    box.innerHTML = '<div class="dd-memwin__bg"></div><div class="dd-memwin__sheet dd-duwin" role="dialog" aria-modal="true" aria-labelledby="ddDuWinH">' +
      '<span class="dd-memwin__stamp">Fertig</span>' +
      '<h2 id="ddDuWinH">' + h + '</h2><p>' + t + '</p>' +
      '<div class="dd-memwin__sc"><span class="dd-pl dd-pl--1"><span class="dd-pl__n">Spieler 1</span><b>' + a + '</b></span>' +
        '<span class="dd-pl dd-pl--2"><span class="dd-pl__n">Spieler 2</span><b>' + b + '</b></span></div>' +
      '<div class="dd-memwin__act"><button type="button" class="btn btn--primary" data-act="du-new">' + ico.again + 'Noch einmal</button>' +
      '<button type="button" class="btn" data-act="home">' + ico.back + 'Zurück zu den Lernformen</button></div>' +
      (rows ? '<h3 class="dd-dulog__h">Diese Definitionen kamen dran</h3><ul class="dd-dulog">' + rows + '</ul>' : '') + '</div>';
    box.hidden = false;
    const btn = box.querySelector('.btn--primary'); if (btn) btn.focus({ preventScroll: true });
  }

  /* ══════════════════════════════════════════════════════════════
     INSEL (allein): jeder Begriff ein Wesen  ·  Etappe 3
     ══════════════════════════════════════════════════════════════
     Alle Begriffe des Raums leben auf EINER Insel (islandIds), jeder
     Stapel ist eine Familie in eigener Farbe (FAM). Die Regeln —
     Stufen, Aufgaben, nachsichtiges Prüfen — stehen in insel.js
     (DDInsel); hier steht nur, was man sieht und antippt.

     Die Insel selbst baut welt.js (DDWelt): eigenes Gelände im
     Maßstab der Wesen, Tafelberge statt Gipfeln, Fantasie-Pflanzen.
     Das Gelände ist EINE Leinwand, die nur verschoben wird; Pflanzen
     und Wesen werden je Bild gemeinsam nach y sortiert gezeichnet
     (islFrame), damit ein Wesen auch hinter einem Pilz steht. Der
     Seed kommt aus dem Raumtitel: dieselbe Klasse sieht dieselbe
     Insel, und sie wächst mit der Zahl der Wesen.

     Die Wesen sind Sönkes Bilder (wesen/, Ast je Karte, Farbe je
     Familie: spriteCanvas/spriteURL); wesenSVG ist nur der Ersatz,
     falls sie nicht laden. Dazu Tag und Nacht, Leuchten mit Funken ab
     Groß, Schwimmer im Wasser und ab und zu Wolken (islSky).

     Eine Runde (islRound) ist jeder Begriff einmal (DDInsel.roundCards),
     falsch Beantwortetes kommt einmal später in derselben Runde wieder
     (requeue), ist es da wieder falsch, steht es in der nächsten Runde
     doppelt (CARRY im Gerät). Ein angetipptes Wesen „Trainieren“ ist
     eine Runde aus einer Aufgabe.
     Nach jeder Antwort wandert der neue Stand sofort in prog (e, x)
     und über saveProg zum Gerät/Konto. Der Stufensprung bekommt
     seinen eigenen Moment: das Bild im Aufgabenblatt wächst, ein Satz
     sagt, was passiert ist, und auf der Insel funkelt das Wesen. */
  const CARRY = 'dd.isl.carry';   // Karten-ids: in der letzten Runde zweimal falsch → nächste Runde doppelt
  const STAGE_TXT = ['ist geschlüpft!', 'ist gewachsen und jetzt klein.', 'ist gewachsen: jetzt mittelgroß.',
                     'ist groß geworden!', 'leuchtet!'];
  let isl = null;                 // Zustand der Insel (nur solange sie offen ist)
  let worldCache = null;          // { key, wc } — bleibt über mehrere Öffnungen
  let inselReady = null, weltReady = null;

  /* Die Stapel des Raums: Tablet alle geteilten, Lehrkraft im Raum die
     geteilten (sind keine geteilt: alle eigenen), ohne Raum alle eigenen.
     Sie leben immer auf der Insel (dazu aktive, die nicht geteilt sind) und
     sind der Standard für die aktiven Stapel (activeIds). */
  function islandIds() {
    const have = (list || []).map(x => x.id);
    if (!isTeacher || standalone) return have;
    const sh = sharedRaw().map(e => e.id).filter(id => have.includes(id));
    return sh.length ? sh : have;
  }

  /* ─── Nachladen ─── */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(src));
      document.head.appendChild(s);
    });
  }
  function ladeInsel() {
    if (window.DDInsel) return Promise.resolve();
    return inselReady || (inselReady = loadScript(BASE + 'insel.js?v=' + V).catch(e => { inselReady = null; throw e; }));
  }
  function ladeWelt() {
    if (window.DDWelt) return Promise.resolve();
    return weltReady || (weltReady = loadScript(BASE + 'welt.js?v=' + V).catch(e => { weltReady = null; throw e; }));
  }

  /* ─── Zufall mit Seed (Insel, Heimat der Familien, Platz der Wesen) ─── */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rngOf(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* ─── Die Insel bauen (einmal je Seed und Größe) ─── */
  /* spec = { tpl, ns } — Vorlage und Begriffe je Insel. Neu gebaut wird nur,
     wenn sich Vorlage, Zahl der Inseln oder eine Wachstumsstufe ändert. */
  function buildWorld(spec) {
    const W = window.DDWelt;
    const key = spec.tpl + ':' + spec.ns.map(W.stageFor).join(',');
    if (worldCache && worldCache.key === key) return worldCache.wc;
    const wc = W.build(spec);
    worldCache = { key, wc };
    return wc;
  }

  /* Welche Vorlage: im Raum aus data.isl (die Lehrkraft wählt; beim ersten
     Öffnen schreibt sie den Vorschlag aus dem Raumtitel fest, damit Umbenennen
     die Insel nicht tauscht), ohne Raum aus dem Gerät. Schüler dürfen auch
     wechseln (Sönke 29.10.2026), aber nur für sich: ihre Wahl steht im Gerät
     (dd.isl.m.<Raum>), sonst gilt die der Lehrkraft. */
  const myTplKey = () => 'dd.isl.m.' + hashStr((ctx && ctx.title) || 'raum');
  function islTpl() {
    if (!isTeacher && !standalone) { const m = Number(store.get(myTplKey())); if (store.get(myTplKey()) != null && m >= 0 && m < 3) return m; }
    const d = roomData().isl;
    if (Number.isInteger(d) && d >= 0 && d < 3) return d;
    if (standalone || demo) { const v = Number(store.get('dd.isl')); return v >= 0 && v < 3 ? v : 0; }
    return hashStr('derby:' + ((ctx && ctx.title) || 'raum')) % 3;
  }
  async function setTpl(v) {
    if (!(v >= 0 && v < 3) || v === islTpl()) return;
    if (isl && isl.round) return;
    if (standalone || demo) store.set('dd.isl', String(v));
    if (!isTeacher && !standalone) store.set(myTplKey(), String(v));   // Schüler: nur im eigenen Gerät
    else if (!standalone) {
      const res = await writeData({ isl: v });
      if (!res.ok) { toast(errMsg(res.error)); return; }
    }
    if (screen === 'play' && opened && opened.game === 'island') renderIsland();
  }

  /* ─── Wesen: Ersatz-Zeichnung, falls die Bilder nicht laden ─── */
  function mix(hex, to, k) {
    const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
    const ch = (v, s) => (v >> s) & 255;
    const m = s => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
    return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
  }
  function wesenSVG(col, e) {
    const C = col, D = mix(col, '#1d1408', 0.45), L = mix(col, '#ffffff', 0.62), W = '#ffffff', K = '#1f1a17';
    const o = ' stroke="' + D + '" stroke-width="2.4" stroke-linejoin="round"';
    const eyes = (y, r, gap) => '<circle cx="' + (50 - gap) + '" cy="' + y + '" r="' + r + '" fill="' + W + '"' + o + '/>' +
      '<circle cx="' + (50 + gap) + '" cy="' + y + '" r="' + r + '" fill="' + W + '"' + o + '/>' +
      '<circle cx="' + (51.5 - gap) + '" cy="' + (y + 0.8) + '" r="' + (r * 0.5) + '" fill="' + K + '"/>' +
      '<circle cx="' + (51.5 + gap) + '" cy="' + (y + 0.8) + '" r="' + (r * 0.5) + '" fill="' + K + '"/>' +
      '<circle cx="' + (52.5 - gap) + '" cy="' + (y - 0.6) + '" r="' + (r * 0.18) + '" fill="' + W + '"/>' +
      '<circle cx="' + (52.5 + gap) + '" cy="' + (y - 0.6) + '" r="' + (r * 0.18) + '" fill="' + W + '"/>';
    const feet = (y, rx, gap) => '<ellipse cx="' + (50 - gap) + '" cy="' + y + '" rx="' + rx + '" ry="' + (rx * 0.5) + '" fill="' + D + '"/>' +
      '<ellipse cx="' + (50 + gap) + '" cy="' + y + '" rx="' + rx + '" ry="' + (rx * 0.5) + '" fill="' + D + '"/>';
    let g = '';
    if (e === 0) {
      g = '<path d="M50 52C62 52 66 70 65.5 80C65 90 59 96 50 96C41 96 35 90 34.5 80C34 70 38 52 50 52Z" fill="' + L + '"' + o + '/>' +
        '<circle cx="44" cy="67" r="3.4" fill="' + C + '"/><circle cx="56" cy="76" r="4" fill="' + C + '"/>' +
        '<circle cx="45" cy="86" r="2.6" fill="' + C + '"/><circle cx="56" cy="61" r="2.2" fill="' + C + '"/><circle cx="57" cy="89" r="1.8" fill="' + C + '"/>' +
        '<path d="M40 63Q42 58 46 56.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>';
    } else if (e === 1) {
      g = feet(95, 5, 8) +
        '<circle cx="50" cy="78" r="18" fill="' + C + '"' + o + '/>' +
        '<ellipse cx="50" cy="85" rx="10" ry="7.5" fill="' + L + '"/>' + eyes(74, 6, 7) +
        '<path d="M46 83Q50 86 54 83" fill="none" stroke="' + K + '" stroke-width="1.8" stroke-linecap="round"/>' +
        '<path d="M35 66L39 59L43 64L47 57L51 63L55 57L59 63L63 59L65 66Q50 58 35 66Z" fill="' + mix(col, '#ffffff', 0.8) + '"' + o + '/>';
    } else if (e === 2) {
      g = feet(95, 6, 9) +
        '<path d="M33 62L35 44L46 56Z" fill="' + C + '"' + o + '/><path d="M67 62L65 44L54 56Z" fill="' + C + '"' + o + '/>' +
        '<ellipse cx="50" cy="74" rx="22" ry="21" fill="' + C + '"' + o + '/>' +
        '<ellipse cx="50" cy="82" rx="12" ry="10" fill="' + L + '"/>' + eyes(70, 6.5, 8) +
        '<path d="M44 80Q50 85 56 80" fill="none" stroke="' + K + '" stroke-width="2" stroke-linecap="round"/>';
    } else {
      const big = e >= 4;
      const cy = big ? 60 : 66, rx = big ? 30 : 25, ry = big ? 34 : 29;
      const top = cy - ry;
      g = feet(95, big ? 9 : 7, big ? 13 : 11) +
        (big ? '<path d="M78 74Q94 72 92 56Q88 66 76 64Z" fill="' + C + '"' + o + '/>' : '') +
        (big
          ? '<path d="M36 ' + (top + 8) + 'Q26 ' + (top - 8) + ' 34 ' + (top - 14) + 'Q34 ' + (top - 4) + ' 43 ' + (top + 3) + 'Z" fill="' + L + '"' + o + '/>' +
            '<path d="M64 ' + (top + 8) + 'Q74 ' + (top - 8) + ' 66 ' + (top - 14) + 'Q66 ' + (top - 4) + ' 57 ' + (top + 3) + 'Z" fill="' + L + '"' + o + '/>'
          : '<path d="M31 ' + (top + 14) + 'L31 ' + (top - 6) + 'L45 ' + (top + 6) + 'Z" fill="' + C + '"' + o + '/>' +
            '<path d="M69 ' + (top + 14) + 'L69 ' + (top - 6) + 'L55 ' + (top + 6) + 'Z" fill="' + C + '"' + o + '/>') +
        '<ellipse cx="' + (50 - rx + 2) + '" cy="' + (cy + 6) + '" rx="6" ry="11" fill="' + C + '"' + o + ' transform="rotate(18 ' + (50 - rx + 2) + ' ' + (cy + 6) + ')"/>' +
        '<ellipse cx="' + (50 + rx - 2) + '" cy="' + (cy + 6) + '" rx="6" ry="11" fill="' + C + '"' + o + ' transform="rotate(-18 ' + (50 + rx - 2) + ' ' + (cy + 6) + ')"/>' +
        '<ellipse cx="50" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + C + '"' + o + '/>' +
        '<ellipse cx="50" cy="' + (cy + ry * 0.35) + '" rx="' + (rx * 0.55) + '" ry="' + (ry * 0.5) + '" fill="' + L + '"/>' +
        eyes(cy - ry * 0.25, big ? 7.5 : 7, big ? 10 : 9) +
        (big ? '<path d="M' + 36 + ' ' + (cy - ry * 0.25 - 11) + 'L46 ' + (cy - ry * 0.25 - 8) + 'M64 ' + (cy - ry * 0.25 - 11) + 'L54 ' + (cy - ry * 0.25 - 8) + '" stroke="' + D + '" stroke-width="2.6" stroke-linecap="round"/>' : '') +
        '<path d="M42 ' + (cy + 4) + 'Q50 ' + (cy + 11) + ' 58 ' + (cy + 4) + '" fill="' + mix(col, '#3a0d0d', 0.6) + '" stroke="' + K + '" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M53 ' + (cy + 5.5) + 'l2 3.5l2 -3.5z" fill="#fff"/>';
      if (e === 5) {
        g += '<path d="M50 ' + (top - 22) + 'l3.2 7l7.6 .8l-5.7 5.1l1.6 7.5l-6.7 -3.9l-6.7 3.9l1.6 -7.5l-5.7 -5.1l7.6 -.8z" fill="#ffd84a" stroke="#c79a12" stroke-width="1.6" stroke-linejoin="round"/>' +
          '<circle cx="' + (50 - rx * 0.55) + '" cy="' + (cy + 3) + '" r="3" fill="#ffe680" opacity=".9"/><circle cx="' + (50 + rx * 0.55) + '" cy="' + (cy + 3) + '" r="3" fill="#ffe680" opacity=".9"/>';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + g + '</svg>';
  }
  /* ─── Wesen: Sönkes Bilder ───
     Kreaturen/ sind die Vorlagen, wesen/ die aufbereiteten Bilder
     (wesen/aufbereiten.py: zugeschnitten, je Stufe größer, Füße auf
     96 % eines Quadrats). Ein Wesen wächst auf einem Ast entlang
     (Sönke 27.10.2026: „entstehen zufällig, in alle Richtungen auf dem
     Ast“): Ei 1/2 → Baby → Klein a|b → Mittel a_a|a_b|b_a|b_b|b_c →
     Groß/Leuchtend eine Gabel weiter (b_c gabelt nicht mehr). Welcher
     Ast, würfelt die Karten-id — zufällig, aber auf jedem Gerät gleich.
     Familie = Farbe (Sönke: „neuer Stapel: alle Monster-Arten in einer
     neuen Farbe“): Familie 0 so, wie Sönke sie gemalt hat, die anderen
     bekommen den Grün-Blau-Bereich (Körper, Laub) auf einen Farbton
     gezogen; Holz, Bäuche, Augen und Blüten bleiben (recolor). */
  const WESEN_DIR = BASE + 'wesen/';
  const WESEN_FILES = ['ei1', 'ei2', 'baby', 'k_a', 'k_b', 'm_a_a', 'm_a_b', 'm_b_a', 'm_b_b', 'm_b_c',
    'g_a_a_a', 'g_a_a_b', 'g_a_b_a', 'g_a_b_b', 'g_b_a_a', 'g_b_a_b', 'g_b_b_a', 'g_b_b_b', 'g_b_c',
    'f_a_a_a', 'f_a_a_b', 'f_a_b_a', 'f_a_b_b', 'f_b_a_a', 'f_b_a_b', 'f_b_b_a', 'f_b_b_b', 'f_b_c'];
  /* Schlafende Fassung je Bild außer den Eiern (<name>_schlaf.webp). Fehlt
     eine, schläft das Wesen eben mit offenen Augen weiter (wache Fassung). */
  const SCHLAF = '_schlaf';
  /* Schwimmen können der Seedrache (a_a_b) und die Meeresschildkröte (a_b_b), ab Groß. */
  const SWIM = ['a_a_b', 'a_b_b'];
  /* Fliegen (Sönke 28.10.2026): die drei Vögel (m_b_a, g_b_a_a, f_b_a_a) haben
     ein fliegendes Bild (_flug), die Waldfeen (g_b_a_b, f_b_a_b) schweben schon
     im Hauptbild und haben ein stehendes (_steh). An Land laufen alle fünf
     ganz normal, in der Luft zeigen sie das fliegende Bild. */
  const FLUG = '_flug', STEH = '_steh';
  const FLY_FILES = { m_b_a: FLUG, g_b_a_a: FLUG, f_b_a_a: FLUG, g_b_a_b: STEH, f_b_a_b: STEH };
  const wesenBase = {};
  let wesenReady = null, wesenOk = false;
  function ladeWesen() {
    const files = WESEN_FILES.concat(WESEN_FILES.filter(f => !f.startsWith('ei')).map(f => f + SCHLAF),
      Object.keys(FLY_FILES).map(f => f + FLY_FILES[f]));
    return wesenReady || (wesenReady = Promise.all(files.map(f => new Promise(res => {
      const im = new Image();
      im.onload = () => { wesenBase[f] = im; res(true); };
      im.onerror = () => res(false);
      im.src = WESEN_DIR + f + '.webp?v=' + V;
    }))).then(() => { wesenOk = WESEN_FILES.every(f => wesenBase[f]); }));
  }
  const astCache = new Map();
  function wesenAst(id) {
    let a = astCache.get(id);
    if (a) return a;
    const r = rngOf(hashStr('wesen:' + id));
    const egg = r() < 0.5 ? 1 : 2;
    const k = r() < 0.5 ? 'a' : 'b';
    const m = k + '_' + (k === 'a' ? (r() < 0.5 ? 'a' : 'b') : ['a', 'b', 'c'][Math.floor(r() * 3)]);
    const g = m === 'b_c' ? m : m + '_' + (r() < 0.5 ? 'a' : 'b');
    a = { egg, k, m, g, swim: SWIM.includes(g) };
    astCache.set(id, a);
    return a;
  }
  /* pose: 'zz' schläft, 'air' fliegt, 'ground' läuft auf der Insel, sonst das
     Hauptbild (Aufgabenblatt, Leiste). Fehlt die Fassung, bleibt das Hauptbild. */
  function wesenFile(id, e, pose) {
    const a = wesenAst(id);
    const f = ['ei' + a.egg, 'baby', 'k_' + a.k, 'm_' + a.m, 'g_' + a.g, 'f_' + a.g][e];
    const z = pose === 'zz' ? SCHLAF
      : pose && FLY_FILES[f] && (pose === 'air') === (FLY_FILES[f] === FLUG) ? FLY_FILES[f] : '';
    return z && wesenBase[f + z] ? f + z : f;
  }
  const canSwim = (id, e) => e >= 4 && wesenAst(id).swim;
  /* Fliegen können der Vogel ab Mittel (Ast m = b_a) und alles, was aus ihm wird. */
  const canFly = (id, e) => e >= 3 && wesenAst(id).m === 'b_a';
  /* Größe auf der Insel je Stufe (Sönke 28.10.2026: „Eier und Babys sind kleiner,
     die anderen etwas größer, sodass eine leichte Steigerung zu sehen ist“;
     Klein bleibt wie das Bild).
     Mal dem, was die Bilder schon mitbringen (aufbereiten.py GROESSE 0,46 … 1,0):
     sichtbar ≈ 0,46 · 0,56 · 0,68 · 0,8 · 1,2 · 1,5 einer Wesen-Größe. */
  const WSIZE = [1, 1, 1, 1, 1.2 / 0.92, 1.5];

  /* Zielfarbton je Familie (null = Originalfarben) und passende Farbe für Chips/Balken. */
  const FAM_HUE = [null, 355, 275, 92, 218, 322, 32, 150, 250, 12, 195, 48];
  const FAM = FAM_HUE.map(h => h === null ? '#3f97a2' : hsl2hex(h, 0.5, 0.47));
  function hsl2hex(h, s, l) {
    const f = n => { const k = (n + h / 30) % 12, c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(c * 255).toString(16).padStart(2, '0'); };
    return '#' + f(0) + f(8) + f(4);
  }
  const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  /* hue: Zielton in Grad, 'grau' für die Legende. Gezogen wird nur Grün bis Blau
     (45°–232°, weiche Ränder), und zusammengestaucht, damit alle Arten einer
     Familie gleich wirken. */
  function recolor(im, hue) {
    const cv = document.createElement('canvas');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const g = cv.getContext('2d');
    g.drawImage(im, 0, 0);
    if (hue === null) return cv;
    const d = g.getImageData(0, 0, cv.width, cv.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
      if (hue === 'grau') {
        const y = (0.3 * r + 0.59 * gg + 0.11 * b) * 255 * 0.9 + 20;
        px[i] = px[i + 1] = px[i + 2] = y;
        continue;
      }
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, dd = mx - mn;
      if (dd < 0.02) continue;
      let h = mx === r ? ((gg - b) / dd) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
      h = (h * 60 + 360) % 360;
      const w = sst(45, 65, h) * (1 - sst(212, 232, h));
      if (w <= 0) continue;
      const s = dd / (1 - Math.abs(2 * l - 1));
      const to = hue + (h - 140) * 0.4;
      const nh = (h + ((((to - h) % 360) + 540) % 360 - 180) * w + 360) % 360;
      const ns = Math.min(1, s * (1 + 0.25 * w));
      const c = (1 - Math.abs(2 * l - 1)) * ns, x = c * (1 - Math.abs((nh / 60) % 2 - 1)), m0 = l - c / 2;
      const sx = Math.floor(nh / 60);
      const rgb = sx === 0 ? [c, x, 0] : sx === 1 ? [x, c, 0] : sx === 2 ? [0, c, x] : sx === 3 ? [0, x, c] : sx === 4 ? [x, 0, c] : [c, 0, x];
      px[i] = (rgb[0] + m0) * 255; px[i + 1] = (rgb[1] + m0) * 255; px[i + 2] = (rgb[2] + m0) * 255;
    }
    g.putImageData(d, 0, 0);
    return cv;
  }
  const spriteCvs = {}, spriteUrls = {};
  /* Leinwand eines Wesens (Familie × Ast × Stufe, pose s. wesenFile), null solange die Bilder fehlen. */
  function spriteCanvas(fam, id, e, pose) {
    if (!wesenOk) return null;
    const f = wesenFile(id, e, pose), k = (fam % FAM.length) + ':' + f;
    return spriteCvs[k] || (spriteCvs[k] = recolor(wesenBase[f], FAM_HUE[fam % FAM.length]));
  }
  /* Bild-Adresse für <img> (Aufgabenblatt, Familien, Endstand). Ohne Bilder: die alte Zeichnung. */
  function spriteURL(fam, e, id) {
    const cv = id != null && spriteCanvas(fam, id, e);
    if (cv) {
      const k = (fam % FAM.length) + ':' + wesenFile(id, e);
      return spriteUrls[k] || (spriteUrls[k] = cv.toDataURL('image/png'));
    }
    const k = fam + ':' + e;
    return spriteUrls[k] || (spriteUrls[k] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(wesenSVG(FAM[fam % FAM.length], e)));
  }
  /* Kleinere Fassungen (halbiert, halbiert …): weit weg gezeichnet würde die
     große Leinwand sonst flimmern und körnig wirken. */
  const spriteMips = {};
  function spriteLod(fam, id, e, px, pose) {
    const big = spriteCanvas(fam, id, e, pose);
    if (!big) return null;
    const k = (fam % FAM.length) + ':' + wesenFile(id, e, pose);
    let m = spriteMips[k];
    if (!m) {
      m = [big];
      while (m[m.length - 1].width > 48) {
        const a = m[m.length - 1], cv = document.createElement('canvas');
        cv.width = Math.round(a.width / 2); cv.height = Math.round(a.height / 2);
        const g = cv.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(a, 0, 0, cv.width, cv.height);
        m.push(cv);
      }
      spriteMips[k] = m;
    }
    let i = m.length - 1;
    while (i > 0 && m[i].width < px) i--;
    return m[i];
  }
  const svgImgs = {};
  function svgImg(fam, e) {
    const k = fam + ':' + e;
    if (!svgImgs[k]) { const im = new Image(); im.src = spriteURL(fam, e); svgImgs[k] = im; }
    return svgImgs[k];
  }

  /* ─── Öffnen ─── */
  function renderIsland() {
    const pane = root.querySelector('#ddPane');
    if (!pane) return;
    islStop();
    isl = { creatures: [], byId: new Map(), selId: null, dim: new Set(), cam: null, raf: 0, last: 0, task: null, round: null,
            ptr: new Map(), drag: null, ready: false };
    pane.innerHTML =
      '<section class="dd-isl" id="ddIsl">' +
        '<div class="dd-isl__map">' +
          '<canvas class="dd-isl__cv" id="ddIslCv" aria-label="Die Insel mit allen Wesen"></canvas>' +
          '<p class="dd-isl__wait" id="ddIslWait">Die Insel entsteht …</p>' +
          '<div class="dd-isl__zoom">' +
            '<button type="button" class="btn btn--sm dd-ic" data-act="isl-fit" aria-label="Ganze Insel">' + ico.full + '</button>' +
          '</div>' +
          '<div class="dd-isl__pop" id="ddIslPop" hidden></div>' +
          '<aside class="dd-isl__side" id="ddIslSide"></aside>' +
          '<div class="dd-isl__bar" id="ddIslBar"></div>' +
        '</div>' +
        '<div class="dd-task" id="ddTask" hidden></div>' +
      '</section>';
    paintSide();
    const me = isl;
    Promise.all([ladeInsel(), ladeWelt(), ladeWesen()]).then(() => {
      if (isl !== me || !root) return;
      // Erst zeichnen lassen („entsteht …“), dann rechnen (blockiert ~½ s).
      setTimeout(() => { if (isl === me && root) islBuild(); }, 30);
    }).catch(() => {
      const w = root && root.querySelector('#ddIslWait');
      if (w) w.textContent = 'Die Insel konnte nicht geladen werden. Bitte die Seite neu laden.';
    });
  }

  function islBuild() {
    const cards = opened.cards;
    const tpl = islTpl();
    // Ab 81 Begriffen eine zweite Insel, ab 151 eine dritte. Ganze Familien
    // (Stapel) wandern auf die Insel, die gerade am wenigsten Begriffe hat.
    const nIsl = window.DDWelt.islandCount(cards.length);
    const load = new Array(nIsl).fill(0), famIsl = [];
    opened.stacks.forEach((s, f) => {
      let best = 0;
      for (let i = 1; i < nIsl; i++) if (load[i] < load[best]) best = i;
      famIsl[f] = best; load[best] += s.cards.length;
    });
    let wc;
    try { wc = buildWorld({ tpl, ns: load }); } catch (e) {
      console.warn('[derby] Insel:', e);
      const w = root.querySelector('#ddIslWait'); if (w) w.textContent = 'Die Insel konnte nicht gebaut werden.';
      return;
    }
    isl.wc = wc;
    isl.tpl = tpl;
    if (isTeacher && !standalone && !demo && !Number.isInteger(roomData().isl)) writeData({ isl: tpl });
    const famOf = new Map(opened.stacks.map((s, i) => [s.id, i]));
    // Heimat je Familie: auf ihrer Insel möglichst weit von den anderen (farthest point)
    const r = rngOf(hashStr('derby-heimat') ^ tpl);
    const homes = [], roams = [];
    wc.islands.forEach((I, ii) => {
      const fams = opened.stacks.map((_, f) => f).filter(f => famIsl[f] === ii);
      const cand = I.homes.length ? I.homes : [{ x: I.box.x + I.box.w / 2, y: I.box.y + I.box.h / 2 }];
      const roam = Math.max(260, Math.sqrt(I.area / Math.max(1, fams.length)) * 0.45);
      const mine = [];
      for (const f of fams) {
        let best = cand[Math.floor(r() * cand.length)], bd = -1;
        if (mine.length) for (let k = 0; k < 60; k++) {
          const p = cand[Math.floor(r() * cand.length)];
          const dd = Math.min(...mine.map(h => (h.x - p.x) ** 2 + (h.y - p.y) ** 2));
          if (dd > bd) { bd = dd; best = p; }
        }
        mine.push(best); homes[f] = best; roams[f] = roam;
      }
    });
    isl.size = wc.S;
    isl.creatures = cards.map(c => {
      const fam = famOf.get(c.sid) || 0;
      const home = homes[fam] || wc.islands[0].homes[0] || { x: wc.width / 2, y: wc.height / 2 };
      const roam = roams[fam] || 300;
      const cr = rngOf(hashStr(c.id));
      let p = null;
      // Entdecker (ab Klein, nicht Baum/Busch) starten irgendwo auf ihrer Insel, damit sie schon gemischt sind.
      const e0 = stageOfId(c.id), I = wc.islands[famIsl[fam] || 0];
      if (I && e0 >= 4 && wesenAst(c.id).swim) {   // Schwimmer starten im Wasser rund um ihre Insel
        const water = swimOk(wc, false);
        for (let k = 0; k < 120 && !p; k++) {
          const q = { x: I.box.x - 300 + cr() * (I.box.w + 600), y: I.box.y - 300 + cr() * (I.box.h + 600) };
          if (water(q.x, q.y) && inMap(wc, q.x, q.y, 60) && nearLand(wc, q.x, q.y, SWIM_COAST)) p = q;
        }
      }
      if (I && !p && e0 >= 2 && !(e0 >= 3 && wesenAst(c.id).m === 'b_c')) {
        for (let k = 0; k < 60 && !p; k++) {
          const q = { x: I.box.x + cr() * I.box.w, y: I.box.y + cr() * I.box.h };
          if (wc.walk(q.x, q.y)) p = q;
        }
      }
      for (let k = 0; k < 40 && !p; k++) {
        const a = cr() * Math.PI * 2, d = Math.sqrt(cr()) * roam;
        const q = { x: home.x + Math.cos(a) * d, y: home.y + Math.sin(a) * d };
        if (wc.walk(q.x, q.y)) p = q;
      }
      if (!p) p = { x: home.x, y: home.y };
      const w = { id: c.id, card: c, fam, home, roam, x: p.x, y: p.y, tx: p.x, ty: p.y, walking: false,
                  until: performance.now() + cr() * 3000, phase: cr() * 6, seed: cr() * 100, dir: cr() < 0.5 ? -1 : 1, burst: 0, rnd: cr,
                  temper: 0.8 + cr() * 0.4 };
      isl.byId.set(c.id, w);
      return w;
    });
    const wait = root.querySelector('#ddIslWait'); if (wait) wait.remove();
    isl.ready = true;
    islBindCanvas();
    islResize();
    islFit(false);
    paintSide();
    isl.last = performance.now();
    isl.raf = requestAnimationFrame(islFrame);
  }

  function islStop() {
    if (!isl) return;
    cancelAnimationFrame(isl.raf);
    isl.raf = 0;
    if (isl.unbind) isl.unbind();
    isl = null;
  }

  /* ─── Kamera ─── */
  function islResize() {
    if (!isl || !isl.ready) return;
    const cv = root.querySelector('#ddIslCv');
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    isl.W = r.width; isl.H = r.height; isl.dpr = dpr;
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    // Auf kleinen Bildschirmen die Wesen etwas größer, damit man sie antippen kann.
    islInsets();
    isl.S = Math.min(isl.size * 1.8, Math.max(isl.size, 34 / islFitScale()));
    if (isl.cam) islClamp();
  }
  /* Was die Leiste links und der Kasten unten zudecken (wie Wordisland):
     die Insel wird nicht kleiner, sondern auf den freien Rest zentriert.
     Deckt die Leiste fast alles zu (Telefon), zählt sie nicht. */
  function islInsets() {
    const side = root.querySelector('#ddIslSide'), bar = root.querySelector('#ddIslBar');
    let l = side && side.classList.contains('is-open') ? side.offsetLeft + side.offsetWidth : 0;
    if (isl.W - l < isl.W * 0.45) l = 0;
    const b = bar && bar.offsetHeight ? isl.H - bar.offsetTop : 0;
    isl.inL = l; isl.inB = Math.max(0, Math.min(isl.H * 0.4, b));
  }
  const islView = () => ({ x: isl.inL || 0, w: isl.W - (isl.inL || 0), h: isl.H - (isl.inB || 0) });
  function islFitScale() { const b = isl.wc.bbox, v = islView(); return Math.min(v.w / b.w, v.h / b.h) * 0.96; }
  function islFit(anim) {
    if (!isl || !isl.ready) return;
    const b = isl.wc.bbox, s = islFitScale(), v = islView();
    const to = { s, tx: v.x + v.w / 2 - (b.x + b.w / 2) * s, ty: v.h / 2 - (b.y + b.h / 2) * s };
    if (anim && isl.cam && !still()) isl.anim = { from: Object.assign({}, isl.cam), to, t0: performance.now() };
    else isl.cam = to;
  }
  function islClamp() {
    const c = isl.cam, f = islFitScale();
    c.s = Math.max(f * 0.85, Math.min(f * 6, c.s));
    const b = isl.wc.bbox;
    // Die Insel darf nicht ganz aus dem freien Bereich rutschen.
    const v = islView(), mx = v.x + v.w * 0.5, my = v.h * 0.5;
    const minTx = mx - (b.x + b.w) * c.s, maxTx = mx - b.x * c.s;
    const minTy = my - (b.y + b.h) * c.s, maxTy = my - b.y * c.s;
    c.tx = Math.max(minTx, Math.min(maxTx, c.tx));
    c.ty = Math.max(minTy, Math.min(maxTy, c.ty));
  }
  function islZoomAt(k, sx, sy) {
    const c = isl.cam;
    const wx = (sx - c.tx) / c.s, wy = (sy - c.ty) / c.s;
    c.s *= k;
    islClamp();
    c.tx = sx - wx * c.s; c.ty = sy - wy * c.s;
    islClamp();
  }

  function islBindCanvas() {
    const cv = root.querySelector('#ddIslCv');
    const pos = ev => { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    const down = ev => {
      if (!isl) return;
      cv.setPointerCapture && cv.setPointerCapture(ev.pointerId);
      isl.ptr.set(ev.pointerId, pos(ev));
      isl.anim = null;
      if (isl.ptr.size === 1) isl.drag = { start: pos(ev), moved: 0, cam: Object.assign({}, isl.cam) };
      else isl.drag = Object.assign(isl.drag || {}, { moved: 99 });
      if (isl.ptr.size === 2) {
        const [a, b] = [...isl.ptr.values()];
        isl.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      }
    };
    const move = ev => {
      if (!isl || !isl.ptr.has(ev.pointerId)) return;
      const p = pos(ev);
      const prev = isl.ptr.get(ev.pointerId);
      isl.ptr.set(ev.pointerId, p);
      if (isl.ptr.size === 2 && isl.pinch) {
        const [a, b] = [...isl.ptr.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (isl.pinch.d > 0) islZoomAt(d / isl.pinch.d, m.x, m.y);
        isl.cam.tx += m.x - isl.pinch.m.x; isl.cam.ty += m.y - isl.pinch.m.y;
        islClamp();
        isl.pinch = { d, m };
        return;
      }
      if (isl.drag) {
        isl.drag.moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
        if (isl.drag.moved > 6) {
          isl.cam.tx = isl.drag.cam.tx + (p.x - isl.drag.start.x);
          isl.cam.ty = isl.drag.cam.ty + (p.y - isl.drag.start.y);
          islClamp();
          cv.classList.add('is-drag');
        }
      }
    };
    const up = ev => {
      if (!isl || !isl.ptr.has(ev.pointerId)) return;
      const p = pos(ev);
      isl.ptr.delete(ev.pointerId);
      if (isl.ptr.size < 2) isl.pinch = null;
      if (!isl.ptr.size) {
        const tap = isl.drag && isl.drag.moved <= 6 && ev.type === 'pointerup';
        isl.drag = null;
        cv.classList.remove('is-drag');
        if (tap) islTap(p.x, p.y);
      }
    };
    const wheel = ev => {
      if (!isl || !isl.ready) return;
      ev.preventDefault();
      isl.anim = null;
      const p = pos(ev);
      islZoomAt(Math.exp(-ev.deltaY * 0.0015), p.x, p.y);
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', wheel, { passive: false });
    isl.unbind = () => {
      cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up);
      cv.removeEventListener('wheel', wheel);
    };
  }

  const stageOfId = id => window.DDInsel ? window.DDInsel.stageOf(prog[id]) : 0;

  /* Antippen: das oberste Wesen unter dem Finger (größere Trefferfläche als das Bild). */
  function islTap(sx, sy) {
    const c = isl.cam, S = isl.S;
    let best = null, bd = Infinity;
    for (const w of isl.creatures) {
      const px = w.x * c.s + c.tx, py = (w.y - (w.alt || 0)) * c.s + c.ty, h = S * WSIZE[stageOfId(w.id)] * c.s;
      const dx = sx - px, dy = sy - (py - h * 0.4);
      const rad = Math.max(22, h * 0.45);
      const d = dx * dx + dy * dy;
      if (d < rad * rad && (d < bd || (best && w.y > best.y && d < bd * 1.5))) { best = w; bd = d; }
    }
    islSelect(best ? best.id : null);
  }
  function islSelect(id) {
    if (!isl) return;
    isl.selId = id;
    const pop = root.querySelector('#ddIslPop');
    if (!pop) return;
    const w = id && isl.byId.get(id);
    if (!w) { pop.hidden = true; pop.innerHTML = ''; return; }
    const e = stageOfId(id), I = window.DDInsel;
    pop.innerHTML =
      '<button type="button" class="dd-x dd-x--s" data-act="isl-unsel" aria-label="Schließen">×</button>' +
      '<span class="dd-isl__popfam" style="--f:' + FAM[w.fam % FAM.length] + '">' + E(stackTitle(w.card.sid)) + '</span>' +
      '<strong class="dd-isl__popt">' + E(w.card.t) + '</strong>' +
      stageDots(e) +
      '<span class="dd-isl__popst">Stufe ' + (e + 1) + ' von 6 · ' + I.STAGES[e] + '</span>' +
      '<button type="button" class="btn btn--primary btn--sm" data-act="isl-train">' + ico.play + (e >= I.MAX ? 'Wiederholen' : 'Trainieren') + '</button>';
    pop.hidden = false;
    islPlacePop();
  }
  function stageDots(e) {
    return '<span class="dd-sdots" aria-hidden="true">' + [0, 1, 2, 3, 4, 5].map(i => '<i' + (i <= e ? ' class="is-on' + (i === 5 ? ' is-glow' : '') + '"' : '') + '></i>').join('') + '</span>';
  }
  function islPlacePop() {
    const pop = root && root.querySelector('#ddIslPop');
    const w = isl && isl.selId && isl.byId.get(isl.selId);
    if (!pop || !w || pop.hidden) return;
    const c = isl.cam;
    const wy = w.y - (w.alt || 0);
    const px = w.x * c.s + c.tx, py = wy * c.s + c.ty - isl.S * WSIZE[stageOfId(w.id)] * c.s;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = px - pw / 2, top = py - ph - 10;
    if (top < 6) top = wy * c.s + c.ty + 12;
    const v = islView();
    left = Math.max(v.x + 6, Math.min(isl.W - pw - 6, left));
    top = Math.max(6, Math.min(v.h - ph - 6, top));
    pop.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  }

  /* ─── Himmel: Tag und Nacht, Wolken ───
     Der Tag läuft nach der Uhr (Date.now), damit die ganze Klasse
     gleichzeitig Nacht hat: DAY_MS lang, davon ~60 % Tag, Abendrot,
     Nacht, Morgenrot. Nachts legt sich ein Blau über alles (multiply),
     danach leuchten die großen Wesen, Laternenblumen und Kristalle
     (lighter). Wolken ziehen ab und zu mit dem Wind über die Insel,
     ihr Schatten fällt nach rechts unten (Licht von links oben); nah
     herangezoomt werden sie durchsichtig. */
  const DAY_MS = 6 * 60 * 1000;
  function skyAt(ms) {
    const p = (ms % DAY_MS) / DAY_MS;
    // 0 … .56 Tag · .56 … .66 Abend · .66 … .88 Nacht · .88 … .97 Morgen · danach Tag
    const night = sst(0.56, 0.66, p) * (1 - sst(0.88, 0.97, p));
    const warm = Math.max(0, 1 - Math.abs(p - 0.6) / 0.06) + Math.max(0, 1 - Math.abs(p - 0.925) / 0.05) * 0.8;
    return { night, warm: Math.min(1, warm) };
  }
  let cloudSprites = null;
  function cloudSprite(seed) {
    const r = rngOf(seed), W = 360, H = 170;
    const mk = (shade) => {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      const rr = rngOf(seed);
      for (let i = 0; i < 26; i++) {
        const u = rr(), x = 60 + u * (W - 120), y = 92 + (rr() - 0.5) * 40 - Math.sin(u * Math.PI) * 26, rad = (30 + rr() * 34) * (0.6 + Math.sin(u * Math.PI) * 0.6);
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        if (shade) { gr.addColorStop(0, 'rgba(15,25,35,.35)'); gr.addColorStop(1, 'rgba(15,25,35,0)'); }
        else { gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(0.5, 'rgba(246,248,251,.45)'); gr.addColorStop(1, 'rgba(230,236,243,0)'); }
        g.fillStyle = gr;
        g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      }
      return cv;
    };
    r();
    return { cloud: mk(false), shadow: mk(true), w: W, h: H };
  }
  function islClouds(now, dt) {
    if (!cloudSprites) cloudSprites = [11, 23, 37, 51].map(cloudSprite);
    const b = isl.wc.bbox;
    if (!isl.clouds) { isl.clouds = []; isl.nextCloud = now + 4000 + Math.random() * 8000; }
    if (now > isl.nextCloud && isl.clouds.length < 4 && !still()) {
      const k = 3 + Math.random() * 2.5, sp = cloudSprites[Math.floor(Math.random() * cloudSprites.length)];
      const n = Math.random() < 0.35 ? 2 + Math.floor(Math.random() * 2) : 1;
      const y0 = b.y + Math.random() * b.h;
      for (let i = 0; i < n; i++) {
        isl.clouds.push({ sp, k: k * (0.6 + Math.random() * 0.5), x: b.x - sp.w * k * (1 + i * 0.9) - 400, y: y0 + (Math.random() - 0.5) * 500,
                          v: 26 + Math.random() * 14 });
      }
      isl.nextCloud = now + 18000 + Math.random() * 40000;
    }
    for (const c of isl.clouds) c.x += c.v * dt;
    isl.clouds = isl.clouds.filter(c => c.x < b.x + b.w + 600);
  }
  function drawClouds(g, part) {
    if (!isl.clouds || !isl.clouds.length) return;
    // nah dran: durchsichtig, damit man die Wesen sieht
    const near = sst(0.2, 0.7, isl.S * isl.cam.s / 160);
    for (const c of isl.clouds) {
      const w = c.sp.w * c.k, h = c.sp.h * c.k;
      if (part === 'shadow') {
        g.globalAlpha = 0.45;
        g.drawImage(c.sp.shadow, c.x + w * 0.12, c.y + h * 0.9, w, h * 0.85);
      } else {
        g.globalAlpha = 0.9 * (1 - near * 0.8);
        g.drawImage(c.sp.cloud, c.x, c.y, w, h);
      }
    }
    g.globalAlpha = 1;
  }
  /* Schein hinter großen Wesen: einmal je Farbe gemalt. */
  const glowCvs = {};
  function glowSprite(col) {
    if (glowCvs[col]) return glowCvs[col];
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,248,210,.95)');
    gr.addColorStop(0.3, col + 'aa');
    gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return (glowCvs[col] = cv);
  }
  /* Funke: ganz in der Familienfarbe, ohne weißen Kern. */
  const sparkCvs = {};
  function sparkSprite(col) {
    if (sparkCvs[col]) return sparkCvs[col];
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, col + 'ff');
    gr.addColorStop(0.35, col + 'aa');
    gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (sparkCvs[col] = cv);
  }
  /* Leuchtfarbe einer Familie: hell und satt, für Schein und Funken. */
  const famGlow = f => FAM_HUE[f % FAM.length] === null ? '#8ff0dc' : hsl2hex(FAM_HUE[f % FAM.length], 0.9, 0.72);

  /* ─── Jedes Bild ─── */
  function islFrame(now) {
    if (!isl || !root) return;
    isl.raf = requestAnimationFrame(islFrame);
    const dt = Math.min(0.1, (now - isl.last) / 1000);
    isl.last = now;
    if (document.hidden) return;
    const cv = root.querySelector('#ddIslCv');
    if (!cv) return;
    if (isl.anim) {
      const a = isl.anim, k = Math.min(1, (now - a.t0) / 350), q = 1 - (1 - k) ** 3;
      isl.cam = { s: a.from.s + (a.to.s - a.from.s) * q, tx: a.from.tx + (a.to.tx - a.from.tx) * q, ty: a.from.ty + (a.to.ty - a.from.ty) * q };
      if (k >= 1) isl.anim = null;
    }
    islStep(now, dt);
    islClouds(now, dt);
    const sky = skyAt(Date.now() + (isl.clock || 0));
    const g = cv.getContext('2d'), c = isl.cam, dpr = isl.dpr, S = isl.S, calm = still();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = isl.wc.sea;
    g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(dpr * c.s, 0, 0, dpr * c.s, dpr * c.tx, dpr * c.ty);
    g.imageSmoothingEnabled = true;
    for (const pc of isl.wc.pieces) g.drawImage(pc.canvas, pc.x, pc.y, pc.w, pc.h);
    // Pflanzen und Wesen, von hinten nach vorn
    const list = isl.creatures.slice().sort((a, b) => a.y - b.y);
    const plants = isl.wc.plants;
    const vx0 = -c.tx / c.s - S, vy0 = -c.ty / c.s - S, vx1 = (isl.W - c.tx) / c.s + S, vy1 = (isl.H - c.ty) / c.s + S * 2;
    const lights = [];               // was nachts leuchtet: { x, y, r, col, a, w? }
    let pi = 0;
    const plantsUpTo = y => {
      g.globalAlpha = 1;
      for (; pi < plants.length && plants[pi].y <= y; pi++) {
        const p = plants[pi], sp = p.sp, w = sp.w * p.s, h = sp.h * p.s;
        if (p.x + w < vx0 || p.x - w > vx1 || p.y < vy0 || p.y - h > vy1) continue;
        g.save();
        g.translate(p.x, p.y - p.lift);
        if (p.flip) g.scale(-1, 1);
        g.drawImage(sp.canvas, -w / 2, -h, w, h);
        g.restore();
        if (sky.night > 0.05 && (p.type === 'laterne' || p.type === 'kristall'))
          lights.push({ x: p.x, y: p.y - p.lift - h * (p.type === 'laterne' ? 0.62 : 0.4), r: w * 0.7,
                        col: p.type === 'laterne' ? '#ffcf6a' : '#9fe8ff', a: 0.75 });
      }
    };
    // Wer hoch in der Luft ist, kommt nach den Pflanzen (fliegt über sie hinweg).
    const airs = [];
    const drawW = w => {
      const e = stageOfId(w.id);
      const S = isl.S * WSIZE[e];              // je Stufe größer
      const dim = isl.dim.has(w.fam);
      g.globalAlpha = dim ? 0.4 : 1;
      const wet = w.wet;                       // schwimmt gerade (im Wasser)
      const zz = !!w.sleep;                    // schläft gerade (nur an Land)
      const lift = w.alt || 0, wy = w.y - lift;   // Flughöhe
      const bob = w.fly ? (calm ? 0 : Math.sin(now / 170 + w.seed) * S * 0.035 * Math.min(1, lift / FLY_ALT))
        : wet ? Math.sin(now / 520 + w.phase) * S * 0.025
        : w.walking ? Math.abs(Math.sin(w.phase)) * S * (w.kind === 'slow' ? 0.02 : w.kind === 'baby' ? 0.09 : 0.07) : 0;
      // Schatten bzw. Wellenring
      if (lift > 1) {                          // in der Luft: Schatten unten, kleiner und blasser, je höher
        const k = 1 - 0.45 * Math.min(1, lift / FLY_ALT);
        g.fillStyle = 'rgba(20,30,10,' + (0.24 * k).toFixed(3) + ')';
        g.beginPath(); g.ellipse(w.x, w.y, S * 0.24 * k, S * 0.06 * k, 0, 0, Math.PI * 2); g.fill();
      } else if (wet) {
        g.strokeStyle = 'rgba(235,250,250,.55)'; g.lineWidth = S * 0.025;
        const rp = 0.3 + 0.04 * Math.sin(now / 400 + w.phase);
        g.beginPath(); g.ellipse(w.x, w.y - S * 0.18, S * rp, S * rp * 0.28, 0, 0, Math.PI * 2); g.stroke();
      } else {
        g.fillStyle = 'rgba(20,30,10,.28)';
        g.beginPath(); g.ellipse(w.x, w.y, S * (zz ? 0.3 : e ? 0.22 : 0.18), S * 0.06, 0, 0, Math.PI * 2); g.fill();
      }
      if (e >= 4 && !dim) {
        const pulse = e === 5 ? 0.62 + 0.18 * Math.sin(now / 1100 + w.seed) : 0.32;
        const R = S * (e === 5 ? 0.75 : 0.55), cy = wy - S * 0.45;
        if (sky.night > 0.02) {                // Schein nur nachts, ganz in der Familienfarbe
          g.globalAlpha = pulse * sky.night * 0.5;
          g.drawImage(sparkSprite(famGlow(w.fam)), w.x - R, cy - R, R * 2, R * 2);
          g.globalAlpha = 1;
        }
        lights.push({ x: w.x, y: cy, r: R * 1.15, col: famGlow(w.fam), a: pulse, w, e });
      }
      if (w.id === isl.selId) {
        g.strokeStyle = '#fff'; g.lineWidth = Math.max(2 / c.s, S * 0.03);
        g.beginPath(); g.ellipse(w.x, w.y, S * 0.34, S * 0.11, 0, 0, Math.PI * 2); g.stroke();
      }
      const pose = zz ? 'zz' : w.fly ? 'air' : 'ground';
      const im = spriteLod(w.fam, w.id, e, S * c.s * dpr, pose) || svgImg(w.fam, e);
      if (im.width || im.naturalWidth) {
        g.save();
        g.translate(w.x, wy - bob);
        if (zz && !calm) g.scale(1, 1 + 0.018 * Math.sin(now / 900 + w.seed));   // atmet
        if (e === 0) g.rotate(Math.sin(now / 260 + w.phase) * (Math.sin(now / 1700 + w.phase) > 0.6 ? 0.12 : 0.02));
        if (w.kind === 'slow' && w.walking && !calm) g.rotate(Math.sin(w.phase) * 0.06);   // Baum/Busch schwankt beim Gehen
        g.scale(w.face == null ? w.dir : w.face, 1);   // dreht sich weich um (islStep)
        if (wet) {                             // nur der Teil über Wasser
          g.beginPath(); g.rect(-S, -S * 1.2, S * 2, S * 1.2 - S * 0.18); g.clip();
        }
        g.drawImage(im, -S / 2, -S * 0.96, S, S);
        g.restore();
      }
      if (zz && !dim && !calm && S * c.s > 26) {   // „z z z“ steigt auf und verblasst
        const top = S * [0, 0.42, 0.5, 0.58, 0.66, 0.74][e];
        g.textAlign = 'center';
        g.lineJoin = 'round';
        for (let i = 0; i < 3; i++) {
          const t = (now / 2600 + i / 3 + w.seed) % 1, a = Math.sin(t * Math.PI) * 0.9;
          const px = w.x + (w.dir < 0 ? -1 : 1) * S * (0.12 + t * 0.2), py = w.y - top - t * S * 0.32;
          g.font = '700 ' + (S * (0.09 + t * 0.08)).toFixed(1) + 'px Outfit, system-ui, sans-serif';
          g.lineWidth = S * 0.02;
          g.strokeStyle = 'rgba(40,52,70,' + (a * 0.55).toFixed(3) + ')';
          g.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
          g.strokeText('z', px, py); g.fillText('z', px, py);
        }
      }
      if (w.burst) {
        const k = (now - w.burst) / 1300;
        if (k >= 1) w.burst = 0;
        else {
          g.fillStyle = 'rgba(255,230,120,' + (1 - k) + ')';
          for (let i = 0; i < 10; i++) {
            const a = i / 10 * Math.PI * 2 + w.phase;
            const rr = S * (0.25 + k * 0.6);
            g.beginPath(); g.arc(w.x + Math.cos(a) * rr, wy - S * 0.45 + Math.sin(a) * rr, S * 0.035 * (1 - k * 0.5), 0, Math.PI * 2); g.fill();
          }
        }
      }
    };
    for (const w of list) {
      plantsUpTo(w.y);
      if (w.x < vx0 || w.x > vx1 || w.y - (w.alt || 0) < vy0 || w.y > vy1) continue;
      if ((w.alt || 0) > S * 0.2) airs.push(w);
      else drawW(w);
    }
    g.globalAlpha = 1;
    plantsUpTo(Infinity);
    for (const w of airs) drawW(w);
    g.globalAlpha = 1;
    drawClouds(g, 'shadow');
    drawClouds(g, 'cloud');
    // Nacht (und Abend-/Morgenrot) über alles
    if (sky.night > 0.01 || sky.warm > 0.01) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'multiply';
      const n = sky.night, wm = sky.warm * 0.55;
      const ch = (day, warm, night) => Math.round(day + (warm - day) * wm + (night - day) * n);
      g.fillStyle = 'rgb(' + ch(255, 255, 88) + ',' + ch(255, 196, 104) + ',' + ch(255, 150, 168) + ')';
      g.fillRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'source-over';
      g.setTransform(dpr * c.s, 0, 0, dpr * c.s, dpr * c.tx, dpr * c.ty);
    }
    // Was leuchtet — nur nachts: Schein und Funken in der Familienfarbe
    g.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      if (L.w && isl.dim.has(L.w.fam)) continue;
      if (sky.night > 0.02) {
        g.globalAlpha = Math.min(1, L.a * sky.night * (L.w ? 0.9 : 0.7));
        g.drawImage(L.w ? sparkSprite(L.col) : glowSprite(L.col), L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
      }
      if (L.w && !calm && sky.night > 0.02) {  // Funken (nur nachts): steigen sanft auf und verglimmen
        const n = L.e === 5 ? 8 : 4, life = L.e === 5 ? 4.6 : 5.6, w = L.w, S = isl.S * WSIZE[L.e];
        const sprk = sparkSprite(L.col);
        for (let i = 0; i < n; i++) {
          // fester Takt je Funke (w.seed, NICHT w.phase — die läuft beim Laufen mit und ließ es flackern)
          const age = (now / 1000) / life + i / n + w.seed;
          const t = age % 1, cyc = Math.floor(age);
          const h = Math.sin((cyc * 12.9898 + i * 78.233 + w.seed) * 43758.5453) % 1;   // neuer Startpunkt je Durchgang
          const sx = (h < 0 ? h + 1 : h) * 2 - 1;
          const px = w.x + sx * S * 0.3 + Math.sin(t * 2.4 + i * 1.7 + w.seed) * S * 0.04;
          const py = w.y - (w.alt || 0) - S * 0.15 - (1 - (1 - t) * (1 - t)) * S * (L.e === 5 ? 0.95 : 0.7);
          const a = Math.min(1, t / 0.18) * Math.pow(1 - t, 1.6) * sky.night;
          const r = S * (0.06 + (i % 3) * 0.014) * (1 - t * 0.45);
          g.globalAlpha = a;
          g.drawImage(sprk, px - r, py - r, r * 2, r * 2);
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    // Namen, wenn man nah genug dran ist
    if (S * c.s > 70) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.font = '600 12px Outfit, system-ui, sans-serif';
      g.textAlign = 'center';
      for (const w of list) {
        const px = w.x * c.s + c.tx, py = (w.y - (w.alt || 0)) * c.s + c.ty;
        if (px < -60 || px > isl.W + 60 || py < -20 || py > isl.H + 30) continue;
        if (isl.dim.has(w.fam)) continue;
        const t = w.card.t.length > 22 ? w.card.t.slice(0, 21) + '…' : w.card.t;
        const tw = g.measureText(t).width;
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.fillRect(px - tw / 2 - 4, py + 4, tw + 8, 17);
        g.fillStyle = '#2b2620';
        g.fillText(t, px, py + 17);
      }
    }
    islPlacePop();
  }

  /* Bewegung: zu einem Ziel laufen (je nach Charakter, CHARS), dort eine Weile
     stehen. Schwimmer (canSwim) leben im Wasser rund um die Inseln (depth <
     -0,02: stecken halb darin) und gehen nur ab und zu an Land.
     Schlafen (Sönke 28.10.2026: „nicht nachts, sondern immer mal wieder“):
     wer an Land ankommt, legt sich ab und zu 15–45 s hin (CHARS.sleep), danach
     mindestens 30 s wach. Schwimmer schlafen am Strand oder treibend im Wasser.
     Antippen oder ein Stufensprung weckt. */
  /* Fliegen (Sönke 28.10.2026: „die Fliegenden fliegen gerne, auch etwas
     schneller über die ganze Karte“): Vögel und Waldfeen (canFly) laufen an
     Land ganz normal; bei einem Halt fliegen sie oft an eine weit entfernte
     Stelle irgendwo auf der Karte (FLY_P[0], auch zu einer anderen Insel)
     oder drehen eine Runde übers Meer (FLY_P[1]): erst zu einem Punkt über
     dem Wasser (f.way, immer innerhalb der Karte — Sönke: „sie sollen nicht
     von der Karte runterfliegen, sondern im Bogen zurückkehren“), dann ohne
     anzuhalten im Bogen zu einem Landeplatz. In der Luft (w.fly) zeigen sie
     das fliegende Bild, die Höhe w.alt steigt beim Abheben und sinkt vor der
     Landung. */
  const FLY_P = [0.45, 0.1];          // je Halt an Land: über die Karte fliegen · Runde übers Meer
  const FLY_ALT = 150, FLY_SP = 300;  // Flughöhe und Tempo (Einheiten, Wesen = 100)
  /* Landeplatz: irgendwo an Land auf der ganzen Karte, mindestens ein Stück weg (min). */
  function landingSpot(w, wc, min) {
    const B = wc.bbox;
    for (let k = 0; k < 40; k++) {
      const tx = B.x + w.rnd() * B.w, ty = B.y + w.rnd() * B.h;
      if (Math.hypot(tx - w.x, ty - w.y) < min) continue;
      if (wc.walk(tx, ty)) return { x: tx, y: ty };
    }
    return min ? null : { x: w.home.x, y: w.home.y };
  }
  /* Punkt über dem Meer für die Runde: innerhalb der Karte (bbox, mit Rand
     FLY_EDGE), vom Inselmittelpunkt aus eher nach außen, ein Stück weg. */
  const FLY_EDGE = 120;
  function seaSpot(w, wc) {
    const B = wc.bbox, cx = B.x + B.w / 2, cy = B.y + B.h / 2, out = Math.atan2(w.y - cy, w.x - cx);
    for (let k = 0; k < 50; k++) {
      const a = out + (w.rnd() - 0.5) * (k < 25 ? 2 : Math.PI * 2), r = 450 + w.rnd() * 1300;
      const tx = w.x + Math.cos(a) * r, ty = w.y + Math.sin(a) * r;
      if (tx < B.x + FLY_EDGE || tx > B.x + B.w - FLY_EDGE || ty < B.y + FLY_EDGE || ty > B.y + B.h - FLY_EDGE) continue;
      const d = wc.depth(tx, ty);
      if (d !== null && d < -0.03 && !wc.walk(tx, ty)) return { x: tx, y: ty };
    }
    return null;
  }
  function islFly(w, now, dt, fl, wc) {
    const f = w.fly, k = isl.size / 100;
    if (f.way && !fl) f.way = null;     // nach einem Rückschritt: gleich landen
    const tgt = f.way || f;
    w.tx = tgt.x; w.ty = tgt.y;
    const sp = FLY_SP * k * (w.temper || 1), d = Math.hypot(f.x - w.x, f.y - w.y);
    const want = FLY_ALT * k * (f.way ? 1 : Math.min(1, d / (FLY_ALT * k * 1.6)));
    w.alt += (want - w.alt) * Math.min(1, dt * 3.5);
    w.phase += dt * 8;
    if (f.way) {
      // ohne Bremsen über den Wendepunkt: kurz davor kommt der Landeplatz dran → Bogen
      steer(w, sp, 1.3, dt, null, true);
      if (Math.hypot(f.way.x - w.x, f.way.y - w.y) < 220) f.way = null;
      return;
    }
    if (!steer(w, sp, 1.3, dt, null)) return;
    w.fly = null; w.alt = 0; w.walking = false; w.vx = w.vy = 0;
    w.until = now + 500 + w.rnd() * 1500;
  }
  function islTakeOff(w, wc, away) {
    const way = away ? seaSpot(w, wc) : null;
    if (away && !way) return false;
    const p = landingSpot(w, wc, away ? 300 : Math.min(900, Math.hypot(wc.bbox.w, wc.bbox.h) * 0.25));
    if (!p) return false;
    w.fly = { x: p.x, y: p.y, way };
    w.alt = w.alt || 0;
    w.walking = false;
    return true;
  }
  /* Runde Bewegung (Sönke 28.10.2026: „flüssiger und runder“): jedes Wesen hat
     eine Geschwindigkeit (w.vx/w.vy), die sich nur mit agil je Sekunde zum Ziel
     dreht — so fährt es weich an, läuft Bögen und bremst vor dem Ziel. Würde
     der Bogen vom Weg abkommen (ok), geht es das Stück gerade (der gerade Weg
     ist geprüft). Liefert true, wenn das Ziel erreicht ist. */
  function steer(w, sp, agil, dt, ok, through) {
    const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
    if (d < 2) { w.x = w.tx; w.y = w.ty; return true; }
    const want = through ? sp : sp * Math.min(1, 0.22 + d / (sp * 0.9));   // vor dem Ziel abbremsen (außer: durchfliegen)
    const k = Math.min(1, dt * agil * (!through && d < sp * 0.7 ? 3 : 1)); // nah am Ziel enger lenken
    let vx = (w.vx || 0) + (dx / d * want - (w.vx || 0)) * k;
    let vy = (w.vy || 0) + (dy / d * want - (w.vy || 0)) * k;
    let nx = w.x + vx * dt, ny = w.y + vy * dt;
    if (ok && !ok(nx, ny)) {
      vx = dx / d * want; vy = dy / d * want;
      nx = w.x + vx * dt; ny = w.y + vy * dt;
    }
    if (Math.hypot(nx - w.x, ny - w.y) >= d) { w.x = w.tx; w.y = w.ty; return true; }
    w.vx = vx; w.vy = vy; w.x = nx; w.y = ny;
    if (Math.abs(vx) > sp * 0.12) w.dir = vx < 0 ? -1 : 1;
    return false;
  }
  function islStep(now, dt) {
    const wc = isl.wc;
    for (const w of isl.creatures) {
      const e = stageOfId(w.id);
      const sw = canSwim(w.id, e), fl = canFly(w.id, e);
      // Umdrehen dauert einen Augenblick (scale von -1 nach 1), statt zu springen
      const fd = w.dir - (w.face == null ? w.dir : w.face);
      w.face = still() ? w.dir : (w.face == null ? w.dir : w.face) + Math.sign(fd) * Math.min(Math.abs(fd), dt * 8);
      if (w.fly && still()) {             // Bewegung reduzieren: sofort zu Hause landen
        w.fly = null; w.alt = 0;
        if (!wc.walk(w.x, w.y)) { w.x = w.home.x; w.y = w.home.y; }
      }
      if (w.fly) { w.wet = false; islFly(w, now, dt, fl, wc); continue; }
      const d0 = wc.depth(w.x, w.y);
      w.wet = d0 !== null && d0 < -0.02 && !wc.walk(w.x, w.y);
      if (e === 0 || still()) { w.walking = false; w.sleep = 0; w.vx = w.vy = 0; continue; }
      if (w.sleep) {
        if (now < w.sleep && w.id !== isl.selId && !w.burst) continue;
        w.sleep = 0; w.awake = now + 30000; w.until = now + 600 + w.rnd() * 1200;
      }
      // Wer nicht (mehr) schwimmen kann und noch im Wasser ist, schwimmt nach Hause.
      if (!sw && !w.walking && !wc.walk(w.x, w.y)) { w.tx = w.home.x; w.ty = w.home.y; w.walking = true; }
      const C = charOf(w, e, sw);
      if (!w.walking) {
        if (now < w.until) {
          // in der Pause: ab und zu in die andere Richtung schauen (nicht die Trägen)
          if (C.look && now > (w.look || 0)) {
            w.look = now + 900 + w.rnd() * 2400;
            if (w.rnd() < 0.4) w.dir = -w.dir;
          }
          continue;
        }
        if (fl && !w.wet && wc.walk(w.x, w.y)) {
          const r = w.rnd();
          if (r < FLY_P[1] && now > (w.awake || 0) ? islTakeOff(w, wc, true) : r < FLY_P[0] + FLY_P[1] && islTakeOff(w, wc, false)) continue;
        }
        const t = sw ? swimTarget(w, C, wc, now) : wanderTarget(w, C, wc);
        if (!t) { w.until = now + 400 + w.rnd() * 800; continue; }
        w.tx = t.x; w.ty = t.y; w.walking = true;
        // Kleine flitzen ab und zu ein Stück (Charakter)
        w.dash = C.dash && w.rnd() < C.dash ? 1.7 : 1;
      }
      const base = C.sp * (w.temper || 1) * (isl.size / 100);
      const sp = base * (w.dash || 1) * (sw ? (w.wet ? 1 : 0.6) : w.wet ? 0.8 : 1);
      const ok = sw ? swimOk(wc, true) : (x, y) => wc.walk(x, y);
      const from = Math.hypot(w.vx || 0, w.vy || 0);
      w.phase += dt * C.step * Math.min(1.6, Math.max(0.3, from / base));
      if (steer(w, sp, C.agil, dt, ok)) {
        w.walking = false; w.dash = 1; w.vx = w.vy = 0;
        w.until = now + C.pause[0] + w.rnd() * (C.pause[1] - C.pause[0]);
        // Besuch angekommen: zum anderen hinschauen
        if (w.visit) { const o = isl.byId.get(w.visit); if (o) w.dir = o.x < w.x ? -1 : 1; w.visit = null; }
        // schlafen: an Land, Schwimmer auch im Wasser (treiben dann, C.wetSleep)
        const p = w.wet ? C.wetSleep || 0 : wc.walk(w.x, w.y) ? C.sleep : 0;
        if (now > (w.awake || 0) && w.rnd() < p) w.sleep = now + 15000 + w.rnd() * 30000;
      }
    }
  }

  /* Charakter der Bewegung (Sönke 28.10.2026: „die Wesen ab Klein sollen sich
     deutlich mehr bewegen und sich durchmischen, die Insel soll erkundet
     werden; die Babys bleiben lokal; Baum und Busch sind träger“; später:
     „die Meeresbewohner sind fast nur im Wasser“):
       baby  – bleibt nah an der Heimat (0,55 Laufradien), kurze Wege, tapsig
       ex    – Entdecker ab Klein: ganze Insel, hält eine Richtung eine Weile
               (w.head) und biegt bei Küste/Tafelberg ab, kurze Pausen,
               besucht ab und zu ein anderes Wesen (auch anderer Familien)
       slow  – Baum und Busch (Ast b_c ab Mittel): langsam, lange Pausen,
               kurze Wege, bleibt in der Nähe, schläft öfter, schwankt beim Gehen
       swim  – Seedrache und Meeresschildkröte ab Groß: ziehen im Wasser rund
               um die Inseln, schwimmen ab und zu (SWIM_TRIP) zu einer anderen
               Insel oder Nebeninsel, kommen selten (SWIM_LAND) an den Strand
               und ruhen sich dort aus; schlafen auch treibend im Wasser
     agil = wie schnell sich die Richtung dreht (klein = weite Bögen).
     Dazu je Wesen ein eigenes Tempo (w.temper 0,8–1,2). */
  const CHARS = {
    baby: { sp: 30, step: 11, agil: 7, pause: [700, 2600], leg: [40, 150], leash: 0.55, sleep: 0.04, look: true, dash: 0, visit: 0 },
    ex:   { sp: 60, step: 8, agil: 3.2, pause: [300, 2000], leg: [160, 520], leash: 0, sleep: 0.035, look: true, dash: 0, visit: 0.14 },
    slow: { sp: 13, step: 3.2, agil: 1.6, pause: [5000, 14000], leg: [30, 110], leash: 0.8, sleep: 0.16, look: false, dash: 0, visit: 0 },
    swim: { sp: 64, step: 6, agil: 1.6, pause: [100, 900], leg: [240, 700], leash: 0, sleep: 0.25, wetSleep: 0.06, look: false, dash: 0, visit: 0 }
  };
  const CHARS_KLEIN = Object.assign({}, CHARS.ex, { sp: 54, step: 10, agil: 4.5, dash: 0.18 });   // Kleine: flitzen manchmal
  function charOf(w, e, sw) {
    const a = wesenAst(w.id);
    const C = sw ? CHARS.swim : e <= 1 ? CHARS.baby : e >= 3 && a.m === 'b_c' ? CHARS.slow : e === 2 ? CHARS_KLEIN : CHARS.ex;
    w.kind = C === CHARS.slow ? 'slow' : C === CHARS.baby ? 'baby' : C === CHARS.swim ? 'swim' : 'ex';
    return C;
  }
  /* Weg frei? In Schritten von ~35 Einheiten prüfen (lange Wege gehen sonst über Wasser). */
  function lineOk(ok, x0, y0, x1, y1) {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 35));
    for (let q = 1; q <= n; q++) if (!ok(x0 + (x1 - x0) * q / n, y0 + (y1 - y0) * q / n)) return false;
    return true;
  }
  function wanderTarget(w, C, wc) {
    // Besuch: zu einem anderen Wesen hingehen und daneben stehen bleiben
    if (C.visit && w.rnd() < C.visit) {
      const o = isl.creatures[Math.floor(w.rnd() * isl.creatures.length)];
      if (o && o !== w && !o.fly && wc.walk(o.x, o.y)) {
        const side = w.rnd() < 0.5 ? -1 : 1, tx = o.x + side * (70 + w.rnd() * 40), ty = o.y + (w.rnd() - 0.5) * 30;
        if (Math.hypot(tx - w.x, ty - w.y) > 40 && wc.walk(tx, ty) && lineOk(wc.walk, w.x, w.y, tx, ty)) {
          w.visit = o.id;
          return { x: tx, y: ty };
        }
      }
    }
    return headTarget(w, C, wc.walk);
  }
  /* Ziel in der gehaltenen Richtung (w.head): erst geradeaus mit etwas
     Schlenker, dann immer weiter abbiegen; festgefahren = umdrehen. */
  function headTarget(w, C, ok) {
    if (w.head == null) w.head = w.rnd() * Math.PI * 2;
    const leash = C.leash ? w.roam * C.leash : 0;
    for (let k = 0; k < 14; k++) {
      const a = w.head + (w.rnd() - 0.5) * (k < 5 ? 1.1 : k < 10 ? 3 : Math.PI * 2);
      const d = C.leg[0] + w.rnd() * (C.leg[1] - C.leg[0]);
      let tx = w.x + Math.cos(a) * d, ty = w.y + Math.sin(a) * d;
      if (leash && Math.hypot(tx - w.home.x, ty - w.home.y) > leash) {
        if (k < 10) continue;
        // zu weit weg: ein Stück zurück Richtung Heimat
        const b = Math.atan2(w.home.y - w.y, w.home.x - w.x) + (w.rnd() - 0.5) * 1.2;
        tx = w.x + Math.cos(b) * d; ty = w.y + Math.sin(b) * d;
      }
      if (!ok(tx, ty) || !lineOk(ok, w.x, w.y, tx, ty)) continue;
      w.head = Math.atan2(ty - w.y, tx - w.x);
      return { x: tx, y: ty };
    }
    w.head += Math.PI * (0.6 + w.rnd() * 0.8);
    return null;
  }
  /* Wasser für Schwimmer (mit land = true auch Strand und Land, für den
     Landgang). Ziele liegen nah an der Küste (nearLand, SWIM_COAST), damit sie
     rund um die Inseln ziehen statt aufs offene Meer. */
  const SWIM_LAND = 0.06, SWIM_TRIP = 0.15, SWIM_COAST = 450;
  function swimOk(wc, land) {
    return (x, y) => {
      if (land && wc.walk(x, y)) return true;
      const d = wc.depth(x, y);
      return d !== null && (land ? d < 0.09 : d < -0.03);
    };
  }
  /* innerhalb der Karte (bbox) mit etwas Rand — sonst schwimmen sie aus dem Bild */
  const inMap = (wc, x, y, m) => { const B = wc.bbox; return x > B.x + m && x < B.x + B.w - m && y > B.y + m && y < B.y + B.h - m; };
  function nearLand(wc, x, y, R) {
    for (let i = 1; i <= 3; i++) for (let a = 0; a < 12; a++) {
      const r = R * i / 3, t = a / 12 * Math.PI * 2 + i;
      if (wc.walk(x + Math.cos(t) * r, y + Math.sin(t) * r)) return true;
    }
    return false;
  }
  function swimTarget(w, C, wc, now) {
    const wet = swimOk(wc, false), any = swimOk(wc, true);
    const water = (x, y) => wet(x, y) && inMap(wc, x, y, 60) && nearLand(wc, x, y, SWIM_COAST);
    if (!w.wet) {
      // an Land (Landgang oder nach dem Schlüpfen zum Schwimmer): zurück ins Wasser
      for (let k = 0; k < 30; k++) {
        const a = w.rnd() * Math.PI * 2, d = 150 + w.rnd() * 450;
        const tx = w.x + Math.cos(a) * d, ty = w.y + Math.sin(a) * d;
        if (water(tx, ty) && lineOk(any, w.x, w.y, tx, ty)) { w.head = a; return { x: tx, y: ty }; }
      }
      return headTarget(w, C, any);
    }
    if (now > (w.awake || 0) && w.rnd() < SWIM_LAND) {
      // Landgang: an den Strand in der Nähe, dort ausruhen
      for (let k = 0; k < 20; k++) {
        const a = w.rnd() * Math.PI * 2, d = 100 + w.rnd() * 400;
        const tx = w.x + Math.cos(a) * d, ty = w.y + Math.sin(a) * d;
        const dd = wc.depth(tx, ty);
        if (wc.walk(tx, ty) && dd !== null && dd < 0.3 && lineOk(any, w.x, w.y, tx, ty)) return { x: tx, y: ty };
      }
    }
    if (w.rnd() < SWIM_TRIP) {
      // Ausflug: ins Wasser vor einer anderen Küste, gern einer anderen (Neben-)Insel
      const B = wc.bbox;
      for (let k = 0; k < 25; k++) {
        const lx = B.x + w.rnd() * B.w, ly = B.y + w.rnd() * B.h;
        if (Math.hypot(lx - w.x, ly - w.y) < 600 || !wc.walk(lx, ly)) continue;
        const a = w.rnd() * Math.PI * 2, r = 120 + w.rnd() * 300;
        const tx = lx + Math.cos(a) * r, ty = ly + Math.sin(a) * r;
        if (wet(tx, ty) && inMap(wc, tx, ty, 60) && lineOk(any, w.x, w.y, tx, ty)) { w.head = Math.atan2(ty - w.y, tx - w.x); return { x: tx, y: ty }; }
      }
    }
    return headTarget(w, C, water);
  }

  /* ─── Seitenleiste: Stufen, Familien, Runde ─── */
  function islCounts(cards) {
    const c = [0, 0, 0, 0, 0, 0];
    for (const k of cards) c[stageOfId(k.id)]++;
    return c;
  }
  /* Aufteilung wie die Insel in Wordisland: links eine Leiste über der Karte
     (Kopf = alle Wesen nach Stufe, darunter die Stapel als Familien,
     zuklappbar, am Telefon zu Beginn zu), unten ein Kasten mit „Runde
     starten“ und — nur wer wählen darf — dem Inselwechsel hinter einem Knopf. */
  /* Die drei Vorlagen als kleine Symbole (Reihenfolge = TEMPLATES in welt.js): Bucht · Kraterring · Landzungen. */
  const TPL_ICO = [
    '<path d="M17.5 7.2A7 7 0 1 0 17.5 16.8" fill="none" stroke-width="4.2"/>',
    '<path d="M15.2 5.6A7 7 0 1 1 6.4 8.2" fill="none" stroke-width="3.4"/><circle cx="9.6" cy="4.9" r="1.4"/>',
    '<path d="M12 3.5l1.6 4.3 4.6-1.6-2 4.2 4.3 1.9-4.4 1.6 1.4 4.6-4.1-2.3-2.4 4.3-1-4.7-4.6.9 2.8-3.8L4.2 10l4.6-.4L8.4 4.9z"/><circle cx="19.2" cy="19.2" r="1.3"/>'
  ].map(d => '<svg class="dd-tplico" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>');
  let islSideOpen = null;           // null = nach Breite
  let islTplOpen = false;
  function paintSide() {
    const box = root && root.querySelector('#ddIslSide');
    if (!box || !opened) return;
    const I = window.DDInsel;
    const names = I ? I.STAGES : ['Ei', 'Baby', 'Klein', 'Mittel', 'Groß', 'Leuchtend'];
    const c = islCounts(opened.cards);
    const n = opened.cards.length;
    // Ausgeschaltete Familien stehen auf der Insel blass (islFrame).
    const act = activeIds();
    if (isl) isl.dim = new Set(opened.stacks.map((s, f) => act.includes(s.id) ? -1 : f).filter(f => f >= 0));
    if (islSideOpen === null) islSideOpen = !window.matchMedia('(max-width: 700px)').matches;
    const open = islSideOpen;
    box.classList.toggle('is-open', open);
    box.innerHTML =
      '<button type="button" class="dd-isl__grip" data-act="isl-side" aria-expanded="' + open + '">' +
        '<span class="dd-isl__n"><b>' + n + '</b> Wesen</span>' +
        stageLegend(c, names) +
        '<span class="dd-isl__chev" aria-hidden="true">' + (open ? ico.up : ico.down) + '</span>' +
      '</button>' +
      (open ?
      '<div class="dd-isl__body">' +
        '<h3 class="dd-isl__h">' + (opened.stacks.length === 1 ? 'Stapel' : opened.stacks.length + ' Stapel') + '</h3>' +
        '<ul class="dd-isl__fams">' + opened.stacks.map((s, f) => {
          const cs = islCounts(opened.cards.filter(k => k.sid === s.id));
          const on = act.includes(s.id);
          return '<li class="' + (on ? '' : 'is-off') + '">' +
            '<button type="button" class="dd-isl__fam' + (on ? ' is-on' : '') + '" data-act="stk" data-id="' + E(s.id) + '" aria-pressed="' + on + '" title="' +
              (on ? 'Ist in der Runde dran – antippen schaltet aus' : 'Antippen: in der Runde dran') + '" style="--f:' + FAM[f % FAM.length] + '">' +
            '<img src="' + famPic(f, s) + '" alt="">' +
            '<span class="dd-isl__famt"><b>' + E(s.title) + '</b>' + stageLegend(cs, names) + '</span></button></li>';
        }).join('') + '</ul>' +
      '</div>' : '');
    paintBar();
  }
  /* Stand als Punktreihe wie in Wordisland: je Stufe Punkt + Zahl, leere Stufen fehlen. */
  function stageLegend(c, names) {
    return '<span class="dd-isl__lg">' + c.map((x, e) => x ? '<span title="' + names[e] + '"><i class="dd-st' + e + '"></i>' + x + '</span>' : '').join('') + '</span>';
  }
  function paintBar() {
    const bar = root && root.querySelector('#ddIslBar');
    if (!bar || !opened) return;
    const W = window.DDWelt;
    const pc = playCards();
    const done = pc.length > 0 && islCounts(pc)[5] === pc.length;
    const act = activeIds();
    const nOn = opened.stacks.filter(s => act.includes(s.id)).length;
    const canPick = W && isl && isl.wc;   // alle dürfen wechseln, Schüler nur für sich (setTpl)
    if (!canPick) islTplOpen = false;
    bar.innerHTML =
      (canPick ?
        '<div class="dd-isl__tplw">' +
          '<button type="button" class="btn dd-isl__tplbtn' + (islTplOpen ? ' is-on' : '') + '" data-act="isl-tplmenu" aria-expanded="' + islTplOpen + '" title="Insel wechseln" aria-label="Insel wechseln: ' + E(W.TEMPLATES[isl.tpl].name) + '">' +
            TPL_ICO[isl.tpl] + '</button>' +
          (islTplOpen ?
            '<div class="dd-isl__tplmenu" role="group" aria-label="Insel wählen">' + W.TEMPLATES.map((T, i) =>
              '<button type="button" class="dd-isl__tplopt' + (i === isl.tpl ? ' is-on' : '') + '" data-act="isl-tpl" data-v="' + i + '" aria-pressed="' + (i === isl.tpl) + '" title="' + E(T.name) + '" aria-label="' + E(T.name) + '">' + TPL_ICO[i] + '</button>').join('') +
            '</div>' : '') +
        '</div>' : '') +
      '<button type="button" class="btn btn--primary dd-isl__go" data-act="isl-round"' + (isl && isl.ready && pc.length ? '' : ' disabled') + '>' + ico.play +
        '<span>' + (done ? 'Wiederholen' : 'Runde starten') + '<small>' + (pc.length ? roundSize() + ' Aufgaben' : 'Kein Stapel gewählt') +
        (pc.length && nOn < opened.stacks.length ? ' · ' + nOn + ' von ' + opened.stacks.length + ' Stapeln' : '') + '</small></span></button>';
    // Die Leiste links endet über dem Kasten (seine Höhe wird gemessen, nicht gerechnet).
    if (bar.offsetHeight) bar.parentNode.style.setProperty('--dd-isl-bar', (bar.offsetHeight + 20) + 'px');
  }
  function islToggleSide() {
    islSideOpen = !islSideOpen;
    paintSide();
    if (isl && isl.ready) { islInsets(); islFit(true); }
  }
  /* Bild einer Familie in der Seitenleiste: ihr am weitesten gewachsenes Wesen. */
  function famPic(f, s) {
    let best = null, be = -1;
    for (const k of opened.cards) if (k.sid === s.id) { const e = stageOfId(k.id); if (e > be) { be = e; best = k; } }
    return spriteURL(f, Math.max(0, be), best ? best.id : null);
  }
  /* Neuer Stand von außen (anderes Gerät) oder nach einer Antwort. */
  function islRefresh() { if (isl) { paintSide(); if (isl.selId) islSelect(isl.selId); } }

  /* ══════ Aufgaben ══════ */
  function carryIds() { const v = jget(CARRY, []); return Array.isArray(v) ? v : []; }
  /* Auf der Insel leben immer alle Stapel des Raums; in die Runde kommen nur die aktiven. */
  function playCards() {
    if (!opened) return [];
    const act = new Set(activeIds());
    return opened.cards.filter(c => act.has(c.sid));
  }
  function roundSize() {
    const pc = playCards(), ids = new Set(pc.map(c => c.id));
    return pc.length + carryIds().filter(id => ids.has(id)).length;
  }
  async function islRound(onlyId) {
    if (!isl || !isl.ready) return;
    try { await ladeInsel(); } catch (e) { toast('Die Aufgaben konnten nicht geladen werden.'); return; }
    const I = window.DDInsel;
    let cards;
    if (onlyId) {
      const c = opened.cards.find(x => x.id === onlyId);
      if (!c) return;
      cards = [c];
    } else {
      // Vorgemerkte dieser Insel kommen jetzt doppelt dran und sind damit eingelöst.
      const pc = playCards(), ids = new Set(pc.map(c => c.id)), carry = carryIds();
      cards = I.roundCards(pc, carry.filter(id => ids.has(id)));
      jset(CARRY, carry.filter(id => !ids.has(id)));
    }
    if (!cards.length) return;
    islSelect(null);
    isl.round = { cards, i: 0, right: 0, grown: [], single: !!onlyId, answered: 0, shown: 0, wrong: new Map(), carried: [] };
    islNewTask();
  }
  function islNewTask() {
    const R = isl.round, I = window.DDInsel;
    const card = R.cards[R.i];
    const e = stageOfId(card.id);
    const t = I.makeTask(card, opened.cards, e);
    t.fam = isl.byId.get(card.id) ? isl.byId.get(card.id).fam : 0;
    t.seq = [];
    t.done = false;
    isl.task = t;
    paintTask();
  }

  function taskHead(t) {
    const I = window.DDInsel, R = isl.round;
    const e = t.stage, next = Math.min(I.MAX, e + 1);
    // Reihenfolge (Sönke 28.10.2026): Wesen groß oben, darunter der Balken, dann die Frage (klein,
    // ist ja immer gleich) und groß das, worum es geht: Definition bzw. Begriff.
    return '<div class="dd-task__head">' +
        '<span class="dd-task__pic" id="ddTaskPic" style="--f:' + FAM[t.fam % FAM.length] + '"><img src="' + spriteURL(t.fam, e, t.card.id) + '" alt="' + I.STAGES[e] + '"></span>' +
        '<span class="dd-task__who"><small>' + E(stackTitle(t.card.sid)) + '</small>' +
          '<b id="ddTaskStage">' + (e >= I.MAX ? 'Leuchtend · Wiederholen' : I.STAGES[e] + ' → ' + I.STAGES[next]) + '</b>' + stageDots(e) + '</span>' +
        '<button type="button" class="dd-x" data-act="isl-close" aria-label="Runde beenden">×</button>' +
      '</div>' +
      (R.single ? '' : '<div class="dd-task__prog" id="ddProg" role="progressbar" aria-label="Fortschritt der Runde" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
        Math.round(R.shown * 100) + '"><i style="width:' + (R.shown * 100).toFixed(1) + '%"></i></div>');
  }
  function paintTask() {
    const box = root.querySelector('#ddTask'), t = curTask();
    if (demo && box) box.dataset.cid = t ? t.card.id : '';   // nur fürs Schaufenster (preview/derby.js)
    if (!box || !t) return;
    let body = '';
    const defBox = '<div class="dd-task__def"><span class="dd-task__l">Definition</span><p>' + E(t.card.d) + '</p></div>';
    const termBox = '<div class="dd-task__term"><span class="dd-task__l">Begriff</span>' +
      (okImg(t.card.i) ? '<img class="dd-task__img" src="' + t.card.i + '" alt="">' : '') + '<b><span class="dd-hl">' + E(t.card.t) + '</span></b></div>';
    if (t.type === 'pickTerm') {
      body = '<p class="dd-task__q">Welcher Begriff passt zu dieser Definition?</p>' + defBox +
        '<div class="dd-opts6">' + t.options.map((o, i) => '<button type="button" class="dd-opt" data-act="isl-opt" data-id="' + E(o.id) + '"><kbd>' + (i + 1) + '</kbd>' + E(o.text) + '</button>').join('') + '</div>';
    } else if (t.type === 'pickDef') {
      body = '<p class="dd-task__q">Welche Definition passt zu diesem Begriff?</p>' + termBox +
        '<div class="dd-opts4">' + t.options.map((o, i) => '<button type="button" class="dd-opt dd-opt--def" data-act="isl-opt" data-id="' + E(o.id) + '"><kbd>' + (i + 1) + '</kbd><span>' + E(o.text) + '</span></button>').join('') + '</div>';
    } else if (t.type === 'build') {
      body = '<p class="dd-task__q">Bau die Definition zusammen: Bausteine in die Zeile ziehen und dort sortieren. Zwei gehören nicht dazu.</p>' + termBox +
        '<div class="dd-build" id="ddBuild"></div>' +
        '<div class="dd-task__act"><button type="button" class="btn btn--primary" data-act="isl-check" id="ddCheck" disabled>' + ico.check + 'Prüfen</button></div>';
    } else if (t.type === 'typeTerm') {
      body = '<p class="dd-task__q">Wie heißt der Begriff?</p>' + defBox +
        '<label class="dd-type"><span class="dd-task__l">Begriff</span><input class="dd-input dd-type__in" id="ddType" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="Begriff eintippen …"></label>' +
        '<div class="dd-task__act"><button type="button" class="btn" data-act="isl-skip">Weiß ich nicht</button>' +
          '<button type="button" class="btn btn--primary" data-act="isl-check">' + ico.check + 'Prüfen</button></div>';
    } else if (t.type === 'cloze') {
      let gi = 0;
      body = '<p class="dd-task__q">Fülle die Lücken in der Definition.</p>' + termBox +
        '<div class="dd-task__def dd-cloze"><span class="dd-task__l">Definition</span><p>' + t.parts.map(p => p.gap
          // Ein Kästchen je Buchstabe, der erste steht schon drin. Das echte Feld liegt unsichtbar
          // darüber (paintGap verteilt die Eingabe auf die Kästchen) – so passt jeder Strich genau.
          ? '<span class="dd-gapw"><span class="dd-gap__c is-a" aria-hidden="true">' + E(p.gap[0]) + '</span>' +
            '<span class="dd-gap__c" aria-hidden="true"></span>'.repeat(p.gap.length - 1) +
            '<input class="dd-gap" data-g="' + (gi++) + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" maxlength="' + (p.gap.length - 1) +
            '" aria-label="Lücke ' + gi + ': ' + p.gap.length + ' Buchstaben, beginnt mit ' + E(p.gap[0]) + '"></span>'
          : E(p.text)).join(' ') + '</p></div>' +
        '<div class="dd-task__act"><button type="button" class="btn" data-act="isl-skip">Weiß ich nicht</button>' +
          '<button type="button" class="btn btn--primary" data-act="isl-check">' + ico.check + 'Prüfen</button></div>';
    }
    box.innerHTML = '<div class="dd-task__bg"></div>' +
      '<div class="dd-task__sheet dd-task--' + t.type + '"' + (st && st.task ? ' aria-label="Aufgabe">' + stTaskHead(t) : ' role="dialog" aria-modal="true" aria-label="Aufgabe">' + taskHead(t)) +
        '<div class="dd-task__body">' + body + '</div>' +
        '<div class="dd-task__fb" id="ddFb" aria-live="polite"></div>' +
      '</div>';
    box.hidden = false;
    if (t.type === 'build') { paintBuild(); bindBuildDrag(box.querySelector('#ddBuild')); }
    box.querySelectorAll('.dd-gap').forEach(paintGap);
    const f = box.querySelector('#ddType, .dd-gap, .dd-opt');
    if (f && (f.tagName === 'INPUT' || !('ontouchstart' in window))) f.focus({ preventScroll: true });
    box.querySelector('.dd-task__sheet').addEventListener('focusin', taskKbFit);
  }
  /* Tastatur am Handy: das Blatt sitzt im sichtbaren Bereich (--vv-h aus
     viewport.js, der Kopf wird dann klein, html.kb-open). Danach wird so
     gescrollt, dass oben die Definition/der Begriff steht und das Feld
     darunter noch zu sehen ist – sonst wenigstens das Feld. */
  function taskKbFit(ev) {
    const el = ev.target;
    if (!el || el.tagName !== 'INPUT') return;
    const run = () => {
      const sheet = el.closest('.dd-task__sheet');
      if (!sheet || !el.isConnected || document.activeElement !== el || !document.documentElement.classList.contains('kb-open')) return;
      const what = sheet.querySelector('.dd-task__def, .dd-task__term');
      const sr = sheet.getBoundingClientRect();
      if (what) sheet.scrollTop += what.getBoundingClientRect().top - sr.top - 6;
      const r = el.getBoundingClientRect();
      if (r.bottom > sr.bottom - 8) sheet.scrollTop += r.bottom - sr.bottom + 16;
    };
    setTimeout(run, 420);   // nach viewport.js (60/350 ms), wenn die Tastatur steht
    setTimeout(run, 800);
  }

  function paintBuild() {
    const t = curTask(), box = root.querySelector('#ddBuild');
    if (!box) return;
    const used = new Set(t.seq);
    const tile = (x, where) => '<button type="button" class="dd-tile' + (t.done && x.wrong && where === 'in' ? ' is-wrong' : '') + '" data-act="isl-tile" data-k="' + x.k + '"' + (t.done ? ' disabled' : '') + '>' + E(x.text) + '</button>';
    const byK = k => t.tiles.find(x => x.k === k);
    box.innerHTML =
      '<div class="dd-build__line' + (t.seq.length ? '' : ' is-empty') + '" aria-label="Deine Definition">' +
        (t.seq.length ? t.seq.map(k => tile(byK(k), 'in')).join('') : '<span class="dd-build__ph">Bausteine hierher ziehen oder antippen.</span>') + '</div>' +
      '<div class="dd-build__pool" aria-label="Bausteine">' + t.tiles.filter(x => !used.has(x.k)).map(x => tile(x, 'pool')).join('') + '</div>';
    const chk = root.querySelector('#ddCheck');
    if (chk) chk.disabled = t.done || !t.seq.length;
  }
  let buildDragEnd = 0;
  function islTile(k) {
    const t = curTask();
    if (!t || t.done || t.type !== 'build') return;
    if (Date.now() - buildDragEnd < 400) return;   // Klick nach dem Ziehen
    const i = t.seq.indexOf(k);
    if (i >= 0) t.seq.splice(i, 1); else t.seq.push(k);
    paintBuild();
  }
  /* Bausteine ziehen (Sönke 28.10.2026): aus dem Vorrat an jede Stelle
     der Zeile, in der Zeile umsortieren, aus der Zeile hinausziehen =
     zurück in den Vorrat. Wo er landet, zeigt eine Lücke in Größe des
     Bausteins (.dd-build__mark); der Vorrat leuchtet, wenn er dorthin
     zurückgeht. Antippen bleibt wie vorher (hinten anhängen/entfernen). */
  function bindBuildDrag(box) {
    let d = null;
    const lineEl = () => box.querySelector('.dd-build__line');
    const poolEl = () => box.querySelector('.dd-build__pool');
    const inside = (r, x, y, pad) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    function begin() {
      const r = d.el.getBoundingClientRect();
      d.on = true;
      d.dx = d.x0 - r.left; d.dy = d.y0 - r.top;
      d.ghost = d.el.cloneNode(true);
      d.ghost.className = 'dd-tile dd-tile--fly' + (d.fromLine ? ' is-in' : '');
      d.ghost.removeAttribute('data-act');
      d.ghost.style.width = r.width + 'px';
      root.querySelector('#ddTask').appendChild(d.ghost);
      d.mark = document.createElement('span');
      d.mark.className = 'dd-build__mark';
      d.mark.style.width = r.width + 'px';
      d.mark.style.height = r.height + 'px';
      const ph = box.querySelector('.dd-build__ph');
      if (ph) ph.hidden = true;
      if (d.fromLine) d.el.replaceWith(d.mark);   // Lücke genau dort, wo er lag
      else d.el.classList.add('is-lifted');
      box.classList.add('is-dragging');
    }
    function place(x, y) {
      const line = lineEl(), pool = poolEl();
      const overLine = inside(line.getBoundingClientRect(), x, y, 18);
      pool.classList.toggle('is-over', !overLine && d.fromLine);
      line.classList.toggle('is-over', overLine);
      if (!overLine) { d.mark.remove(); return; }
      const tiles = [...line.querySelectorAll('.dd-tile')];
      if (inside(d.mark.getBoundingClientRect(), x, y, 0) && d.mark.isConnected) return;
      const hit = tiles.find(el => inside(el.getBoundingClientRect(), x, y, 4));
      if (hit) {
        const r = hit.getBoundingClientRect();
        const before = x < r.left + r.width / 2;
        if (before ? hit.previousElementSibling !== d.mark : hit.nextElementSibling !== d.mark) hit.insertAdjacentElement(before ? 'beforebegin' : 'afterend', d.mark);
        return;
      }
      // Zwischen/neben den Bausteinen: in der Reihe, die der Zeiger trifft, vor den ersten Baustein rechts davon.
      const row = tiles.filter(el => { const r = el.getBoundingClientRect(); return y >= r.top - 6 && y <= r.bottom + 6; });
      const nx = row.find(el => { const r = el.getBoundingClientRect(); return x < r.left + r.width / 2; });
      if (nx) { if (nx.previousElementSibling !== d.mark) nx.before(d.mark); return; }
      const last = row.length ? row[row.length - 1] : null;
      if (last) { if (last.nextElementSibling !== d.mark) last.after(d.mark); return; }
      const first = tiles[0];
      if (first && y < first.getBoundingClientRect().top) { if (line.firstElementChild !== d.mark) line.prepend(d.mark); return; }
      if (line.lastElementChild !== d.mark) line.append(d.mark);
    }
    function move(ev) {
      if (!d || ev.pointerId !== d.id) return;
      if (!d.on) {
        if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return;
        begin();
      }
      ev.preventDefault();
      d.ghost.style.transform = 'translate(' + (ev.clientX - d.dx) + 'px,' + (ev.clientY - d.dy) + 'px) rotate(-2deg)';
      place(ev.clientX, ev.clientY);
    }
    function end(ev) {
      if (!d || ev.pointerId !== d.id) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      const dd = d; d = null;
      if (!dd.on) return;   // nur angetippt: das macht der Klick
      buildDragEnd = Date.now();
      dd.ghost.remove();
      box.classList.remove('is-dragging');
      const t = curTask();
      if (!t || t.done || ev.type === 'pointercancel') { if (t) paintBuild(); return; }
      if (dd.mark.isConnected) {
        // Reihenfolge so, wie sie jetzt in der Zeile steht; die Lücke ist der gezogene Baustein.
        t.seq = [...lineEl().children].map(el => (el === dd.mark ? dd.k : el.dataset.k)).filter(Boolean);
      } else {
        t.seq = t.seq.filter(k => k !== dd.k);
      }
      paintBuild();
    }
    box.addEventListener('pointerdown', ev => {
      const el = ev.target.closest('.dd-tile');
      const t = curTask();
      if (!el || el.disabled || !t || t.done || d || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      d = { k: el.dataset.k, el, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, on: false, fromLine: !!el.closest('.dd-build__line') };
      document.addEventListener('pointermove', move, { passive: false });
      document.addEventListener('pointerup', end);
      document.addEventListener('pointercancel', end);
    });
  }

  /* Auswahl-Aufgaben: Antippen = Antwort. */
  function islPick(id) {
    const t = curTask();
    if (!t || t.done || (t.type !== 'pickTerm' && t.type !== 'pickDef')) return;
    const ok = id === t.card.id || norm2(t, id);
    root.querySelectorAll('.dd-opt').forEach(b => {
      b.disabled = true;
      if (b.dataset.id === t.card.id) b.classList.add('is-right');
      else if (b.dataset.id === id) b.classList.add('is-wrong');
    });
    taskResult(ok, ok ? '' : (t.type === 'pickTerm' ? 'Richtig wäre: <b>' + E(t.card.t) + '</b>' : 'Die richtige Definition ist grün markiert.'));
  }
  /* Gleicher Begriff/gleiche Definition auf einer anderen Karte zählt auch. */
  function norm2(t, id) {
    const o = opened.cards.find(c => c.id === id), I = window.DDInsel;
    if (!o) return false;
    return t.type === 'pickTerm' ? I.norm(o.t) === I.norm(t.card.t) : I.norm(o.d) === I.norm(t.card.d);
  }

  function islCheck() {
    const t = curTask(), I = window.DDInsel;
    if (!t || t.done) return;
    if (t.type === 'build') {
      if (!t.seq.length) return;
      const seq = t.seq.map(k => t.tiles.find(x => x.k === k).text);
      const ok = I.buildOk(t, seq);
      t.done = true;
      paintBuild();
      taskResult(ok, ok ? '' : 'Richtig heißt es: <b>' + E(t.card.d) + '</b>');
    } else if (t.type === 'typeTerm') {
      const inp = root.querySelector('#ddType');
      const v = inp ? inp.value : '';
      if (!v.trim()) { if (inp) inp.focus(); return; }
      const r = I.check(v, t.card.t);
      if (inp) { inp.readOnly = true; inp.classList.add(r.ok ? 'is-right' : 'is-wrong'); }
      taskResult(r.ok, r.ok ? (r.exact ? '' : 'Fast genau – geschrieben wird es: <b>' + E(t.card.t) + '</b>') : 'Gesucht war: <b>' + E(t.card.t) + '</b>');
    } else if (t.type === 'cloze') {
      const gaps = t.parts.filter(p => p.gap);
      const ins = [...root.querySelectorAll('.dd-gap')];
      if (ins.some(x => !x.value.trim())) { const f = ins.find(x => !x.value.trim()); if (f) f.focus(); return; }
      let all = true, fuzzy = false;
      ins.forEach((inp, i) => {
        const r = gapCheck(inp.value, gaps[i].gap);
        all = all && r.ok;
        fuzzy = fuzzy || (r.ok && !r.exact);
        inp.readOnly = true;
        inp.classList.add(r.ok ? 'is-right' : 'is-wrong');
        if (!r.ok || !r.exact) (inp.closest('.dd-gapw') || inp).insertAdjacentHTML('afterend', '<span class="dd-gap__sol">' + E(gaps[i].gap) + '</span>');
      });
      taskResult(all, all ? (fuzzy ? 'Fast genau – die richtige Schreibweise steht daneben.' : '') : 'Die richtigen Wörter stehen neben den Lücken.');
    }
  }
  /* Eingabe einer Lücke auf ihre Kästchen verteilen; das nächste freie ist markiert. */
  function paintGap(inp) {
    const cs = [...inp.parentNode.querySelectorAll('.dd-gap__c:not(.is-a)')];
    const v = [...inp.value];
    cs.forEach((c, i) => { c.textContent = v[i] || ''; c.classList.toggle('is-cur', i === Math.min(v.length, cs.length - 1)); });
  }
  /* Der Anfangsbuchstabe steht schon da: getippt wird der Rest. Wer das
     ganze Wort tippt, liegt auch richtig. */
  function gapCheck(v, word) {
    const I = window.DDInsel;
    const r = I.checkGap(word[0] + v, word);
    if (r.ok) return r;
    const r2 = I.checkGap(v, word);
    return r2.ok ? r2 : r;
  }
  function islGiveUp() {
    const t = curTask();
    if (!t || t.done) return;
    if (t.type === 'typeTerm') { const inp = root.querySelector('#ddType'); if (inp) inp.readOnly = true; taskResult(false, 'Gesucht war: <b>' + E(t.card.t) + '</b>'); }
    else if (t.type === 'cloze') {
      const gaps = t.parts.filter(p => p.gap);
      root.querySelectorAll('.dd-gap').forEach((inp, i) => { inp.readOnly = true; inp.value = ''; paintGap(inp); (inp.closest('.dd-gapw') || inp).insertAdjacentHTML('afterend', '<span class="dd-gap__sol">' + E(gaps[i].gap) + '</span>'); });
      taskResult(false, 'So heißt es richtig.');
    }
  }

  /* Die laufende Aufgabe: Kistensturm (st) oder Insel (isl). Beide nutzen
     dasselbe Aufgabenblatt (paintTask & Co.); nur das Ergebnis geht
     an verschiedene Stellen (stResult · islResult). */
  function curTask() { return (st && st.task) || (isl && isl.task) || null; }
  function taskResult(ok, extra) { if (st && st.task) stResult(ok, extra); else islResult(ok, extra); }

  /* Ergebnis anwenden: Stufe hoch/runter, speichern, Moment zeigen. */
  function islResult(ok, extra) {
    const t = isl.task, R = isl.round, I = window.DDInsel;
    t.done = true;
    const id = t.card.id;
    const r = I.apply(prog[id], ok);
    prog[id] = Object.assign({}, prog[id], { e: r.e, x: r.x, t: Date.now() });
    saveProg(sidOf(id));
    if (ok) R.right++;
    if (!R.single) {
      // 1. Fehler in dieser Runde: später noch einmal. 2. Fehler: auch in der nächsten Runde.
      if (!ok) {
        const n = (R.wrong.get(id) || 0) + 1;
        R.wrong.set(id, n);
        if (n === 1) I.requeue(R.cards, R.i, t.card);
        else if (n === 2) { const c = carryIds(); if (!c.includes(id)) jset(CARRY, c.concat(id)); R.carried.push(id); }
      }
      R.answered++;
      // Der Balken wächst nur: kommt eine Aufgabe dazu, bleibt er stehen statt zu schrumpfen.
      R.shown = Math.max(R.shown, R.answered / R.cards.length);
      const pb = root.querySelector('#ddProg');
      if (pb) { pb.setAttribute('aria-valuenow', Math.round(R.shown * 100)); pb.firstChild.style.width = (R.shown * 100).toFixed(1) + '%'; }
    }
    const w = isl.byId.get(id);
    let say;
    if (r.up) {
      R.grown.push({ id, fam: t.fam, e: r.e });
      say = '<b>„' + E(t.card.t) + '“ ' + STAGE_TXT[r.e - 1] + '</b>';
      if (w) w.burst = performance.now();
      const pic = root.querySelector('#ddTaskPic');
      if (pic) {
        pic.classList.remove('is-grow'); void pic.offsetWidth;
        pic.querySelector('img').src = spriteURL(t.fam, r.e, id);
        pic.classList.add('is-grow');
      }
      const st = root.querySelector('#ddTaskStage');
      if (st) { st.textContent = 'Jetzt: ' + I.STAGES[r.e]; st.nextElementSibling.outerHTML = stageDots(r.e); }
    } else if (r.down) {
      say = '„' + E(t.card.t) + '“ ist wieder ' + (r.e === 0 ? 'ein Ei' : I.STAGES[r.e]) + '. Beim nächsten Mal klappt’s!';
      const pic = root.querySelector('#ddTaskPic');
      if (pic) { pic.querySelector('img').src = spriteURL(t.fam, r.e, id); pic.classList.add('is-shrink'); }
      const st = root.querySelector('#ddTaskStage');
      if (st) { st.textContent = 'Jetzt: ' + I.STAGES[r.e]; st.nextElementSibling.outerHTML = stageDots(r.e); }
    } else if (ok) {
      say = t.stage >= I.MAX ? 'Richtig – es leuchtet weiter.' : 'Richtig!';
    } else {
      say = 'Nicht ganz.' + (r.x ? ' Noch ein Fehler auf dieser Stufe, dann wird es wieder kleiner.' : '');
    }
    const fb = root.querySelector('#ddFb');
    const last = R.i >= R.cards.length - 1;
    if (fb) {
      fb.className = 'dd-task__fb ' + (r.up ? 'is-up' : ok ? 'is-ok' : 'is-no');
      fb.innerHTML = '<p>' + say + '</p>' + (extra ? '<p class="dd-task__sol">' + extra + '</p>' : '') +
        '<button type="button" class="btn btn--primary" data-act="isl-next" id="ddNext">' + (last ? (R.single ? 'Zur Insel' : 'Fertig') : 'Weiter') + '</button>';
      root.querySelectorAll('.dd-task__act .btn').forEach(b => { b.disabled = true; });
      const nb = fb.querySelector('#ddNext');
      if (nb) nb.focus({ preventScroll: true });
    }
    paintSide();
  }
  function islNext() {
    if (!isl || !isl.round || !isl.task || !isl.task.done) return;
    const R = isl.round;
    if (R.i < R.cards.length - 1) { R.i++; islNewTask(); return; }
    if (R.single) { islCloseTask(); return; }
    paintSummary();
  }
  function paintSummary() {
    const R = isl.round, I = window.DDInsel, box = root.querySelector('#ddTask');
    isl.task = null;
    const n = R.answered;
    box.innerHTML = '<div class="dd-task__bg"></div>' +
      '<div class="dd-task__sheet dd-task__sheet--end" role="dialog" aria-modal="true" aria-labelledby="ddEndH">' +
        '<button type="button" class="dd-x" data-act="isl-close" aria-label="Zur Insel">×</button>' +
        '<span class="dd-memwin__stamp">Runde geschafft</span>' +
        '<h2 id="ddEndH">' + R.right + ' von ' + n + ' richtig</h2>' +
        (R.grown.length
          ? '<p>' + (R.grown.length === 1 ? 'Ein Wesen ist gewachsen:' : R.grown.length + ' Wesen sind gewachsen:') + '</p>' +
            '<ul class="dd-grown">' + R.grown.map(g => { const c = opened.cards.find(x => x.id === g.id);
              return '<li><img src="' + spriteURL(g.fam, g.e, g.id) + '" alt=""><b>' + E(c ? c.t : '') + '</b><small>' + I.STAGES[g.e] + '</small></li>'; }).join('') + '</ul>'
          : '<p>Diesmal ist niemand gewachsen – in der nächsten Runde bestimmt.</p>') +
        (R.carried.length ? '<p class="dd-task__carry">' + (R.carried.length === 1 ? 'Ein Begriff kommt' : R.carried.length + ' Begriffe kommen') + ' in der nächsten Runde noch einmal extra dran.</p>' : '') +
        '<div class="dd-memwin__act"><button type="button" class="btn btn--primary" data-act="isl-round">' + ico.again + 'Noch eine Runde</button>' +
        '<button type="button" class="btn" data-act="isl-close">' + ico.back + 'Zur Insel</button></div>' +
      '</div>';
    const b = box.querySelector('.btn--primary'); if (b) b.focus({ preventScroll: true });
  }
  function islCloseTask() {
    if (!isl) return;
    isl.task = null; isl.round = null;
    const box = root.querySelector('#ddTask');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    paintSide();
    paintBar();
  }

  /* Tasten: 1–6 wählen, Enter prüft bzw. geht weiter, Esc schließt. */
  function islKey(ev, tag) {
    if (!isl && !st) return;
    if (ev.key === 'Escape') { if (isl && isl.round) { ev.preventDefault(); islCloseTask(); } else if (isl && isl.selId) islSelect(null); return; }
    const t = curTask();
    if (!t) return;
    if (ev.key === 'Enter') {
      if (t.done) { ev.preventDefault(); if (st) stNext(); else islNext(); return; }
      if (tag === 'input') {
        ev.preventDefault();
        if (ev.target.classList.contains('dd-gap')) {
          const ins = [...root.querySelectorAll('.dd-gap')];
          const nx = ins.slice(ins.indexOf(ev.target) + 1).find(x => !x.value.trim());
          if (nx) { nx.focus(); return; }
        }
        islCheck();
      }
      return;
    }
    if (tag === 'input' || t.done) return;
    if ((t.type === 'pickTerm' || t.type === 'pickDef') && /^[1-6]$/.test(ev.key)) {
      const o = t.options[Number(ev.key) - 1];
      if (o) { ev.preventDefault(); islPick(o.id); }
    }
  }

  /* ══════════════════════════════════════════════════════════════
     KISTENSTURM (Zusammen im Netz)  ·  Migration 0239
     ══════════════════════════════════════════════════════════════
     Teams gegeneinander, jedes Tablet für sich (Sönke 29.10.2026,
     „etwas wie Mario Kart“). Jede richtige Antwort ist eine Kiste für
     das eigene Team: die Teamfigur (figuren.js) steht unten neben dem
     Turm, hebt ihn an, und darunter rutscht die neue Kiste hinein.
     Wer zuerst die Zielhöhe hat, gewinnt; mit Countdown gewinnt bei
     Zeitende der höchste Turm. Die Aufgaben sind die der Insel und
     richten sich nach der Höhe des EIGENEN Turms (stLevel): unten
     Begriff wählen, oben Lückentext — wer hinten liegt, hat es leichter.
     Items (Bonus-Kisten, klauen …) kommen später.

     Ablauf wie Kingdoms of Mathoria: die Lehrkraft (Beamer) wählt in
     der Lobby die Teams (Figuren, Migration 0244: figs), Zielhöhe und
     Stapel und startet (Countdown erst im Spiel, 0243);
     die Teams werden automatisch verteilt (Server). Öffnet die
     Lehrkraft Kistensturm, steht data.storm.live im Raumzustand, und
     jedes Tablet bekommt oben den Knopf „Mitmachen“ (stBanner).

     Server: dd_storm_room_get/setup/start/stop/reset (Lehrkraft),
     dd_storm_view/answer (Tablet). Jede Antwort liefert die ganze
     Ansicht zurück. Animationen hängen an den Turmhöhen (stSync, je
     Team Kiste für Kiste nachziehen) und an den Ereignissen seit
     p_since (Name über dem Turm). Ob eine Antwort stimmt, prüft das
     Tablet mit insel.js; der Server zählt höchstens eine je 1,2 s.
     Kistensturm schreibt keinen Lernstand (wie Memory/Duell). */
  // Countdown setzt die Lehrkraft erst im Spiel, wenn sie zum Ende kommen will (Migration 0243)
  const ST_MINUTES = [1, 2, 3, 5, 10];
  const ST_LEVEL = ['Begriff wählen', 'Definition wählen', 'Bausteine', 'Begriff tippen', 'Lückentext'];
  const ST_POLL = { lobby: 2500, countdown: 500, running: 1300, ended: 3000 };
  const ST_BEAM_POLL = { lobby: 2000, countdown: 400, running: 900, ended: 3000 };
  const ST_STEP_MS = 430;        // eine Kiste je Turm so oft (Heben dauert 0,9 s)
  const ST_NEXT_MS = 1000;       // nach richtig: nächste Aufgabe
  const ST_LOCK_MS = 1600;       // nach falsch: so lange erst Lösung lesen
  let st = null;                 // Zustand, solange Kistensturm offen ist
  let figReady = null;

  function loadCss(href, key) {
    if (document.querySelector('link[data-dd="' + key + '"]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.dataset.dd = key;
    document.head.appendChild(l);
  }
  /* Figuren = Baukasten von Knowledge Stack + figuren.js/css */
  function ladeFiguren() {
    if (window.DDFiguren) return Promise.resolve();
    loadCss('tools/KnowledgeStack/creatures.css?v=' + V, 'ks-creatures');
    loadCss(BASE + 'figuren.css?v=' + V, 'figuren');
    return figReady || (figReady = (window.KSCreatures ? Promise.resolve() : loadScript('tools/KnowledgeStack/creatures.js?v=' + V))
      .then(() => loadScript(BASE + 'figuren.js?v=' + V))
      .catch(e => { figReady = null; throw e; }));
  }
  /* Team i spielt mit Figur figs[i] (Migration 0242, Auswahl in der Lobby) */
  const stFigNo = i => { const f = st && st.v && st.v.figs; return f && f[i] != null ? f[i] : i; };
  const stFig = i => window.DDFiguren.LIST[stFigNo(i) % window.DDFiguren.LIST.length];
  const stTeam = i => 'Team ' + stFig(i).name;
  const figSVG = (i, a, px) => window.DDFiguren ? window.DDFiguren.svg(stFigNo(i), a, px) : '';
  const stCol = i => '--tc:' + stFig(i).col + ';--ts:' + stFig(i).soft;
  const stLive = () => { const s = roomData().storm; return !!(s && s.live && Date.now() - (s.t || 0) < 4 * 3600e3); };

  /* ─── Items (Migration 0240, Sönke 30.10.2026) ───
     Liegen als Linien zwischen den Aufgabenstufen (20/40/60/80 % des
     Ziels, „häufig“ alle 10 %); wer eine Linie überquert, bekommt ein
     Item für sein Team (höchstens 2), jedes Teammitglied kann es
     einsetzen. Welches, entscheidet der Server nach Platz (dd_storm_draw).
     Reihenfolge = Reihenfolge in der Lobby. */
  const ST_ITEMS = [
    { id: 'bonus',  name: 'Bonus-Kisten', say: 'Zwei goldene Kisten für euer Team.' },
    { id: 'stein',  name: 'Steinkiste',   say: 'Eine Steinkiste: Möwe und Sturm kommen nicht an sie heran.' },
    { id: 'moewe',  name: 'Möwe',         say: 'Klaut beim Team vor euch die oberste Kiste.' },
    { id: 'moewe3', name: '3 Möwen',      say: 'Klauen bei bis zu drei Teams vor euch je eine Kiste.' },
    { id: 'maxi',   name: 'Maxi-Kisten',  say: '20 Sekunden lang ist jede Kiste doppelt so hoch.' },
    { id: 'mini',   name: 'Mini-Kisten',  say: 'Zwei Teams vor euch bekommen 20 Sekunden lang halbe Kisten.' },
    { id: 'sturm',  name: 'Sturm',        say: '30 Sekunden Sturm: wer über Stufe 1 ist, verliert bei jedem Fehler die oberste Kiste.' },
    { id: 'tea',    name: 'Teatime',      say: 'Die ersten beiden Teams machen 10 Sekunden Teepause.' },
    { id: 'bus',    name: 'Bus',          say: 'Fährt unten durch und nimmt jedem Team 5 Kisten weg.' },
    { id: 'boom',   name: 'Boom',         say: 'Plasmabombe auf den Ersten: 5 Kisten kaputt, ein Stein hält den Rest.' },
    { id: 'eis',    name: 'Eiskiste',     say: 'Ein anderes Team bekommt eine Eiskiste: 5 richtige in Folge, sonst rutscht alles darunter weg.' },
    { id: 'kuddel', name: 'Kuddelmuddel', say: 'Alle Kisten aller Teams werden gemischt – die Anzahl bleibt.' }
  ];
  const stItem = id => ST_ITEMS.find(x => x.id === id) || { id, name: id, say: '' };
  /* Kleine Bilder (eigene Farben; .dd-it hebt das allgemeine .dd svg auf) */
  const IT_BOX = (x, y, w, h, c, e) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.5" fill="' + c + '" stroke="' + e + '" stroke-width="1.6"/>' +
    '<rect x="' + (x + w * 0.42) + '" y="' + y + '" width="' + (w * 0.16) + '" height="' + h + '" fill="#f6ecc4" opacity=".85"/>';
  const GULL = '<path d="M4 18c5-6 10-6 14 0c4-6 9-6 14 0c-5-2-9-1-14 3c-5-4-9-5-14-3z" fill="#fff" stroke="#3b4250" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M18 21l3 1.6l-3 1.2z" fill="#ff9f1c" stroke="#3b4250" stroke-width=".8"/><circle cx="19.6" cy="19.4" r=".9" fill="#3b4250"/>';
  const IT_SVG = {
    bonus:  IT_BOX(9, 20, 22, 13, '#f2c230', '#9a7410') + IT_BOX(12, 8, 16, 12, '#f2c230', '#9a7410') +
            '<path d="M32 6l1.4 3.4L37 10.8l-3.6 1.4L32 15.6l-1.4-3.4L27 10.8l3.6-1.4z" fill="#fff6b0" stroke="#9a7410" stroke-width=".8"/>',
    stein:  '<path d="M7 13l5-6h16l5 6v18l-4 3H11l-4-3z" fill="#9aa1ab" stroke="#4a4f57" stroke-width="1.8" stroke-linejoin="round"/>' +
            '<path d="M13 15l5 4l-2 6M24 11l2 7l5 2M20 27l5 3" fill="none" stroke="#5b616b" stroke-width="1.4" stroke-linecap="round"/>',
    moewe:  '<g transform="translate(2 6)">' + GULL + '</g>' + IT_BOX(17, 28, 10, 8, '#c9914f', '#7d5326'),
    moewe3: '<g transform="translate(-4 -2) scale(.7)">' + GULL + '</g><g transform="translate(14 2) scale(.7)">' + GULL + '</g><g transform="translate(5 14) scale(.8)">' + GULL + '</g>',
    maxi:   IT_BOX(7, 10, 22, 26, '#c9914f', '#7d5326') + '<path d="M33 22V6M28.5 10.5L33 6l4.5 4.5" fill="none" stroke="#2f7a4a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    mini:   IT_BOX(9, 26, 14, 9, '#c9914f', '#7d5326') + '<path d="M31 8v18M26.5 21.5L31 26l4.5-4.5" fill="none" stroke="#b5322a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    sturm:  '<path d="M9 16c4-6 14-7 18-2c4-1 8 2 7 6H8c-3 0-3-4 1-4z" fill="#d7dee8" stroke="#56627a" stroke-width="1.6" stroke-linejoin="round"/>' +
            '<path d="M5 26h18c3 0 3 4 0 4M9 31h13M6 22h22" fill="none" stroke="#5a8fd8" stroke-width="2.2" stroke-linecap="round"/>',
    tea:    '<path d="M8 17h20v6c0 6-4 10-10 10s-10-4-10-10z" fill="#fff" stroke="#6b4a2a" stroke-width="1.8"/>' +
            '<path d="M28 19c5 0 5 7 0 7" fill="none" stroke="#6b4a2a" stroke-width="1.8"/><path d="M10 19h16v3H10z" fill="#c58a4a"/>' +
            '<path d="M14 6c-2 3 2 4 0 7M20 5c-2 3 2 4 0 7" fill="none" stroke="#9aa1ab" stroke-width="1.6" stroke-linecap="round"/>' +
            '<ellipse cx="18" cy="35" rx="13" ry="2.4" fill="#e9dcc3" stroke="#6b4a2a" stroke-width="1.2"/>',
    bus:    '<rect x="3" y="11" width="34" height="19" rx="4" fill="#f5c518" stroke="#6b4a10" stroke-width="1.8"/>' +
            '<rect x="7" y="14" width="7" height="6" rx="1" fill="#bfe3ff" stroke="#6b4a10"/><rect x="16" y="14" width="7" height="6" rx="1" fill="#bfe3ff" stroke="#6b4a10"/><rect x="25" y="14" width="8" height="6" rx="1" fill="#bfe3ff" stroke="#6b4a10"/>' +
            '<circle cx="11" cy="31" r="3.6" fill="#333" stroke="#111"/><circle cx="29" cy="31" r="3.6" fill="#333" stroke="#111"/><path d="M3 24h34" stroke="#e08a00" stroke-width="1.6"/>',
    boom:   '<circle cx="18" cy="23" r="12" fill="#3b6df0" stroke="#1d2f7a" stroke-width="1.8"/><circle cx="14" cy="19" r="3.4" fill="#9fd0ff" opacity=".8"/>' +
            '<path d="M26 13l4-5" stroke="#4a3a2a" stroke-width="2.4" stroke-linecap="round"/><path d="M31 3l1.2 3l3 1.2l-3 1.2L31 11.4l-1.2-3l-3-1.2l3-1.2z" fill="#7de3ff" stroke="#1d6fa0" stroke-width=".8"/>',
    eis:    '<path d="M8 12l12-5l12 5v16l-12 6l-12-6z" fill="#bfe8ff" stroke="#3b8fc4" stroke-width="1.8" stroke-linejoin="round"/>' +
            '<path d="M8 12l12 6l12-6M20 18v16" fill="none" stroke="#3b8fc4" stroke-width="1.2"/><path d="M12 15l4 2M24 26l4-2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
    kuddel: IT_BOX(4, 22, 11, 10, '#e5484d', '#7a1f22') + IT_BOX(15, 24, 10, 9, '#2f7cf6', '#163f8a') + IT_BOX(26, 21, 10, 11, '#2fa84f', '#165a28') +
            '<path d="M6 15c5-8 21-8 27-1M30 9l3 5l-5 1" fill="none" stroke="#6b4a2a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const itIco = (id, cls) => '<svg class="dd-it' + (cls ? ' ' + cls : '') + '" viewBox="0 0 40 40" aria-hidden="true">' + (IT_SVG[id] || '') + '</svg>';

  /* ─── Kisten: Kurzform vom Server „n2“, „x0“, „s1“, „i3.4“ ─── */
  const ST_BSIZE = { x: 2, m: 0.5 };
  const stBsize = k => ST_BSIZE[k] || 1;
  const stSum = l => (l || []).reduce((a, s) => a + stBsize(s[0]), 0);
  const stFmt = h => (Math.round(h * 2) / 2).toString().replace('.', ',');
  function stParse(s) {
    const rest = String(s).slice(1).split('.');
    return { k: s[0], t: rest[0] === '' ? null : Number(rest[0]), n: rest[1] != null ? Number(rest[1]) : null };
  }
  function stBoxEl(s, cls) {
    const b = stParse(s), el = document.createElement('i');
    el.className = 'dd-st__box k-' + b.k + (cls ? ' ' + cls : '');
    el.style.setProperty('--sz', stBsize(b.k));
    if (b.t != null && window.DDFiguren) el.style.setProperty('--tc', stFig(b.t).col);
    if (b.k === 'i' && b.n) el.innerHTML = '<b>' + b.n + '</b>';
    return el;
  }
  const stTeamV = i => ((st.v && st.v.teams) || []).find(x => x.t === i) || { t: i, h: 0, b: [], it: [] };
  const stList = i => stTeamV(i).b || [];
  const sameList = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);
  const stUntil = iso => (iso ? Date.parse(iso) - stNow() : 0);
  /* Die Item-Linien (Höhen) dieses Spiels */
  function stLines() {
    const v = st.v;
    if (!v || !v.items_on) return [];
    const div = v.items_often ? 10 : 5;
    return Array.from({ length: div - 1 }, (_, k) => v.goal * (k + 1) / div);
  }


  function newStorm() {
    return { v: null, seq: 0, run: null, layout: '', timer: null, busy: false, skew: 0,
      shown: [], anim: [], lifting: [], hold: [], holdT: [], newItem: 0, usingItem: false,
      cardsKey: '', cards: null, order: [], oi: 0,
      task: null, nextT: null, lockUntil: 0, tick: null, goalTouched: false, autoKey: '', stacksInit: false, starting: false };
  }

  async function renderStorm() {
    const pane = root.querySelector('#ddPane');
    if (!pane) return;
    stStop(true);
    st = newStorm();
    pane.innerHTML = '<div class="dd-st ' + (isTeacher ? 'dd-st--beam' : 'dd-st--dev') + '" id="ddSt"><p class="dd-empty">Lade …</p></div>';
    if (isTeacher && !demo && !standalone) {
      const patch = { storm: { live: true, t: Date.now() } };
      if (!gameShared('storm')) patch.games = sharedGames().concat(['storm']);
      writeData(patch);
    }
    try { await Promise.all([ladeFiguren(), ladeInsel()]); }
    catch (e) {
      const box = root && root.querySelector('#ddSt');
      if (box) box.innerHTML = '<p class="dd-empty dd-empty--err">Kistensturm konnte nicht geladen werden. <button type="button" class="btn btn--sm" data-act="st-retry">Noch einmal</button></p>';
      return;
    }
    if (!st || !root) return;
    st.tick = setInterval(stTick, 250);
    stPoll();
  }

  /* Aufräumen. quiet = nur Takte (neu aufbauen); sonst sagt die Lehrkraft der Klasse, dass es vorbei ist. */
  function stStop(quiet) {
    if (!st) return;
    clearTimeout(st.timer); clearTimeout(st.nextT); clearInterval(st.tick);
    st.anim.forEach(a => clearTimeout(a));
    st.holdT.forEach(a => clearTimeout(a));
    const was = st;
    st = null;
    if (!quiet && was && isTeacher && !demo && !standalone && ctx && stLive()) {
      try { ctx.actions.setData(Object.assign({}, roomData(), { storm: { live: false, t: Date.now() } })); } catch (e) { /* egal */ }
    }
  }

  /* ─── Server ─── */
  async function stPoll() {
    if (!st || !root) return;
    clearTimeout(st.timer); st.timer = null;
    const me = st;
    if (!me.busy) {
      me.busy = true;
      const t0 = Date.now();
      const r = await ctx.actions.call(isTeacher ? 'dd_storm_room_get' : 'dd_storm_view', { p_since: me.seq });
      me.busy = false;
      if (st !== me || !root) return;
      if (r && r.ok) { stClock(t0, r.server_now); stApply(r); }
      else stError(r && r.error);
    }
    if (st === me && root) {
      const ph = me.v ? me.v.phase : 'lobby';
      me.timer = setTimeout(stPoll, (isTeacher ? ST_BEAM_POLL : ST_POLL)[ph] || 2500);
    }
  }
  function stClock(t0, iso) {
    const s = Date.parse(iso);
    if (!isNaN(s)) st.skew = s - (t0 + Date.now()) / 2;
  }
  const stNow = () => Date.now() + (st ? st.skew : 0);
  function stError(code) {
    const box = root && root.querySelector('#ddSt');
    if (box && !st.v) box.innerHTML = '<p class="dd-empty dd-empty--err">' + E(errMsg(code || 'network')) + '</p>';
  }
  async function stCall(fn, args) {
    const r = await ctx.actions.call(fn, args || {});
    if (!r || !r.ok) toast(r && r.error === 'no_stacks' ? 'Wähle zuerst mindestens einen Stapel.' : errMsg(r && r.error));
    return r;
  }

  /* ─── Neue Ansicht vom Server ─── */
  function stApply(v) {
    const newRun = st.run !== null && v.run !== st.run;
    if (newRun) {                       // neues Spiel: Türme und Aufgaben von vorn
      st.shown = []; st.anim.forEach(a => clearTimeout(a)); st.anim = []; st.hold = [];
      st.task = null; st.order = []; st.oi = 0;
    }
    st.run = v.run;
    const evs = (v.events || []).filter(e => e.s > st.seq);
    st.seq = Math.max(st.seq, v.seq || 0);
    st.v = v;
    if (isTeacher) stTeacherAuto(v);
    const layout = v.phase === 'lobby' ? 'lobby' : (!isTeacher && v.phase === 'ended' ? 'end' : 'game');
    // Ereignisse zuerst: Items halten betroffene Türme fest, bevor nachgezogen wird.
    if (layout !== st.layout || newRun) { st.layout = layout; stBuild(); if (st.layout === 'game') evs.forEach(stEvent); }
    else { if (st.layout === 'game') evs.forEach(stEvent); stUpdate(); }
  }

  /* ─── Aufbau je Abschnitt ─── */
  function stBuild() {
    const box = root.querySelector('#ddSt');
    if (!box || !st.v) return;
    clearTimeout(st.nextT);
    box.classList.toggle('is-game', st.layout === 'game');
    if (st.layout === 'lobby') box.innerHTML = isTeacher ? stLobbyBeam() : stLobbyDev();
    else if (st.layout === 'end') box.innerHTML = stEndDev();
    else {
      box.innerHTML = isTeacher ? stSceneBeam() : stSceneDev();
      st.shown = [];
      stSync(true);
      if (!isTeacher) stMaybeTask();
    }
    stUpdate();
    stLayout();
    if (st.layout === 'game') stFitPhone();
  }
  function stUpdate() {
    const v = st.v;
    if (!v) return;
    if (st.layout === 'lobby') { if (isTeacher) stPaintLobbyBeam(); else stPaintLobbyDev(); return; }
    if (st.layout === 'end') return;
    stSync(false);
    stPaintOver();
    stEffects();
    if (!isTeacher) { stPaintLevel(); stPaintItems(); stMaybeTask(); }
    stPaintBtns();
  }
  function stPaintBtns() {
    const btns = root && root.querySelector('#ddStBtns');
    if (!btns) return;
    const html = stBeamBtns();
    if (btns.dataset.h !== html) { btns.dataset.h = html; btns.innerHTML = html; }
  }
  /* Countdown im laufenden Spiel: läuft er ab, gewinnt der höchste Turm. 0 = abbrechen. */
  async function stSetClock(min) {
    const me = st;
    st.clockMenu = false; stPaintBtns();
    const r = await ctx.actions.call('dd_storm_room_clock', { p_minutes: min });
    if (st !== me) return;
    if (!r || !r.ok) { toast(errMsg(r && r.error)); return; }
    toast(min ? 'Countdown läuft: noch ' + min + (min === 1 ? ' Minute' : ' Minuten') + '. Dann gewinnt der höchste Turm.' : 'Countdown abgebrochen.');
    stPoll();
  }

  /* ══ Lobby (Lehrkraft) ══ */
  const stPeople = () => (st.v && st.v.people) || [];
  function stLobbyBeam() {
    return '<div class="dd-st__lobby">' +
      '<section class="dd-st__set" aria-label="Einstellungen">' +
        '<h3 class="dd-st__h3">Kistensturm</h3>' +
        '<p class="dd-st__lead">Teams stapeln um die Wette: jede richtige Antwort ist eine Kiste. Wer zuerst oben ist, gewinnt.</p>' +
        '<div class="dd-st__row dd-st__row--top"><span class="dd-st__lab">Teams</span><div class="dd-st__figpick" id="ddStFigs" role="group" aria-label="Welche Teams spielen mit"></div></div>' +
        '<div class="dd-st__row"><span class="dd-st__lab">Zielhöhe</span><div class="dd-st__goalset">' +
          '<button type="button" class="btn btn--sm dd-ic" data-act="st-goal" data-v="-1" aria-label="Weniger Kisten">−</button>' +
          '<input class="dd-input dd-st__goalin" id="ddStGoal" type="number" min="5" max="200" inputmode="numeric" aria-label="Zielhöhe in Kisten">' +
          '<button type="button" class="btn btn--sm dd-ic" data-act="st-goal" data-v="1" aria-label="Mehr Kisten">+</button>' +
          '<span class="dd-st__unit">Kisten</span></div></div>' +
        '<p class="dd-st__hint" id="ddStGoalHint"></p>' +
        '<div class="dd-st__row dd-st__row--top"><span class="dd-st__lab">Stapel</span><div class="dd-chips" id="ddStStacks"></div></div>' +
        '<div class="dd-st__row"><span class="dd-st__lab">Items</span><span class="dd-st__pair"><div class="dd-segs" id="ddStIon" role="group" aria-label="Items">' +
          '<button type="button" class="dd-seg" data-act="st-ion" data-v="1">an</button><button type="button" class="dd-seg" data-act="st-ion" data-v="0">aus</button></div>' +
          '<div class="dd-segs" id="ddStOften" role="group" aria-label="Wie oft" title="Häufig: doppelt so viele Item-Linien">' +
          '<button type="button" class="dd-seg" data-act="st-often" data-v="0">normal</button><button type="button" class="dd-seg" data-act="st-often" data-v="1">häufig</button></div></span></div>' +
        '<div class="dd-st__itset" id="ddStItemSet"></div>' +
        '<div class="dd-st__go"><button type="button" class="btn btn--primary dd-st__start" data-act="st-start" id="ddStStart">' + ico.play + 'Start</button>' +
          '<p class="dd-st__hint" id="ddStStartHint"></p></div>' +
      '</section>' +
      '<section class="dd-st__teams" id="ddStTeamsBox" aria-label="Teams"></section>' +
    '</div>';
  }
  /* Figur an/aus: mindestens zwei Teams. Team i = i-te gewählte Figur. */
  async function stToggleFig(k) {
    const cur = new Set(st.v.figs || [0, 1, 2, 3]);
    if (cur.has(k)) { if (cur.size <= 2) { toast('Mindestens zwei Teams spielen mit.'); return; } cur.delete(k); } else cur.add(k);
    const figs = [...cur].sort((a, b) => a - b);
    st.v.figs = figs; st.v.team_count = figs.length;
    stPaintLobbyBeam();
    const r = await stCall('dd_storm_room_figs', { p_figs: figs });
    if (r && r.ok) stPoll();   // Teams neu verteilt
  }
  function stPerTeam() {
    const n = stPeople().length, k = (st.v && st.v.team_count) || 4;
    return Math.max(1, Math.ceil(n / k));
  }
  /* Vorschlag: etwa 6 richtige Antworten je Kind, auf 5 gerundet, 10…60. */
  const stSuggest = () => Math.max(10, Math.min(60, Math.round(stPerTeam() * 6 / 5) * 5));
  function stPaintLobbyBeam() {
    const v = st.v;
    const fp = root.querySelector('#ddStFigs');
    if (fp && window.DDFiguren) {
      const sel = v.figs || [0, 1, 2, 3], key = sel.join(',');
      if (fp.dataset.key !== key) {
        fp.dataset.key = key;
        fp.innerHTML = window.DDFiguren.LIST.map((f, k) => {
          const on = sel.includes(k);
          return '<button type="button" class="dd-st__figbtn' + (on ? ' is-on' : '') + '" data-act="st-fig" data-v="' + k + '" aria-pressed="' + on +
            '" title="Team ' + E(f.name) + '" style="--tc:' + f.col + ';--ts:' + f.soft + '">' + window.DDFiguren.svg(k, 'idle', 54) + '<span>' + E(f.name) + '</span></button>';
        }).join('');
      }
    }
    const gi = root.querySelector('#ddStGoal');
    if (gi && document.activeElement !== gi) gi.value = v.goal;
    const per = stPerTeam(), n = stPeople().length;
    const hint = root.querySelector('#ddStGoalHint');
    if (hint) hint.textContent = n ? 'Das sind etwa ' + Math.max(1, Math.round(v.goal / per)) + ' richtige Antworten je Kind (' + per + ' je Team).' : 'Noch niemand im Raum.';
    const sb = root.querySelector('#ddStStacks');
    if (sb) {
      const on = new Set(v.stacks || []);
      sb.innerHTML = (list || []).length ? (list || []).map(s => '<button type="button" class="dd-chip dd-chip--stack' + (on.has(s.id) ? ' is-on' : '') +
        '" data-act="st-stack" data-id="' + E(s.id) + '" aria-pressed="' + on.has(s.id) + '">' + (on.has(s.id) ? ico.check : '') + E(s.title) + ' <i>' + s.n + '</i></button>').join('')
        : '<span class="dd-st__hint">Noch kein Stapel – lege zuerst einen an.</span>';
    }
    root.querySelectorAll('#ddStIon .dd-seg').forEach(b => b.classList.toggle('is-on', (b.dataset.v === '1') === !!v.items_on));
    root.querySelectorAll('#ddStOften .dd-seg').forEach(b => { b.classList.toggle('is-on', (b.dataset.v === '1') === !!v.items_often); b.disabled = !v.items_on; });
    const iset = root.querySelector('#ddStItemSet');
    if (iset) {
      const off = new Set(v.items_off || []);
      iset.hidden = !v.items_on;
      iset.innerHTML = '<div class="dd-st__itgrid">' + ST_ITEMS.map(it => '<span class="dd-st__itcell' + (off.has(it.id) ? '' : ' is-on') + '"><button type="button" class="dd-st__itbtn' + (off.has(it.id) ? '' : ' is-on') + '" data-act="st-item" data-id="' + it.id +
          '" aria-pressed="' + !off.has(it.id) + '" title="' + E(it.say) + '">' + itIco(it.id) + '<span>' + E(it.name) + '</span></button>' + stInfoBtn(it.id) + '</span>').join('') + '</div>';
    }
    const cards = (list || []).filter(s => (v.stacks || []).includes(s.id)).reduce((a, s) => a + (s.n || 0), 0);
    const sh = root.querySelector('#ddStStartHint'), go = root.querySelector('#ddStStart');
    const why = !(v.stacks || []).length ? 'Wähle mindestens einen Stapel.' : cards < 4 ? 'Die Stapel brauchen zusammen mindestens 4 Karten.' : '';
    if (go) go.disabled = !!why || st.starting;
    if (sh) sh.textContent = why || (n ? n + (n === 1 ? ' Kind spielt' : ' Kinder spielen') + ' mit. Nicht gewählte Stapel werden beim Start mit der Klasse geteilt.' : 'Die Klasse kommt über „Mitmachen“ dazu – oder startet einfach mit.');
    const tb = root.querySelector('#ddStTeamsBox');
    if (tb) {
      const key = JSON.stringify([v.team_count, stPeople().map(p => p.n + p.t)]);
      if (tb.dataset.key !== key) {
        tb.dataset.key = key;
        tb.innerHTML = Array.from({ length: v.team_count }, (_, i) => {
          const ps = stPeople().filter(p => p.t === i);
          return '<article class="dd-st__tcard" style="' + stCol(i) + '">' +
            '<span class="dd-st__tfig">' + figSVG(i, 'idle', 92) + '</span>' +
            '<div class="dd-st__tinfo"><b>' + E(stTeam(i)) + '</b><small>' + E(stFig(i).say) + '</small>' +
            '<p class="dd-st__names">' + (ps.length ? ps.map(p => '<span>' + E(p.n) + '</span>').join('') : '<em>noch leer</em>') + '</p></div></article>';
        }).join('');
      }
    }
  }
  /* Einmal je Öffnen: Stapel vorbelegen; solange nicht angefasst, Zielhöhe nach der Klassengröße. */
  function stTeacherAuto(v) {
    if (v.phase !== 'lobby' || demo) return;
    const patch = {};
    if (!st.stacksInit && list) {
      st.stacksInit = true;
      if (!(v.stacks || []).length && (list || []).length) {
        const sh = sharedRaw().map(e => e.id).filter(id => list.some(s => s.id === id));
        patch.p_stacks = (sh.length ? sh : activeIds()).slice(0, 20);
      }
    }
    const key = v.team_count + ':' + stPeople().length;
    if (!st.goalTouched && st.autoKey !== key) {
      st.autoKey = key;
      if (stPeople().length && v.goal !== stSuggest()) patch.p_goal = stSuggest();
    }
    if (Object.keys(patch).length) stSetup(patch);
  }
  async function stSetup(patch) {
    if (!st || !st.v) return;
    const args = Object.assign({ p_team_count: null, p_goal: null, p_minutes: null, p_stacks: null }, patch);
    // Gleich zeigen, der Server bestätigt beim nächsten Takt.
    if (args.p_goal != null) st.v.goal = args.p_goal;
    if (args.p_stacks != null) st.v.stacks = args.p_stacks;
    stPaintLobbyBeam();
    await stCall('dd_storm_room_setup', args);
  }
  async function stItems(patch) {
    if (!st || !st.v) return;
    const args = Object.assign({ p_on: null, p_often: null, p_off: null }, patch);
    if (args.p_on != null) st.v.items_on = args.p_on;
    if (args.p_often != null) st.v.items_often = args.p_often;
    if (args.p_off != null) st.v.items_off = args.p_off;
    stPaintLobbyBeam();
    await stCall('dd_storm_room_items', args);
  }
  function stToggleItem(id) {
    const off = new Set(st.v.items_off || []);
    if (off.has(id)) off.delete(id); else off.add(id);
    if (off.size >= ST_ITEMS.length) { toast('Mindestens ein Item bleibt an – sonst schalte Items ganz aus.'); return; }
    stItems({ p_off: [...off] });
  }
  function stGoal(delta, abs) {
    if (!st || !st.v) return;
    st.goalTouched = true;
    let g = abs != null ? abs : st.v.goal + delta * (st.v.goal >= 20 ? 5 : 1);
    if (abs == null && delta > 0 && st.v.goal >= 20) g = Math.ceil((st.v.goal + 1) / 5) * 5;
    if (abs == null && delta < 0 && st.v.goal > 20) g = Math.floor((st.v.goal - 1) / 5) * 5;
    g = Math.max(5, Math.min(200, Math.round(g) || 20));
    if (g !== st.v.goal) stSetup({ p_goal: g });
    else stPaintLobbyBeam();
  }
  function stToggleStack(id) {
    const cur = (st.v.stacks || []).slice();
    const i = cur.indexOf(id);
    if (i >= 0) cur.splice(i, 1); else if (cur.length < 20) cur.push(id);
    stSetup({ p_stacks: cur });
  }
  async function stStart() {
    if (!st || !st.v || st.starting) return;
    st.starting = true; stPaintLobbyBeam();
    // Stapel, die die Klasse noch nicht hat, jetzt teilen — sonst bekommt das Tablet keine Karten.
    const cur = sharedRaw();
    const add = (st.v.stacks || []).filter(id => !cur.some(e => e.id === id)).map(id => (list || []).find(s => s.id === id)).filter(Boolean);
    if (add.length) {
      if (cur.length + add.length > MAX_SHARED) { toast('Mehr als ' + MAX_SHARED + ' geteilte Stapel passen nicht in einen Raum.'); st.starting = false; stPaintLobbyBeam(); return; }
      await writeShared(cur.concat(add.map(entryOf)));
    }
    if (!st) return;
    const r = await stCall('dd_storm_room_start');
    if (!st) return;
    st.starting = false;
    if (r && r.ok) { st.goalTouched = true; stPoll(); } else stPaintLobbyBeam();
  }

  /* ══ Lobby (Tablet) ══ */
  function stMyTeam() {
    const v = st.v;
    if (!v || !v.me) return null;
    if (v.me.t != null) return v.me.t;
    const p = (v.people || []).find(x => x.id === v.me.id);
    return p ? p.t : null;
  }
  function stLobbyDev() { return '<div class="dd-st__wait" id="ddStWait"></div>'; }
  function stPaintLobbyDev() {
    const box = root.querySelector('#ddStWait');
    if (!box) return;
    const t = stMyTeam(), v = st.v;
    const key = JSON.stringify([t, v.team_count, stPeople().map(p => p.n + p.t), v.items_on, v.items_often, v.items_off]);
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    if (t == null) {
      box.innerHTML = '<div class="dd-st__card"><h3 class="dd-st__h3">Kistensturm</h3><p>Gleich geht’s los. Sobald deine Lehrkraft startet, kommst du in ein Team.</p></div>' + stItemsDev();
      return;
    }
    const mates = stPeople().filter(p => p.t === t);
    box.innerHTML = '<div class="dd-st__card" style="' + stCol(t) + '">' +
      '<span class="dd-st__bigfig">' + figSVG(t, 'wave', 150) + '</span>' +
      '<p class="dd-st__you">Du bist in</p><h3 class="dd-st__h3 dd-st__tname">' + E(stTeam(t)) + '</h3>' +
      '<p class="dd-st__say">' + E(stFig(t).say) + '</p>' +
      '<p class="dd-st__names">' + mates.map(p => '<span' + (p.id === v.me.id ? ' class="is-me"' : '') + '>' + E(p.n) + '</span>').join('') + '</p>' +
      '<p class="dd-st__hint">Warte, bis deine Lehrkraft startet. Jede richtige Antwort ist eine Kiste für dein Team.</p></div>' + stItemsDev();
  }
  /* Lobby am Tablet: die Items dieses Spiels, antippen = Erklärung mit Bild */
  function stItemsDev() {
    const v = st.v;
    if (!v.items_on) return '';
    const off = new Set(v.items_off || []), on = ST_ITEMS.filter(it => !off.has(it.id));
    if (!on.length) return '';
    return '<div class="dd-st__card dd-st__itlist"><h3 class="dd-st__h3">Items in diesem Spiel</h3>' +
      '<p class="dd-st__hint"><span class="dd-st__qbox">?</span>Überquert euer Turm eine gestrichelte Linie, bekommt euer Team ein Item' +
        (v.items_often ? ' – heute gibt es besonders viele.' : '.') + ' Antippen zeigt, was es macht.</p>' +
      '<div class="dd-st__itgrid">' + on.map(it => '<button type="button" class="dd-st__itbtn is-on" data-act="st-iinfo" data-id="' + it.id + '">' +
        itIco(it.id) + '<span>' + E(it.name) + '</span><i class="dd-st__ii">i</i></button>').join('') + '</div></div>';
  }
  const stInfoBtn = id => '<button type="button" class="dd-st__iinfo" data-act="st-iinfo" data-id="' + id + '" aria-label="' + E(stItem(id).name) + ': was macht das?">i</button>';
  /* Erklärung eines Items: Bildschirmfoto + Text (img/item-<id>.jpg) */
  function stItemInfo(id) {
    const it = stItem(id), box = root.querySelector('#ddSt');
    if (!box) return;
    stItemInfoClose();
    const d = document.createElement('div');
    d.className = 'dd-st__iwin'; d.id = 'ddStIWin';
    d.innerHTML = '<div class="dd-st__iwbg" data-act="st-iinfo-x"></div><div class="dd-st__iwcard" role="dialog" aria-modal="true" aria-label="' + E(it.name) + '">' +
      '<button type="button" class="dd-x" data-act="st-iinfo-x" aria-label="Schließen">×</button>' +
      '<img src="' + BASE + 'img/item-' + id + '.jpg?v=' + V + '" alt="Bildschirmfoto: ' + E(it.name) + '" decoding="async">' +
      '<div class="dd-st__iwtxt">' + itIco(id) + '<span><b>' + E(it.name) + '</b>' + E(it.say) + '</span></div></div>';
    box.appendChild(d);
    const x = d.querySelector('.dd-x'); if (x) x.focus();
  }
  function stItemInfoClose() { const d = root && root.querySelector('#ddStIWin'); if (d) d.remove(); }

  /* ══ Spielfeld (Beamer) ══ */
  function stSceneBeam() {
    const v = st.v, n = v.team_count;
    let lanes = '';
    for (let i = 0; i < n; i++) {
      const cnt = stPeople().filter(p => p.t === i).length;
      lanes += '<div class="dd-st__lane" data-t="' + i + '" style="' + stCol(i) + '">' +
        '<div class="dd-st__tower" id="ddStT' + i + '"></div>' +
        '<span class="dd-st__hgt" id="ddStH' + i + '">0</span>' +
        '<div class="dd-st__pops" id="ddStP' + i + '"></div>' +
        '<span class="dd-st__fig" id="ddStF' + i + '">' + figSVG(i, 'idle', 120) + '</span>' +
        '<span class="dd-st__fxs" id="ddStX' + i + '"></span>' +
        '<span class="dd-st__tag"><b>' + E(stFig(i).name) + '</b><span class="dd-st__held" id="ddStI' + i + '"></span>' +
          '<small>' + cnt + (cnt === 1 ? ' Kind' : ' Kinder') + '</small></span>' +
      '</div>';
    }
    return '<div class="dd-st__top">' +
        '<div class="dd-st__ttl"><b>Ziel: ' + v.goal + ' Kisten</b><span>' + v.team_count + ' Teams · ' + stPeople().length + (stPeople().length === 1 ? ' Kind' : ' Kinder') + '</span></div>' +
        '<span class="dd-st__clock" id="ddStClock" hidden></span>' +
        '<span class="dd-st__stormtag" id="ddStStorm" hidden></span>' +
        '<div class="dd-st__btns" id="ddStBtns">' + stBeamBtns() + '</div>' +
      '</div>' +
      '<div class="dd-st__scene" id="ddStScene" style="--n:' + n + '">' +
        '<div class="dd-st__ilines" id="ddStLines"></div>' +
        '<div class="dd-st__goal" id="ddStGoalLine"><span>Ziel · ' + v.goal + '</span></div>' +
        '<div class="dd-st__lanes">' + lanes + '</div>' +
        '<div class="dd-st__floor"></div>' +
        '<div class="dd-st__wind" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
        '<div class="dd-st__anns" id="ddStAnn" aria-live="polite"></div>' +
        '<div class="dd-st__over" id="ddStOver"></div>' +
      '</div>';
  }
  function stBeamBtns() {
    if (!isTeacher || !st.v) return '';
    const ph = st.v.phase;
    const run = ph === 'running', ends = run && st.v.ends_at;
    return (run ? '<span class="dd-st__clockwrap"><button type="button" class="btn btn--sm' + (st.clockMenu ? ' is-on' : '') + '" data-act="st-clock" aria-expanded="' + !!st.clockMenu + '">' +
        ico.clock + (ends ? 'Countdown ändern' : 'Countdown') + '</button>' +
        (st.clockMenu ? '<span class="dd-st__clockmenu" role="menu"><small>Noch so lange, dann gewinnt der höchste Turm:</small>' +
          ST_MINUTES.map(n => '<button type="button" class="dd-seg" role="menuitem" data-act="st-clock-set" data-v="' + n + '">' + n + ' Min.</button>').join('') +
          (ends ? '<button type="button" class="dd-seg dd-st__clockx" role="menuitem" data-act="st-clock-set" data-v="0">Abbrechen</button>' : '') + '</span>' : '') +
        '</span>' : '') +
      (ph === 'running' || ph === 'countdown' ? '<button type="button" class="btn btn--sm" data-act="st-stop">Beenden</button>' : '') +
      (ph === 'ended' ? '<button type="button" class="btn btn--primary btn--sm" data-act="st-reset">' + ico.again + 'Nochmal</button>' : '') +
      (fsOk() ? '<button type="button" class="btn btn--sm dd-ic dd-fsbtn" data-act="mm-fs" title="Vollbild" aria-label="Vollbild">' + (fsEl() ? ico.unfull : ico.full) + '</button>' : '');
  }
  /* Kistengröße so, dass das Ziel genau unter die Ziellinie passt. */
  function stLayout() {
    const sc = root && root.querySelector('#ddStScene');
    if (!sc || !st || !st.v) return;
    // Spielfeld bis an den unteren Rand des Fensters (Vollbild: CSS)
    if (!document.fullscreenElement) {
      const top = sc.getBoundingClientRect().top + window.scrollY;
      sc.style.height = Math.round(Math.max(320, Math.min(980, window.innerHeight - top - 22))) + 'px';
    } else sc.style.height = '';
    const lanes = sc.querySelector('.dd-st__lanes');
    const h = lanes.clientHeight, w = lanes.clientWidth / st.v.team_count;
    // Platz bis zum Ziel – oder bis zum höchsten Turm, falls einer drüber ist
    let tall = st.v.goal;
    for (let i = 0; i < st.v.team_count; i++) tall = Math.max(tall, stSum(stList(i)), stTarget(i));
    st.tall = tall;
    const bh = Math.max(3, Math.min(42, (h - 46) / tall));
    sc.style.setProperty('--bh', bh.toFixed(2) + 'px');
    sc.style.setProperty('--bw', Math.round(Math.min(130, w * 0.46, bh * 3.4 + 40)) + 'px');
    sc.style.setProperty('--fw', Math.round(Math.max(64, Math.min(150, w * 0.5, h * 0.36))) + 'px');
    sc.classList.toggle('is-thin', bh < 12);
    const gl = sc.querySelector('#ddStGoalLine');
    if (gl) gl.style.bottom = 'calc(var(--floor) + ' + (st.v.goal * bh).toFixed(1) + 'px)';
    const il = sc.querySelector('#ddStLines');
    if (il) il.innerHTML = stLines().map(y => '<i style="bottom:calc(var(--floor) + ' + (y * bh).toFixed(1) + 'px)"><span class="dd-st__qbox">?</span></i>').join('');
    for (let i = 0; i < st.v.team_count; i++) stPaintHeight(i);
  }

  /* ══ Spielfeld (Tablet) ══ */
  function stSceneDev() {
    const v = st.v, me = stMyTeam();
    let rows = '';
    for (let i = 0; i < v.team_count; i++) {
      rows += '<div class="dd-st__rr' + (i === me ? ' is-me' : '') + '" data-t="' + i + '" style="' + stCol(i) + '">' +
        '<span class="dd-st__rfig" id="ddStF' + i + '">' + figSVG(i, 'idle', i === me ? 54 : 38) + '</span>' +
        '<span class="dd-st__rn">' + E(stFig(i).name) + (i === me ? ' <em>ihr</em>' : '') + '</span>' +
        '<span class="dd-st__rbar"><i id="ddStB' + i + '"></i>' + stLines().map(y => '<u style="--y:' + (y / v.goal * 100).toFixed(1) + '%"></u>').join('') + '</span>' +
        '<b class="dd-st__rh" id="ddStH' + i + '">0</b>' +
        '<span class="dd-st__pops" id="ddStP' + i + '"></span><span class="dd-st__fxs" id="ddStX' + i + '"></span></div>';
    }
    return '<div class="dd-st__hud" id="ddStHud">' +
        '<div class="dd-st__hudtop"><b>Ziel: ' + v.goal + ' Kisten</b>' + (me != null ? '<span class="dd-st__myt" style="' + stCol(me) + '">' + E(stTeam(me)) + '</span>' : '') +
          '<span class="dd-st__clock" id="ddStClock" hidden></span></div>' +
        '<div class="dd-st__race">' + rows + '</div>' +
        '<p class="dd-st__lvl" id="ddStLvl"></p>' +
        '<div class="dd-st__fxbox" id="ddStFx"></div>' +
        '<div class="dd-st__items" id="ddStItems" hidden></div>' +
      '</div>' +
      '<div class="dd-st__notes" id="ddStNotes" aria-live="polite"></div>' +
      '<div class="dd-st__play"><div class="dd-task dd-task--inline" id="ddTask" hidden></div>' +
        '<div class="dd-st__tea" id="ddStTea" hidden></div></div>' +
      '<div class="dd-st__note" id="ddStNote" hidden></div>' +
      '<div class="dd-st__over" id="ddStOver"></div>';
  }

  /* ─── Türme nachziehen ───
     Der Server schickt je Team die Kisten von unten nach oben. Kamen
     nur unten welche dazu (Antworten, Bonus, Stein), wird Kiste für
     Kiste angehoben (stStep, je Team ein eigener Takt). Alles andere
     (Möwe, Bus, Boom, Eis, Kuddelmuddel …) spielt erst seine Animation
     (stHold hält den Turm so lange fest) und baut dann neu. */
  function stTarget(i) { return Number(stTeamV(i).h) || 0; }
  function stHold(i, ms) {
    st.hold[i] = Math.max(st.hold[i] || 0, Date.now() + ms);
    clearTimeout(st.holdT[i]);
    st.holdT[i] = setTimeout(() => { if (st) stSync(false); }, ms + 30);
  }
  function stSync(instant) {
    if (!st.v) return;
    for (let i = 0; i < st.v.team_count; i++) {
      const tgt = stList(i), cur = st.shown[i];
      if (instant || !cur) { st.shown[i] = tgt.slice(); stRenderTower(i); stPaintHeight(i); continue; }
      if ((st.hold[i] || 0) > Date.now() || st.anim[i] || sameList(cur, tgt)) continue;
      const extra = tgt.length - cur.length;
      if (extra > 0 && sameList(tgt.slice(extra), cur)) stStep(i);
      else { st.shown[i] = tgt.slice(); stRenderTower(i, 'is-settle'); stPaintHeight(i); }
    }
    // Ragt ein Turm über das Ziel, schrumpfen die Kisten am Beamer (nichts läuft oben raus)
    if (isTeacher && st.tall != null) {
      let tall = st.v.goal;
      for (let i = 0; i < st.v.team_count; i++) tall = Math.max(tall, stSum(stList(i)));
      if (tall !== st.tall) stLayout();
    }
  }
  function stStep(i) {
    st.anim[i] = null;
    if (!st || !st.v) return;
    const tgt = stList(i);
    let extra = tgt.length - st.shown[i].length;
    if (!(extra > 0 && sameList(tgt.slice(extra), st.shown[i]))) { stSync(false); return; }
    // Weit zurück (Gerät war weg): bis auf drei Kisten springen, den Rest zeigen.
    if (extra > 6) { st.shown[i] = tgt.slice(3); stRenderTower(i); extra = 3; }
    const s = tgt[extra - 1];
    st.shown[i] = [s].concat(st.shown[i]);
    const tw = root.querySelector('#ddStT' + i);
    if (tw) {
      const el = stBoxEl(s, 'is-new');
      tw.prepend(el);                // column-reverse: das erste Kind ist ganz unten
      setTimeout(() => el.classList.remove('is-new'), 700);
    }
    stPaintHeight(i);
    stLift(i);
    st.anim[i] = setTimeout(() => stStep(i), ST_STEP_MS);
  }
  function stRenderTower(i, cls) {
    const tw = root.querySelector('#ddStT' + i);
    if (!tw) return;
    tw.innerHTML = '';
    (st.shown[i] || []).slice(0, 300).forEach(s => tw.appendChild(stBoxEl(s)));
    if (cls) { tw.classList.remove(cls); void tw.offsetWidth; tw.classList.add(cls); }
  }
  function stPaintHeight(i) {
    const h = stSum(st.shown[i]), v = st.v;
    const lab = root.querySelector('#ddStH' + i);
    if (lab) {
      lab.textContent = stFmt(h);
      if (isTeacher) lab.style.bottom = 'calc(' + h + ' * var(--bh) + 8px)';
    }
    const bar = root.querySelector('#ddStB' + i);
    if (bar) bar.style.setProperty('--p', Math.min(100, h / v.goal * 100).toFixed(1) + '%');
    const pops = root.querySelector('#ddStP' + i);
    if (pops && isTeacher) pops.style.bottom = 'calc(' + h + ' * var(--bh) + 44px)';
  }
  function stLift(i) {
    const f = root.querySelector('#ddStF' + i);
    if (!f || st.lifting[i] || (st.v && st.v.phase === 'ended')) return;
    st.lifting[i] = true;
    const px = isTeacher ? 120 : (i === stMyTeam() ? 54 : 38);
    f.innerHTML = figSVG(i, 'lift', px);
    setTimeout(() => {
      if (!st) return;
      st.lifting[i] = false;
      if (f.isConnected && st.v && st.v.phase !== 'ended') f.innerHTML = figSVG(i, 'idle', px);
    }, 920);
  }
  function stPop(t, html, cls) {
    const pops = root.querySelector('#ddStP' + t);
    if (!pops) return;
    const p = document.createElement('span');
    p.className = 'dd-st__pop' + (cls ? ' ' + cls : '');
    p.innerHTML = html;
    pops.appendChild(p);
    setTimeout(() => p.remove(), 1700);
    if (pops.children.length > (isTeacher ? 4 : 2)) pops.firstChild.remove();
  }

  /* ─── Ereignisse: Name über dem Turm, Items, Animationen ─── */
  function stEvent(e) {
    const me = stMyTeam(), d = e.d || {};
    if (e.k === 'box' && e.t != null) {
      if (!isTeacher && e.t !== me) return;     // am Tablet nur das eigene Team
      const n = d.n > 1 ? '+' + d.n : '+1';
      stPop(e.t, E(isTeacher ? (e.w || '') + ' ' + n : n + (e.w ? ' ' + e.w : '')));
    } else if (e.k === 'get' && e.t != null) {
      if (isTeacher || e.t === me) stPop(e.t, itIco(d.it) + 'Item!', 'is-item');
      if (e.t === me) { st.newItem = Date.now(); stNote(itIco(d.it) + '<b>Neues Item: ' + E(stItem(d.it).name) + '</b><span>Jeder im Team kann es einsetzen.</span>', 'is-get'); }
    } else if (e.k === 'use') {
      stUseFx(e, d);
    } else if (e.k === 'blow' && e.t != null) {
      stHold(e.t, 650);
      stFlyOff(e.t, d.box);
      if (e.t === me) stNote(itIco('sturm') + '<b>Der Sturm hat eure oberste Kiste weggeweht.</b>', 'is-bad');
    } else if (e.k === 'icebreak' && e.t != null) {
      stHold(e.t, 700);
      stShake(e.t);
      if (e.t === me) stNote(itIco('eis') + '<b>Das Eis ist gebrochen – alles darunter ist weggerutscht.</b>', 'is-bad');
    } else if (e.k === 'melt' && e.t === me) {
      stNote(itIco('eis') + '<b>Geschafft! Das Eis ist geschmolzen.</b>', 'is-good');
    }
  }
  /* Ein Item wurde eingesetzt: Ansage + Animation. Betroffene Türme warten. */
  function stUseFx(e, d) {
    const it = stItem(d.it), tg = Array.isArray(d.tg) ? d.tg : [], me = stMyTeam(), by = e.t;
    const who = (e.w ? E(e.w) + ' (' + E(stFig(by).name) + ')' : E(stTeam(by)));
    stAnnounce(itIco(d.it, 'is-big') + '<span><b>' + who + '</b> setzt <b>' + E(it.name) + '</b> ein!</span>', by);
    const hold = (ts, ms) => ts.forEach(t => stHold(t, ms));
    const all = Array.from({ length: st.v.team_count }, (_, i) => i);
    if (d.it === 'moewe' || d.it === 'moewe3') {
      hold(tg.concat([by]), 1500);
      tg.forEach((t, k) => setTimeout(() => stGull(t, by, d['b' + t]), k * 220));
    } else if (d.it === 'bus') { hold(all, 1700); stBus(); }
    else if (d.it === 'boom') { hold(tg, 1150); stBomb(tg[0]); }
    else if (d.it === 'eis') { hold(tg, 900); stDrop(tg[0], 'eis'); }
    else if (d.it === 'kuddel') { hold(all, 1250); stKuddel(); }
    // Tablet: sagen, was das für das eigene Team heißt
    if (!isTeacher && me != null) {
      const hit = tg.includes(me) && by !== me;
      const txt = {
        moewe: 'Eine Möwe hat euch eine Kiste geklaut!', moewe3: 'Eine Möwe hat euch eine Kiste geklaut!',
        mini: 'Ihr bekommt 20 Sekunden lang nur Mini-Kisten.', tea: 'Teatime! 10 Sekunden Pause.',
        boom: 'Boom! Fünf Kisten sind kaputt.', eis: 'Ihr habt eine Eiskiste! 5 richtige in Folge, sonst rutscht alles darunter weg.',
        bus: 'Der Bus hat unten Kisten mitgenommen.', kuddel: 'Kuddelmuddel! Alle Kisten wurden gemischt.'
      }[d.it];
      if (by === me) stNote(itIco(d.it) + '<b>Ihr habt ' + E(it.name) + ' eingesetzt.</b><span>' + E(it.say) + '</span>', 'is-good');
      else if (hit && txt) stNote(itIco(d.it) + '<b>' + txt + '</b><span>von ' + E(stTeam(by)) + '</span>', 'is-bad');
      else if (d.it === 'sturm' || d.it === 'kuddel' || d.it === 'bus') stNote(itIco(d.it) + '<b>' + E(it.name) + '!</b><span>' + E(it.say) + '</span>');
    }
  }
  /* Große Ansage am Beamer, kleine Zeile am Tablet */
  function stAnnounce(html, t) {
    const box = root.querySelector('#ddStAnn');
    if (!box || !isTeacher) return;
    const el = document.createElement('div');
    el.className = 'dd-st__ann';
    if (t != null) el.setAttribute('style', stCol(t));
    el.innerHTML = html;
    box.appendChild(el);
    setTimeout(() => el.remove(), 2600);
    if (box.children.length > 2) box.firstChild.remove();
  }
  function stNote(html, cls) {
    const box = root.querySelector('#ddStNotes');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'dd-st__msg' + (cls ? ' ' + cls : '');
    el.innerHTML = html;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3600);
    if (box.children.length > 2) box.firstChild.remove();
  }
  /* Geometrie am Beamer: Turmspitze eines Teams in Koordinaten der Szene */
  function stTop(t) {
    const sc = root.querySelector('#ddStScene'), tw = root.querySelector('#ddStT' + t);
    if (!sc || !tw) return null;
    const a = sc.getBoundingClientRect(), r = tw.getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: (tw.lastElementChild ? r.top : r.bottom) - a.top, w: r.width, bottom: r.bottom - a.top };
  }
  function stFx(html, cls) {
    const sc = root.querySelector('#ddStScene');
    if (!sc) return null;
    const el = document.createElement('div');
    el.className = 'dd-st__fx ' + (cls || '');
    el.innerHTML = html;
    sc.appendChild(el);
    return el;
  }
  const stAnim = (el, frames, ms, ease) => (el && el.animate && !still() ? el.animate(frames, { duration: ms, easing: ease || 'ease-in-out', fill: 'forwards' }) : null);
  function stGull(from, to, box) {
    const a = stTop(from), b = stTop(to);
    if (!a || !b) return;
    const el = stFx('<svg class="dd-it" viewBox="0 0 40 40">' + GULL + '</svg>' +
      (box ? '<i class="dd-st__box k-' + E(box.k) + '" style="--sz:1;--tc:' + (box.t != null ? stFig(box.t).col : '#999') + '"></i>' : ''), 'is-gull');
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 90 };
    const pos = (p, dy) => 'translate(' + (p.x - 30) + 'px,' + (p.y - 30 + (dy || 0)) + 'px)';
    const an = stAnim(el, [{ transform: pos({ x: a.x, y: -40 }) }, { transform: pos(a, -10), offset: 0.3 },
      { transform: pos(mid), offset: 0.65 }, { transform: pos(b, -10) }], 1400);
    setTimeout(() => el.remove(), 1500);
    if (!an) el.remove();
  }
  function stBus() {
    const sc = root.querySelector('#ddStScene');
    if (!sc) return;
    const el = stFx(itIco('bus'), 'is-bus');
    const W = sc.clientWidth;
    stAnim(el, [{ transform: 'translateX(-160px)' }, { transform: 'translateX(' + (W + 20) + 'px)' }], 1600, 'linear');
    setTimeout(() => el.remove(), 1700);
  }
  function stBomb(t) {
    const p = stTop(t);
    if (!p) return;
    const el = stFx(itIco('boom'), 'is-bomb');
    stAnim(el, [{ transform: 'translate(' + (p.x - 28) + 'px,-60px) rotate(-20deg)' }, { transform: 'translate(' + (p.x - 28) + 'px,' + (p.y - 50) + 'px) rotate(10deg)' }], 650, 'ease-in');
    setTimeout(() => {
      el.remove();
      const ex = stFx('', 'is-blast');
      ex.style.left = p.x + 'px'; ex.style.top = p.y + 'px';
      setTimeout(() => ex.remove(), 700);
      stShake(t);
    }, 650);
  }
  function stDrop(t, it) {
    const p = stTop(t);
    if (!p) return;
    const el = stFx(itIco(it), 'is-drop');
    stAnim(el, [{ transform: 'translate(' + (p.x - 22) + 'px,-50px)' }, { transform: 'translate(' + (p.x - 22) + 'px,' + (p.y - 44) + 'px)' }], 800, 'cubic-bezier(.5,0,.8,.4)');
    setTimeout(() => el.remove(), 850);
  }
  function stFlyOff(t, box) {
    const p = stTop(t);
    if (!p || !box) return;
    const el = stFx('<i class="dd-st__box k-' + E(box.k) + '" style="--sz:1;--tc:' + (box.t != null ? stFig(box.t).col : '#999') + '"></i>', 'is-flyoff');
    stAnim(el, [{ transform: 'translate(' + (p.x - 30) + 'px,' + (p.y - 16) + 'px) rotate(0)' },
      { transform: 'translate(' + (p.x + 140) + 'px,' + (p.y - 80) + 'px) rotate(200deg)', opacity: 0 }], 650, 'ease-out');
    setTimeout(() => el.remove(), 700);
  }
  function stShake(t) {
    const lane = root.querySelector('.dd-st__lane[data-t="' + t + '"], .dd-st__rr[data-t="' + t + '"]');
    if (!lane) return;
    lane.classList.remove('is-shake'); void lane.offsetWidth; lane.classList.add('is-shake');
  }
  function stKuddel() {
    const sc = root.querySelector('#ddStScene');
    if (!sc) return;
    sc.classList.remove('is-kuddel'); void sc.offsetWidth; sc.classList.add('is-kuddel');
    setTimeout(() => sc.classList.remove('is-kuddel'), 1300);
  }

  /* ─── Laufende Wirkungen (jede Viertelsekunde aus stTick) ─── */
  function stEffects() {
    const v = st.v;
    if (!v || st.layout !== 'game') return;
    const box = root.querySelector('#ddSt');
    const storm = v.phase === 'running' ? stUntil(v.storm_until) : 0;
    if (box) box.classList.toggle('is-storm', storm > 0);
    const me = stMyTeam();
    for (let i = 0; i < v.team_count; i++) {
      const tm = stTeamV(i);
      const tea = stUntil(tm.tea), mx = stUntil(tm.mx), mn = stUntil(tm.mn);
      const lane = root.querySelector('.dd-st__lane[data-t="' + i + '"], .dd-st__rr[data-t="' + i + '"]');
      if (lane) lane.classList.toggle('is-tea', tea > 0);
      const fx = root.querySelector('#ddStX' + i);
      if (fx) {
        const parts = [];
        if (tea > 0) parts.push(itIco('tea') + Math.ceil(tea / 1000) + ' s');
        if (mx > 0) parts.push(itIco('maxi') + Math.ceil(mx / 1000) + ' s');
        if (mn > 0) parts.push(itIco('mini') + Math.ceil(mn / 1000) + ' s');
        const html = parts.map(p => '<span>' + p + '</span>').join('');
        if (fx.dataset.h !== html) { fx.dataset.h = html; fx.innerHTML = html; }
      }
      const held = root.querySelector('#ddStI' + i);
      if (held) {
        const key = (tm.it || []).join();
        if (held.dataset.k !== key) { held.dataset.k = key; held.innerHTML = (tm.it || []).map(id => itIco(id)).join(''); }
      }
    }
    if (isTeacher) {
      const sb = root.querySelector('#ddStStorm');
      if (sb) { sb.hidden = !(storm > 0); if (storm > 0) sb.innerHTML = itIco('sturm') + 'Sturm · noch ' + Math.ceil(storm / 1000) + ' s'; }
      return;
    }
    // Tablet: was gerade fürs eigene Team gilt
    const mine = me != null ? stTeamV(me) : null;
    const st1 = mine ? stUntil(mine.tea) : 0;
    const tea = root.querySelector('#ddStTea');
    if (tea) {
      tea.hidden = !(st1 > 0);
      if (st1 > 0) tea.innerHTML = itIco('tea', 'is-big') + '<b>Teatime!</b><span>Noch ' + Math.ceil(st1 / 1000) + ' Sekunden Pause – danach geht’s weiter.</span>';
    }
    const fxb = root.querySelector('#ddStFx');
    if (fxb && mine) {
      const ice = (mine.b || []).map(stParse).find(b => b.k === 'i' && b.n);
      const myH = stTarget(me), msgs = [];
      if (storm > 0) msgs.push('<p class="is-storm">' + itIco('sturm') + '<b>Sturm · ' + Math.ceil(storm / 1000) + ' s</b> ' +
        (myH >= v.goal / 5 ? 'Jeder Fehler kostet eure oberste Kiste.' : 'Ihr seid noch auf Stufe 1 – euch passiert nichts.') + '</p>');
      if (ice) msgs.push('<p class="is-ice">' + itIco('eis') + '<b>Eiskiste:</b> noch ' + ice.n + (ice.n === 1 ? ' richtige Antwort' : ' richtige Antworten') + ' in Folge.</p>');
      const mx = stUntil(mine.mx), mn = stUntil(mine.mn);
      if (mx > 0) msgs.push('<p class="is-good">' + itIco('maxi') + '<b>Maxi-Kisten</b> · noch ' + Math.ceil(mx / 1000) + ' s</p>');
      if (mn > 0) msgs.push('<p class="is-bad">' + itIco('mini') + '<b>Mini-Kisten</b> · noch ' + Math.ceil(mn / 1000) + ' s</p>');
      const html = msgs.join('');
      if (fxb.dataset.h !== html) { fxb.dataset.h = html; fxb.innerHTML = html; }
    }
  }
  /* Item-Fach am Tablet: jedes Teammitglied kann einsetzen */
  function stPaintItems() {
    const box = root.querySelector('#ddStItems'), v = st.v, me = stMyTeam();
    if (!box || me == null) return;
    if (!v.items_on) { box.hidden = true; return; }
    box.hidden = false;
    const its = stTeamV(me).it || [];
    const key = its.join() + '|' + (st.usingItem ? 1 : 0);
    if (box.dataset.k === key) return;
    const fresh = st.newItem && Date.now() - st.newItem < 1500;
    box.dataset.k = key;
    box.innerHTML = its.length
      ? its.map((id, k) => '<button type="button" class="dd-st__item' + (fresh && k === its.length - 1 ? ' is-new' : '') + '" data-act="st-use" data-slot="' + k + '"' + (st.usingItem ? ' disabled' : '') +
          ' title="' + E(stItem(id).name) + '" aria-label="' + E(stItem(id).name) + ' einsetzen">' + itIco(id) + '<em>Einsetzen</em></button>').join('')
      : '';
  }
  async function stUse(slot) {
    if (!st || st.usingItem) return;
    st.usingItem = true; stPaintItems();
    const me = st;
    const r = await ctx.actions.call('dd_storm_use', { p_slot: slot, p_since: me.seq });
    if (st !== me) return;
    st.usingItem = false;
    if (r && r.ok) {
      if (r.result === 'no_item') toast('Das Item hat schon jemand aus deinem Team eingesetzt.');
      else if (r.result === 'tea') toast('Während der Teatime geht das nicht.');
      stApply(r);
    } else toast(errMsg(r && r.error));
    stPaintItems();
  }

  /* ─── Countdown, Uhr, Sieg (über dem Spielfeld) ─── */
  function stTick() {
    if (!st || !st.v || !root) return;
    const v = st.v;
    stEffects();
    const clock = root.querySelector('#ddStClock');
    if (clock) {
      const show = v.phase === 'running' && v.ends_at;
      clock.hidden = !show;
      if (show) {
        const s = Math.max(0, Math.ceil((Date.parse(v.ends_at) - stNow()) / 1000));
        clock.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        clock.classList.toggle('is-low', s <= 30);
      }
    }
    if (v.phase === 'countdown') {
      const s = Math.ceil((Date.parse(v.countdown_ends_at) - stNow()) / 1000);
      const over = root.querySelector('#ddStOver');
      const txt = s > 3 ? 'Bereit?' : s > 0 ? String(s) : 'Los!';
      if (over && over.dataset.cd !== txt) {
        over.dataset.cd = txt;
        over.innerHTML = '<span class="dd-st__cd' + (s > 0 && s <= 3 ? ' is-num' : '') + '">' + txt + '</span>';
      }
      if (s <= 0 && !st.busy && Date.now() - (st.lastKick || 0) > 400) { st.lastKick = Date.now(); stPoll(); }
    }
  }
  function stRank() {
    const v = st.v;
    return Array.from({ length: v.team_count }, (_, i) => ({ t: i, h: stTarget(i) }))
      .sort((a, b) => (a.t === v.winner_team ? -1 : b.t === v.winner_team ? 1 : b.h - a.h || a.t - b.t));
  }
  function stPaintOver() {
    const over = root.querySelector('#ddStOver'), v = st.v;
    if (!over) return;
    if (v.phase === 'countdown') return;      // stTick zeichnet
    if (v.phase === 'running') { if (over.innerHTML) { over.innerHTML = ''; over.dataset.cd = ''; } return; }
    if (v.phase !== 'ended' || over.dataset.cd === 'end' + v.run) return;
    over.dataset.cd = 'end' + v.run;
    // Beamer: Sieger jubelt, die anderen sind traurig.
    for (let i = 0; i < v.team_count; i++) {
      const f = root.querySelector('#ddStF' + i);
      if (f) f.innerHTML = figSVG(i, v.winner_team == null ? 'idle' : i === v.winner_team ? 'cheer' : 'sad', 120);
    }
    over.innerHTML = stWinHTML(160);
  }
  function stWinHTML(px) {
    const v = st.v, w = v.winner_team;
    const rank = stRank();
    return '<div class="dd-st__win"' + (w != null ? ' style="' + stCol(w) + '"' : '') + '>' +
      (w != null ? '<span class="dd-st__winfig">' + figSVG(w, 'cheer', px) + '</span>' +
        '<span class="dd-memwin__stamp">Gewonnen</span><h2>' + E(stTeam(w)) + '</h2>' +
        '<p>' + (stTarget(w) >= v.goal ? 'Als Erstes ganz oben – ' + v.goal + ' Kisten!' : 'Der höchste Turm, als die Zeit um war.') + '</p>'
        : '<span class="dd-memwin__stamp">Vorbei</span><h2>Noch keine Kiste</h2><p>Diesmal hat kein Team eine Kiste gestapelt.</p>') +
      '<ol class="dd-st__rank">' + rank.map((r, k) => '<li style="' + stCol(r.t) + '"><span>' + (k + 1) + '.</span><b>' + E(stFig(r.t).name) + '</b><i>' + stFmt(r.h) + ' Kisten</i></li>').join('') + '</ol>' +
      (isTeacher ? '<div class="dd-memwin__act"><button type="button" class="btn btn--primary" data-act="st-reset">' + ico.again + 'Nochmal</button></div>' : '') +
    '</div>';
  }

  /* ══ Ende (Tablet) ══ */
  function stEndDev() {
    const v = st.v, me = stMyTeam();
    const won = me != null && me === v.winner_team;
    return '<div class="dd-st__card dd-st__end"' + (me != null ? ' style="' + stCol(me) + '"' : '') + '>' +
      (me != null ? '<span class="dd-st__bigfig">' + figSVG(me, won ? 'cheer' : 'sad', 150) + '</span>' +
        '<h3 class="dd-st__h3">' + (won ? 'Gewonnen!' : v.winner_team != null ? E(stTeam(v.winner_team)) + ' gewinnt' : 'Vorbei') + '</h3>' +
        '<p class="dd-st__say">' + (won ? 'Euer Turm ist ' + stFmt(stTarget(me)) + ' Kisten hoch. Stark!' : 'Euer Turm: ' + stFmt(stTarget(me)) + ' Kisten. Nächstes Mal!') + '</p>'
        : '<h3 class="dd-st__h3">Vorbei</h3>') +
      '<ol class="dd-st__rank">' + stRank().map((r, k) => '<li style="' + stCol(r.t) + '"' + (r.t === me ? ' class="is-me"' : '') + '><span>' + (k + 1) + '.</span><b>' + E(stFig(r.t).name) + '</b><i>' + stFmt(r.h) + ' Kisten</i></li>').join('') + '</ol>' +
      (v.me && v.me.c ? '<p class="dd-st__hint">Du hast ' + v.me.c + (v.me.c === 1 ? ' Kiste' : ' Kisten') + ' beigetragen.</p>' : '') +
      '<p class="dd-st__hint">Gleich kann es weitergehen – deine Lehrkraft startet die nächste Runde.</p></div>';
  }

  /* ══ Aufgaben (Tablet) ══ */
  /* Stufe nach der Höhe des eigenen Turms: 0 Begriff wählen … 4 Lückentext. */
  function stLevel() {
    const me = stMyTeam(), v = st.v;
    if (me == null || !v) return 0;
    return Math.max(0, Math.min(4, Math.floor(stTarget(me) / v.goal * 5)));
  }
  function stPaintLevel() {
    const el = root.querySelector('#ddStLvl');
    if (!el) return;
    const e = stLevel();
    el.innerHTML = 'Aufgaben: <b>' + ST_LEVEL[e] + '</b>' + '<span class="dd-st__dots">' + ST_LEVEL.map((_, k) => '<i' + (k <= e ? ' class="is-on"' : '') + '></i>').join('') + '</span>' +
      '<small>' + (e < 4 ? 'je höher euer Turm, desto schwerer' : 'ganz oben: die schwersten Aufgaben') + '</small>';
  }
  async function stLoadCards() {
    const ids = (st.v.stacks || []).filter(id => (list || []).some(s => s.id === id));
    const key = JSON.stringify(ids);
    if (st.cardsKey === key) return st.cards;
    st.cardsKey = key; st.cards = null;
    const got = await Promise.all(ids.map(getStack));
    if (!st || st.cardsKey !== key) return null;
    const cards = [];
    for (const s of got.filter(Boolean)) for (const c of s.cards) cards.push({ id: s.id + ':' + c.id, sid: s.id, t: c.t, d: c.d, i: c.i });
    st.cards = cards;
    opened.stacks = got.filter(Boolean);
    opened.cards = cards;
    return cards;
  }
  async function stMaybeTask() {
    const note = root.querySelector('#ddStNote');
    const v = st.v;
    if (!v || v.phase !== 'running') { if (note && v && v.phase === 'countdown') { note.hidden = false; note.textContent = 'Gleich geht’s los …'; } stLoadCards(); return; }
    if (stMyTeam() == null) { if (note) { note.hidden = false; note.textContent = 'Du kommst gleich in ein Team …'; } return; }
    if (st.task) return;
    const me = st;
    const cards = await stLoadCards();
    if (st !== me || st.task || !root) return;
    if (!cards || cards.length < 2) {
      if (note) { note.hidden = false; note.textContent = cards ? 'Für Kistensturm braucht es mehr Karten.' : 'Die Karten werden geladen …'; }
      return;
    }
    if (note) note.hidden = true;
    stNewTask();
  }
  function stNewTask() {
    const I = window.DDInsel, cards = st.cards;
    if (st.oi >= st.order.length) { st.order = I.roundCards(cards, []); st.oi = 0; }
    const card = st.order[st.oi];
    const t = I.makeTask(card, cards, stLevel());
    t.seq = []; t.done = false;
    st.task = t;
    paintTask();
    stFitPhone();
  }
  /* Am Handy: Spielbereich oben an den Rand, damit Rennen und Aufgabe ohne
     Scrollen zu sehen sind; ein Element (Rückmeldung, „Weiter“) ggf. nachholen. */
  function stFitPhone(el) {
    if (isTeacher || window.innerWidth > 600 || !root) return;
    requestAnimationFrame(() => {
      const dd = root && root.querySelector('#ddSt');
      const frame = dd && (dd.closest('.dd') || dd);
      if (!frame) return;
      try {
        const top = frame.getBoundingClientRect().top;
        if (Math.abs(top) > 2) window.scrollBy({ top, behavior: 'auto' });
        if (el && el.isConnected) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (_) {}
    });
  }
  function stTaskHead(t) {
    return '<div class="dd-st__thead">' + (multi() ? '<small>' + E(stackTitle(t.card.sid)) + '</small>' : '') + '</div>';
  }
  async function stResult(ok, extra) {
    const t = st.task, I = window.DDInsel, me = st;
    t.done = true;
    if (!ok) I.requeue(st.order, st.oi, t.card);
    const fb = root.querySelector('#ddFb');
    root.querySelectorAll('.dd-task__act .btn').forEach(b => { b.disabled = true; });
    const myT = stMyTeam();
    if (fb) {
      fb.className = 'dd-task__fb ' + (ok ? 'is-ok' : 'is-no');
      fb.innerHTML = ok
        ? '<p><span class="dd-st__flybox" style="' + (myT != null ? stCol(myT) : '') + '"></span><b>Richtig!</b> Eine Kiste für ' + E(myT != null ? stTeam(myT) : 'dein Team') + '.</p>'
        : '<p>Nicht ganz.</p>' + (extra ? '<p class="dd-task__sol">' + extra + '</p>' : '') +
          '<button type="button" class="btn btn--primary dd-st__nx" data-act="isl-next" id="ddNext" disabled><i class="dd-st__lock"></i>Weiter</button>';
      stFitPhone(fb);
    }
    st.lockUntil = ok ? 0 : Date.now() + ST_LOCK_MS;
    if (!ok) setTimeout(() => { const b = root && root.querySelector('#ddNext'); if (b) { b.disabled = false; b.focus({ preventScroll: true }); } }, ST_LOCK_MS);
    const r = await ctx.actions.call('dd_storm_answer', { p_ok: ok, p_since: me.seq });
    if (st !== me) return;
    if (r && r.ok) {
      stApply(r);
      if (ok && r.result === 'too_fast' && fb) fb.innerHTML = '<p><b>Richtig!</b></p>';
      if (r.result === 'tea' && fb) fb.innerHTML = '<p>' + itIco('tea') + '<b>Teatime!</b> Diese Antwort zählt nicht.</p>';
    }
    if (ok && st === me && st.layout === 'game') me.nextT = setTimeout(stNext, ST_NEXT_MS);
  }
  function stNext() {
    if (!st || !st.task || !st.task.done || Date.now() < st.lockUntil) return;
    clearTimeout(st.nextT);
    st.task = null;
    st.oi++;
    if (st.v && st.v.phase === 'running') stNewTask();
  }

  /* ─── Knopf „Mitmachen“ für die Klasse, solange die Lehrkraft Kistensturm offen hat ─── */
  function stBanner() {
    const el = root && root.querySelector('.dd-stbanner');
    if (!el) return;
    const show = !isTeacher && !demo && stLive() && !(screen === 'play' && opened && opened.game === 'storm');
    el.hidden = !show;
    if (show && !el.innerHTML) el.innerHTML = '<span class="dd-stbanner__box" aria-hidden="true"></span><b>Kistensturm!</b><span>Deine Lehrkraft hat ein Teamspiel geöffnet.</span>' +
      '<button type="button" class="btn btn--primary btn--sm" data-act="game" data-g="storm">' + ico.play + 'Mitmachen</button>';
  }

  /* ══════════════════════════════════════════════════════════════
     EDITOR (nur Lehrkraft)
     ══════════════════════════════════════════════════════════════ */
  function ladeParse() {
    if (window.DDParse) return Promise.resolve();
    if (parseReady) return parseReady;
    parseReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = BASE + 'parse.js?v=' + V;
      s.onload = () => resolve();
      s.onerror = () => { parseReady = null; reject(new Error('parse.js')); };
      document.head.appendChild(s);
    });
    return parseReady;
  }

  async function openEditor(stack) {
    try { await ladeParse(); } catch (e) { toast('Der Text-Editor konnte nicht geladen werden. Karte für Karte geht trotzdem.'); }
    const s = stack || { id: null, title: '', subject: '', topic: '', grade: '', cards: [] };
    ed = {
      id: s.id || null, title: s.title || '', subject: s.subject || '', topic: s.topic || '', grade: s.grade || '',
      cards: (s.cards || []).map(c => ({ id: c.id, t: c.t, d: c.d, i: c.i || '' })),
      mode: 'cards', text: '', dirty: false, saving: false
    };
    if (!ed.cards.length) ed.cards.push(blank());
    go('edit');
  }
  const blank = () => ({ id: newId(), t: '', d: '', i: '' });

  function renderEdit() {
    root.querySelector('.dd-main').innerHTML =
      '<div class="dd-stackhead">' +
        '<button type="button" class="btn btn--sm dd-backbtn" data-act="ed-cancel">' + ico.back + 'Zurück</button>' +
        '<div class="dd-stackhead__t"><h2 class="dd-h">' + (ed.id ? 'Stapel bearbeiten' : 'Neuer Stapel') + '</h2></div>' +
        '<div class="dd-edact">' +
          (ed.id ? '<button type="button" class="btn btn--sm btn--danger" data-act="ed-del">' + ico.trash + 'Löschen</button>' : '') +
          '<button type="button" class="btn btn--primary" data-act="ed-save">Speichern</button></div>' +
      '</div>' +
      '<div class="dd-meta">' +
        '<label class="dd-fld dd-fld--title"><span>Titel</span><input class="dd-input" data-e="title" maxlength="80" placeholder="z. B. Die Zelle" value="' + E(ed.title) + '"></label>' +
        '<label class="dd-fld"><span>Fach</span><input class="dd-input" data-e="subject" maxlength="60" list="ddFaecher" placeholder="Fach" value="' + E(ed.subject) + '"></label>' +
        '<label class="dd-fld dd-fld--wide"><span>Thema</span><input class="dd-input" data-e="topic" maxlength="80" placeholder="z. B. Zellorganellen" value="' + E(ed.topic) + '"></label>' +
        '<label class="dd-fld dd-fld--s"><span>Klassenstufe</span><input class="dd-input" data-e="grade" maxlength="20" list="ddStufen" placeholder="z. B. 7" value="' + E(ed.grade) + '"></label>' +
        '<datalist id="ddFaecher">' + FAECHER.map(f => '<option value="' + E(f) + '">').join('') + '</datalist>' +
        '<datalist id="ddStufen">' + STUFEN.map(f => '<option value="' + f + '">').join('') + '</datalist>' +
      '</div>' +
      '<div class="dd-tabs dd-tabs--ed" role="tablist">' +
        '<button type="button" role="tab" class="dd-tab' + (ed.mode === 'cards' ? ' is-on' : '') + '" data-act="ed-mode" data-v="cards">Karte für Karte</button>' +
        '<button type="button" role="tab" class="dd-tab' + (ed.mode === 'text' ? ' is-on' : '') + '" data-act="ed-mode" data-v="text">Text einfügen</button>' +
      '</div>' +
      '<div id="ddEd"></div>';
    paintEd();
  }

  function paintEd() {
    const box = root.querySelector('#ddEd');
    if (!box) return;
    if (ed.mode === 'cards') {
      box.innerHTML = '<div class="dd-cards" id="ddCards">' + ed.cards.map(edCard).join('') + '</div>' +
        '<div class="dd-addrow"><button type="button" class="btn dd-addbtn" data-act="ed-add">' + ico.plus + 'Karte hinzufügen</button>' +
        '<span class="dd-tip">Tipp: In der Definition <kbd>Strg</kbd>+<kbd>Enter</kbd> legt gleich die nächste Karte an.</span></div>';
      root.querySelectorAll('.dd-cardin textarea').forEach(autoGrow);
    } else {
      box.innerHTML =
        '<div class="dd-textmode">' +
          '<div class="dd-textmode__in"><textarea class="dd-ta" id="ddText" spellcheck="false" placeholder="' + E(
            'Titel: Die Zelle\nFach: Biologie\nThema: Zellorganellen\nKlasse: 7\n\n' +
            'Zellkern: Steuerzentrale der Zelle\nMitochondrium – Kraftwerk der Zelle\nRibosom = baut Eiweiße\n\n' +
            '… oder Begriff und Definition auf zwei Zeilen, oder mit Tab aus Excel eingefügt. Das Programm erkennt es selbst.') + '">' + E(ed.text) + '</textarea>' +
          '<p class="dd-tip">Eine Karte pro Zeile mit <b>:</b> <b>–</b> <b>=</b> <b>→</b> oder Tab dazwischen. Oder Blöcke durch Leerzeilen getrennt (erste Zeile = Begriff). Kopfzeilen <i>Titel/Fach/Thema/Klasse</i> füllen oben die Felder.</p></div>' +
          '<div class="dd-textmode__pv"><h3 class="dd-pvh">So habe ich es verstanden <span id="ddPvN"></span></h3><div id="ddPv"></div></div>' +
        '</div>';
      paintPreview();
    }
  }

  function edCard(c, i) {
    return '<div class="dd-cardin" data-i="' + i + '">' +
      '<span class="dd-cardin__n">' + (i + 1) + '</span>' +
      '<div class="dd-cardin__f">' +
        '<input class="dd-input" data-ec="t" maxlength="120" placeholder="Begriff" value="' + E(c.t) + '" aria-label="Begriff ' + (i + 1) + '">' +
        '<textarea class="dd-input" data-ec="d" rows="2" maxlength="1200" placeholder="Definition" aria-label="Definition ' + (i + 1) + '">' + E(c.d) + '</textarea>' +
      '</div>' +
      '<div class="dd-cardin__img">' + imgSlot(c, i) + '</div>' +
      '<div class="dd-cardin__act">' +
        '<button type="button" class="btn btn--sm dd-ic" data-act="ed-up" title="Nach oben" aria-label="Nach oben"' + (i === 0 ? ' disabled' : '') + '>' + ico.up + '</button>' +
        '<button type="button" class="btn btn--sm dd-ic" data-act="ed-down" title="Nach unten" aria-label="Nach unten"' + (i === ed.cards.length - 1 ? ' disabled' : '') + '>' + ico.down + '</button>' +
        '<button type="button" class="btn btn--sm dd-ic btn--danger" data-act="ed-rm" title="Karte entfernen" aria-label="Karte entfernen">' + ico.trash + '</button>' +
      '</div></div>';
  }
  function imgSlot(c, i) {
    return okImg(c.i)
      ? '<span class="dd-imgbox"><img src="' + c.i + '" alt=""><button type="button" class="dd-imgx" data-act="ed-imgx" aria-label="Bild entfernen" title="Bild entfernen">×</button></span>'
      : '<label class="dd-imgadd" title="Bild zur Karte hinzufügen">' + ico.img + '<span>Bild</span><input type="file" accept="image/*" data-ec="img" hidden></label>';
  }
  function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(220, t.scrollHeight + 2) + 'px'; }

  function parsedNow() { return window.DDParse ? window.DDParse.parse(ed.text) : { cards: [], stats: { cards: 0, warnings: 0 }, mode: 'leer' }; }
  const MODE_TXT = { zeile: 'eine Karte pro Zeile', tab: 'Spalten (Tab)', block: 'Blöcke mit Leerzeile', abwechselnd: 'abwechselnd Begriff / Definition', leer: '' };
  function paintPreview() {
    const r = parsedNow();
    const pv = root.querySelector('#ddPv'), n = root.querySelector('#ddPvN');
    if (!pv) return;
    if (n) n.textContent = r.cards.length ? '· ' + r.cards.length + (r.cards.length === 1 ? ' Karte' : ' Karten') + (r.stats.warnings ? ' · ' + r.stats.warnings + ' prüfen' : '') : '';
    if (!r.cards.length) { pv.innerHTML = '<p class="dd-empty dd-empty--s">Hier erscheinen die erkannten Karten, sobald du Text einfügst.</p>'; return; }
    const W = { 'ohne-definition': 'Definition fehlt', doppelt: 'Begriff doppelt', lang: 'zu lang' };
    pv.innerHTML = (MODE_TXT[r.mode] ? '<p class="dd-pvmode">Erkannt: ' + MODE_TXT[r.mode] + '</p>' : '') +
      '<ol class="dd-pvlist">' + r.cards.map(c =>
        '<li class="' + (c.w ? 'has-w' : '') + '"><b>' + E(c.t) + '</b><span>' + E(c.d || '—') + '</span>' + (c.w ? '<em>' + W[c.w] + '</em>' : '') + '</li>').join('') + '</ol>';
  }

  /* Text → Karten (Mode-Wechsel und Speichern). Bilder und Ids bleiben
     erhalten, wenn der Begriff derselbe ist. */
  function applyText() {
    if (ed.mode !== 'text' || !window.DDParse) return;
    const r = parsedNow();
    const byTerm = new Map(ed.cards.map(c => [sortKey(c.t), c]));
    if (r.title && !ed.title) ed.title = r.title;
    if (r.subject && !ed.subject) ed.subject = r.subject;
    if (r.topic && !ed.topic) ed.topic = r.topic;
    if (r.grade && !ed.grade) ed.grade = r.grade;
    ed.cards = r.cards.map(c => {
      const old = byTerm.get(sortKey(c.t));
      return { id: old ? old.id : newId(), t: c.t, d: c.d, i: old ? old.i : '' };
    });
    if (!ed.cards.length) ed.cards.push(blank());
  }
  function setMode(m) {
    if (m === ed.mode) return;
    if (m === 'text') {
      ed.text = window.DDParse
        ? window.DDParse.toText({ title: '', subject: '', topic: '', grade: '', cards: ed.cards.filter(c => c.t || c.d) })
        : '';
      ed.mode = 'text';
    } else {
      applyText();
      ed.mode = 'cards';
    }
    renderEdit();
  }

  /* Bild verkleinern: längste Seite 520 px, JPEG, unter 120 KB. */
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('kein Bild')); return; }
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        let max = 520, q = 0.8, out = '';
        for (let tries = 0; tries < 6; tries++) {
          const k = Math.min(1, max / Math.max(im.width, im.height));
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(im.width * k));
          cv.height = Math.max(1, Math.round(im.height * k));
          const g = cv.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
          g.drawImage(im, 0, 0, cv.width, cv.height);
          out = cv.toDataURL('image/jpeg', q);
          if (out.length <= 120000) break;
          q = Math.max(0.5, q - 0.12); max = Math.round(max * 0.8);
        }
        if (out.length > 140000) reject(new Error('zu groß')); else resolve(out);
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild nicht lesbar')); };
      im.src = url;
    });
  }

  async function saveEdit() {
    if (ed.saving) return;
    if (ed.mode === 'text') applyText();
    const cards = ed.cards.filter(c => c.t.trim() || c.d.trim() || c.i);
    const title = ed.title.trim();
    if (!title) { toast('Gib dem Stapel einen Titel.'); focusField('[data-e="title"]'); return; }
    if (!cards.length) { toast('Ein Stapel braucht mindestens eine Karte.'); return; }
    const bad = cards.findIndex(c => !c.t.trim() || !c.d.trim());
    if (bad >= 0) {
      toast('Karte ' + (bad + 1) + ': ' + (!cards[bad].t.trim() ? 'der Begriff fehlt.' : 'die Definition fehlt.'));
      if (ed.mode === 'text') { ed.mode = 'cards'; renderEdit(); }
      const row = root.querySelector('.dd-cardin[data-i="' + ed.cards.indexOf(cards[bad]) + '"]');
      if (row) { row.scrollIntoView({ block: 'center' }); const f = row.querySelector(!cards[bad].t.trim() ? 'input' : 'textarea'); if (f) f.focus(); }
      return;
    }
    ed.saving = true;
    busy(true);
    const res = await src.save({
      id: ed.id, title, subject: ed.subject.trim(), topic: ed.topic.trim(), grade: ed.grade.trim(),
      cards: cards.map(c => Object.assign({ id: c.id, t: c.t.trim(), d: c.d.trim() }, c.i ? { i: c.i } : {})) });
    busy(false);
    if (ed) ed.saving = false;
    if (!root) return;
    if (!res.ok) { toast(errMsg(res.error)); return; }
    const id = res.id || ed.id;
    delete cache[id];
    // Geteilt? Dann bekommt die Klasse mit dem neuen Titel/Kartenzahl auch einen neuen Stempel (u) und holt den Stapel neu.
    if (isTeacher && !standalone && isShared(id)) {
      const cur = sharedRaw();
      await writeShared(cur.map(e => e.id === id
        ? entryOf({ id, title, n: cards.length, subject: ed.subject.trim(), topic: ed.topic.trim(), grade: ed.grade.trim() }) : e));
    }
    toast('Gespeichert.');
    ed = null;
    go('home');
    await loadList();
    if (root && !sel.includes(id)) { sel.push(id); if (screen === 'home') renderHome(); }   // gerade bearbeitet = gleich gewählt
  }
  function focusField(sel) { const f = root.querySelector(sel); if (f) f.focus(); }

  async function cancelEdit() {
    if (!ed) return;
    const dirty = ed.dirty || (ed.mode === 'text' && ed.text !== '');
    if (dirty && !(await ctx.confirm('Änderungen verwerfen?'))) return;
    ed = null;
    go('home');
  }

  async function deleteStack() {
    if (!ed || !ed.id) return;
    if (!(await ctx.confirm('Diesen Stapel endgültig löschen? Auch für die Klasse ist er dann weg.'))) return;
    busy(true);
    const res = await src.del(ed.id);
    busy(false);
    if (!res.ok) { toast(errMsg(res.error)); return; }
    const id = ed.id;
    delete cache[id];
    if (!standalone && isShared(id)) await writeShared(sharedRaw().filter(e => e.id !== id));
    try { localStorage.removeItem('dd.p.' + id); localStorage.removeItem('dd.sum.' + id); } catch (e) { /* egal */ }
    ed = null;
    sel = sel.filter(x => x !== id);
    toast('Stapel gelöscht.');
    go('home');
    loadList();
  }

  /* ══════════════════════════════════════════════════════════════
     Ereignisse
     ══════════════════════════════════════════════════════════════ */
  function bind() {
    onClick = async (ev) => {
      // Memory: Tippen, während Karten drehen oder fliegen, überspringt das.
      if (mm && mm.wait && ev.target.closest('#ddMem') && !ev.target.closest('.dd-membar') && mmSkip()) return;
      const b = ev.target.closest('[data-act]');
      if (!b || !root.contains(b)) return;
      const act = b.dataset.act;
      const stackEl = b.closest('.dd-stack');
      const sid = stackEl && stackEl.dataset.id;
      const gameEl = b.closest('.dd-game');
      const gid = gameEl && gameEl.dataset.g;
      const cardIdx = () => { const r = b.closest('.dd-cardin'); return r ? Number(r.dataset.i) : -1; };
      switch (act) {
        case 'new': openEditor(null); break;
        case 'reload': loadList(); break;
        case 'home': go('home'); pullSums(); break;
        case 'open': openStack(sid); break;
        case 'game': startGame(gid || b.dataset.g); break;
        case 'ginfo': openInfo(gid); break;
        case 'gshare': toggleGame(gid); break;
        case 'info-x': closeInfo(); break;
        case 'info-start': if (info) startGame(info); break;
        case 'info-share': if (info) toggleGame(info); break;
        case 'edit': {
          busy(true);
          const res = await src.get(sid);
          busy(false);
          if (!res.ok) { toast(errMsg(res.error)); break; }
          openEditor({ id: res.id, title: res.title, subject: res.subject, topic: res.topic, grade: res.grade, cards: res.cards });
          break;
        }
        case 'share': toggleShare(sid); break;
        case 'focus': learn.focus = b.dataset.v; learn.cur = null; learn.recent = []; renderLearn(); break;
        case 'dir': learn.dir = b.dataset.v; store.set('dd.dir', learn.dir); learn.cur = null; renderLearn(); break;
        case 'flip': flip(); break;
        case 'rate': rate(Number(b.dataset.v)); break;
        case 'ovf': ov.f = b.dataset.v; renderOverview(); break;
        case 'ovm': ov.mode = b.dataset.v; renderOverview(); break;
        case 'cycle': cycle(b.closest('.dd-ov').dataset.cid); break;
        case 'reveal': {
          if (!ov.hide) break;
          const id = b.closest('.dd-ov').dataset.cid;
          ov.open[id] = !ov.open[id];
          b.closest('.dd-ov').classList.toggle('is-hidden', !ov.open[id]);
          break;
        }
        case 'mm-pick': memPick(b.dataset.side, Number(b.dataset.i)); break;
        case 'mm-yes': memDecide(true); break;
        case 'mm-no': memDecide(false); break;
        case 'mm-new': if (mm) { newMemory(mm.pairs, mm.players); renderMemory(); } break;
        case 'mm-players': if (mm && !mm.busy) { newMemory(mm.pairs, Number(b.dataset.v)); renderMemory(); } break;
        case 'mm-fs': memFullscreen(); break;
        case 'du-start': duStart(); break;
        case 'du-new': if (du) { newDuel(du.goal, du.size); renderDuel(); } break;
        case 'isl-round': islRound(null); break;
        case 'isl-train': if (isl && isl.selId) islRound(isl.selId); break;
        case 'isl-unsel': islSelect(null); break;
        case 'stk': toggleActive(b.dataset.id); break;
        case 'isl-tpl': islTplOpen = false; setTpl(Number(b.dataset.v)); break;
        case 'isl-tplmenu': islTplOpen = !islTplOpen; paintBar(); break;
        case 'isl-side': islToggleSide(); break;
        case 'isl-fit': islFit(true); break;
        case 'isl-opt': islPick(b.dataset.id); break;
        case 'isl-tile': islTile(b.dataset.k); break;
        case 'isl-check': islCheck(); break;
        case 'isl-skip': islGiveUp(); break;
        case 'isl-next': if (st && st.task) stNext(); else islNext(); break;
        case 'isl-close': islCloseTask(); break;
        case 'st-retry': renderStorm(); break;
        case 'st-fig': if (st && st.v) stToggleFig(Number(b.dataset.v)); break;
        case 'st-clock': if (st) { st.clockMenu = !st.clockMenu; stPaintBtns(); } break;
        case 'st-clock-set': if (st && st.v) stSetClock(Number(b.dataset.v)); break;
        case 'st-goal': stGoal(Number(b.dataset.v)); break;
        case 'st-stack': if (st && st.v) stToggleStack(b.dataset.id); break;
        case 'st-start': stStart(); break;
        case 'st-ion': if (st && st.v) stItems({ p_on: b.dataset.v === '1' }); break;
        case 'st-often': if (st && st.v) stItems({ p_often: b.dataset.v === '1' }); break;
        case 'st-item': if (st && st.v) stToggleItem(b.dataset.id); break;
        case 'st-use': stUse(Number(b.dataset.slot)); break;
        case 'st-iinfo': if (st && st.v) stItemInfo(b.dataset.id); break;
        case 'st-iinfo-x': stItemInfoClose(); break;
        case 'st-stop':
          if (st && await ctx.confirm('Kistensturm jetzt beenden? Der höchste Turm gewinnt.')) { await stCall('dd_storm_room_stop'); if (st) stPoll(); }
          break;
        case 'st-reset': if (st) { await stCall('dd_storm_room_reset'); if (st) stPoll(); } break;
        case 'ed-save': saveEdit(); break;
        case 'ed-cancel': cancelEdit(); break;
        case 'ed-del': deleteStack(); break;
        case 'ed-mode': setMode(b.dataset.v); break;
        case 'ed-add': {
          ed.cards.push(blank()); ed.dirty = true; paintEd();
          const rows = root.querySelectorAll('.dd-cardin');
          const last = rows[rows.length - 1];
          if (last) { last.scrollIntoView({ block: 'center' }); last.querySelector('input').focus(); }
          break;
        }
        case 'ed-rm': {
          const i = cardIdx(); if (i < 0) break;
          const c = ed.cards[i];
          if ((c.t || c.d) && ed.cards.length > 1 && !(await ctx.confirm('Diese Karte entfernen?'))) break;
          ed.cards.splice(i, 1); if (!ed.cards.length) ed.cards.push(blank());
          ed.dirty = true; paintEd(); break;
        }
        case 'ed-up': case 'ed-down': {
          const i = cardIdx(), j = act === 'ed-up' ? i - 1 : i + 1;
          if (i < 0 || j < 0 || j >= ed.cards.length) break;
          [ed.cards[i], ed.cards[j]] = [ed.cards[j], ed.cards[i]];
          ed.dirty = true; paintEd();
          const rows = root.querySelectorAll('.dd-cardin'); if (rows[j]) rows[j].scrollIntoView({ block: 'nearest' });
          break;
        }
        case 'ed-imgx': { const i = cardIdx(); if (i >= 0) { ed.cards[i].i = ''; ed.dirty = true; paintEd(); } break; }
        default: break;
      }
    };

    onInput = (ev) => {
      const t = ev.target;
      if (t.dataset.f !== undefined) { homeFilter[t.dataset.f] = t.value; renderHomeKeepFocus(t); return; }
      if (t.classList.contains('dd-gap')) { paintGap(t); return; }
      if (t.dataset.ov !== undefined && ov) {
        if (t.dataset.ov === 'q') { ov.q = t.value; paintOv(); }
        return;
      }
      if (!ed) return;
      if (t.dataset.e) { ed[t.dataset.e] = t.value; ed.dirty = true; return; }
      if (t.id === 'ddText') { ed.text = t.value; ed.dirty = true; paintPreview(); return; }
      if (t.dataset.ec === 't' || t.dataset.ec === 'd') {
        const i = Number(t.closest('.dd-cardin').dataset.i);
        ed.cards[i][t.dataset.ec] = t.value; ed.dirty = true;
        if (t.tagName === 'TEXTAREA') autoGrow(t);
      }
    };

    onChange = async (ev) => {
      const t = ev.target;
      if (t.dataset.ov !== undefined && ov) {
        if (t.dataset.ov === 'sort') { ov.sort = t.value; paintOv(); }
        else if (t.dataset.ov === 'hide') { ov.hide = t.checked; ov.open = {}; paintOv(); }
        return;
      }
      if (t.dataset.mm === 'pairs' && mm) {
        if (mm.busy) { t.value = mm.pairs; return; }
        newMemory(Number(t.value), mm.players); renderMemory(); return;
      }
      if ((t.dataset.du === 'goal' || t.dataset.du === 'size') && du) {
        const goal = t.dataset.du === 'goal' ? Number(t.value) : du.goal, size = t.dataset.du === 'size' ? Number(t.value) : du.size;
        newDuel(goal, size); renderDuel(); return;
      }
      if (t.id === 'ddStGoal' && st) { stGoal(0, Number(t.value)); return; }
      if (t.dataset.f === 'fach') { homeFilter.fach = t.value; renderHome(); return; }
      if (t.dataset.ec === 'img' && ed && t.files && t.files[0]) {
        const i = Number(t.closest('.dd-cardin').dataset.i);
        try {
          const url = await shrinkImage(t.files[0]);
          if (ed && ed.cards[i]) { ed.cards[i].i = url; ed.dirty = true; paintEd(); }
        } catch (e) { toast('Das Bild ging nicht: ' + (e.message || 'unbekannter Fehler') + '.'); }
      }
    };

    onKey = (ev) => {
      if (!root || ev.defaultPrevented || ev.altKey || ev.metaKey) return;
      const tag = (ev.target.tagName || '').toLowerCase();
      if (ev.key === 'Escape' && root.querySelector('#ddStIWin')) { ev.preventDefault(); stItemInfoClose(); return; }
      if (ev.key === 'Escape' && info) { ev.preventDefault(); closeInfo(); return; }
      // Stapel und Spiel-Kacheln sind keine echten Knöpfe: Enter/Leertaste wie ein Klick.
      if ((ev.key === 'Enter' || ev.key === ' ') && root.contains(ev.target) && ev.target.matches &&
          ev.target.matches('.dd-stack[data-act], .dd-game[data-act]')) {
        ev.preventDefault(); ev.target.click(); return;
      }
      if (ev.key === 'Enter' && ev.ctrlKey && ed && ed.mode === 'cards' && ev.target.dataset && ev.target.dataset.ec === 'd') {
        ev.preventDefault();
        const idx = Number(ev.target.closest('.dd-cardin').dataset.i);
        ed.cards.splice(idx + 1, 0, blank());
        ed.dirty = true;
        paintEd();
        const next = root.querySelectorAll('.dd-cardin')[idx + 1];
        if (next) { next.scrollIntoView({ block: 'center' }); next.querySelector('input').focus(); }
        return;
      }
      if (ev.key === 'Enter' && ed && ed.mode === 'cards' && ev.target.dataset && ev.target.dataset.ec === 't') {
        ev.preventDefault();
        const d = ev.target.closest('.dd-cardin').querySelector('textarea');
        if (d) d.focus();
        return;
      }
      if (screen === 'play' && opened && (opened.game === 'island' || opened.game === 'storm')) { islKey(ev, tag); return; }
      if (screen !== 'play' || !opened || opened.game !== 'cards' || !learn) return;
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (ev.key === ' ' || ev.key === 'Enter') {
        if (tag === 'button') return;     // ein fokussierter Knopf behält sein eigenes Verhalten
        ev.preventDefault(); flip();
      } else if (learn.flipped && ['1', '2', '3'].includes(ev.key)) {
        ev.preventDefault(); rate(Number(ev.key));
      }
    };

    // Memory: bei neuer Größe (Drehen, Vollbild) nur die Spalten neu wählen.
    onResize = () => { if (screen === 'play' && mm) layoutBoards(); if (screen === 'play' && isl) islResize(); if (screen === 'play' && du) duLayout(); if (screen === 'play' && st) stLayout(); };
    onFs = () => {
      const b = root && root.querySelector('.dd-fsbtn');
      if (b) b.innerHTML = fsEl() ? ico.unfull : ico.full;
      setTimeout(onResize, 60);
    };

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
  }

  /* Die Stapelliste neu zeichnen, ohne dem Suchfeld den Cursor zu nehmen. */
  function renderHomeKeepFocus(input) {
    const f = input.dataset.f, pos = input.selectionStart;
    renderHome();
    const n = root.querySelector('[data-f="' + f + '"]');
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* select */ } }
  }

  /* ══════════════════════════════════════════════════════════════
     Anmeldung beim System
     ══════════════════════════════════════════════════════════════ */
  window.MPTool.register('derby', {

    /* Nichts beim Anlegen abzufragen: was die Klasse bekommt,
       entscheidet die Lehrkraft IM Raum (Teilen). */
    settingsFields: [],

    mount(el, context) {
      root = el;
      ctx = context;
      view = null;
      demo = !!(ctx && ctx.preview);
      standalone = !!(ctx && ctx.standalone);
      isTeacher = demo ? true : ctx.role === 'presenter';
      acct = null; remoteSum = {}; pushTimer = null; dirty.clear();
      screen = 'home'; list = null; listErr = ''; cache = {}; opened = null; ed = null; learn = null; ov = null; mm = null; du = null;
      sel = jget(SEL, null); if (!Array.isArray(sel)) sel = null;
      info = null;
      homeFilter = { q: '', fach: '' };
      lastSharedKey = '';
      root.innerHTML = '<div class="dd"><div class="dd-stbanner" hidden></div><div class="dd-main"></div><div class="dd-layer"></div></div>';
      bind();
      // Die Klasse bekommt ihre Liste aus dem Raumzustand (update); erst die Lehrkraft fragt den Server.
      if (isTeacher) loadList(); else renderHome();
      pullSums();
    },

    update(v) {
      view = v;
      if (!root) return;
      const key = JSON.stringify([roomData().shared || [], roomData().games || null, roomData().isl, roomData().storm || null]);
      if (key === lastSharedKey) return;
      stBanner();
      lastSharedKey = key;
      // Die Lehrkraft hat eine andere Insel gewählt: neu bauen (nicht mitten in einer Aufgabe).
      if (screen === 'play' && opened && opened.game === 'island' && isl && isl.wc && !isl.round && isl.tpl !== islTpl()) renderIsland();
      // Die Liste der Klasse ist die geteilte Liste — neu holen und zeichnen,
      // aber nur auf der Startseite (mitten im Spiel oder Tippen bleibt alles stehen).
      if (!isTeacher) list = sharedList();
      if (screen === 'home' && (list || !isTeacher)) renderHome();
      if (info) {
        if (!isTeacher && !gameShared(info)) info = null;
        renderInfo();
      }
    },

    unmount() {
      if (root) {
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onChange);
      }
      if (onKey) document.removeEventListener('keydown', onKey);
      if (onResize) window.removeEventListener('resize', onResize);
      if (onFs) { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); }
      if (pushTimer) pushProg();          // letzter Stand noch zum Konto, bevor alles abgeräumt wird
      islStop();
      duStop();
      stStop();
      if (fsEl()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* egal */ } }
      onKey = onClick = onInput = onChange = onResize = onFs = null;
      root = null; ctx = null; view = null; opened = null; ed = null; learn = null; ov = null; mm = null; du = null; list = null; cache = {};
      sel = null; info = null;
    }
  });
})();
