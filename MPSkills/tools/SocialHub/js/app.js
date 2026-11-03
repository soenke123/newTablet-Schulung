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
    bell:    { name: 'Glocke',   color: '#e91d77' },
    connect: { name: 'Connect',  color: '#d97706' },
    rocket:  { name: 'Rakete',   color: '#ea580c' },
    graph:   { name: 'Graph',    color: '#2563eb' },
    trend:   { name: 'Trend',    color: '#0d9488' },
    chat:    { name: 'Plausch',  color: '#dc2626' },
    like:    { name: 'Like',     color: '#7c3aed' },
    mesh:    { name: 'Netz',     color: '#16a34a' }
  };
  // users gibt es immer; alles andere erstellt die Lehrkraft (Migration 0263).
  const TABLES = [
    { id: 'photos',        what: 'Fotos posten, Feed' },
    { id: 'follows',       what: 'Folgen, Follower, Feed „Folge ich“' },
    { id: 'likes',         what: 'Herz an Fotos, „Für dich“ lernt mit', needs: 'photos' },
    { id: 'comments',      what: 'Kommentare unter Fotos', needs: 'photos' },
    { id: 'comment_likes', what: 'Herzen an Kommentaren', needs: 'comments' },
    { id: 'tags',          what: 'Hashtags (mit photo_tag)', needs: 'photos' }
  ];
  const NEEDS = {};
  TABLES.forEach(t => { if (t.needs) NEEDS[t.id] = t.needs; });
  // alles, was (auch über Umwege) an t hängt
  const dependents = t => TABLES.filter(x => { for (let n = NEEDS[x.id]; n; n = NEEDS[n]) if (n === t) return true; return false; }).map(x => x.id);
  const SWATCHES = ['#fe2c55', '#e91d77', '#7c3aed', '#2563eb', '#0ea5e9', '#0d9488', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#64748b'];
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
    adminTab: 'settings', // settings | sql | diagram
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
    toastT = setTimeout(() => { el.className = 'toast'; }, 2600);
  }
  const fail = r => toast(A.errText(r), true);

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
    root.setAttribute('data-scheme', h.scheme === 'light' ? 'light' : 'dark');
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
    const r = await A.call('sh_home', {});
    if (!r || !r.ok) { if (!quiet) renderError(r); return; }
    // ein Takt im Hintergrund darf nicht über ein Formular zeichnen
    if (quiet && S.screen !== 'home') return;
    S.home = r;
    S.hub = null;
    closeDb();
    applyColor(null);
    // Schüler: beim ersten Laden gleich ins eigene Netzwerk
    if (!T && !S.autoOpened && r.hubs.length === 1 && !r.hubs[0].locked) {
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
      // Schüler: nur das eigene Netzwerk (und eines, in dem dieses Gerät angemeldet ist)
      if (!h.mine) {
        html += '<section class="found-cta">' +
          '<div class="fc-ic">' + IC.phone + '</div>' +
          '<h1>Dein eigenes soziales Netzwerk</h1>' +
          '<p>Gib ihm einen Namen, ein Logo und deine Farben. Du bist dort Admin.</p>' +
          '<button type="button" class="btn btn--accent btn--big" id="btnFound">Netzwerk erstellen</button></section>';
      }
      if (h.hubs.length) {
        html += '<section><h2>' + (h.hubs.length > 1 ? 'Deine Netzwerke' : 'Dein Netzwerk') + '</h2><div class="net-grid">' +
          h.hubs.map(x => netTile(x)).join('') + '</div></section>';
      }
      html += '<p class="small muted center-t"><button type="button" class="link" id="btnNetLogin">Dein Netzwerk wurde auf einem anderen Tablet erstellt? Hier anmelden</button></p>';
    }
    html += '</div>';
    app.innerHTML = html;
    $$('[data-open]').forEach(b => b.addEventListener('click', () => openHub(b.dataset.open)));
    if ($('#btnFound')) $('#btnFound').onclick = renderFound;
    if ($('#btnNetLogin')) $('#btnNetLogin').onclick = renderNetLogin;
    if (T) wireTeacher();
  }

  function netTile(x) {
    return '<button type="button" class="net-tile' + (x.locked ? ' is-locked' : '') + '" data-open="' + esc(x.id) + '" style="--c:' + esc(accentOf(x)) + '">' +
      logoHtml(x, 'logo--tile') + '<span class="nt-t"><b>' + esc(x.name) + '</b>' +
      '<small>' + x.users + ' User · ' + x.photos + ' Fotos' + (x.locked ? ' · gesperrt' : '') + '</small></span>' +
      '<span class="go">Öffnen ›</span></button>';
  }

  /* ── Lehrkraft: Startseite ──────────────────────────────── */
  function teacherHome() {
    const h = S.home;
    const hubs = h.hubs;
    let html = '';
    if (!h.mine) {
      html += '<section class="cta-bar"><div class="fc-ic">' + IC.phone + '</div><div class="cta-t"><b>Eigenes Netzwerk erstellen</b>' +
        '<span>Mit allem, was die Klasse auch hat: zum Ausprobieren, Vorführen und Vergleichen.</span></div>' +
        '<button type="button" class="btn btn--accent" id="btnFound">Netzwerk erstellen</button></section>';
    }
    html += '<section class="panel"><div class="panel-h"><h2>Netzwerke im Raum <span class="muted">(' + hubs.length + ')</span></h2></div>' +
      (hubs.length ? '<div class="net-list">' + hubs.map(x =>
        '<div class="net-row' + (x.mine ? ' is-mine' : '') + (x.locked ? ' is-locked' : '') + '">' +
          '<button type="button" class="nr-main" data-open="' + esc(x.id) + '" title="Öffnen">' + logoHtml(x, 'logo--row') +
            '<span class="nr-t"><b>' + esc(x.name) + (x.mine ? ' <span class="badge badge--gold">Dein Netzwerk</span>' : '') + '</b>' +
            '<small>' + esc(x.mine ? 'von dir' : (x.person || '')) + (x.locked ? ' · <b class="bad">gesperrt</b>' : '') + '</small></span></button>' +
          '<span class="nr-acts">' +
            '<button type="button" class="icon-btn icon-btn--s" data-reset="' + esc(x.id) + '" title="Admin-Passwort zurücksetzen">' + IC.key + '</button>' +
            (x.mine ? '' : '<button type="button" class="icon-btn icon-btn--s" data-lock="' + esc(x.id) + '" data-v="' + (x.locked ? '0' : '1') + '" title="' + (x.locked ? 'Entsperren' : 'Sperren') + '">' + (x.locked ? IC.unlock : IC.lock) + '</button>') +
            '<button type="button" class="icon-btn icon-btn--s icon-btn--bad" data-del="' + esc(x.id) + '" title="Löschen">' + IC.trash + '</button>' +
          '</span></div>').join('') + '</div>'
        : '<p class="muted">Noch keine Netzwerke. Sobald die Klasse im Raum ist, erstellt jede Person ihr eigenes.</p>') +
      '</section>';
    html += '<section class="panel"><div class="panel-h"><h2>Tabellen für alle Netzwerke</h2>' +
      '<label class="switch switch--s"><input type="checkbox" id="upTgl"' + (h.upload ? ' checked' : '') + '><span></span>Eigene Bilder hochladen</label></div>' +
      '<p class="muted small">users gibt es immer. Jede Tabelle, die du erstellst, bringt ihre Funktion in alle Netzwerke dieses Raums. Antippen zeigt die Attribute.</p>' +
      tableDiagramHtml() + '<div class="tdg-info" id="tdgInfo">' + tableInfoHtml(S.tblSel) + '</div></section>';
    return html;
  }

  /* Tabellen-Diagramm (nur Namen, Linien = Fremdschlüssel)
     Spalte/Zeile im Raster: users in der Mitte der Beziehungen. */
  const TPOS = {
    follows: [1, 1], users: [2, 1], likes: [3, 1], photos: [4, 1], photo_tag: [5, 1], tags: [6, 1],
    comment_likes: [2, 2], comments: [3, 2]
  };
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
  function tableDiagramHtml() {
    const names = Object.keys(TPOS);
    return '<div class="tdg-wrap"><div class="tdg" id="tdg"><svg class="tdg-lines" id="tdgLines"></svg>' + names.map(t => {
      const fixed = t === 'users';
      const isOn = tblOn(t);
      const def = TABLES.find(x => x.id === t);
      // photo_tag kommt mit tags
      const auto = t === 'photo_tag';
      const blocked = def && def.needs && !tblOn(def.needs);
      let act = '';
      if (fixed) act = '<span class="tb-ic" title="immer da">' + IC.lock + '</span>';
      else if (auto) act = '<span class="tb-note">mit tags</span>';
      else if (isOn) act = '<button type="button" class="tb-btn" data-tdrop="' + t + '" title="Entziehen">' + IC.x + '<span>Entziehen</span></button>';
      else act = '<button type="button" class="tb-btn tb-btn--add" data-tadd="' + t + '"' + (blocked ? ' disabled title="Erst ' + def.needs + ' erstellen"' : ' title="Erstellen"') + '>' + IC.plus + '<span>Erstellen</span></button>';
      return '<div class="tb' + (fixed ? ' tb--fixed' : isOn ? ' tb--on' : ' tb--off') + (S.tblSel === t ? ' tb--sel' : '') + '" data-tb="' + t + '" ' +
        'style="grid-column:' + TPOS[t][0] + ';grid-row:' + TPOS[t][1] + '" tabindex="0">' +
        '<code>' + esc(t) + '</code>' + act + '</div>';
    }).join('') + '</div></div>';
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
  // Linien zwischen den Kästen nach dem Zeichnen ausrechnen
  function drawTableLines() {
    const box = $('#tdg'), svg = $('#tdgLines');
    if (!box || !svg) return;
    const R = box.getBoundingClientRect();
    const rect = t => { const el = box.querySelector('[data-tb="' + t + '"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height }; };
    // Punkt auf dem Rand von r Richtung (tx, ty)
    const edge = (r, tx, ty) => {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = tx - cx, dy = ty - cy;
      const k = Math.min(Math.abs((r.w / 2) / (dx || 1e-9)), Math.abs((r.h / 2) / (dy || 1e-9)));
      return [cx + dx * k, cy + dy * k];
    };
    let out = '';
    Object.keys(TPOS).forEach(t => {
      const cols = parseDdl(t).filter(c => c.fk);
      cols.forEach((c, i) => {
        const a = rect(t), b = rect(c.fk);
        if (!a || !b) return;
        const live = tblOn(t) && tblOn(c.fk);
        // zwei Fremdschlüssel auf dieselbe Tabelle (follows): parallel versetzt
        const same = cols.filter(x => x.fk === c.fk);
        const off = same.length > 1 ? (same.indexOf(c) - (same.length - 1) / 2) * 12 : 0;
        const ax = a.x + a.w / 2, ay = a.y + a.h / 2 + off, bx = b.x + b.w / 2, by = b.y + b.h / 2 + off;
        const p = edge({ x: a.x, y: a.y + off, w: a.w, h: a.h }, bx, by), q = edge({ x: b.x, y: b.y + off, w: b.w, h: b.h }, ax, ay);
        out += '<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + q[0] + '" y2="' + q[1] + '" class="' + (live ? 'on' : 'off') + '"/>' +
          // n-Seite (Fremdschlüssel) mit Punkt, 1-Seite mit Strich
          '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" class="' + (live ? 'on' : 'off') + '"/>';
      });
    });
    svg.setAttribute('width', R.width);
    svg.setAttribute('height', R.height);
    svg.innerHTML = out;
  }

  function wireTeacher() {
    const save = async (tables, upload) => {
      const next = Object.assign({}, A.state, { tables, upload });
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
    $$('[data-tb]').forEach(el => el.onclick = () => {
      S.tblSel = S.tblSel === el.dataset.tb ? null : el.dataset.tb;
      $$('[data-tb]').forEach(x => x.classList.toggle('tb--sel', x.dataset.tb === S.tblSel));
      $('#tdgInfo').innerHTML = tableInfoHtml(S.tblSel);
      wireInfo();
    });
    const wireInfo = () => { if ($('#tiClose')) $('#tiClose').onclick = () => { S.tblSel = null; $$('[data-tb]').forEach(x => x.classList.remove('tb--sel')); $('#tdgInfo').innerHTML = ''; }; };
    wireInfo();
    $('#upTgl').onchange = (e) => save(cur(), e.target.checked);
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
    const v = { name: init.name || '', logo: init.logo || 'rocket', custom: null, color: init.color || null, scheme: init.scheme || 'dark' };
    const id = init.id || '_new';
    const customUrl = () => v.custom ? v.custom.preview : (init.logo === 'custom' ? S.logoUrls[id] : null);
    const lc = () => v.logo === 'custom' ? (v.custom ? S.color._new : S.color[id]) || '#fe2c55' : LOGOS[v.logo].color;
    const accent = () => v.color || lc();
    const live = () => { if (o.live) applyColor({ id, logo: v.logo, color: accent(), scheme: v.scheme }); };
    const mock = () => {
      const lg = v.logo === 'custom' ? (customUrl() ? '<img class="logo logo--s" src="' + esc(customUrl()) + '" alt="">' : '<span class="logo logo--s logo--wait"></span>')
                                     : '<img class="logo logo--s" src="img/logos/' + v.logo + '.png" alt="">';
      return '<div class="mock" data-mock="' + v.scheme + '" style="--mc:' + esc(accent()) + '">' +
        '<div class="mk-top">' + lg + '<b>' + esc(v.name || 'Dein Netzwerk') + '</b></div>' +
        '<div class="mk-card"><span class="mk-heart">' + IC.heart + '</span><span class="mk-user">@admin</span><span class="mk-tag">#vorschau</span></div>' +
        '<div class="mk-row"><span class="mk-btn">Folgen</span><span class="mk-link">12 Follower</span></div>' +
        '<div class="mk-nav">' + IC.home + IC.search + '<span class="mk-plus">' + IC.plus + '</span>' + IC.user + '</div></div>';
    };
    const paint = () => {
      host.innerHTML = '<form class="brand-ed" autocomplete="off">' +
        '<div class="be-form form">' +
          '<label>Name des Netzwerks<input name="name" maxlength="30" required placeholder="z. B. Pixelwelt" value="' + esc(v.name) + '"></label>' +
          '<div class="lbl">Logo</div>' + logoPicker(v.logo, customUrl()) +
          '<input type="file" accept="image/*" id="beFile" hidden>' +
          '<div class="lbl">Farbschema</div>' +
          '<div class="seg seg--s"><button type="button" data-sc="dark"' + (v.scheme === 'dark' ? ' class="on"' : '') + '>Dunkel</button>' +
          '<button type="button" data-sc="light"' + (v.scheme === 'light' ? ' class="on"' : '') + '>Hell</button></div>' +
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
  function renderFound() {
    S.screen = 'found';
    app.innerHTML = '<div class="home home--wide"><header class="home-top"><button class="icon-btn" id="back" title="Zurück">' + IC.back + '</button>' +
      '<span class="brand">Netzwerk erstellen</span></header>' +
      '<ol class="steps"><li class="on"><b>1</b> Name, Logo, Farben</li><li><b>2</b> Dein Admin-Konto</li></ol>' +
      '<div id="foundEd"></div></div>';
    $('#back').onclick = () => { S.screen = 'home'; renderHome(); };
    brandEditor($('#foundEd'), { name: '', logo: 'rocket', scheme: 'dark' }, {
      submitLabel: 'Weiter',
      onSubmit: async (v) => {
        const r = await A.call('sh_found', { p_name: v.name, p_logo: v.logo === 'custom' ? 'rocket' : v.logo, p_color: v.color, p_scheme: v.scheme });
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
    S.adminTab = 'settings';
    if (r.needs_admin) renderLogin('admin');
    // Lehrkraft schaut ohne Konto zu (Admin), kann sich aber oben anmelden
    else if (!r.me && !T) renderLogin('login');
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
    const h = S.hub.hub;
    const canReg = S.hub.founder || T;
    if (mode === 'reg' && !canReg) mode = 'login';
    const isAdmin = mode === 'admin';
    const genderSel = '<select name="gender"><option value="">Geschlecht …</option>' + GENDERS.map(g => '<option value="' + g[0] + '">' + g[1] + '</option>').join('') + '</select>';
    app.innerHTML = '<div class="login">' +
      '<button class="icon-btn login-back" id="back" title="Zurück">' + IC.back + '</button>' +
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
          '<p class="muted small center-t">Passwort vergessen? ' + (T ? 'Als Lehrkraft bist du hier ohnehin Admin.' : 'Die Lehrkraft kann das Admin-Passwort zurücksetzen.') + '</p></form>'
        : '<form class="form" id="rForm" autocomplete="off">' +
          '<label>Benutzername<input name="user" placeholder="a–z, 0–9, . _" maxlength="24" autocapitalize="off" required' + (isAdmin ? ' value="admin"' : '') + '></label>' +
          '<div class="f2"><input name="name" placeholder="Name" maxlength="40">' + genderSel + '</div>' +
          '<input name="email" type="email" placeholder="E-Mail (ausgedacht)" maxlength="100">' +
          '<div class="f2"><label class="small">Geburtstag<input name="bday" type="date"></label><label class="small">Wohnort<input name="city" maxlength="60"></label></div>' +
          '<textarea name="bio" rows="2" maxlength="160" placeholder="Über mich"></textarea>' +
          '<div class="f2"><input name="pw" type="password" placeholder="Passwort" maxlength="60" required autocomplete="new-password">' +
          '<input name="pw2" type="password" placeholder="Passwort wiederholen" maxlength="60" required autocomplete="new-password"></div>' +
          keepHtml() +
          '<p class="hint">Nimm kein echtes Passwort. Damit meldest du dich auch an anderen Geräten an.</p>' +
          '<button class="btn btn--accent btn--big" type="submit">' + (isAdmin ? 'Netzwerk starten' : 'Konto erstellen') + '</button></form>') +
      '</div></div>';
    // Lehrkraft zurück ins Netzwerk (sie ist dort ohnehin Admin), sonst zur Startseite
    $('#back').onclick = () => (T && !isAdmin) ? renderHub() : loadHome();
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
        p_city: f.city.value.trim() || null, p_gender: f.gender.value || null, p_bio: f.bio.value.trim() || null });
      if (!r || !r.ok) { fail(r); return; }
      A.session.set(h.id, r.session, f.keep.checked);
      toast(r.admin ? 'Dein Netzwerk ist online!' : 'Willkommen!');
      openHub(h.id);
    };
  }

  /* ══ Im Netzwerk ═══════════════════════════════════════════ */
  function renderHub() {
    S.screen = 'hub';
    const h = S.hub;
    if (!h.admin) S.view = 'app';
    const admin = S.view === 'admin';
    const nav = [['feed', IC.home, 'Start'], ['search', IC.search, 'Suche']];
    if (h.me) nav.push(['post', IC.plus, '']);
    if (h.me) nav.push(['profile', IC.user, 'Profil']);
    const sub = [['settings', IC.gear, 'Einstellungen'], ['sql', IC.code, 'SQL'], ['diagram', IC.table, 'Diagramm']];
    app.innerHTML = '<div class="hub' + (admin ? ' hub--admin' : '') + '">' +
      '<header class="hub-top"><button class="icon-btn" id="toHome" title="Startseite">' + IC.back + '</button>' +
      logoHtml(h.hub, 'logo--s') + '<b class="hub-name">' + esc(h.hub.name) + '</b>' +
      (h.admin ? '<nav class="views"><button type="button" data-view="app"' + (!admin ? ' class="on"' : '') + '>App</button>' +
                 '<button type="button" data-view="admin"' + (admin ? ' class="on"' : '') + '>Adminbereich</button></nav>' : '') +
      (admin ? '<nav class="subtabs">' + sub.map(x => '<button type="button" data-at="' + x[0] + '"' + (S.adminTab === x[0] ? ' class="on"' : '') + '>' + x[1] + '<span>' + x[2] + '</span></button>').join('') + '</nav>' : '') +
      '<span class="spacer"></span>' +
      (h.me ? '<span class="chip">@' + esc(h.me.username) + (T ? ' · Lehrkraft' : '') + '</span>'
            : T ? '<span class="chip chip--lk">Lehrkraft · Admin</span><button type="button" class="btn btn--accent btn--s" id="lkLogin">Testkonto</button>' : '') +
      '</header>' +
      '<main class="hub-main" id="main"></main>' +
      (admin ? '' : '<nav class="hub-nav">' + nav.map(x => '<button type="button" data-tab="' + x[0] + '" class="' + (x[0] === 'post' ? 'nav-post' : '') + (S.tab === x[0] ? ' on' : '') + '">' + x[1] + (x[2] ? '<span>' + x[2] + '</span>' : '') + '</button>').join('') + '</nav>') +
      '</div>';
    $('#toHome').onclick = () => { closeDb(); S.autoOpened = true; loadHome(); };
    if ($('#lkLogin')) $('#lkLogin').onclick = () => { closeDb(); renderLogin('login'); };
    $$('[data-view]').forEach(b => b.onclick = () => { if (S.view === b.dataset.view) return; closeDb(); S.view = b.dataset.view; renderHub(); });
    $$('[data-at]').forEach(b => b.onclick = () => {
      const t = b.dataset.at;
      if (S.adminTab === t) return;
      $$('[data-at]').forEach(x => x.classList.toggle('on', x === b));
      const wasDb = S.adminTab !== 'settings';
      S.adminTab = t;
      // SQL ↔ Diagramm: dieselbe Kopie, nur umschalten
      if (wasDb && t !== 'settings' && S.db) { S.db.show(t === 'diagram' ? 'diagram' : 'sql'); return; }
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
  }

  function closeDb() { if (S.db) { S.db.destroy(); S.db = null; } }

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
    const canDel = it.mine || S.hub.admin;
    return '<article class="card" data-i="' + i + '" data-id="' + it.id + '">' +
      '<div class="card-bg" data-m="' + esc(it.image) + '" data-thumb="1"></div>' +
      '<img class="card-img" data-m="' + esc(it.image) + '" alt="" draggable="false">' +
      '<span class="burst">' + IC.heart + '</span>' +
      '<div class="rail">' +
        '<button type="button" class="r-av" data-act="profile">' + avatarHtml(it.user, 'l') +
          (it.following === false && !it.mine ? '<span class="r-plus" data-act="follow">+</span>' : '') + '</button>' +
        (likeOk ? '<button type="button" class="r-btn' + (it.liked ? ' liked' : '') + '" data-act="like">' + IC.heart + '<span>' + n(it.likes) + '</span></button>' : '') +
        (comOk ? '<button type="button" class="r-btn" data-act="comments">' + IC.chat + '<span>' + n(it.comments) + '</span></button>' : '') +
        (canDel ? '<button type="button" class="r-btn r-more" data-act="more">' + IC.more + '</button>' : '') +
      '</div>' +
      '<div class="meta"><button type="button" class="m-user" data-act="profile">@' + esc(it.user.username) + '</button>' +
        '<span class="m-time">· ' + esc(ago(it.created_at)) + '</span>' +
        (it.description ? '<p class="m-desc">' + esc(it.description) + '</p>' : '') +
        (it.tags && it.tags.length ? '<div class="m-tags">' + it.tags.map(t => '<button type="button" data-tag="' + esc(t) + '">#' + esc(t) + '</button>').join('') + '</div>' : '') +
      '</div></article>';
  }

  /* Ein Feed in host. opts: mode, arg, endless, startId */
  function Feed(host, opts) {
    const LIM = 6;
    let offset = 0, seed = Math.floor(Math.random() * 1e6), loading = false, finished = false, idx = 0;
    const items = [];
    host.innerHTML = '<div class="feed"></div>';
    const list = $('.feed', host);
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { io.unobserve(e.target); more(); }
    }, { root: list, rootMargin: '0px 0px 150% 0px' });

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
      const cards = Array.from(frag.children);
      cards.forEach(c => list.appendChild(c));
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
      if (tagB) { openViewer({ mode: 'tag', arg: tagB.dataset.tag, title: '#' + tagB.dataset.tag }); return; }
      const card = e.target.closest('.card');
      if (!card) return;
      const it = items[+card.dataset.i];
      const actEl = e.target.closest('[data-act]');
      const act = actEl ? actEl.dataset.act : null;
      if (act === 'follow') { e.stopPropagation(); follow(it, card); return; }
      if (act === 'profile') { openProfile(it.user.id); return; }
      if (act === 'like') { like(it, card, !it.liked); return; }
      if (act === 'comments') { openComments(it, card); return; }
      if (act === 'more') { moreMenu(it, card); return; }
      // Doppeltipp aufs Bild = Herz
      const now = Date.now();
      if (now - lastTap < 320 && it.likes != null) {
        const b = card.querySelector('.burst');
        b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
        if (!it.liked) like(it, card, true);
      }
      lastTap = now;
    });

    function syncCards(it) {
      $$('.card[data-id="' + it.id + '"]', list).forEach(c => {
        const b = c.querySelector('[data-act="like"]');
        if (b) { b.classList.toggle('liked', !!it.liked); b.querySelector('span').textContent = n(it.likes); }
        const cb = c.querySelector('[data-act="comments"] span');
        if (cb) cb.textContent = n(it.comments);
      });
      items.forEach(x => { if (x !== it && x.id === it.id) { x.liked = it.liked; x.likes = it.likes; x.comments = it.comments; } });
    }

    async function like(it, card, val) {
      if (!S.hub.me) { toast(T ? 'Zum Mitmachen oben ein Testkonto anlegen.' : 'Melde dich an, um zu liken.'); return; }
      it.liked = val; it.likes += val ? 1 : -1;
      syncCards(it);
      const r = await hcall('sh_like', { p_photo: it.id, p_on: val });
      if (!r || !r.ok) { it.liked = !val; it.likes += val ? -1 : 1; syncCards(it); fail(r); }
      else { it.likes = r.likes; syncCards(it); }
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
        (c.hearts != null ? '<button type="button" class="c-heart' + (c.liked ? ' liked' : '') + '" data-ch="' + c.id + '" data-v="' + (c.liked ? '0' : '1') + '">' + IC.heart + '<span>' + n(c.hearts) + '</span></button>' : '') +
        '</div>').join('') : '<p class="muted center-t">Noch keine Kommentare. Schreib den ersten!</p>';
      hydrate(listEl);
    }
    listEl.addEventListener('click', async (e) => {
      const h = e.target.closest('[data-ch]');
      if (h) {
        if (!S.hub.me) return;
        const r = await hcall('sh_comment_like', { p_comment: +h.dataset.ch, p_on: h.dataset.v === '1' });
        if (!r || !r.ok) fail(r); else load();
        return;
      }
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
              : (r.i_follow != null && S.hub.me ? '<button type="button" class="btn ' + (r.i_follow ? 'btn--ghost' : 'btn--accent') + '" id="pFollow">' + (r.i_follow ? 'Gefolgt ✓' : 'Folgen') + '</button>' : '')) +
      '</div></div>' +
      (r.photos == null ? '' : r.photos.length ? '<div class="grid3">' + r.photos.map(p => '<button type="button" class="g-it" data-pid="' + p.id + '"><span class="g-img" data-m="' + esc(p.image) + '" data-thumb="1"></span></button>').join('') + '</div>'
                       : '<p class="muted center-t">Noch keine Fotos.</p>') + '</div>';
    hydrate(main);
    $$('[data-pid]', main).forEach(b => b.onclick = () => openViewer({ mode: 'user', arg: u.id, startId: +b.dataset.pid, title: '@' + u.username }));
    if ($('#pFollow', main)) $('#pFollow', main).onclick = async () => {
      const rr = await hcall('sh_follow', { p_user: u.id, p_on: !r.i_follow });
      if (!rr || !rr.ok) { fail(rr); return; }
      renderProfile(main, uid, inOverlay);
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
      '<label>Wohnort<input name="city" maxlength="60" value="' + esc(u.city || '') + '"></label>' +
      '<label>Geschlecht<select name="gender"><option value="">–</option>' + GENDERS.map(g => '<option value="' + g[0] + '"' + (u.gender === g[0] ? ' selected' : '') + '>' + g[1] + '</option>').join('') + '</select></label>' +
      '<button class="btn btn--accent btn--big">Speichern</button></form>');
    hydrate(sh.el);
    const file = $('#peFile', sh.el);
    if (file) file.onchange = async () => {
      if (!file.files[0]) return;
      try {
        const c = await M.compress(file.files[0]);
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
      const r = await hcall('sh_me_update', { p_name: f.name.value.trim() || null, p_bio: f.bio.value.trim() || null, p_avatar: avatar || null, p_city: f.city.value.trim() || null, p_gender: f.gender.value || null });
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
    let pic = null;
    main.innerHTML = '<form class="post form" id="pForm">' +
      '<label class="pick" id="pick">' + IC.image + '<span>Foto wählen</span><input type="file" accept="image/*" id="pFile" hidden></label>' +
      '<div class="pick-info muted small" id="pInfo"></div>' +
      '<textarea name="d" maxlength="300" rows="3" placeholder="Beschreibe dein Foto …"></textarea>' +
      (on('tags') ? '<input name="t" placeholder="#hashtags, z. B. #natur #sommer" autocapitalize="off">' : '') +
      '<p class="hint">Keine Fotos von anderen Personen ohne deren Erlaubnis. Das Bild wird verkleinert, Ort und Kameradaten werden entfernt.</p>' +
      '<button class="btn btn--accent btn--big" id="pGo" disabled>Posten</button></form>';
    const file = $('#pFile', main);
    file.onchange = async () => {
      if (!file.files[0]) return;
      $('#pInfo', main).textContent = 'wird verkleinert …';
      try {
        pic = await M.compress(file.files[0]);
        $('#pick', main).innerHTML = '<img src="' + pic.preview + '" alt="">';
        $('#pick', main).appendChild(file);
        $('#pInfo', main).textContent = 'Original ' + Math.round(pic.before / 1024) + ' KB → ' + Math.round(pic.after / 1024) + ' KB (' + pic.w + '×' + pic.h + ')';
        $('#pGo', main).disabled = false;
      } catch (e) { $('#pInfo', main).textContent = ''; toast(e.message, true); }
    };
    $('#pForm', main).onsubmit = async (e) => {
      e.preventDefault();
      if (!pic) return;
      const f = e.target;
      $('#pGo', main).disabled = true;
      const up = await hcall('sh_media_put', { p_data: pic.data, p_thumb: pic.thumb, p_mime: pic.mime });
      if (!up || !up.ok) { fail(up); $('#pGo', main).disabled = false; return; }
      M.prime(S.hub.hub.id, up.name, pic.preview);
      const tags = f.t ? (f.t.value.match(/[#]?[\wäöüß]+/gi) || []).map(x => x.replace(/^#/, '').toLowerCase()) : [];
      const r = await hcall('sh_photo_post', { p_image: up.name, p_description: f.d.value.trim() || null, p_tags: tags });
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
    else {
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
    if (S.screen === 'hub' && S.hub) {
      const prev = JSON.stringify([S.hub.tables, S.hub.upload]);
      await refreshHub();
      if (S.screen !== 'hub' || !S.hub || JSON.stringify([S.hub.tables, S.hub.upload]) === prev) return;
      if (S.view === 'app' && (S.tab === 'feed' || S.tab === 'search' || S.tab === 'profile')) renderHub();
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

  /* ── Start ──────────────────────────────────────────────── */
  document.body.classList.remove('loading');
  if (!A.IN_FRAME) { renderError({ error: 'no_room' }); return; }
  A.hello();
  loadHome();
})();
