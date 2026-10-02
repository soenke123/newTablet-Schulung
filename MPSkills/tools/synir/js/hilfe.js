/* ══════════════════════════════════════════════════════════════
   SYNIR — hilfe.js  ·  Die Hilfe für Lehrkräfte
   ══════════════════════════════════════════════════════════════
   Eine Anleitung, die neben dem Netz liegt — über der rechten
   Hälfte des Bildschirms —, mit Suchfeld, kleinem Inhalts-
   verzeichnis und Bildern der echten Oberfläche (hilfe/*.webp,
   gemacht von tests/hilfe-bilder.js). Der Text steht in
   js/hilfe-inhalt.js.

   ── Der Kniff: Zeigen statt Suchen ────────────────────────────
   Solange die Hilfe offen ist, bleibt SYNIR bedienbar — und JEDER
   Klick auf ein Ding der Oberfläche schlägt zugleich seinen
   Abschnitt auf: ein Router auf der Fläche, der Reiter „Firewall"
   im Kärtchen, das Terminal auf einem Bildschirm, der Mitschnitt.
   `zielVon(el)` übersetzt ein angeklicktes Element in die ID eines
   Abschnitts. Umgekehrt umrandet der Knopf „Zeigen" in einem
   Abschnitt das Ding auf dem Bildschirm.

   Die Klicks werden im EINFANGEN gelesen (capture) und nie
   angehalten: die Hilfe hört zu, sie greift nicht ein. Verglichen
   wird Druck und Loslassen (pointerdown/-up) statt `click`, weil
   die Fläche Geräte beim Antippen neu zeichnet — das Element, das
   den Druck bekam, gibt es beim `click` oft schon nicht mehr.

   ── Wer sie sieht ─────────────────────────────────────────────
   Lehrkraft im Raum (body[data-rolle=presenter]) und wer SYNIR für
   sich öffnet (solo). Auf den Tablets der Klasse gibt es den Knopf
   nicht (css/hilfe.css).

   Damit die Fläche nicht unter der Hilfe verschwindet, rückt die
   Arbeitsfläche zur Seite (body.hilfe-offen): Fenster, die rechts
   aufgehen (Gerätebildschirm, großes Kärtchen), bleiben sichtbar.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const BILD = (n) => 'hilfe/' + n + '.webp';
  const SCHMAL = 900;
  const BILD_H = 460;   // so hoch steht ein Bild höchstens in der Hilfe   // darunter liegt die Hilfe über allem (kein Platz für zwei Hälften)

  let inhalt = [];
  let abschnitte = new Map();       // id → { a, k, nr, el }
  let panel = null, textBox = null, tocBox = null, sucheEl = null, trefferEl = null, ergebnisBox = null;
  let chip = null, lupe = null;
  let offen = false;
  let aktiv = '';                   // Abschnitt, der gerade oben steht
  let druck = null;                 // { x, y, el } beim pointerdown

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Für die Suche: klein, ohne Umlaute und ohne Satzzeichen. */
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9./ ]+/g, ' ');
  }
  const ohneTags = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();

  /* ═══ Bauen ═══════════════════════════════════════════════════ */

  /* Breite und Höhe aus hilfe/masse.js: der Platz steht fest, bevor
     das Bild geladen ist — sonst verrutscht ein Sprung. */
  function masse(n) {
    const m = (window.SynirHilfeMasse || {})[n];
    if (!m) return '';
    /* Die Bilder sind doppelt aufgelöst (scharf auf dem Beamer): halbe
       Pixel = CSS-Größe, höchstens BILD_H hoch. Breite und Seiten-
       verhältnis stehen am Bild selbst — so ist die Höhe dieselbe,
       ob es schon geladen ist oder nicht. */
    const w = Math.round(Math.min(m[0] / 2, BILD_H * m[0] / m[1]));
    return ' width="' + Math.round(m[0] / 2) + '" height="' + Math.round(m[1] / 2) + '"'
      + ' style="width:' + w + 'px;aspect-ratio:' + m[0] + '/' + m[1] + '"';
  }

  function abschnittHTML(a, nr) {
    let h = '<section class="hi-ab" id="hi-' + a.id + '" data-ab="' + a.id + '">'
      + '<h3 class="hi-ab-t"><span class="hi-nr">' + nr + '</span>' + esc(a.titel)
      + (a.zeigen && a.zeigen.length ? '<button type="button" class="hi-zeig" data-zeig="' + a.id + '" '
        + 'title="Auf dem Bildschirm zeigen, wo das ist">◎ Zeigen</button>' : '')
      + '</h3>';
    if (a.kurz) h += '<p class="hi-kurz">' + a.kurz + '</p>';
    if (a.html) h += a.html;
    const bild = (n, u) => n
      ? '<figure class="hi-fig"><button type="button" class="hi-fig-b" data-gross="' + n + '" title="Vergrößern">'
        + '<img src="' + BILD(n) + '" alt="' + esc(u || '') + '"' + masse(n) + ' loading="lazy" decoding="async"></button>'
        + (u ? '<figcaption>' + esc(u) + '</figcaption>' : '') + '</figure>'
      : '';
    if (a.bild || a.bild2) {
      h += '<div class="hi-bilder' + (a.bild && a.bild2 ? ' hi-bilder--2' : '') + '">'
        + bild(a.bild, a.unter) + bild(a.bild2, a.unter2) + '</div>';
    }
    if (a.schritte) {
      h += '<h4 class="hi-zw">So geht’s</h4><ol class="hi-ol">'
        + a.schritte.map(s => '<li>' + s + '</li>').join('') + '</ol>';
    }
    if (a.tabelle) {
      h += '<div class="hi-tab-w"><table class="hi-tab"><thead><tr>'
        + a.tabelle.kopf.map(k => '<th>' + k + '</th>').join('') + '</tr></thead><tbody>'
        + a.tabelle.zeilen.map(z => '<tr>' + z.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div>';
    }
    if (a.wissen) {
      h += '<h4 class="hi-zw">Gut zu wissen</h4><ul class="hi-ul">'
        + a.wissen.map(s => '<li>' + s + '</li>').join('') + '</ul>';
    }
    if (a.tipp) h += '<div class="hi-tipp"><b>Im Unterricht</b>' + a.tipp + '</div>';
    return h + '</section>';
  }

  function baue() {
    inhalt = window.SynirHilfeInhalt || [];
    panel = document.createElement('aside');
    panel.className = 'hilfe';
    panel.id = 'hilfe';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Hilfe für Lehrkräfte');

    let toc = '', text = '';
    inhalt.forEach((k, ki) => {
      const kn = ki + 1;
      toc += '<li class="hi-toc-k" data-kap="' + k.id + '">'
        + '<button type="button" class="hi-toc-kb" data-geh="' + k.abschnitte[0].id + '" title="' + esc(kn + ' · ' + k.titel) + '">'
        + '<span class="hi-nr">' + kn + '</span><span class="hi-toc-kt">' + esc(k.titel) + '</span></button><ol>';
      text += '<div class="hi-kap" id="hi-kap-' + k.id + '"><h2 class="hi-kap-t"><span class="hi-nr">' + kn + '</span>'
        + esc(k.titel) + '</h2>';
      k.abschnitte.forEach((a, ai) => {
        const nr = kn + '.' + (ai + 1);
        abschnitte.set(a.id, { a, k, nr, such: norm(a.titel + ' ' + ohneTags(a.kurz) + ' ' + (a.such || '') + ' '
          + ohneTags((a.schritte || []).join(' ') + ' ' + (a.wissen || []).join(' ') + ' ' + (a.tipp || '') + ' '
          + (a.tabelle ? a.tabelle.zeilen.map(z => z.join(' ')).join(' ') : ''))),
          titelN: norm(a.titel + ' ' + (a.such || '')) });
        toc += '<li><button type="button" class="hi-toc-a" data-geh="' + a.id + '">' + esc(a.titel) + '</button></li>';
        text += abschnittHTML(a, nr);
      });
      toc += '</ol></li>';
      text += '</div>';
    });

    panel.innerHTML =
      '<div class="hi-kopf">'
      +   '<span class="hi-tag">Hilfe</span>'
      +   '<strong class="hi-titel">Anleitung für Lehrkräfte</strong>'
      +   '<button type="button" class="hi-toc-auf" aria-expanded="false" title="Inhaltsverzeichnis">☰ Inhalt</button>'
      +   '<button type="button" class="hi-breit" title="Ganze Breite / halbe Breite (Doppelklick auf den Rand: zurück)" aria-label="Breite umschalten">⤢</button>'
      +   '<button type="button" class="hi-x" title="Hilfe schließen (F1)" aria-label="Hilfe schließen">×</button>'
      + '</div>'
      + '<div class="hi-such">'
      +   '<span class="hi-such-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.3 15.3 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>'
      +   '<input type="search" class="hi-such-in" placeholder="Suchen … z. B. DHCP, Ping, Firewall" spellcheck="false" autocomplete="off" aria-label="Hilfe durchsuchen">'
      +   '<span class="hi-treffer" aria-live="polite"></span>'
      + '</div>'
      + '<p class="hi-hinweis"><b>Tipp:</b> Klicken Sie links auf ein Gerät, Fenster oder einen Knopf — die Anleitung springt zur passenden Stelle.</p>'
      + '<div class="hi-rumpf">'
      +   '<nav class="hi-toc" aria-label="Inhaltsverzeichnis">'
      +     '<div class="hi-toc-kopf"><span>Inhalt</span>'
      +     '<button type="button" class="hi-toc-klapp" title="Verzeichnis schmal machen" aria-label="Verzeichnis schmal machen">‹</button></div>'
      +     '<ol>' + toc + '</ol></nav>'
      +   '<div class="hi-toc-griff" role="separator" aria-orientation="vertical" tabindex="0" '
      +     'title="Ziehen: Verzeichnis breiter oder schmaler (Doppelklick: zurück)"></div>'
      +   '<div class="hi-text" tabindex="-1">'
      +     '<div class="hi-ergebnisse" hidden></div>'
      +     '<div class="hi-alles">' + text
      +       '<p class="hi-ende">SYNIR · Anleitung für Lehrkräfte · Bilder zeigen die echte Oberfläche.</p></div>'
      +   '</div>'
      + '</div>'
      + '<div class="hi-griff" role="separator" aria-orientation="vertical" tabindex="0" '
      +   'aria-label="Breite der Hilfe" title="Ziehen: Hilfe breiter oder schmaler — bis ganz links (Doppelklick: zurück)"><i></i></div>'
      + '<div class="hi-lupe" hidden><img alt=""><span class="hi-lupe-t"></span></div>';

    document.body.appendChild(panel);
    textBox = $('.hi-text', panel);
    tocBox = $('.hi-toc', panel);
    sucheEl = $('.hi-such-in', panel);
    trefferEl = $('.hi-treffer', panel);
    ergebnisBox = $('.hi-ergebnisse', panel);
    lupe = $('.hi-lupe', panel);
    for (const [id, e] of abschnitte) e.el = $('#hi-' + id, panel);

    chip = document.createElement('div');
    chip.className = 'hi-chip';
    chip.hidden = true;
    document.body.appendChild(chip);

    panel.addEventListener('click', klickImPanel);
    griffeBinden();
    breiteSetzen(gemerkt('breite'), true);
    tocSetzen(gemerkt('toc'), true);
    sucheEl.addEventListener('input', () => suchen(sucheEl.value));
    sucheEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        const erst = $('.hi-erg', ergebnisBox);
        if (erst) { ev.preventDefault(); springe(erst.dataset.geh); }
      } else if (ev.key === 'ArrowDown') {
        const erst = $('.hi-erg', ergebnisBox);
        if (erst) { ev.preventDefault(); erst.focus(); }
      } else if (ev.key === 'Escape' && sucheEl.value) {
        ev.stopPropagation(); ev.preventDefault();
        sucheEl.value = ''; suchen('');
      }
    });
    panel.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        if (!lupe.hidden) { lupe.hidden = true; return; }
        schliessen();
      }
      // In der Ergebnisliste mit den Pfeilen wandern.
      if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && ev.target.classList.contains('hi-erg')) {
        ev.preventDefault();
        const n = ev.key === 'ArrowDown' ? ev.target.nextElementSibling : ev.target.previousElementSibling;
        if (n && n.classList.contains('hi-erg')) n.focus(); else if (ev.key === 'ArrowUp') sucheEl.focus();
      }
    });
    // Tasten im Panel gehören dem Panel — nicht Strg+Z & Co. im Netz.
    panel.addEventListener('keydown', (ev) => { if (ev.key !== 'F1') ev.stopPropagation(); });

    /* Welcher Abschnitt steht gerade oben? Das Inhaltsverzeichnis
       folgt dem Lesen, damit man weiß, wo man ist. Gezählt wird der
       letzte Abschnitt, dessen Anfang die obere Kante erreicht hat —
       genau der, zu dem ein Sprung gerade gescrollt hat. */
    let raf = 0;
    textBox.addEventListener('scroll', () => {
      if (raf || Date.now() < spyRuhe) return;
      raf = requestAnimationFrame(() => { raf = 0; spy(); });
    }, { passive: true });
  }

  /* Während ein Sprung noch gleitet, schweigt das Mitlesen — sonst
     markierte es unterwegs die Abschnitte, über die er hinweggleitet. */
  let spyRuhe = 0;
  function spy() {
    if (!ergebnisBox || !ergebnisBox.hidden) return;
    const kante = textBox.getBoundingClientRect().top + 48;
    let id = null;
    for (const [k, e] of abschnitte) {
      if (e.el.getBoundingClientRect().top <= kante) id = k; else break;
    }
    if (id) markiere(id);
  }

  /* ═══ Öffnen und schließen ════════════════════════════════════ */

  function kopfHoehe() {
    const top = $('.top');
    const h = top ? top.getBoundingClientRect().bottom : 0;
    document.documentElement.style.setProperty('--hi-top', Math.round(h) + 'px');
  }

  function oeffnen(ziel) {
    if (!panel) baue();
    kopfHoehe();
    offen = true;
    panel.hidden = false;
    document.body.classList.add('hilfe-offen');
    platzSync();
    knopfSync();
    nachLayout();
    if (ziel) springe(ziel);
    else if (!aktiv) markiere(inhalt[0] && inhalt[0].abschnitte[0].id);
    setTimeout(() => { if (offen && !ziel && window.innerWidth >= SCHMAL) sucheEl.focus({ preventScroll: true }); }, 60);
  }

  function schliessen() {
    if (!panel || !offen) return;
    offen = false;
    panel.hidden = true;
    chip.hidden = true;
    document.body.classList.remove('hilfe-offen', 'hilfe-schmal', 'hilfe-voll');
    ringeWeg();
    knopfSync();
    nachLayout();
    const b = $('#hilfeBtn');
    if (b && panel.contains(document.activeElement)) b.focus();
  }

  const umschalten = () => (offen ? schliessen() : oeffnen());

  function knopfSync() {
    const b = $('#hilfeBtn');
    if (!b) return;
    b.setAttribute('aria-expanded', String(offen));
    b.classList.toggle('is-on', offen);
  }

  /* Die Arbeitsfläche hat sich verbreitert oder verschmälert: die
     Fläche passt ihren Ausschnitt an, Fenster rücken in ihren
     Rahmen. Beides hängt am resize-Ereignis. */
  function nachLayout() {
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
  }

  /* ═══ Breite: am linken Rand ziehen ══════════════════════════
     Von schmal am Rand bis zur ganzen Seite. Bleibt für die Arbeits-
     fläche zu wenig übrig (MIN_REST), rückt sie nicht mehr zur Seite —
     die Hilfe liegt dann darüber wie eine ganze Seite (hilfe-voll).
     Gemerkt wird der Anteil an der Fensterbreite, nicht die Pixel:
     dieselbe Hilfe soll am Beamer und am Tablet gleich „halb" sein. */

  const MIN_B = 300, MIN_REST = 380, EINRASTEN = 48;
  const TOC_SCHMAL = 54, TOC_MIN = 140, TOC_MAX = 0.6;
  let breite = null;          // px, null = Vorgabe (CSS: halbe Breite)
  let tocBreite = null;       // px, null = Vorgabe; TOC_SCHMAL = nur Nummern

  function gemerkt(k) {
    try { const v = parseFloat(localStorage.getItem('synir.hilfe.' + k)); return isFinite(v) ? v : null; }
    catch (e) { return null; }
  }
  function merken(k, v) {
    try { if (v == null) localStorage.removeItem('synir.hilfe.' + k); else localStorage.setItem('synir.hilfe.' + k, String(v)); }
    catch (e) { /* privat: dann eben nicht */ }
  }

  /* `w` in Pixeln — oder beim Laden (`still`) der gemerkte Anteil. */
  function breiteSetzen(w, still) {
    const vw = window.innerWidth;
    if (w != null && still && w <= 1) w = w * vw;
    if (w != null) {
      w = Math.max(Math.min(MIN_B, vw), Math.min(vw, w));
      if (vw - w < EINRASTEN) w = vw;
    }
    breite = w;
    const root = document.documentElement.style;
    if (w == null) root.removeProperty('--hi-w'); else root.setProperty('--hi-w', Math.round(w) + 'px');
    if (!still) merken('breite', w == null ? null : +(w / vw).toFixed(4));
    platzSync();
  }
  const panelBreite = () => (panel ? panel.getBoundingClientRect().width : 0);
  const istVoll = () => panel && panelBreite() >= window.innerWidth - 1;

  function platzSync() {
    if (!offen) return;
    const vw = window.innerWidth;
    document.body.classList.toggle('hilfe-schmal', vw < SCHMAL);
    const rest = vw - panelBreite();
    document.body.classList.toggle('hilfe-voll', vw >= SCHMAL && rest < MIN_REST);
    const b = $('.hi-breit', panel);
    if (b) b.textContent = istVoll() ? '⤡' : '⤢';
  }

  function tocSetzen(w, still) {
    tocBreite = w;
    const schmal = w != null && w <= TOC_SCHMAL;
    panel.classList.toggle('hi-toc-schmal', schmal);
    if (w == null) panel.style.removeProperty('--hi-toc-w');
    else panel.style.setProperty('--hi-toc-w', Math.round(schmal ? TOC_SCHMAL : w) + 'px');
    const k = $('.hi-toc-klapp', panel);
    if (k) {
      k.textContent = schmal ? '›' : '‹';
      k.title = schmal ? 'Verzeichnis breit machen' : 'Verzeichnis schmal machen';
      k.setAttribute('aria-label', k.title);
    }
    if (!still) merken('toc', w);
  }
  const istTocSchmal = () => panel.classList.contains('hi-toc-schmal');

  /* Ein Griff, zwei Verwendungen: `beiZug(x)` bekommt die Zeigerposition. */
  /* Doppeltipp erkennt der Griff selbst: `dblclick` kommt nach einem
     abgefangenen pointerdown nicht zuverlässig, und auf dem Tablet gar nicht. */
  function ziehbar(el, beiZug, zurueck, fertig) {
    let letzt = 0;
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      if (ev.timeStamp - letzt < 380) { letzt = 0; zurueck(); return; }
      letzt = ev.timeStamp;
      el.setPointerCapture(ev.pointerId);
      document.body.classList.add('hilfe-ziehen');
      const zug = (e) => beiZug(e.clientX);
      const los = () => {
        el.removeEventListener('pointermove', zug);
        el.removeEventListener('pointerup', los);
        el.removeEventListener('pointercancel', los);
        document.body.classList.remove('hilfe-ziehen');
        fertig();
      };
      el.addEventListener('pointermove', zug);
      el.addEventListener('pointerup', los);
      el.addEventListener('pointercancel', los);
    });
  }

  function griffeBinden() {
    const g = $('.hi-griff', panel);
    ziehbar(g, (x) => breiteSetzen(window.innerWidth - x, true),
      () => { breiteSetzen(null); nachLayout(); },
      () => { breiteSetzen(breite); nachLayout(); });
    g.addEventListener('keydown', (ev) => {
      const d = ev.key === 'ArrowLeft' ? 40 : ev.key === 'ArrowRight' ? -40 : 0;
      if (!d) return;
      ev.preventDefault();
      breiteSetzen(panelBreite() + d);
      nachLayout();
    });

    const t = $('.hi-toc-griff', panel);
    const tocAus = (x) => {
      const links = $('.hi-rumpf', panel).getBoundingClientRect().left;
      let w = x - links;
      const max = panelBreite() * TOC_MAX;
      // Unter der Mindestbreite rastet es auf „nur Nummern" ein.
      w = w < TOC_MIN * 0.75 ? TOC_SCHMAL : Math.max(TOC_MIN, Math.min(max, w));
      tocSetzen(w, true);
    };
    ziehbar(t, tocAus, () => tocSetzen(null), () => tocSetzen(tocBreite));
    t.addEventListener('keydown', (ev) => {
      const d = ev.key === 'ArrowLeft' ? -30 : ev.key === 'ArrowRight' ? 30 : 0;
      if (!d) return;
      ev.preventDefault();
      const ist = $('.hi-toc', panel).getBoundingClientRect().width;
      tocAus($('.hi-rumpf', panel).getBoundingClientRect().left + ist + d);
      tocSetzen(tocBreite);
    });
  }

  /* ═══ Springen ════════════════════════════════════════════════ */

  function markiere(id) {
    if (!id || id === aktiv || !abschnitte.has(id)) return;
    aktiv = id;
    const kap = abschnitte.get(id).k.id;
    tocBox.querySelectorAll('.hi-toc-a').forEach(b => b.classList.toggle('is-on', b.dataset.geh === id));
    tocBox.querySelectorAll('.hi-toc-k').forEach(li => li.classList.toggle('is-auf', li.dataset.kap === kap));
    const an = tocBox.querySelector('.hi-toc-a.is-on');
    if (an && tocBox.scrollHeight > tocBox.clientHeight) {
      const r = an.getBoundingClientRect(), rb = tocBox.getBoundingClientRect();
      if (r.top < rb.top || r.bottom > rb.bottom) an.scrollIntoView({ block: 'nearest' });
    }
  }

  function springe(id, opt) {
    if (!abschnitte.has(id)) return false;
    if (!offen) oeffnen();
    if (sucheEl.value && !(opt && opt.suche)) { sucheEl.value = ''; suchen(''); }
    const e = abschnitte.get(id);
    const el = e.el;
    // Der erste Abschnitt eines Kapitels nimmt die Kapitelüberschrift mit.
    const oben = e.k.abschnitte[0].id === id ? el.parentElement : el;
    // Ein Kapitel im aufgeklappten Verzeichnis (schmal) lässt es offen:
    // erst danach wählt man den Abschnitt darin.
    if (!(opt && opt.tocLassen)) {
      panel.classList.remove('hi-toc-zeigen');
      $('.hi-toc-auf', panel).setAttribute('aria-expanded', 'false');
    }
    const ziel = Math.max(0, oben.offsetTop - 8);
    const nah = Math.abs(textBox.scrollTop - ziel) < textBox.clientHeight * 3;
    spyRuhe = Date.now() + (nah ? 900 : 100);
    textBox.scrollTo({ top: ziel, behavior: nah ? 'smooth' : 'auto' });
    markiere(id);
    el.classList.remove('is-blitz');
    void el.offsetWidth;                 // die Animation neu anstoßen
    el.classList.add('is-blitz');
    clearTimeout(el._blitz);
    el._blitz = setTimeout(() => el.classList.remove('is-blitz'), 1800);
    return true;
  }

  /* ═══ Suchen ══════════════════════════════════════════════════ */

  function suchen(q) {
    const w = norm(q).split(' ').filter(x => x.length > 1 || /\d/.test(x));
    const alles = $('.hi-alles', panel);
    if (!w.length) {
      ergebnisBox.hidden = true;
      ergebnisBox.innerHTML = '';
      alles.hidden = false;
      trefferEl.textContent = '';
      return;
    }
    const liste = [];
    for (const [id, e] of abschnitte) {
      let punkte = 0, alle = true;
      for (const x of w) {
        if (e.titelN.includes(x)) punkte += norm(e.a.titel).includes(x) ? 10 : 5;
        else if (e.such.includes(x)) punkte += 1;
        else { alle = false; break; }
      }
      if (alle) liste.push({ id, e, punkte });
    }
    liste.sort((a, b) => b.punkte - a.punkte);
    trefferEl.textContent = liste.length === 1 ? '1 Treffer' : liste.length + ' Treffer';
    alles.hidden = true;
    ergebnisBox.hidden = false;
    textBox.scrollTop = 0;
    if (!liste.length) {
      ergebnisBox.innerHTML = '<p class="hi-leer">Nichts gefunden. Versuchen Sie ein anderes Wort — oder klicken Sie '
        + 'in SYNIR einfach auf das Ding, um das es geht.</p>';
      return;
    }
    ergebnisBox.innerHTML = liste.map(({ id, e }) =>
      '<button type="button" class="hi-erg" data-geh="' + id + '">'
      + '<span class="hi-erg-k">' + e.nr + ' · ' + esc(e.k.titel) + '</span>'
      + '<strong>' + hervor(esc(e.a.titel), w) + '</strong>'
      + '<span class="hi-erg-s">' + hervor(esc(ausschnitt(e, w)), w) + '</span>'
      + '</button>').join('');
  }

  /* Ein Satz aus dem Abschnitt, in dem das Suchwort vorkommt. */
  function ausschnitt(e, w) {
    const a = e.a;
    const teile = [a.kurz].concat(a.schritte || [], a.wissen || [], a.tipp || [],
      a.tabelle ? a.tabelle.zeilen.map(z => z.join(' — ')) : []).map(ohneTags);
    for (const t of teile) if (w.some(x => norm(t).includes(x))) return kuerze(t);
    return kuerze(teile[0] || '');
  }
  const kuerze = (t) => t.length > 150 ? t.slice(0, 147).replace(/\s+\S*$/, '') + ' …' : t;

  function hervor(html, w) {
    let h = html;
    for (const x of w) {
      if (x.length < 2) continue;
      // Umlaute im Text ↔ ae/oe/ue im Suchwort: beide Schreibweisen zulassen.
      const muster = x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/ae/g, '(?:ae|ä)').replace(/oe/g, '(?:oe|ö)').replace(/ue/g, '(?:ue|ü)').replace(/ss/g, '(?:ss|ß)');
      h = h.replace(new RegExp('(' + muster + ')(?![^<]*>)', 'gi'), '<mark>$1</mark>');
    }
    return h;
  }

  /* ═══ Klicks im Panel ═════════════════════════════════════════ */

  function klickImPanel(ev) {
    const b = ev.target.closest('button');
    if (!b) { if (ev.target.closest('.hi-lupe')) lupe.hidden = true; return; }
    if (b.classList.contains('hi-x')) { schliessen(); return; }
    if (b.classList.contains('hi-breit')) {
      breiteSetzen(istVoll() ? null : window.innerWidth);
      return;
    }
    if (b.classList.contains('hi-toc-klapp')) {
      tocSetzen(istTocSchmal() ? null : TOC_SCHMAL);
      return;
    }
    if (b.classList.contains('hi-toc-auf')) {
      const an = !panel.classList.contains('hi-toc-zeigen');
      panel.classList.toggle('hi-toc-zeigen', an);
      b.setAttribute('aria-expanded', String(an));
      return;
    }
    if (b.dataset.geh) { springe(b.dataset.geh, { tocLassen: b.classList.contains('hi-toc-kb') }); return; }
    if (b.dataset.zeig) { zeigen(b.dataset.zeig); return; }
    if (b.dataset.gross) {
      const img = $('img', lupe);
      img.src = BILD(b.dataset.gross);
      img.alt = $('img', b).alt;
      $('.hi-lupe-t', lupe).textContent = $('img', b).alt;
      lupe.hidden = false;
    }
  }

  /* ═══ „Zeigen": das Ding auf dem Bildschirm umranden ═══════════ */

  let ringe = [], ringTimer = 0;
  function ringeWeg() {
    clearTimeout(ringTimer);
    ringe.forEach(r => r.remove());
    ringe = [];
  }

  function zeigen(id) {
    const e = abschnitte.get(id);
    if (!e) return;
    ringeWeg();
    const rects = [];
    const sichtbar = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      if (panel.contains(el)) return null;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none') return null;
      if (r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight) return null;
      return r;
    };
    for (const z of e.a.zeigen || []) {
      if (z.startsWith('geraet:')) {
        const art = z.slice(7);
        const SIM = window.SIM;
        if (!SIM || !SIM.netz) continue;
        for (const n of SIM.netz.list()) {
          if (n.kind !== art) continue;
          const g = document.querySelector('.nf-node[data-node="' + n.id + '"] .nf-plate');
          const r = g && sichtbar(g);
          if (r) rects.push(r);
        }
      } else {
        document.querySelectorAll(z).forEach(el => { const r = sichtbar(el); if (r) rects.push(r); });
      }
    }
    if (!rects.length) {
      if (window.SIM && window.SIM.toast) window.SIM.toast('Gerade nicht zu sehen — ' + hinweisFuer(id));
      return;
    }
    for (const r of rects.slice(0, 24)) {
      const d = document.createElement('div');
      d.className = 'hi-ring';
      d.style.left = (r.left - 6) + 'px';
      d.style.top = (r.top - 6) + 'px';
      d.style.width = (r.width + 12) + 'px';
      d.style.height = (r.height + 12) + 'px';
      document.body.appendChild(d);
      ringe.push(d);
    }
    ringTimer = setTimeout(ringeWeg, 2600);
  }

  function hinweisFuer(id) {
    const k = abschnitte.get(id).k.id;
    if (k === 'software') return 'in der Aktion ein Gerät antippen.';
    if (k === 'einstellen') return 'im Entwurf ein Gerät antippen.';
    if (id === 'mitschnitt') return 'in der Aktion unter „Ansicht & Tools“ einschalten.';
    return 'das Element ist im Moment nicht auf dem Bildschirm.';
  }

  /* ═══ Was wurde angeklickt? ═══════════════════════════════════
     Vom Speziellen zum Allgemeinen: erst Knöpfe und Reiter mit
     eindeutiger Bedeutung, dann die Fenster, in denen sie liegen,
     zuletzt die Fläche. Gibt die ID eines Abschnitts zurück oder
     null — dann bleibt die Hilfe, wo sie ist. */

  const GERAET = { host: 'endgeraet', server: 'server', handy: 'handy', switch: 'switch',
                   router: 'router', heimrouter: 'heimrouter', cww: 'cww' };
  const PROGRAMM = { terminal: 'terminal', dateien: 'dateien', software: 'softwareinst', dns: 'dns',
                     browser: 'browser', webserver: 'webserver', streamingserver: 'streaming',
                     mail: 'mail', mailserver: 'mailserver', zertstelle: 'zertstelle',
                     vpnserver: 'vpn', vpnclient: 'vpn' };
  const KNOPF = [
    ['.marke', 'ueberblick'], ['#modus', 'modi'],
    ['#play, #stepBtn, #resetBtn, .speedbox', 'uhr'],
    ['#aufgabe, #aufgabeKachel', 'auftrag'],
    ['#szSaveBtn, #aufgabeBtn', 'eigene'],
    ['#szenario, #szenarioPop, .szm-pop', 'szenarien'],
    ['#dateiBtn, #neuBtn, #importBtn, #exportBtn', 'dateimenue'],
    ['#subBtn', 'subnetze'], ['#traceBtn', 'mitschnitt'], ['#wltBtn', 'wlt'],
    ['#lernBtn', 'lerninfo'], ['#binBtn', 'binaer'],
    ['#themeBtn, #bilderBtn, #ansichtBtn', 'ansicht'],
    ['[data-tool="kabel"]', 'kabel'], ['[data-tool="zeiger"]', 'bearbeiten'],
    ['.rail-zoom', 'flaeche'], ['.rail-mini', 'desktop'], ['.rail-fold, .rail-t', 'leiste'],
    ['#subnetze', 'subnetze'], ['#wlt', 'wlt'], ['.trace', 'mitschnitt'], ['#term', 'terminal'],
    ['.blind', 'blind']
  ];

  /* Ein Wort aus dem Kärtchen (Feld, Knopf, Überschrift) → Abschnitt. */
  function ausWort(w) {
    w = norm(w);
    if (!w) return null;
    if (/firewall|fw|gesperrt|whitelist|blacklist/.test(w)) return 'firewall';
    if (/dhcp|fest|vergeben/.test(w)) return 'dhcp';
    if (/portfrei|frei|nat/.test(w)) return 'nat';
    if (/wlan|funk|ssid/.test(w)) return 'wlan';
    if (/weiterleitung|routing|rip|weg/.test(w)) return 'routing';
    if (/wolke|bereich|8\.8\.8\.8|internet/.test(w)) return 'cww';
    if (/gelernt|arp|mac.tabelle|tabellen/.test(w)) return 'lerninfo';
    if (/netzwerkkarte|addnic|delnic|schnittstelle|buchse/.test(w)) return 'netzwerkkarten';
    if (/^(ip|mask|gateway|dns|mac)$|adresse|netzmaske/.test(w)) return 'adressen';
    return null;
  }

  function karteZiel(t, k) {
    if (t.closest('.karte-mehr, .karte-pw, .karte-h, .karte-x')) return 'kaertchen';
    const body = $('.karte-b', k);
    // Ein Kabel hat sein eigenes Kärtchen.
    if (body && body.querySelector('input[type="range"]') && /kabel/i.test(($('.karte-name', k) || {}).textContent + ' ' + ($('.karte-kurz', k) || {}).textContent)) return 'kabel';
    const seite = body ? body.dataset.seite : '';
    if (seite === 'dhcp') return 'dhcp';
    if (seite === 'firewall') return 'firewall';
    if (seite === 'dns') return 'cww';
    const reiter = t.closest('[data-k="reiter"]');
    if (reiter) {
      const s = reiter.dataset.seite;
      if (s === 'wan' || s === 'lan') return 'heimrouter';
      if (s === 'internet') return 'cww';
      if (s === 'karten') return 'netzwerkkarten';
      if (s === 'allgemein') return null;   // dann entscheidet unten das Gerät
    }
    const f = t.closest('[data-f], [data-k]');
    if (f) {
      const z = ausWort(f.dataset.f || f.dataset.k);
      if (z) return z;
      if (f.dataset.k === 'del') return 'kaertchen';
    }
    // Die Überschrift, unter der das Angeklickte steht.
    for (let n = t; n && n !== k; n = n.parentElement) {
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) {
        if (s.classList && s.classList.contains('k-sec')) {
          const z = ausWort(s.textContent);
          if (z) return z;
          n = null; break;
        }
      }
      if (!n) break;
    }
    // Sonst: das Gerät, dem das Kärtchen gehört.
    return geraetAusName(($('.karte-name', k) || {}).textContent) || 'kaertchen';
  }

  function geraetAusName(name) {
    const SIM = window.SIM;
    if (!SIM || !SIM.netz || !name) return null;
    const n = SIM.netz.list().find(x => x.name === name.trim());
    return n ? GERAET[n.kind] : null;
  }

  function desktopZiel(t, dt) {
    if (t.closest('.wb-zert')) return 'zertstelle';
    const knopf = t.closest('[data-app], [data-dock]');
    if (knopf) return PROGRAMM[knopf.dataset.app || knopf.dataset.dock] || 'desktop';
    if (t.closest('.dt-h')) return dt.classList.contains('dt--kein') ? 'ohneschirm' : 'desktop';
    if (dt.classList.contains('dt--kein')) {
      const reg = dt.querySelector('.dt-reg-b.is-on');
      if (reg && reg.dataset.app === 'terminal') return 'terminal';
      return 'ohneschirm';
    }
    const offenes = dt.querySelector('.dt-dapp.is-on');
    if (offenes && t.closest('.dt-fenster, .dt-win')) return PROGRAMM[offenes.dataset.dock] || 'desktop';
    return 'desktop';
  }

  function zielVon(t) {
    if (!t || !t.closest) return null;
    if (t.closest('#hilfe, .hi-chip, .hi-ring, #hilfeBtn')) return null;
    for (const [sel, id] of KNOPF) if (t.closest(sel)) return id;
    const add = t.closest('[data-add]');
    if (add) return GERAET[add.dataset.add] || 'leiste';
    if (t.closest('#ginfo')) {
      const n = norm(($('#ginfoName') || {}).textContent);
      for (const [k, id] of Object.entries({ switch: 'switch', heimrouter: 'heimrouter', router: 'router', handy: 'handy', server: 'server', cww: 'cww', 'class wide': 'cww' }))
        if (n.includes(k)) return id;
      return 'endgeraet';
    }
    if (t.closest('.rail')) return 'leiste';
    const dt = t.closest('.dt');
    if (dt) return desktopZiel(t, dt);
    const k = t.closest('.karte');
    if (k) return karteZiel(t, k);
    // Die Fläche.
    if (t.closest('.nf-fw')) return 'firewall';
    if (t.closest('.nf-mark, .nf-badge, .nf-lock, .nf-port, .nf-portlabels')) {
      if (t.closest('.nf-port, .nf-portlabels')) return 'heimrouter';
      if (t.closest('.nf-wlan')) return 'wlan';
      return 'marken';
    }
    const node = t.closest('.nf-node');
    if (node) {
      const SIM = window.SIM;
      const n = SIM && SIM.netz && SIM.netz.get ? SIM.netz.get(node.dataset.node) : null;
      return n ? (GERAET[n.kind] || 'leiste') : null;
    }
    const kabel = t.closest('.nf-cable');
    if (kabel) return kabel.classList.contains('is-funk') ? 'wlan' : 'kabel';
    if (t.closest('.nf, .canvas, .stage')) return null;   // leerer Tisch: die Hilfe bleibt, wo sie ist
    return null;
  }

  function titelVon(id) {
    const e = abschnitte.get(id);
    return e ? e.a.titel : '';
  }

  /* ═══ Zuhören ═════════════════════════════════════════════════ */

  function binden() {
    const b = $('#hilfeBtn');
    if (b) b.addEventListener('click', umschalten);

    document.addEventListener('pointerdown', (ev) => {
      if (!offen) return;
      druck = { x: ev.clientX, y: ev.clientY, el: ev.target, t: Date.now() };
    }, true);
    document.addEventListener('pointerup', (ev) => {
      if (!offen || !druck) return;
      const d = druck; druck = null;
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8) return;   // gezogen, nicht getippt
      const id = zielVon(d.el);
      if (id) setTimeout(() => springe(id), 0);
    }, true);

    /* Über einem Ding mit Hilfeabschnitt zeigt ein kleines Schild,
       wohin ein Klick führt. Nur mit der Maus — auf dem Tablet gibt
       es kein Darüberfahren. */
    let raf = 0, letzt = null;
    document.addEventListener('pointermove', (ev) => {
      if (!offen || ev.pointerType !== 'mouse' || ev.buttons) { if (chip && !chip.hidden) chip.hidden = true; return; }
      letzt = ev;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const e = letzt;
        const id = zielVon(e.target);
        if (!id || id === aktiv) { chip.hidden = true; return; }
        chip.textContent = '? ' + titelVon(id);
        chip.hidden = false;
        const w = chip.offsetWidth;
        chip.style.left = Math.min(e.clientX + 14, window.innerWidth - w - 8) + 'px';
        chip.style.top = (e.clientY + 18) + 'px';
      });
    }, true);
    document.addEventListener('pointerleave', () => { if (chip) chip.hidden = true; });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'F1' && darf()) { ev.preventDefault(); umschalten(); }
    });
    window.addEventListener('resize', () => {
      if (!offen) return;
      kopfHoehe();
      breiteSetzen(breite, true);
    });
  }

  const darf = () => document.body.dataset.rolle !== 'participant';

  function start() {
    binden();
    window.SynirHilfe = {
      get offen() { return offen; },
      get aktiv() { return aktiv; },
      breiteSetzen, tocSetzen,
      get ids() { if (!panel) baue(); return [...abschnitte.keys()]; },
      oeffnen, schliessen, springe, zielVon,
      /* Von draußen (tool.js, das Pult der Lehrkraft): nur springen,
         wenn die Hilfe schon offen ist — ein Klick auf „Karte" soll
         nicht ungefragt eine Anleitung aufschlagen. */
      zeigeWennOffen(id) { if (offen) springe(id); }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
