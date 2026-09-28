/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — prog-mail.js   ·   E-Mail-Server und
   E-Mail-Programm
   ══════════════════════════════════════════════════════════════
   Die Protokolle stehen in `mail.js`. Hier stehen die zwei
   Fenster, und ihr Wortlaut ist der von Filius
   (`GUIApplicationEmailServerWindow`, `…EmailAnwendungWindow`):
   *Maildomain*, *Neues Konto*, *Benutzername*, *Passwort*,
   *Konto erstellen*, *E-Mail Adresse*, *Anzahl Mails* — und beim
   Programm *Posteingang*, *Gesendete*, *E-Mails abrufen*,
   *Neue E-Mail verfassen*, *An:*, *Betreff:*, *Senden*.

   ── Zwei Abweichungen, beide begründet ───────────────────────
   1. **Keine Reiter.** Filius hat im Serverfenster drei
      (*Neues Konto* / *Konten-Liste* / *Log Fenster*) und im
      Programm zwei. Hier stehen Formular und Liste
      untereinander — dieselbe Entscheidung wie beim Router
      („welche Adresse hat welche Karte" soll nicht am Klicken
      hängen). Drei Reiter für zwei Zeilen Inhalt sind es nicht
      wert, und das Fenster ist ohnehin schmal.
   2. **Kein CC, kein BCC, kein Adressbuch.** Sie beantworten
      keine Frage über Netze.

   ⭐ Die Portfelder im Konto sind die EINZIGE Stelle im ganzen
   Programm, an der ein Kind eine Portnummer eintippt — vorbelegt
   mit 110 und 25, weil das Eigenschaften der Protokolle sind und
   keine Entscheidung. Wer sie vertauscht, sieht im Mitschnitt
   genau, was passiert. Filius führt sie ebenso als Feld.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;
  const esc = U.escapeHtml;

  /* Was gerade offen ist: Posteingang, Gesendete, eine einzelne
     Nachricht, das Verfassen oder die Kontoeinrichtung. */
  let st = { node: null, seite: 'eingang', offen: -1, meldung: '', entwurf: null, info: false, pruuft: false };

  function frisch(nodeId) {
    st = { node: nodeId, seite: 'eingang', offen: -1, meldung: '', entwurf: null, info: false, pruuft: false };
  }

  /* ═══ Das E-Mail-Programm ════════════════════════════════════ */

  /* Die eigene Adresse — abgeleitet, nicht getippt. Sie steht
     unter den Feldern, aus denen sie entsteht, und zwar auch
     dann, wenn noch nicht angemeldet ist: so sieht man beim
     Tippen, was dabei herauskommt. */
  function adressZeile(k) {
    const a = (k.benutzer && k.domain)
      ? String(k.benutzer).trim() + '@' + String(k.domain).trim().toLowerCase() : '';
    return '<div class="ml-adresse' + (a ? '' : ' is-leer') + '">'
      + '<span>Ihre E-Mail-Adresse:</span> <strong>'
      + (a ? esc(a) : '— ergibt sich aus Benutzername und Maildomain —')
      + '</strong></div>';
  }

  /* ⭐ Anmelden und Abmelden. Filius hat beides nicht: dort tippt
     man die Angaben ein und merkt beim ersten Senden, ob sie
     stimmen. Genau das ist die teuerste Stelle des Mailkapitels —
     ein Tippfehler im Servernamen sieht aus wie ein fehlender
     MX-Eintrag wie ein nicht gestarteter Server. */
  /* ⚠️ Die Knöpfe hießen bis zum 2026-09-27 `mlAn` und `mlAus` —
     und `mlAn` ist auch das Feld „An:" beim Verfassen. Beide
     Seiten stehen in DERSELBEN Box; `box.querySelector('#mlAn')`
     weiter unten fand beim Verfassen also das Empfängerfeld und
     hängte ihm den Anmelde-Empfänger an. Ein Tipp ins Feld hat
     danach geprüft, neu gezeichnet — und das frische Feld hatte
     keinen Schreibstrich mehr. Man konnte dort nichts eintragen.

     ⭐ Die Lehre ist dieselbe wie beim Kabel („ein `click` auf
     etwas, das beim Loslassen neu gezeichnet wird, feuert nicht"),
     nur von der anderen Seite: **eine Kennung gehört EINEM
     Element.** Ein Fenster, das seine Seiten in dieselbe Box
     zeichnet, hat keinen zweiten Namensraum, der das abfängt.
     Deshalb heißen sie jetzt nach ihrer Tätigkeit, und die
     Empfänger unten hängen nur an der Seite, zu der sie gehören. */
  function anmeldeBlock(k) {
    if (k.angemeldet) {
      return '<div class="ml-an ml-an--ok">'
        + '<span class="k-dot is-on"></span>'
        + '<span>Angemeldet als <strong>' + esc(k.adresse || '') + '</strong></span>'
        + '<button class="btn btn--ghost" id="mlAbmelden">Abmelden</button>'
        + '</div>';
    }
    return '<div class="ml-an">'
      + '<button class="sw-ok" id="mlAnmelden">Anmelden</button>'
      + '<span class="k-hint">Prüft die Angaben bei beiden Servern — '
      +   'POP3 zum Abholen, SMTP zum Senden.</span>'
      + '</div>';
  }

  /* Das Info-Symbol beim Konto einrichten. Es gab im ganzen
     Programm keines: `#ginfo` hängt fest an der Geräteleiste und
     ist 330 px breit. Also der einfachste Weg, der hier trägt —
     ein Umschalter, der einen `.k-note`-Kasten auf- und zuklappt
     (das etablierte Muster für Hinweise). */
  const INFO_TEXT =
    '<strong>So kommst du zu einem Konto:</strong> Ein E-Mail-Konto liegt nicht auf '
    + 'diesem Gerät, sondern auf dem <em>Server</em>. Leg es dort zuerst an — im '
    + 'Programm <em>E-Mail-Server</em>, unter <em>Neues Konto</em>. Dort stehen auch '
    + 'die <em>Maildomain</em> und der Benutzername, die du hier brauchst. '
    + 'Der <em>POP3-Server</em> und der <em>SMTP-Server</em> sind der Name oder die '
    + 'Adresse des Geräts, auf dem der Server läuft — beides dasselbe Gerät.';

  function bauProgramm(node, box, ctx) {
    if (st.node !== node.id) frisch(node.id);
    const k = ctx.netz.mailKonto(node);
    /* ⚠️ „Eingerichtet" heißt seit dem 2026-09-27
       ANGEMELDET. Vorher genügte es, drei Felder gefüllt zu
       haben — dann stand der Posteingang da und beim ersten
       Abrufen kam ein Serverfehler, den niemand einordnen
       konnte. Jetzt führt der Weg über den Knopf. */
    if (!k.angemeldet && st.seite !== 'konto') st.seite = 'konto';

    const leiste =
      '<div class="ml-leiste">'
      + '<button class="ml-reg' + (st.seite === 'eingang' ? ' is-on' : '') + '" data-seite="eingang">'
      +   'Posteingang' + ((k.posteingang || []).length ? ' <em>' + k.posteingang.length + '</em>' : '')
      + '</button>'
      + '<button class="ml-reg' + (st.seite === 'gesendet' ? ' is-on' : '') + '" data-seite="gesendet">'
      +   'Gesendete</button>'
      /* ⭐ Der Haken am Reiter. Vom Nutzer verlangt: „Wenn ich
         eingeloggt bin hätte ich gerne einen Hacken beim ‚Konto
         einrichten' an dem Reiter."
         Er beantwortet die Frage, die man sich von den beiden
         anderen Seiten aus stellt („bin ich hier eigentlich
         angemeldet?") — genau dort, wo man sonst hinklicken
         müsste, um sie zu beantworten. Derselbe Haken wie auf der
         Kachel eines aufgespielten Programms: er heißt in diesem
         Programm überall „das ist erledigt". */
      + '<button class="ml-reg' + (st.seite === 'konto' ? ' is-on' : '') + '" data-seite="konto">'
      +   'Konto einrichten'
      +   (k.angemeldet
            ? '<span class="ml-hk" title="angemeldet">' + U.icon('haken') + '</span>' : '')
      + '</button>'
      /* Das (i) steht NEBEN dem Reiter, zu dem es gehört, und nur
         dort. Ein Fragezeichen über dem ganzen Programm würde
         niemand in dem Augenblick anfassen, in dem die Frage
         auftaucht — und die Frage taucht genau hier auf. */
      + (st.seite === 'konto'
          ? '<button class="ml-i' + (st.info ? ' is-on' : '') + '" id="mlInfo" '
            + 'title="Was gehört hier hinein?" aria-label="Erklärung">i</button>'
          : '')
      + '</div>'
      + (st.seite === 'konto' && st.info ? '<div class="k-note">' + INFO_TEXT + '</div>' : '');

    let inhalt = '';

    if (st.seite === 'konto') {
      /* Reihenfolge und Beschriftung wie in Filius. Leer, wie
         alles in diesem Programm, was eine Entscheidung ist —
         nur die zwei Portnummern stehen da, weil sie keine sind.

         ⚠️ Solange man angemeldet ist, sind alle Felder gesperrt.
         Vom Nutzer verlangt: „Die eingegebenen bzw. geprüften
         Werte sollen nach erfolgreichem Login fixiert sein."

         ⭐ Und hier steht bewusst KEIN Schloss an den Feldern,
         anders als bei DHCP. Dort braucht es eines, weil sonst
         nichts erklärt, warum die Adresse nicht zu ändern ist.
         Hier steht die Erklärung zwei Zentimeter darunter in
         einem grünen Balken („Angemeldet als …" mit dem Knopf
         zum Abmelden). Acht Schlösser daneben wären dieselbe
         Auskunft ein zweites Mal — und eine Auskunft, die
         zweimal dasteht, liest man keinmal. */
      const zu = !!k.angemeldet;
      const f = (id, label, wert, platz, typ) =>
        '<label class="ml-f' + (zu ? ' is-zu' : '') + '"><span>' + label + '</span>'
        + '<input class="f" data-k="' + id + '" value="' + esc(wert || '') + '"'
        + (platz ? ' placeholder="' + esc(platz) + '"' : '')
        + (typ === 'zahl' ? ' inputmode="numeric"' : '')
        + (id === 'passwort' ? ' type="password"' : '')
        + (zu ? ' disabled' : '') + ' spellcheck="false"></label>';

      /* ⭐ Das Feld „E-Mail-Adresse" ist weg, „Maildomain" ist
         neu — und die Adresse ergibt sich daraus. Vom Nutzer
         verlangt: „accountname@domain.de … muss beim Login nicht
         extra angegeben werden."

         Das Wort ist Filius' eigenes, nur von der anderen Seite:
         im E-Mail-SERVER heißt das Feld dort „Maildomain:"
         (emailserver_msg4). Dass beide Seiten dasselbe Wort
         benutzen, ist der halbe Unterricht — es ist ja auch
         dieselbe Angabe. */
      /* ⚠️ Die vier Serverfelder stehen in einem EIGENEN Gitter,
         und das ist kein Schönheitsgrund. `.ml-konto` ist
         `auto-fit` — bei 520 Punkten Fensterbreite ergibt das drei
         Spalten, und dann landete „SMTP-Server" unter
         „Maildomain", während „POP3-Port" noch in der Zeile
         darüber stand. Vom Nutzer beanstandet: „die SMTP Felder
         sollen unter POP3 stehen."

         ⭐ Und der Grund, warum es genau so gehört: die zwei
         Zeilen sind DIESELBE Angabe zweimal — Rechner und Tür.
         Untereinander liest man sie als Paar und sieht, dass
         beide Male derselbe Rechner steht und nur die Nummer
         verschieden ist. Über drei Spalten verteilt ist das eine
         Liste aus vier zusammenhanglosen Feldern. `.ml-paar` hat
         deshalb feste zwei Spalten (Server breit, Port schmal) und
         hängt nicht an der Fensterbreite. */
      inhalt =
        '<div class="ml-konto ml-konto--zwei">'
        + f('name', 'Name:', k.name, 'Anna Beispiel')
        + f('benutzer', 'Benutzername:', k.benutzer, 'anna')
        + f('passwort', 'Passwort:', k.passwort, '')
        + f('domain', 'Maildomain:', k.domain, 'schule.de')
        + '</div>'
        + '<div class="ml-paar">'
        + f('pop3', 'POP3-Server:', k.pop3, 'mail.schule.de')
        + f('pop3Port', 'POP3-Port:', k.pop3Port, '', 'zahl')
        + f('smtp', 'SMTP-Server:', k.smtp, 'mail.schule.de')
        + f('smtpPort', 'SMTP-Port:', k.smtpPort, '', 'zahl')
        + '</div>'
        /* ⚠️ Die abgeleitete Adresse steht nur, solange man NICHT
           angemeldet ist. Danach sagt der grüne Balken darunter
           dasselbe („Angemeldet als anna@schule.de") — und zwei
           Kästen, die dasselbe erklären, liest niemand zweimal;
           er liest keinen von beiden. Das hat das Bild gezeigt.

           Vorher ist sie dagegen nötig: sie zeigt beim Tippen,
           was aus Benutzername und Maildomain wird. */
        + (k.angemeldet ? '' : adressZeile(k))
        + anmeldeBlock(k)
        + '<div class="k-hint">Die zwei Portnummern sind festgelegt: <strong>110</strong> holt '
        + 'Post ab (POP3), <strong>25</strong> schickt sie los (SMTP). Wer sie vertauscht, '
        + 'sieht im Mitschnitt, was passiert.</div>';

    } else if (st.seite === 'neu') {
      const e = st.entwurf || { an: '', betreff: '', text: '' };
      inhalt =
        '<div class="ml-neu">'
        + '<label class="ml-f"><span>An:</span><input class="f" id="mlAn" value="'
        +   esc(e.an) + '" placeholder="bernd@schule.de" spellcheck="false"></label>'
        + '<label class="ml-f"><span>Betreff:</span><input class="f" id="mlBetreff" value="'
        +   esc(e.betreff) + '" spellcheck="false"></label>'
        /* ⚠️ Der Zeilenumbruch direkt nach `<textarea>` ist KEIN
           Tippfehler: HTML verschluckt genau einen an dieser
           Stelle. Ohne ihn fehlt einer Antwort die erste
           Leerzeile — der Schreibstrich stünde dann direkt über
           dem Zitat statt eine Zeile darüber. Gefunden hat es
           der Prüfstand. */
        + '<textarea class="f ml-text" id="mlText" placeholder="Deine Nachricht …">\n'
        +   esc(e.text) + '</textarea>'
        /* Der Abstand über den Knöpfen steht im CSS
           (`.ml-neu .ml-knoepfe`). Vorher klebten sie an der
           Unterkante des Schreibfelds — und ein Knopf, der die
           Feldkante berührt, sieht aus wie ein Teil des Felds. */
        + '<div class="ml-knoepfe">'
        +   '<button class="sw-ok" id="mlSenden">Senden</button>'
        +   '<button class="sw-nein" data-seite="eingang">Abbrechen</button>'
        + '</div>'
        + '</div>';

    } else if (st.offen >= 0) {
      const liste = st.seite === 'gesendet' ? (k.gesendet || []) : (k.posteingang || []);
      const m = liste[st.offen];
      inhalt = m
        ? '<div class="ml-brief">'
          + '<div class="ml-kopf"><span>Von</span>' + esc(m.von) + '</div>'
          + '<div class="ml-kopf"><span>An</span>' + esc(m.an) + '</div>'
          + '<div class="ml-kopf"><span>Betreff</span><strong>' + esc(m.betreff || '(ohne)') + '</strong></div>'
          + '<pre class="ml-body">' + esc(m.text || '') + '</pre>'
          /* ⭐ „E-Mail beantworten" — Filius' Wortlaut
             (emailanwendung_msg9). Dort ist es ein Symbol in der
             Kopfleiste; hier ein Knopf UNTER der Nachricht, weil
             man dort steht, wenn der Gedanke kommt. Die Stelle
             ist neu, das Wort nicht. */
          + '<div class="ml-knoepfe">'
          +   (st.seite === 'gesendet' ? ''
               : '<button class="sw-ok" data-antwort="1">E-Mail beantworten</button>')
          +   '<button class="fx-zurueck" data-zurueck="1">‹ Zurück</button>'
          + '</div>'
          + '</div>'
        : '';

    } else {
      const liste = st.seite === 'gesendet' ? (k.gesendet || []) : (k.posteingang || []);
      const wer = st.seite === 'gesendet' ? 'Empfänger' : 'Absender';
      inhalt = liste.length
        ? '<div class="ml-liste"><div class="ml-zeile ml-zeile--kopf">'
          + '<span>' + wer + '</span><span>Betreff</span></div>'
          + liste.map((m, i) =>
              '<button class="ml-zeile" data-mail="' + i + '">'
              + '<span>' + esc(st.seite === 'gesendet' ? m.an : m.von) + '</span>'
              + '<span>' + esc(m.betreff || '(ohne)') + '</span></button>').join('')
          + '</div>'
        : '<div class="k-hint">' + (st.seite === 'gesendet'
            ? 'Noch nichts gesendet.'
            : 'Der Posteingang ist leer. <strong>E-Mails abrufen</strong> holt sie vom Server — '
              + 'eine Nachricht kommt nicht von selbst, sie liegt dort und wartet.') + '</div>';
    }

    box.innerHTML = leiste
      + (st.meldung ? '<div class="ml-meldung">' + esc(st.meldung) + '</div>' : '')
      + inhalt
      /* ⚠️ Die zwei trugen bis zum 2026-09-27 `.k-add` — und das
         ist die gestrichelte Schaltfläche für „hier kann noch
         etwas dazukommen" (Netzwerkkarte, Konto, Datei). Sie ist
         absichtlich leise. Aber diese beiden sind das GEGENTEIL
         von leise: sie sind das, worum es im ganzen Programm geht,
         und „E-Mails abrufen" wird zwei Zeilen darüber im leeren
         Posteingang namentlich verlangt. Vom Nutzer beanstandet:
         „etwas deutlicher".

         ⭐ Nur EINER von beiden ist gefüllt, und zwar der, den der
         Satz darüber nennt. Zwei gefüllte Knöpfe nebeneinander
         heben sich gegenseitig auf — dann ist wieder keiner der
         erste. */
      + (st.seite === 'eingang' && st.offen < 0
          ? '<div class="ml-aktionen">'
            + '<button class="ml-akt ml-akt--ruf" id="mlHolen">'
            +   U.icon('abrufen') + '<span>E-Mails abrufen</span></button>'
            + '<button class="ml-akt" id="mlNeu">'
            +   U.icon('verfassen') + '<span>Neue E-Mail verfassen</span></button>'
            + '</div>'
          : '');

    box.querySelectorAll('[data-seite]').forEach(b => b.addEventListener('click', () => {
      st.seite = b.dataset.seite; st.offen = -1; st.meldung = '';
      ctx.render();
    }));
    box.querySelectorAll('[data-mail]').forEach(b => b.addEventListener('click', () => {
      st.offen = +b.dataset.mail; ctx.render();
    }));
    box.querySelectorAll('[data-zurueck]').forEach(b => b.addEventListener('click', () => {
      st.offen = -1; ctx.render();
    }));

    /* ⭐ Antworten — Aufbau wörtlich nach Filius
       (GUIApplicationEmailAnwendungWindow: msg18 „RE:", msg19
       „schrieb:", `replaceAll("\\n", "\n> ")`). Der Entwurf
       überlebt das Neuzeichnen, der Knopf setzt also nur. */
    box.querySelectorAll('[data-antwort]').forEach(b => b.addEventListener('click', () => {
      const liste = st.seite === 'gesendet' ? (k.gesendet || []) : (k.posteingang || []);
      const m = liste[st.offen];
      if (!m) return;
      const zitat = String(m.text || '').split('\n').map(z => '> ' + z).join('\n');
      st.entwurf = {
        an: m.von,
        betreff: /^RE:/i.test(m.betreff || '') ? m.betreff : 'RE: ' + (m.betreff || ''),
        text: '\n\n' + m.von + ' schrieb:\n' + zitat
      };
      st.seite = 'neu'; st.offen = -1; st.meldung = '';
      ctx.render();
    }));

    const info = box.querySelector('#mlInfo');
    if (info) info.addEventListener('click', () => { st.info = !st.info; ctx.render(); });

    box.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('input', () => {
      const feld = inp.dataset.k;
      k[feld] = /Port$/.test(feld) ? (parseInt(inp.value, 10) || 0) : inp.value.trim();
      /* Die Adresse ergibt sich aus Benutzername und Maildomain —
         und zwar beim Tippen, damit die Zeile darunter
         mitgeht. `mail.adresseVon` ist die eine Stelle, an der
         die Regel steht; hier wird sie nur angewandt. */
      if (feld === 'benutzer' || feld === 'domain') {
        if (feld === 'domain') k.domain = k.domain.toLowerCase();
        if (ctx.mail && ctx.mail.adresseVon) ctx.mail.adresseVon(k);
        const z = box.querySelector('.ml-adresse strong');
        if (z) {
          z.textContent = k.adresse || '— ergibt sich aus Benutzername und Maildomain —';
          box.querySelector('.ml-adresse').classList.toggle('is-leer', !k.adresse);
        }
      }
      if (ctx.onDirty) ctx.onDirty();
    }));

    /* ─── Anmelden und Abmelden ───────────────────────────────
       ⚠️ `st.seite === 'konto'` davor ist die zweite Hälfte der
       Absicherung gegen den Fehler von oben. Die Kennungen sind
       jetzt eindeutig; aber ein Empfänger, der auf JEDER Seite
       nach seinem Knopf sucht, findet eines Tages wieder etwas
       Fremdes. Gesucht wird nur dort, wo der Knopf auch steht. */
    const anKnopf = st.seite === 'konto' ? box.querySelector('#mlAnmelden') : null;
    if (anKnopf) anKnopf.addEventListener('click', () => {
      if (st.pruuft) return;
      st.pruuft = true;
      st.meldung = 'Wird geprüft …';
      ctx.render();
      ctx.mail.anmelden(node, (fehler) => {
        st.pruuft = false;
        if (fehler) {
          /* ⚠️ Der Text ist die ZEILE DES SERVERS („-ERR Benutzer
             oder Passwort falsch", „550 Empfänger unbekannt").
             Dazu ein Satz, der sagt, was man damit anfängt — die
             Serverzeile allein ist richtig und für ein Kind
             trotzdem kein Hinweis. */
          st.meldung = 'Anmeldung fehlgeschlagen: ' + String(fehler)
            + '  ·  Prüfe Benutzername, Passwort und die Servernamen — '
            + 'und ob der E-Mail-Server drüben läuft.';
        } else {
          st.meldung = '';
        }
        if (ctx.onDirty) ctx.onDirty();
        ctx.render();
      });
    });

    const ausKnopf = st.seite === 'konto' ? box.querySelector('#mlAbmelden') : null;
    if (ausKnopf) ausKnopf.addEventListener('click', () => {
      ctx.mail.abmelden(node);
      st.seite = 'konto'; st.offen = -1; st.meldung = '';
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    });

    const holen = box.querySelector('#mlHolen');
    if (holen) holen.addEventListener('click', () => {
      st.meldung = 'Wird abgerufen …';
      ctx.render();
      ctx.mail.abholen(node, (fehler, anzahl) => {
        st.meldung = fehler
          ? String(fehler)
          : (anzahl ? anzahl + ' neue Nachricht' + (anzahl === 1 ? '' : 'en') + '.'
                    : 'Keine neue Post.');
        if (ctx.onDirty) ctx.onDirty();
        ctx.render();
      });
    });

    const neu = box.querySelector('#mlNeu');
    if (neu) neu.addEventListener('click', () => {
      st.entwurf = { an: '', betreff: '', text: '' };
      st.seite = 'neu'; st.meldung = '';
      ctx.render();
    });

    const senden = box.querySelector('#mlSenden');
    if (senden) senden.addEventListener('click', () => {
      const m = {
        an: box.querySelector('#mlAn').value.trim(),
        betreff: box.querySelector('#mlBetreff').value,
        text: box.querySelector('#mlText').value
      };
      if (!m.an) { st.meldung = 'Ohne Empfänger geht es nicht.'; ctx.render(); return; }
      st.entwurf = m;
      st.meldung = 'Wird gesendet …';
      ctx.render();
      ctx.mail.senden(node, m, (fehler) => {
        if (fehler) {
          st.meldung = String(fehler);
        } else {
          st.meldung = 'Gesendet.';
          st.seite = 'eingang';
          st.entwurf = null;
        }
        if (ctx.onDirty) ctx.onDirty();
        ctx.render();
      });
    });
  }

  /* ═══ Der E-Mail-Server ══════════════════════════════════════ */

  /* ⚠️ Beide sind Modulvariablen und damit von ALLEN Servern
     geteilt: wer auf Server A tippt und Server B öffnet, findet
     seine Eingabe dort wieder. Für den Zwischenspeicher eines
     halb ausgefüllten Formulars ist das verschmerzbar (man legt
     ein Konto in einem Zug an) — für die MELDUNG wäre es falsch,
     deshalb wird sie beim Gerätewechsel geleert. */
  let srvNeu = { benutzer: '', name: '', passwort: '' };
  let srvMeldung = '';
  let srvNode = null;

  function bauServer(node, box, ctx) {
    const c = ctx.netz.mailConf(node);
    const konten = c.konten || [];
    if (srvNode !== node.id) { srvNode = node.id; srvMeldung = ''; }

    box.innerHTML =
      '<div class="dns-kopf">'
      +   '<span class="k-dot' + (c.on ? ' is-on' : '') + '"></span>'
      +   '<span class="dns-stand">' + (c.on ? 'läuft' : 'gestoppt') + '</span>'
      +   '<button class="btn' + (c.on ? ' btn--ghost' : '') + '" id="msStart">'
      +     (c.on ? 'Beenden' : 'Starten') + '</button>'
      + '</div>'
      + '<label class="ml-f ml-f--breit"><span>Maildomain:</span>'
      +   '<input class="f" id="msDomain" value="' + esc(c.domain || '') + '" '
      +   'placeholder="schule.de" spellcheck="false"></label>'
      + '<div class="k-hint">Alles hinter dem <code>@</code>. Post an eine andere Domain '
      + 'reicht dieser Server weiter — dafür muss im DNS ein <strong>MX-Eintrag</strong> stehen.</div>'
      + '<div class="dt-sec">Neues Konto</div>'
      + '<div class="ml-konto">'
      +   '<label class="ml-f"><span>Benutzername:</span><input class="f" id="msBen" value="'
      +     esc(srvNeu.benutzer) + '" placeholder="anna" spellcheck="false"></label>'
      +   '<label class="ml-f"><span>Vorname und Nachname:</span><input class="f" id="msName" value="'
      +     esc(srvNeu.name) + '" placeholder="Anna Beispiel" spellcheck="false"></label>'
      +   '<label class="ml-f"><span>Passwort:</span><input class="f" id="msPw" value="'
      +     esc(srvNeu.passwort) + '" spellcheck="false"></label>'
      + '</div>'
      + '<button class="k-add" id="msAnlegen">Konto erstellen</button>'
      + (srvMeldung ? '<div class="ml-meldung">' + esc(srvMeldung) + '</div>' : '')
      + '<div class="dt-sec">Konten-Liste</div>'
      + (konten.length
          ? '<div class="ml-liste"><div class="ml-zeile ml-zeile--kopf">'
            + '<span>E-Mail Adresse</span><span>Anzahl Mails</span></div>'
            + konten.map((k, i) =>
                '<div class="ml-zeile ml-zeile--srv">'
                + '<span>' + esc(k.benutzer + '@' + (c.domain || '…')) + '</span>'
                + '<span>' + ((k.posteingang || []).length) + '</span>'
                + '<button class="fx-x" data-weg="' + i + '" title="Konto entfernen">×</button>'
                + '</div>').join('')
            + '</div>'
          : '<div class="k-hint">Noch kein Konto. Ohne Konto kann niemand Post bekommen.</div>');

    box.querySelector('#msStart').addEventListener('click', () => {
      c.on = !c.on;
      ctx.sync();
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    });
    box.querySelector('#msDomain').addEventListener('input', (ev) => {
      c.domain = ev.target.value.trim().toLowerCase();
      if (ctx.onDirty) ctx.onDirty();
    });
    ['Ben', 'Name', 'Pw'].forEach((id, i) => {
      const feld = ['benutzer', 'name', 'passwort'][i];
      box.querySelector('#ms' + id).addEventListener('input', (ev) => {
        srvNeu[feld] = ev.target.value;
      });
    });
    /* ⭐ Vier Fälle, und drei davon liefen vorher STUMM ins Leere:
       leerer Name, Name mit Leerzeichen, Name schon vergeben. Der
       Knopf tat dann nichts, die Felder blieben stehen — es sah
       aus wie ein kaputter Knopf und nicht wie eine Regel. Vom
       Nutzer verlangt: „Wenn versucht wird, zwei Benutzer mit dem
       gleichen Namen zu erstellen, soll kurz eine Fehlermeldung
       auf dem Server angezeigt werden."

       ⚠️ Und der Vergleich war zusätzlich FALSCH: `===` gegen
       `mail.konto()`, das `toLowerCase()` benutzt. „Anna" und
       „anna" ließen sich beide anlegen, POP3 nahm danach immer
       das erste — ein Fehler, den niemand findet, weil beide
       Konten in der Liste stehen und richtig aussehen. */
    box.querySelector('#msAnlegen').addEventListener('click', () => {
      const b = String(srvNeu.benutzer || '').trim();
      const pw = String(srvNeu.passwort || '');
      c.konten = c.konten || [];

      // Wortlaut aus Filius, wo es ihn gibt.
      if (!b || !pw) {                                   // emailserver_msg25
        srvMeldung = 'Geben Sie einen Benutzernamen und ein Passwort ein!';
      } else if (/\s/.test(b)) {                         // emailserver_msg24
        srvMeldung = 'Der Benutzername darf keine Leerzeichen enthalten!';
      } else if (c.konten.some(k => String(k.benutzer).toLowerCase() === b.toLowerCase())) {
        /* Dafür hat Filius KEINEN Text: `benutzerHinzufuegen` gibt
           still `false` zurück, und das Fenster meldet trotzdem
           „wurde angelegt" (GUIApplicationEmailServerWindow:252).
           Also hier erfunden — und ausdrücklich mit dem Namen
           darin, damit klar ist, welcher gemeint ist. */
        srvMeldung = '„' + b + '" gibt es auf diesem Server schon. '
          + 'Zwei Konten mit demselben Namen wären nicht zu unterscheiden.';
      } else {
        c.konten.push({ benutzer: b, name: srvNeu.name, passwort: pw, posteingang: [] });
        srvNeu = { benutzer: '', name: '', passwort: '' };
        srvMeldung = 'Das Benutzerkonto ' + b + ' wurde angelegt.';  // msg22 + msg23
        if (ctx.onDirty) ctx.onDirty();
      }
      ctx.render();
    });
    box.querySelectorAll('[data-weg]').forEach(b => b.addEventListener('click', () => {
      c.konten.splice(+b.dataset.weg, 1);
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    }));
  }

  window.ProgMail = { bauProgramm: bauProgramm, bauServer: bauServer };
})();
