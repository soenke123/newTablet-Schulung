/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/demo.js   ·   Schaufenster (?demo=1)
   ══════════════════════════════════════════════════════════════
   Im Schaufenster der MPSkills-Startseite (preview/socialhub.js) läuft
   die ECHTE App im Rahmen, aber ohne Raum und ohne Server: api.js
   schickt jeden Aufruf hierher (SHApi.call → SHDemo.call).

   Gespielt wird ein Schüler in seinem eigenen Netzwerk „Liky“: er ist
   der Gründer und Admin (@du), im Netzwerk stecken die Beispieldaten
   (dummy/daten.js + dummy/generator.js, Stichtag = gestern). Erstellt
   sind die Tabellen, die eine Stunde typisch hat – ohne sessions/views
   (keine nachgebauten „Zulassen?“-Fenster) und ohne Werbung.

   Likes, Folgen und Kommentare wirken im Arbeitsspeicher und stehen
   sofort auch im Adminbereich (SQL), denn der Schnappschuss kommt aus
   denselben Zeilen. Schreiben per SQL, Posten, Profil und Einstellungen
   sagen freundlich ab: im Schaufenster wird nichts gespeichert. Nichts
   landet in localStorage/sessionStorage (siehe session in api.js).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const HUB = 'demo-liky';
  const ME = 1;
  const TABLES = ['users', 'photos', 'follows', 'likes', 'comments', 'tags', 'photo_tag'];
  const NOPE = { ok: false, message: 'Im Schaufenster wird nichts gespeichert – im Raum geht das.' };

  const pad = n => String(n).padStart(2, '0');
  const stamp = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
                     pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  // Stichtag gestern: sonst lägen Beispiel-Zeiten von heute noch in der Zukunft
  const today = (() => { const d = new Date(Date.now() - 86400e3); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); })();

  // Wie ein bcrypt-Hash aussieht – Klartext steht im Schaufenster nicht in der Tabelle
  function fakeHash(s) {
    const A = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let h = 0x811c9dc5, out = '';
    for (let i = 0; i < 53; i++) {
      h ^= (s.charCodeAt(i % s.length) + i); h = Math.imul(h, 0x01000193) >>> 0;
      out += A[h % 64];
    }
    return '$2a$08$' + out;
  }

  /* ── Daten ─────────────────────────────────────────────── */
  let D = null;    // Tabelle → { cols, rows: [Objekt] }
  function data() {
    if (D) return D;
    D = {};
    let raw = {};
    try { raw = window.SHDummy.build({ stichtag: today, netz: 'Liky', firstId: ME + 1 }); } catch (e) { raw = {}; }
    for (const t of TABLES) {
      const src = raw[t] || { cols: [], rows: [] };
      D[t] = { cols: src.cols.slice(), rows: src.rows.map(r => Object.fromEntries(src.cols.map((c, i) => [c, r[i]]))) };
    }
    if (!D.users.cols.length) D.users.cols = ['id', 'username', 'name', 'email', 'password', 'gender', 'bio', 'avatar', 'birthday', 'city', 'country', 'centimeter', 'role', 'created_at'];
    D.users.rows.forEach(u => { u.password = fakeHash(u.username + ':' + u.password); });
    D.users.rows.unshift({ id: ME, username: 'du', name: 'Du', email: 'du@liky.test', password: fakeHash('du'),
      gender: null, bio: 'Hier ist mein Netzwerk.', avatar: null, birthday: null, city: null, country: null,
      centimeter: null, role: 'admin', created_at: stamp(new Date(Date.now() - 3600e3)) });
    // @du folgt ein paar Leuten – damit „Folge ich“ nicht leer ist
    const follow = D.users.rows.slice(1, 7).map(u => u.id);
    follow.forEach(id => D.follows.rows.push({ follower_id: ME, following_id: id, created_at: stamp(new Date()) }));
    return D;
  }
  const rows = t => data()[t].rows;
  const user = id => rows('users').find(u => u.id === id) || null;
  const photo = id => rows('photos').find(p => p.id === id) || null;

  function hubJson() {
    return { id: HUB, name: 'Liky', logo: 'like', locked: false, color: '#7c3aed', scheme: null,
             teacher_hub: false, class: false, app_key: null, owner: 'du',
             users: rows('users').length, photos: rows('photos').length };
  }

  function tagsOf(pid) {
    const ids = rows('photo_tag').filter(x => x.photo_id === pid).map(x => x.tag_id);
    return rows('tags').filter(t => ids.indexOf(t.id) >= 0).map(t => t.name).sort();
  }
  function kindsOf(pid) {
    const k = { heart: 0, thumb: 0, laugh: 0 };
    rows('likes').forEach(l => { if (l.photo_id === pid && k[l.kind] != null) k[l.kind]++; });
    return k;
  }
  const myLike = pid => rows('likes').find(l => l.photo_id === pid && l.user_id === ME) || null;
  const iFollow = uid => rows('follows').some(f => f.follower_id === ME && f.following_id === uid);

  function photoJson(p) {
    const u = user(p.user_id) || { id: p.user_id, username: '?', name: null, avatar: null };
    const k = kindsOf(p.id);
    const mine = myLike(p.id);
    return {
      id: p.id, image: p.image, description: p.description, created_at: p.created_at,
      taken_at: p.taken_at, camera: p.camera,
      user: { id: u.id, username: u.username, name: u.name, avatar: u.avatar },
      likes: k.heart + k.thumb + k.laugh, liked: !!mine, kinds: k, my_kind: mine ? mine.kind : null,
      comments: rows('comments').filter(c => c.photo_id === p.id).length,
      tags: tagsOf(p.id), following: iFollow(u.id), mine: u.id === ME
    };
  }

  // Zufall je Runde wie sh_feed (hashtext ~ FNV)
  function rnd(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0) % 1000; }

  function feed(a) {
    const mode = a.p_mode || 'foryou';
    const uid = /^[0-9]{1,9}$/.test(String(a.p_arg || '')) ? +a.p_arg : null;
    let list = rows('photos').slice();
    if (mode === 'following') list = list.filter(p => p.user_id === ME || iFollow(p.user_id));
    else if (mode === 'tag') { const t = String(a.p_arg || '').toLowerCase(); list = list.filter(p => tagsOf(p.id).some(x => x.toLowerCase() === t)); }
    else if (mode === 'user') list = list.filter(p => p.user_id === uid);
    const now = Date.now();
    const score = p => mode !== 'foryou' ? 0 :
      Math.log(1 + rows('likes').filter(l => l.photo_id === p.id).length)
      - (now - Date.parse(String(p.created_at).replace(' ', 'T'))) / 172800e3 / 30
      + rnd(p.id + ':' + (a.p_seed || 0)) / 350;
    const sc = new Map(list.map(p => [p.id, score(p)]));
    list.sort((x, y) => (sc.get(y.id) - sc.get(x.id)) || String(y.created_at).localeCompare(String(x.created_at)) || y.id - x.id);
    const off = Math.max(0, a.p_offset | 0), lim = Math.min(Math.max(a.p_limit | 0 || 8, 1), 20);
    return { ok: true, total: list.length, ad: null, items: list.slice(off, off + lim).map(photoJson) };
  }

  function like(a) {
    const pid = a.p_photo | 0;
    if (!photo(pid)) return { ok: false, error: 'not_found' };
    const kind = ['heart', 'thumb', 'laugh'].indexOf(a.p_kind) >= 0 ? a.p_kind : 'heart';
    const L = rows('likes');
    const i = L.findIndex(l => l.photo_id === pid && l.user_id === ME);
    if (a.p_on === false) { if (i >= 0) L.splice(i, 1); }
    else if (i >= 0) L[i].kind = kind;
    else L.push({ user_id: ME, photo_id: pid, kind, created_at: stamp(new Date()) });
    const k = kindsOf(pid), m = myLike(pid);
    return { ok: true, likes: k.heart + k.thumb + k.laugh, kinds: k, my_kind: m ? m.kind : null };
  }

  function follow(a) {
    const uid = a.p_user | 0;
    if (!user(uid) || uid === ME) return { ok: false, error: 'invalid_input' };
    const F = rows('follows');
    const i = F.findIndex(f => f.follower_id === ME && f.following_id === uid);
    if (a.p_on === false) { if (i >= 0) F.splice(i, 1); }
    else if (i < 0) F.push({ follower_id: ME, following_id: uid, created_at: stamp(new Date()) });
    return { ok: true, followers: F.filter(f => f.following_id === uid).length };
  }

  function comments(a) {
    const pid = a.p_photo | 0;
    return { ok: true, items: rows('comments').filter(c => c.photo_id === pid)
      .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)) || x.id - y.id)
      .map(c => { const u = user(c.user_id) || {}; return { id: c.id, body: c.body, created_at: c.created_at,
        user: { id: u.id, username: u.username, avatar: u.avatar }, mine: c.user_id === ME }; }) };
  }
  function commentAdd(a) {
    const b = String(a.p_body || '').trim();
    if (!b || b.length > 300) return { ok: false, error: 'invalid_input' };
    if (!photo(a.p_photo | 0)) return { ok: false, error: 'not_found' };
    const C = rows('comments');
    const id = C.reduce((m, c) => Math.max(m, c.id), 0) + 1;
    C.push({ id, user_id: ME, photo_id: a.p_photo | 0, body: b, created_at: stamp(new Date()) });
    return { ok: true, id };
  }
  function commentDelete(a) {
    const C = rows('comments');
    const i = C.findIndex(c => c.id === (a.p_comment | 0) && c.user_id === ME);
    if (i < 0) return { ok: false, error: 'not_found' };
    C.splice(i, 1);
    return { ok: true };
  }

  function profile(a) {
    const u = user(a.p_user | 0);
    if (!u) return { ok: false, error: 'not_found' };
    const mine = rows('photos').filter(p => p.user_id === u.id)
      .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)) || y.id - x.id);
    const ids = new Set(mine.map(p => p.id));
    return { ok: true,
      user: { id: u.id, username: u.username, name: u.name, bio: u.bio, avatar: u.avatar, city: u.city, country: u.country,
              centimeter: u.centimeter, gender: u.gender, role: u.role, created_at: u.created_at },
      me: u.id === ME,
      photos_n: mine.length,
      followers: rows('follows').filter(f => f.following_id === u.id).length,
      following: rows('follows').filter(f => f.follower_id === u.id).length,
      i_follow: iFollow(u.id),
      likes: rows('likes').filter(l => ids.has(l.photo_id)).length,
      photos: mine.map(p => ({ id: p.id, image: p.image })) };
  }

  function search(a) {
    const q = String(a.p_q || '').trim().toLowerCase();
    const has = s => String(s || '').toLowerCase().indexOf(q) >= 0;
    const users = rows('users').filter(u => has(u.username) || has(u.name))
      .sort((x, y) => x.username.localeCompare(y.username)).slice(0, 30)
      .map(u => ({ id: u.id, username: u.username, name: u.name, avatar: u.avatar }));
    const tags = rows('tags').filter(t => has(t.name))
      .map(t => ({ name: t.name, n: rows('photo_tag').filter(x => x.tag_id === t.id).length }))
      .sort((x, y) => y.n - x.n || x.name.localeCompare(y.name)).slice(0, 30);
    return { ok: true, users, tags };
  }

  function snapshot() {
    const out = {};
    for (const t of TABLES) {
      const T = data()[t];
      out[t] = { cols: T.cols.slice(), rows: T.rows.map(r => T.cols.map(c => r[c] === undefined ? null : r[c])) };
    }
    return { ok: true, tables: out };
  }

  function me() {
    const u = user(ME);
    return { id: u.id, username: u.username, name: u.name, avatar: u.avatar, bio: u.bio, city: u.city, gender: u.gender, role: u.role };
  }

  const FN = {
    sh_home: () => ({ ok: true, teacher: false, tables: TABLES.slice(), upload: false, mine: HUB, class: null, hubs: [hubJson()] }),
    sh_enter: () => ({ ok: true, hub: hubJson(), session: 'demo', me: me(), admin: true, founder: true, teacher: false,
                       needs_admin: false, tables: TABLES.slice(), upload: false, ads_sql: null }),
    sh_feed: feed,
    sh_like: like,
    sh_follow: follow,
    sh_comments: comments,
    sh_comment_add: commentAdd,
    sh_comment_delete: commentDelete,
    sh_profile: profile,
    sh_search: search,
    sh_db_snapshot: snapshot,
    sh_media_get: () => ({ ok: true, items: {} }),
    sh_logo_get: () => ({ ok: false, error: 'not_found' }),
    sh_ad_pick: () => ({ ok: true, ad: null }),
    sh_cmd_list: () => ({ ok: true, teacher: false, own: [], inbox: [] }),
    sh_logout: () => ({ ok: true }),
    sh_track: () => ({ ok: true })
  };

  window.SHDemo = {
    call(fn, args) {
      const f = FN[fn];
      let r;
      try { r = f ? f(args || {}) : NOPE; } catch (e) { r = { ok: false, error: 'network' }; }
      // wie über das Netz: nie synchron und nie dasselbe Objekt zweimal
      return new Promise(res => setTimeout(() => res(JSON.parse(JSON.stringify(r))), 60));
    }
  };
})();
