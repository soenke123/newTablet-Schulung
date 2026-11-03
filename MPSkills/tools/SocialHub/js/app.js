/* ══════════════════════════════════════════════════════════════
   Social Hub — js/app.js   ·   Die App
   ══════════════════════════════════════════════════════════════
   Bildschirme:
     Start      Schüler: eigenen Hub gründen/öffnen, andere Hubs der
                Klasse. Lehrkraft: Tabellen erstellen, Upload an/aus,
                Übersicht aller Hubs (öffnen, sperren, löschen).
     Login      sieht aus wie eine normale Plattform: Logo, Name,
                Anmelden / Registrieren.
     Hub        unten: Für dich · Suche · ＋ · Profil · Admin
                Feed = Vollbild-Karten zum Wischen, endlos.
     Admin      Hub (Name + Logo) · Nutzer · Datenbank (js/db.js)
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

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const app = $('#app');

  const S = {
    home: null,       // sh_home
    hub: null,        // sh_enter
    session: null,
    tab: 'feed',
    feedMode: 'foryou',
    adminTab: 'hub',
    db: null,
    logoUrls: {},     // hub id → blob-Url eigenes Logo
    color: {}         // hub id → Farbe
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
    trash: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5"/></svg>'
  };

  /* ── Logos ──────────────────────────────────────────────── */
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
  // Akzentfarbe: gewählt (h.color) oder aus dem Logo; Schema hell/dunkel je Hub
  function applyColor(h) {
    const c = (h && (h.color || (h.logo === 'custom' ? S.color[h.id] : LOGOS[h.logo] && LOGOS[h.logo].color))) || '#fe2c55';
    document.documentElement.style.setProperty('--hub', c);
    if (h && h.scheme === 'light') document.documentElement.setAttribute('data-scheme', 'light');
    else document.documentElement.removeAttribute('data-scheme');
  }

  /* ── Bilder in einem Bereich nachladen ─────────────────── */
  const seen = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      seen.unobserve(e.target);
      const el = e.target;
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

  /* ══ Start ═════════════════════════════════════════════════ */
  async function loadHome() {
    const r = await A.call('sh_home', {});
    if (!r || !r.ok) { renderError(r); return; }
    S.home = r;
    S.hub = null;
    document.documentElement.style.removeProperty('--hub');
    document.documentElement.removeAttribute('data-scheme');
    renderHome();
    loadLogos(r.hubs);
  }

  function renderError(r) {
    app.innerHTML = '<div class="center"><div class="card-box"><h2>Social Hub</h2><p>' + esc(A.errText(r)) + '</p>' +
      '<button class="btn btn--accent" id="retry">Nochmal</button></div></div>';
    $('#retry').onclick = () => loadHome();
  }

  function hubTile(h, extra) {
    return '<button type="button" class="hub-tile' + (h.locked ? ' is-locked' : '') + '" data-hub="' + esc(h.id) + '">' +
      logoHtml(h, 'logo--tile') +
      '<span class="hub-t"><b>' + esc(h.name) + (h.teacher_hub ? ' <span class="badge badge--lk">Lehrkraft</span>' : '') + '</b><span>' + (h.owner ? '@' + esc(h.owner) : '') + '</span>' +
      '<small>' + h.users + ' Nutzer · ' + h.photos + ' Fotos</small></span>' + (extra || '') + '</button>';
  }

  function renderHome() {
    const h = S.home;
    const mine = h.mine ? h.hubs.find(x => x.id === h.mine) : null;
    const others = h.hubs.filter(x => x.id !== h.mine);
    let html = '<div class="home"><header class="home-top"><span class="brand">Social<b>Hub</b></span></header>';
    // Eigener Hub – Schüler wie Lehrkraft (Migration 0264)
    if (!mine) {
      html += '<section class="found-cta"><h1>' + (T ? 'Dein eigener Hub' : 'Gründe deine eigene Plattform') + '</h1>' +
        '<p>' + (T ? 'Mit allem, was die Klasse auch hat: zum Ausprobieren, Vorführen und Vergleichen. Die Klasse sieht ihn und kann sich bei dir registrieren.'
                   : 'Gib ihr einen Namen und ein Logo. Du bist dort Admin – die anderen können sich bei dir registrieren.') + '</p>' +
        '<button type="button" class="btn btn--accent btn--big" id="btnFound">Hub gründen</button></section>';
    } else {
      html += '<section class="mine"><h2>Dein Hub</h2>' + hubTile(mine, '<span class="go">Öffnen ›</span>') + '</section>';
    }
    if (T) html += teacherPanel();
    if (!T) {
      html += '<section><h2>Hubs in deiner Klasse</h2>' +
        (others.length ? '<div class="hub-grid">' + others.map(x => hubTile(x)).join('') + '</div>'
                       : '<p class="muted">Noch hat niemand sonst einen Hub gegründet.</p>') + '</section>';
    }
    html += '</div>';
    app.innerHTML = html;
    $$('.hub-tile').forEach(b => b.addEventListener('click', () => openHub(b.dataset.hub)));
    if ($('#btnFound')) $('#btnFound').onclick = renderFound;
    if (T) wireTeacher();
  }

  /* ── Lehrkraft ──────────────────────────────────────────── */
  function teacherPanel() {
    const tabs = S.home.tables;
    const up = S.home.upload;
    let html = '<section class="panel"><h2>Tabellen für alle Hubs</h2>' +
      '<p class="muted">users gibt es immer. Jede weitere Tabelle, die du erstellst, bringt ihre Funktion in alle Hubs dieses Raums.</p>' +
      '<div class="tbl-list"><div class="tbl is-on is-fixed"><code>users</code><span>Konten, Profile, Anmelden</span><em>immer da</em></div>';
    for (const t of TABLES) {
      const isOn = tabs.indexOf(t.id) >= 0;
      const blocked = t.needs && tabs.indexOf(t.needs) < 0;
      html += '<div class="tbl' + (isOn ? ' is-on' : '') + '"><code>' + esc(t.id) + (t.id === 'tags' ? ' + photo_tag' : '') + '</code><span>' + esc(t.what) + '</span>' +
        (isOn ? '<button type="button" class="btn btn--ghost btn--s" data-tdrop="' + t.id + '">Entfernen</button>'
              : '<button type="button" class="btn btn--accent btn--s" data-tadd="' + t.id + '"' + (blocked ? ' disabled title="Erst ' + t.needs + ' erstellen"' : '') + '>Erstellen</button>') +
        '</div>';
    }
    html += '</div><label class="switch"><input type="checkbox" id="upTgl"' + (up ? ' checked' : '') + '><span></span>Eigene Bilder hochladen erlaubt</label>' +
      '<p class="muted small">Entfernen blendet die Funktion und die Tabelle nur aus – die Daten bleiben und kommen beim erneuten Erstellen zurück.</p></section>';
    const hubs = S.home.hubs;
    html += '<section><h2>Alle Hubs (' + hubs.length + ')</h2>' + (hubs.length ? '<div class="hub-grid">' + hubs.map(h =>
      '<div class="hub-card' + (h.locked ? ' is-locked' : '') + '">' +
        '<button type="button" class="hub-tile" data-hub="' + esc(h.id) + '">' + logoHtml(h, 'logo--tile') +
          '<span class="hub-t"><b>' + esc(h.name) + '</b><span>' + esc(h.person || '') + (h.owner ? ' · @' + esc(h.owner) : '') + '</span>' +
          '<small>' + h.users + ' Nutzer · ' + h.photos + ' Fotos · ' + h.likes + ' Likes · ' + h.comments + ' Komm.</small>' +
          '<small>aktiv ' + esc(ago(h.active)) + (h.locked ? ' · <b class="bad">gesperrt</b>' : '') + '</small></span></button>' +
        '<div class="hub-acts"><button type="button" class="btn btn--ghost btn--s" data-lock="' + esc(h.id) + '" data-v="' + (h.locked ? '0' : '1') + '">' + (h.locked ? 'Entsperren' : 'Sperren') + '</button>' +
        '<button type="button" class="btn btn--ghost btn--s btn--bad" data-del="' + esc(h.id) + '">Löschen</button></div>' +
      '</div>').join('') + '</div>' : '<p class="muted">Noch keine Hubs. Sobald die Klasse im Raum ist, gründet jede Person ihren eigenen.</p>') + '</section>';
    return html;
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
    $$('[data-tadd]').forEach(b => b.onclick = () => save(cur().concat(b.dataset.tadd), S.home.upload));
    $$('[data-tdrop]').forEach(b => b.onclick = () => {
      const gone = [b.dataset.tdrop].concat(dependents(b.dataset.tdrop));
      const also = gone.slice(1).filter(t => S.home.tables.indexOf(t) >= 0);
      if (also.length && !confirm('Damit verschwinden auch: ' + also.join(', ') + '. Weiter?')) return;
      save(cur().filter(t => gone.indexOf(t) < 0), S.home.upload);
    });
    $('#upTgl').onchange = (e) => save(cur(), e.target.checked);
    $$('[data-lock]').forEach(b => b.onclick = async (e) => {
      e.stopPropagation();
      const r = await A.call('sh_hub_lock', { p_hub: b.dataset.lock, p_locked: b.dataset.v === '1' });
      if (!r.ok) fail(r); else loadHome();
    });
    $$('[data-del]').forEach(b => b.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Diesen Hub mit allen Konten, Fotos und Likes endgültig löschen?')) return;
      const r = await A.call('sh_hub_delete', { p_hub: b.dataset.del });
      if (!r.ok) fail(r); else loadHome();
    });
  }

  /* ── Hub gründen ────────────────────────────────────────── */
  function logoPicker(sel, allowCustom, customUrl) {
    return '<div class="logo-pick">' + Object.keys(LOGOS).map(id =>
      '<button type="button" class="lp' + (sel === id ? ' on' : '') + '" data-logo-id="' + id + '" title="' + esc(LOGOS[id].name) + '">' +
      '<img src="img/logos/' + id + '.png" alt="' + esc(LOGOS[id].name) + '"></button>').join('') +
      (allowCustom ? '<button type="button" class="lp lp--custom' + (sel === 'custom' ? ' on' : '') + '" data-logo-id="custom" title="Eigenes Logo">' +
        (customUrl ? '<img src="' + esc(customUrl) + '" alt="">' : IC.image + '<small>Eigenes</small>') + '</button>' : '') +
      '</div>';
  }

  function renderFound() {
    let logo = 'rocket';
    app.innerHTML = '<div class="home"><header class="home-top"><button class="icon-btn" id="back">' + IC.back + '</button><span class="brand">Hub gründen</span></header>' +
      '<form class="form" id="fForm" autocomplete="off">' +
      '<label>Name deiner Plattform<input name="name" maxlength="30" required placeholder="z. B. Pixelwelt"></label>' +
      '<div class="lbl">Logo</div>' + logoPicker(logo, false) +
      '<p class="muted small">Ein eigenes Logo kannst du danach im Admin-Bereich hochladen.</p>' +
      '<h3>Dein Konto (Admin)</h3>' +
      '<label>Benutzername<input name="user" maxlength="24" required autocapitalize="off" placeholder="nur a–z, 0–9, . und _"></label>' +
      '<label>Anzeigename<input name="display" maxlength="40" placeholder="optional"></label>' +
      '<label>Passwort<input name="pw" type="password" maxlength="60" required autocomplete="new-password"></label>' +
      '<p class="hint">Nimm ein ausgedachtes Passwort, nicht dein echtes. Damit meldest du dich auch an anderen Geräten an.</p>' +
      '<button class="btn btn--accent btn--big" type="submit">Gründen</button></form></div>';
    $('#back').onclick = () => renderHome();
    $$('.lp').forEach(b => b.onclick = () => { logo = b.dataset.logoId; $$('.lp').forEach(x => x.classList.toggle('on', x === b)); });
    $('#fForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await A.call('sh_found', { p_name: f.name.value.trim(), p_logo: logo, p_username: f.user.value.trim().toLowerCase(),
                                            p_password: f.pw.value, p_display: f.display.value.trim() || null });
      if (!r || !r.ok) { fail(r); return; }
      A.session.set(r.hub, r.session);
      toast('Dein Hub ist online!');
      openHub(r.hub);
    };
  }

  /* ══ Hub betreten ══════════════════════════════════════════ */
  async function openHub(id) {
    const sess = A.session.get(id);
    const r = await A.call('sh_enter', { p_hub: id, p_session: sess });
    if (!r || !r.ok) { fail(r); if (r && (r.error === 'hub_not_found' || r.error === 'hub_locked')) loadHome(); return; }
    S.hub = r;
    S.session = r.session || null;
    A.session.set(id, S.session);
    applyColor(r.hub);
    loadLogos([r.hub]);
    S.tab = 'feed';
    S.feedMode = 'foryou';
    // Lehrkraft schaut ohne Konto zu (Admin), kann sich aber oben anmelden
    if (!r.me && !T) renderLogin('login');
    else renderHub();
  }

  async function refreshHub() {
    if (!S.hub) return;
    const r = await A.call('sh_enter', { p_hub: S.hub.hub.id, p_session: S.session });
    if (r && r.ok) { S.hub = r; S.session = r.session || null; }
    return r;
  }

  // hcall: Aufruf im Hub mit Sitzung
  const hcall = (fn, args) => A.call(fn, Object.assign({ p_hub: S.hub.hub.id, p_session: S.session }, args || {}));

  /* ── Login / Registrieren ───────────────────────────────── */
  function renderLogin(mode) {
    const h = S.hub.hub;
    app.innerHTML = '<div class="login">' +
      '<button class="icon-btn login-back" id="back" title="Alle Hubs">' + IC.back + '</button>' +
      '<div class="login-box">' + logoHtml(h, 'logo--big') + '<h1>' + esc(h.name) + '</h1>' +
      '<div class="seg"><button type="button" data-m="login"' + (mode === 'login' ? ' class="on"' : '') + '>Anmelden</button>' +
      '<button type="button" data-m="reg"' + (mode === 'reg' ? ' class="on"' : '') + '>Registrieren</button></div>' +
      (mode === 'login'
        ? '<form class="form" id="lForm" autocomplete="off"><input name="user" placeholder="Benutzername" autocapitalize="off" required>' +
          '<input name="pw" type="password" placeholder="Passwort" required>' +
          '<button class="btn btn--accent btn--big" type="submit">Anmelden</button>' +
          '<p class="muted small center-t">Passwort vergessen? Ein Admin dieses Hubs kann ein neues setzen.</p></form>'
        : '<form class="form" id="rForm" autocomplete="off"><input name="user" placeholder="Benutzername (a–z, 0–9, . _)" maxlength="24" autocapitalize="off" required>' +
          '<input name="name" placeholder="Name" maxlength="40">' +
          '<input name="email" type="email" placeholder="E-Mail (ausgedacht)" maxlength="100">' +
          '<label class="small">Geburtstag<input name="bday" type="date"></label>' +
          '<input name="city" placeholder="Wohnort" maxlength="60">' +
          '<input name="pw" type="password" placeholder="Passwort" maxlength="60" required autocomplete="new-password">' +
          '<p class="hint">Alles darf ausgedacht sein – und nimm kein echtes Passwort.</p>' +
          '<button class="btn btn--accent btn--big" type="submit">Konto erstellen</button></form>') +
      '</div></div>';
    // Lehrkraft kommt zurück in den Hub (sie ist dort ohnehin Admin)
    $('#back').onclick = () => T ? renderHub() : loadHome();
    $$('.seg button').forEach(b => b.onclick = () => renderLogin(b.dataset.m));
    if ($('#lForm')) $('#lForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await A.call('sh_login', { p_hub: h.id, p_username: f.user.value.trim(), p_password: f.pw.value });
      if (!r || !r.ok) { fail(r); return; }
      A.session.set(h.id, r.session);
      openHub(h.id);
    };
    if ($('#rForm')) $('#rForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await A.call('sh_register', { p_hub: h.id, p_username: f.user.value.trim().toLowerCase(), p_password: f.pw.value,
        p_name: f.name.value.trim() || null, p_email: f.email.value.trim() || null, p_birthday: f.bday.value || null, p_city: f.city.value.trim() || null });
      if (!r || !r.ok) { fail(r); return; }
      A.session.set(h.id, r.session);
      toast('Willkommen!');
      openHub(h.id);
    };
  }

  /* ══ Hub-Ansicht ═══════════════════════════════════════════ */
  function renderHub() {
    const h = S.hub;
    const nav = [['feed', IC.home, 'Start'], ['search', IC.search, 'Suche']];
    if (h.me && on('photos')) nav.push(['post', IC.plus, '']);
    if (h.me) nav.push(['profile', IC.user, 'Profil']);
    if (h.admin) nav.push(['admin', IC.shield, 'Admin']);
    app.innerHTML = '<div class="hub">' +
      '<header class="hub-top"><button class="icon-btn" id="toHome" title="Alle Hubs">' + IC.back + '</button>' +
      logoHtml(h.hub, 'logo--s') + '<b class="hub-name">' + esc(h.hub.name) + '</b>' +
      (h.me ? '<span class="chip">@' + esc(h.me.username) + (T ? ' · Lehrkraft' : '') + '</span>'
            : T ? '<span class="chip">Lehrkraft · Admin</span><button type="button" class="btn btn--accent btn--s" id="lkLogin">Anmelden</button>' : '') + '</header>' +
      '<main class="hub-main" id="main"></main>' +
      '<nav class="hub-nav">' + nav.map(x => '<button type="button" data-tab="' + x[0] + '" class="' + (x[0] === 'post' ? 'nav-post' : '') + (S.tab === x[0] ? ' on' : '') + '">' + x[1] + (x[2] ? '<span>' + x[2] + '</span>' : '') + '</button>').join('') + '</nav>' +
      '</div>';
    $('#toHome').onclick = () => { closeDb(); loadHome(); };
    if ($('#lkLogin')) $('#lkLogin').onclick = () => { closeDb(); renderLogin('login'); };
    $$('.hub-nav button').forEach(b => b.onclick = () => { closeDb(); S.tab = b.dataset.tab; renderHub(); });
    const main = $('#main');
    if (S.tab === 'feed') renderFeedTab(main);
    else if (S.tab === 'search') renderSearch(main);
    else if (S.tab === 'post') renderPost(main);
    else if (S.tab === 'profile') renderProfile(main, h.me && h.me.id, false);
    else if (S.tab === 'admin') renderAdmin(main);
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
      if (!S.hub.me) { toast(T ? 'Zum Mitmachen oben anmelden oder ein Testkonto anlegen.' : 'Melde dich an, um zu liken.'); return; }
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
    if (S.hub.me && uid === S.hub.me.id && S.tab !== 'profile') { closeDb(); S.tab = 'profile'; renderHub(); return; }
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
        (r.me ? '<button type="button" class="btn btn--ghost" id="pEdit">Profil bearbeiten</button><button type="button" class="btn btn--ghost" id="pOut">Abmelden</button>'
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
      // Gründer: ohne Passwort wieder drin wäre verwirrend → zur Hub-Liste
      loadHome();
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
      const r = await hcall('sh_me_update', { p_name: f.name.value.trim() || null, p_bio: f.bio.value.trim() || null, p_avatar: avatar || null, p_city: f.city.value.trim() || null });
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
    if (!on('photos')) { main.innerHTML = '<p class="muted center-t">Die Tabelle photos gibt es noch nicht.</p>'; return; }
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

  /* ── Admin ──────────────────────────────────────────────── */
  function renderAdmin(main) {
    if (!S.hub.admin) { main.innerHTML = '<p class="muted center-t">Nur für Admins.</p>'; return; }
    const tabs = [['hub', 'Hub'], ['users', 'Nutzer'], ['db', 'Datenbank']];
    main.innerHTML = '<div class="adm"><nav class="adm-tabs">' + tabs.map(t => '<button type="button" data-at="' + t[0] + '"' + (S.adminTab === t[0] ? ' class="on"' : '') + '>' + t[1] + '</button>').join('') +
      '</nav><div class="adm-body" id="admBody"></div></div>';
    $$('[data-at]', main).forEach(b => b.onclick = () => { closeDb(); S.adminTab = b.dataset.at; renderAdmin(main); });
    const body = $('#admBody', main);
    if (S.adminTab === 'hub') adminHub(body);
    else if (S.adminTab === 'users') adminUsers(body);
    else {
      body.classList.add('adm-body--db');
      S.db = window.SHDB.create(body, { api: (fn, args) => hcall(fn, args), toast, onChanged: () => refreshHub() });
    }
  }

  function adminHub(body) {
    const h = S.hub.hub;
    let logo = h.logo, custom = null, color = h.color || null, scheme = h.scheme || 'dark';
    // Vorschau sofort, gespeichert erst mit „Speichern“
    const preview = () => applyColor(Object.assign({}, h, { logo, color, scheme }));
    const paint = () => {
      const logoColor = (logo === 'custom' ? (custom ? null : S.color[h.id]) : LOGOS[logo] && LOGOS[logo].color) || '#fe2c55';
      body.innerHTML = '<form class="form adm-form" id="bForm">' +
        '<label>Name der Plattform<input name="name" maxlength="30" value="' + esc(h.name) + '"></label>' +
        '<div class="lbl">Logo</div>' + logoPicker(logo, true, custom ? custom.preview : (h.logo === 'custom' ? S.logoUrls[h.id] : null)) +
        '<input type="file" accept="image/*" id="bFile" hidden>' +
        '<p class="muted small">Eigenes Logo: quadratisch, wird auf 512 px verkleinert.</p>' +
        '<div class="lbl">Farbschema</div>' +
        '<div class="seg seg--s"><button type="button" data-sc="dark"' + (scheme === 'dark' ? ' class="on"' : '') + '>Dunkel</button>' +
        '<button type="button" data-sc="light"' + (scheme === 'light' ? ' class="on"' : '') + '>Hell</button></div>' +
        '<div class="lbl">Akzentfarbe</div>' +
        '<div class="swatches">' +
          '<button type="button" class="sw sw--auto' + (!color ? ' on' : '') + '" data-col="" style="--c:' + esc(logoColor) + '" title="Farbe aus dem Logo"><span>Logo</span></button>' +
          SWATCHES.map(c => '<button type="button" class="sw' + (color === c ? ' on' : '') + '" data-col="' + c + '" style="--c:' + c + '" title="' + c + '"></button>').join('') +
          '<label class="sw sw--pick' + (color && SWATCHES.indexOf(color) < 0 ? ' on' : '') + '" title="Eigene Farbe" style="--c:' + esc(color && SWATCHES.indexOf(color) < 0 ? color : 'transparent') + '">' +
            '<input type="color" id="bColor" value="' + esc(color || logoColor.slice(0, 7)) + '">+</label>' +
        '</div>' +
        '<div class="brand-prev"><span class="bp-btn">Folgen</span><span class="bp-heart">' + IC.heart + '</span><span class="bp-tag">#vorschau</span></div>' +
        '<button class="btn btn--accent btn--big">Speichern</button></form>';
      $$('.lp', body).forEach(b => b.onclick = () => {
        if (b.dataset.logoId === 'custom' && (logo === 'custom' || (!custom && h.logo !== 'custom'))) { $('#bFile', body).click(); return; }
        logo = b.dataset.logoId; paint(); preview();
      });
      $('#bFile', body).onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          custom = await M.compressLogo(f); logo = 'custom';
          S.color[h.id] = await M.mainColor(custom.preview);
          paint(); preview();
        } catch (err) { toast(err.message, true); }
      };
      $$('[data-sc]', body).forEach(b => b.onclick = () => { scheme = b.dataset.sc; paint(); preview(); });
      $$('[data-col]', body).forEach(b => b.onclick = () => { color = b.dataset.col || null; paint(); preview(); });
      $('#bColor', body).oninput = (e) => { color = e.target.value.toLowerCase(); preview(); };
      $('#bColor', body).onchange = () => paint();
      $('#bForm', body).onsubmit = async (e) => {
        e.preventDefault();
        const r = await hcall('sh_brand', { p_name: e.target.name.value.trim(), p_logo: logo, p_logo_img: logo === 'custom' && custom ? custom.data : null,
                                            p_color: color, p_scheme: scheme });
        if (!r || !r.ok) { fail(r); return; }
        if (logo === 'custom' && custom) S.logoUrls[h.id] = custom.preview;
        S.hub.hub = r.hub;
        applyColor(r.hub);
        toast('Gespeichert');
        renderHub();
      };
    };
    paint();
  }

  async function adminUsers(body) {
    body.innerHTML = '<p class="muted">lädt …</p>';
    const r = await hcall('sh_admin_users', {});
    if (!r || !r.ok) { body.innerHTML = '<p class="muted">' + esc(A.errText(r)) + '</p>'; return; }
    body.innerHTML = '<div class="u-list">' + r.items.map(u =>
      '<div class="u-row">' + avatarHtml(u, 'm') +
      '<div class="u-t"><b>@' + esc(u.username) + '</b>' + (u.role === 'admin' ? ' <span class="badge">Admin</span>' : '') +
      '<small>id ' + u.id + ' · ' + u.photos + ' Fotos · seit ' + esc(ago(u.created_at)) + (u.person ? ' · <b>' + esc(u.person) + '</b>' : '') + '</small></div>' +
      '<div class="u-acts"><button type="button" class="btn btn--ghost btn--s" data-ua="' + (u.role === 'admin' ? 'user' : 'admin') + '" data-u="' + u.id + '">' + (u.role === 'admin' ? 'Admin entziehen' : 'Zum Admin') + '</button>' +
      '<button type="button" class="btn btn--ghost btn--s" data-ua="password" data-u="' + u.id + '">Passwort neu</button>' +
      '<button type="button" class="btn btn--ghost btn--s btn--bad" data-ua="delete" data-u="' + u.id + '">Löschen</button></div></div>').join('') + '</div>' +
      (T ? '<p class="muted small">Fett: wer hinter dem Konto steckt (Name im Raum) – das sehen nur Lehrkräfte.</p>' : '');
    hydrate(body);
    $$('[data-ua]', body).forEach(b => b.onclick = async () => {
      const a = b.dataset.ua, uid = +b.dataset.u;
      let val = null;
      if (a === 'password') { val = prompt('Neues Passwort (4–60 Zeichen):'); if (!val) return; }
      if (a === 'delete' && !confirm('Konto mit allen Fotos, Likes und Kommentaren löschen?')) return;
      const rr = await hcall('sh_admin_user', { p_user: uid, p_action: a, p_value: val });
      if (!rr || !rr.ok) { fail(rr); return; }
      toast(a === 'password' ? 'Neues Passwort gesetzt' : 'Erledigt');
      adminUsers(body);
    });
  }

  /* ══ Zustand vom Raum (Lehrkraft hat Tabellen geändert) ═══ */
  let firstState = true;
  A.onState(async () => {
    if (firstState) { firstState = false; return; }
    if (S.hub) {
      const prev = JSON.stringify([S.hub.tables, S.hub.upload]);
      await refreshHub();
      if (S.hub && JSON.stringify([S.hub.tables, S.hub.upload]) !== prev && S.tab !== 'admin') renderHub();
    } else if (S.home) {
      loadHome();
    }
  });

  // Lehrkraft-Übersicht frisch halten
  setInterval(() => { if (T && !S.hub && S.home && document.visibilityState === 'visible') loadHome(); }, 15000);

  /* ── Start ──────────────────────────────────────────────── */
  try {
    const th = window.parent.document.documentElement.getAttribute('data-theme');
    if (th) document.documentElement.setAttribute('data-theme', th);
  } catch (e) { /* egal */ }
  document.body.classList.remove('loading');
  if (!A.IN_FRAME) { renderError({ error: 'no_room' }); return; }
  A.hello();
  loadHome();
})();
