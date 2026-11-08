/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/app.js   ·   Die App (bis 0265 „Social Hub“)
   ══════════════════════════════════════════════════════════════
   Begriffe (CLAUDE.md): Lehrkraft = hat den Raum eröffnet · Schüler =
   ist beigetreten · Netzwerk = eigenes soziales Netzwerk (intern
   „hub“, sh_hubs) · User = Konto in einem Netzwerk · Admin = wer das
   Netzwerk erstellt hat (dessen erstes Konto).

   Bildschirme (S.screen):
     home    Schüler: „Netzwerk erstellen“ bzw. das eigene; Anmelden
             für ein Netzwerk von einem anderen Tablet.
             Lehrkraft: eigenes Netzwerk erstellen · Liste aller
             Netzwerke · Tabellen als kleines Diagramm.
     found   Schritt 1: Name, Logo, Farbschema
     login   Anmelden / Registrieren (Schritt 2 = Admin-Konto)
     netlogin  Schüler auf einem anderen Tablet
     hub     Kopf: Logo · Name · [App] [Adminbereich]
               App          unten Start · Suche · ＋ · Profil
               Adminbereich oben Einstellungen · SQL · Diagramm
   Neu gezeichnet wird von außen (Zustand vom Raum, Takt) nur home und
   die App-Reiter ohne Eingaben – nie ein Formular (Rückmeldung 2).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const A = window.SHApi;
  const M = window.SHMedia;
  const T = A.TEACHER;

  const LOGOS = {
    // dflt = Vorschlag für den Namen, wie in Startup Story (GameHub/S3 Startup Story/js/assets.js)
    bell:    { name: 'Glocke',   color: '#e91d77', dflt: 'RingRing' },
    connect: { name: 'Connect',  color: '#d97706', dflt: 'Space' },
    rocket:  { name: 'Rakete',   color: '#ea580c', dflt: 'ToTheMoon' },
    graph:   { name: 'Graph',    color: '#2563eb', dflt: 'The River' },
    trend:   { name: 'Trend',    color: '#0d9488', dflt: 'Trendr' },
    chat:    { name: 'Plausch',  color: '#dc2626', dflt: 'Großepause' },
    like:    { name: 'Like',     color: '#7c3aed', dflt: 'Liky' },
    mesh:    { name: 'Netz',     color: '#16a34a', dflt: 'Nexus' }
  };
  const isDefaultName = n => !n || Object.keys(LOGOS).some(k => LOGOS[k].dflt === n);
  // users gibt es immer; alles andere erstellt die Lehrkraft (Migration 0263).
  const TABLES = [
    { id: 'photos',        what: 'Fotos posten, Feed' },
    { id: 'follows',       what: 'Folgen, Follower, Feed „Folge ich“' },
    { id: 'likes',         what: 'Herz an Fotos, „Für dich“ lernt mit', needs: ['photos'] },
    { id: 'comments',      what: 'Kommentare unter Fotos', needs: ['photos'] },
    { id: 'tags',          what: 'Hashtags (mit photo_tag)', needs: ['photos'] },
    // Analytics (0270): erstellt = es wird getrackt, wie auf einer echten Seite
    { id: 'sessions',      what: 'Analytics: jeder Besuch mit IP, Gerät, Browser – läuft still mit' },
    { id: 'views',         what: 'Analytics: welches Foto wie lange angesehen wurde', needs: ['photos', 'sessions'] },
    // Werbung (0276): Kampagnen mit SQL-Zielgruppe, Reiter „Werbung“ im Adminbereich
    { id: 'ads',           what: 'Werbung: Kampagnen mit Zielgruppe per SQL – Reiter „Werbung“ im Adminbereich' }
  ];
  const NEEDS = {};
  TABLES.forEach(t => { if (t.needs) NEEDS[t.id] = t.needs; });
  // alles, was (auch über Umwege) an t hängt
  const dependents = t => {
    const hangs = (x, seen) => (NEEDS[x] || []).some(n => n === t || (!seen[n] && (seen[n] = 1) && hangs(n, seen)));
    return TABLES.filter(x => hangs(x.id, {})).map(x => x.id);
  };
  const SWATCHES = ['#fe2c55', '#e91d77', '#7c3aed', '#2563eb', '#0ea5e9', '#0d9488', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#64748b'];
  // Arten beim Like (0267): ein Like je Person und Foto
  const KINDS = [['heart', 'Herz'], ['thumb', 'Daumen hoch'], ['laugh', 'Lustig']];
  const kindIcon = k => IC[k === 'thumb' || k === 'laugh' ? k : 'heart'];
  const GENDERS = [['female', 'weiblich'], ['male', 'männlich'], ['diverse', 'divers']];

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const app = $('#app');

  const S = {
    screen: 'boot',   // home | found | login | netlogin | hub
    home: null,       // sh_home
    hub: null,        // sh_enter
    session: null,
    view: 'app',      // app | admin
    tab: 'feed',      // App: feed | search | post | profile
    adminTab: 'sql', // sql | diagram | ads | settings
    adsTab: null,     // Reiter Werbung (SHAds.tab)
    db: null,
    tblSel: null,     // Lehrkraft: gewählte Tabelle im Diagramm
    autoOpened: false,
    logoUrls: {},     // Netzwerk-id → blob-Url eigenes Logo
    color: {}         // Netzwerk-id → Farbe aus dem eigenen Logo
  };
  const on = t => !!(S.hub && S.hub.tables && S.hub.tables.indexOf(t) >= 0);

  /* ── Kleinkram ──────────────────────────────────────────── */
  let toastT = null;
  function toast(msg, bad) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => { el.className = 'toast'; }, bad ? 9000 : 2600);
  }
  const fail = r => toast(A.errText(r), true);

  // Metadaten eines Fotos (0268/0269): Zeitpunkt, Kamera
  const pad2 = x => String(x).padStart(2, '0');
  const localStamp = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  function metaWhen(v) {
    // „JJJJ-MM-TT HH:MM:SS“ aus der Datei = Ortszeit wie sie dasteht; vom Server mit Zeitzone → deutsche Zeit
    const local = typeof v === 'string' && /^\d{4}-\d{2}-\d{2} /.test(v);
    const d = local ? new Date(v.replace(' ', 'T')) : new Date(v);
    return isNaN(d) ? '' : d.toLocaleString('de-DE', Object.assign({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
                                                                     local ? {} : { timeZone: 'Europe/Berlin' }));
  }
  const metaOn = () => A.state.meta === true;

  // Analytics (0270): es wird getrackt, sobald die Lehrkraft sessions erstellt hat
  // Aufdeckung: zwei Stufen der Lehrkraft – Verborgen · Jetzt zeigen (reveal + revealed:
  // öffnet sich einmal je Gerät, danach bleibt oben der Knopf zum Wieder-Anschauen)
  const revealOn = () => A.state.reveal === true;
  // Knopf „Was weiß das Netzwerk über mich?“ oben, solange die Lehrkraft ihn nicht ganz weggenommen hat
  const revealedOnce = () => revealOn() || A.state.revealed === true;
  // im Netzwerk nur, wenn dort auch mitgeschrieben wird (sessions erstellt / Klassen-Netz)
  const revealHere = () => on('sessions') && revealedOnce();
  const revealLevel = () => revealedOnce() ? 'show' : 'off';
  // Feed-Name für die views-Tabelle (profile/user-Betrachter → 'profile')
  const feedName = (m) => m === 'user' ? 'profile' : (['foryou', 'following', 'tag', 'search', 'profile'].indexOf(m) >= 0 ? m : 'foryou');

  // Tracking starten/stoppen – angemeldet, im Netzwerk, Analytics an
  function manageTrack() {
    if (!window.SHTrack) return;
    if (S.screen === 'hub' && S.hub && S.hub.me && on('sessions')) SHTrack.start(hcall, S.hub.hub.id + '.' + S.hub.me.id, S.hub.hub.name);
    else SHTrack.stop();
  }

  function ago(iso) {
    const t = Date.parse(iso);
    if (isNaN(t)) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'gerade eben';
    if (s < 3600) return 'vor ' + Math.floor(s / 60) + ' Min.';
    if (s < 86400) return 'vor ' + Math.floor(s / 3600) + ' Std.';
    if (s < 86400 * 7) return 'vor ' + Math.floor(s / 86400) + ' T.';
    return new Date(t).toLocaleDateString('de-DE');
  }
  const n = v => v == null ? '' : (v >= 10000 ? (v / 1000).toFixed(0) + 'K' : v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'K' : String(v));

  const IC = {
    heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M12 3.5c5 0 9 3.4 9 7.7 0 4.2-4 7.6-9 7.6-1 0-2-.1-2.9-.4L4 20.5l1.4-4.1C4 15 3 13.2 3 11.2 3 6.9 7 3.5 12 3.5z"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3.5 11 12 4l8.5 7v9h-5.5v-6h-6v6H3.5z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.9 2.9-6.2 6.5-6.2s6.5 2.3 6.5 6.2"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14c2.9.2 5 2.2 5 5.4"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
    unlock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/></svg>',
    key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/></svg>',
    code: '<svg viewBox="0 0 24 24"><path d="m8 7-5 5 5 5M16 7l5 5-5 5"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4.5 7.5h3l1.5-2.5h6l1.5 2.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    crop: '<svg viewBox="0 0 24 24"><path d="M6.5 2.5v14a1 1 0 0 0 1 1h14M2.5 6.5h14a1 1 0 0 1 1 1v14"/></svg>',
    thumb: '<svg viewBox="0 0 24 24"><path d="M2.5 10.5h3.6v10H2.5zM7.6 20.5V10.2l4.3-7c.4-.7 1.3-1 2.1-.6.8.4 1.2 1.3 1 2.1L14 9h5.3c1.6 0 2.7 1.5 2.3 3l-1.9 7c-.3 1-1.2 1.5-2.2 1.5z"/></svg>',
    laugh: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 1.8a10.2 10.2 0 1 1 0 20.4 10.2 10.2 0 0 1 0-20.4zM6.6 12.6h10.8a5.4 5.4 0 0 1-10.8 0zM6.4 9.6c.5-1.6 2.9-1.6 3.4 0l-1 .4c-.3-.6-1.1-.6-1.4 0zM14.2 9.6c.5-1.6 2.9-1.6 3.4 0l-1 .4c-.3-.6-1.1-.6-1.4 0z"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M10 9.5v10"/></svg>',
    table: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="7" height="6" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="6" rx="1.2"/><path d="M10.5 7.5H14a2 2 0 0 1 2 2v4"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  /* ── Logos und Farben ───────────────────────────────────── */
  function logoHtml(h, cls) {
    const c = 'logo ' + (cls || '');
    if (h.logo === 'custom') {
      const u = S.logoUrls[h.id];
      return u ? '<img class="' + c + '" src="' + esc(u) + '" alt="">' : '<span class="' + c + ' logo--wait" data-logo="' + esc(h.id) + '"></span>';
    }
    return '<img class="' + c + '" src="img/logos/' + esc(LOGOS[h.logo] ? h.logo : 'bell') + '.png" alt="">';
  }
  async function loadLogos(hubs) {
    for (const h of hubs) {
      if (h.logo !== 'custom' || S.logoUrls[h.id]) continue;
      const r = await A.call('sh_logo_get', { p_hub: h.id });
      if (!(r && r.ok && r.img)) continue;
      const bin = atob(r.img);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      S.logoUrls[h.id] = URL.createObjectURL(new Blob([arr], { type: 'image/webp' }));
      S.color[h.id] = await M.mainColor(S.logoUrls[h.id]);
      $$('[data-logo="' + h.id + '"]').forEach(el => {
        const img = document.createElement('img');
        img.className = el.className.replace('logo--wait', '');
        img.src = S.logoUrls[h.id];
        el.replaceWith(img);
      });
      if (S.hub && S.hub.hub.id === h.id) applyColor(h);
    }
  }
  const logoColor = (logo, id) => (logo === 'custom' ? S.color[id] : LOGOS[logo] && LOGOS[logo].color) || '#fe2c55';
  const accentOf = h => (h && (h.color || logoColor(h.logo, h.id))) || '#fe2c55';
  // Im Netzwerk: dessen Akzent und Schema. Draußen (null): Farben von MPSkills.
  function applyColor(h) {
    const root = document.documentElement;
    if (!h) { root.style.removeProperty('--hub'); root.removeAttribute('data-scheme'); return; }
    root.style.setProperty('--hub', accentOf(h));
    // auto = Hell/Dunkel wie MPSkills drumherum (data-theme vom Rahmen)
    if (h.scheme === 'light' || h.scheme === 'dark') root.setAttribute('data-scheme', h.scheme);
    else root.removeAttribute('data-scheme');
  }

  // Hell oder Dunkel, das gerade gilt (für 'auto' in der Vorschau)
  function themeNow() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /* ── Bilder in einem Bereich nachladen ─────────────────── */
  const seen = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      seen.unobserve(e.target);
      const el = e.target;
      if (!S.hub) continue;
      M.url(S.hub.hub.id, el.dataset.m, el.dataset.thumb === '1').then(u => {
        if (!u) { el.classList.add('img-missing'); return; }
        if (el.tagName === 'IMG') el.src = u; else el.style.backgroundImage = 'url("' + u + '")';
        el.classList.add('img-ok');
      });
    }
  }, { rootMargin: '600px 0px' });
  const hydrate = root => $$('[data-m]', root).forEach(el => { if (!el.dataset.h) { el.dataset.h = '1'; seen.observe(el); } });

  function avatarHtml(u, size) {
    const letter = esc(((u && (u.name || u.username)) || '?').trim().charAt(0).toUpperCase());
    const cls = 'av' + (size ? ' av--' + size : '');
    if (u && u.avatar) return '<span class="' + cls + '"><span class="av-l">' + letter + '</span><span class="av-img" data-m="' + esc(u.avatar) + '" data-thumb="1"></span></span>';
    return '<span class="' + cls + '"><span class="av-l">' + letter + '</span></span>';
  }

  // kleines Fenster mit Inhalt + Knöpfen
  function dialog(title, bodyHtml, buttons) {
    const el = document.createElement('div');
    el.className = 'dlg-back';
    el.innerHTML = '<div class="dlg" role="dialog"><h3>' + esc(title) + '</h3><div class="dlg-b">' + bodyHtml + '</div>' +
      '<div class="dlg-acts">' + (buttons || [['ok', 'OK', 'accent']]).map(b =>
        '<button type="button" class="btn btn--' + (b[2] || 'ghost') + '" data-dlg="' + b[0] + '">' + esc(b[1]) + '</button>').join('') + '</div></div>';
    document.body.appendChild(el);
    return new Promise(res => {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-dlg]');
        if (b || e.target === el) { el.remove(); res(b ? b.dataset.dlg : null); }
      });
    });
  }

  const brandHtml = () => '<span class="brand">Your<b>Sozial</b>Net</span>';

  /* ══ Start ═════════════════════════════════════════════════ */
  async function loadHome(quiet) {
    // App-Adresse (0275): es gibt keine Startseite, nur das Klassen-Netz
    if (A.APP) {
      if (quiet) return;
      const i = await A.loadAppInfo();
      if (!i || !i.ok) { renderError(i); return; }
      if (i.hub.locked) { renderError({ error: 'hub_locked' }); return; }
      setupAppHead(i);
      openHub(i.hub.id);
      return;
    }
    const r = await A.call('sh_home', {});
    if (!r || !r.ok) { if (!quiet) renderError(r); return; }
    // Lehrkraft: Stand der Beispieldaten (0272) – fehlt der Server-Teil, bleibt der Knopf einfach weg
    if (T) { const d = await A.call('sh_dummy_status', {}); S.dummy = d && d.ok ? d : null; }
    // ein Takt im Hintergrund darf nicht über ein Formular zeichnen
    if (quiet && S.screen !== 'home') return;
    S.home = r;
    S.hub = null;
    closeDb();
    if (window.SHTrack) SHTrack.stop();
    if (window.SHAds) SHAds.stop();
    closeReveal();
    applyColor(null);
    // Schüler: beim ersten Laden gleich ins eigene Netzwerk (gibt es ein Klassen-Netz, erst die Auswahl)
    if (!T && !S.autoOpened && r.hubs.length === 1 && r.hubs[0].id === r.mine && !r.hubs[0].locked) {
      S.autoOpened = true;
      openHub(r.hubs[0].id);
      return;
    }
    S.autoOpened = true;
    S.screen = 'home';
    renderHome();
    loadLogos(r.hubs);
  }

  function renderError(r) {
    S.screen = 'error';
    app.innerHTML = '<div class="center"><div class="card-box">' + brandHtml() + '<p>' + esc(A.errText(r)) + '</p>' +
      '<button class="btn btn--accent" id="retry">Nochmal</button></div></div>';
    $('#retry').onclick = () => loadHome();
  }

  function renderHome() {
    const h = S.home;
    let html = '<div class="home' + (T ? ' home--wide' : '') + '"><header class="home-top">' + brandHtml() +
      (T ? '<span class="chip chip--lk">Lehrkraft</span>' : '') + '</header>';
    if (T) html += teacherHome();
    else {
      // Schüler: das Klassen-Netz (0274), das eigene Netzwerk (und eines, in dem dieses Gerät angemeldet ist)
      const cls = h.hubs.filter(x => x.class), own = h.hubs.filter(x => !x.class);
      if (cls.length) {
        html += '<section class="class-sec"><h2>Klassen-Netz</h2><p class="muted small">Das Netzwerk der ganzen Klasse – registrier dich und poste mit den anderen.</p>' +
          '<div class="net-grid">' + cls.map(x => netTile(x)).join('') + '</div></section>';
      }
      if (!h.mine) {
        html += '<section class="found-cta">' +
          '<div class="fc-ic">' + IC.phone + '</div>' +
          '<h1>Dein eigenes soziales Netzwerk</h1>' +
          '<p>Gib ihm einen Namen, ein Logo und deine Farben. Du bist dort Admin.</p>' +
          '<button type="button" class="btn btn--accent btn--big" id="btnFound">Netzwerk erstellen</button></section>';
      }
      if (own.length) {
        html += '<section><h2>' + (own.length > 1 ? 'Deine Netzwerke' : 'Dein Netzwerk') + '</h2><div class="net-grid">' +
          own.map(x => netTile(x)).join('') + '</div></section>';
      }
      html += '<p class="small muted center-t"><button type="button" class="link" id="btnNetLogin">Dein Netzwerk wurde auf einem anderen Tablet erstellt? Hier anmelden</button></p>';
    }
    html += '</div>';
    // Neu zeichnen (Füllen/Leeren, Erstellen, Takt) darf nicht nach oben springen
    const oldHome = $('.home', app), oldWrap = $('.tdg-wrap', app);
    const keepY = oldHome ? oldHome.scrollTop : 0, keepX = oldWrap ? oldWrap.scrollLeft : 0;
    app.innerHTML = html;
    if (keepY && $('.home', app)) $('.home', app).scrollTop = keepY;
    if (keepX && $('.tdg-wrap', app)) $('.tdg-wrap', app).scrollLeft = keepX;
    $$('[data-open]').forEach(b => b.addEventListener('click', () => openHub(b.dataset.open)));
    if ($('#btnFound')) $('#btnFound').onclick = () => renderFound(false);
    if ($('#btnClass')) $('#btnClass').onclick = () => renderFound(true);
    if ($('#btnNetLogin')) $('#btnNetLogin').onclick = renderNetLogin;
    $$('[data-cinfo]').forEach(b => b.onclick = (e) => { e.stopPropagation(); classInfo(); });
    if (T) wireTeacher();
  }

  function netTile(x) {
    return '<button type="button" class="net-tile' + (x.locked ? ' is-locked' : '') + '" data-open="' + esc(x.id) + '" style="--c:' + esc(accentOf(x)) + '">' +
      logoHtml(x, 'logo--tile') + '<span class="nt-t"><b>' + esc(x.name) + '</b>' +
      '<small>' + x.users + ' User · ' + x.photos + ' Fotos' + (x.locked ? ' · gesperrt' : '') + '</small></span>' +
      '<span class="go">Öffnen ›</span></button>';
  }

  /* Noch nicht erstellt: blasse Zeilen oben in der Liste (golden = eigenes, blau = Klassen-Netz);
     erst nach dem Erstellen stehen sie kräftig da */
  function ghostRows() {
    const h = S.home;
    let r = '';
    if (!h.mine) r += '<div class="net-row is-mine is-ghost"><span class="nr-main"><span class="nr-ghost-ic">' + IC.phone + '</span>' +
      '<span class="nr-t"><b>Dein Netzwerk</b><small>zum Ausprobieren und Vorführen</small></span></span>' +
      '<span class="nr-acts"><button type="button" class="btn btn--s btn--gold" id="btnFound">Erstellen</button></span></div>';
    if (!h.class) r += '<div class="net-row is-class is-ghost"><span class="nr-main"><span class="nr-ghost-ic">' + IC.users + '</span>' +
      '<span class="nr-t"><b>Klassen-Netz</b><small>ein Netzwerk für die ganze Klasse</small></span></span>' +
      '<span class="nr-acts">' + classInfoBtn() + '<button type="button" class="btn btn--s btn--class" id="btnClass">Erstellen</button></span></div>';
    return r;
  }
  const classInfoBtn = () => '<button type="button" class="icon-btn icon-btn--s nr-info" data-cinfo title="Was ist das Klassen-Netz?">i</button>';
  function classInfo() {
    dialog('Das Klassen-Netz',
      '<p>Ein gemeinsames Netzwerk für die ganze Klasse – zusätzlich zu den eigenen Netzwerken.</p><ul class="dlg-list">' +
      '<li>Jeder Schüler im Raum sieht es oben auf seiner Startseite und registriert sich dort selbst als normaler User.</li>' +
      '<li>Du bist dort Admin und bleibst angemeldet. Weitere Admins machst du per SQL (<code>UPDATE users SET role = &#39;admin&#39; …</code>).</li>' +
      '<li>Alle Tabellen sind immer da, auch <code>sessions</code> und <code>views</code> – dort wird also immer mitgeschrieben. Beispieldaten gibt es keine.</li>' +
      '<li>Im Netz oben „Als App“: eigene Adresse mit Name und Logo, lässt sich auf dem Tablet installieren. Anmelden geht dort, Registrieren nur im Raum.</li>' +
      '<li>Wer nicht im Raum ist, kommt nicht hinein. Das Netz lebt so lange wie der Raum.</li></ul>');
  }

  /* ── Lehrkraft: Startseite ──────────────────────────────── */
  function teacherHome() {
    const h = S.home;
    const hubs = h.hubs;
    let html = '';
    html += '<section class="panel"><div class="panel-h"><h2>Netzwerke im Raum <span class="muted">(' + hubs.length + ')</span></h2></div>' +
      '<div class="net-list">' + ghostRows() + hubs.map(x =>
        '<div class="net-row' + (x.mine ? ' is-mine' : '') + (x.class ? ' is-class' : '') + (x.locked ? ' is-locked' : '') + '">' +
          '<button type="button" class="nr-main" data-open="' + esc(x.id) + '" title="Öffnen">' + logoHtml(x, 'logo--row') +
            '<span class="nr-t"><b>' + esc(x.name) + (x.mine ? ' <span class="badge badge--gold">Dein Netzwerk</span>' : '') + (x.class ? ' <span class="badge badge--class">Klassen-Netz</span>' : '') + '</b>' +
            '<small>' + (x.class ? esc(x.users + ' User · ' + x.photos + ' Fotos · alle Tabellen, ohne Beispieldaten')
                                 : esc(x.mine ? 'von dir' : (x.person || ''))) + (x.locked ? ' · <b class="bad">gesperrt</b>' : '') + '</small></span></button>' +
          '<span class="nr-acts">' + (x.class ? classInfoBtn() : '') +
            '<button type="button" class="icon-btn icon-btn--s" data-reset="' + esc(x.id) + '" title="Admin-Passwort zurücksetzen">' + IC.key + '</button>' +
            (x.mine ? '' : '<button type="button" class="icon-btn icon-btn--s" data-lock="' + esc(x.id) + '" data-v="' + (x.locked ? '0' : '1') + '" title="' + (x.locked ? 'Entsperren' : 'Sperren') + '">' + (x.locked ? IC.unlock : IC.lock) + '</button>') +
            '<button type="button" class="icon-btn icon-btn--s icon-btn--bad" data-del="' + esc(x.id) + '" title="Löschen">' + IC.trash + '</button>' +
          '</span></div>').join('') + '</div>' +
      (hubs.some(x => !x.mine && !x.class) ? '' : '<p class="muted small nl-empty">Sobald die Klasse im Raum ist, erstellt jede Person ihr eigenes Netzwerk.</p>') +
      '</section>';
    html += '<section class="panel"><div class="panel-h"><h2>Tabellen für alle Netzwerke</h2>' +
      '<div class="panel-sw"><label class="switch switch--s"><input type="checkbox" id="upTgl"' + (h.upload ? ' checked' : '') + '><span></span>Eigene Bilder hochladen</label>' +
        '<label class="switch switch--s" title="Aufnahmezeit und Kamera aus den Fotos mitspeichern (steht dann in photos)"><input type="checkbox" id="metaTgl"' + (metaOn() ? ' checked' : '') + '><span></span>Metadaten der Fotos speichern</label></div></div>' +
      '<p class="muted small">users gibt es immer. Jede Tabelle, die du erstellst, bringt ihre Funktion in alle Netzwerke dieses Raums' + (h.class ? ' (das Klassen-Netz hat immer alle)' : '') + '. Antippen zeigt die Attribute.' +
        (S.dummy && window.SHDummy ? ' „Füllen“ lädt Beispieldaten (70 User, Fotos, Likes, Diskussionen …) in alle Netzwerke – auch in später erstellte.' : '') + '</p>' +
      tableDiagramHtml() + '<div class="tdg-info" id="tdgInfo">' + tableInfoHtml(S.tblSel) + '</div></section>';
    // Analytics (0270): der Kasten kommt erst, wenn sessions erstellt ist – hier nur das Auflösen
    if (analyticsOn()) {
      const lv = revealLevel();
      const LV = [['off', 'Verborgen', 'Nichts verrät, dass mitgeschrieben wird.'],
                  ['show', 'Jetzt zeigen', 'Auf jedem Tablet öffnet sich einmal „Was weiß das Netzwerk über dich?“. Nach dem Wegklicken bleibt oben im Netzwerk der Knopf, damit kann es sich jeder immer wieder ansehen.']];
      html += '<section class="panel"><div class="panel-h"><h2>Analytics</h2></div>' +
        '<p class="muted small">' + (tblOn('sessions') ? 'Seit <code>sessions</code> erstellt ist, schreiben alle Netzwerke' : 'Im Klassen-Netz wird') +
        ' still mit – ohne Banner, wie eine echte Plattform: jeder Besuch mit IP, Browser, Gerät, Bildschirm' +
        (tblOn('views') || !tblOn('sessions') ? ', dazu in <code>views</code> jedes angesehene Foto mit Dauer' : '') + '. Standort, Kamera, Mikrofon und Benachrichtigungen werden nur zum Schein abgefragt – gespeichert wird, was angeklickt wurde.</p>' +
        '<div class="an-reveal"><b class="an-l">Auflösen: „Was haben wir gesammelt?“</b>' +
        '<div class="seg seg--rev" role="radiogroup">' + LV.map(x => '<button type="button" role="radio" aria-checked="' + (lv === x[0]) + '" data-rev="' + x[0] + '"' + (lv === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>').join('') + '</div>' +
        '<span class="muted small an-h">' + LV.find(x => x[0] === lv)[2] + '</span></div>' +
        '</section>';
    }
    // Arbeitsmaterial (0282): Skript, Lösungsheft und Schüler-PDF je Kurs – eigene Seite in MPSkills
    html += '<section class="panel panel--mat"><div class="panel-h"><h2>Arbeitsmaterial</h2>' +
      '<a class="btn btn--s btn--accent" href="../../material.html?tool=socialhub&amp;raum=' + encodeURIComponent(A.CODE) + '" target="_blank" rel="noopener">Öffnen</a></div>' +
      '<p class="muted small">Skript „Datenbanksysteme“ (Word, PDF) und Lösungsheft. Für diesen Kurs hakst du an, was die Klasse schon hat – daraus entsteht das Schüler-PDF.</p></section>';
    return html;
  }

  /* Tabellen-Diagramm (nur Namen, Linien = Fremdschlüssel)
     Fest angeordnet in Spalten wie das Klassendiagramm von SQL Studio:
       users │ follows, likes, comments │ photos │ photo_tag │ tags
       sessions (unter users) · views (unter photos) – Analytics (0270)
     Linien rechtwinklig (waagerecht – senkrecht – waagerecht), „n“ am
     Fremdschlüssel, „1“ an der Tabelle, auf die er zeigt. users–photos
     läuft gerade durch die Lücke zwischen likes und comments. Die
     senkrechten Stücke sind gestaffelt, damit sich nichts kreuzt. */
  // Kästen: Kopf · Erstellen/Entziehen · Daten füllen/leeren (0273)
  const BW = 148, BH = 84, GX = 60, PAD = 22, K = BH / 2;
  const colX = c => PAD + c * (BW + GX);
  const STEP = BH + 30;                                 // Abstand der Kästen in Spalte 1
  const MID = PAD + STEP + BH + 15;                     // Mittellinie: Lücke zwischen likes und comments
  const ROW2 = PAD + 2 * STEP + BH + 40;                // untere Reihe: Analytics
  const UH = 160;                                       // Höhe von users
  const TBOX = {
    users:     { x: colX(0), y: MID - UH / 2, h: UH },
    follows:   { x: colX(1), y: PAD, h: BH },
    likes:     { x: colX(1), y: PAD + STEP, h: BH },
    comments:  { x: colX(1), y: PAD + 2 * STEP, h: BH },
    photos:    { x: colX(2), y: MID - K, h: BH },
    photo_tag: { x: colX(3), y: MID - K, h: BH },
    tags:      { x: colX(4), y: MID - K, h: BH },
    sessions:  { x: colX(0), y: ROW2, h: BH },
    views:     { x: colX(2), y: ROW2, h: BH },
    // Werbung (0276): über users
    ads:       { x: colX(0), y: PAD, h: BH }
  };
  const TW = colX(5) - GX + PAD, TH = ROW2 + BH + PAD;
  // [Tabelle mit Fremdschlüssel, Ziel, y an der Quelle, y am Ziel (relativ), senkrecht bei (Anteil der Lücke)]
  const TEDGES = [
    ['follows',   'users',  24, 14, 0.28], ['follows', 'users', 52, 32, 0.5],
    ['likes',     'users',  K, 52, 0.72],  ['photos',  'users', K, UH / 2, 0.5],
    ['comments',  'users',  K, 112, 0.5],
    ['likes',     'photos', K, 12, 0.5],   ['comments', 'photos', K, BH - 12, 0.5],
    ['photo_tag', 'photos', K, K, 0.5],    ['photo_tag', 'tags', K, K, 0.5],
    // views → users: unten links raus, dicht an users hoch (läuft rechts an sessions vorbei)
    ['views',     'users',  22, UH - 12, 0.03], ['views', 'sessions', 56, 56, 0.5]
  ];
  // senkrecht von oben aus der Quelle in den Boden des Ziels (gleiche Spalte)
  const TVEDGES = [['sessions', 'users'], ['views', 'photos'], ['ads', 'users']];
  // Pfad mit kleinen Rundungen an den Ecken
  function roundPath(pts, r) {
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const k1 = Math.min(r, Math.hypot(x1 - x0, y1 - y0) / 2), k2 = Math.min(r, Math.hypot(x2 - x1, y2 - y1) / 2);
      const ax = x1 - Math.sign(x1 - x0) * k1, ay = y1 - Math.sign(y1 - y0) * k1;
      const bx = x1 + Math.sign(x2 - x1) * k2, by = y1 + Math.sign(y2 - y1) * k2;
      d += ' L' + ax + ' ' + ay + ' Q' + x1 + ' ' + y1 + ' ' + bx + ' ' + by;
    }
    const e = pts[pts.length - 1];
    return d + ' L' + e[0] + ' ' + e[1];
  }
  function tableLinesSvg() {
    let out = '';
    TEDGES.forEach(([src, dst, sy, ty, f]) => {
      const a = TBOX[src], b = TBOX[dst];
      const right = b.x > a.x;                       // Ziel rechts von der Quelle?
      const x1 = right ? a.x + BW : a.x, y1 = a.y + sy;
      const x2 = right ? b.x : b.x + BW, y2 = b.y + ty;
      const vx = Math.round(Math.min(x1, x2) + Math.abs(x2 - x1) * f);   // f = Anteil von links
      const pts = y1 === y2 ? [[x1, y1], [x2, y2]] : [[x1, y1], [vx, y1], [vx, y2], [x2, y2]];
      const cls = tblOn(src) && tblOn(dst) ? 'on' : 'off';
      const dir = right ? 1 : -1;
      out += '<path d="' + roundPath(pts, 6) + '" class="' + cls + '"/>' +
        '<text x="' + (x1 + dir * 5) + '" y="' + (y1 - 4) + '" class="' + cls + '" text-anchor="' + (right ? 'start' : 'end') + '">n</text>' +
        '<text x="' + (x2 - dir * 5) + '" y="' + (y2 - 4) + '" class="' + cls + '" text-anchor="' + (right ? 'end' : 'start') + '">1</text>';
    });
    TVEDGES.forEach(([src, dst]) => {
      const a = TBOX[src], b = TBOX[dst];
      const down = a.y < b.y;                         // Quelle über dem Ziel (ads → users)
      const x = a.x + BW / 2, y1 = down ? a.y + a.h : a.y, y2 = down ? b.y : b.y + b.h;
      const cls = tblOn(src) && tblOn(dst) ? 'on' : 'off';
      out += '<path d="M' + x + ' ' + y1 + ' L' + x + ' ' + y2 + '" class="' + cls + '"/>' +
        '<text x="' + (x + 6) + '" y="' + (down ? y1 + 14 : y1 - 6) + '" class="' + cls + '">n</text>' +
        '<text x="' + (x + 6) + '" y="' + (down ? y2 - 6 : y2 + 14) + '" class="' + cls + '">1</text>';
    });
    return out;
  }
  function parseDdl(t) {
    const ddl = (window.SHDB && window.SHDB.DDL[t]) || '';
    const body = ddl.slice(ddl.indexOf('(') + 1, ddl.lastIndexOf(')'));
    const cols = [], fks = {};
    let pk = [];
    body.split('\n').map(l => l.trim().replace(/,$/, '')).filter(Boolean).forEach(l => {
      let m;
      if ((m = /^PRIMARY KEY \(([^)]+)\)/i.exec(l))) { pk = m[1].split(',').map(x => x.trim()); return; }
      if ((m = /^FOREIGN KEY \((\w+)\) REFERENCES (\w+)\((\w+)\)/i.exec(l))) { fks[m[1]] = m[2]; return; }
      m = /^(\w+)\s+(\w+(?:\([^)]*\))?)(.*)$/.exec(l);
      if (!m) return;
      if (/PRIMARY KEY/i.test(m[3])) pk.push(m[1]);
      cols.push({ name: m[1], type: m[2], extra: m[3] });
    });
    cols.forEach(c => { c.pk = pk.indexOf(c.name) >= 0; c.fk = fks[c.name] || null; });
    return cols;
  }
  const tblOn = t => t === 'users' || S.home.tables.indexOf(t) >= 0;
  // Analytics laufen: sessions erstellt oder es gibt das Klassen-Netz (dort immer alle Tabellen)
  const analyticsOn = () => tblOn('sessions') || !!S.home.class;
  function tableDiagramHtml() {
    return '<div class="tdg-wrap"><div class="tdg" id="tdg" style="width:' + TW + 'px;height:' + TH + 'px">' +
      '<svg class="tdg-lines" id="tdgLines" width="' + TW + '" height="' + TH + '" viewBox="0 0 ' + TW + ' ' + TH + '">' + tableLinesSvg() + '</svg>' +
      Object.keys(TBOX).map(t => {
        const fixed = t === 'users';
        const isOn = tblOn(t);
        const def = TABLES.find(x => x.id === t);
        // photo_tag kommt mit tags
        const auto = t === 'photo_tag';
        const missing = def && def.needs ? def.needs.filter(x => !tblOn(x)) : [];
        const blocked = missing.length > 0;
        let act = '';
        if (fixed) act = '<span class="tb-note">' + IC.lock + ' immer da</span>';
        else if (auto) act = '<span class="tb-note">kommt mit tags</span>';
        else if (isOn) act = '<button type="button" class="tb-btn" data-tdrop="' + t + '" title="Entziehen">' + IC.x + 'Entziehen</button>';
        else act = '<button type="button" class="tb-btn tb-btn--add" data-tadd="' + t + '"' + (blocked ? ' disabled title="Erst ' + missing.join(' und ') + ' erstellen"' : ' title="Erstellen"') + '>' + IC.plus + 'Erstellen</button>';
        const b = TBOX[t];
        return '<div class="tb' + (fixed ? ' tb--fixed' : isOn ? ' tb--on' : ' tb--off') + (S.tblSel === t ? ' tb--sel' : '') + '" data-tb="' + t + '" ' +
          'style="left:' + b.x + 'px;top:' + b.y + 'px;width:' + BW + 'px;height:' + b.h + 'px" tabindex="0">' +
          '<div class="tb-h"><code>' + esc(t) + '</code></div><div class="tb-b">' + act + '</div>' + dummyRowHtml(t, isOn) + '</div>';
      }).join('') + '</div></div>';
  }
  /* ── Beispieldaten (0272): je Tabelle „Daten laden“ ──────────
     Der Browser baut die Zeilen (dummy/generator.js, Stichtag = Raum
     erstellt), schickt sie einmal (sh_dummy_put) und füllt dann die
     Netzwerke einzeln (sh_dummy_load). Spätere Netzwerke füllt der Server. */
  const DNEEDS = { users: [], photos: ['users'], tags: ['photos'], follows: ['users'], likes: ['users', 'photos'],
                   comments: ['users', 'photos'], sessions: ['users'], views: ['photos', 'sessions'], ads: [] };
  const DWHAT = { users: '70 Beispiel-User', photos: 'die Beispiel-Fotos', tags: 'die Tags und ihre Zuordnung zu den Fotos', follows: 'wer wem folgt',
                  likes: 'die Likes', comments: 'die Kommentare und Diskussionen', sessions: 'die Besuche (Geräte, IPs, Uhrzeiten)', views: 'die angesehenen Fotos',
                  ads: '9 Beispiel-Kampagnen (Werbung, auch ins Klassen-Netz)' };
  const dStored = t => !!(S.dummy && S.dummy.stored.indexOf(t) >= 0);
  // Beispieldaten nur für die eigenen Netzwerke – das Klassen-Netz füllt die Klasse selbst (0274)
  // … außer der Werbung (0276): die Beispiel-Kampagnen kommen auch ins Klassen-Netz
  const dummyHubs = t => S.home.hubs.filter(h => !h.class || t === 'ads');
  const dLoaded = (h, t) => h.class ? !!(S.dummy.class && S.dummy.class.dummy && t in S.dummy.class.dummy) : !!(S.dummy.hubs[h.id] && t in S.dummy.hubs[h.id]);
  const dAll = t => !!S.dummy && dummyHubs(t).every(h => dLoaded(h, t));
  // Unterste Zeile der Kachel: „Daten: leer · Füllen“ / „Daten: gefüllt · Leeren“
  function dummyRowHtml(t, isOn) {
    if (!S.dummy || !window.SHDummy) return '';
    if (t === 'photo_tag') return '<div class="tb-d tb-d--note"><span>Daten: <b>mit tags</b></span></div>';
    if (!DNEEDS[t] || !isOn) return '<div class="tb-d tb-d--off"></div>';
    if (dStored(t) && dAll(t)) return '<div class="tb-d tb-d--full"><span>Daten: <b>gefüllt</b></span>' +
      '<button type="button" class="tb-dbtn tb-dbtn--clear" data-dclear="' + t + '" title="Beispieldaten aus allen Netzwerken entfernen">Leeren</button></div>';
    const miss = DNEEDS[t].filter(x => !dStored(x));
    return '<div class="tb-d"><span>Daten: <b>' + (dStored(t) ? 'teils' : 'leer') + '</b></span>' +
      '<button type="button" class="tb-dbtn" data-dload="' + t + '"' + (miss.length ? ' disabled title="Erst ' + esc(miss.join(' und ')) + ' füllen"' : ' title="Beispieldaten in alle Netzwerke laden"') + '>Füllen</button></div>';
  }
  // Wer beim Leeren mitgeht (wie sh_dummy_deps, Migration 0273)
  const DDEPS = { users: ['photos', 'tags', 'follows', 'likes', 'comments', 'sessions', 'views'], photos: ['tags', 'likes', 'comments', 'views'], sessions: ['views'] };
  async function clearDummy(t) {
    if (!S.dummy) return;
    const hubs = dummyHubs(t);
    const also = (DDEPS[t] || []).filter(dStored);
    if (await dialog('Beispieldaten leeren',
      '<p>Entfernt die Beispieldaten von <b>' + esc(t) + '</b> aus ' + (hubs.length === 1 ? 'dem Netzwerk' : 'allen ' + hubs.length + ' Netzwerken') + '.' +
        (also.length ? ' Mit geleert wird, was daran hängt: <b>' + esc(also.join(', ')) + '</b>.' : '') + '</p>' +
      '<p class="muted small">Was die Klasse an diesen Beispielzeilen geändert hat, ist dann weg. Eigene Einträge der Klasse (eigene Konten, Fotos, Likes …) bleiben. Neue Netzwerke bekommen diese Daten nicht mehr.</p>',
      [['no', 'Abbrechen'], ['yes', 'Leeren', 'bad']]) !== 'yes') return;
    const box = document.createElement('div');
    box.className = 'dlg-back dlg-back--busy';
    box.innerHTML = '<div class="dlg" role="dialog"><h3>Beispieldaten</h3><div class="dlg-b"><p id="dlProg">Leere …</p></div></div>';
    document.body.appendChild(box);
    const prog = (m) => { const el = box.querySelector('#dlProg'); if (el) el.textContent = m; };
    try {
      let i = 0;
      for (const h of hubs) {
        prog('Netzwerk ' + (++i) + ' von ' + hubs.length + ': ' + h.name);
        const r = await A.call('sh_dummy_clear', { p_tbl: t, p_hub: h.id });
        if (!r || !r.ok) { fail(r); return; }
      }
      const r = await A.call('sh_dummy_clear', { p_tbl: t, p_hub: null });
      if (!r || !r.ok) { fail(r); return; }
      toast('Beispieldaten von ' + t + ' geleert.');
    } finally {
      box.parentNode && box.parentNode.removeChild(box);
      await loadHome();
    }
  }
  async function loadDummy(t) {
    if (!S.dummy || !window.SHDummy) return;
    const hubs = dummyHubs(t);
    const again = dStored(t);
    if (await dialog(again ? 'Beispieldaten nachladen' : 'Beispieldaten laden',
      '<p>Lädt <b>' + esc(DWHAT[t]) + '</b> in <b>' + (hubs.length === 1 ? 'das Netzwerk' : 'alle ' + hubs.length + ' Netzwerke') + '</b> dieses Raums – Netzwerke, die später erstellt werden, bekommen sie automatisch.</p>' +
      '<p class="muted small">Jedes Netzwerk bekommt die Daten nur einmal; Vorhandenes bleibt. Beispiel-User sind normale Konten, nie Admin. Wieder entfernen geht per SQL (<code>DELETE</code>).</p>',
      [['no', 'Abbrechen'], ['yes', 'Laden', 'accent']]) !== 'yes') return;
    const box = document.createElement('div');
    box.className = 'dlg-back dlg-back--busy';
    box.innerHTML = '<div class="dlg" role="dialog"><h3>Beispieldaten</h3><div class="dlg-b"><p id="dlProg">Daten werden erzeugt …</p></div></div>';
    document.body.appendChild(box);
    const prog = (m) => { const el = box.querySelector('#dlProg'); if (el) el.textContent = m; };
    try {
      const D = SHDummy.build({ stichtag: S.dummy.stichtag, netz: '{netz}' });
      for (const x of (t === 'tags' ? ['tags', 'photo_tag'] : [t])) {
        prog('Speichere ' + x + ' …');
        const r = await A.call('sh_dummy_put', { p_tbl: x, p_cols: D[x].cols, p_rows: D[x].rows });
        if (!r || !r.ok) { fail(r); return; }
      }
      let i = 0;
      for (const h of hubs) {
        prog('Netzwerk ' + (++i) + ' von ' + hubs.length + ': ' + h.name);
        const r = await A.call('sh_dummy_load', { p_tbl: t, p_hub: h.id });
        if (!r || (!r.ok && r.error !== 'needs')) { fail(r); return; }
      }
      toast('Beispieldaten für ' + t + ' geladen.');
    } finally {
      box.parentNode && box.parentNode.removeChild(box);
      await loadHome();
    }
  }
  function tableInfoHtml(t) {
    if (!t) return '';
    const def = TABLES.find(x => x.id === t);
    const what = t === 'users' ? 'Konten, Profile, Anmelden – immer da' : t === 'photo_tag' ? 'verbindet photos und tags (n:m), kommt mit tags' : def.what;
    return '<div class="ti-h"><code>' + esc(t) + '</code><span>' + esc(what) + '</span>' +
      '<button type="button" class="icon-btn icon-btn--s" id="tiClose" title="Schließen">' + IC.x + '</button></div>' +
      '<table class="ti"><tbody>' + parseDdl(t).map(c =>
        '<tr><td class="ti-n">' + (c.pk ? '<span class="k k--pk" title="Primärschlüssel">PK</span>' : '') +
          (c.fk ? '<span class="k k--fk" title="Fremdschlüssel">FK</span>' : '') + '<b' + (c.pk ? ' class="u"' : '') + '>' + esc(c.name) + '</b>' + (c.fk ? ' ↑' : '') + '</td>' +
        '<td class="ti-t">' + esc(c.type) + '</td>' +
        '<td class="ti-x">' + (c.fk ? '→ ' + esc(c.fk) : '') + (/NOT NULL/i.test(c.extra) ? ' <span>NOT NULL</span>' : '') + (/UNIQUE/i.test(c.extra) ? ' <span>UNIQUE</span>' : '') + '</td></tr>').join('') +
      '</tbody></table>';
  }
  // Linien neu (z. B. nach Hell/Dunkel); Lage steht fest, nichts zu messen
  function drawTableLines() {
    const svg = $('#tdgLines');
    if (svg) svg.innerHTML = tableLinesSvg();
  }

  function wireTeacher() {
    const save = async (tables, upload, extra) => {
      const next = Object.assign({}, A.state, { tables, upload }, extra || {});
      // ohne Analytics ist eine Aufdeckung sinnlos → mit weg
      if (tables.indexOf('sessions') < 0 && !S.home.class) { next.reveal = false; next.revealed = false; }
      const r = await A.setData(next);
      if (!r || r.ok === false) { fail(r); return; }
      await loadHome();
    };
    // Liste wie in data.tables (ohne users/photo_tag, die ergeben sich)
    const cur = () => S.home.tables.filter(t => t !== 'users' && t !== 'photo_tag');
    $$('[data-tadd]').forEach(b => b.onclick = (e) => { e.stopPropagation(); save(cur().concat(b.dataset.tadd), S.home.upload); });
    $$('[data-tdrop]').forEach(b => b.onclick = async (e) => {
      e.stopPropagation();
      const gone = [b.dataset.tdrop].concat(dependents(b.dataset.tdrop));
      const also = gone.slice(1).filter(t => S.home.tables.indexOf(t) >= 0);
      if (also.length && await dialog('Tabelle entziehen', '<p>Damit verschwinden auch: <b>' + esc(also.join(', ')) + '</b>.</p><p class="muted small">Die Daten bleiben und kommen beim erneuten Erstellen zurück.</p>',
        [['no', 'Abbrechen'], ['yes', 'Entziehen', 'accent']]) !== 'yes') return;
      save(cur().filter(t => gone.indexOf(t) < 0), S.home.upload);
    });
    $$('[data-dload]').forEach(b => b.onclick = (e) => { e.stopPropagation(); loadDummy(b.dataset.dload); });
    $$('[data-dclear]').forEach(b => b.onclick = (e) => { e.stopPropagation(); clearDummy(b.dataset.dclear); });
    $$('[data-tb]').forEach(el => el.onclick = () => {
      S.tblSel = S.tblSel === el.dataset.tb ? null : el.dataset.tb;
      $$('[data-tb]').forEach(x => x.classList.toggle('tb--sel', x.dataset.tb === S.tblSel));
      $('#tdgInfo').innerHTML = tableInfoHtml(S.tblSel);
      wireInfo();
    });
    const wireInfo = () => { if ($('#tiClose')) $('#tiClose').onclick = () => { S.tblSel = null; $$('[data-tb]').forEach(x => x.classList.remove('tb--sel')); $('#tdgInfo').innerHTML = ''; }; };
    wireInfo();
    $('#upTgl').onchange = (e) => save(cur(), e.target.checked);
    $('#metaTgl').onchange = async (e) => {
      if (e.target.checked && await dialog('Metadaten speichern',
        '<p>Ab jetzt speichern alle Netzwerke dieses Raums bei neuen Fotos <b>Aufnahmezeit und Kamera</b> (Spalten <code>taken_at</code> und <code>camera</code> in <code>photos</code>). Den Ort speichert YourSozialNet nie.</p>' +
        '<p class="muted small">Die Klasse sieht beim Posten, was mitgespeichert wird. Ausschalten speichert nichts Neues mehr; Gespeichertes löscht ihr per SQL oder mit dem Foto.</p>',
        [['no', 'Abbrechen'], ['yes', 'Einschalten', 'accent']]) !== 'yes') { e.target.checked = false; return; }
      save(cur(), S.home.upload, { meta: e.target.checked });
    };
    $$('[data-rev]').forEach(b => b.onclick = async () => {
      const lv = b.dataset.rev;
      if (lv === revealLevel()) return;
      $$('[data-rev]').forEach(x => { x.disabled = true; x.classList.toggle('on', x === b); });
      await save(cur(), S.home.upload, { reveal: lv === 'show', revealed: lv === 'show' });
    });
    $$('[data-lock]').forEach(b => b.onclick = async () => {
      const r = await A.call('sh_hub_lock', { p_hub: b.dataset.lock, p_locked: b.dataset.v === '1' });
      if (!r.ok) fail(r); else loadHome();
    });
    $$('[data-del]').forEach(b => b.onclick = async () => {
      const x = S.home.hubs.find(h => h.id === b.dataset.del);
      if (await dialog('Netzwerk löschen?', '<p><b>' + esc(x ? x.name : '') + '</b> mit allen Usern, Fotos und Likes endgültig löschen?</p>',
        [['no', 'Abbrechen'], ['yes', 'Löschen', 'bad']]) !== 'yes') return;
      const r = await A.call('sh_hub_delete', { p_hub: b.dataset.del });
      if (!r.ok) fail(r); else loadHome();
    });
    $$('[data-reset]').forEach(b => b.onclick = async () => {
      const x = S.home.hubs.find(h => h.id === b.dataset.reset);
      if (await dialog('Admin-Passwort zurücksetzen?', '<p>Das Admin-Konto von <b>' + esc(x ? x.name : '') + '</b> bekommt ein neues Passwort. Angemeldete Geräte werden abgemeldet.</p>',
        [['no', 'Abbrechen'], ['yes', 'Zurücksetzen', 'accent']]) !== 'yes') return;
      const r = await A.call('sh_admin_reset', { p_hub: b.dataset.reset });
      if (!r || !r.ok) { fail(r); return; }
      dialog('Neue Anmeldedaten', '<div class="cred"><span>Anmeldename</span><code>' + esc(r.username) + '</code><span>Passwort</span><code>' + esc(r.password) + '</code></div>' +
        '<p class="muted small">Nur hier zu sehen – gib sie der Person weiter.</p>');
    });
    requestAnimationFrame(drawTableLines);
  }
  window.addEventListener('resize', () => { if (S.screen === 'home' && T) drawTableLines(); });

  /* ── Gestaltung: Name, Logo, Farbschema (Gründen + Einstellungen) ─ */
  function logoPicker(sel, customUrl) {
    return '<div class="logo-pick">' + Object.keys(LOGOS).map(id =>
      '<button type="button" class="lp' + (sel === id ? ' on' : '') + '" data-logo-id="' + id + '" title="' + esc(LOGOS[id].name) + '">' +
      '<img src="img/logos/' + id + '.png" alt="' + esc(LOGOS[id].name) + '"></button>').join('') +
      '<button type="button" class="lp lp--custom' + (sel === 'custom' ? ' on' : '') + '" data-logo-id="custom" title="Eigenes Logo hochladen">' +
        (customUrl ? '<img src="' + esc(customUrl) + '" alt="">' : IC.image + '<small>Eigenes</small>') + '</button>' +
      '</div>';
  }

  /* init: { id, name, logo, color, scheme } · o.live: Farben gleich auf
     die ganze Seite (im Netzwerk) · o.onSubmit(v) mit v = { name, logo,
     custom, color, scheme } */
  function brandEditor(host, init, o) {
    const v = { name: init.name || '', logo: init.logo || 'rocket', custom: null, color: init.color || null, scheme: init.scheme || 'auto' };
    // neues Netzwerk: Name aus Startup Story vorschlagen
    if (!v.name && LOGOS[v.logo]) v.name = LOGOS[v.logo].dflt;
    const id = init.id || '_new';
    const customUrl = () => v.custom ? v.custom.preview : (init.logo === 'custom' ? S.logoUrls[id] : null);
    const lc = () => v.logo === 'custom' ? (v.custom ? S.color._new : S.color[id]) || '#fe2c55' : LOGOS[v.logo].color;
    const accent = () => v.color || lc();
    const live = () => { if (o.live) applyColor({ id, logo: v.logo, color: accent(), scheme: v.scheme }); };
    const mock = () => {
      const lg = v.logo === 'custom' ? (customUrl() ? '<img class="logo logo--s" src="' + esc(customUrl()) + '" alt="">' : '<span class="logo logo--s logo--wait"></span>')
                                     : '<img class="logo logo--s" src="img/logos/' + v.logo + '.png" alt="">';
      return '<div class="mock" data-mock="' + (v.scheme === 'auto' ? themeNow() : v.scheme) + '" style="--mc:' + esc(accent()) + '">' +
        '<div class="mk-top">' + lg + '<b>' + esc(v.name || 'Dein Netzwerk') + '</b></div>' +
        '<div class="mk-card"><span class="mk-heart">' + IC.heart + '</span><span class="mk-user">@admin</span><span class="mk-tag">#vorschau</span></div>' +
        '<div class="mk-row"><span class="mk-btn">Folgen</span><span class="mk-link">12 Follower</span></div>' +
        '<div class="mk-nav">' + IC.home + IC.search + '<span class="mk-plus">' + IC.plus + '</span>' + IC.user + '</div></div>';
    };
    const paint = () => {
      host.innerHTML = '<form class="brand-ed" autocomplete="off">' +
        '<div class="be-form form">' +
          '<div class="lbl">Logo</div>' + logoPicker(v.logo, customUrl()) +
          '<input type="file" accept="image/*" id="beFile" hidden>' +
          '<label>Name des Netzwerks<input name="name" maxlength="30" required placeholder="z. B. ' + esc(LOGOS[v.logo] ? LOGOS[v.logo].dflt : 'Pixelwelt') + '" value="' + esc(v.name) + '"></label>' +
          '<div class="lbl">Farbschema</div>' +
          '<div class="seg seg--s">' + [['auto', 'Auto'], ['light', 'Hell'], ['dark', 'Dunkel']].map(x =>
            '<button type="button" data-sc="' + x[0] + '"' + (v.scheme === x[0] ? ' class="on"' : '') + (x[0] === 'auto' ? ' title="Wie MPSkills: hell oder dunkel"' : '') + '>' + x[1] + '</button>').join('') + '</div>' +
          '<div class="lbl">Akzentfarbe <span class="muted">– passt sich dem Logo an, du kannst nachjustieren</span></div>' +
          '<div class="swatches">' +
            '<button type="button" class="sw sw--auto' + (!v.color ? ' on' : '') + '" data-col="" style="--c:' + esc(lc()) + '" title="Farbe aus dem Logo"><span>Logo</span></button>' +
            SWATCHES.map(c => '<button type="button" class="sw' + (v.color === c ? ' on' : '') + '" data-col="' + c + '" style="--c:' + c + '" title="' + c + '"></button>').join('') +
            '<label class="sw sw--pick' + (v.color && SWATCHES.indexOf(v.color) < 0 ? ' on' : '') + '" title="Eigene Farbe" style="--c:' + esc(v.color && SWATCHES.indexOf(v.color) < 0 ? v.color : 'transparent') + '">' +
              '<input type="color" id="beColor" value="' + esc(accent().slice(0, 7)) + '">+</label>' +
          '</div>' +
          '<button class="btn btn--accent btn--big" type="submit">' + esc(o.submitLabel || 'Speichern') + '</button>' +
        '</div>' +
        '<div class="be-prev"><div class="lbl">Vorschau</div><div id="beMock">' + mock() + '</div></div>' +
        '</form>';
      const f = $('form', host);
      f.name.oninput = () => { v.name = f.name.value; $('#beMock', host).innerHTML = mock(); };
      $$('.lp', host).forEach(b => b.onclick = () => {
        if (b.dataset.logoId === 'custom' && (v.logo === 'custom' || !customUrl())) { $('#beFile', host).click(); return; }
        // Name war noch ein Vorschlag (oder leer)? Dann den des neuen Logos nehmen
        if (!init.id && LOGOS[b.dataset.logoId] && isDefaultName(v.name.trim())) v.name = LOGOS[b.dataset.logoId].dflt;
        v.logo = b.dataset.logoId; paint(); live();
      });
      $('#beFile', host).onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          v.custom = await M.compressLogo(file); v.logo = 'custom';
          S.color._new = await M.mainColor(v.custom.preview);
          paint(); live();
        } catch (err) { toast(err.message, true); }
      };
      $$('[data-sc]', host).forEach(b => b.onclick = () => { v.scheme = b.dataset.sc; paint(); live(); });
      $$('[data-col]', host).forEach(b => b.onclick = () => { v.color = b.dataset.col || null; paint(); live(); });
      $('#beColor', host).oninput = (e) => { v.color = e.target.value.toLowerCase(); $('#beMock', host).innerHTML = mock(); live(); };
      $('#beColor', host).onchange = () => paint();
      f.onsubmit = (e) => { e.preventDefault(); v.name = f.name.value.trim(); o.onSubmit(v); };
    };
    paint();
    live();
  }

  /* ── Schritt 1: Netzwerk erstellen ──────────────────────── */
  // cls: Klassen-Netz der Lehrkraft (0274)
  function renderFound(cls) {
    S.screen = 'found';
    app.innerHTML = '<div class="home home--wide"><header class="home-top"><button class="icon-btn" id="back" title="Zurück">' + IC.back + '</button>' +
      '<span class="brand">' + (cls ? 'Klassen-Netz erstellen' : 'Netzwerk erstellen') + '</span></header>' +
      '<ol class="steps"><li class="on"><b>1</b> Logo, Name, Farben</li><li><b>2</b> Dein Admin-Konto</li></ol>' +
      '<div id="foundEd"></div></div>';
    $('#back').onclick = () => { S.screen = 'home'; renderHome(); };
    brandEditor($('#foundEd'), { name: '', logo: 'rocket', scheme: 'auto' }, {
      submitLabel: 'Weiter',
      onSubmit: async (v) => {
        const r = await A.call('sh_found', Object.assign({ p_name: v.name, p_logo: v.logo === 'custom' ? 'rocket' : v.logo, p_color: v.color, p_scheme: v.scheme },
                                                         cls ? { p_class: true } : {}));
        if (!r || !r.ok) { fail(r); return; }
        if (v.logo === 'custom' && v.custom) {
          // eigenes Logo: der Gründer ist schon Admin, auch ohne Konto
          const b = await A.call('sh_brand', { p_hub: r.hub, p_session: null, p_name: v.name, p_logo: 'custom', p_logo_img: v.custom.data, p_color: v.color, p_scheme: v.scheme });
          if (b && b.ok) { S.logoUrls[r.hub] = v.custom.preview; S.color[r.hub] = S.color._new; } else fail(b);
        }
        openHub(r.hub);
      }
    });
  }

  /* ── Schüler auf einem anderen Tablet ───────────────────── */
  function renderNetLogin() {
    S.screen = 'netlogin';
    app.innerHTML = '<div class="home"><header class="home-top"><button class="icon-btn" id="back" title="Zurück">' + IC.back + '</button>' + brandHtml() + '</header>' +
      '<form class="form card-form" id="nlForm" autocomplete="off"><h2>In dein Netzwerk anmelden</h2>' +
      '<p class="muted small">Für ein Netzwerk, das auf einem anderen Tablet erstellt wurde.</p>' +
      '<label>Name des Netzwerks<input name="net" required maxlength="30" placeholder="z. B. Pixelwelt"></label>' +
      '<label>Benutzername<input name="user" required autocapitalize="off" value="admin"></label>' +
      '<label>Passwort<input name="pw" type="password" required></label>' +
      keepHtml() +
      '<button class="btn btn--accent btn--big">Anmelden</button>' +
      '<p class="muted small">Passwort vergessen? Die Lehrkraft kann das Admin-Passwort zurücksetzen.</p></form></div>';
    $('#back').onclick = () => { S.screen = 'home'; renderHome(); };
    $('#nlForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await A.call('sh_login_net', { p_net: f.net.value.trim(), p_username: f.user.value.trim(), p_password: f.pw.value });
      if (!r || !r.ok) { fail(r); return; }
      A.session.set(r.hub, r.session, f.keep.checked);
      openHub(r.hub);
    };
  }

  const keepHtml = () => T ? '<input type="checkbox" name="keep" checked hidden>' :
    '<label class="check"><input type="checkbox" name="keep"' + (A.session.keepDefault() ? ' checked' : '') + '><span></span>Angemeldet bleiben</label>';

  /* ══ Netzwerk betreten ═════════════════════════════════════ */
  async function openHub(id) {
    const sess = A.session.get(id);
    const r = await A.call('sh_enter', { p_hub: id, p_session: sess });
    if (!r || !r.ok) {
      if (A.APP) { renderError(r); return; }
      fail(r);
      if (r && /^hub_/.test(r.error)) { S.autoOpened = true; loadHome(); }
      return;
    }
    S.hub = r;
    S.session = r.session || null;
    if (S.session !== sess) A.session.set(id, S.session);
    applyColor(r.hub);
    loadLogos([r.hub]);
    S.view = 'app';
    S.tab = 'feed';
    S.feedMode = 'foryou';
    S.adminTab = 'sql';
    if (r.needs_admin) renderLogin('admin');
    // Lehrkraft schaut ohne Konto zu (Admin), kann sich aber oben anmelden
    else if (!r.me && !T) renderLogin(r.hub.class && !sess ? 'reg' : 'login');
    else renderHub();
  }

  async function refreshHub() {
    if (!S.hub) return null;
    const r = await A.call('sh_enter', { p_hub: S.hub.hub.id, p_session: S.session });
    if (r && r.ok) {
      S.hub = r;
      if ((r.session || null) !== S.session) { S.session = r.session || null; A.session.set(r.hub.id, S.session); }
    }
    return r;
  }

  // hcall: Aufruf im Netzwerk mit Sitzung
  const hcall = (fn, args) => A.call(fn, Object.assign({ p_hub: S.hub.hub.id, p_session: S.session }, args || {}));

  /* ── Anmelden / Registrieren ───────────────────────────── */
  // mode: login | reg | admin (Schritt 2: erstes Konto = Admin)
  function renderLogin(mode) {
    S.screen = 'login';
    if (window.SHTrack) SHTrack.stop();
    const h = S.hub.hub;
    // Klassen-Netz: registrieren im Raum – über die App-Adresse nur anmelden (0275)
    const canReg = !A.APP && (S.hub.founder || T || !!h.class);
    if (mode === 'reg' && !canReg) mode = 'login';
    const isAdmin = mode === 'admin';
    const genderSel = '<select name="gender"><option value="">Geschlecht …</option>' + GENDERS.map(g => '<option value="' + g[0] + '">' + g[1] + '</option>').join('') + '</select>';
    app.innerHTML = '<div class="login">' +
      (A.APP ? '' : '<button class="icon-btn login-back" id="back" title="Zurück">' + IC.back + '</button>') +
      '<div class="login-box">' +
      (isAdmin ? '<ol class="steps steps--s"><li><b>' + IC.check + '</b> Netzwerk</li><li class="on"><b>2</b> Admin-Konto</li></ol>' : '') +
      logoHtml(h, 'logo--big') + '<h1>' + esc(h.name) + '</h1>' +
      (isAdmin ? '<p class="login-sub">Leg dein Admin-Konto an. Alles außer Benutzername und Passwort ist Deko – und darf ausgedacht sein.</p>'
        : canReg ? '<div class="seg"><button type="button" data-m="login"' + (mode === 'login' ? ' class="on"' : '') + '>Anmelden</button>' +
                   '<button type="button" data-m="reg"' + (mode === 'reg' ? ' class="on"' : '') + '>Registrieren</button></div>' : '') +
      (mode === 'login'
        ? '<form class="form" id="lForm" autocomplete="off"><input name="user" placeholder="Benutzername" autocapitalize="off" required>' +
          '<input name="pw" type="password" placeholder="Passwort" required>' + keepHtml() +
          '<button class="btn btn--accent btn--big" type="submit">Anmelden</button>' +
          '<p class="muted small center-t">Passwort vergessen? ' + (T ? 'Als Lehrkraft bist du hier ohnehin Admin.' : h.class ? 'Frag die Lehrkraft.' : 'Die Lehrkraft kann das Admin-Passwort zurücksetzen.') + '</p>' +
          (A.APP ? '<p class="muted small center-t">Noch kein Konto? Das legst du im Unterricht im Raum an.</p><p class="center-t">' + installHtml() + '</p>' : '') + '</form>'
        : '<form class="form" id="rForm" autocomplete="off">' +
          '<label>Benutzername<input name="user" placeholder="a–z, 0–9, . _" maxlength="24" autocapitalize="off" required' + (isAdmin ? ' value="admin"' : '') + '></label>' +
          '<div class="f2"><input name="name" placeholder="Name" maxlength="40">' + genderSel + '</div>' +
          '<input name="email" type="email" placeholder="E-Mail (ausgedacht)" maxlength="100">' +
          '<div class="f2"><label class="small">Geburtstag<input name="bday" type="date"></label><label class="small">Größe in cm<input name="cm" type="number" min="50" max="250" inputmode="numeric"></label></div>' +
          '<div class="f2"><label class="small">Wohnort<input name="city" maxlength="60"></label><label class="small">Land<input name="country" maxlength="60" placeholder="z. B. Deutschland"></label></div>' +
          '<textarea name="bio" rows="2" maxlength="160" placeholder="Über mich"></textarea>' +
          '<div class="f2"><input name="pw" type="password" placeholder="Passwort" maxlength="60" required autocomplete="new-password">' +
          '<input name="pw2" type="password" placeholder="Passwort wiederholen" maxlength="60" required autocomplete="new-password"></div>' +
          keepHtml() +
          '<p class="hint">Nimm kein echtes Passwort. Damit meldest du dich auch an anderen Geräten an.</p>' +
          '<button class="btn btn--accent btn--big" type="submit">' + (isAdmin ? 'Netzwerk starten' : 'Konto erstellen') + '</button></form>') +
      '</div></div>';
    // Lehrkraft zurück ins Netzwerk (sie ist dort ohnehin Admin), sonst zur Startseite
    if ($('#back')) $('#back').onclick = () => (T && !isAdmin) ? renderHub() : loadHome();
    $$('.seg button').forEach(b => b.onclick = () => renderLogin(b.dataset.m));
    if ($('#lForm')) $('#lForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await A.call('sh_login', { p_hub: h.id, p_username: f.user.value.trim(), p_password: f.pw.value });
      if (!r || !r.ok) { fail(r); return; }
      A.session.set(h.id, r.session, f.keep.checked);
      openHub(h.id);
    };
    if ($('#rForm')) $('#rForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.pw.value !== f.pw2.value) { fail({ error: 'pw_mismatch' }); f.pw2.focus(); return; }
      const r = await A.call('sh_register', { p_hub: h.id, p_username: f.user.value.trim().toLowerCase(), p_password: f.pw.value,
        p_name: f.name.value.trim() || null, p_email: f.email.value.trim() || null, p_birthday: f.bday.value || null,
        p_city: f.city.value.trim() || null, p_gender: f.gender.value || null, p_bio: f.bio.value.trim() || null,
        p_country: f.country.value.trim() || null, p_centimeter: f.cm.value ? Math.round(+f.cm.value) : null });
      if (!r || !r.ok) { fail(r); return; }
      A.session.set(h.id, r.session, f.keep.checked);
      toast(r.admin ? 'Dein Netzwerk ist online!' : 'Willkommen!');
      openHub(h.id);
    };
  }

  /* ══ Klassen-Netz als App (0275) ══════════════════════════════
     Im Raum: „Als App“ öffnet die eigene Adresse /n/<schlüssel>/ in
     einem neuen Tab (mit der Sitzung im Adress-Teil, damit man dort
     gleich angemeldet ist). Dort: Name, Logo und Manifest des Netzes,
     „Installieren“ (Chrome/Edge/Android) bzw. Anleitung (iPad/iPhone). */
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; syncInstall(); });
  window.addEventListener('appinstalled', () => { installEvt = null; syncInstall(); toast('Die App ist installiert.'); });
  function installHtml() {
    if (!A.APP || standalone() || (!installEvt && !isIOS())) return '<span class="inst-slot"></span>';
    return '<span class="inst-slot"><button type="button" class="btn btn--accent btn--s hd-app" data-install>' + IC.phone +
      '<span>' + (installEvt ? 'Installieren' : 'Zum Home-Bildschirm') + '</span></button></span>';
  }
  function syncInstall() {
    $$('.inst-slot').forEach(el => { el.outerHTML = installHtml(); });
  }
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-install]')) return;
    if (installEvt) {
      const ev = installEvt;
      installEvt = null;
      ev.prompt();
      try { await ev.userChoice; } catch (x) { /* egal */ }
      syncInstall();
      return;
    }
    dialog('Zum Home-Bildschirm', '<ol class="steps-ios"><li>Tippe in Safari auf <b>Teilen</b> (Quadrat mit Pfeil nach oben).</li>' +
      '<li>Wähle <b>Zum Home-Bildschirm</b>.</li><li>Tippe auf <b>Hinzufügen</b>.</li></ol>' +
      '<p class="muted small">Die App heißt dann wie das Netzwerk und hat sein Logo. Dort meldest du dich einmal an.</p>');
  });
  function appDialog() {
    const h = S.hub.hub;
    dialog('Als App speichern',
      '<p><b>' + esc(h.name) + '</b> bekommt eine eigene App mit Name und Logo – auf dem Home-Bildschirm, im Startmenü oder auf dem Desktop. Sie öffnet direkt das Klassen-Netz, auch ohne Raum.</p>' +
      '<p class="muted small">Auf der nächsten Seite <b>Installieren</b> antippen (Android, Chromebook, Windows). Am iPad/iPhone in Safari über <b>Teilen → Zum Home-Bildschirm</b>. Ein Konto brauchst du schon – registrieren geht nur hier im Raum.</p>',
      [['no', 'Abbrechen'], ['yes', 'App-Seite öffnen', 'accent']]).then(b => {
      if (b !== 'yes') return;
      const url = '/n/' + h.app_key + '/' + (S.session ? '#s=' + S.session + '&h=' + h.id : '');
      const w = window.open(url, '_blank');
      if (!w) location.href = url;
    });
  }
  // Kopf der App-Adresse: Titel, Farbe, Manifest, Symbol für iPad/iPhone
  function setupAppHead(i) {
    const h = i.hub, head = document.head;
    const put = (sel, tag, attrs) => {
      let el = head.querySelector(sel);
      if (!el) { el = document.createElement(tag); head.appendChild(el); }
      Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
      return el;
    };
    document.title = h.name;
    put('meta[name="apple-mobile-web-app-title"]', 'meta', { name: 'apple-mobile-web-app-title', content: h.name });
    put('meta[name="apple-mobile-web-app-capable"]', 'meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    put('meta[name="mobile-web-app-capable"]', 'meta', { name: 'mobile-web-app-capable', content: 'yes' });
    put('meta[name="theme-color"]', 'meta', { name: 'theme-color', content: accentOf(h) });
    put('link[rel="manifest"]', 'link', { rel: 'manifest', href: '/api/sh_app?f=manifest&k=' + h.app_key });
    // Symbol: Logo auf weißem Grund, 180 px (iOS füllt Durchsichtiges sonst schwarz)
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 180;
        const x = c.getContext('2d');
        x.fillStyle = '#ffffff';
        x.fillRect(0, 0, 180, 180);
        const k = Math.min(144 / img.width, 144 / img.height), w = img.width * k, hh = img.height * k;
        x.drawImage(img, (180 - w) / 2, (180 - hh) / 2, w, hh);
        put('link[rel="apple-touch-icon"]', 'link', { rel: 'apple-touch-icon', href: c.toDataURL('image/png') });
      } catch (e) { /* egal */ }
    };
    img.src = h.logo === 'custom' && i.logo_img ? 'data:image/webp;base64,' + i.logo_img : 'img/logos/' + (LOGOS[h.logo] ? h.logo : 'bell') + '.png';
  }

  /* ══ Im Netzwerk ═══════════════════════════════════════════ */
  function renderHub() {
    S.screen = 'hub';
    const h = S.hub;
    if (!h.admin) S.view = 'app';
    const admin = S.view === 'admin';
    const nav = [['feed', IC.home, 'Start'], ['search', IC.search, 'Suche']];
    // ＋ nur, wenn es die Tabelle photos gibt – ohne sie gibt es nichts zu posten
    if (h.me && on('photos')) nav.push(['post', IC.plus, '']);
    else if (S.tab === 'post') S.tab = 'feed';
    if (h.me) nav.push(['profile', IC.user, 'Profil']);
    const sub = [['sql', IC.code, 'SQL'], ['diagram', IC.table, 'Diagramm']];
    // Werbung (0276): eigener Reiter, sobald es die Tabelle ads gibt
    if (on('ads') && window.SHAds) sub.push(['ads', SHAds.ICON.mega, 'Werbung']);
    else if (S.adminTab === 'ads') S.adminTab = 'sql';
    sub.push(['settings', IC.gear, 'Einstellungen']);
    app.innerHTML = '<div class="hub' + (admin ? ' hub--admin' : '') + '">' +
      '<header class="hub-top">' + (A.APP ? '' : '<button class="icon-btn" id="toHome" title="Startseite">' + IC.back + '</button>') +
      logoHtml(h.hub, 'logo--s') + '<b class="hub-name">' + esc(h.hub.name) + '</b>' +
      (h.admin ? '<nav class="views"><button type="button" data-view="app"' + (!admin ? ' class="on"' : '') + '>App</button>' +
                 '<button type="button" data-view="admin"' + (admin ? ' class="on"' : '') + '>Adminbereich</button></nav>' : '') +
      // Aufdeckung (0270): erst sichtbar, wenn die Lehrkraft einmal aufgelöst hat (syncReveal schaltet nach)
      (h.me ? '<button type="button" class="hd-data" id="hdData" title="Was weiß das Netzwerk über mich?"' + (revealHere() ? '' : ' hidden') + '>' +
              IC.shield + '<span>Was weiß das Netzwerk über mich?</span></button>' : '') +
      (admin ? '<nav class="subtabs">' + sub.map(x => '<button type="button" data-at="' + x[0] + '" class="' + (S.adminTab === x[0] ? 'on' : '') + (x[0] === 'settings' ? ' st-set' : '') + '">' + x[1] + '<span>' + x[2] + '</span></button>').join('') + '</nav>' : '') +
      '<span class="spacer"></span>' +
      // Klassen-Netz als App (0275): im Raum „Als App“, auf der App-Adresse „Installieren“
      (!A.APP && h.hub.class && h.hub.app_key ? '<button type="button" class="btn btn--ghost btn--s hd-app" id="appBtn" title="Als App auf den Home-Bildschirm">' + IC.phone + '<span>Als App</span></button>' : '') +
      (A.APP ? installHtml() : '') +
      (h.me ? '<span class="chip">@' + esc(h.me.username) + (T ? ' · Lehrkraft' : '') + '</span>'
            : T ? '<span class="chip chip--lk">Lehrkraft · Admin</span><button type="button" class="btn btn--accent btn--s" id="lkLogin">Testkonto</button>' : '') +
      '</header>' +
      '<main class="hub-main" id="main"></main>' +
      (admin ? '' : '<nav class="hub-nav">' + nav.map(x => '<button type="button" data-tab="' + x[0] + '" class="' + (x[0] === 'post' ? 'nav-post' : '') + (S.tab === x[0] ? ' on' : '') + '">' + x[1] + (x[2] ? '<span>' + x[2] + '</span>' : '') + '</button>').join('') + '</nav>') +
      '</div>';
    if ($('#toHome')) $('#toHome').onclick = () => { closeDb(); S.autoOpened = true; loadHome(); };
    if ($('#appBtn')) $('#appBtn').onclick = appDialog;
    if ($('#hdData')) $('#hdData').onclick = () => openReveal(true);
    if ($('#lkLogin')) $('#lkLogin').onclick = () => { closeDb(); renderLogin('login'); };
    $$('[data-view]').forEach(b => b.onclick = () => { if (S.view === b.dataset.view) return; closeDb(); S.view = b.dataset.view; renderHub(); });
    $$('[data-at]').forEach(b => b.onclick = () => {
      const t = b.dataset.at;
      if (S.adminTab === t) return;
      $$('[data-at]').forEach(x => x.classList.toggle('on', x === b));
      const wasDb = S.adminTab === 'sql' || S.adminTab === 'diagram';
      S.adminTab = t;
      // SQL ↔ Diagramm: dieselbe Kopie, nur umschalten
      if (wasDb && (t === 'sql' || t === 'diagram') && S.db) { S.db.show(t === 'diagram' ? 'diagram' : 'sql'); return; }
      closeDb();
      renderAdmin($('#main'));
    });
    $$('.hub-nav button').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; renderHub(); });
    const main = $('#main');
    if (admin) renderAdmin(main);
    else if (S.tab === 'feed') renderFeedTab(main);
    else if (S.tab === 'search') renderSearch(main);
    else if (S.tab === 'post') renderPost(main);
    else if (S.tab === 'profile') renderProfile(main, h.me && h.me.id, false);
    manageTrack();
    manageAds();
    syncReveal();
  }

  function closeDb() {
    if (S.db) { S.db.destroy(); S.db = null; }
    if (S.adsTab) { S.adsTab.destroy(); S.adsTab = null; }
  }

  // Werbung (0276): Admins rechnen die Zielgruppen im Hintergrund (beim Hineingehen, dann alle 3 Min.)
  function manageAds() {
    if (!window.SHAds) return;
    if (S.screen === 'hub' && S.hub && S.hub.admin && on('ads') && S.hub.ads_sql > 0) SHAds.auto(hcall, S.hub.hub.id + '.' + (S.session || ''));
    else SHAds.stop();
  }

  /* ── Feed ───────────────────────────────────────────────── */
  function renderFeedTab(main) {
    const modes = on('follows') || S.hub.me ? [['following', 'Folge ich'], ['foryou', 'Für dich']] : [['foryou', 'Für dich']];
    if (!S.hub.me && S.feedMode === 'following') S.feedMode = 'foryou';
    main.innerHTML = '<div class="feed-wrap"><div class="feed-tabs">' + (S.hub.me ? modes : [['foryou', 'Für dich']]).map(m =>
      '<button type="button" data-fm="' + m[0] + '"' + (S.feedMode === m[0] ? ' class="on"' : '') + '>' + m[1] + '</button>').join('') +
      '</div><div class="feed-host"></div></div>';
    $$('[data-fm]', main).forEach(b => b.onclick = () => { S.feedMode = b.dataset.fm; renderFeedTab(main); });
    Feed($('.feed-host', main), { mode: S.feedMode, endless: true });
  }

  function cardHtml(it, i) {
    const likeOk = it.likes != null;
    const comOk = it.comments != null;
    // Nur eigene Fotos über die drei Punkte löschen – Admins nicht (Sönke 05.11.2026);
    // wer Admin ist, geht dafür über SQL (DELETE FROM photos …).
    const canDel = !!it.mine;
    return '<article class="card" data-i="' + i + '" data-id="' + it.id + '">' +
      '<div class="card-bg" data-m="' + esc(it.image) + '" data-thumb="1"></div>' +
      '<img class="card-img" data-m="' + esc(it.image) + '" alt="" draggable="false">' +
      '<span class="burst" data-kind="heart">' + IC.heart + '</span>' +
      '<div class="rail">' +
        '<button type="button" class="r-av" data-act="profile">' + avatarHtml(it.user, 'l') +
          (it.following === false && !it.mine ? '<span class="r-plus" data-act="follow">+</span>' : '') + '</button>' +
        (likeOk ? '<button type="button" class="r-btn r-like' + (it.liked ? ' liked' : '') + '" data-act="like" data-kind="' + esc(it.my_kind || 'heart') + '" title="Liken">' +
                  kindIcon(it.my_kind) + '<span>' + n(it.likes) + '</span></button>' : '') +
        (comOk ? '<button type="button" class="r-btn" data-act="comments">' + IC.chat + '<span>' + n(it.comments) + '</span></button>' : '') +
        (canDel ? '<button type="button" class="r-btn r-more" data-act="more">' + IC.more + '</button>' : '') +
      '</div>' +
      '<div class="meta"><button type="button" class="m-user" data-act="profile">@' + esc(it.user.username) + '</button>' +
        '<span class="m-time">· ' + esc(ago(it.created_at)) + '</span>' +
        (it.sponsored ? '<button type="button" class="m-gesp" data-act="why" title="Warum sehe ich das?">Gesponsert ' + SHAds.ICON.info + '</button>' : '') +
        (it.description ? '<p class="m-desc">' + esc(it.description) + '</p>' : '') +
        (it.tags && it.tags.length ? '<div class="m-tags">' + it.tags.map(t => '<button type="button" data-tag="' + esc(t) + '">#' + esc(t) + '</button>').join('') + '</div>' : '') +
        // Foto-Label (0278, vorher „Anzeige mit Wo?“)
        (it.ad && window.SHAds ? SHAds.photoAdHtml(it.ad) : '') +
      '</div></article>';
  }

  /* Ein Feed in host. opts: mode, arg, endless, startId */
  function Feed(host, opts) {
    const LIM = 6;
    let offset = 0, seed = Math.floor(Math.random() * 1e6), loading = false, finished = false, idx = 0;
    const items = [];
    const ads = {};       // Anzeigen dieser Liste (id → Kampagne)
    host.innerHTML = '<div class="feed"></div>';
    const list = $('.feed', host);
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { io.unobserve(e.target); more(); }
    }, { root: list, rootMargin: '0px 0px 150% 0px' });

    // Analytics (0270): wie lange ist ein Foto im Bild? Die Karte gilt als
    // „angesehen“, solange sie zu mind. 60 % sichtbar ist.
    const viewTimes = new Map();   // cardEl → Startzeit
    function emitView(card) {
      const t0 = viewTimes.get(card);
      if (t0 == null) return;
      viewTimes.delete(card);
      const it = items[+card.dataset.i];
      if (!it || !window.SHTrack || !SHTrack.isOn()) return;
      SHTrack.view(it.id, performance.now() - t0, feedName(opts.mode), +card.dataset.i, card.__end || 'swipe');
      card.__end = null;
    }
    const vio = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) { if (!viewTimes.has(e.target)) viewTimes.set(e.target, performance.now()); }
        else emitView(e.target);
      }
    }, { root: list, threshold: [0, 0.6] });

    async function more() {
      if (loading || finished) return;
      loading = true;
      const r = await hcall('sh_feed', { p_mode: opts.mode, p_arg: opts.arg == null ? null : String(opts.arg), p_offset: offset, p_limit: LIM, p_seed: seed });
      loading = false;
      if (!r || !r.ok) { fail(r); return; }
      if (r.off) {
        list.innerHTML = '<div class="feed-empty">' + IC.image + '<p>Fotos gibt es hier noch nicht – die Tabelle <code>photos</code> fehlt.</p>' +
          (S.hub.me ? '<p class="small">Du kannst dir schon ein Profil einrichten' + (on('follows') ? ' und anderen folgen' : '') + '.</p>' : '') + '</div>';
        finished = true;
        return;
      }
      if (!r.items.length && offset === 0) {
        if (!items.length) list.innerHTML = '<div class="feed-empty">' + IC.image + '<p>' +
          (opts.mode === 'following' ? 'Hier erscheinen Fotos von dir und von Leuten, denen du folgst.' : 'Noch keine Fotos. Poste das erste!') + '</p></div>';
        finished = true;
        return;
      }
      const frag = document.createElement('div');
      frag.innerHTML = r.items.map(it => { items.push(it); return cardHtml(it, idx++); }).join('');
      // Feed-Werbung (0278): nach jedem n-ten Foto (sh_hubs.ad_every) eine Karte;
      // r.ads = [{ after: Index des Fotos in dieser Seite, ad }]
      const slots = Array.isArray(r.ads) ? r.ads : r.ad ? [{ after: Math.min(2, r.items.length - 1), ad: r.ad }] : [];
      if (slots.length && window.SHAds) {
        const photoCards = Array.from(frag.children);
        slots.forEach(x => {
          if (!x || !x.ad) return;
          ads[x.ad.id] = x.ad;
          const ref = photoCards[x.after];
          const tmp = document.createElement('div');
          tmp.innerHTML = SHAds.cardHtml(x.ad);
          frag.insertBefore(tmp.firstElementChild, ref ? ref.nextSibling : null);
        });
      }
      const cards = Array.from(frag.children);
      cards.forEach(c => { list.appendChild(c); if (!c.classList.contains('card--wb')) vio.observe(c); });
      hydrate(list);
      offset += r.items.length;
      if (r.items.length < LIM) {
        if (opts.endless) {
          // Runde zu Ende: endlos weiter, von vorn mit neuem Zufall
          const mk = document.createElement('div');
          mk.className = 'feed-mark';
          mk.innerHTML = '<span>✓ Du hast alles gesehen – es geht von vorn weiter</span>';
          list.appendChild(mk);
          offset = 0;
          seed = Math.floor(Math.random() * 1e6);
        } else finished = true;
      }
      const last = list.lastElementChild;
      if (last && !finished) io.observe(last);
      if (opts.startId != null) {
        const c = list.querySelector('.card[data-id="' + opts.startId + '"]');
        if (c) { c.scrollIntoView({ block: 'start' }); opts.startId = null; }
      }
    }

    // Handlungen an den Karten (ein Listener für alle)
    let lastTap = 0;
    list.addEventListener('click', async (e) => {
      const tagB = e.target.closest('[data-tag]');
      if (tagB) { const tc = e.target.closest('.card'); if (tc) tc.__end = 'tag'; openViewer({ mode: 'tag', arg: tagB.dataset.tag, title: '#' + tagB.dataset.tag }); return; }
      const card = e.target.closest('.card');
      if (!card) return;
      // Anzeige: „Warum?“ oder öffnen
      if (card.classList.contains('card--wb')) {
        const ad = ads[card.dataset.wb];
        if (!ad) return;
        if (e.target.closest('[data-wbwhy]')) wbWhy(ad, false);
        else if (e.target.closest('[data-wbgo]') || !e.target.closest('.meta')) wbOpen(ad);
        return;
      }
      const it = items[+card.dataset.i];
      const actEl = e.target.closest('[data-act]');
      const act = actEl ? actEl.dataset.act : null;
      if (act === 'follow') { e.stopPropagation(); follow(it, card); return; }
      if (act === 'why' && it.sponsored) { wbWhy(it.sponsored, true); return; }
      if (it.ad && e.target.closest('[data-wbp]')) { if (e.target.closest('[data-wbwhy]')) wbWhy(it.ad, false); else wbOpen(it.ad); return; }
      if (act === 'profile') { card.__end = 'profile'; openProfile(it.user.id); return; }
      const rk = e.target.closest('[data-react]');
      if (rk) { e.stopPropagation(); closePick(); card.__end = 'like'; react(it, card, rk.dataset.react); return; }
      if (act === 'like') { togglePick(it, card); return; }
      if (closePick()) return;
      if (act === 'comments') { card.__end = 'comment'; openComments(it, card); return; }
      if (act === 'more') { moreMenu(it, card); return; }
      // Doppeltipp aufs Bild = Herz
      const now = Date.now();
      if (now - lastTap < 320 && it.likes != null && !it.liked) { card.__end = 'like'; react(it, card, 'heart'); }
      else if (now - lastTap < 320 && it.likes != null) burst(card, it.my_kind);
      lastTap = now;
    });

    function syncCards(it) {
      $$('.card[data-id="' + it.id + '"]', list).forEach(c => {
        const b = c.querySelector('[data-act="like"]');
        if (b) {
          b.classList.toggle('liked', !!it.liked);
          b.dataset.kind = it.my_kind || 'heart';
          b.innerHTML = kindIcon(it.my_kind) + '<span>' + n(it.likes) + '</span>';
        }
        const cb = c.querySelector('[data-act="comments"] span');
        if (cb) cb.textContent = n(it.comments);
      });
      items.forEach(x => { if (x !== it && x.id === it.id) Object.assign(x, { liked: it.liked, likes: it.likes, my_kind: it.my_kind, kinds: it.kinds, comments: it.comments }); });
    }

    // Auswahl Herz · Daumen · Smiley neben dem Like-Knopf
    function closePick() {
      const p = $('.react-pick', list);
      if (p) { p.remove(); return true; }
      return false;
    }
    function togglePick(it, card) {
      if (closePick()) return;
      if (!S.hub.me) { toast(T ? 'Zum Mitmachen oben ein Testkonto anlegen.' : 'Melde dich an, um zu liken.'); return; }
      const btn = card.querySelector('[data-act="like"]');
      const k = it.kinds || {};
      const el = document.createElement('div');
      el.className = 'react-pick';
      el.style.top = (btn.offsetTop + btn.offsetHeight / 2) + 'px';
      el.innerHTML = KINDS.map(x => '<button type="button" data-react="' + x[0] + '" data-kind="' + x[0] + '" title="' + x[1] + '"' +
        (it.my_kind === x[0] ? ' class="on"' : '') + '>' + kindIcon(x[0]) + '<small>' + n(k[x[0]] || 0) + '</small></button>').join('');
      card.querySelector('.rail').appendChild(el);
    }
    function burst(card, kind) {
      const b = card.querySelector('.burst');
      b.dataset.kind = kind || 'heart';
      b.innerHTML = kindIcon(kind);
      b.classList.remove('go');
      requestAnimationFrame(() => b.classList.add('go'));
    }
    // kind antippen: setzen; dieselbe Art noch einmal = Like weg
    async function react(it, card, kind) {
      if (!S.hub.me) { toast(T ? 'Zum Mitmachen oben ein Testkonto anlegen.' : 'Melde dich an, um zu liken.'); return; }
      const before = { liked: it.liked, likes: it.likes, my_kind: it.my_kind, kinds: Object.assign({}, it.kinds || {}) };
      const off = it.liked && it.my_kind === kind;
      const k = Object.assign({ heart: 0, thumb: 0, laugh: 0 }, it.kinds || {});
      if (it.liked && it.my_kind) k[it.my_kind] = Math.max(0, k[it.my_kind] - 1);
      if (!off) k[kind]++;
      Object.assign(it, { liked: !off, likes: it.likes + (off ? -1 : it.liked ? 0 : 1), my_kind: off ? null : kind, kinds: k });
      syncCards(it);
      if (!off) burst(card, kind);
      const r = await hcall('sh_like', { p_photo: it.id, p_on: !off, p_kind: kind });
      if (!r || !r.ok) { Object.assign(it, before); syncCards(it); fail(r); return; }
      Object.assign(it, { likes: r.likes, kinds: r.kinds, my_kind: r.my_kind || null, liked: !!r.my_kind });
      syncCards(it);
    }
    async function follow(it, card) {
      if (!S.hub.me) return;
      const r = await hcall('sh_follow', { p_user: it.user.id, p_on: true });
      if (!r || !r.ok) { fail(r); return; }
      items.forEach(x => { if (x.user.id === it.user.id) x.following = true; });
      $$('.card', list).forEach(c => { const x = items[+c.dataset.i]; if (x && x.user.id === it.user.id) { const p = c.querySelector('.r-plus'); if (p) p.remove(); } });
      toast('Du folgst jetzt @' + it.user.username);
    }
    function openComments(it, card) {
      Comments(it, () => syncCards(it));
    }
    async function moreMenu(it, card) {
      if (!it.mine) return;
      if (!confirm('Dieses Foto löschen?')) return;
      const r = await hcall('sh_photo_delete', { p_photo: it.id });
      if (!r || !r.ok) { fail(r); return; }
      $$('.card[data-id="' + it.id + '"]', list).forEach(c => c.remove());
      toast('Gelöscht');
    }

    more();
  }

  /* ── Kommentare (Blatt von unten) ───────────────────────── */
  function sheet(title, bodyHtml) {
    const el = document.createElement('div');
    el.className = 'sheet-back';
    el.innerHTML = '<div class="sheet"><div class="sheet-h"><b>' + esc(title) + '</b><button class="icon-btn" data-close>✕</button></div>' + bodyHtml + '</div>';
    document.body.appendChild(el);
    const close = () => el.remove();
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(); });
    return { el, close };
  }

  async function Comments(it, changed) {
    const sh = sheet((it.comments || 0) + ' Kommentare', '<div class="c-list"><p class="muted center-t">lädt …</p></div>' +
      (S.hub.me ? '<form class="c-form"><input name="b" maxlength="300" placeholder="Kommentar hinzufügen …" autocomplete="off"><button class="btn btn--accent btn--s">Senden</button></form>' : ''));
    const listEl = $('.c-list', sh.el);
    async function load() {
      const r = await hcall('sh_comments', { p_photo: it.id });
      if (!r || !r.ok) { listEl.innerHTML = '<p class="muted center-t">' + esc(A.errText(r)) + '</p>'; return; }
      it.comments = r.items.length;
      $('.sheet-h b', sh.el).textContent = r.items.length + ' Kommentar' + (r.items.length === 1 ? '' : 'e');
      changed();
      listEl.innerHTML = r.items.length ? r.items.map(c =>
        '<div class="c-it" data-c="' + c.id + '">' + avatarHtml(c.user, 's') +
        '<div class="c-body"><button type="button" class="c-user" data-u="' + c.user.id + '">@' + esc(c.user.username) + '</button>' +
        '<p>' + esc(c.body) + '</p><small>' + esc(ago(c.created_at)) +
        ((c.mine || S.hub.admin) ? ' · <button type="button" class="link" data-cdel="' + c.id + '">löschen</button>' : '') + '</small></div>' +
        '</div>').join('') : '<p class="muted center-t">Noch keine Kommentare. Schreib den ersten!</p>';
      hydrate(listEl);
    }
    // Werbung (0276): eine Anzeige als Leiste über den Kommentaren
    // seit 0277 nur Anzeigen, deren „Wo?“ dieses Foto enthält
    if (on('ads') && window.SHAds) hcall('sh_ad_pick', { p_salt: 'c' + Math.floor(Date.now() / 60000), p_photo: it.id }).then(r => {
      if (!r || !r.ok || !r.ad || !sh.el.isConnected) return;
      const w = document.createElement('div');
      w.innerHTML = SHAds.stripHtml(r.ad);
      const strip = w.firstElementChild;
      listEl.parentNode.insertBefore(strip, listEl);
      strip.addEventListener('click', (e) => {
        if (e.target.closest('[data-wbwhy]')) wbWhy(r.ad, false); else wbOpen(r.ad);
      });
      hydrate(strip);
    });
    listEl.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-cdel]');
      if (d) {
        const r = await hcall('sh_comment_delete', { p_comment: +d.dataset.cdel });
        if (!r || !r.ok) fail(r); else load();
        return;
      }
      const u = e.target.closest('[data-u]');
      if (u) { sh.close(); openProfile(+u.dataset.u); }
    });
    const form = $('.c-form', sh.el);
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const v = form.b.value.trim();
      if (!v) return;
      const r = await hcall('sh_comment_add', { p_photo: it.id, p_body: v });
      if (!r || !r.ok) { fail(r); return; }
      form.b.value = '';
      load();
    };
    load();
  }

  /* ── Werbung (0276): „Warum sehe ich das?“ und Anzeige öffnen ── */
  function wbWhy(ad, sponsored) {
    dialog(sponsored ? 'Warum siehst du diesen Beitrag?' : 'Warum siehst du diese Anzeige?', SHAds.whyHtml(ad, S.hub && S.hub.hub.name, sponsored));
  }
  function wbOpen(ad) {
    const ov = overlay(ad.name);
    ov.el.classList.add('ov--wb');
    ov.body.innerHTML = '<div class="wb-page">' +
      (ad.image ? '<img class="wb-page-img" data-m="' + esc(ad.image) + '" alt="">' : '<div class="wb-fill wb-fill--page"><span>' + esc(ad.title || ad.name) + '</span></div>') +
      '<div class="wb-page-b"><small>Anzeige · ' + esc(ad.name) + '</small>' +
      (ad.title ? '<h2>' + esc(ad.title) + '</h2>' : '') + (ad.body ? '<p>' + esc(ad.body) + '</p>' : '') +
      '<button type="button" class="btn btn--accent btn--big" disabled>' + esc(ad.button || 'Mehr erfahren') + '</button>' +
      '<p class="muted small">Das ist eine ausgedachte Werbung in eurem Netzwerk – hier geht es nicht weiter.</p>' +
      '<button type="button" class="link" data-why>Warum sehe ich das?</button></div></div>';
    ov.body.querySelector('[data-why]').onclick = () => wbWhy(ad, false);
    hydrate(ov.body);
  }

  /* ── Ansicht über allem (Profil anderer, Tag, Fotos) ────── */
  function overlay(title) {
    const el = document.createElement('div');
    el.className = 'ov';
    el.innerHTML = '<header class="ov-h"><button class="icon-btn" data-close>' + IC.back + '</button><b>' + esc(title) + '</b></header><div class="ov-body"></div>';
    $('.hub').appendChild(el);
    el.querySelector('[data-close]').onclick = () => el.remove();
    return { el, body: $('.ov-body', el), close: () => el.remove() };
  }

  function openViewer(o) {
    const ov = overlay(o.title || '');
    ov.el.classList.add('ov--feed');
    Feed(ov.body, { mode: o.mode, arg: o.arg, endless: false, startId: o.startId });
  }

  function openProfile(uid) {
    if (S.hub.me && uid === S.hub.me.id && S.tab !== 'profile') { S.tab = 'profile'; renderHub(); return; }
    const ov = overlay('Profil');
    renderProfile(ov.body, uid, true);
  }

  /* ── Aufdeckung: „Was weiß das Netzwerk über dich?“ (0270) ── */
  let revealEl = null;
  let revealManual = false;     // über den Knopf oben geöffnet (bleibt, auch wenn die Lehrkraft beendet)
  let revealShown = false;      // in dieser Aufdeckung schon automatisch gezeigt → nach Schließen nicht wieder aufpoppen
  function closeReveal() { if (revealEl) { revealEl.remove(); revealEl = null; } revealManual = false; }
  // Vom Zustand des Raums: einmal automatisch öffnen, beim Beenden wieder zu
  function syncReveal() {
    const hd = $('#hdData');
    if (hd) hd.hidden = !revealHere();
    if (revealOn() && on('sessions')) { if (!revealShown && S.hub && S.hub.me) { revealShown = true; openReveal(false); } }
    // „Verborgen“: alles zu
    else { revealShown = false; if (!revealManual || !revealHere()) closeReveal(); }
  }
  async function openReveal(manual) {
    if (revealEl || !document.querySelector('.hub')) return;
    revealManual = !!manual;
    const ov = overlay('Was weiß das Netzwerk über dich?');
    ov.el.classList.add('ov--reveal');
    revealEl = ov.el;
    ov.el.querySelector('[data-close]').onclick = closeReveal;
    ov.body.innerHTML = '<p class="muted center-t">lädt …</p>';
    const r = await hcall('sh_my_data', {});
    if (!revealEl) return;
    if (!r || !r.ok) {
      ov.body.innerHTML = '<div class="rv"><p class="rv-lead">' +
        (r && r.error === 'not_logged_in' ? 'Melde dich an, dann siehst du, was das Netzwerk über dich gespeichert hat.' : esc(A.errText(r))) + '</p></div>';
      return;
    }
    ov.body.innerHTML = revealHtml(r);
    fillLiveReveal(ov.body);
  }

  const fmtMs = (ms) => {
    ms = +ms || 0;
    if (ms < 1000) return ms + ' ms';
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1).replace('.', ',') + ' s';
    const m = Math.floor(s / 60);
    return m + ' min ' + Math.round(s - m * 60) + ' s';
  };
  const yn = (v) => v === true ? '<b class="yes">erlaubt ✓</b>' : v === false ? '<b class="no">abgelehnt ✗</b>' : '<span class="muted">nicht gefragt</span>';
  const rvRow = (k, v) => '<li><span>' + k + '</span><b>' + (v == null || v === '' ? '<span class="muted">–</span>' : esc(v)) + '</b></li>';

  function revealHtml(r) {
    const s = (r.sessions && r.sessions[0]) || null;   // jüngster Besuch
    const al = (s && s.allow) || {};
    const v = r.views || {};
    let h = '<div class="rv">';
    h += '<p class="rv-lead">Deine Profilangaben waren ausgedacht. Wie du die App benutzt hast, war <b>echt</b> – und genau das sammelt eine Plattform. Das hier lag die ganze Zeit mit in der Datenbank:</p>';

    // 1 — gespeichert
    h += '<section class="rv-s rv-s--got"><h3><span class="rv-dot"></span>1 · Das wurde gespeichert – ganz ohne zu fragen</h3>';
    if (s) {
      h += '<ul class="rv-list">' +
        rvRow('Deine IP-Adresse', s.ip) +
        rvRow('Browser', s.browser) + rvRow('Betriebssystem', s.os) +
        rvRow('Gerät', (s.device || s.device_type)) +
        rvRow('Bildschirm', s.screen + (s.pixel_ratio ? ' · ' + s.pixel_ratio + '×' : '')) +
        rvRow('Sprache', s.language) + rvRow('Zeitzone', s.timezone) +
        rvRow('Ansicht', s.dark_mode === true ? 'Dunkel' : s.dark_mode === false ? 'Hell' : null) +
        rvRow('Verbindung', s.connection) +
        '</ul>';
      h += '<p class="rv-ip">In der Schule haben <b>alle dieselbe IP</b> – ihr hängt an einem Anschluss. Von zu Hause hättest du deine eigene, mit Anbieter und ungefährem Ort.</p>';
    }
    h += '<div class="rv-sum"><div><b>' + (v.count || 0) + '</b><span>Fotos angesehen</span></div>' +
      '<div><b>' + fmtMs(v.total_ms) + '</b><span>insgesamt geschaut</span></div>' +
      '<div><b>' + fmtMs(v.longest_ms) + '</b><span>längster Blick</span></div>' +
      '<div><b>' + (r.sessions ? r.sessions.length : 0) + '</b><span>Besuche</span></div></div>';
    h += '<p class="rv-note">Jedes Foto auf die Millisekunde genau (Tabelle <code>views</code>) – daraus baut eine App ihren „Für dich“-Algorithmus. Dein Besuch mit allem oben steht in <code>sessions</code>.</p>';
    h += '<h4>Was du dem Netzwerk erlaubt hast</h4><ul class="rv-perms">' +
      '<li>Standort ' + yn(al.location) + '</li>' +
      '<li>Kamera ' + yn(al.camera) + '</li>' +
      '<li>Mikrofon ' + yn(al.microphone) + '</li>' +
      '<li>Benachrichtigungen ' + yn(al.notifications) + '</li></ul>' +
      '<p class="rv-note">Die Fenster waren nachgebaut: Wir haben nur gespeichert, was du angeklickt hast – Standort, Bild oder Ton haben wir nie abgerufen. Eine echte App hätte es ab deinem „Zulassen“ gekonnt.</p>';
    h += '</section>';

    // 2 — ginge ohne Fragen (live auf dem eigenen Gerät)
    h += '<section class="rv-s rv-s--could"><h3><span class="rv-dot"></span>2 · Das hätten wir auch noch gekonnt – ohne zu fragen</h3>' +
      '<p class="rv-note">Das liest dein Gerät gerade heraus. Wir speichern es <b>nicht</b> – eine echte Seite oft schon.</p>' +
      '<ul class="rv-list" id="rvLive">' +
        rvRow('Akku', '…') + rvRow('Prozessorkerne', '…') + rvRow('Arbeitsspeicher', '…') +
        rvRow('Touch-Punkte', '…') + rvRow('Von welcher Seite du kamst', '…') +
        '<li><span>Fingerabdruck deines Geräts</span><b id="rvFp">…</b></li>' +
      '</ul><p class="rv-note">Der Fingerabdruck erkennt dein Gerät <b>auch ohne Anmeldung</b> wieder. Auf den Schul-Tablets sind viele gleich – zu Hause bist du damit eindeutig.</p></section>';

    // 3 — nach „Erlauben?“
    h += '<section class="rv-s rv-s--ask"><h3><span class="rv-dot"></span>3 · Das hätten wir mit einem „Erlauben“ bekommen</h3>' +
      '<ul class="rv-list rv-list--plain">' +
      '<li>Dein <b>genauer Standort</b> (GPS) – auf ein paar Meter</li>' +
      '<li><b>Kamera</b> und <b>Mikrofon</b> – Bild und Ton</li>' +
      '<li><b>Benachrichtigungen</b> – dich zurückholen, wenn du gerade nicht da bist</li></ul>' +
      '<p class="rv-note">Viele tippen so ein „Zulassen?“ einfach weg – wie oft hast du es heute gemacht?</p></section>';

    // 4 — nur echte Apps
    h += '<section class="rv-s rv-s--apps"><h3><span class="rv-dot"></span>4 · Das können nur echte Apps – kein Browser</h3>' +
      '<ul class="rv-list rv-list--plain">' +
      '<li><b>MAC-Adresse</b> (heute vom Handy zufällig gemacht)</li>' +
      '<li><b>Werbe-ID</b> – über alle Apps hinweg dieselbe</li>' +
      '<li><b>Kontakte</b>, Namen der WLANs, andere installierte Apps</li>' +
      '<li><b>Bewegungssensoren</b> im Hintergrund: ob du gehst, fährst oder liegst</li></ul></section>';

    h += '<p class="rv-foot">Das alles lag nur in diesem Raum und wird mit ihm gelöscht. Echte Seiten in Deutschland müssten für so ein Tracking eigentlich vorher fragen – viele tun es trotzdem.</p>';
    return h + '</div>';
  }

  // Fingerabdruck: eine kurze Zahl aus ein paar Gerätewerten (FNV-1a)
  function fp32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  async function fillLiveReveal(root) {
    const live = $('#rvLive', root);
    if (!live) return;
    const set = (i, v) => { const li = live.children[i]; if (li) li.querySelector('b').innerHTML = v == null || v === '' ? '<span class="muted">verrät dein Gerät nicht</span>' : esc(v); };
    // Akku
    try {
      if (navigator.getBattery) { const b = await navigator.getBattery(); set(0, Math.round(b.level * 100) + ' %' + (b.charging ? ' (lädt)' : '')); }
      else set(0, null);
    } catch (e) { set(0, null); }
    set(1, navigator.hardwareConcurrency ? navigator.hardwareConcurrency + ' Kerne' : null);
    set(2, navigator.deviceMemory ? '≈ ' + navigator.deviceMemory + ' GB' : null);
    set(3, (navigator.maxTouchPoints || 0) + ' gleichzeitig');
    set(4, document.referrer ? document.referrer.slice(0, 60) : 'diesmal nichts');
    const fpEl = $('#rvFp', root);
    if (fpEl) {
      const sig = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height, screen.colorDepth,
        (window.devicePixelRatio || 1), navigator.hardwareConcurrency, navigator.deviceMemory,
        (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })(),
        navigator.platform, navigator.maxTouchPoints].join('|');
      fpEl.textContent = fp32(sig);
    }
  }

  /* ── Profil ─────────────────────────────────────────────── */
  async function renderProfile(main, uid, inOverlay) {
    main.innerHTML = '<div class="prof"><p class="muted center-t">lädt …</p></div>';
    const r = await hcall('sh_profile', { p_user: uid });
    if (!r || !r.ok) { main.innerHTML = '<p class="muted center-t">' + esc(A.errText(r)) + '</p>'; return; }
    const u = r.user;
    const stat = (v, l) => v == null ? '' : '<div class="st"><b>' + n(v) + '</b><span>' + l + '</span></div>';
    main.innerHTML = '<div class="prof">' +
      '<div class="prof-h">' + avatarHtml(u, 'xl') + '<h2>@' + esc(u.username) + (u.role === 'admin' ? ' <span class="badge">Admin</span>' : '') + '</h2>' +
      (u.name ? '<div class="prof-name">' + esc(u.name) + '</div>' : '') +
      '<div class="stats">' + stat(r.following, 'Folge ich') + stat(r.followers, 'Follower') + stat(r.likes, 'Likes') + stat(r.photos_n, 'Fotos') + '</div>' +
      (u.bio ? '<p class="bio">' + esc(u.bio) + '</p>' : '') +
      '<div class="prof-acts">' +
        (r.me ? '<button type="button" class="btn btn--ghost" id="pEdit">Profil bearbeiten</button>' +
                // Lehrkraft bleibt in ihrem eigenen Netzwerk immer angemeldet
                (T && S.hub.founder ? '' : '<button type="button" class="btn btn--ghost" id="pOut">Abmelden</button>')
              : (r.i_follow != null && S.hub.me ? '<button type="button" class="btn ' + (r.i_follow ? 'btn--ghost' : 'btn--accent') + '" id="pFollow">' + (r.i_follow ? 'Gefolgt ✓' : 'Folgen') + '</button>' : '') +
                // Admins (und die Lehrkraft) setzen das Passwort zurück: 6 Ziffern, bcrypt (0279)
                (S.hub.admin ? '<button type="button" class="btn btn--ghost" id="pPwReset">Passwort zurücksetzen</button>' : '')) +
      '</div>' + (!r.me && S.hub.admin ? '<div class="pw-new" id="pPwNew" hidden></div>' : '') + '</div>' +
      (r.photos == null ? '' : r.photos.length ? '<div class="grid3">' + r.photos.map(p => '<button type="button" class="g-it" data-pid="' + p.id + '"><span class="g-img" data-m="' + esc(p.image) + '" data-thumb="1"></span></button>').join('') + '</div>'
                       : '<p class="muted center-t">Noch keine Fotos.</p>') + '</div>';
    hydrate(main);
    $$('[data-pid]', main).forEach(b => b.onclick = () => openViewer({ mode: 'user', arg: u.id, startId: +b.dataset.pid, title: '@' + u.username }));
    if ($('#pFollow', main)) $('#pFollow', main).onclick = async () => {
      const rr = await hcall('sh_follow', { p_user: u.id, p_on: !r.i_follow });
      if (!rr || !rr.ok) { fail(rr); return; }
      renderProfile(main, uid, inOverlay);
    };
    if ($('#pPwReset', main)) $('#pPwReset', main).onclick = async () => {
      if (await dialog('Passwort zurücksetzen?', '<p><b>@' + esc(u.username) + '</b> bekommt ein neues Passwort (6 Ziffern). Alle Geräte von @' + esc(u.username) + ' werden abgemeldet.</p>',
        [['no', 'Abbrechen'], ['yes', 'Zurücksetzen', 'accent']]) !== 'yes') return;
      const rr = await hcall('sh_user_pw_reset', { p_user: u.id });
      if (!rr || !rr.ok) { fail(rr); return; }
      const box = $('#pPwNew', main);
      box.innerHTML = '<span>Neues Passwort für @' + esc(rr.username) + '</span><code>' + esc(rr.password) + '</code>' +
        '<small>Nur jetzt zu sehen – in der Datenbank steht es nur als Hash.</small>';
      box.hidden = false;
    };
    if ($('#pOut', main)) $('#pOut', main).onclick = () => logoutDialog();
    if ($('#pEdit', main)) $('#pEdit', main).onclick = () => editProfile(u, () => renderProfile(main, uid, inOverlay));
  }

  function logoutDialog() {
    const sh = sheet('Abmelden', '<div class="sheet-acts"><button class="btn btn--ghost btn--big" id="lo1">Auf diesem Gerät abmelden</button>' +
      '<button class="btn btn--ghost btn--big" id="loAll">Auf allen Geräten abmelden</button></div>');
    const go = async (all) => {
      await hcall('sh_logout', { p_all: all });
      A.session.set(S.hub.hub.id, null);
      sh.close();
      toast('Abgemeldet');
      // zurück zur Anmeldung dieses Netzwerks
      S.session = null;
      openHub(S.hub.hub.id);
    };
    $('#lo1', sh.el).onclick = () => go(false);
    $('#loAll', sh.el).onclick = () => go(true);
  }

  function editProfile(u, done) {
    let avatar = u.avatar || '';
    const sh = sheet('Profil bearbeiten', '<form class="form" id="peForm">' +
      '<div class="pe-av">' + avatarHtml(u, 'xl') + (S.hub.upload ? '<label class="btn btn--ghost btn--s">Profilbild wählen<input type="file" accept="image/*" hidden id="peFile"></label>' : '') + '</div>' +
      '<label>Name<input name="name" maxlength="40" value="' + esc(u.name || '') + '"></label>' +
      '<label>Bio<textarea name="bio" maxlength="160" rows="3">' + esc(u.bio || '') + '</textarea></label>' +
      '<div class="f2"><label>Wohnort<input name="city" maxlength="60" value="' + esc(u.city || '') + '"></label>' +
      '<label>Land<input name="country" maxlength="60" value="' + esc(u.country || '') + '"></label></div>' +
      '<label>Größe in cm<input name="cm" type="number" min="50" max="250" inputmode="numeric" value="' + esc(u.centimeter == null ? '' : u.centimeter) + '"></label>' +
      '<label>Geschlecht<select name="gender"><option value="">–</option>' + GENDERS.map(g => '<option value="' + g[0] + '"' + (u.gender === g[0] ? ' selected' : '') + '>' + g[1] + '</option>').join('') + '</select></label>' +
      '<button class="btn btn--accent btn--big">Speichern</button></form>');
    hydrate(sh.el);
    const file = $('#peFile', sh.el);
    if (file) file.onchange = async () => {
      if (!file.files[0]) return;
      try {
        const fl = file.files[0];
        file.value = '';
        const cut = await window.SHPhoto.crop(await M.decode(fl), { ratio: 1, title: 'Profilbild zuschneiden' });
        if (!cut) return;
        const c = await M.compress(cut);
        const r = await hcall('sh_media_put', { p_data: c.data, p_thumb: c.thumb, p_mime: c.mime });
        if (!r || !r.ok) { fail(r); return; }
        M.prime(S.hub.hub.id, r.name, c.preview);
        avatar = r.name;
        const av = $('.pe-av .av', sh.el);
        av.innerHTML = '<span class="av-img img-ok" style="background-image:url(&quot;' + c.preview + '&quot;)"></span>';
      } catch (e) { toast(e.message, true); }
    };
    $('#peForm', sh.el).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await hcall('sh_me_update', { p_name: f.name.value.trim() || null, p_bio: f.bio.value.trim() || null, p_avatar: avatar || null, p_city: f.city.value.trim() || null, p_gender: f.gender.value || null,
        p_country: f.country.value.trim() || null, p_centimeter: f.cm.value ? Math.round(+f.cm.value) : null });
      if (!r || !r.ok) { fail(r); return; }
      sh.close();
      await refreshHub();
      done();
    };
  }

  /* ── Suche ──────────────────────────────────────────────── */
  function renderSearch(main) {
    main.innerHTML = '<div class="search"><input type="search" id="q" placeholder="' + (on('tags') ? 'Nutzer oder #Hashtag suchen' : 'Nutzer suchen') + '" autocomplete="off"><div id="sres"></div></div>';
    const q = $('#q', main);
    let t = null;
    const go = async () => {
      const r = await hcall('sh_search', { p_q: q.value });
      const out = $('#sres', main);
      if (!r || !r.ok) { out.innerHTML = '<p class="muted">' + esc(A.errText(r)) + '</p>'; return; }
      let html = '';
      if (r.tags && r.tags.length) html += '<h3>Hashtags</h3><div class="s-tags">' + r.tags.map(x => '<button type="button" class="s-tag" data-tag="' + esc(x.name) + '"><b>#' + esc(x.name) + '</b><span>' + x.n + ' Fotos</span></button>').join('') + '</div>';
      html += '<h3>Nutzer</h3>' + (r.users.length ? r.users.map(u => '<button type="button" class="s-user" data-u="' + u.id + '">' + avatarHtml(u, 'm') + '<span><b>@' + esc(u.username) + '</b><small>' + esc(u.name || '') + '</small></span></button>').join('') : '<p class="muted">Niemand gefunden.</p>');
      out.innerHTML = html;
      hydrate(out);
      $$('[data-tag]', out).forEach(b => b.onclick = () => openViewer({ mode: 'tag', arg: b.dataset.tag, title: '#' + b.dataset.tag }));
      $$('[data-u]', out).forEach(b => b.onclick = () => openProfile(+b.dataset.u));
    };
    q.oninput = () => { clearTimeout(t); t = setTimeout(go, 250); };
    go();
  }

  /* ── Posten ─────────────────────────────────────────────── */
  function renderPost(main) {
    if (!S.hub.me) { main.innerHTML = '<p class="muted center-t">Bitte melde dich an.</p>'; return; }
    if (!on('photos')) {
      main.innerHTML = '<div class="post"><div class="feed-empty">' + IC.image + '<p>Posten geht noch nicht: Die Tabelle <code>photos</code> gibt es in diesem Netzwerk noch nicht.</p>' +
        '<p class="small">' + (T ? 'Erstelle sie auf der Startseite unter „Tabellen für alle Netzwerke“.' : 'Die Lehrkraft erstellt sie für alle.') + '</p></div></div>';
      return;
    }
    if (!S.hub.upload) {
      main.innerHTML = '<div class="post"><div class="feed-empty">' + IC.image + '<p>Bilder hochladen ist gerade ausgeschaltet.</p></div></div>';
      return;
    }
    // Analytics (0270): ＋ geöffnet → nachgebaute Frage nach der Kamera (nur der Klick wird gespeichert)
    if (window.SHTrack && SHTrack.isOn()) SHTrack.askCamera();
    let pic = null;      // verkleinert, fertig zum Hochladen
    let orig = null;     // Original (zum erneuten Zuschneiden)
    let meta = null;     // Metadaten aus Datei/Kamera (0268), gesendet nur bei data.meta
    main.innerHTML = '<form class="post form" id="pForm">' +
      '<div class="pick" id="pick">' + IC.image + '<span>Foto wählen oder aufnehmen</span>' +
        '<div class="pick-src"><label class="btn btn--accent">' + IC.image + 'Foto wählen<input type="file" accept="image/*" id="pFile" hidden></label>' +
        '<button type="button" class="btn btn--ghost" id="pCam">' + IC.camera + 'Kamera</button></div></div>' +
      '<input type="file" accept="image/*" capture="environment" id="pCap" hidden>' +
      '<div class="pick-acts" id="pActs" hidden><button type="button" class="btn btn--ghost btn--s" id="pCrop">' + IC.crop + ' Zuschneiden</button>' +
        '<button type="button" class="btn btn--ghost btn--s" id="pNew">Anderes Foto</button></div>' +
      '<div class="pick-info muted small" id="pInfo"></div>' +
      '<textarea name="d" maxlength="300" rows="3" placeholder="Beschreibe dein Foto …"></textarea>' +
      (on('tags') ? '<input name="t" placeholder="#hashtags, z. B. #natur #sommer" autocapitalize="off">' : '') +
      '<div class="pick-meta" id="pMeta" hidden></div>' +
      '<p class="hint" id="pHint"></p>' +
      '<button class="btn btn--accent btn--big" id="pGo" disabled>Posten</button></form>';
    const pickHtml = $('#pick', main).innerHTML;
    // Was mitgespeichert wird (nur wenn die Lehrkraft es eingeschaltet hat)
    const showMeta = () => {
      const box = $('#pMeta', main);
      $('#pHint', main).textContent = 'Keine Fotos von anderen Personen ohne deren Erlaubnis. Das Bild wird verkleinert' +
        (metaOn() ? '. Dieses Netzwerk speichert Aufnahmezeit und Kamera deines Fotos mit.' : ', Ort und Kameradaten werden entfernt.');
      if (!metaOn() || !meta) { box.hidden = true; return; }
      const row = (ic, k, v) => '<li>' + ic + '<span>' + k + '</span><b' + (v ? '' : ' class="muted"') + '>' + esc(v || 'nicht in der Datei') + '</b></li>';
      box.innerHTML = '<b>Wird mitgespeichert</b><ul>' +
        row(IC.clock, 'Aufgenommen', meta.taken_at ? metaWhen(meta.taken_at) : '') +
        row(IC.camera, 'Kamera', meta.camera) + '</ul>';
      box.hidden = false;
    };
    S.onMeta = showMeta;
    showMeta();
    // Bild (zugeschnitten oder nicht) verkleinern und zeigen
    const use = async (src, before) => {
      $('#pInfo', main).textContent = 'wird verkleinert …';
      try {
        pic = await M.compress(src);
        $('#pick', main).innerHTML = '<img src="' + pic.preview + '" alt="">';
        $('#pick', main).classList.add('pick--img');
        $('#pActs', main).hidden = false;
        $('#pInfo', main).textContent = (before ? 'Original ' + Math.round(before / 1024) + ' KB → ' : 'Fertig: ') + Math.round(pic.after / 1024) + ' KB (' + pic.w + '×' + pic.h + ')';
        $('#pGo', main).disabled = false;
      } catch (e) { $('#pInfo', main).textContent = ''; toast(e.message, true); }
    };
    // neues Bild: gleich zuschneiden (Abbrechen = ganzes Bild)
    const take = async (src, before, m) => {
      orig = { src, before };
      meta = m || (src && src.shMeta ? { taken_at: localStamp(src.shMeta.at), camera: src.shMeta.camera } : {});
      showMeta();
      const c = await window.SHPhoto.crop(src, { start: 0.8 });
      await use(c || src, c ? null : before);
    };
    const fromFile = async (inp) => {
      const fl = inp.files[0];
      inp.value = '';
      if (!fl) return;
      const m = window.SHExif ? await window.SHExif.read(fl) : {};
      try { await take(await M.decode(fl), fl.size, m); } catch (e) { toast(e.message, true); }
    };
    const wirePick = () => {
      const file = $('#pFile', main);
      if (file) file.onchange = () => fromFile(file);
      if ($('#pCam', main)) $('#pCam', main).onclick = async () => {
        const c = await window.SHPhoto.camera();
        if (c === 'fallback') { $('#pCap', main).click(); return; }
        if (c) take(c, null);
      };
    };
    $('#pCap', main).onchange = () => fromFile($('#pCap', main));
    wirePick();
    $('#pCrop', main).onclick = async () => {
      if (!orig) return;
      const c = await window.SHPhoto.crop(orig.src, { start: 0.8 });
      if (c) use(c, null);
    };
    $('#pNew', main).onclick = () => {
      pic = null; orig = null; meta = null;
      showMeta();
      $('#pick', main).innerHTML = pickHtml;
      $('#pick', main).classList.remove('pick--img');
      $('#pActs', main).hidden = true;
      $('#pInfo', main).textContent = '';
      $('#pGo', main).disabled = true;
      wirePick();
    };
    $('#pForm', main).onsubmit = async (e) => {
      e.preventDefault();
      if (!pic) return;
      const f = e.target;
      // Analytics (0270): ein Foto-Netzwerk fragt beim Posten nach dem Mikrofon
      if (window.SHTrack && SHTrack.isOn()) SHTrack.askMic();
      $('#pGo', main).disabled = true;
      const up = await hcall('sh_media_put', { p_data: pic.data, p_thumb: pic.thumb, p_mime: pic.mime });
      if (!up || !up.ok) { fail(up); $('#pGo', main).disabled = false; return; }
      M.prime(S.hub.hub.id, up.name, pic.preview);
      const tags = f.t ? (f.t.value.match(/[#]?[\wäöüß]+/gi) || []).map(x => x.replace(/^#/, '').toLowerCase()) : [];
      const r = await hcall('sh_photo_post', { p_image: up.name, p_description: f.d.value.trim() || null, p_tags: tags,
                                               p_meta: metaOn() && meta ? meta : null });
      if (!r || !r.ok) { fail(r); $('#pGo', main).disabled = false; return; }
      toast('Gepostet!');
      S.tab = 'profile';
      renderHub();
    };
  }

  /* ── Adminbereich: Einstellungen · SQL · Diagramm ───────── */
  function renderAdmin(main) {
    if (!S.hub.admin) { main.innerHTML = '<p class="muted center-t">Nur für Admins.</p>'; return; }
    main.innerHTML = '<div class="adm" id="adm"></div>';
    const body = $('#adm', main);
    if (S.adminTab === 'settings') adminSettings(body);
    else if (S.adminTab === 'ads' && window.SHAds) {
      S.adsTab = SHAds.tab(body, { call: hcall, toast, fail, dialog, hydrate, hubId: S.hub.hub.id, upload: () => !!S.hub.upload });
    } else {
      body.classList.add('adm--db');
      S.db = window.SHDB.create(body, { api: (fn, args) => hcall(fn, args), toast, tab: S.adminTab === 'diagram' ? 'diagram' : 'sql', onChanged: () => refreshHub() });
    }
  }

  function adminSettings(body) {
    const h = S.hub.hub;
    body.innerHTML = '<div class="adm-pad"><h2 class="adm-h">Einstellungen</h2><div id="admEd"></div></div>';
    brandEditor($('#admEd', body), h, {
      live: true,
      onSubmit: async (v) => {
        const r = await hcall('sh_brand', { p_name: v.name, p_logo: v.logo, p_logo_img: v.logo === 'custom' && v.custom ? v.custom.data : null,
                                            p_color: v.color, p_scheme: v.scheme });
        if (!r || !r.ok) { fail(r); return; }
        if (v.logo === 'custom' && v.custom) { S.logoUrls[h.id] = v.custom.preview; S.color[h.id] = S.color._new; }
        S.hub.hub = r.hub;
        applyColor(r.hub);
        toast('Gespeichert');
        renderHub();
      }
    });
  }

  /* ══ Zustand vom Raum (Lehrkraft hat Tabellen geändert) ═══
     Nie über ein Formular zeichnen: nur Startseite und App-Reiter
     ohne Eingaben werden neu gezeichnet, sonst nur die Daten. */
  let firstState = true;
  A.onState(async () => {
    if (firstState) { firstState = false; return; }
    if (S.onMeta && $('#pMeta')) S.onMeta();       // Hinweis beim Posten, ohne das Formular neu zu zeichnen
    if (S.screen === 'hub' && S.hub) {
      syncReveal();
      const prev = JSON.stringify([S.hub.tables, S.hub.upload]);
      await refreshHub();
      if (S.screen !== 'hub' || !S.hub) return;
      manageTrack();                                // sessions erstellt/entzogen → Tracking an/aus
      if (JSON.stringify([S.hub.tables, S.hub.upload]) === prev) return;
      if (S.view === 'app' && (S.tab === 'feed' || S.tab === 'search' || S.tab === 'profile' || (S.tab === 'post' && !on('photos')))) renderHub();
      else toast('Die Lehrkraft hat die Tabellen geändert.');
    } else if (S.screen === 'home') {
      loadHome(true);
    }
  });

  // Lehrkraft-Übersicht frisch halten – nur, solange sie wirklich zu sehen ist
  setInterval(() => {
    if (T && S.screen === 'home' && document.visibilityState === 'visible' && !document.querySelector('.dlg-back')) loadHome(true);
  }, 15000);

  /* ── Hell / Dunkel wie MPSkills drumherum ──────────────── */
  (function syncTheme() {
    let pd = null;
    try { pd = window.parent !== window ? window.parent.document.documentElement : null; } catch (e) { pd = null; }
    if (!pd) return;
    const apply = () => {
      const t = pd.getAttribute('data-theme');
      if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
      else document.documentElement.removeAttribute('data-theme');
      if (S.screen === 'home' && T) requestAnimationFrame(drawTableLines);
    };
    apply();
    try { new MutationObserver(apply).observe(pd, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* egal */ }
  })();

  /* ── Fehler sichtbar machen ─────────────────────────────── */
  // Ein Fehler im Skript soll nicht still eine leere Fläche hinterlassen:
  // die Meldung erscheint unten als rote Leiste (Text für die Fehlersuche).
  (function showErrors() {
    let last = '';
    const show = (msg) => {
      msg = String(msg || 'Unbekannter Fehler').slice(0, 300);
      if (msg === last) return;
      last = msg;
      toast('Fehler: ' + msg, true);
    };
    window.addEventListener('error', (e) => show(e.message + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')));
    window.addEventListener('unhandledrejection', (e) => show(e.reason && (e.reason.message || e.reason)));
  })();

  /* ── Start ──────────────────────────────────────────────── */
  document.body.classList.remove('loading');
  if (!A.IN_FRAME && !A.APP) { renderError({ error: 'no_room' }); return; }
  if (A.APP) document.documentElement.classList.add('is-app');
  else A.hello();
  loadHome();
})();
