/* YourSozialNet – Dummy-Daten: Generator
   SHDummy.build({ stichtag: '2026-11-04', netz: 'Liky', firstId: 1 })
     → { users, photos, tags, photo_tag, follows, likes, comments, sessions, views }
   jede Tabelle als { cols, rows } in den Spalten von SHDB.DDL (js/db.js).

   Fest: gleicher Stichtag = gleiche Daten in jedem Netzwerk des Raums (der
   Zufall hängt NUR am Stichtag, nicht am Netzwerk). netz ersetzt nur {netz}
   in den E-Mails (netz: '{netz}' lässt den Platzhalter für den Server stehen). firstId verschiebt die User-ids (falls schon Konten da sind).

   Zeiten: Text 'YYYY-MM-DD HH:MM:SS' (Ortszeit, ohne Zone), gerechnet in UTC-
   Arithmetik, damit keine Sommerzeit-Sprünge hineinrechnen.

   Passwörter stehen im KLARTEXT in users.password – wer lädt, hasht (bcrypt)
   wie beim Registrieren. Die schwachen aus daten.js (pw) sind gewollt. */
(function (root) {
  'use strict';

  const DAY = 86400000;

  // ── Zufall mit Seed (FNV-1a + mulberry32) ─────────────────────────────
  function fnv(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const R = {
      f: next,
      p: (x) => next() < x,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      shuffle: (arr) => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; },
      weighted: (items, w) => { let s = 0; for (const x of w) s += x; let r = next() * s; for (let i = 0; i < items.length; i++) { r -= w[i]; if (r < 0) return items[i]; } return items[items.length - 1]; }
    };
    return R;
  }

  // ── Zeit ─────────────────────────────────────────────────────────────
  const pad = (n) => String(n).padStart(2, '0');
  function fmt(t) {
    const d = new Date(t);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' +
      pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
  }
  function fmtDate(t) { return fmt(t).slice(0, 10); }
  function parseDay(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(s));
    if (!m) throw new Error('stichtag muss YYYY-MM-DD sein');
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  function addYears(t, y) {
    const d = new Date(t);
    const r = Date.UTC(d.getUTCFullYear() + y, d.getUTCMonth(), d.getUTCDate());
    // 29.2. in Nicht-Schaltjahren → 1.3. wäre falsch; 28.2. nehmen
    return new Date(r).getUTCMonth() !== d.getUTCMonth() ? r - DAY : r;
  }
  const at = (day0, ago, hh, mm, ss) => day0 - ago * DAY + ((hh * 60 + mm) * 60 + (ss || 0)) * 1000;
  const hm = (s) => s.split(':').map(Number);

  // ── Geräte ───────────────────────────────────────────────────────────
  const DEVICES = {
    iphone:          { type: 'phone',   device: 'Apple iPhone 14', os: 'iOS 18.6', browser: 'Safari 18', w: 390, h: 844, pr: 3.0, cam: 'Apple iPhone 14',
                       ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' },
    android:         { type: 'phone',   device: 'Samsung Galaxy A54', os: 'Android 15', browser: 'Chrome 141', w: 412, h: 915, pr: 2.6, cam: 'samsung SM-A546B',
                       ua: 'Mozilla/5.0 (Linux; Android 15; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36' },
    ipad:            { type: 'tablet',  device: 'Apple iPad Air', os: 'iPadOS 18.6', browser: 'Safari 18', w: 820, h: 1180, pr: 2.0, cam: 'Apple iPad Air',
                       ua: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' },
    ipad_alt:        { type: 'tablet',  device: 'Apple iPad (6. Gen.)', os: 'iPadOS 15.8', browser: 'Safari 15', w: 768, h: 1024, pr: 2.0, cam: 'Apple iPad',
                       ua: 'Mozilla/5.0 (iPad; CPU OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1' },
    android_tablet:  { type: 'tablet',  device: 'Samsung Galaxy Tab A9', os: 'Android 14', browser: 'Chrome 139', w: 800, h: 1340, pr: 1.5, cam: 'samsung SM-X110',
                       ua: 'Mozilla/5.0 (Linux; Android 14; SM-X110) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36' },
    desktop_win:     { type: 'desktop', device: 'Windows-PC', os: 'Windows 11', browser: 'Chrome 141', w: 2560, h: 1440, pr: 1.0, cam: null,
                       ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' },
    desktop_win_ff:  { type: 'desktop', device: 'Windows-PC', os: 'Windows 11', browser: 'Firefox 144', w: 1920, h: 1080, pr: 1.0, cam: 'Sony ILCE-7M4',
                       ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0' },
    desktop_win_edge:{ type: 'desktop', device: 'Windows-PC', os: 'Windows 10', browser: 'Edge 141', w: 1366, h: 768, pr: 1.0, cam: null,
                       ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0' },
    mac:             { type: 'desktop', device: 'Apple Mac', os: 'macOS 15', browser: 'Safari 18', w: 1512, h: 982, pr: 2.0, cam: null,
                       ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15' },
    desktop_mac_ff:  { type: 'desktop', device: 'Apple Mac', os: 'macOS 15', browser: 'Firefox 144', w: 1440, h: 900, pr: 2.0, cam: null,
                       ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0' },
    desktop_linux:   { type: 'desktop', device: 'Linux-PC', os: 'Linux', browser: 'Firefox 144', w: 1920, h: 1080, pr: 1.0, cam: null,
                       ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0' }
  };
  const LANG = { 'annalisa.f': 'it-IT', 'sophie.db': 'fr-FR', 'mikkel.s': 'da-DK', 'nikos.pap': 'de-AT', 'matteo.bi': 'de-CH', vanlife_tomasz: 'pl-PL' };
  const TZ = { 'nikos.pap': 'Europe/Vienna', 'matteo.bi': 'Europe/Zurich', 'mikkel.s': 'Europe/Copenhagen', 'sophie.db': 'Europe/Paris' };
  // VPN: Tomasz taucht über diese Ausgänge auf (Zeitzone des Geräts bleibt Lissabon/Oslo)
  const VPN = [['Europe/Lisbon', 'pl-PL'], ['Europe/Oslo', 'pl-PL']];

  // Freundeskreise (folgen sich gegenseitig mit hoher Wahrscheinlichkeit)
  const FRIENDS = [
    ['lasse.ld', 'larsole', 'felix.b', 'fmroth', 'hugo.ranked'],
    ['levi.kicks', 'levi_nwk', 'noobqueen', 'nina.netz', 'levi_fan_09', 'ida.hsn', 'finn.kielwasser'],
    ['pixelpaul', 'inkandmila', 'elisa_b', 'tim.richter', 'lisamarie.k'],
    ['lisa.mei', 'jakob.hu', 'ana.kovac', 'annalisa.f', 'giulia.glow', 'fitbyfee'],
    ['alina.daily', 'laura.mauer', 'lars_p', 'jannik.wolf'],
    ['emma.kr', 'aylin.ylmz', 'leila.hd', 'ana.kovac'],
    ['frag_frieda', 'priya.sh', 'lisamarie.k'],
    ['wachtauf_marco', 'marco_hat_recht']
  ];
  // feste Follows (folgt → wem)
  const FIXED_FOLLOWS = [
    ['erna.lueders', 'lasse.ld'], ['lasse.ld', 'erna.lueders'], ['sandra.schu', 'levi.kicks'], ['levi.kicks', 'sandra.schu'],
    ['sandra.schu', 'coach_ralf'], ['levi_fan_09', 'levi.kicks'], ['erna.lueders', 'backmitbrigitte'],
    ['aaron183', 'alina.daily'], ['aaron183', 'hugo.ranked'], ['aaron183', 'jona.sneaks'], ['aaron183', 'inkandmila'],
    ['realtalk_dennis', 'alina.daily'], ['realtalk_dennis', 'fitbyfee'], ['realtalk_dennis', 'jona.sneaks'],
    ['mondrueckseite', 'wachtauf_marco'], ['mondrueckseite', 'frag_frieda'], ['echsenwache', 'wachtauf_marco'],
    ['echsenwache', 'wuffi_und_ich'], ['frag_frieda', 'wachtauf_marco'], ['wuffi_und_ich', 'katzenkram'],
    ['wuffi_und_ich', 'finn.kielwasser'], ['wuffi_und_ich', 'backmitbrigitte'], ['werner.angelt', 'finn.kielwasser'],
    ['lotta.b', 'gewinn_jetzt_2026'], ['tim.richter', 'gewinn_jetzt_2026']
  ];

  // zusätzliche Troll-Kommentare (pädagogisch vertretbar)
  const TROLL = {
    aaron183: { on: ['gaming', 'lifestyle', 'kreativ', 'fussball'], n: 12, pool: ['cringe', 'Geh lieber lernen', 'Wer kauft sowas 😂', 'Langweilig', 'Ok und?', 'Hast du nix Besseres zu tun?'] },
    realtalk_dennis: { on: ['lifestyle', 'fitness'], n: 6, pool: ['Naja.', 'Früher war mehr Mühe drin', 'Filter much? 😂', 'Mutig, das zu posten'] },
    mondrueckseite: { on: ['tiere', 'food', 'reisen', 'fussball'], n: 6, pool: ['Echsenmensch-Vibes 🦎🌑', 'Die Echsen von der Mondrückseite sehen alles 👀', 'Wieder ein Beweis für die Echsen.'] },
    echsenwache: { on: ['tiere', 'kreativ', 'musik'], n: 5, pool: ['Echsen-Alarm 🦎', 'Hinter dir… ein Echsenmensch!', 'Die Rückseite des Mondes grüßt.'] }
  };

  function build(opt) {
    const D = root.SHDummyDaten;
    if (!D) throw new Error('daten.js fehlt');
    opt = opt || {};
    const day0 = parseDay(opt.stichtag || fmtDate(Date.now()));
    const now = day0 + 23 * 3600000 + 59 * 60000;
    const R = rng(fnv('yoursozialnet|' + fmtDate(day0)));
    // '{netz}' bleibt stehen: der Server setzt beim Füllen den Namen jedes Netzwerks ein (0272)
    const netz = opt.netz === '{netz}' ? '{netz}' : String(opt.netz || 'netzwerk').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '') || 'netzwerk';
    const firstId = opt.firstId || 1;

    // ── users ──────────────────────────────────────────────────────────
    const U = D.USERS.map((u, i) => Object.assign({}, u, { id: firstId + i }));
    const byK = {}; U.forEach(u => { byK[u.k] = u; });
    const topicsOfTags = (tags) => Object.keys(D.TOPIC).filter(t => tags.some(x => D.TOPIC[t].includes(x)));
    const active = (u) => u.r !== 'l';
    U.forEach(u => {
      const [h, m] = [R.int(7, 22), R.int(0, 59)];
      u.regT = at(day0, u.reg, h, m, R.int(0, 59));
      u.pwPlain = u.pw || (R.pick(['Sonne', 'Kiwi', 'Tiger', 'Blau', 'Mond', 'Pizza', 'Wolke', 'Fuchs']) + R.int(10, 99) + R.pick(['!', '?', '#', '$', '%']) + R.pick(['xq', 'pt', 'mz', 'kr', 'lw']));
      u.dark = R.p(0.55);
      u.perm = { // einmal gefragt → bleibt (NULL = nie gefragt)
        location: R.p(0.62), camera: R.p(0.5), microphone: R.p(0.3), notifications: R.p(0.45)
      };
    });
    const users = {
      cols: ['id', 'username', 'name', 'email', 'password', 'gender', 'bio', 'avatar', 'birthday', 'city', 'country', 'centimeter', 'role', 'created_at'],
      rows: U.map(u => [
        u.id, u.k, u.n, u.m ? u.m.replace('{netz}', netz) : null, u.pwPlain, u.g, u.bio, u.av ? 'dummy/' + u.av + '.webp' : null,
        u.a ? fmtDate(addYears(day0 - u.a[1] * DAY, -u.a[0])) : null, u.c, u.l, u.cm, 'user', fmt(u.regT)
      ])
    };

    // ── photos ─────────────────────────────────────────────────────────
    // frühester Zeitpunkt eines Fotos: nach dem Besitzer UND nach allen, die im Thread schreiben
    const P = D.PHOTOS.map((p, i) => ({ f: p[0], owner: byK[p[1]], text: p[2], tags: p[3], ago: p[4], hm: p[5], noLike: !!(p[6] && p[6].noLike), id: i + 1 }));
    P.forEach(p => { if (!p.owner) throw new Error('Besitzer fehlt: ' + p.f); });
    const owned = {};
    P.forEach(p => { (owned[p.owner.k] = owned[p.owner.k] || []).push(p); });
    Object.values(owned).forEach(list => {
      const o = list[0].owner;
      const free = list.filter(p => p.ago == null);
      const lo = 3, hi = Math.max(lo + free.length, o.reg - 5);
      free.forEach((p, j) => { // älteste zuerst, gleichmäßig verteilt mit etwas Zufall
        const span = (hi - lo) / Math.max(1, free.length);
        p.ago = Math.max(lo, Math.round(hi - span * j - R.f() * span * 0.6));
      });
    });
    P.forEach(p => {
      const th = D.THREADS[p.f] || [];
      const lim = Math.min(...th.map(c => byK[c[0]] ? byK[c[0]].reg : 9999), p.owner.reg) - 1;
      if (p.ago > lim) p.ago = Math.max(0, lim);
      let hh, mm;
      if (p.hm) [hh, mm] = hm(p.hm);
      else if (p.owner.night && R.p(0.4)) { hh = R.int(0, 3); mm = R.int(0, 59); }
      else { hh = R.int(7, 22); mm = R.int(0, 59); }
      p.t = at(day0, p.ago, hh, mm, R.int(0, 59));
      if (p.t <= p.owner.regT) p.t = p.owner.regT + R.int(10, 600) * 60000;
      p.topics = topicsOfTags(p.tags);
      const dev = DEVICES[(p.owner.dev || []).find(k => DEVICES[k] && DEVICES[k].cam) || 'android'];
      const screenshot = /ranked|setup|stream/.test(p.tags.join(' ')) && R.p(0.5);
      const travel = p.topics.includes('reisen');
      p.taken = screenshot ? null : p.t - (travel && R.p(0.5) ? R.int(1, 30) * DAY : R.int(5, 3 * 24 * 60) * 60000);
      p.camera = screenshot ? null : (p.owner.k === 'linus.lens' ? 'Sony ILCE-7M4' : dev.cam);
    });
    U.forEach(u => { u.photosPosted = (owned[u.k] || []).length; });
    const photos = {
      cols: ['id', 'user_id', 'image', 'description', 'taken_at', 'camera', 'created_at'],
      rows: P.map(p => [p.id, p.owner.id, 'dummy/' + p.f + '.webp', p.text, p.taken ? fmt(p.taken) : null, p.camera, fmt(p.t)])
    };

    // ── tags + photo_tag ───────────────────────────────────────────────
    const tagIds = {}; const tagRows = [];
    P.forEach(p => p.tags.forEach(t => { if (!(t in tagIds)) { tagIds[t] = tagRows.length + 1; tagRows.push([tagRows.length + 1, t]); } }));
    const tags = { cols: ['id', 'name'], rows: tagRows };
    const photo_tag = { cols: ['photo_id', 'tag_id'], rows: [] };
    P.forEach(p => p.tags.forEach(t => photo_tag.rows.push([p.id, tagIds[t]])));

    // ── follows ────────────────────────────────────────────────────────
    const F = new Map(); // "a>b" → Zeit
    const follows = (a, b) => F.has(a.k + '>' + b.k);
    const addF = (a, b) => {
      if (!a || !b || a === b || !active(a) || !active(b) || follows(a, b)) return;
      const t0 = Math.max(a.regT, b.regT);
      F.set(a.k + '>' + b.k, t0 + R.f() * Math.max(60000, now - t0) * 0.9);
    };
    FIXED_FOLLOWS.forEach(([a, b]) => addF(byK[a], byK[b]));
    FRIENDS.forEach(g => g.forEach(a => g.forEach(b => { if (a !== b && R.p(0.85)) addF(byK[a], byK[b]); })));
    const CC = U.filter(u => u.r === 'cc');
    U.filter(active).forEach(u => {
      if (u.bot) return;
      CC.forEach(c => {
        if (c === u) return;
        const shared = c.i.some(x => u.i.includes(x));
        const p = u.r === 'cc' ? (shared ? 0.8 : 0.12) : (shared ? 0.72 : 0.05);
        if (R.p(p)) addF(u, c);
      });
    });
    // CC folgen ein paar ihrer Fans zurück
    CC.forEach(c => U.forEach(u => { if (follows(u, c) && u.r !== 'cc' && R.p(0.15)) addF(c, u); }));
    // Bot folgt wild
    R.shuffle(U.filter(u => active(u) && !u.bot)).slice(0, 45).forEach(u => addF(byK.gewinn_jetzt_2026, u));
    const followsT = {
      cols: ['follower_id', 'following_id', 'created_at'],
      rows: [...F.entries()].map(([k, t]) => { const [a, b] = k.split('>'); return [byK[a].id, byK[b].id, fmt(t)]; })
        .sort((x, y) => x[2] < y[2] ? -1 : 1)
    };

    // ── likes ──────────────────────────────────────────────────────────
    const L = new Map(); // "u|photoId" → { t, kind }
    const believer = (u) => u.i.includes('flacheerde') && !['mondrueckseite', 'echsenwache'].includes(u.k);
    const kindFor = (u, p) => {
      if (p.topics.includes('flacheerde')) return believer(u) ? 'heart' : R.weighted(['laugh', 'thumb', 'heart'], [6, 1, 1]);
      return R.weighted(['heart', 'thumb', 'laugh'], [7, 2, 1]);
    };
    const addL = (u, p, t) => {
      if (u === p.owner || p.noLike || L.has(u.k + '|' + p.id)) return;
      const t0 = Math.max(p.t, u.regT) + 60000;
      if (t0 >= now) return;
      L.set(u.k + '|' + p.id, { u, p, t: t || t0 + Math.pow(R.f(), 3) * (now - t0), kind: kindFor(u, p) });
    };
    const likers = U.filter(u => active(u) && !u.bot);
    P.forEach(p => {
      likers.forEach(u => {
        let x = p.topics.some(t => u.i.includes(t)) ? 0.5 : 0.04;
        if (follows(u, p.owner)) x += 0.25;
        if (u.r === 't') x *= 0.6;
        if (u.k === 'levi_fan_09' && p.owner.k === 'levi.kicks') x = 1;
        if (u.k === 'erna.lueders' && p.owner.k === 'lasse.ld') x = 1;
        if (u.k === 'sandra.schu' && p.owner.k === 'levi.kicks') x = 1;
        if (u.k === 'marco_hat_recht' && p.owner.k === 'wachtauf_marco') x = 1;
        if (['mondrueckseite', 'echsenwache'].includes(u.k) && p.owner.k === 'wachtauf_marco') x = 0.3;
        if (u.k === 'laura.mauer' || u.k === 'marlo.eb') x = Math.min(1, x * 1.3);
        if (R.p(Math.min(1, x))) addL(u, p);
      });
      // jedes Foto außer den „noLike“ hat mindestens ein Like
      if (!p.noLike && ![...L.values()].some(l => l.p === p)) addL(R.pick(likers.filter(u => u !== p.owner)), p);
    });
    // Brigitte: „60 Likes = Rezept!“ bekommt genau knapp zu wenig (59)
    const b5 = P.find(p => p.f === 'brigitte_05');
    if (b5) {
      let mine = [...L.values()].filter(l => l.p === b5);
      R.shuffle(likers).forEach(u => { if (mine.length < 59) { addL(u, b5); mine = [...L.values()].filter(l => l.p === b5); } });
      mine.slice(59).forEach(l => L.delete(l.u.k + '|' + b5.id));
    }
    const likes = {
      cols: ['user_id', 'photo_id', 'kind', 'created_at'],
      rows: [...L.values()].sort((a, b) => a.t - b.t).map(l => [l.u.id, l.p.id, l.kind, fmt(l.t)])
    };

    // ── comments ───────────────────────────────────────────────────────
    const C = [];
    const addC = (u, p, text, t) => { if (u && t < now && t > u.regT) C.push({ u, p, text, t }); };
    const pByF = {}; P.forEach(p => { pByF[p.f] = p; });
    Object.entries(D.THREADS).forEach(([f, list]) => {
      const p = pByF[f]; if (!p) throw new Error('Thread ohne Foto: ' + f);
      list.forEach(([k, text, min]) => {
        if (!byK[k]) throw new Error('Thread-User fehlt: ' + k);
        addC(byK[k], p, text, Math.min(now - 60000, p.t + min * 60000 + R.int(0, 50) * 1000));
      });
    });
    // Füll-Kommentare von Leuten, die geliked haben
    const likesOf = {}; L.forEach(l => { (likesOf[l.p.id] = likesOf[l.p.id] || []).push(l); });
    P.forEach(p => {
      const n = p.owner.r === 'cc' ? R.int(1, 4) : R.int(0, 2);
      const cand = R.shuffle((likesOf[p.id] || []).filter(l => ['cc', 'n', 'k'].includes(l.u.r) && !l.u.silent && !l.u.bot));
      cand.slice(0, n).forEach(l => {
        const pool = D.FILL[p.topics[0]] || D.FILL.alle;
        addC(l.u, p, R.p(0.25) ? R.pick(D.FILL.alle) : R.pick(pool), l.t + R.int(1, 120) * 60000);
      });
    });
    // Gewinnspiel: „markiere 2 Freunde“
    const gw = pByF.giulia_03;
    if (gw) {
      const fans = R.shuffle(U.filter(u => active(u) && !u.bot && u !== gw.owner && u.r !== 't' && (follows(u, gw.owner) || u.i.includes('lifestyle')))).slice(0, 18);
      fans.forEach(u => {
        const fr = R.shuffle(U.filter(v => v !== u && v !== gw.owner && follows(u, v) && !v.bot)).slice(0, 2);
        if (fr.length < 2) return;
        addC(u, gw, R.pick(['Ich will!!', 'Mitmachen 🎁', 'Bitte bitte 🙏', 'Ich!']) + ' @' + fr[0].k + ' @' + fr[1].k, gw.t + R.int(5, 4000) * 60000);
      });
    }
    // Trolle
    Object.entries(TROLL).forEach(([k, cfg]) => {
      const u = byK[k];
      const targets = R.shuffle(P.filter(p => p.owner !== u && p.topics.some(t => cfg.on.includes(t)) && !(D.THREADS[p.f] || []).some(c => c[0] === k)));
      targets.slice(0, cfg.n).forEach(p => addC(u, p, R.pick(cfg.pool), Math.max(p.t, u.regT) + R.int(10, 3000) * 60000));
    });
    // Spam-Bot unter ~30 Fotos (nur Fotos, die es schon gab)
    const bot = byK.gewinn_jetzt_2026;
    R.shuffle(P.filter(p => p.t < now - DAY)).slice(0, 30).forEach(p => {
      const t0 = Math.max(p.t, bot.regT);
      addC(bot, p, D.SPAM, t0 + R.f() * (now - t0) * 0.9);
    });
    C.sort((a, b) => a.t - b.t);
    const comments = { cols: ['id', 'user_id', 'photo_id', 'body', 'created_at'], rows: C.map((c, i) => [i + 1, c.u.id, c.p.id, c.text, fmt(c.t)]) };

    // ── sessions + views (letzte 30 Tage) ─────────────────────────────
    const homeIp = {};
    const ipOf = (key) => homeIp[key] || (homeIp[key] = R.pick(['203.0.113.', '198.51.100.', '192.0.2.']) + R.int(2, 254));
    // Mobilfunk (CGNAT 100.64.0.0/10): je User zwei Adressen, die abwechseln
    const mob = {};
    const mobileIp = (u) => R.pick(mob[u.k] || (mob[u.k] = [0, 1].map(() => '100.' + R.int(64, 127) + '.' + R.int(0, 255) + '.' + R.int(1, 254))));
    const vpnIps = ['185.220.101.' + R.int(2, 60), '45.83.' + R.int(10, 200) + '.12', '91.132.' + R.int(10, 200) + '.7', '194.36.' + R.int(10, 200) + '.88',
      '146.70.' + R.int(10, 200) + '.33', '37.19.' + R.int(10, 200) + '.140', '89.187.' + R.int(10, 200) + '.9', '156.146.' + R.int(10, 60) + '.21', '217.138.' + R.int(10, 200) + '.70'];
    const S = []; const V = [];
    const viewable = (t) => P.filter(p => p.t < t);
    U.filter(u => active(u) && (u.dev || []).length).forEach(u => {
      const n = u.bot ? 30 : u.k === 'erna.lueders' ? 4 : u.r === 'cc' ? R.int(18, 28) : u.r === 't' ? R.int(10, 20) : R.int(6, 14);
      for (let s = 0; s < n; s++) {
        const devKey = u.dev.length > 1 && R.p(0.3) ? u.dev[1] : u.dev[0];
        const d = DEVICES[devKey];
        const dayAgo = R.int(0, 29);
        let hh;
        if (u.night && (s < 2 || R.p(0.35))) hh = R.int(1, 3);
        else if (u.bot) hh = R.int(0, 23);
        else if (u.a && u.a[0] < 18) hh = R.pick([7, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
        else hh = R.pick([6, 7, 8, 12, 17, 18, 19, 20, 21, 22, 23]);
        const start = at(day0, dayAgo, hh, R.int(0, 59), R.int(0, 59));
        if (start <= u.regT || start >= now) continue;
        const durMin = u.bot ? R.int(1, 3) : R.int(2, 45);
        const last = Math.min(now, start + durMin * 60000);
        let ip, tz = TZ[u.k] || 'Europe/Berlin', lang = LANG[u.k] || 'de-DE';
        if (u.vpn) { ip = vpnIps[s % vpnIps.length]; const v = VPN[s % 2]; tz = v[0]; lang = v[1]; }
        else if (u.bot) ip = '185.220.100.' + R.int(240, 254);
        else if (d.type === 'phone' && R.p(0.4)) ip = mobileIp(u);
        else ip = ipOf(u.home || u.k);
        const sid = S.length + 1;
        const conn = d.type === 'desktop' ? R.pick(['wifi', 'ethernet']) : ip.startsWith('100.') ? R.pick(['4g', '5g']) : 'wifi';
        S.push([sid, u.id, fmt(start), fmt(last), R.p(0.6) ? fmt(last) : null, ip, d.ua, d.browser, d.os, d.type, d.device, d.w, d.h, d.pr,
          lang, tz, u.dark, conn, u.perm.location, u.photosPosted === 0 ? null : u.perm.camera, u.perm.microphone, s === 0 ? null : u.perm.notifications]);
        // views
        const pool = viewable(start);
        if (!pool.length || u.bot) continue;
        const w = pool.map(p => (p.topics.some(t => u.i.includes(t)) ? 5 : 1) * (follows(u, p.owner) ? 3 : 1));
        let t = start + R.int(2, 20) * 1000;
        // ~8 000 views je Netzwerk (Sönke 04.11.2026: genug für die Aufgaben, bei 30 Netzwerken je Raum sonst > 1 Mio. Zeilen)
        const nv = Math.min(20, Math.round(durMin * 0.25) + R.int(1, 4));
        for (let j = 0; j < nv && t < last; j++) {
          const p = R.weighted(pool, w);
          const hot = p.topics.some(x => u.i.includes(x));
          const ms = hot ? R.int(3500, 22000) : R.int(500, 3200);
          const liked = L.has(u.k + '|' + p.id);
          const feed = R.weighted(['foryou', 'following', 'profile', 'search', 'tag'], [10, 4, 2, 1, 1]);
          const end = j === nv - 1 ? 'leave' : liked && R.p(0.3) ? 'like' : R.weighted(['swipe', 'comment', 'profile', 'tag'], [20, 1, 1, 1]);
          V.push([V.length + 1, u.id, p.id, sid, fmt(t), ms, feed, j, end]);
          t += ms + R.int(200, 1500);
        }
      }
    });
    S.sort((a, b) => a[2] < b[2] ? -1 : 1);
    // ids nach Zeit neu vergeben, views mitziehen
    const remap = {}; S.forEach((r, i) => { remap[r[0]] = i + 1; r[0] = i + 1; });
    V.forEach(r => { r[3] = remap[r[3]]; });
    V.sort((a, b) => a[4] < b[4] ? -1 : 1).forEach((r, i) => { r[0] = i + 1; });
    const sessions = {
      cols: ['id', 'user_id', 'started_at', 'last_seen_at', 'ended_at', 'ip', 'user_agent', 'browser', 'os', 'device_type', 'device',
        'screen_width', 'screen_height', 'pixel_ratio', 'language', 'timezone', 'dark_mode', 'connection',
        'allow_location', 'allow_camera', 'allow_microphone', 'allow_notifications'],
      rows: S
    };
    const views = { cols: ['id', 'user_id', 'photo_id', 'session_id', 'viewed_at', 'duration_ms', 'feed', 'position', 'ended_by'], rows: V };

    // Werbung (0276): Kampagnen der Plattform (user_id NULL); „Wem?“/„Was?“ sind nur Text
    const ads = {
      cols: ['id', 'user_id', 'name', 'kind', 'title', 'body', 'image', 'button', 'target_sql', 'content_sql', 'active', 'created_at'],
      rows: (D.ADS || []).map((a, i) => [i + 1, null, a[1], a[2], a[3], a[4],
        a[2] === 'ad' ? 'dummy/ad_' + a[0] + '.webp' : null, a[5], a[6], a[7], true,
        fmtDate(day0 - a[8] * 86400000) + ' 10:00:00'])
    };

    return { users, photos, tags, photo_tag, follows: followsT, likes, comments, sessions, views, ads,
      meta: { stichtag: fmtDate(day0), netz, firstId } };
  }

  /* Bild zu einer Datei aus users.avatar / photos.image ('dummy/<name>.webp'):
     liegt es noch nicht in dummy/img/, zeigt die App einen Platzhalter mit dem Motiv. */
  function imageUrl(v, base) { return /^dummy\/[a-z0-9_]+\.webp$/.test(v || '') ? (base || '') + 'dummy/img/' + v.slice(6) : null; }

  root.SHDummy = { build, imageUrl, DEVICES };
})(typeof self !== 'undefined' ? self : globalThis);
