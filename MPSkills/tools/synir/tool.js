/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „SYNIR"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Ein Netzwerksimulator im Raum. Die Anwendung selbst liegt
   daneben (index.html + js/) und läuft auch für sich; hier steht
   nur, was der RAUM dazutut.

   ── Warum ein <iframe> wie bei Wild Clusters ──────────────────
   SYNIR sind 28 Skripte mit globalen Namen und ein eigenes
   Stylesheet von 3500 Zeilen. In eine einzige tool.js portiert,
   stünde jede Zeile davon in der MPSkills-Seite — und jeder
   Umbau am Simulator wäre ein Umbau hier. Eingerahmt bleibt der
   Simulator ein Ordner, der auch ohne Raum geht, und diese Datei
   ist die Tür: sie spricht mit dem Server und schickt Befehle in
   den Rahmen (js/bruecke.js ist die Gegenseite).

   ── Was der Raum tut ─────────────────────────────────────────
   · Szenarien: die Lehrkraft gibt frei (skill_room_state.data
     .shared), die Tablets sehen nur das Freigegebene. Mitgelieferte
     tragen „builtin:<schlüssel>" und kommen aus dem Rahmen selbst;
     eigene (synir_scenarios, Migration 0180) hängen an der
     Lehrkraft und überleben den Raum.
   · „Neues Szenario verfügbar" auf dem Tablet, sobald etwas
     dazukommt.
   · Stand der Klasse + Spiegelung auf den Beamer (synir_work):
     jedes Tablet meldet seinen Stand gebremst, die Lehrkraft tippt
     eine Person an und sieht mit. Tut sie selbst etwas, wird es
     ihre Kopie (die Brücke meldet `selbst`).
   · Blind: data.blind legt auf jedem Tablet den Schleier auf, und
     synir_work_put lehnt ab, solange er liegt.
   · Das Class Wide Web (Migration 0181): jedes Tablet bekommt beim
     Öffnen ein /8 (die Lehrkraft 100), und solange ein cww auf der
     Fläche liegt, tauscht es Pakete mit dem Server — alle 0,7 s,
     solange etwas fließt, sonst alle 3 s. Die Lehrkraft sieht unter
     „Internet der Klasse", welches /8 wem gehört; die Klasse nicht.
   · Die Karte (Knopf „Karte"): großer Netzplan der ganzen Klasse —
     die Wolke in der Mitte, je Schülernetz ein Kabel, Farbe und
     Adressbereich je Subnetz, Geräte klein wie im Netzwerkplan.
     Zoombar und verschiebbar; die Daten kommen aus Abfragen, die es
     schon gibt (synir_cww_karte, synir_work_list/-get).

   ⚠️ Wer tool.js oder tool.css anfasst, zieht den Cache-Stempel in
   MPSkills/lib/tool.js hoch — und wer an index.html oder js/
   arbeitet, zusätzlich `V` hier UND die ?v= in index.html.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '?v=20261002m';
  const TAKT_MS = 3000;          // Stand der Klasse / Spiegelung
  const GAP = 12;
  const MIN = 440;

  let root = null, ctx = null, view = null, frame = null;
  let bridgeReady = false;
  let onMsg = null, onResize = null;
  let code = null;

  let eigene = [];               // Lehrkraft: [{ id, titel }]
  let lastMenue = '';
  let lastBlind = null;
  let bekannte = null;           // Tablet: Set der freigegebenen IDs
  let lastErr = '';

  let listOpen = false;
  let work = [];                 // synir_work_list
  let workTimer = 0;
  let watch = null;              // { pid, name, since }
  let takeover = null;           // Name, wenn die Lehrkraft übernommen hat

  /* Das Class Wide Web. `raus` sammelt, was der Rahmen hinaus
     schickt, bis der nächste Tausch es mitnimmt; `namen` ist die
     Liste für 8.8.8.8, solange sie noch nicht beim Server ist. */
  const CWW_SCHNELL = 700, CWW_RUHIG = 3000, CWW_NACHLAUF = 6;
  let cww = null;                // { conf, raus, namen, aktiv, timer, busy, nachlauf }
  let cwwOpen = false;           // Lehrkraft: Liste „Internet der Klasse"
  let karte = [];

  const isPresenter = () => !!ctx && ctx.role === 'presenter';
  const $ = (id) => root && root.querySelector('#' + id);

  function data() { return (view && view.state && view.state.data) || {}; }
  function sharedList() {
    const s = data().shared;
    return Array.isArray(s) ? s.filter(x => x && typeof x.id === 'string') : [];
  }

  /* Auch im Schaufenster über ctx.actions: dort beantwortet das
     Drehbuch die Aufrufe selbst (preview/synir.js, show.server). */
  async function call(fn, args) {
    if (!ctx) return { ok: false, error: 'network' };
    return ctx.actions.call(fn, args || {});
  }

  function fehler(res) {
    if (!res || res.ok) return;
    if (res.error === 'network' || res.error === 'unknown_fn') return;
    if (res.error === lastErr) return;
    lastErr = res.error;
    setTimeout(() => { if (lastErr === res.error) lastErr = ''; }, 8000);
    ctx.toast(ctx.errText(res.error));
  }

  /* ══════════════════════════════════════════════════════════
     Befehle in den Rahmen
     ══════════════════════════════════════════════════════════ */

  function post(cmd) {
    if (!frame || !frame.contentWindow || !bridgeReady) return;
    cmd.type = 'synir:cmd';
    try { frame.contentWindow.postMessage(cmd, location.origin); } catch (e) { /* zu */ }
  }

  function pushMenue() {
    const list = sharedList();
    const menue = {
      shared: list.map(x => x.id),
      sharedListe: list.map(x => ({ id: x.id, titel: x.t || 'Szenario' }))
    };
    if (isPresenter()) menue.private = eigene;
    const key = JSON.stringify(menue);
    if (key === lastMenue) return;
    lastMenue = key;
    post({ menue });
  }

  function pushBlind() {
    if (isPresenter()) return;
    const b = !!data().blind;
    if (b === lastBlind) return;
    lastBlind = b;
    post({ blind: b });
  }

  function pushAll() {
    lastMenue = '';
    lastBlind = null;
    pushMenue();
    pushBlind();
  }

  /* ══════════════════════════════════════════════════════════
     Raumzustand schreiben (nur Lehrkraft)
     ══════════════════════════════════════════════════════════
     skill_room_set_state ersetzt `data` als GANZES — deshalb geht
     hier immer der vollständige Zustand hinaus, mit der einen
     Änderung darin. Er wird auch gleich lokal eingesetzt: das Menü
     soll im selben Augenblick grün werden, nicht nach dem nächsten
     Takt. */
  async function setData(patch) {
    const next = Object.assign({}, data(), patch);
    if (view) view.state = Object.assign({}, view.state || {}, { data: next });
    pushMenue();
    paintDesk();
    const res = await ctx.actions.setData(next);
    fehler(res);
    ctx.refresh();
    return res;
  }

  async function share(id, an, titel) {
    let list = sharedList().filter(x => x.id !== id);
    if (an) list.push({ id, t: String(titel || 'Szenario').slice(0, 80) });
    await setData({ shared: list });
  }

  async function loadEigene() {
    if (!isPresenter()) return;
    const res = await call('synir_scenarios_list');
    if (!res.ok) { fehler(res); return; }
    eigene = (res.items || []).map(i => ({ id: i.id, titel: i.title }));
    /* Freigegeben, aber nicht mehr da (anderswo gelöscht, oder ein
       Löschen, dessen Freigabe nicht mehr zurückkam): aus der Liste
       der Klasse nehmen — sonst steht auf den Tablets ein Eintrag,
       der beim Antippen nur noch „nicht gefunden" sagt. */
    const da = new Set(eigene.map(x => x.id));
    const list = sharedList();
    const rest = list.filter(x => x.id.indexOf('builtin:') === 0 || da.has(x.id));
    if (rest.length !== list.length) await setData({ shared: rest });
    else pushMenue();
  }

  /* Löschen nimmt das Szenario auch aus der Klasse: es verschwindet
     aus dem Menü jedes Tablets. Wer es gerade offen hat, behält sein
     Netz auf der Fläche — gelöscht wird nur der Eintrag, nicht die
     Arbeit. Die Freigabe geht ZUERST zurück: kommt die Antwort des
     Servers nicht an, bleibt sonst ein toter Eintrag stehen.
     `not_found` heißt: schon weg — dann ebenso aufräumen. */
  async function loeschen(id) {
    if (sharedList().some(x => x.id === id)) await share(id, false);
    const res = await call('synir_scenario_delete', { p_id: id });
    if (!res.ok && res.error !== 'not_found') { fehler(res); return; }
    eigene = eigene.filter(x => x.id !== id);
    pushMenue();
    post({ toast: 'Szenario gelöscht.' });
  }

  /* Ein Stand als Szenario. Der Aufgabentext hat seine eigene
     Spalte und die Kennung des alten Szenarios gehört nicht
     hinein — beides wird aus dem Netz genommen. Die Überschrift
     des Auftrags (`titel`) bleibt drin: sie ist nicht der Name im
     Menü, sondern der Kopf der Karte. */
  async function alsSzenario(o) {
    const netz = Object.assign({}, o.stand || {});
    delete netz.szenario;
    delete netz.aufgabe;
    netz.titel = o.titel || o.name;
    if (JSON.stringify(netz).length > 280000 && netz.blobs) {
      delete netz.blobs;
      post({ toast: 'Hochgeladene Dateien sind zu groß für ein Szenario und wurden weggelassen.' });
    }
    const res = await call('synir_scenario_save', {
      p_id: o.id || null, p_title: o.name, p_aufgabe: o.aufgabe || '', p_netz: netz
    });
    if (!res.ok) { fehler(res); return; }
    post({ gespeichert: { id: res.id }, toast: 'Gespeichert unter „Eigene": ' + o.name });
    await loadEigene();
    // Ist es schon freigegeben, zieht der Name in der Klasse mit.
    const s = sharedList().find(x => x.id === res.id);
    if (s && s.t !== o.name) await share(res.id, true, o.name);
  }

  /* Ein Szenario, das nicht im Rahmen liegt, vom Server holen. */
  async function holen(id) {
    const res = isPresenter()
      ? await call('synir_scenario_get', { p_id: id })
      : await call('synir_shared_get', { p_id: id });
    if (!res.ok) { fehler(res); return; }
    const netz = res.netz || {};
    post({ laden: { id: res.id, titel: netz.titel || res.title, aufgabe: res.aufgabe || '', netz } });
  }

  /* ══════════════════════════════════════════════════════════
     Stand der Klasse und Spiegelung (nur Lehrkraft)
     ══════════════════════════════════════════════════════════ */

  function takt() {
    clearTimeout(workTimer);
    workTimer = 0;
    if (!isPresenter() || !(listOpen || watch || cwwOpen || mapOpen)) return;
    workTimer = setTimeout(async () => {
      await tick();
      takt();
    }, TAKT_MS);
  }

  async function tick() {
    if (listOpen) {
      const res = await call('synir_work_list');
      if (res.ok) { work = res.items || []; paintPeople(); }
    }
    if (watch) await holeWatch();
    if (mapOpen) await holeMap();
    else if (cwwOpen) await holeKarte();
  }

  async function holeWatch() {
    const w = watch;
    if (!w) return;
    const res = await call('synir_work_get', { p_participant: w.pid, p_since: w.since || null });
    if (watch !== w) return;               // inzwischen beendet
    if (!res.ok) { fehler(res); return; }
    if (!res.changed) return;
    w.since = res.updated_at;
    post({ watch: { name: w.name, stand: res.stand } });
  }

  function zusehen(pid, name) {
    if (watch && watch.pid === pid) { zuseheEnde(); return; }
    watch = { pid, name, since: null };
    takeover = null;
    holeWatch();
    takt();
    paintDesk();
    paintPeople();
  }

  function zuseheEnde() {
    if (watch) post({ watch: null });
    watch = null;
    takeover = null;
    takt();
    paintDesk();
    paintPeople();
  }

  /* ══════════════════════════════════════════════════════════
     Das Class Wide Web
     ══════════════════════════════════════════════════════════ */

  function cwwNeu() {
    return { conf: null, raus: [], namen: null, aktiv: false, timer: 0, busy: false, nachlauf: 0 };
  }

  /* Einmal je Rahmen: welches /8 habe ich? Fehlt die Migration auf
     dem Server, bleibt SYNIR einfach ohne Internet — das cww läuft
     dann im Übungsbetrieb, und niemand bekommt eine Fehlermeldung
     über etwas, das er nicht benutzt hat. */
  async function cwwAnmelden() {
    if (!ctx || ctx.preview) return;
    if (!cww) cww = cwwNeu();
    const res = await call(isPresenter() ? 'synir_cww_anmelden_lehrer' : 'synir_cww_anmelden');
    if (!cww) return;
    if (!res.ok) {
      if (res.error === 'fn_missing') console.warn('[synir] Migration 0181 fehlt — cww ohne Raum.');
      else if (res.error === 'cww_voll') post({ toast: 'Das Class Wide Web ist voll — alle 100 Adressbereiche sind vergeben.' });
      else fehler(res);
      return;
    }
    cww.conf = { prefix: res.prefix, backbone: res.backbone };
    post({ cwwNetz: cww.conf });
    cwwPlanen(0);
  }

  function cwwPlanen(ms) {
    if (!cww || !cww.conf) return;
    clearTimeout(cww.timer);
    cww.timer = setTimeout(cwwTick, ms);
  }

  async function cwwTick() {
    const c = cww;
    if (!c || !c.conf || c.busy) return;
    /* Ohne cww auf der Fläche und ohne etwas zu sagen: nur
       nachsehen, nicht fragen. Ein Reiter im Hintergrund fragt gar
       nicht — dann gilt das Tablet nach 20 s als weg, und genau das
       ist es ja auch. */
    if (document.hidden || (!c.aktiv && !c.raus.length && !c.namen)) { cwwPlanen(CWW_RUHIG); return; }

    // Höchstens 200 Pakete und rund 280 KB je Tausch; der Rest geht beim nächsten.
    const mit = [];
    let groesse = 0;
    while (c.raus.length && mit.length < 200) {
      const len = JSON.stringify(c.raus[0]).length;
      if (mit.length && groesse + len > 280000) break;
      groesse += len;
      mit.push(c.raus.shift());
    }
    const namen = c.namen;
    c.namen = null;
    c.busy = true;
    const res = await call(isPresenter() ? 'synir_cww_tausch_lehrer' : 'synir_cww_tausch',
      { p_raus: mit.length ? mit : null, p_namen: namen });
    c.busy = false;
    if (cww !== c) return;

    if (!res.ok) {
      if (namen && !c.namen) c.namen = namen;     // beim nächsten Mal noch einmal
      if (res.error !== 'blind' && res.error !== 'blocked' && res.error !== 'network') fehler(res);
      cwwPlanen(CWW_RUHIG);
      return;
    }
    post({ cwwRein: {
      pakete: res.pakete || [], unzustellbar: res.unzustellbar || [],
      verzeichnis: res.verzeichnis || [], vergeben: res.vergeben || [],
      bereiche: res.bereiche || []
    } });
    const verkehr = mit.length || (res.pakete && res.pakete.length) || c.raus.length;
    c.nachlauf = verkehr ? CWW_NACHLAUF : Math.max(0, c.nachlauf - 1);
    cwwPlanen(c.raus.length ? 0 : c.nachlauf ? CWW_SCHNELL : CWW_RUHIG);
  }

  function cwwVomRahmen(m) {
    if (!cww) return;
    if (Array.isArray(m.pakete) && m.pakete.length) {
      for (const p of m.pakete) cww.raus.push(p);
      // Nicht grenzenlos: was ein Tablet in einer Sekunde nicht
      // loswird, ist ein Kreis im Netz und kein Gespräch.
      if (cww.raus.length > 1000) cww.raus.splice(0, cww.raus.length - 1000);
    }
    if (Array.isArray(m.namen)) cww.namen = m.namen;
    cww.aktiv = !!m.aktiv;
    if (!cww.busy && (cww.raus.length || cww.namen)) cwwPlanen(cww.raus.length ? 0 : 50);
  }

  async function holeKarte() {
    const res = await call('synir_cww_karte');
    if (res.ok) { karte = res.items || []; paintKarte(); }
  }

  /* ══════════════════════════════════════════════════════════
     Die Karte (nur Lehrkraft)
     ══════════════════════════════════════════════════════════
     Ein reduzierter Plan des ganzen Netzes: in der Mitte die Wolke
     des Class Wide Web, von ihr geht je Schülernetz EIN Kabel ab.
     Jedes Netz trägt seine Farbe, darüber steht der Adressbereich
     (das Subnetz), und die Geräte sind klein wie im Netzwerkplan —
     ohne die Bilder aus dem Simulator.

     Woher die Daten kommen: `synir_cww_karte` sagt, welches /8 wem
     gehört; `synir_work_list` / `synir_work_get` liefern den Stand
     jedes Tablets (Geräte, Kabel, Adressen). Beides gibt es schon
     für „Stand der Klasse" und „Internet der Klasse" — die Karte
     braucht keine neue Migration. Zusammengeführt wird über den
     Namen, den beide Abfragen aus derselben Stelle nehmen.

     ⚠️ Adressen, die per DHCP kommen, stehen NICHT im gespeicherten
     Stand (siehe netz.js toJSON). Das Subnetz solcher Geräte wird
     deshalb aus ihrer Umgebung gelesen: dem Gerät am anderen Ende
     des Kabels, durch Switches hindurch, oder dem DHCP-Bereich. */

  let mapOpen = false;
  const mapStand = new Map();            // Teilnehmer → { updated_at, stand }
  let mapGeo = null;                     // { minx, miny, maxx, maxy } der letzten Zeichnung
  let mapKey = '';
  const mapView = { x: 0, y: 0, k: 1, fitted: false };
  let mapKeyFn = null;
  let lehrerStand = null;                // eigener Stand der Lehrkraft, vom Rahmen gemeldet

  const PAL = ['#2f80ed', '#e0592a', '#2a9d5c', '#9b51e0', '#d4a017',
               '#0e9aa7', '#d6336c', '#6b7f1a', '#5c6bc0', '#c2571a'];
  const KZ = { host: 'E', switch: 'SW', router: 'R', heimrouter: 'HR', server: 'S', handy: 'H', cww: 'CWW' };

  const ip2n = (s) => {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s || '').trim());
    if (!m) return null;
    const p = m.slice(1).map(Number);
    if (p.some(x => x > 255)) return null;
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  };
  const n2ip = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  function netKey(ip, mask) {
    const a = ip2n(ip), m = ip2n(mask);
    if (a === null || m === null) return null;
    let len = 0;
    for (let i = 31; i >= 0 && ((m >>> i) & 1); i--) len++;
    const bits = len === 0 ? 0 : (0xFFFFFFFF << (32 - len)) >>> 0;
    return n2ip((a & bits) >>> 0) + '/' + len;
  }
  function kurzName(n) {
    const k = KZ[n.kind] || '?';
    const m = /(\d+)\s*$/.exec(String(n.name || ''));
    return k + (m ? m[1] : '');
  }

  /* Alle Subnetze, in denen ein Gerät selbst eine Adresse hat. Die
     Internet-Karte des cww (Karte 0) zählt nicht — sie gehört der
     Wolke, nicht dem Netz des Kindes. */
  function eigeneNetze(n) {
    const out = [];
    for (const k of (n.nics || [])) {
      if (n.kind === 'cww' && k.i === 0) continue;
      const x = k.ip && k.mask ? netKey(k.ip, k.mask) : null;
      if (x && out.indexOf(x) < 0) out.push(x);
    }
    return out;
  }
  function dhcpNetz(n) {
    const d = n.dhcpServer;
    return d && d.mask && (d.von || d.bis) ? netKey(d.von || d.bis, d.mask) : null;
  }

  /* Ein Netz aus dem Stand eines Tablets: Geräte mit Lage, Kabel,
     und je Gerät das Subnetz, in dem es sitzt (`sn`, oder null bei
     Geräten, die zwischen Netzen stehen). */
  function analysiere(stand) {
    const nodes = ((stand && stand.nodes) || []).filter(n => n && n.id != null && isFinite(+n.x) && isFinite(+n.y));
    const byId = new Map(nodes.map(n => [n.id, n]));
    const kabel = [];
    const nachbarn = new Map(nodes.map(n => [n.id, []]));   // id → [{ o, oi }]
    for (const c of ((stand && stand.cables) || [])) {
      if (!c || !c.a || !c.b || !byId.has(c.a.node) || !byId.has(c.b.node)) continue;
      kabel.push([c.a.node, c.b.node]);
      nachbarn.get(c.a.node).push({ o: byId.get(c.b.node), oi: c.b.nic });
      nachbarn.get(c.b.node).push({ o: byId.get(c.a.node), oi: c.a.nic });
    }

    const netVonNachbar = (start) => {
      const gesehen = new Set([start.id]);
      const q = [start];
      while (q.length) {
        const cur = q.shift();
        for (const nb of nachbarn.get(cur.id)) {
          const o = nb.o;
          if (o.kind === 'switch') {
            if (!gesehen.has(o.id)) { gesehen.add(o.id); q.push(o); }
            continue;
          }
          const k = (o.nics || [])[nb.oi];
          const x = k && k.ip && k.mask ? netKey(k.ip, k.mask) : dhcpNetz(o);
          if (x) return x;
        }
      }
      return null;
    };

    for (const n of nodes) {
      const eigen = eigeneNetze(n);
      const zwischen = n.kind === 'router' || n.kind === 'cww';
      n.sn = zwischen ? null
        : eigen.length ? eigen[0]
        : (n.kind === 'switch' || !n.nics || !n.nics.some(k => k.ip)) ? netVonNachbar(n) : null;
    }
    const netze = [];
    for (const n of nodes) if (n.sn && netze.indexOf(n.sn) < 0) netze.push(n.sn);
    // Router: seine Netze mit aufzählen, damit der Bereich auch dann
    // dasteht, wenn nur ein Router Adressen trägt.
    for (const n of nodes) if (n.kind === 'router') for (const x of eigeneNetze(n)) if (netze.indexOf(x) < 0) netze.push(x);
    netze.sort((a, b) => ip2n(a.split('/')[0]) - ip2n(b.split('/')[0]));
    return { nodes, kabel, netze };
  }

  /* Ein Kästchen der Karte samt Innenleben, in eigenen Koordinaten
     (0,0 = links oben). Die Geräte behalten ihre Lage aus dem
     Simulator, nur skaliert — so erkennt ein Kind sein Netz wieder. */
  function baueCluster(k, idx, w, live) {
    const a = w ? analysiere(w) : null;
    const farbe = PAL[idx % PAL.length];
    const c = { k, idx, farbe, a, live, w: 260, h: 120, cwwPos: null, teile: '' };
    if (!a || !a.nodes.length) return c;

    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const n of a.nodes) {
      minx = Math.min(minx, +n.x); maxx = Math.max(maxx, +n.x);
      miny = Math.min(miny, +n.y); maxy = Math.max(maxy, +n.y);
    }
    let dmin = Infinity;
    for (let i = 0; i < a.nodes.length; i++)
      for (let j = i + 1; j < a.nodes.length; j++)
        dmin = Math.min(dmin, Math.hypot(a.nodes[i].x - a.nodes[j].x, a.nodes[i].y - a.nodes[j].y));
    const bw = Math.max(1, maxx - minx), bh = Math.max(1, maxy - miny);
    const fit = Math.min(520 / bw, 300 / bh);
    const need = isFinite(dmin) ? 66 / Math.max(dmin, 1) : 1;
    const s = Math.min(fit, Math.max(need, 0.2), 1.2);
    // Kopf: eine Zeile je Adressbereich (höchstens vier), dann Name.
    const zeilen = Math.max(1, Math.min(4, a.netze.length));
    const PADX = 40, PADT = 22 + 21 * zeilen + 34, PADB = 34;
    c.w = Math.max(230, Math.round(bw * s) + 2 * PADX);
    c.h = Math.round(bh * s) + PADT + PADB;
    const ox = (c.w - bw * s) / 2, oy = PADT;
    const pos = new Map();
    for (const n of a.nodes) pos.set(n.id, { x: ox + (n.x - minx) * s, y: oy + (n.y - miny) * s });
    const cww = a.nodes.find(n => n.kind === 'cww');
    if (cww) c.cwwPos = pos.get(cww.id);
    c.pos = pos;
    return c;
  }

  const neutral = 'var(--ink-soft, #667)';

  function iconSvg(kind, col) {
    const st = 'fill="var(--surface, #fff)" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
    switch (kind) {
      case 'server':
        return '<rect x="-8" y="-10" width="16" height="6" rx="1.5" ' + st + '/><rect x="-8" y="-3" width="16" height="6" rx="1.5" ' + st + '/><rect x="-8" y="4" width="16" height="6" rx="1.5" ' + st + '/>';
      case 'switch':
        return '<rect x="-11" y="-5" width="22" height="10" rx="2" ' + st + '/><path d="M-6 0h.1M-2 0h.1M2 0h.1M6 0h.1" stroke="' + col + '" stroke-width="2.4" stroke-linecap="round"/>';
      case 'router':
        return '<circle r="10" ' + st + '/><path d="M-5 0h10M2 -3l3 3-3 3M-2 -3l-3 3 3 3" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
      case 'heimrouter':
        return '<rect x="-11" y="-3" width="22" height="10" rx="2" ' + st + '/><path d="M-6 -3l-2-7M6 -3l2-7" stroke="' + col + '" stroke-width="2" stroke-linecap="round"/>';
      case 'handy':
        return '<rect x="-5.5" y="-10" width="11" height="20" rx="2.5" ' + st + '/><path d="M-1.5 6.5h3" stroke="' + col + '" stroke-width="1.8" stroke-linecap="round"/>';
      case 'cww':
        return '<path d="M-9 5a5 5 0 0 1 .5-9.5a6.5 6.5 0 0 1 12 1.5a4.5 4.5 0 0 1 .5 8z" ' + st + '/>';
      default:   // host
        return '<rect x="-9" y="-9" width="18" height="12" rx="2" ' + st + '/><path d="M-5 8h10M0 3v5" stroke="' + col + '" stroke-width="2" stroke-linecap="round"/>';
    }
  }

  function malCluster(c, x, y) {
    const esc = ctx.esc;
    let h = '<g transform="translate(' + Math.round(x) + ' ' + Math.round(y) + ')" class="sy-mp-cl' + (c.live ? '' : ' is-off') + '">';
    h += '<rect class="sy-mp-box" width="' + c.w + '" height="' + c.h + '" rx="14" style="stroke:' + c.farbe + ';fill:' + c.farbe + '16"/>';
    // Kopf: die Adressbereiche zuerst — darüber wird das Netz erkannt.
    const netze = c.a ? c.a.netze : [];
    const zeilen = Math.max(1, Math.min(4, netze.length));
    if (netze.length) {
      netze.slice(0, 4).forEach((x2, j) => {
        const mehr = j === 3 && netze.length > 4 ? '  … +' + (netze.length - 3) : '';
        h += '<text class="sy-mp-ip" x="14" y="' + (26 + j * 21) + '"><tspan fill="' + PAL[(c.idx + j) % PAL.length]
          + '">● </tspan>' + esc(x2 + mehr) + '</text>';
      });
    } else {
      h += '<text class="sy-mp-ip sy-mp-dim" x="14" y="26">kein Adressbereich</text>';
    }
    const ny = 26 + zeilen * 21 + 4;
    h += '<text class="sy-mp-name" x="14" y="' + ny + '">' + esc(c.k.name || '—') + '</text>';
    h += '<text class="sy-mp-dim sy-mp-r" x="' + (c.w - 14) + '" y="' + ny + '" text-anchor="end">' + esc(c.k.prefix + '.0.0.0/8') + '</text>';

    if (!c.a || !c.a.nodes.length) {
      h += '<text class="sy-mp-dim" x="' + c.w / 2 + '" y="' + (c.h - 26) + '" text-anchor="middle">'
        + (c.k.name === 'Lehrkraft' ? 'Netz der Lehrkraft nicht abrufbar' : 'noch nichts gebaut') + '</text>';
      return h + '</g>';
    }
    const farbeVon = (n) => {
      if (!n.sn) return neutral;
      const j = c.a.netze.indexOf(n.sn);
      return PAL[(c.idx + Math.max(0, j)) % PAL.length];
    };
    const byId = new Map(c.a.nodes.map(n => [n.id, n]));
    for (const [p, q] of c.a.kabel) {
      const A = byId.get(p), B = byId.get(q), pa = c.pos.get(p), pb = c.pos.get(q);
      const gleich = A.sn && A.sn === B.sn;
      h += '<line class="sy-mp-wire" x1="' + pa.x.toFixed(1) + '" y1="' + pa.y.toFixed(1) + '" x2="' + pb.x.toFixed(1)
        + '" y2="' + pb.y.toFixed(1) + '" style="stroke:' + (gleich ? farbeVon(A) : neutral) + '"/>';
    }
    for (const n of c.a.nodes) {
      const p = c.pos.get(n.id);
      const ip = (n.nics || []).filter(k => k.ip && !(n.kind === 'cww' && k.i === 0)).map(k => k.ip)[0];
      h += '<g transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')">'
        + iconSvg(n.kind, farbeVon(n))
        + '<text class="sy-mp-lbl" y="22" text-anchor="middle">' + esc(kurzName(n)) + '</text>'
        + (ip ? '<text class="sy-mp-ipl" y="31" text-anchor="middle">' + esc(ip) + '</text>' : '')
        + '</g>';
    }
    return h + '</g>';
  }

  /* Die Cluster auf Ringen um die Wolke, danach auseinander
     geschoben, bis sich keine zwei Kästchen mehr berühren. */
  function ordne(cs) {
    const CW = 330, CH = 210;                 // die Wolke (gesperrt)
    const gap = 28;
    const n = cs.length;
    const maxw = cs.reduce((m, c) => Math.max(m, c.w), 0);
    const maxh = cs.reduce((m, c) => Math.max(m, c.h), 0);
    let i = 0, ring = 0;
    while (i < n) {
      const r = 300 + (Math.max(maxw, maxh) * 0.5) + ring * (maxh + 90);
      const cap = Math.max(4, Math.floor((2 * Math.PI * r * 1.25) / (maxw + gap)));
      const anz = Math.min(cap, n - i);
      for (let j = 0; j < anz; j++, i++) {
        const ang = -Math.PI / 2 + (j / anz) * 2 * Math.PI + (ring % 2 ? Math.PI / anz : 0);
        cs[i].cx = Math.cos(ang) * r * 1.25;
        cs[i].cy = Math.sin(ang) * r;
      }
      ring++;
    }
    for (let it = 0; it < 120; it++) {
      let bewegt = false;
      for (let a = 0; a < n; a++) {
        const A = cs[a];
        // gegen die Wolke
        let dx = A.cx, dy = A.cy;
        let ox = (A.w + CW) / 2 + gap - Math.abs(dx), oy = (A.h + CH) / 2 + gap - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) A.cx += (dx >= 0 ? 1 : -1) * ox; else A.cy += (dy >= 0 ? 1 : -1) * oy;
          bewegt = true;
        }
        for (let b = a + 1; b < n; b++) {
          const B = cs[b];
          dx = B.cx - A.cx; dy = B.cy - A.cy;
          ox = (A.w + B.w) / 2 + gap - Math.abs(dx);
          oy = (A.h + B.h) / 2 + gap - Math.abs(dy);
          if (ox > 0 && oy > 0) {
            bewegt = true;
            if (ox < oy) { const s = (dx >= 0 ? 1 : -1) * ox / 2; A.cx -= s; B.cx += s; }
            else { const s = (dy >= 0 ? 1 : -1) * oy / 2; A.cy -= s; B.cy += s; }
          }
        }
      }
      if (!bewegt) break;
    }
  }

  function wolkeSvg() {
    return '<g class="sy-mp-cloud">'
      + '<path transform="translate(46 -8)" d="M-120 60c-42 0-70-22-70-54 0-30 26-52 58-50 8-42 46-68 88-60 30 6 50 24 58 48 40-12 84 12 84 48 0 40-32 68-78 68z" />'
      + '<text class="sy-mp-cl1" y="-6" text-anchor="middle">Class Wide Web</text>'
      + '<text class="sy-mp-cl2" y="22" text-anchor="middle">das Internet der Klasse</text>'
      + '</g>';
  }

  function baueKarte() {
    const sorted = karte.slice().sort((a, b) => a.prefix - b.prefix);
    const cs = sorted.map((k, i) => {
      const w = work.find(x => x.name === k.name);
      const s = w ? mapStand.get(w.participant)
              : k.name === 'Lehrkraft' && lehrerStand ? { stand: lehrerStand } : null;
      const live = !!(k.seen_at && (Date.now() - new Date(k.seen_at).getTime()) < 20000);
      return baueCluster(k, i, s ? s.stand : null, live);
    });
    ordne(cs);
    let minx = -190, miny = -110, maxx = 190, maxy = 110;
    let kabel = '', boxen = '';
    for (const c of cs) {
      const x = c.cx - c.w / 2, y = c.cy - c.h / 2;
      minx = Math.min(minx, x); miny = Math.min(miny, y);
      maxx = Math.max(maxx, x + c.w); maxy = Math.max(maxy, y + c.h);
      // Das Kabel geht nur zum cww des Netzes. Ohne cww hängt das Netz
      // nicht an der Wolke — dann gibt es kein Kabel.
      if (c.cwwPos) {
        const ex = x + c.cwwPos.x, ey = y + c.cwwPos.y;
        kabel += '<line class="sy-mp-cable' + (c.live ? '' : ' is-off') + '" x1="0" y1="0" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1)
          + '" style="stroke:' + c.farbe + '"/>';
      }
      boxen += malCluster(c, x, y);
    }
    mapGeo = { minx, miny, maxx, maxy };
    return { svg: kabel + wolkeSvg() + boxen, n: cs.length };
  }

  function malKarte() {
    const g = $('syMapG');
    if (!g || !mapOpen) return;
    const sub = $('syMapSub');
    if (!karte.length) {
      g.innerHTML = '';
      mapKey = '';
      $('syMapEmpty').hidden = false;
      if (sub) sub.textContent = '';
      return;
    }
    $('syMapEmpty').hidden = true;
    const r = baueKarte();
    if (sub) sub.textContent = r.n + (r.n === 1 ? ' Netz' : ' Netze');
    if (r.svg !== mapKey) { mapKey = r.svg; g.innerHTML = r.svg; }
    if (!mapView.fitted) mapAnpassen();
  }

  /* Zoom und Verschieben: ein Umrechnungsfeld (x, y, k) auf der
     Zeichengruppe. Rad und Zwei-Finger-Geste zoomen um die Stelle
     unter dem Zeiger, Ziehen verschiebt. */
  function mapSetzen() {
    const g = $('syMapG');
    if (g) g.setAttribute('transform', 'translate(' + mapView.x.toFixed(1) + ' ' + mapView.y.toFixed(1) + ') scale(' + mapView.k.toFixed(4) + ')');
  }
  function mapAnpassen() {
    const v = $('syMapView');
    if (!v || !mapGeo) return;
    const w = v.clientWidth, h = v.clientHeight;
    if (!w || !h) return;
    const bw = mapGeo.maxx - mapGeo.minx, bh = mapGeo.maxy - mapGeo.miny;
    const k = Math.max(0.05, Math.min(3, Math.min(w / (bw + 80), h / (bh + 80))));
    mapView.k = k;
    mapView.x = w / 2 - ((mapGeo.minx + mapGeo.maxx) / 2) * k;
    mapView.y = h / 2 - ((mapGeo.miny + mapGeo.maxy) / 2) * k;
    mapView.fitted = true;
    mapSetzen();
  }
  function mapZoom(faktor, cx, cy) {
    const v = $('syMapView');
    if (!v) return;
    if (cx == null) { cx = v.clientWidth / 2; cy = v.clientHeight / 2; }
    const k = Math.max(0.05, Math.min(8, mapView.k * faktor));
    mapView.x = cx - (cx - mapView.x) * (k / mapView.k);
    mapView.y = cy - (cy - mapView.y) * (k / mapView.k);
    mapView.k = k;
    mapSetzen();
  }

  function mapBinden() {
    const v = $('syMapView');
    if (!v || v.dataset.gebunden) return;
    v.dataset.gebunden = '1';
    const zeiger = new Map();
    let pinch = 0;
    const lokal = (e) => { const r = v.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    v.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [x, y] = lokal(e);
      mapZoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), x, y);
    }, { passive: false });
    v.addEventListener('pointerdown', (e) => {
      zeiger.set(e.pointerId, [e.clientX, e.clientY]);
      try { v.setPointerCapture(e.pointerId); } catch (x) { /* egal */ }
      v.classList.add('is-drag');
      pinch = 0;
    });
    v.addEventListener('pointermove', (e) => {
      const alt = zeiger.get(e.pointerId);
      if (!alt) return;
      zeiger.set(e.pointerId, [e.clientX, e.clientY]);
      if (zeiger.size === 1) {
        mapView.x += e.clientX - alt[0];
        mapView.y += e.clientY - alt[1];
        mapSetzen();
      } else if (zeiger.size === 2) {
        const [p, q] = [...zeiger.values()];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        const r = v.getBoundingClientRect();
        if (pinch) mapZoom(d / pinch, (p[0] + q[0]) / 2 - r.left, (p[1] + q[1]) / 2 - r.top);
        pinch = d;
      }
    });
    const los = (e) => {
      zeiger.delete(e.pointerId);
      pinch = 0;
      if (!zeiger.size) v.classList.remove('is-drag');
    };
    v.addEventListener('pointerup', los);
    v.addEventListener('pointercancel', los);
    v.addEventListener('dblclick', (e) => { const [x, y] = lokal(e); mapZoom(2, x, y); });
  }

  async function holeMap() {
    const [k, w] = await Promise.all([call('synir_cww_karte'), call('synir_work_list')]);
    if (!mapOpen) return;
    if (k.ok) karte = k.items || [];
    if (w.ok) { work = w.items || []; if (listOpen) paintPeople(); }
    if (cwwOpen) paintKarte();
    // Nur die Stände holen, die neuer sind als das, was wir haben.
    await Promise.all(work.map(async (it) => {
      const c = mapStand.get(it.participant);
      if (c && it.updated_at && new Date(c.updated_at) >= new Date(it.updated_at)) return;
      const r = await call('synir_work_get', { p_participant: it.participant, p_since: c ? c.updated_at : null });
      if (r.ok && r.stand) mapStand.set(it.participant, { updated_at: r.updated_at, stand: r.stand });
    }));
    malKarte();
  }

  function mapAuf(an) {
    mapOpen = an;
    const m = $('syMapModal');
    if (!m) return;
    m.hidden = !an;
    const b = $('syMap');
    if (b) b.setAttribute('aria-expanded', String(an));
    if (an) {
      mapBinden();
      mapView.fitted = false;
      mapKey = '';
      mapKeyFn = (e) => { if (e.key === 'Escape') { e.preventDefault(); mapAuf(false); } };
      document.addEventListener('keydown', mapKeyFn);
      malKarte();
      holeMap();
      takt();
    } else if (mapKeyFn) {
      document.removeEventListener('keydown', mapKeyFn);
      mapKeyFn = null;
    }
  }

  function mapHTML() {
    return `
    <div class="sy-map" id="syMapModal" role="dialog" aria-modal="true" aria-label="Karte des Class Wide Web" hidden>
      <div class="sy-map-bar">
        <strong>Karte der Klasse</strong>
        <span class="sy-map-sub" id="syMapSub"></span>
        <span class="sy-sp"></span>
        <button type="button" class="sy-btn" data-mz="out" aria-label="Verkleinern">−</button>
        <button type="button" class="sy-btn" data-mz="in" aria-label="Vergrößern">+</button>
        <button type="button" class="sy-btn" data-mz="fit">Alles zeigen</button>
        <button type="button" class="sy-btn" data-mz="close">✕ Schließen</button>
      </div>
      <div class="sy-map-view" id="syMapView">
        <svg class="sy-map-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Netzplan der ganzen Klasse"><g id="syMapG"></g></svg>
        <p class="sy-map-empty" id="syMapEmpty" hidden>Noch hat niemand ein Class Wide Web geöffnet.</p>
        <p class="sy-map-hint">Mausrad oder zwei Finger: zoomen · Ziehen: verschieben · Doppelklick: hineinzoomen</p>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════
     Nachrichten aus dem Rahmen
     ══════════════════════════════════════════════════════════ */

  function handle(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.type !== 'synir:event') return;

    switch (m.ev) {
      case 'ready':
        bridgeReady = true;
        pushAll();
        if (isPresenter() && watch) { watch.since = null; holeWatch(); }
        // Neu geladener Rahmen: er kennt sein /8 noch nicht.
        if (cww && cww.conf) post({ cwwNetz: cww.conf }); else cwwAnmelden();
        break;
      case 'cww':
        cwwVomRahmen(m);
        break;
      case 'pick':
        if (isPresenter()) {
          // Eine eigene Wahl beendet das Zusehen — wie bei Wild Clusters.
          if (watch) { watch = null; takt(); }
          takeover = null;
          paintDesk(); paintPeople();
        }
        if (!m.lokal) holen(m.id);
        break;
      case 'share':
        if (isPresenter()) share(m.id, !!m.an, m.titel);
        break;
      case 'loeschen':
        if (isPresenter()) loeschen(m.id);
        break;
      case 'alsSzenario':
        if (isPresenter()) alsSzenario(m);
        break;
      case 'lehrerstand':
        if (isPresenter() && m.stand) {
          lehrerStand = m.stand;
          if (mapOpen) malKarte();
        }
        break;
      case 'selbst':
        if (isPresenter() && watch) {
          takeover = watch.name;
          watch = null;
          takt();
          paintDesk(); paintPeople();
        }
        break;
      case 'stand':
        if (!isPresenter() && m.stand) {
          call('synir_work_put', { p_stand: m.stand }).then(res => {
            // Blind und stillgelegt sagt die Seite schon selbst.
            if (!res.ok && res.error !== 'blind' && res.error !== 'blocked') fehler(res);
          });
        }
        break;
    }
  }

  /* ══════════════════════════════════════════════════════════
     Das Pult (nur Beamer)
     ══════════════════════════════════════════════════════════ */

  function deskHTML() {
    return `
    <div class="sy-desk" id="syDesk">
      <div class="sy-row">
        <button type="button" class="sy-btn" id="syList" aria-expanded="false">Stand der Klasse</button>
        <button type="button" class="sy-btn" id="syCww" aria-expanded="false"
                title="Welches /8 gehört wem? Das sieht nur die Lehrkraft.">Internet der Klasse</button>
        <button type="button" class="sy-btn" id="syMap" aria-expanded="false"
                title="Der ganze Netzplan der Klasse: alle Netze rund um die Wolke.">Karte</button>
        <span class="sy-note" id="syNote" hidden>
          <span id="syNoteText"></span>
          <button type="button" class="sy-note-x" id="syStop">Beenden</button>
        </span>
        <span class="sy-sp"></span>
        <button type="button" class="sy-btn sy-blind" id="syBlind" aria-pressed="false"
                title="Legt auf jedes Tablet das SYNIR-Logo: „Wir machen jetzt am Beamer weiter.“">Schüler blind</button>
      </div>
      <div class="sy-list" id="syPeople" hidden></div>
      <div class="sy-list sy-cww" id="syCwwList" hidden></div>
    </div>`;
  }

  function paintDesk() {
    if (!isPresenter() || !root) return;
    const blind = !!data().blind;
    const bb = $('syBlind');
    if (bb) {
      bb.setAttribute('aria-pressed', String(blind));
      bb.textContent = blind ? 'Schüler sind blind — aufheben' : 'Schüler blind';
    }
    const lb = $('syList');
    if (lb) lb.setAttribute('aria-expanded', String(listOpen));
    const cb = $('syCww');
    if (cb) cb.setAttribute('aria-expanded', String(cwwOpen));
    const mb = $('syMap');
    if (mb) mb.setAttribute('aria-expanded', String(mapOpen));
    const note = $('syNote');
    if (note) {
      const txt = watch ? 'Ansicht von ' + watch.name
                : takeover ? 'Kopie von ' + takeover + ' — Sie arbeiten selbst'
                : '';
      note.hidden = !txt;
      note.classList.toggle('is-kopie', !watch && !!takeover);
      $('syNoteText').textContent = txt;
      $('syStop').textContent = watch ? 'Beenden' : 'OK';
    }
  }

  function alter(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
    if (s < 60) return 'vor ' + s + ' s';
    const m = Math.round(s / 60);
    return m < 60 ? 'vor ' + m + ' min' : 'vor ' + Math.round(m / 60) + ' h';
  }

  function paintPeople() {
    const box = $('syPeople');
    if (!box) return;
    box.hidden = !listOpen;
    if (!listOpen) return;
    const byId = {};
    for (const w of work) byId[w.participant] = w;
    const rows = [];
    const seen = {};
    for (const p of ((view && view.people) || [])) {
      seen[p.id] = true;
      rows.push({ id: p.id, name: p.name, online: p.online, w: byId[p.id] || null });
    }
    for (const w of work) if (!seen[w.participant]) rows.push({ id: w.participant, name: w.name, w });

    if (!rows.length) {
      box.innerHTML = '<p class="sy-empty">Noch niemand im Raum.</p>';
      return;
    }
    box.innerHTML = rows.map(r => {
      const on = watch && watch.pid === r.id;
      const info = r.w
        ? ctx.esc((r.w.titel ? r.w.titel + ' · ' : '') + r.w.geraete + ' Geräte · ' + alter(r.w.updated_at))
        : 'noch nichts gebaut';
      return '<button type="button" class="sy-person' + (on ? ' is-on' : '') + '" data-pid="' + ctx.esc(r.id) + '" '
        + 'data-name="' + ctx.esc(r.name || '') + '"' + (r.w ? '' : ' disabled') + ' aria-pressed="' + !!on + '">'
        + '<span class="sy-dot' + (r.online === false ? ' is-off' : '') + '"></span>'
        + '<strong>' + ctx.esc(r.name || '—') + '</strong>'
        + '<span class="sy-info">' + info + '</span>'
        + (on ? '<span class="sy-live">läuft vorne</span>' : '')
        + '</button>';
    }).join('');
  }

  /* Die Karte des Class Wide Web: wem gehört welches /8. Nur hier,
     nur für die Lehrkraft — die Klasse soll es herausfinden müssen
     (mit traceroute, mit 8.8.8.8, mit Fragen). */
  function paintKarte() {
    const box = $('syCwwList');
    if (!box) return;
    box.hidden = !cwwOpen;
    if (!cwwOpen) return;
    if (!karte.length) {
      box.innerHTML = '<p class="sy-empty">Noch hat niemand ein Class Wide Web geöffnet.</p>';
      return;
    }
    box.innerHTML = karte.map(k => {
      const frisch = k.seen_at && (Date.now() - new Date(k.seen_at).getTime()) < 20000;
      return '<div class="sy-person sy-cww-row">'
        + '<span class="sy-dot' + (frisch ? '' : ' is-off') + '"></span>'
        + '<strong class="sy-mono">' + ctx.esc(k.prefix + '.0.0.0/8') + '</strong>'
        + '<span>' + ctx.esc(k.name || '—') + '</span>'
        + '<span class="sy-info">' + ctx.esc(k.backbone + ' · ' + (k.namen || 0)
          + (k.namen === 1 ? ' Name' : ' Namen') + ' · ' + alter(k.seen_at)) + '</span>'
        + '</div>';
    }).join('');
  }

  /* Welcher Abschnitt der Hilfe (js/hilfe.js, im Rahmen) erklärt
     diesen Knopf? Die Hilfe springt nur, wenn sie offen ist. */
  const HILFE = { syList: 'klasse', syCww: 'internetklasse', syMap: 'internetklasse',
                  syBlind: 'blind', syStop: 'klasse' };

  async function onDeskClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    post({ hilfe: HILFE[b.id] || (b.dataset.pid ? 'klasse' : 'pult') });
    if (b.id === 'syList') {
      listOpen = !listOpen;
      paintDesk(); paintPeople();
      if (listOpen) { await tick(); }
      takt();
      fit();
      return;
    }
    if (b.id === 'syCww') {
      cwwOpen = !cwwOpen;
      paintDesk(); paintKarte();
      if (cwwOpen) await holeKarte();
      takt();
      fit();
      return;
    }
    if (b.id === 'syMap') { mapAuf(!mapOpen); return; }
    if (b.id === 'syStop') { zuseheEnde(); return; }
    if (b.id === 'syBlind') { await setData({ blind: !data().blind }); return; }
    if (b.dataset.pid) zusehen(b.dataset.pid, b.dataset.name || 'jemand');
  }

  function onMapClick(e) {
    const b = e.target.closest('button');
    if (!b || !b.dataset.mz) return;
    switch (b.dataset.mz) {
      case 'in':    mapZoom(1.4); break;
      case 'out':   mapZoom(1 / 1.4); break;
      case 'fit':   mapAnpassen(); break;
      case 'close': mapAuf(false); break;
    }
  }

  /* ══════════════════════════════════════════════════════════
     Höhe des Rahmens
     ══════════════════════════════════════════════════════════
     Der Rahmen reicht bis an die untere Kante des Fensters — die
     Anwendung ist eine Fläche, und jeder Pixel darunter wäre
     Seite statt Netz. Dieselbe Messung wie bei Wild Clusters. */

  function spaceBelow(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        if (scs.display === 'none' || scs.position === 'fixed' || scs.position === 'absolute') continue;
        sum += s.offsetHeight + (parseFloat(scs.marginTop) || 0) + (parseFloat(scs.marginBottom) || 0);
      }
    }
    return sum;
  }

  function fit() {
    if (!frame) return;
    const top = frame.getBoundingClientRect().top;
    const h = Math.max(MIN, window.innerHeight - top - spaceBelow(frame) - GAP);
    frame.style.height = h + 'px';
  }

  /* Der Rahmen entsteht erst mit dem ersten update(): seine Adresse
     trägt den Raumcode (für den eigenen Platz im Gerätespeicher,
     siehe app.js), und den kennt erst die view. */
  function baueRahmen() {
    const stage = $('syStage');
    if (!stage || frame) return;
    const c = (view && view.room && view.room.code) || (ctx.preview ? 'VORSCHAU' : 'RAUM');
    code = c;
    const src = 'tools/synir/index.html' + V
      + '&raum=' + encodeURIComponent(c)
      + '&rolle=' + (isPresenter() ? 'presenter' : 'participant')
      // Schaufenster: kein Gerätespeicher, keine Rückfragen (app.js).
      + (ctx.preview ? '&vorschau=1' : '');
    stage.innerHTML = '<iframe class="sy-frame" src="' + src + '" title="SYNIR" loading="eager" '
      + 'allow="fullscreen" allowfullscreen></iframe>';
    frame = stage.querySelector('.sy-frame');
    fit();
    requestAnimationFrame(fit);
  }

  /* ══════════════════════════════════════════════════════════
     Schnittstelle nach außen
     ══════════════════════════════════════════════════════════ */

  window.MPTool.register('synir', {

    /* Nichts abzufragen: welche Szenarien die Klasse bekommt,
       entscheidet die Lehrkraft IM Raum, nicht beim Anlegen. */
    settingsFields: [],

    mount(el, context) {
      root = el;
      ctx = context;
      view = null;
      frame = null;
      bridgeReady = false;
      code = null;
      eigene = [];
      lastMenue = '';
      lastBlind = null;
      bekannte = null;
      lastErr = '';
      listOpen = false;
      work = [];
      watch = null;
      takeover = null;
      cww = cwwNeu();
      cwwOpen = false;
      karte = [];
      mapOpen = false;
      lehrerStand = null;
      mapStand.clear();
      mapKey = '';

      const pres = isPresenter();
      root.innerHTML =
        '<div class="sy-host">'
        + (pres ? deskHTML() : '')
        + '<div class="sy-stage" id="syStage"></div>'
        + (pres ? mapHTML() : '')
        + '</div>';

      if (pres) {
        const desk = $('syDesk');
        if (desk) desk.addEventListener('click', onDeskClick);
        const mm = $('syMapModal');
        if (mm) mm.addEventListener('click', onMapClick);
        loadEigene();
      }

      if (!ctx.preview) document.body.classList.add('tool-fill');

      onMsg = handle;
      window.addEventListener('message', onMsg);
      onResize = () => fit();
      window.addEventListener('resize', onResize);
    },

    update(v) {
      view = v;
      if (!frame) baueRahmen();

      // „Neues Szenario verfügbar" — nur für das, was NACH dem
      // Betreten dazukommt. Was beim Öffnen schon freigegeben war,
      // ist nicht neu, sondern der Stand.
      if (!isPresenter()) {
        const ids = sharedList().map(x => x.id);
        if (bekannte) {
          const neu = ids.filter(id => !bekannte.has(id));
          if (neu.length) {
            const msg = neu.length === 1 ? 'Neues Szenario verfügbar' : neu.length + ' neue Szenarien verfügbar';
            if (bridgeReady) post({ toast: msg + ' — oben rechts unter „Szenario laden".' });
            else ctx.toast(msg);
          }
        }
        bekannte = new Set(ids);
      }

      pushMenue();
      pushBlind();
      paintDesk();
      if (listOpen) paintPeople();
    },

    unmount() {
      clearTimeout(workTimer);
      workTimer = 0;
      if (cww) clearTimeout(cww.timer);
      cww = null;
      if (onMsg) window.removeEventListener('message', onMsg);
      if (onResize) window.removeEventListener('resize', onResize);
      if (mapKeyFn) { document.removeEventListener('keydown', mapKeyFn); mapKeyFn = null; }
      mapOpen = false;
      onMsg = onResize = null;
      document.body.classList.remove('tool-fill');
      frame = null;
      root = null;
      ctx = null;
      view = null;
      watch = null;
      bridgeReady = false;
    }
  });
})();
