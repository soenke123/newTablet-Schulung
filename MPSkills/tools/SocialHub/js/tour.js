/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/tour.js   ·   Tour für die Lehrkraft
   ══════════════════════════════════════════════════════════════
   Eine kleine Bilderschau mit Bildschirmfotos statt viel Text
   (Sönke 09.11.2026): links alle Überschriften zum Anklicken,
   unten Überspringen · Zurück · Weiter. Öffnet sich beim ersten
   Besuch der Lehrkraft von selbst (localStorage sh.tour.seen),
   danach über das „?“ neben „Arbeitsmaterial“.

   Fotos und die Lage der Knöpfe darin (nummerierte Kreise) baut
   tests/tour-bilder.mjs → img/tour/<name>.webp + img/tour/marken.json.
   Ändert sich die Oberfläche: Skript neu laufen lassen. Neue Station
   = Foto im Skript + Eintrag in STEPS (Marken: [bild, marke, Text]).
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const DIR = 'img/tour/';
  const SEEN = 'sh.tour.seen';

  /* Kapitel = Überschrift links; sub = eingerückt (Adminbereich).
     img: Fotos nebeneinander (gleich hoch); m: [bild, marke, Text] in der Reihenfolge der Nummern. */
  const STEPS = [
    { nav: 'Alle Netzwerke', h: 'Alle Netzwerke auf einen Blick',
      lead: 'Jeder Schüler baut sich ein eigenes Netzwerk – und kommt nur in seins. Du siehst alle.',
      img: ['netze'],
      m: [['netze', 'schueler', 'Ein Netzwerk je Schüler'],
          ['netze', 'eigenes', 'Dein Netzwerk – zum Ausprobieren und Vorführen'],
          ['netze', 'passwort', 'Admin-Passwort vergessen? Hier neu setzen'],
          ['netze', 'sperren', 'Netzwerk sperren']] },
    { nav: 'Klassen-Netz', h: 'Ein Netz für die ganze Klasse',
      lead: 'Zusätzlich gibt es ein gemeinsames Netz. Darin sind nur die Schüler aus diesem Raum.',
      img: ['netze', 'klasse-schueler'],
      m: [['netze', 'klasse', 'Das Klassen-Netz erstellst du hier'],
          ['netze', 'klasseInfo', 'Was es alles kann'],
          ['klasse-schueler', 'klasse', 'Schüler sehen es oben und registrieren sich selbst'],
          ['klasse-schueler', 'eigenes', 'Darunter ihr eigenes Netzwerk']] },
    { nav: 'Tabellen & Beispieldaten', h: 'Datenbank Stück für Stück freischalten',
      lead: 'Jede Tabelle bringt eine Funktion in alle Netzwerke. Mit „Füllen“ kommen Beispieldaten dazu.',
      img: ['tabellen'],
      m: [['tabellen', 'users', 'users gibt es immer'],
          ['tabellen', 'erstellen', 'Erstellen = neue Funktion (z. B. follows → Folgen)'],
          ['tabellen', 'fuellen', 'Füllen = 70 Beispiel-User, Fotos, Likes …'],
          ['tabellen', 'leeren', 'Gefüllt – „Leeren“ nimmt sie wieder raus'],
          ['tabellen', 'schalter', 'Eigene Fotos hochladen · Metadaten speichern']] },
    { nav: 'Arbeitsmaterial', h: 'Arbeitsmaterial',
      lead: 'Skript „Datenbanksysteme“ mit Lösungen – passend zu den Tabellen im Netzwerk.',
      img: ['material'],
      m: [['material', 'skript', 'Skript als Word oder PDF'],
          ['material', 'loesung', 'Lösungsheft – nur für dich'],
          ['material', 'haken', 'Abhaken, was die Klasse schon hatte (gilt für diesen Kurs)'],
          ['material', 'pdf', 'Schüler-PDF: genau diese Teile, mit Deckblatt']] },
    { nav: 'Im sozialen Netzwerk', h: 'Im sozialen Netzwerk',
      lead: 'Sieht aus und fühlt sich an wie Instagram oder TikTok.',
      img: ['feed'],
      m: [['feed', 'views', 'App = wie ein User · Adminbereich = hinter die Kulissen'],
          ['feed', 'tabs', 'Für dich · Folge ich – endlos scrollen'],
          ['feed', 'nav', 'Start · Suche · Posten · Profil']] },
    { nav: 'App', h: 'App: alles wie gewohnt',
      lead: 'Liken, kommentieren, posten – ganz normal. Als Admin kannst du zusätzlich Passwörter zurücksetzen.',
      img: ['app-like', 'app-kommentare', 'app-posten', 'app-passwort'],
      m: [['app-like', 'like', 'Drei Arten Like'],
          ['app-kommentare', 'sheet', 'Kommentieren'],
          ['app-posten', 'posten', 'Posten: Foto oder Kamera'],
          ['app-passwort', 'reset', 'Profil eines Users: Passwort zurücksetzen'],
          ['app-passwort', 'neu', 'Neues Passwort zum Weitergeben']] },
    { nav: 'Adminbereich', group: true },
    { nav: 'SQL', sub: true, h: 'Adminbereich: SQL',
      lead: 'Hinter dem Netzwerk steckt eine echte Datenbank. Was hier geändert wird, ändert sich sofort im Netzwerk.',
      img: ['sql'],
      m: [['sql', 'reiter', 'SQL · Diagramm · Werbung · Einstellungen'],
          ['sql', 'befehl', 'Befehl schreiben'],
          ['sql', 'run', 'Ausführen (Strg + Enter)'],
          ['sql', 'grid', 'Ergebnis – die echten Daten des Netzwerks'],
          ['sql', 'speichern', 'Befehl speichern (nächste Seite)'],
          ['sql', 'fenster', 'Gespeicherte Befehle']] },
    { nav: 'Befehle speichern & teilen', sub: true, h: 'Befehle speichern und teilen',
      lead: 'So sicherst du Ergebnisse: Schüler speichern ihre Befehle mit Aufgabe – und schicken sie dir.',
      img: ['befehl-speichern', 'befehle-geteilt'],
      m: [['befehl-speichern', 'aufgabe', 'Mit Aufgabe, z. B. „Aufgabe 1b“'],
          ['befehle-geteilt', 'reiter', 'Eigene | Geteilt'],
          ['befehle-geteilt', 'karte', 'Kommt bei dir an: „Aufgabe 1b von Mia“'],
          ['befehle-geteilt', 'editor', 'In den Editor holen und vorführen']] },
    { nav: 'Diagramm', sub: true, h: 'Adminbereich: Diagramm',
      lead: 'Alle Tabellen und wie sie zusammenhängen – live aus dem Netzwerk.',
      img: ['diagramm'],
      m: [['diagramm', 'reiter', 'Klassendiagramm der Datenbank']] },
    { nav: 'Einstellungen', sub: true, h: 'Adminbereich: Einstellungen',
      lead: 'Name, Logo und Farben des Netzwerks.',
      img: ['einstellungen'],
      m: [['einstellungen', 'reiter', 'Einstellungen'],
          ['einstellungen', 'vorschau', 'Vorschau am Handy']] },
    { nav: 'Werbung', sub: true, h: 'Adminbereich: Werbung',
      lead: 'Admins schalten Werbung – gezielt per SQL. Damit verdienen Plattformen ihr Geld.',
      img: ['werbung', 'werbung-feed'],
      m: [['werbung', 'zeile', 'Beispiel-Kampagnen, an- und ausschaltbar'],
          ['werbung', 'neu', 'Neue Kampagne: Wem? per SQL'],
          ['werbung', 'every', 'Wie oft im Feed'],
          ['werbung-feed', 'karte', 'So erscheint sie im Feed']] },
    { nav: 'Analytics', sub: true, h: 'Analytics: Was wird gesammelt?',
      lead: 'Sobald du sessions erstellst, schreibt jedes Netzwerk still mit – ohne Banner, wie echte Apps.',
      img: ['analytics-frage', 'analytics-sql'],
      m: [['analytics-frage', 'frage', 'Nur nachgebaut – gespeichert wird der Klick'],
          ['analytics-sql', 'befehl', 'Abfragen wie jede andere Tabelle'],
          ['analytics-sql', 'grid', 'Jeder Besuch: IP, Browser, Gerät … (sessions, views)']] },
    { nav: 'Analytics aufdecken', sub: true, h: 'Analytics: aufdecken',
      lead: 'Am Ende zeigst du allen: „Was weiß das Netzwerk über mich?“',
      img: ['analytics-lk', 'analytics-aufdeckung'],
      m: [['analytics-lk', 'stufen', '„Jetzt zeigen“ öffnet es auf jedem Tablet']] },
    { nav: 'Los geht’s', h: 'Los geht’s!',
      lead: 'Tipp: Erstelle zuerst dein eigenes Netzwerk und probiere alles aus, bevor die Klasse kommt.',
      img: ['netze'],
      m: [['netze', 'eigenes', 'Hier dein Netzwerk erstellen'],
          ['netze', 'material', 'Arbeitsmaterial'],
          ['netze', 'hilfe', 'Diese Tour – jederzeit wieder']] }
  ];
  const SLIDES = STEPS.filter(s => !s.group);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let marken = null, el = null, cur = 0;

  function loadMarken() {
    if (marken) return Promise.resolve(marken);
    return fetch(DIR + 'marken.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({})).then(j => (marken = j || {}));
  }

  function navHtml() {
    let n = 0;
    return STEPS.map(s => {
      if (s.group) return '<div class="tr-grp"><span class="tr-num">' + (++n) + '</span>' + esc(s.nav) + '</div>';
      const i = SLIDES.indexOf(s);
      const num = s.sub ? '' : '<span class="tr-num">' + (++n) + '</span>';
      return '<button type="button" class="tr-nav' + (s.sub ? ' tr-nav--sub' : '') + '" data-go="' + i + '">' + num + '<span>' + esc(s.nav) + '</span></button>';
    }).join('');
  }

  function shotHtml(name, marks) {
    const info = marken[name] || {};
    let h = '<figure class="tr-shot" data-img="' + esc(name) + '">' +
      '<img src="' + DIR + esc(name) + '.webp" alt="" draggable="false">';
    marks.forEach(([key, n]) => {
      const b = (info.m || {})[key];
      if (!b) return;
      h += '<span class="tr-mk' + (b[2] < 4 && b[1] > 12 ? ' tr-mk--t' : b[0] < 6 ? ' tr-mk--r' : '') + '" data-n="' + n + '" style="left:' + b[0] + '%;top:' + b[1] + '%;width:' + b[2] + '%;height:' + b[3] + '%"><b>' + n + '</b></span>';
    });
    return h + '</figure>';
  }

  function render() {
    const s = SLIDES[cur];
    const byImg = {};
    s.m.forEach((x, i) => { (byImg[x[0]] = byImg[x[0]] || []).push([x[1], i + 1]); });
    $('.tr-nav.on')?.classList.remove('on');
    $('[data-go="' + cur + '"]')?.classList.add('on');
    $('[data-go="' + cur + '"]')?.scrollIntoView({ block: 'nearest' });
    $('.tr-main').innerHTML =
      '<header class="tr-h"><h2>' + esc(s.h) + '</h2><p>' + esc(s.lead) + '</p></header>' +
      '<div class="tr-stage' + (s.img.length > 1 ? ' tr-stage--multi' : '') + '"><div class="tr-row">' + s.img.map(n => shotHtml(n, byImg[n] || [])).join('') + '</div></div>' +
      '<ol class="tr-legend">' + s.m.map((x, i) => '<li data-n="' + (i + 1) + '"><b>' + (i + 1) + '</b><span>' + esc(x[2]) + '</span></li>').join('') + '</ol>';
    $('#trCount').textContent = (cur + 1) + ' / ' + SLIDES.length;
    $('#trPrev').disabled = cur === 0;
    const last = cur === SLIDES.length - 1;
    $('#trNext').textContent = last ? 'Fertig' : 'Weiter ›';
    $('#trSkip').hidden = last;
    // Legende ↔ Kreis: antippen oder darüberfahren hebt hervor
    $$('.tr-legend li').forEach(li => {
      const hot = (on) => $$('.tr-mk[data-n="' + li.dataset.n + '"]').forEach(m => m.classList.toggle('hot', on));
      li.onmouseenter = () => hot(true); li.onmouseleave = () => hot(false);
      li.onclick = () => { hot(true); setTimeout(() => hot(false), 1200); };
    });
    $$('.tr-shot img').forEach(img => { img.onload = fit; });
    fit();
  }

  /* Alle Fotos einer Seite im selben Maßstab (Schrift gleich groß), zusammen so groß wie möglich */
  function fit() {
    const stage = $('.tr-stage'), row = $('.tr-row');
    if (!stage || !row) return;
    const shots = $$('.tr-shot', row);
    const gap = 16, gaps = gap * (shots.length - 1), W = stage.clientWidth - 16, H = stage.clientHeight - 16;
    const dim = shots.map(f => marken[f.dataset.img] || { w: 800, h: 500 });
    const sumW = dim.reduce((a, d) => a + d.w, 0), maxH = Math.max(...dim.map(d => d.h));
    let s = Math.min(1.4, (W - gaps) / sumW, H / maxH);
    // schmaler Bildschirm, mehrere Fotos: lieber zur Seite wischen als winzig
    let scroll = shots.length > 1 && s * maxH < Math.min(H, 360) * 0.7;
    if (scroll) s = Math.min(H, 360) / maxH;
    // Handy: breite Fotos nicht winziger als halb – dann zur Seite wischen
    if (W < 600 && s < 0.5) { s = Math.min(0.5, H / maxH); scroll = true; }
    stage.classList.toggle('is-scroll', scroll);
    shots.forEach((f, i) => { f.style.width = (dim[i].w * s) + 'px'; f.style.height = (dim[i].h * s) + 'px'; });
  }

  function go(i) {
    cur = Math.max(0, Math.min(SLIDES.length - 1, i));
    render();
  }

  function close() {
    try { localStorage.setItem(SEEN, '1'); } catch (e) { /* egal */ }
    if (!el) return;
    el.remove(); el = null;
    window.removeEventListener('resize', fit);
    document.removeEventListener('keydown', onKey, true);
  }

  function onKey(e) {
    if (!el) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (cur < SLIDES.length - 1) go(cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
  }

  const $ = (q) => el && el.querySelector(q);
  const $$ = (q, root) => Array.from((root || el).querySelectorAll(q));

  async function open(start) {
    if (el) return;
    await loadMarken();
    el = document.createElement('div');
    el.className = 'tr-back';
    el.innerHTML = '<div class="tr" role="dialog" aria-modal="true" aria-label="Tour durch YourSozialNet">' +
      '<aside class="tr-side"><div class="tr-brand">Tour · <span class="brand">Your<b>Sozial</b>Net</span></div><nav class="tr-navs">' + navHtml() + '</nav></aside>' +
      '<section class="tr-main"></section>' +
      '<footer class="tr-foot"><button type="button" class="btn btn--ghost" id="trSkip">Überspringen</button>' +
        '<span class="tr-count" id="trCount"></span>' +
        '<button type="button" class="btn btn--ghost" id="trPrev">‹ Zurück</button>' +
        '<button type="button" class="btn btn--accent" id="trNext">Weiter ›</button></footer>' +
      '<button type="button" class="icon-btn tr-x" id="trX" title="Schließen" aria-label="Schließen">✕</button></div>';
    document.body.appendChild(el);
    $$('[data-go]').forEach(b => b.onclick = () => go(+b.dataset.go));
    $('#trSkip').onclick = close;
    $('#trX').onclick = close;
    $('#trPrev').onclick = () => go(cur - 1);
    $('#trNext').onclick = () => (cur === SLIDES.length - 1 ? close() : go(cur + 1));
    el.addEventListener('click', e => { if (e.target === el) close(); });
    window.addEventListener('resize', fit);
    document.addEventListener('keydown', onKey, true);
    go(start || 0);
  }

  function auto() {
    let seen = true;
    try { seen = !!localStorage.getItem(SEEN); } catch (e) { /* ohne Speicher lieber nicht aufdrängen */ }
    if (!seen) open();
  }

  window.SHTour = { open, auto, close, STEPS };
})();
