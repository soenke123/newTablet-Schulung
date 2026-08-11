/* State — 5 Gebäudetypen (HQ, Serverfarm, Werbeagentur, Marketing, Bürogebäude).
   Farmen heißen immer "Serverfarm (Stufe N)". Das Tier (kueken … elefant)
   ist nur die visuelle Repräsentation der Stufe — kein Gameplay-Element. */
(function (RT) {
  'use strict';

  // Tier-Stufen: interner Schlüssel für Sprite + User/Slot.
  // Kapazität = 8 × users pro Tier.
  // modelSprite = die Phase-3-Variante desselben Tiers: das User-Modell, das
  // die KI aus der Watchtime dieser Stufe gebaut hat. Bewusst als eigenes Feld
  // und nicht per String-Ersetzung aus `sprite` abgeleitet — die Dateinamen
  // sind uneinheitlich genug (Küken mit Umlaut), und auf einem Webserver ist
  // die Schreibweise anders als lokal nicht egal.
  var TIERS = [
    { id: 'kueken',  icon: '🐣', users: 500,        sprite: 'sprites/User/UserKüken.png',   alt: 'Küken',
      modelSprite: 'sprites/User/ProfilKüken.png' },
    { id: 'huhn',    icon: '🐔', users: 2000,       sprite: 'sprites/User/UserHuhn.png',    alt: 'Huhn',
      modelSprite: 'sprites/User/ProfilHuhn.png' },
    { id: 'gans',    icon: '🦆', users: 10000,      sprite: 'sprites/User/UserGans.png',    alt: 'Gans',
      modelSprite: 'sprites/User/ProfilGans.png' },
    { id: 'ziege',   icon: '🐐', users: 50000,      sprite: 'sprites/User/UserZiege.png',   alt: 'Ziege',
      modelSprite: 'sprites/User/ProfilZiege.png' },
    { id: 'schaf',   icon: '🐑', users: 500000,     sprite: 'sprites/User/UserSchaf.png',   alt: 'Schaf',
      modelSprite: 'sprites/User/ProfilSchaf.png' },
    { id: 'kuh',     icon: '🐄', users: 5000000,    sprite: 'sprites/User/UserKuh.png',     alt: 'Kuh',
      modelSprite: 'sprites/User/ProfilKuh.png' },
    { id: 'elefant', icon: '🐘', users: 50000000,   sprite: 'sprites/User/UserElefant.png', alt: 'Elefant',
      modelSprite: 'sprites/User/ProfilElefant.png' }
  ];

  // Upgrade-Kosten für den Sprung auf die jeweils nächste Stufe.
  //
  // Basis ist der KAPAZITÄTSGEWINN, nicht die Zielstufe: ein Upgrade liefert
  // die Differenz zur nächsten Stufe (Huhn→Gans = 80.000 − 16.000 = 64.000),
  // eine neue Hühnerfarm dagegen ihre vollen 16.000. Wer beide Wege gleich
  // teuer je Kapazität macht, macht Upgraden automatisch viermal so effizient
  // — deshalb hat der Breit-Weg hier bewusst einen schlechteren Kurs als die
  // Höhe.
  //
  // Bezugsgröße ist die FREIZONE-Farm mit 0,3125 €/Kapazität (5.000 € für
  // 16.000, ohne Land) — nicht ein gekaufter Farmplatz. Gegen die gekauften
  // Plätze (1,12 €/Kap aufwärts) zu prüfen erlaubt beliebig teure Upgrades.
  //
  // Der Kurs flacht nach oben ab, damit sich Konsolidierung im Spätspiel
  // lohnt — bei 20 Farmen wird das Ernten sonst zur Arbeit:
  //
  //   Huhn→Gans      Δ    64.000 × 0,50   0,62× — Breite ist besser
  //   Gans→Ziege     Δ   320.000 × 0,50   0,62×
  //   Ziege→Schaf    Δ 3.600.000 × 0,45   0,69×
  //   Schaf→Kuh      Δ    36 Mio × 0,30   1,04× — Gleichstand
  //   Kuh→Elefant    Δ   360 Mio × 0,25   1,25× — Höhe ist besser
  //
  // ⚠️ Schaf und Kuh sind am 2026-08-07 gesenkt worden (0,40 → 0,30 und
  // 0,35 → 0,16), weil die beiden obersten Sprünge sich zu teuer gespielt
  // haben. Vorher lag der ganze Kurs über der Freizone: Breite war auf JEDER
  // Stufe der bessere Kurs, und die Abflachung nach oben war folgenlos —
  // „Konsolidierung lohnt im Spätspiel" stand im Kommentar, aber nicht in den
  // Zahlen. Jetzt kippt es beim Schaf und ist beim Elefanten eindeutig.
  //
  // ⚠️ NACHKORREKTUR AM SELBEN TAG: Kuh 0,16 → 0,25 (57,6 → 90 Mio €). Die
  // Senkung war zu weit gegangen — die Elefantenfarm spielte sich geschenkt.
  // 1,95× hieß, dass Breite auf der obersten Stufe schlicht keine Option mehr
  // war; bei 1,25× lohnt Konsolidierung weiter deutlich, ohne alternativlos zu
  // sein. Dazu kommt seit den Serverkosten eine zweite, laufende Bremse: ein
  // Elefanten-Upgrade verzehnfacht die Kapazität sofort, die Betriebskosten
  // damit auch — und die Farm steht erst einmal fast leer (serverUpkeep*).
  //
  // Der Kurs darf nicht unter ~0,16 fallen: darunter wäre Höhe mehr als
  // doppelt so gut wie Breite, und die Freizone-Farm — der Einstieg in
  // Phase 2 — würde zur Fehlinvestition.
  //
  // kueken: 0, weil der Ausbau auf Stufe 2 der Investor-Deal ist
  // (actions.investorUpgrade). Vor Phase 2 sperrt actions.upgradeFarm den
  // Sprung, damit niemand dem Investor sein Geschenk wegnimmt.
  var TIER_UPGRADE_COST = {
    kueken:  0,
    huhn:    32000,
    gans:    160000,
    ziege:   1620000,
    schaf:   10800000,
    kuh:     90000000
  };

  // Marketing-Kampagnen: alle laufen im Marketing-Gebäude, immer nur eine
  // gleichzeitig. Zwei Sorten, unterschieden über 'kind':
  //
  //   kind 'users' — Reichweite. Zahlt nach Ablauf einmalig User aus, die
  //                  eingesammelt werden wollen. ABSOLUTE Zahlen, die mit
  //                  wachsender Plattform zwangsläufig bedeutungslos werden.
  //                  Das ist Absicht: die Frühspiel-Stufe schafft sich selbst ab.
  //
  //   kind 'trend'  — PR & Partner. Hebt den Trend, solange sie läuft, und ist
  //                   PR_DECAY_SEC nach dem Ende wieder weg. Nichts
  //                   einzusammeln. Weil der Trend PROZENTUAL wirkt, skaliert
  //                   diese Sorte mit der Plattform mit und bleibt bis zum
  //                   Schluss relevant.
  //
  // Damit hat das Marketing-Center einen Bogen von absolut nach prozentual —
  // und die PR-Kampagnen sind das wiederholbare Gegenstück zu den Werbedeals,
  // die den Trend laufend drücken (Sektion 6/8).
  //
  // ── PREIS-ANKER der PR-Kampagnen ──────────────────────────────────────
  // Realistischer Betriebspunkt der Werbung ist 25 % Intensität; dort
  // verkauft Feed Trend für ~957 € je Trend-Sekunde, Search ~2.230, Video
  // ~2.344 — Banner dagegen nur ~40. Anziehungskraft kauft bei 81 (Firma) bis
  // 259 (Beteiligung am Reglerende) €/Trend-Sekunde ein. Daraus folgt
  // beabsichtigt:
  //   • Feed/Search/Video finanzieren ihre eigene Trend-Reparatur:
  //     Marge 3,7× (Feed gegen Beteiligung) bis 29× (Video gegen Firma).
  //     Die Premium-Option ist bewusst nur noch knapp 4-fach gedeckt.
  //   • Banner kann das NIE — der Starter wird ökonomisch überflüssig,
  //     statt weggenerft werden zu müssen.
  //     Diese Aussage hat mit PR_DECAY_SEC = 60 s noch 102 % Luft (40 gegen
  //     81). Sie bleibt die eigentliche Obergrenze für
  //     TREND_DECAY_NEG_PER_SEC — jede Änderung am Malus-Abbau muss sie
  //     erneut bestehen.
  //
  // ── Die frühere OFFENE FRAGE (Beteiligung billiger als Firma) ist erledigt.
  // Sie kam allein aus dem quadratischen Abkling-Schwanz: die Beteiligung hat
  // den doppelten Wert und profitierte davon überproportional (48 gegen 61
  // zu ihren Gunsten). Mit dem FESTEN Ausklang (PR_DECAY_SEC) trägt der
  // Schwanz nur noch einen kleinen Anteil, und die Rangfolge steht wieder da,
  // wo sie hingehört: Marken-Profile 81, Creator-Beteiligung 259 €/Trend-Sekunde.
  //
  // ⚠️ Die Creator-Beteiligung ist mit 20 → 60 s Ausklang um 22 % im Kurs
  // gefallen — sie profitiert anteilig am meisten vom
  // längeren Schwanz, weil ihre Laufzeit die kürzeste ist. Ihre Marge gegen
  // Feed wurde dadurch weiter, die Rolle „knappste Marge,
  // Spitzenlast statt Arbeitspferd" wird also weicher. Falls das im Test
  // stört, ist der Knopf ihr PREIS (costBase/costPerTrend), nicht die
  // Abklingzeit — die hängt am Spielgefühl und ist dort begründet.
  // ── REICHWEITE: der Klick-Aufwand ist der Preis für den Kurs ───────────
  // Es gilt zwangsläufig  €/User × User/s = Kosten ÷ Dauer  — Kosten und
  // Dauer legen das Produkt fest, die User-Zahl schiebt nur auf dieser Kurve
  // hin und her. Man kann also NICHT beide Achsen frei wählen. Wer hier
  // dreht, sollte die abgeleiteten Werte gegenrechnen:
  //
  //   Stadtaktion   100 User/s · 0,30 €/User · 6   Klicks/Min
  //   Empfehlung    100 User/s · 0,375 €/User · 1,5 Klicks/Min
  //   Hype-Burst    133 User/s · 0,50 €/User · 0,4 Klicks/Min
  //
  // Stadtaktion hat den besten Kurs im Spiel, kostet dafür sechs Klicks pro
  // Minute. Empfehlungs-Welle nimmt 25 % Aufpreis für die Ruhe. Hype-Burst
  // ist mit 67 % Aufpreis der teuerste Kurs, liefert dafür das höchste Tempo
  // UND 20.000 User am Stück — der Knopf für "jetzt sofort, Geld egal".
  // Gegenprobe über 150 s: 15× Stadtaktion = 15.000 User / 4.500 €,
  // Hype-Burst = 20.000 User / 10.000 €.
  //
  // Namen und Icons stammen aus v1 (js/core/marketing.js).
  //
  // ── FREISCHALTUNG ──────────────────────────────────────────────────────
  // unlockedBy = Techtree-Node aus dem Marketing-Reiter (null = von Anfang an
  // buchbar). Analog zu AD_TYPES.unlockedBy. Nur die Stadtaktion ist der
  // Einstieg — alles andere kommt über den Marketing-Reiter.
  //
  // Die Reihenfolge im Baum ist kein Zufall: die MARKEN-PROFILE sitzen flacher
  // als die Creator-Beteiligung (getauscht 2026-08-07). PR ist die einzige
  // wiederholbare positive Trend-Quelle (Sektion 8) — die erste, die der
  // Spieler bekommt, muss deshalb die GRUNDLAST sein und nicht die Spitzenlast:
  //   • Marken-Profile: 81 €/Trend-s, 300 s Laufzeit, 40.000 € je Buchung
  //   • Creator-Beteiligung: 259 €/Trend-s, 60 s Laufzeit, 70.000 € am Reglerende
  //
  // ⚠️ Vorher war es umgekehrt, mit der Begründung „der stärkere Ausschlag
  // hilft früher". Das war falsch herum: die erste PR-Kampagne, die der Spieler
  // je sieht, war damit die teuerste je Wirkung UND die kurzlebigste — bei
  // einem Kontostand, der 40.000 € je Minute nicht hergibt. Der Trend blieb
  // faktisch trotzdem eine Einbahnstraße, nur mit einem freigeschalteten Knopf
  // daneben, den man sich nicht leisten konnte.
  //
  // Die Creator-Beteiligung bleibt die Spitzenlast und braucht dafür keinen
  // flachen Platz: sie wird gebraucht, wenn der Trend SOFORT hoch muss, und
  // das ist kein Problem des Phase-2-Einstiegs.
  var CAMPAIGNS = [
    { id: 'stadtaktion', kind: 'users', name: 'Stadtaktion', icon: '🏙️',
      cost: 300,   duration: 10,  users: 1000, unlockedBy: null,
      desc: 'Der beste Kurs im Spiel — bezahlt wird er mit Klicks: alle zehn Sekunden neu starten.' },
    { id: 'empfehlung',  kind: 'users', name: 'Empfehlungs-Welle', icon: '📣',
      cost: 1500,  duration: 40,  users: 4000, unlockedBy: 'mk_langzeit',
      desc: 'Ein Viertel teurer je User als die Stadtaktion. Dafür läuft sie viermal so lange durch.' },
    { id: 'hypeburst',   kind: 'users', name: 'Hype-Burst', icon: '🚀',
      cost: 10000, duration: 150, users: 20000, unlockedBy: 'mk_sprint',
      desc: 'Der teuerste Kurs, aber das höchste Tempo — und 20.000 User am Stück. Der Knopf für „jetzt sofort".' },
    // ── Anziehungskraft: Verträge, keine Strohfeuer ────────────────────────
    // Alle klingen in PR_DECAY_SEC = 60 s aus, also gilt
    //     Trend-Sekunden = trend × (duration + 30)
    // Creator-Beteiligung 270 · Marken-Profile 495 · Zielgruppen-Offensive 1.080.
    // Die Kurse: Creator-Beteiligung 259 (am Reglerende) · Marken-Profile 81 ·
    // Zielgruppen-Offensive 93 €/Trend-s
    //
    // ⚠️ Die Firma setzt den Kurs, die Beteiligung zahlt Aufschlag (3,2×).
    // Das ist die ganze Rollenverteilung: Sofortwirkung kostet. Sie hält
    // trotzdem, weil die PR-PLÄTZE hart begrenzt sind — mit zwei Firmen kommt
    // man nur auf +3,0, wer höher will, MUSS die teure nehmen. Ohne die
    // Platzgrenze wäre die Beteiligung schlicht dominiert.
    //
    // ⚠️ Beim Balancen sind PREIS und DAUER die Knöpfe, nicht `trend` — der
    // Wert steht in Relation zu Node-Boni und Werbe-Malus.
    // Anker, die dabei halten müssen (CLAUDE.md §7.2):
    //   • Banner (40 €/Trend-s) muss UNTER dem PR-Kurs bleiben, sonst kann es
    //     seine eigene Reparatur bezahlen. 40 gegen 81 = 102 % Luft.
    //   • Feed (957) / Search (2.230) / Video (2.344) müssen PR finanzieren
    //     können: Marge 3,7× (Beteiligung) bis 29× (Firma).
    // ⚠️ DIE NAMEN SIND KEINE KOSMETIK. Sie hießen „Influencer buchen" und
    // „Firma auf die Plattform holen" — beides Beschaffungs-Verben, und beide
    // erzählten das Gegenteil der Mechanik. Man kauft hier keine Person ein;
    // man baut ein laufendes Angebot, das dafür sorgt, dass Leute von SELBST
    // herkommen. Genau das ist auch, was der Trend abbildet.
    { id: 'firma',      kind: 'trend', name: 'Verifizierte Marken-Profile', icon: '🤝',
      cost: 40000, duration: 300, trend: 1.5, unlockedBy: 'mk_presse',
      desc: 'Firmen bekommen offizielle, bestätigte Seiten — und eröffnen sie, weil es sie hier gibt. Fünf Minuten Grundlast zum besten Kurs im ganzen Bereich. Die Wahl, wenn der Trend nur stehen soll.' },
    // ── Die einzige Kampagne mit REGLER ───────────────────────────────────
    // Sie hieß „Creator-Fonds" und war eine feste Buchung (40.000 € → +3,0).
    // Der Regler kommt aus dem verworfenen Community Center: dort war die
    // Umsatzbeteiligung ein eigenes Gebäude mit eigener Ökonomie, von dem am
    // Ende ein einziges Werkzeug übrig blieb. Es steht jetzt da, wo es
    // mechanisch hingehört — Geld rein, Trend raus, ein Kampagnenplatz.
    //
    //   trend  = campaignTrendAtStep()         5 Stufen von +1,0 bis +3,0
    //   brutto = costBase + costPerTrend × trend
    //   netto  = brutto × (1 − creatorCut())   Marktplatz-Provision
    //
    // ⚠️ FÜNF STUFEN, KEIN STUFENLOSER REGLER. Der Spieler wählt „sehr
    // niedrig … sehr hoch", nicht einen Trend-Wert: die Beteiligung ist eine
    // Entscheidung über die eigene Haltung, keine Rechenaufgabe. Die
    // Trend-Zahl steht weiterhin auf der Ertrags-Kachel der Karte — dort, wo
    // alle anderen Kampagnen sie auch zeigen. Nebeneffekt: alle fünf Werte
    // liegen exakt auf dem 0,1-Raster von trendModValue(), die Aufschlüsselung
    // im Trend-Modal geht also per Konstruktion auf.
    //
    // ⚠️ DER FESTE SOCKEL (costBase) IST DIE AUSSAGE, nicht ein Rundungs-
    // posten. Er wächst nicht mit der Stufe mit — wer nur symbolisch
    // beteiligt, bezahlt ihn trotzdem voll. Dadurch wird der Kurs nach oben
    // BESSER (311 → 259 €/Trend-Sekunde), und die Mechanik sagt selbst, was
    // das Spiel erzählen will: eine Plattform gewinnt, wenn sie ihre Creator
    // wirklich beteiligt. Streng linear wäre die Stufe nur eine Frage des
    // Kontostands und träfe gar keine Aussage.
    //
    // ⚠️ Das Maximum (70.000 € / +3,0 = 259 €/Trend-Sekunde) ist der Punkt, an
    // dem die Anker aus CLAUDE.md §7.2 geeicht sind: Banner kann seine eigene
    // Reparatur nicht bezahlen, Feed finanziert sie mit 3,7× Marge. Der
    // schlechteste Kurs auf der untersten Stufe ist 311 und liegt damit
    // ebenfalls weit über Banner (40).
    //
    // ⚠️ Die ID bleibt 'influencer' — dieselbe Regel wie bei ki_netz /
    // „Fine Tuning": eine ID-Umbenennung bräuchte eine Migration für laufende
    // Buchungen, und das ist für einen Anzeigenamen der falsche Preis.
    // `trend` und `cost` sind ab hier das MAXIMUM und gleichzeitig die
    // Vorgabe für jeden Aufrufer, der keinen Reglerwert übergibt.
    { id: 'influencer', kind: 'trend', name: 'Creator-Beteiligung', icon: '🤳',
      cost: 70000, duration: 60,  trend: 3, unlockedBy: 'mk_partner',
      trendMin: 1, trendSteps: 5, costBase: 7000, costPerTrend: 21000,
      desc: 'Du gibst einen Teil deiner Einnahmen an deine Creator weiter — und sie bringen ihr Publikum mit. Wie hoch du beteiligst, entscheidest du bei jeder Buchung selbst.' },
    // ── Phase 3: PR, bezahlt in Metadaten statt in Geld ────────────────────
    // Der einzige wiederholbare Metadaten-Abfluss neben dem Targeting. Beide
    // ziehen aus demselben Strom — „Trend" steht damit direkt gegen „mehr Geld
    // je Werbedeal", und das ist die Entscheidung.
    //
    // Mit +4,0 ist sie die stärkste Kampagne JE PLATZ (Beteiligung +3,0). Weil
    // die PR-Plätze hart begrenzt sind, ist genau das ihr Verkaufsargument:
    // sie kauft nicht billigeren Trend, sondern MEHR Trend je Platz — dieselbe
    // Bauart wie das Werbevideo unter den Werbearten. In Phase 3 hebt sie die
    // PR-Decke damit von +6,0 auf +8,0.
    //
    // ⚠️ `metadataPerUser` statt einer festen Menge. Der Metadaten-STROM wächst
    // mit den Usern; ein fester Preis wäre ab ~1 Mio Usern gratis gewesen, und
    // dann hätte nur noch der Geldpreis gezählt — der niedrigste im Spiel.
    // Weil Preis und Strom jetzt beide linear mitwachsen, kürzt sich die
    // Plattformgröße heraus:
    //
    //     Laufanteil = Abdeckung × METADATA_PER_MODEL/WATCHTIME_CYCLE_SEC
    //                            × duration / metadataPerUser
    //
    // Die Bremse ist damit die ABDECKUNG, also das KI-Labor — bei 500k wie bei
    // 3 Mio Usern dieselbe Ansparzeit je Buchung (bei 10 % Abdeckung 160 s).
    //
    // ⚠️ `metadataPerUser` von 6 auf 1 gesenkt (2026-08-11). Sechs Metadaten je
    // User hießen bei 10 % Abdeckung 960 s Ansparen für eine Buchung, die 240 s
    // läuft — die Kampagne stand also drei Viertel der Zeit still, und beim
    // Phase-3-Einstieg mit einstelliger Abdeckung war sie faktisch unbuchbar.
    // Die Rechnung dahinter ging von 10–40 % Abdeckung aus; so weit ist das
    // KI-Labor in der Praxis erst viel später.
    //
    // ⚠️ Damit ist der Metadaten-Preis KEINE Bremse mehr, sondern nur noch eine
    // Ansparzeit: ab ~6,7 % Abdeckung läuft sie durchgehend. Der Sanity-Check
    // weiter unten („kommt nicht fertig aus dem Techtree") gilt entsprechend
    // nur noch unterhalb von ~2,5 % Abdeckung. Wer die Bremse zurückwill, hebt
    // diesen Wert wieder an — er ist weiterhin der richtige Knopf dafür.
    //
    // ⚠️ Die Bremse ist der METADATEN-Preis, nicht das Geld. Der Geldpreis lag
    // ursprünglich unter dem der Firma; seit der Preiserhöhung vom 2026-08-09
    // liegt er mit 93 gegen 81 €/Trend-s leicht darüber. Ihre Rolle trägt sie
    // trotzdem, weil die nicht am Kurs hängt, sondern am DURCHSATZ JE PLATZ
    // (+4,0 gegen +3,0). Wer sie schwächen will, hebt `metadataPerUser` —
    // nicht `cost` und nicht `trend`, sonst kippt genau diese Rolle.
    //
    // Sanity-Check gegen Selbstläufer: sie hält im Schnitt `trend × Laufanteil`
    // und muss unter der dauerhaften Firma (+1,5) liegen, solange die Abdeckung
    // klein ist. Gleichstand bei ~2,5 %, volle Kraft ab ~6,7 % Abdeckung.
    // ⚠️ ×3 auf Geld, Metadaten und Laufzeit (2026-08-06). Der Laufanteil
    // ändert sich dadurch NICHT — in der Formel oben stehen `duration` und
    // `metadataPerUser` als Bruch, und beide sind mit demselben Faktor
    // gewachsen. (Der Preis selbst ist seitdem gesenkt worden, siehe oben.)
    //
    // Was sich ändert, ist die KÖRNUNG: dreimal weniger Klicks, dafür ein
    // dreimal größerer Metadaten-Block, den man erst ansparen muss. Sie wird
    // damit das ruhige Spätspiel-Werkzeug, nicht das stärkere.
    //
    // Der Kurs wurde dabei um ~22 % schlechter,
    // weil der feste Abkling-Zuschlag (PR_DECAY_SEC/2) sich jetzt auf eine
    // dreimal längere Laufzeit verteilt. Das ist kein Fehler, sondern
    // dieselbe Regel wie bei den Reichweiten-Kampagnen: die bequemere Option
    // hat den schlechteren Kurs — gekauft wird Klickruhe, nicht Effizienz.
    { id: 'zielgruppe', kind: 'trend', name: 'Zielgruppen-Offensive', icon: '🎯',
      cost: 100000, metadataPerUser: 1, duration: 240, trend: 4, unlockedBy: 'mk_analyse',
      desc: 'Du findest die Ecken, die noch nicht da sind, und holst sie ab. Der stärkste Ausschlag je Platz — bezahlt fast nur mit Metadaten, die sonst in die Werbung geflossen wären. Wie oft du sie fahren kannst, hängt an deiner Abdeckung.' }
  ];

  // --- Werbearten ---
  // Ein Deal in der Werbeagentur läuft AD_CYCLES_MAX Zyklen und ist dann vorbei.
  // Jeder Zyklus kostet 'watchtime' (vorab abgebucht) und dauert 'duration'.
  // eur50/trend50 sind die Referenzwerte bei 50 % Intensität — siehe
  // adMoneyPerCycle() / adTrendMalus() für die Kurven dazwischen.
  //
  // Die Arten haben bewusst unterschiedliche Profile. Die Leitachse ist
  // €/Watchtime gegen €/Sekunde: wer sein Geld schnell will, bezahlt das
  // in Watchtime. Die eur50-Werte sind deshalb NICHT frei gewählt, sondern
  // ergeben sich aus watchtime × Kurs — 0,15 / 0,40 / 0,30 / 0,25 €/wt.
  // Wer eine watchtime-Zahl ändert, muss eur50 mitziehen, sonst kippt die
  // Rangfolge.
  //   Banner — schlechtester Kurs (0,15) UND langsamstes Geld. Kostet je
  //            Euro rund 30× so viel Trend wie Feed und kann seine eigene
  //            PR-Reparatur nie bezahlen (32 gegen 85 €/Trend-Sekunde).
  //            Der Starter, der sich selbst überflüssig macht.
  //   Feed   — bester Kurs (0,40) und mit 2.500 wt/s der günstigste Einstieg
  //            der drei großen. Das Arbeitspferd, solange die Farmen der
  //            Engpass sind.
  //   Search — 3× so lange Zyklen, geringster Trend-Malus, etwas mehr €/s
  //            als Feed. Zahlt das mit 1,7× Watchtime je Sekunde. Der lange
  //            Atem — ein Deal läuft 5 Minuten durch.
  //   Video  — 6,4× Feed-Durst (16.000 wt/s ≈ 128.000 User), dafür 4× Tempo
  //            beim Geld. Trend-Malus über Feed, je Euro trotzdem deutlich
  //            schonender.
  //
  // unlockedBy = Techtree-Node, die die Art freischaltet (null = von Anfang an
  // buchbar). Banner ist der Einstieg, alles andere kommt über den Werbung-Reiter.
  //
  // ── WATCHTIME-NIVEAU (Balance-Knopf) ──────────────────────────────────
  // Der Watchtime-Bedarf je Sekunde ist der eigentliche Gate-Keeper: er sagt,
  // wie viele User eine Werbeart voraussetzt, damit ihr Deal nicht abbricht
  // (bei 1 Watchtime je User je WATCHTIME_CYCLE_SEC = 8 s):
  //   Banner  1.500 wt/s →  12.000 User  (eine fast volle Huhn-Farm)
  //   Feed    2.500 wt/s →  20.000 User
  //   Search  4.167 wt/s →  33.333 User  (zwei Huhn-Farmen)
  //   Video  16.000 wt/s → 128.000 User  (acht Huhn-Farmen bzw. Aufstieg)
  // Damit hat der Watchtime-Multiplikator der Techtree-Achse wieder eine
  // Nachfrage, in die er hineinwachsen kann (siehe CLAUDE.md Sektion 9).
  //
  // ── ERTRAGS-NIVEAU (Balance-Knopf) ────────────────────────────────────
  // Der Trend-Schaden eines Deals ist prozentual (kostet also bei 1 Mio Usern
  // 1000× so viele User wie bei 1000), der Ertrag ist eine feste Zahl. Damit
  // hat jede Werbeart eine User-Obergrenze, ab der sie mehr User kostet, als
  // der Ertrag zurückkaufen kann (@25 %: Banner ~170k, Feed ~4,6 Mio,
  // Search ~11,3 Mio, Video ~11,2 Mio).
  // Der strukturelle Fix kommt später über die KI-Labor-Werbearten: mehr €
  // pro Watchtime UND deutlich größerer Watchtime-Appetit pro Deal.
  // `desc` beschreibt die Rolle der Werbeart im Spiel — nicht ihre Zahlen.
  // Die stehen daneben im Ledger, und was "je Zyklus" bedeutet, sagt der
  // Modal-Kopf einmal für alle.
  var AD_TYPES = [
    { id: 'banner', name: 'Banner',        icon: '🪧', watchtime: 15000,  duration: 10, eur50: 2250,  trend50: 5,   unlockedBy: null,
      desc: 'Nervig und schlecht bezahlt: aus derselben Watchtime holt eine Feed-Werbung fast das Dreifache heraus, und jeden Euro bezahlst du hier mit rund dreißigmal so viel Trend. Trotzdem dein erstes Geld — mehr gibt es zu Beginn nicht.' },
    { id: 'feed',   name: 'Feed-Werbung',  icon: '📰', watchtime: 50000,  duration: 20, eur50: 20000, trend50: 1.5, unlockedBy: 'wb_display',
      desc: 'Das Arbeitspferd: bestes Geld je Watchtime und der günstigste Einstieg der drei großen Arten. Die erste Wahl, solange deine Farmen der Engpass sind.' },
    { id: 'search', name: 'Search-Ad',     icon: '🔍', watchtime: 250000, duration: 60, eur50: 75000, trend50: 1,   unlockedBy: 'wb_search',
      desc: 'Der lange Atem: ein Zyklus läuft dreimal so lang wie beim Feed, kostet dabei am wenigsten Trend und bringt sogar etwas mehr Geld je Sekunde. Bezahlt wird das mit deutlich mehr Watchtime.' },
    { id: 'video',  name: 'Werbevideo',    icon: '🎬', watchtime: 400000, duration: 25, eur50: 100000, trend50: 2.5, unlockedBy: 'wb_video',
      desc: 'Die Geldmaschine: viermal so viel Geld je Sekunde wie die Feed-Werbung. Bezahlt wird das mit dem sechsfachen Watchtime-Hunger und mehr Trend-Schaden — je Euro bleibt sie trotzdem schonender als Feed.' }
  ];
  var AD_CYCLES_MAX  = 5;     // Zyklen pro Deal, danach ist der Deal vorbei
  var AD_INTENSITY_MIN = 0.01;
  var AD_INTENSITY_MAX = 0.50;

  // ── Volumen (ab Phase 2) und Targeting (ab Phase 3) ───────────────────
  //
  // Der Volumen-Knopf hat vier Stufen. Die ersten beiden sind ABSOLUT
  // (type.watchtime), die zwei anderen sind ANTEILE DES LAGERS. Das ist
  // dasselbe Paar wie überall sonst im Spiel — Stadtaktion gegen
  // Zielgruppen-Offensive, Clustering gegen Fine Tuning: die flache Stufe ist
  // der Einstieg, die prozentuale trägt dauerhaft.
  //
  // ── WARUM ES EINE ZWEITE ABSOLUTE STUFE GIBT ──────────────────────────
  // Zwischen „fest" und „Anteil" klaffte die längste Durststrecke des Spiels.
  // Ein Deal frisst fest 16.000 wt/s (Video), die Produktion wächst dagegen
  // mit den Usern; eine Agentur deckt damit 128.000 User, und mehr Agenturen
  // kosten linear Trend. Bei einem realistischen Budget von 3–5 Agenturen ist
  // bei ~600.000 Usern Schluss — ab da wächst der Watchtime-Berg, und
  // aufgelöst wurde er erst von wb_adserver tief in Phase 3.
  //
  // „fest ×4" liefert die vierfache Menge zum vierfachen Geld bei
  // UNVERÄNDERTEM Trend-Malus und schiebt die Wand auf ~2 Mio User. Das ist
  // bewusst nur eine Verschiebung: absolut skaliert nie mit (siehe unten),
  // der strukturelle Fix bleibt der Anteil. Für Phase 2 reicht es.
  //
  // ⚠️ Sie ist trotzdem KEINE strikt bessere Stufe, und das trägt sie: ein
  // Zyklus braucht die vierfache Menge im Lager, sonst bricht der Deal ab.
  // Auf einer kleinen Plattform ist „fest" weiter die richtige Wahl — die
  // Stufe gattet sich damit selbst und braucht keine zusätzliche Schranke.
  //
  // ⚠️ Stufe 1 MUSS absolut bleiben. Sie ist die Voreinstellung des GANZEN
  // Spiels, auch solange die Knopfreihe gar nicht angezeigt wird.
  // Prozentual bekäme ein Banner bei 100.000 Lager statt 15.000 nur noch
  // 300 Watchtime, und das Frühspiel bräche zusammen. Der Gleichstand liegt
  // bei AD_PCT_ANCHOR — darunter ist Stufe 1 die stärkere Wahl, darüber
  // schafft sie sich selbst ab.
  //
  // ── WARUM ANTEILIG ────────────────────────────────────────────────────
  // Absolut skaliert der Verbrauch nicht mit der Plattform mit. Bei 3 Mio
  // Usern produzieren die Farmen 1,1 Mio wt/s; ein Video-Deal auf der alten
  // Stufe ×10 fraß 160.000. Man hätte 69 gleichzeitige Deals gebraucht =
  // −43 Trend bei einem Budget von 20. Höchstens ~30 % der Watchtime waren
  // überhaupt verwertbar, der Rest MUSSTE liegenbleiben — das war die
  // Ursache des Watchtime-Bergs, nicht ein Fehler des Spielers.
  //
  // Anteilig verschwindet das, ohne dass am Trend irgendetwas geändert wird:
  // bei GLEICHEM Malus (Video, 25 %, oberste Stufe) stehen 20.000 €/s gegen
  // 3,2 Mio €/s. Faktor 160. Ein Trend-Rabatt obendrauf wäre ein zweiter
  // Hebel auf einem, der schon reicht — siehe die Warnung unten.
  //
  // ── DIE STUFE IST KEIN MACHTREGLER ────────────────────────────────────
  // Läuft dauerhaft ein Deal, pendelt sich das Lager bei R·d/Anteil ein, und
  // dort gilt: Einkommen = Produktion × Kurs — UNABHÄNGIG von der Stufe. Eine
  // höhere Stufe bringt also dasselbe Geld bei linear mehr Trend, nur mit
  // kleinerem Puffer. Im Dauerbetrieb ist die NIEDRIGSTE Anteils-Stufe strikt
  // die beste; die hohen sind das Werkzeug, um einen Rückstau abzubauen
  // (nach einer Nacht, nach einer Pause, oder wie hier nach einer Phase ohne
  // brauchbare Nachfrage).
  //
  // Damit erledigt sich die alte Sorge, das Volumen könnte den
  // Intensitäts-Regler ersetzen: ein „immer auf Maximum" gibt es nicht mehr.
  //
  // ⚠️ `mult` skaliert das AUSGELIEFERTE Volumen, `trendMult` den Malus. Bis
  // zur Stufe „fest ×4" war das dieselbe Zahl. Getrennt sind sie, weil die
  // beiden Hälften der Leiter verschiedene Eigenschaften brauchen:
  //
  //   Anteils-Stufen — hier ist das Einkommen im Gleichgewicht stufenUNabhängig
  //                    (Produktion × Kurs, siehe oben). Ein Trend-Rabatt machte
  //                    „Maximum" damit sofort strikt richtig und zerstörte genau
  //                    diese Eigenschaft → trendMult MUSS gleich mult bleiben.
  //   fest ×4        — hier skaliert das Einkommen sehr wohl mit mult. Ein
  //                    proportionaler Malus wäre exakt „vier parallele Deals"
  //                    und damit keine Stufe, sondern nur Klick-Ersparnis.
  //
  // ⚠️ `step` ist eine STABILE SPIELSTAND-ID, keine Rangfolge. Die Reihenfolge
  // der Leiter steht in der ARRAY-REIHENFOLGE (adStepIndex). Dadurch kostet
  // eine neue Stufe in der Mitte keine Umnummerierung — und damit keine
  // Migration, die alte Deals raten muss. Genau daran ist die alte VOL_MAP
  // gescheitert (siehe storage.migrate).
  //
  // `label` beschriftet den Knopf. Er steht ÜBER allen vier Werbekarten und
  // gilt für alle gleichzeitig — ein Prozentwert wäre dort für drei von vier
  // Arten falsch. Die konkrete Zahl trägt die Karte darunter.
  var AD_VOLUME_STEPS = [
    { step: 1, pct: false, mult: 1, trendMult: 1, label: 'fest',      unlockedBy: null              },
    { step: 5, pct: false, mult: 4, trendMult: 1, label: 'fest ×4',   unlockedBy: 'wb_adopt'        },
    { step: 2, pct: true,  mult: 1, trendMult: 1, label: 'Anteil',    unlockedBy: 'wb_adserver'     },
    { step: 3, pct: true,  mult: 3, trendMult: 3, label: 'Anteil ×3', unlockedBy: 'wb_programmatic' }
  ];

  // Das Lager, bei dem eine Anteils-Stufe genau so viel frisst wie Stufe 1.
  //
  // ⚠️ Der Anteil je Werbeart wird daraus ABGELEITET (type.watchtime /
  // AD_PCT_ANCHOR) und steht bewusst nicht als eigenes Feld an den Arten:
  //     Banner 0,3 %  ·  Feed 1 %  ·  Search 5 %  ·  Video 8 %
  // Dadurch behalten die vier Arten ihre heutigen Verhältnisse zueinander
  // exakt, und wer an type.watchtime dreht, zieht den Anteil automatisch mit.
  //
  // ⚠️ EIN EINHEITLICHER PROZENTSATZ FÜR ALLE WÜRDE DIE ARTEN EINEBNEN.
  // Der Ertrag hinge dann nur noch an Kurs und Dauer, und Feed gewänne auf
  // BEIDEN Achsen (1.000 €/s je Mio Lager gegen 500 bei Video, und dabei
  // 3,3× besseres € je Trend-Punkt). Search, Video und Banner hätten keine
  // Rolle mehr.
  var AD_PCT_ANCHOR = 5000000;

  // TARGETING ist ein Schalter je Deal, kein Regler — drei Regler in einem
  // Modal sind einer zu viel. Es kostet Metadaten je Watchtime und hebt dafür
  // das Geld, OHNE zusätzlichen Trend zu kosten. Damit ist es das einzige
  // Werkzeug im Spiel, das € JE TREND-PUNKT verbessert: dasselbe Geld mit
  // weniger Deals, also mit weniger Rufschaden.
  //
  // ⚠️ TARGETING_META_PER_WT und METADATA_PER_MODEL sind ein PAAR und müssen
  // im selben Faktor bewegt werden. Der Grund ist der gemeinsame 8-s-Takt:
  // ein User macht 1 Watchtime je Zyklus, ein Modell METADATA_PER_MODEL
  // Metadaten je Zyklus. Bei Gleichstand gilt dadurch wörtlich
  //
  //     Abdeckung = Anteil deiner Watchtime, der personalisiert laufen kann.
  //
  // Das ist die Zahl, die im KI-Labor steht und die der Spieler beim Buchen
  // wiederfindet. Wer nur einen der beiden Werte anfasst, macht die
  // Abdeckungs-Prozentzeile zu einer Zahl ohne Bedeutung.
  //
  // ⚠️ TARGETING_REVENUE_MULT muss ÜBER 2 liegen. Kapazität, die Modelle
  // trägt, trägt keine User: bei Abdeckung c steht (1 + c(X−1)) / (1 + c)
  // gegen 1, und das ist bei X = 2 exakt break-even. 2 ist der Nullpunkt,
  // nicht die Belohnung. Großzügig wird der Kurs erst dort, wo der Trend
  // die Bremse ist statt der Kapazität — also genau in der Lage, für die
  // Phase 3 gebaut ist.
  var TARGETING_META_PER_WT   = 0.5;   // == METADATA_PER_MODEL, siehe oben
  var TARGETING_REVENUE_MULT  = 2.5;

  // ── KRÜMMUNG DES TREND-MALUS (Balance-Knopf) ──────────────────────────
  // Der Malus ist eine Potenzkurve, verankert am ARBEITSPUNKT — nicht am
  // Maximum. Das ist der ganze Kniff: bei 25 % liegt der Malus fest auf
  // trend50/4, egal welcher Exponent eingestellt ist. Der Exponent dreht
  // deshalb ausschließlich daran, wie teuer das ÜBERSTEUERN darüber wird,
  // und lässt den Alltagsbereich in Ruhe.
  //
  // Praktische Folge: die ganzen abgeleiteten Preis-Anker aus CLAUDE.md
  // §6/§7.2 (€ je Trend-Sekunde bei 25 %, PR-Marge, "Banner kann seine
  // eigene Reparatur nie bezahlen") gelten unverändert weiter. Ohne diesen
  // Anker müsste bei jeder Kurvenänderung die halbe Werbe- und PR-Ökonomie
  // neu gerechnet werden.
  //
  // AD_TREND_EXPONENT = 2 reproduziert exakt die alte Formel
  // trend50 × (i/0,5)² — nachrechenbar, weil 0,25 × (i/0,25)² = 4·i².
  // Malus am Maximum (50 %), als Vielfaches von trend50:
  //     n = 2  →  1,0×   (alt: 50 % tat nicht weh, Dauerbetrieb auf Anschlag)
  //     n = 3  →  2,0×   ← aktuell
  //     n = 4  →  4,0×
  //
  // ⚠️ Ein steilerer Exponent verschiebt das Optimum nach UNTEN, er baut
  // keinen Korridor. Bei n = 3 ist 10 % gegenüber 50 % 25× trend-effizienter
  // (bei n = 2 nur 5×). Was die niedrige Intensität überhaupt bestraft, ist
  // allein die Watchtime: sie kostet je Zyklus dasselbe, egal wie viel Geld
  // dabei herauskommt. Solange Watchtime knapp ist, trägt das. Wird sie im
  // Spätspiel zum Überschuss (bekanntes Problem, CLAUDE.md §9), fällt der
  // Gegenspieler weg — dann ist der Hebel die Watchtime-Seite, nicht dieser
  // Exponent.
  var AD_INTENSITY_WORK  = 0.25;  // Arbeitspunkt, an dem die Kurve verankert ist
  var AD_TREND_EXPONENT  = 3;     // Krümmung darüber (2 = altes Verhalten)


  var FARM_CAPACITY_ANIMALS      = 8;   // max sichtbare Tiere / Slot-Anzahl
  var WATCHTIME_STACK_MAX        = 5;   // max Stapel
  var WATCHTIME_CYCLE_SEC        = 8;   // Zeit für 1 Stapel
  var WATCHTIME_PER_USER_PER_CYCLE = 1; // 1 Watchtime pro User pro Zyklus

  // Wie weit eine Abwesenheit nachgerechnet wird (RT.actions.offlineCatchUp).
  //
  // Vorher gab es diese Zahl nicht: der Aufholpass war an die Stapelgrenzen
  // gefesselt und brachte je System 40 s (Watchtime), 60 s (Trend) bzw. einen
  // Deal weit. Wer über Nacht zumachte, kam auf eine halbe Minute Ertrag
  // zurück — der Rückkomm-Moment, von dem ein Idle-Spiel lebt, fand nicht statt.
  //
  // ⚠️ Die Stapelgrenzen bleiben davon UNBERÜHRT. „Max 5 Stapel, dann steht die
  // Produktion" ist eine Live-Balance-Regel (sie erzwingt das Ernten); offline
  // kann niemand ernten, deshalb wird der Überschuss automatisch abgeholt und
  // landet direkt im Lager bzw. bei den Usern. Wer die Stapelgrenze anhebt,
  // ändert das Spiel — wer diese Zahl anhebt, nur die Rückkehr.
  //
  // ⚠️ Der Wert wirkt am stärksten auf Dauerbetrieb-Deals: offline produzierte
  // Watchtime landet jetzt wirklich im Lager und speist die Agenturen. Das ist
  // die Stelle, an der ein deutlich größeres Fenster zuerst kippen würde.
  var OFFLINE_CATCHUP_SEC        = 120;

  // --- Phase 3: User-Modelle & Metadaten ---
  // Ein User-Modell ist KEIN Bewohner eines Slots, sondern schlicht
  // 1 Server-Kapazität — genau wie ein User. Es hat damit auch keine Tierart
  // und keine Stufe.
  //
  // ⚠️ Das ist der Kern des Entwurfs, und die Begründung ist mechanisch:
  // hätte ein Modell eine Tierstufe, würde beim Farm-Ausbau aus einem
  // Huhn-Modell stillschweigend ein Gans-Modell — eine Kapazitäts- und
  // Ertragsänderung, die niemand ausgelöst hat. Als reine Kapazitätszahl
  // überlebt es jedes Upgrade unverändert.
  //
  // Sichtbar werden Modelle trotzdem: eine Farm, in der welche liegen, zeigt
  // das Modell-Sprite ihrer Stufe (siehe farmSlots) — dieselbe Regel wie bei
  // den Code-Kisten, die auch nur eine Kapazitätszahl sind.
  var METADATA_STACK_MAX  = 5;
  // Metadaten laufen auf DEMSELBEN Takt wie die Watchtime (WATCHTIME_CYCLE_SEC).
  // Beide werden mit einem Klick geerntet und teilen sich deshalb auch den
  // Stapel-Zähler der Farm — zwei Uhren auf einem Gebäude wären nur eine
  // zweite Buchhaltung ohne zweite Entscheidung.
  var METADATA_PER_MODEL  = 0.5;  // je Modell und Zyklus
  var CONV_CYCLES_MAX     = 5;    // Zyklen je gebuchter Umwandlung

  // Umwandlungsarten im KI-Labor — gebaut wie AD_TYPES: eine Buchung läuft
  // CONV_CYCLES_MAX Zyklen, jeder Zyklus wird vorab mit Watchtime bezahlt und
  // legt seine Modelle zum Einsammeln bereit. `unlockedBy` zeigt auf eine Node
  // im KI-Reiter; gesperrte Arten blendet das Modal aus (wie die Werbeagentur).
  //
  // ── EINE FLACHE ART, EINE MITWACHSENDE ────────────────────────────────
  // Jede Art liefert ihre Modelle je Zyklus über GENAU EINS von beiden:
  //   `models`   — feste Stückzahl, unabhängig von der Plattformgröße
  //   `coverage` — Anteil der aktuellen User
  //
  // Das ist dasselbe Paar wie Banner gegen Feed/Search/Video (CLAUDE.md §6)
  // und wie die Reichweiten-Kampagnen gegen die PR-Kampagnen (§7.1/§7.2):
  // die flache Art ist der Einstieg, der sich selbst abschafft, die
  // prozentuale trägt dauerhaft.
  //
  // Clustering ist damit bei 500.000 Usern (Phase-3-Einstieg) ein Drittel des
  // Fine Tunings und bei 1 Mio ein Sechstel. Gleichstand läge bei 150.000
  // Usern, also unterhalb des Einstiegs — die prozentuale Art ist überall ein
  // Upgrade, es gibt kein Fenster, in dem die Reihenfolge kippt.
  //
  // ⚠️ Die Obergrenze für `models` ist hart: deutlich unter dem, was
  // `coverage` beim Phase-3-Einstieg liefert (0,02 × 500.000 = 10.000).
  // Darüber wäre Fine Tuning beim ersten Kontakt kein Upgrade, sondern ein
  // Rückschritt. Nach unten begrenzt es die Sichtbarkeit — eine Buchung soll
  // eine Zahl liefern, die man in der Bar wiederfindet.
  //
  // ⚠️ Ein früherer Entwurf hatte BEIDE Arten prozentual (10 % / 20 %) und
  // dazu den Deckel „nicht mehr Modelle als User". Eine einzige Buchung der
  // prozentualen Art deckte damit die ganze Plattform ab: die Mechanik war ein
  // Fortschrittsbalken mit Ende, kein Farm-Loop. Wer hier wieder zwei
  // Prozentsätze einträgt, baut das nach.
  //
  // Fine Tuning kostet konstant 6,4 % der Plattform-Watchtime — bei 500.000
  // wie bei 5 Mio Usern (0,02 × 10 wt ÷ 25 s gegen 0,125 wt/s je User). Es
  // wird dadurch nie zum Rundungsfehler und nie zum Selbstläufer.
  //
  // `wtPerModel` ist die Leitgröße zwischen den Arten — eine bessere Art muss
  // diesen Wert SENKEN. Die Kosten je Zyklus ergeben sich daraus:
  //   Modelle je Zyklus   = (models | User × coverage) × modelYieldMult
  //   Watchtime je Zyklus = Modelle × wtPerModel
  var CONV_TYPES = [
    { id: 'cluster', icon: '🧩', name: 'Clustering',
      models: 3000, coverage: null, wtPerModel: 20, duration: 20, unlockedBy: null,
      desc: 'Sortiert User in grobe Gruppen — das erste, was eine KI kann. ' +
            'Feste Stückzahl: wächst nicht mit deiner Plattform mit.' },
    // ⚠️ Die interne ID bleibt 'netz' bzw. 'ki_netz', obwohl beide seit dem
    // Umbenennen „Fine Tuning" heißen. Eine ID-Umbenennung bräuchte eine
    // Migration in storage.migrate() für laufende Umwandlungen und fertige
    // Nodes — für einen reinen Anzeigenamen ist das der falsche Preis.
    { id: 'netz', icon: '🎚️', name: 'Fine Tuning',
      models: null, coverage: 0.02, wtPerModel: 10, duration: 25, unlockedBy: 'ki_netz',
      desc: 'Schleift ein vorhandenes Modell auf deine User nach, statt bei null ' +
            'anzufangen — arbeitet an einem Anteil deiner User und wächst deshalb mit.' }
  ];

  // Marktplatz-Provision (Node `marketplace`, Phase 3): ein Teil dessen, was
  // die Creator-Beteiligung kostet, kommt zurück. Die Creator bekommen weiter
  // den vollen Betrag — die Trend-Wirkung der Kampagne bleibt unverändert, nur
  // die NETTO-Kosten sinken. Die Node macht sie also nicht stärker, sondern
  // billiger (259 → 207 €/Trend-Sekunde am Reglerende).
  //
  // ⚠️ Sie hängt am TREND: bei 0 kommt nichts zurück, ab
  // MARKETPLACE_TREND_FULL die vollen 20 %. Ein Marktplatz zahlt nur dort, wo
  // die Community funktioniert — die einzige Stelle im Spiel, an der Trend
  // unmittelbar Geld wert ist.
  //
  // ⚠️ Die Rückkopplung (mehr Trend → billigere Beteiligung → mehr Trend) ist
  // bei 20 % gedeckelt und wirkt ausschließlich auf die KOSTEN. Wer den Satz
  // hebt, muss gegen den Anker aus CLAUDE.md §7.2 prüfen: Banner (40 €/Trend-s)
  // darf seine eigene Reparatur nie bezahlen können, und der billigste Kurs
  // der Beteiligung ist mit voller Provision 207.
  var MARKETPLACE_CUT        = 0.20;
  var MARKETPLACE_TREND_FULL = 10;

  // --- Trend ---
  // Der Trend ist die User-Wachstumsrate in Prozentpunkten: Trend +3 heißt,
  // dass pro Zyklus 3 % der aktuellen User dazukommen.
  //
  // Er ist immer die Summe aus Grundinteresse + allen aktiven Modifikatoren
  // in current.trendMods — dadurch bleibt die Aufschlüsselung im Info-Modal
  // per Konstruktion korrekt.
  //
  // ── Jeder Modifikator ist BEFRISTET ────────────────────────────────────
  // Nichts wirkt dauerhaft auf den Trend. Ein Modifikator hat zwei Phasen:
  //   1. Halten  — voller Wert bis holdUntil
  //   2. Abklingen — der Betrag läuft gegen 0, danach fliegt der Modifikator
  //                  raus. Tempo: TREND_DECAY_PER_SEC für positive,
  //                  TREND_DECAY_NEG_PER_SEC (×4) für negative — siehe
  //                  trendDecayFor()
  // Gesetzt werden sie:
  //   Werbedeal  — sofort beim Buchen, gehalten solange der Deal läuft
  //                + TREND_HOLD_AD_SEC danach
  //   Techtree   — beim Einsammeln der fertigen Node, gehalten
  //                TREND_HOLD_NODE_SEC
  // Der Trend beschreibt damit, was du GERADE TUST — nicht, was du besitzt.
  // ── ZYKLUS & DECAY sind die zwei Tempo-Knöpfe des GESAMTEN Wachstums ──
  // Wachstum entsteht praktisch nur hier: Kampagnen sind absolut und ab
  // ~50.000 Usern Rundungsfehler. Wer an einem der beiden dreht, dreht am
  // Spieltempo als Ganzes — nicht an einer einzelnen Mechanik.
  //
  // TREND_CYCLE_SEC skaliert das Wachstum PROPORTIONAL, ohne eine einzige
  // Balance-Relation zu verschieben: Node-Werte, PR-Preise und Werbe-Malus
  // behalten ihren Wert zueinander exakt, es kommen nur mehr Schläge pro
  // Minute. Bei Trend +6 macht das ×1,26/min (15 s) gegen ×1,34/min (12 s)
  // — über 20 Minuten der Unterschied zwischen 105.000 und 340.000 Usern.
  // Deshalb 15 → 12: Messung aus einer 25-min-Session lag bei ~350.000
  // Usern, Ziel waren 500.000–700.000 nach 20 Minuten.
  //
  // ⚠️ TREND_STACK_MAX bleibt bei 5 — das Idle-Fenster schrumpft dadurch
  // von 75 s auf 60 s. Bewusst so: der Stapel ist die Obergrenze fürs
  // Wegklicken, nicht der Wachstums-Knopf.
  var TREND_CYCLE_SEC     = 12;  // ein Zyklus = ein Stapel
  var TREND_STACK_MAX     = 5;   // danach steht die Produktion still
  var TREND_MIN           = -20;
  // ⚠️ 20 → 40 am 2026-08-06, zusammen mit dem Netzwerkeffekt. Der Grund ist
  // NICHT „mehr Wachstum", sondern eine Inversion: bei 20 lag ein sauber
  // gespielter Spätspiel-Aufbau (Netzwerkeffekt + 5 PR-Plätze + Vertrauens-
  // Features) bei ~30 und damit am Anschlag. Am Anschlag kosten Dark Patterns
  // aber GAR NICHTS — der Datenkraken-Spieler und der saubere Spieler landen
  // auf demselben Trend, und die zentrale Entscheidung des Baums verpufft
  // lautlos, ausgerechnet im Spätspiel. Bei 40 bleiben ~10 Kopffreiheit
  // (Rechnung in CLAUDE.md §7.2).
  //
  // ⚠️ Wer den Cap wieder senkt, muss zuerst NETWORK_K_BASE und die
  // networkK-Werte der Vertrauens-Features mitsenken — sonst kommt genau
  // diese Inversion zurück.
  var TREND_MAX           = 40;
  var TREND_SHIELD_SEC    = 45;  // Schadensbegrenzung halbiert so lange den Abfluss
  var TREND_SHIELD_CD_SEC = 60;  // … und ist erst danach wieder klickbar

  // 0,1 Punkte je 20 s — Abkling-Tempo. Hebt den DURCHSCHNITTS-Trend, ohne
  // eine einzige angezeigte Zahl zu ändern: die Schlagzeilen-Werte im
  // Techtree bleiben gleich, nur die Fläche unter der Kurve wächst.
  //
  // ⚠️ Der Schwanz ist QUADRATISCH im Wert (v²/(2·decay)), große Boni
  // profitieren also überproportional. Halbierung 0,01 → 0,005:
  //   +0,5-Node    55 →   80 Trend-Sekunden  (×1,45)
  //   +2,0-Node   320 →  520                 (×1,63)
  //   +6,0-Node  2160 → 3960                 (×1,83)   ← Videos
  // Ein +6,0-Bonus braucht danach 1.200 s zum Ausklingen — das ist eine
  // ganze Session. Wer weiter halbiert, macht Node-Boni de facto dauerhaft
  // und hebelt die Asymmetrie aus Sektion 8 aus ("Gutes nutzt sich ab").
  //
  // Gilt für POSITIVE Modifikatoren (Node-Boni, PR-Kampagnen).
  var TREND_DECAY_PER_SEC = 0.005;

  // Negative Modifikatoren (= Werbe-Malus) klingen VIERFACH schneller ab.
  // Die Begründung steht bei trendDecayFor() — kurz: seit der kubischen
  // Malus-Kurve ist der Schwanz am oberen Reglerende so lang geworden, dass
  // eine Fehlentscheidung nicht mehr korrigierbar war.
  // ⚠️ Nicht über ×9 (0,045) hinausgehen, ohne die Banner-Aussage aus
  // CLAUDE.md §6/§7.2 nachzurechnen.
  var TREND_DECAY_NEG_PER_SEC = 0.02;
  var TREND_HOLD_NODE_SEC = 60;   // Techtree-Bonus hält so lange voll an
  var TREND_HOLD_AD_SEC   = 30;   // Werbe-Malus hält so lange über das Deal-Ende hinaus

  // PR-Kampagnen klingen NICHT über die Rate oben ab, sondern in einer FESTEN
  // Zeit — unabhängig vom Wert (decay = wert / PR_DECAY_SEC, siehe
  // startCampaign). Damit gilt für sie die einfache Formel
  //     Trend-Sekunden = wert × (dauer + PR_DECAY_SEC/2)
  // und der Schwanz ist ein Zuschlag von 10 s statt des halben Produkts.
  //
  // WARUM PR eine Sonderregel bekommt: bei der globalen Rate trug der Schwanz
  // 87 % der Wirkung eines Influencers (135 Trend-s Laufzeit gegen 900 im
  // Ausklang). Weil eine Neubuchung den Platz ERSETZT (prSlotModId), war
  // sofortiges Nachbuchen dadurch 7,7× teurer je Trend-Sekunde als Abwarten —
  // eine Strafe, die auf keiner Karte stand. Jetzt ist die Kampagne genau das,
  // was sie verspricht: ein Vertrag, der läuft und dann endet.
  //
  // ⚠️ NICHT an TREND_DECAY_PER_SEC drehen, um dasselbe zu erreichen. Daran
  // hängen die Techtree-Boni, und deren Wirkung IST der lange Schwanz (Videos
  // +12,0 = 15.120 Trend-Sekunden, davon 14.400 im Ausklang). Der Unterschied
  // ist auch erzählerisch richtig: ein Feature hallt nach ("das Gespräch
  // verebbt"), ein bezahlter Vertrag endet.
  // ⚠️ 20 → 60 am 2026-08-06. Grund ist reines Spielgefühl: bei 20 s war der
  // Modifikator sieben Sekunden nach Laufzeitende schon auf zwei Dritteln und
  // nach zwanzig auf null — man MUSSTE sofort nachklicken, sonst war die
  // Wirkung weg. Bei 60 s steht eine Creator-Beteiligung (+3,0) nach 20 s noch auf
  // +2,0 und nach 40 s auf +1,0. Das ist ein Fenster statt einer Kante.
  //
  // ⚠️ Damit verletzt PR die Faustregel „Abklingzeit ≤ ¼ der Laufzeit"
  // (Creator-Beteiligung: 60 s Laufzeit gegen 60 s Ausklang). Das ist geprüft und
  // gewollt. Die Regel war gegen die ALTE Falle geeicht, als PR über die
  // globale Rate ablief: 600 s Ausklang bei 60 s Laufzeit, der Schwanz trug
  // 87 % der Wirkung, und weil eine Neubuchung den Platz ERSETZT, war
  // pünktliches Nachbuchen 7,7× teurer je Trend-Sekunde als abwarten — eine
  // Strafe, die auf keiner Karte stand. Bei 60 s sind es noch 25 %:
  //
  //     sofort nachbuchen : 180 Trend-s je 60 s
  //     erst auslaufen    : 270 Trend-s je 120 s  → 25 % besserer Kurs
  //
  // Das ist ein Schubser („warte kurz, dann ist es günstiger"), keine Falle.
  // Wer den Wert weiter anhebt, muss diese Rechnung erneut machen.
  //
  // ⚠️ Der PR-PLATZ wird davon nicht blockiert: prSlotsUsed() zählt nur
  // Kampagnen mit state.active, und das räumt der Tick am Laufzeitende ab.
  // Ein längerer Ausklang kostet also keine Parallelität.
  var PR_DECAY_SEC = 60;

  // Grundinteresse: der Startbonus, den eine neue Plattform geschenkt bekommt.
  // Er verebbt linear über TREND_BASE_FADE_SEC Sekunden Phase-2-Spielzeit.
  // Danach ist der Trend ohne eigenes Zutun 0 — Wachstum muss man sich holen.
  var TREND_BASE_START    = 3;
  var TREND_BASE_FADE_SEC = 300;

  // ── NETZWERKEFFEKT ────────────────────────────────────────────────────
  // „Da sind ja alle." Der einzige Trend-Posten, der aus der Plattform SELBST
  // kommt statt aus einem Kauf oder einem Feature — und der einzige, der von
  // allein steigt. Bis er dazukam, war Größe im Trend-System schlicht nicht
  // vertreten: Features gaben Strohfeuer, PR war gekauft, Dark Patterns zogen
  // runter. Dass eine große Plattform allein deshalb attraktiv ist, weil sie
  // groß ist, stand nirgends — dabei ist das die zentrale Aussage über soziale
  // Netzwerke überhaupt.
  //
  //     Netzwerkeffekt = k × log10(User / NETWORK_U0) × Sättigung
  //
  // ⚠️ LOGARITHMISCH, nicht linear. Jede Verzehnfachung gibt dieselbe Portion.
  // Linear wäre bei 8 Mrd Usern jede andere Trend-Quelle Staub, und die Kurve
  // liefe dem Spieler weg, statt ihn zu belohnen.
  //
  // ⚠️ NETWORK_U0 = 10.000 ist mit Bedacht gewählt: dort steht der Posten auf
  // 0. Phase 0/1 (bis 1.000 User) bleibt dadurch vollständig unberührt, und
  // der Effekt setzt genau dann ein, wenn Phase 2 anfängt zu tragen.
  //
  // ⚠️ NETWORK_CAP_L = 5 ist der GIPFEL bei 1 Mrd Usern (log10(1e9/1e4) = 5),
  // nicht mehr ein Deckel. Bis dahin steigt der Effekt, danach beginnt die
  // SÄTTIGUNG: „da sind ja alle" hört auf zu ziehen, wenn wirklich alle da
  // sind. Bei NETWORK_FULL = 3 Mrd ist er auf 0 — nicht weil die Plattform
  // unattraktiv wäre, sondern weil niemand mehr übrig ist, den sie anziehen
  // könnte. Genau das ist der Netzwerkeffekt als WACHSTUMSrate gelesen.
  //
  // ⚠️ Die Sättigungskurve ist quadratisch und nicht linear, damit sie am
  // Gipfel WAAGERECHT ist (Ableitung 0 bei 1 Mrd). Linear gäbe es dort einen
  // Knick: eben noch +2,0 je Verzehnfachung, im nächsten Moment fallend. So
  // flacht sie ab, kippt und wird erst zum Ende hin richtig steil:
  //
  //   1,0 Mrd → ×1,00 (+10,0)    2,0 Mrd → ×0,75 (+7,5)
  //   1,5 Mrd → ×0,94 (+9,4)     2,5 Mrd → ×0,44 (+4,4)    3,0 Mrd → 0
  //
  // ⚠️ Über 3 Mrd bleibt er bei 0 und wird NICHT negativ. Sonst wäre die
  // Weltbevölkerung eine Wand, gegen die kein PR-Platz und kein Feature mehr
  // ankommt; so ist sie Gegenwind. Der Spieler kann darüber hinauswachsen, es
  // kostet ihn nur den größten Trend-Posten, den er hatte.
  //
  // ⚠️ Damit hat das Spätspiel ein GLEICHGEWICHT statt einer Decke: wächst die
  // Plattform in die Sättigung, sinkt ihre Wachstumsrate, bis der Netto-Trend
  // 0 erreicht. Schrumpft sie, steigt er wieder. Das ist beabsichtigt und die
  // Stelle, an der aus „mehr User" endlich wieder eine Entscheidung wird.
  //
  // ⚠️ Der Boden bei 0 ist wichtig. Ohne ihn zöge eine schrumpfende Plattform
  // sich selbst ins Minus — der Posten würde aus einer Belohnung eine zweite
  // Strafe. Die Rückkopplung nach unten (weniger User → kleinerer Effekt →
  // noch weniger User) bleibt auch so bestehen; sie soll es, Plattformen
  // kippen wirklich so. Sie soll nur nicht unter null weiterlaufen.
  var NETWORK_U0      = 10000;  // hier steht der Effekt auf 0
  var NETWORK_K_BASE  = 2.0;    // Trend je Verzehnfachung, ohne Vertrauens-Features
  var NETWORK_CAP_L   = 5;      // Gipfel: 5 Dekaden über U0 = 1 Mrd User
  var NETWORK_PEAK    = NETWORK_U0 * Math.pow(10, NETWORK_CAP_L);  // 1 Mrd
  var NETWORK_FULL    = 3000000000;  // hier ist die Welt voll, der Effekt auf 0
  // Die Sprossen der Leiter im Trend-Modal. Bewusst hier und nicht in der UI:
  // die Zahlen darauf sind gerechnete Spielwerte, keine Dekoration.
  //
  // ⚠️ Die beiden Sprossen NACH dem Gipfel gehören dazu, obwohl sie fallende
  // Zahlen zeigen. Eine Leiter, die bei 1 Mrd aufhört, verschweigt genau die
  // eine Sache, die der Spieler vorher wissen muss — dass Wachstum irgendwann
  // gegen sich selbst arbeitet. Sie ist weit weg und deshalb keine Drohung,
  // sondern ein Horizont.
  // ⚠️ 500.000 und 10 Mio sind am 2026-08-09 herausgenommen worden — acht
  // Sprossen waren im Trend-Modal zu viele Kacheln. Die restlichen sechs
  // reichen für dieselbe Aussage (steigt · Gipfel · sinkt wieder).
  var NETWORK_LADDER  = [100000, 1000000, 100000000,
                         1000000000, 2000000000, 3000000000];

  var GRID_SIZE = 5;

  // Grid-Erweiterung: rechtwinklig angrenzende Felder sind einzeln kaufbar.
  // Der Preis steigt mit jedem gekauften Feld, in drei Stufen.
  //
  // Die Basis muss DEUTLICH unter dem Farmpreis liegen: eine 2×2-Farm braucht
  // vier Felder, das Land ist also der vierfache Posten. Bei 10.000 € kostete
  // der Boden unter einer 5.000-€-Farm 43.100 € — damit war Breite nie eine
  // echte Option. Bei 3.000 € sind es 12.931 €, gut zweieinhalb Farmpreise.
  //
  // Maßstab ist der Upgrade-Kurs von 0,50 €/Kapazität (Huhn→Gans): ein
  // gekaufter Farmplatz (4 Felder + 5.000 € Farm) liefert 16.000 Kapazität.
  // Daraus ergibt sich die Rampe:
  //
  //   Farmplatz 1 (Farm  5):    17.931 € =  1,12 €/Kap =   2,2× Upgrade
  //   Farmplatz 2 (Farm  6):    24.575 € =  1,54 €/Kap =   3,1× Upgrade
  //   Farmplatz 3 (Farm  7):    45.590 € =  2,85 €/Kap =   5,7× Upgrade
  //   Farmplatz 4 (Farm  8):    93.682 € =  5,86 €/Kap =  11,7× Upgrade
  //   Farmplatz 5 (Farm  9):   319.376 € = 19,96 €/Kap =  39,9× Upgrade
  //   Farmplatz 6 (Farm 10): 1.212.709 € = 75,79 €/Kap = 151,6× Upgrade
  //
  // ⚠️ Die Kurve ist am 2026-08-11 deutlich steiler geworden (vorher
  // 5/10/25/35 % mit Zonengrenzen bei 10/20/30). Sie war als Bremse folgenlos:
  // zwanzig Felder kosteten zusammen 119.322 €, und ab Farm 8 hätte Höhe die
  // klar bessere Wahl sein sollen — bei 2,11 €/Kap war Breite aber weiter
  // bequem bezahlbar. Jetzt liegt der Umschlagpunkt da, wo er hingehört:
  //
  //   Felder 1–5   flach (+5 %)  — die vier Felder des ersten Farmplatzes plus
  //                               eins; der Preis, den Phase 2 wirklich zahlt
  //   Felder 6–15  +20 %         — Verdopplung alle 3,8 Felder. Ab hier ist
  //                               Land ein Posten, kein Rundungsfehler
  //   ab Feld 16   +40 %         — Verdopplung alle 2,1 Felder. Fläche wird zum
  //                               eigenen Kostenfaktor: ein Farmplatz kostet
  //                               mehr als der Sprung auf die nächste Tierstufe
  //
  // Die frühen 5 % sind flach — das trägt hier nur, weil die Basis mit 3.000 €
  // absolut spürbar ist. Wer die Basis senkt, muss die Stufe mitziehen, sonst
  // ist die erste Zone wieder geschenkt.
  var TILE_BASE_COST  = 3000;   // erstes gekauftes Feld
  var TILE_STEP_EARLY = 1.05;   // Felder 2–5
  var TILE_STEP_MID   = 1.20;   // Felder 6–15
  var TILE_STEP_LATE  = 1.40;   // ab Feld 16

  // Serverfarm-Sprite je Tier-Stufe (1..7, Küken- bis Elefantenfarm).
  // BUILDING_TYPES.farm.sprite bleibt die alte, stufenlose Grafik — die
  // braucht der Shop-Vorschau-Slot, wo noch keine Instanz mit eigenem Tier
  // existiert. Auf dem Grid wählt farmSprite() unten nach dem Tier der
  // jeweiligen Farm aus dieser Liste.
  // ⚠️ Die Dateien sind uneinheitlich geschrieben (Weide/weide, wie schon bei
  // HQ_SPRITES) — deshalb eine Liste statt String-Konkatenation.
  var FARM_SPRITES = [
    'sprites/buildings/ServerfarmWeide01.png',
    'sprites/buildings/ServerfarmWeide02.png',
    'sprites/buildings/ServerfarmWeide03.png',
    'sprites/buildings/Serverfarmweide04.png',
    'sprites/buildings/Serverfarmweide05.png',
    'sprites/buildings/ServerfarmWeide06.png',
    'sprites/buildings/Serverfarmweide07.png'
  ];

  // Sprite des Strom- & Wasserwerks: Baustufe, solange 'en_erneuerbar' nicht
  // erforscht ist, danach die grüne Variante. energieSprite() unten wählt aus.
  var ENERGY_SPRITE_BASE  = 'sprites/buildings/Energiewerk0.png';
  var ENERGY_SPRITE_GREEN = 'sprites/buildings/Energiewerk1.png';

  // Gebäude-Katalog: kaufbar im Shop, HQ ist fix.
  // cost = Basis-Preis Phase 0/1. Ab Phase 2 gilt für die Farm der höhere
  // Huhn-Preis (siehe buildingCost()). Werbe/Marketing sind nur ab Phase 2
  // im Shop, daher direkt der Phase-2-Preis.
  //
  // Das Bürogebäude ist der einzige Typ, der nichts produziert: es liefert
  // einen zusätzlichen ENTWICKLUNGS-PLATZ. Bis dahin war der HQ-Slot das
  // Nadelöhr von Phase 2 — es lief immer nur eine Entwicklung. Jedes Büro
  // hebt diese Grenze um eins (siehe devBuildings()).
  //
  // 15.000 € flach, unbegrenzt oft — bewusst derselbe Preis wie Werbeagentur
  // und Marketing-Center. Ein Büro ist damit teurer als die meisten Nodes,
  // die es beschleunigt: "Parallelität kaufen" ist eine Investition, die sich
  // erst über mehrere Nodes rechnet, kein Selbstläufer im ersten Zug.
  // ⚠️ Wer den Preis senkt, schaltet die Pacing-Bremse von Phase 2 ab —
  // vier billige Büros machen den ganzen Baum gleichzeitig durchforschbar.
  var BUILDING_TYPES = {
    farm:      { name: 'Serverfarm',       cost: 900,   size: 2,
                 sprite: 'sprites/buildings/ServerfarmWeide.png', alt: 'Serverfarm', icon: '🏭' },
    werbe:     { name: 'Werbeagentur',     cost: 15000, size: 1,
                 sprite: 'sprites/buildings/AdStudio.png',        alt: 'Werbeagentur', icon: '📢' },
    marketing: { name: 'Marketing-Center', cost: 15000, size: 1,
                 sprite: 'sprites/buildings/MarketingArgentur.png', alt: 'Marketing-Center', icon: '📱' },
    buero:     { name: 'Bürogebäude',      cost: 15000, size: 1,
                 sprite: 'sprites/buildings/Büro.png',            alt: 'Bürogebäude', icon: '🏢' },
    // Ab Phase 3. Reiner Konverter: verwandelt Watchtime in User-Modelle, die
    // anschließend in den Serverfarmen wohnen — im Labor selbst liegt nichts.
    kilabor:   { name: 'KI-Labor',         cost: 25000, size: 1,
                 sprite: 'sprites/buildings/KILabor.png',         alt: 'KI-Labor', icon: '🧠' },
    // ⚠️ Hier stand bis zum 2026-08-09 das COMMUNITY CENTER (25.000 €, ab
    // Phase 3). Es ist ersatzlos gestrichen: von allem, was für das Gebäude
    // entworfen war, hat es nur die Umsatzbeteiligung ins Spiel geschafft —
    // ein eigenes Gebäude mit eigenem Modal und eigener Ökonomie für ein
    // einziges Werkzeug. Sie lebt als Creator-Beteiligung in der
    // Anziehungskraft-Spalte des Marketing-Centers weiter (CAMPAIGNS oben),
    // wo sie sich einen Kampagnenplatz mit den anderen Trend-Käufen teilt.
    // Die Herleitung dahinter steht in phase3.md §5.
    // Ab Phase 3, freigeschaltet über die Node en_zentral. Es produziert
    // nichts — es bündelt nur die Versorgung der großen Farmen auf einen Klick.
    // Genau deshalb ist es ein SERVICE-Gebäude und kein Entscheidungs-Gebäude:
    // die Wahl (erneuerbar, effizienter) steckt in den Nodes, nicht in einem
    // eigenen Modal mit eigener Ökonomie.
    // sprite = Baustufe für den Shop-Vorschau-Slot; auf dem Grid wählt
    // energieSprite() unten die grüne Variante, sobald 'en_erneuerbar' steht.
    energie:   { name: 'Strom- & Wasserwerk', cost: 40000, size: 1,
                 sprite: ENERGY_SPRITE_BASE,                     alt: 'Strom- & Wasserwerk', icon: '⚡' }
  };
  // Ein Werk versorgt die ganze Plattform. Ein zweites hätte nichts zu tun.
  var ENERGY_PLANT_MAX = 1;
  // Ab Phase 2 gekaufte Serverfarmen starten als Huhn (16.000 Kapazität).
  // 5.000 € = 0,3125 € je Kapazität — die kleine, häufige Portion, mit der
  // man der User-Kurve vorausbaut. Höhere Stufen sind noch nicht direkt
  // kaufbar (CLAUDE.md §4-B); sobald sie es sind, braucht TIER_UPGRADE_COST
  // wieder einen Aufschlag, sonst schlägt die volle Kapazität einer neuen
  // Farm jedes Upgrade auf dieselbe Stufe.
  var FARM_COST_PHASE2 = 5000;

  // ── SERVERKOSTEN — Strom, Wasser und Wartung ──────────────────────────────
  //
  // Der einzige laufende Kostenposten im Spiel. Er hängt an der GESAMTEN
  // Serverkapazität — egal ob dort User, Code, Modelle oder gar nichts liegen.
  // Alles, was als Serverfarm dasteht, will gekühlt, gesichert und gewartet
  // werden. Damit kostet Vorbauen zum ersten Mal etwas.
  //
  // ⚠️ Die Tarifstufe kommt aus der SUMME aller Farmen, bezahlt wird aber je
  // Farm nach ihrer eigenen Kapazität. Eine kleine Farm in einem großen Konzern
  // zahlt also den großen Satz — genau die Aussage, um die es geht: bei großen
  // Anlagen skalieren Backups und Kühlung anders.
  //
  // Umrechnung in die Währung, in der der Rest des Spiels rechnet: eine
  // Zahlung deckt SERVER_UPKEEP_CYCLES Produktionszyklen, 1.000 Kapazität
  // produzieren je Zyklus 1.000 Watchtime. Also
  //
  //     € je Watchtime = rate / (SERVER_UPKEEP_UNIT × SERVER_UPKEEP_CYCLES)
  //
  //   Tiny   0,0006 €/wt   0,3 % eines Feed-Deals @25 %   (0,8 % bei Banner)
  //   Low    0,0030 €/wt   1,5 %                          (  4 %)
  //   Mid    0,0080 €/wt   4   %                          ( 11 %)
  //   High   0,0200 €/wt  10   %                          ( 27 %)
  //   Massiv 0,0400 €/wt  20   %                          ( 53 %)
  //
  // Die Spreizung ×67 ist der eigentliche Balance-Wert, nicht die Einzelzahl.
  // Sie sorgt für zwei Dinge:
  //   • Der Phase-2-Start (1 Huhn-Farm, 16.000 Kap.) zahlt 240 € je Zahlung —
  //     rund 1 % des Banner-Einkommens. Sichtbar, aber nie eine Sperre. ⚠️ Das
  //     ist Absicht und muss so bleiben: Phase 2 beginnt OHNE Werbeagentur
  //     (CLAUDE.md §6), ein spürbarer Tarif wäre dort ein Soft-Lock.
  //   • Banner wird nach oben hin unwirtschaftlich, statt weggenerft zu werden
  //     — bei Massiv frisst der Betrieb die Hälfte seines eigenen Ertrags.
  //
  // Die Stufensprünge sind flach (nicht gestaffelt wie eine Steuerprogression):
  // bei 500.001 Kapazität zahlt ALLES den Mid-Satz. Das ist eine Kante, aber
  // sie liegt in jeder Stufe bei ~1–3 % des Einkommens, und Kapazität kommt in
  // großen Brocken (eine Elefanten-Farm sind 400 Mio auf einmal) — man trifft
  // die Grenze nie als Grenzentscheidung.
  //
  // Wofür die Namen stehen — nur als Notiz. Die Stufen trugen bis zum
  // 2026-08-10 je einen Beschreibungssatz, der im Modal unter der eigenen
  // Stufe stand. Er ist raus, weil er neben Grenze und Satz nichts erklärte,
  // was der Spieler nicht schon sah:
  //   Tiny    Ein Schrank im Nebenraum. Strom aus der Steckdose.
  //   Low     Ein eigener Raum mit Klimagerät und geregelter Zuleitung.
  //   Mid     Rechenzentrum: Wasserkühlung, Notstrom, Wartungsvertrag.
  //   High    Mehrere Standorte, gespiegelt. Jedes Byte liegt doppelt.
  //   Massiv  Eigenes Umspannwerk, eigener Wasseranschluss, eigene Schicht.
  var SERVER_UPKEEP_TIERS = [
    { id: 'tiny',   name: 'Tiny',   upTo: 100000,    rate: 15   },
    { id: 'low',    name: 'Low',    upTo: 500000,    rate: 75   },
    { id: 'mid',    name: 'Mid',    upTo: 50000000,  rate: 200  },
    { id: 'high',   name: 'High',   upTo: 500000000, rate: 500  },
    { id: 'massiv', name: 'Massiv', upTo: Infinity,  rate: 1000 }
  ];
  // Zyklen, die eine Zahlung deckt. Danach läuft die Farm langsamer.
  var SERVER_UPKEEP_CYCLES = 25;
  // Weitere Zyklen bei halbem Tempo, bevor sie auf Sparflamme geht.
  var SERVER_UPKEEP_GRACE  = 5;
  var SERVER_UPKEEP_SLOW   = 0.5;
  // ⚠️ 0,2 und NICHT 0 (Stillstand). Drei Gründe: eine pleite gegangene
  // Plattform hätte sonst keinen Weg zurück; nach einer Nacht stünde alles
  // still statt auf Sparflamme; und es bleibt bei jedem Tarif richtig zu
  // zahlen — sparen bringt höchstens 20 % und kostet 80 % der Produktion.
  var SERVER_UPKEEP_CRAWL  = 0.2;
  // Kapazität, auf die sich ein Tarif bezieht. Erneuerbare Energien setzen ihn
  // auf 1.500 und senken den Preis damit um ein Drittel.
  var SERVER_UPKEEP_UNIT      = 1000;
  var SERVER_UPKEEP_UNIT_GREEN = 1500;
  // Zusätzliche Zyklen je Zahlung durch „Effizientere Farmen" (25 → 30).
  // Die Kulanz-Zyklen bleiben bei 5, aus 25/30 wird also 30/35.
  var SERVER_UPKEEP_CYCLES_BONUS = 5;
  // Ab dieser Stufe übernimmt das Energiewerk den Klick (Schaf, Kuh, Elefant).
  var ENERGY_PLANT_MIN_TIER = 'schaf';
  // Ab wie vielen Zyklen der Sammel-Button am Werk überhaupt erst auftaucht —
  // unabhängig von serverUpkeepCycles() (der Fälligkeitsgrenze). Ohne diese
  // Schwelle blinkte er schon nach dem ersten produzierten Zyklus einer
  // abgedeckten Farm auf, weil farmsAwaitingUpkeep() jeden noch so kleinen
  // fälligen Betrag zählt — alle 8 Sekunden ein neuer Klick-Wunsch.
  var ENERGY_PLANT_ALERT_CYCLES = 20;

  // „Serverprobleme" — EIN Modifikator für zwei Ursachen, bewusst nicht
  // additiv: eine unversorgte belegte Farm und ein voller Server sind für den
  // User dasselbe Erlebnis („da geht nichts mehr"), und zweimal −2,0 wäre für
  // denselben Eindruck doppelt bestraft.
  //
  // ⚠️ LEERE Farmen zählen nicht. Eine Farm, in der niemand wohnt, darf dunkel
  // dastehen — sonst wäre Vorbauen nicht nur teuer, sondern auch noch
  // rufschädigend, und der Kapazitätspuffer, den Phase 3 braucht, wäre
  // unbezahlbar.
  var SERVER_TROUBLE_MOD   = 'server:trouble';
  var SERVER_TROUBLE_TREND = -2.0;
  // Kurz gehalten und in jedem Tick erneuert, solange das Problem besteht.
  // Sobald es behoben ist, klingt der Posten mit der normalen Negativ-Rate ab
  // (TREND_DECAY_NEG_PER_SEC) — „sofort weg" wäre ein Freifahrtschein.
  var SERVER_TROUBLE_HOLD_SEC = 3;
  // Der HQ-Sprite wächst mit dem Fortschritt:
  //   0 — Garage
  //   1 — nach dem Rechner-Kauf (state.level, in purchaseItem gesetzt)
  //   2 — ab Phase 2, also nach dem Investor-Deal
  //   3 — ab Phase 3
  // Stufe 2 und 3 werden NICHT gespeichert, sondern in hqSprite() aus der
  // Phase abgeleitet — dadurch stimmt das Gebäude auch in alten Spielständen
  // sofort, ohne dass storage.migrate() etwas nachtragen muss.
  // ⚠️ Die Dateien sind uneinheitlich geschrieben (HeadQuarter0/1, aber
  // Headquarter2/3); deshalb eine Liste statt 'HeadQuarter' + Stufe. Auf einem
  // Webserver ist die Schreibweise anders als lokal nicht egal.
  var HQ_SPRITES = [
    'sprites/buildings/HeadQuarter0.png',
    'sprites/buildings/HeadQuarter1.png',
    'sprites/buildings/Headquarter2.png',
    'sprites/buildings/Headquarter3.png'
  ];
  var HQ_SPRITE = { sprite: HQ_SPRITES[0], alt: 'Headquarter' };

  // Default-State pro Gebäudetyp — bekommt jede neue Instanz zugewiesen.
  function defaultInstanceState(typeId) {
    // farm: Modelle liegen NICHT hier, sondern als globale Zahl (state.models)
    // — sie sind Kapazität und werden wie User über alle Farmen verteilt.
    // Metadaten teilen sich den Stapel-Zähler mit der Watchtime.
    // upkeepCycles = Produktionszyklen seit der letzten Versorgung. 0 heißt
    // frisch bezahlt; ab SERVER_UPKEEP_CYCLES will die Farm Geld sehen.
    // ⚠️ Eine neue Farm startet auf 0 und läuft ihre ersten 25 Zyklen umsonst.
    // Das ist der Kulanz-Vorschuss, den der Phase-2-Start braucht — dort steht
    // die erste Farm, bevor es überhaupt eine Werbeagentur gibt.
    if (typeId === 'farm')      return { tierId: 'kueken', stacks: 0, cycleTime: 0, upkeepCycles: 0 };
    // energie: kein eigener State. Das Werk hält nichts, es bündelt nur den
    // Versorgungs-Klick über alle großen Farmen.
    if (typeId === 'energie')   return {};
    // kilabor: conv = laufende Umwandlung (null = idle), modelsReady = fertig
    // trainierte Modelle, die auf das Einsammeln warten. Gleiche Bauart wie
    // die Werbeagentur, damit beide Konverter sich gleich anfühlen.
    if (typeId === 'kilabor')   return { conv: null, modelsReady: 0, lastConv: null };
    // werbe: deal = laufender Werbedeal (null = idle), lastDeal = letzte Wahl.
    // lastDeal ist reine Bequemlichkeit fürs Modal: Slider-Vorbelegung und
    // Markierung der zuletzt gebuchten Werbeart.
    if (typeId === 'werbe')     return { deal: null, moneyReady: 0, lastDeal: null };
    // marketing: active = laufende Kampagne, ready = eingesammelte User,
    // lastTrend = letzte Reglerstellung der Creator-Beteiligung. Gleiche
    // Bequemlichkeit wie lastDeal in der Werbeagentur: der Regler steht beim
    // nächsten Öffnen dort, wo man ihn zuletzt hatte.
    if (typeId === 'marketing') return { active: null, ready: 0, lastTrend: null };
    if (typeId === 'hq')        return { level: 0 };
    // buero: kein eigener State. Welche Node auf welchem Gebäude läuft, steht
    // am Techtree-Eintrag (entry.slot) — dort, wo auch Status und Startzeit
    // liegen. Sonst müsste dieselbe Zuordnung an zwei Stellen stimmen.
    return {};
  }

  // --- Initialer State ---
  var initial = {
    money: 1500,
    users: 0,
    watchtime: 0,
    // Metadaten (ab Phase 3): globales Lager, gefüllt aus den User-Modellen in
    // den Farmen. Dieselbe Begründung wie beim Watchtime-Lager (CLAUDE.md §5):
    // der Spieler soll frei entscheiden, wofür er sie ausgibt, statt sie von
    // Gebäude zu Gebäude tragen zu müssen.
    metadata: 0,
    // User-Modelle: eine globale Zahl, die wie die User über die Farmen
    // verteilt wird und dieselbe Serverkapazität belegt (1 Modell = 1 Platz).
    models: 0,
    // Trend-System (ab Phase 2 aktiv):
    //   trendMods       — id → { label, value, holdUntil } , alle befristet
    //   phase2Sec       — Spielzeit in Phase 2; steuert das Verebben des
    //                     Grundinteresses (3 → 0 über TREND_BASE_FADE_SEC).
    //                     Offline-Zeit zählt bewusst nicht mit.
    //   trendStacks     — gebunkerte Zyklen, max TREND_STACK_MAX
    //   trendCycleTime  — Sekunden im laufenden TREND_CYCLE_SEC-Takt. Gilt für beide
    //                     Richtungen: positiv stapelt er, negativ rechnet er ab.
    //   trendShield*    — Schadensbegrenzung: aktiv bis / wieder klickbar ab
    trendMods: {},
    phase2Sec: 0,
    trendStacks: 0,
    trendCycleTime: 0,
    trendShieldUntil: 0,
    trendShieldReadyAt: 0,
    // Erklär-Touren (js/tour.js) — je einmalig.
    //   introTourSeen     — Spielanfang: Grid, HQ, die drei Zahlen, Shop
    //   trendModalSeen    — Phase 2: Trend, Watchtime, neue Gebäude
    //   watchtimeMultSeen — erstes Feature mit watchtimeMult: was der ×-Chip
    //                       an der Watchtime-Kachel bedeutet. Hängt an einem
    //                       Ereignis statt an einer Phase (kann in Phase 2
    //                       oder 3 fallen).
    //   networkTourSeen   — der Netzwerkeffekt, sobald er +2,0 überschreitet
    //   whitePatternSeen  — das erste eingesammelte Vertrauens-Feature
    //   phase3TourSeen    — Phase 3: Modelle, Metadaten, das KI-Labor
    introTourSeen: false,
    trendModalSeen: false,
    watchtimeMultSeen: false,
    networkTourSeen: false,
    whitePatternSeen: false,
    phase3TourSeen: false,
    // Höchststand des Netzwerkeffekts, der schon angesagt wurde (Toast alle
    // 0,5 Punkte, siehe maybeAnnounceNetwork in loop.js). Gehört in den
    // Spielstand und nicht ins Modul, sonst kommt nach jedem Neuladen die
    // ganze Leiter als Toast-Salve.
    networkSeen: 0,
    // Einmal-Ansage, sobald der Netzwerkeffekt zum ersten Mal fällt statt zu
    // steigen (über 1 Mrd User). Siehe maybeAnnounceSaturation in loop.js.
    networkSatSeen: false,
    // Zeitstempel des letzten Speicherns — Basis für den Offline-Aufholpass.
    savedAt: 0,
    // Flyer-Bonus: alle 8 s werden User × 1,10 (Zinseszins), solange
    // mk_flyer 'done' ist UND users < 1000 UND Phase < 2. Der letzte
    // Tick-Zeitpunkt wird hier gemerkt.
    lastFlyerTick: 0,
    // Investor-Meilenstein bei 1000 Usern — einmalig. Löst Phase-2 aus.
    investorTriggered: false,
    // Phase-3-Meilenstein bei PHASE3_USER_THRESHOLD Usern (js/loop.js) —
    // einmalig. Marcus kommt zurück und holt sich seine Ausschüttung: einmalig
    // INVESTOR_PAYOUT_SHARE des Kontostands, danach dauerhaft derselbe Anteil
    // jedes Werbeertrags (adRevenueMult).
    //
    // ⚠️ Bewusst OHNE Entscheidung. Ein „auszahlen oder behalten" war lange
    // geplant; es hätte Marcus aber zu einer Verhandlung gemacht, und die
    // Aussage ist eine andere: er ist zu 15 % beteiligt, das war der Deal aus
    // Phase 2, und Beteiligungen fragen nicht.
    phase3Triggered: false,
    // Phase-4-Meilenstein bei PHASE4_USER_THRESHOLD Usern (js/loop.js) —
    // einmalig. Ab hier laufen die Ereigniskarten (js/events.js).
    phase4Triggered: false,
    phase4TourSeen:  false,
    // Der komplette Karten-Zustand: Deck, Tisch, Runde, Uhr, dauerhafte
    // Wirkungen. Wird beim ersten Zugriff angelegt (RT.events.state), damit
    // Spielstände vor Phase 4 nichts davon mitschleppen müssen.
    events: null,
    // Was Marcus beim Auftritt tatsächlich mitgenommen hat — nur damit das
    // Modal die echte Zahl zeigen kann, statt sie ein zweites Mal zu rechnen.
    investorCutAmount: 0,
    // Go-Live-Info-Modal (erklärt neue Techtree-Reiter) — einmalig nach Launch.
    goLiveModalSeen: false,
    instanceCounter: 1,
    player: { name: null, avatar: null, platformName: null, platformLogo: null },
    // sparkHistory: rollende Sample-Reihen für die Sparkline-Grafiken in der Resource-Bar.
    // Sampling alle 30 s, max 60 Punkte = 30 min sichtbarer Verlauf.
    sparkHistory: { money: [], users: [] },
    // Techtree-Fortschritt: nodeId → { status, startAt } (status: 'in_progress' | 'done')
    // Nodes ohne Eintrag gelten als 'locked' oder 'available' (via nodeStatus()).
    techtree: {},
    // Hardware-Käufe aus dem Shop (einmalig).
    purchases: { rechner: false },
    // true nach erfolgreichem "Plattform online stellen" — schaltet Grid + Gebäude frei.
    goLiveUnlocked: false,
    // Gelbe "!"-Badges auf UI-Elementen mit neuem Inhalt. Werden bei Klick auf
    // das jeweilige Element auf true gesetzt und verschwinden dann dauerhaft.
    // hq_phase0/hq_phase1: HQ-Badge, taucht bei jeder Phase neu auf.
    seenBadges: {
      hq_phase0: false,
      hq_phase1: false,
      shop:      false,
      tab_marketing: false,
      tab_werbung:   false
    },
    // Einzeln dazugekaufte Grid-Felder außerhalb der Start-Freizone,
    // als "col,row"-Schlüssel. Die Länge ist gleichzeitig der Preis-Zähler.
    ownedTiles: [],
    placedBuildings: [
      { instanceId: 'hq-1', id: 'hq', col: 0, row: 0, size: 1, state: { level: 0 } }
    ]
  };

  // Marcus' Anteil, wenn er zu Beginn von Phase 3 zurückkommt. Er wirkt
  // ZWEIMAL, und das ist der Punkt: einmal auf den Kontostand (er nimmt sich
  // seine Ausschüttung) und danach dauerhaft auf jeden Werbeertrag (er ist zu
  // 15 % beteiligt, also gehören ihm 15 % der Einnahmen). Der erste Griff tut
  // im Moment weh, der zweite für den Rest des Spiels.
  //
  // ⚠️ Bewusst KEIN eigener Multiplikator neben adRevenueMult(): der Abzug
  // gehört genau dorthin, damit Loop und UI ihn beide sehen, ohne dass eine
  // dritte Stelle davon wissen muss.
  var INVESTOR_PAYOUT_SHARE = 0.15;

  RT.state = {
    TIERS: TIERS,
    TIER_UPGRADE_COST: TIER_UPGRADE_COST,
    INVESTOR_PAYOUT_SHARE: INVESTOR_PAYOUT_SHARE,
    CAMPAIGNS: CAMPAIGNS,
    AD_TYPES:                     AD_TYPES,
    AD_CYCLES_MAX:                AD_CYCLES_MAX,
    AD_INTENSITY_MIN:             AD_INTENSITY_MIN,
    AD_INTENSITY_MAX:             AD_INTENSITY_MAX,
    AD_INTENSITY_WORK:            AD_INTENSITY_WORK,
    AD_TREND_EXPONENT:            AD_TREND_EXPONENT,
    AD_VOLUME_STEPS:              AD_VOLUME_STEPS,
    AD_PCT_ANCHOR:                AD_PCT_ANCHOR,
    TARGETING_META_PER_WT:        TARGETING_META_PER_WT,
    TARGETING_REVENUE_MULT:       TARGETING_REVENUE_MULT,
    FARM_CAPACITY_ANIMALS:        FARM_CAPACITY_ANIMALS,
    SERVER_UPKEEP_TIERS:          SERVER_UPKEEP_TIERS,
    SERVER_UPKEEP_GRACE:          SERVER_UPKEEP_GRACE,
    SERVER_UPKEEP_SLOW:           SERVER_UPKEEP_SLOW,
    SERVER_UPKEEP_CRAWL:          SERVER_UPKEEP_CRAWL,
    SERVER_TROUBLE_MOD:           SERVER_TROUBLE_MOD,
    SERVER_TROUBLE_TREND:         SERVER_TROUBLE_TREND,
    SERVER_TROUBLE_HOLD_SEC:      SERVER_TROUBLE_HOLD_SEC,
    ENERGY_PLANT_MIN_TIER:        ENERGY_PLANT_MIN_TIER,
    ENERGY_PLANT_MAX:             ENERGY_PLANT_MAX,
    WATCHTIME_STACK_MAX:          WATCHTIME_STACK_MAX,
    WATCHTIME_CYCLE_SEC:          WATCHTIME_CYCLE_SEC,
    OFFLINE_CATCHUP_SEC:          OFFLINE_CATCHUP_SEC,
    WATCHTIME_PER_USER_PER_CYCLE: WATCHTIME_PER_USER_PER_CYCLE,
    METADATA_STACK_MAX:           METADATA_STACK_MAX,
    METADATA_PER_MODEL:           METADATA_PER_MODEL,
    CONV_TYPES:                   CONV_TYPES,
    CONV_CYCLES_MAX:              CONV_CYCLES_MAX,
    TREND_CYCLE_SEC:              TREND_CYCLE_SEC,
    TREND_STACK_MAX:              TREND_STACK_MAX,
    TREND_MIN:                    TREND_MIN,
    TREND_MAX:                    TREND_MAX,
    PR_DECAY_SEC:                 PR_DECAY_SEC,
    TREND_SHIELD_SEC:             TREND_SHIELD_SEC,
    TREND_SHIELD_CD_SEC:          TREND_SHIELD_CD_SEC,
    TREND_DECAY_PER_SEC:          TREND_DECAY_PER_SEC,
    TREND_DECAY_NEG_PER_SEC:      TREND_DECAY_NEG_PER_SEC,
    TREND_HOLD_NODE_SEC:          TREND_HOLD_NODE_SEC,
    TREND_HOLD_AD_SEC:            TREND_HOLD_AD_SEC,
    TREND_BASE_START:             TREND_BASE_START,
    TREND_BASE_FADE_SEC:          TREND_BASE_FADE_SEC,
    NETWORK_U0:                   NETWORK_U0,
    NETWORK_K_BASE:               NETWORK_K_BASE,
    NETWORK_CAP_L:                NETWORK_CAP_L,
    NETWORK_PEAK:                 NETWORK_PEAK,
    NETWORK_FULL:                 NETWORK_FULL,
    NETWORK_LADDER:               NETWORK_LADDER,
    GRID_SIZE:                    GRID_SIZE,
    TILE_BASE_COST:               TILE_BASE_COST,
    BUILDING_TYPES:               BUILDING_TYPES,
    FARM_COST_PHASE2:             FARM_COST_PHASE2,
    HQ_SPRITE:                    HQ_SPRITE,

    // Aktueller Kaufpreis eines Gebäudetyps (phase-abhängig für 'farm').
    buildingCost: function (typeId) {
      if (typeId === 'farm' && this.currentPhase() >= 2) return FARM_COST_PHASE2;
      var t = BUILDING_TYPES[typeId];
      return t ? t.cost : 0;
    },

    current: JSON.parse(JSON.stringify(initial)),

    defaultInstanceState: defaultInstanceState,

    isOccupied: function (col, row) {
      var pb = this.current.placedBuildings;
      for (var i = 0; i < pb.length; i++) {
        var b = pb[i];
        for (var dc = 0; dc < b.size; dc++) {
          for (var dr = 0; dr < b.size; dr++) {
            if (b.col + dc === col && b.row + dr === row) return true;
          }
        }
      }
      return false;
    },
    canPlace: function (typeId, col, row) {
      var type = BUILDING_TYPES[typeId];
      if (!type) return false;
      // Baubar ist jedes Feld, das dem Spieler gehört — Start-Freizone oder
      // dazugekauft. Eine 2×2-Farm braucht alle vier Felder.
      for (var dc = 0; dc < type.size; dc++) {
        for (var dr = 0; dr < type.size; dr++) {
          if (!this.isTileOwned(col + dc, row + dr)) return false;
          if (this.isOccupied(col + dc, row + dr))  return false;
        }
      }
      return true;
    },

    // ---- Grid-Felder ----
    tileKey: function (col, row) { return col + ',' + row; },

    // Lookup-Map über ownedTiles. buildIsoGrid fragt pro Neuaufbau ~420 Felder
    // ab — ein indexOf je Feld wäre bei ein paar hundert gekauften Feldern
    // spürbar. Invalidierung über Array-Identität (load/wipe) + Länge (push).
    _tileOwnMap: null,
    _tileOwnArr: null,
    _tileOwnLen: -1,
    ownedTileMap: function () {
      var owned = this.current.ownedTiles || [];
      if (this._tileOwnArr !== owned || this._tileOwnLen !== owned.length) {
        var m = {};
        for (var i = 0; i < owned.length; i++) m[owned[i]] = true;
        this._tileOwnMap = m;
        this._tileOwnArr = owned;
        this._tileOwnLen = owned.length;
      }
      return this._tileOwnMap;
    },

    // Gehört das Feld dem Spieler? Entweder Teil der Start-Freizone
    // [0, free-1]² oder einzeln dazugekauft.
    isTileOwned: function (col, row) {
      var gs = this.gridSizeEffective();
      if (col >= 0 && col < gs.freeCols && row >= 0 && row < gs.freeRows) return true;
      return this.ownedTileMap()[this.tileKey(col, row)] === true;
    },

    // Kaufbar ist jedes noch nicht besessene Feld innerhalb der Render-Range,
    // das rechtwinklig (nicht diagonal) an ein besessenes Feld grenzt.
    isTilePurchasable: function (col, row) {
      var gs = this.gridSizeEffective();
      if (col < gs.minCol || col > gs.maxCol || row < gs.minRow || row > gs.maxRow) return false;
      if (this.isTileOwned(col, row)) return false;
      return this.isTileOwned(col - 1, row) ||
             this.isTileOwned(col + 1, row) ||
             this.isTileOwned(col, row - 1) ||
             this.isTileOwned(col, row + 1);
    },

    // Preis des n-ten gekauften Feldes (1-basiert). Basis 3.000 €, danach
    // +5 % je Feld bis 5, +20 % bis 15, ab 16 +40 %.
    tileCost: function (n) {
      var c = TILE_BASE_COST;
      for (var i = 2; i <= n; i++) {
        c *= (i <= 5)  ? TILE_STEP_EARLY :
             (i <= 15) ? TILE_STEP_MID   : TILE_STEP_LATE;
      }
      return Math.round(c);
    },

    // Preis des nächsten Feldes — gleich für alle kaufbaren Felder.
    nextTileCost: function () {
      return this.tileCost((this.current.ownedTiles || []).length + 1);
    },
    getInstance: function (instanceId) {
      var pb = this.current.placedBuildings;
      for (var i = 0; i < pb.length; i++) {
        if (pb[i].instanceId === instanceId) return pb[i];
      }
      return null;
    },
    instancesByType: function (typeId) {
      var out = [];
      var pb = this.current.placedBuildings;
      for (var i = 0; i < pb.length; i++) {
        if (pb[i].id === typeId) out.push(pb[i]);
      }
      return out;
    },
    newInstanceId: function (typeId) {
      this.current.instanceCounter += 1;
      return typeId + '-' + this.current.instanceCounter;
    },

    // Alle Gebäude, in denen entwickelt werden kann — HQ zuerst, danach die
    // Bürogebäude in Kauf-Reihenfolge. Ein Eintrag = ein paralleler
    // Entwicklungs-Platz. Die Reihenfolge ist die Fallback-Reihenfolge beim
    // Verteilen einer neuen Node (siehe RT.techtree.freeDevBuilding).
    devBuildings: function () {
      return this.instancesByType('hq').concat(this.instancesByType('buero'));
    },
    devSlotsTotal: function () {
      return this.devBuildings().length;
    },

    tierById: function (id) {
      for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === id) return TIERS[i];
      return null;
    },
    tierIndex: function (id) {
      for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === id) return i;
      return -1;
    },
    nextTier: function (id) {
      var i = this.tierIndex(id);
      return (i >= 0 && i < TIERS.length - 1) ? TIERS[i + 1] : null;
    },
    // Stufen-Label 1..7 aus tierId — für "Serverfarm (Stufe N)" im UI.
    tierStufe: function (id) {
      var i = this.tierIndex(id);
      return i >= 0 ? i + 1 : 1;
    },
    campaignById: function (id) {
      for (var i = 0; i < CAMPAIGNS.length; i++) if (CAMPAIGNS[i].id === id) return CAMPAIGNS[i];
      return null;
    },

    // --- Werbedeal-Formeln (einzige Quelle, Loop UND UI rechnen hierüber) ---
    adTypeById: function (id) {
      for (var i = 0; i < AD_TYPES.length; i++) if (AD_TYPES[i].id === id) return AD_TYPES[i];
      return null;
    },
    clampAdIntensity: function (i) {
      if (typeof i !== 'number' || isNaN(i)) return AD_INTENSITY_MIN;
      return Math.max(AD_INTENSITY_MIN, Math.min(AD_INTENSITY_MAX, i));
    },

    // Ist die Werbeart buchbar? Ohne unlockedBy immer, sonst muss die Node fertig sein.
    adTypeUnlocked: function (typeId) {
      var t = this.adTypeById(typeId);
      if (!t) return false;
      if (!t.unlockedBy) return true;
      var e = (this.current.techtree || {})[t.unlockedBy];
      return !!(e && e.status === 'done');
    },
    adTypesUnlocked: function () {
      var out = [];
      for (var i = 0; i < AD_TYPES.length; i++) {
        if (this.adTypeUnlocked(AD_TYPES[i].id)) out.push(AD_TYPES[i]);
      }
      return out;
    },

    // Kampagnen einer Sorte — 'users' (Reichweite) oder 'trend' (PR & Partner).
    // Gibt AUCH die gesperrten zurück: das Marketing-Center zeigt sie grau mit
    // dem Namen der fehlenden Node an. Anders als in der Werbeagentur, wo
    // gesperrte Arten ausgeblendet werden — hier wäre die PR-Spalte zu Beginn
    // von Phase 2 sonst komplett leer, und die gesperrte Karte ist gleichzeitig
    // der Wegweiser ins HQ.
    campaignsOfKind: function (kind) {
      var out = [];
      for (var i = 0; i < CAMPAIGNS.length; i++) {
        if ((CAMPAIGNS[i].kind || 'users') === kind) out.push(CAMPAIGNS[i]);
      }
      return out;
    },

    // Ist die Kampagne buchbar? Ohne unlockedBy immer, sonst muss die Node
    // fertig sein. Gleiche Bauart wie adTypeUnlocked().
    campaignUnlocked: function (campaignId) {
      var c = this.campaignById(campaignId);
      if (!c) return false;
      if (!c.unlockedBy) return true;
      var e = (this.current.techtree || {})[c.unlockedBy];
      return !!(e && e.status === 'done');
    },

    // --- PR-Plätze --------------------------------------------------------
    // Wie viele PR-Kampagnen GLEICHZEITIG wirken dürfen — plattformweit, nicht
    // je Gebäude. Ohne diese Schranke war der Trend käuflich: jede Marketing-
    // Instanz registrierte ihren eigenen Modifikator, acht rotierende Center
    // hielten +20 dauerhaft für ~1.250 €/s. Weil der Trend bei TREND_MAX
    // gedeckelt ist, das Einkommen aber unbegrenzt wächst, kann KEIN Preis das
    // auf Dauer bremsen — die Bremse muss eine Stückzahl sein.
    //
    // ⚠️ Der Platz ist der Modifikator, nicht die laufende Kampagne — eine neue
    // Buchung ERSETZT ihn. Würde nur die Gleichzeitigkeit begrenzt, blieben die
    // abklingenden Schwänze je Gebäude trotzdem nebeneinander stehen. Unter der
    // damaligen globalen Abkling-Rate wirkte ein Influencer 645 s, lief aber nur
    // 45 s: bei zwei Plätzen und freier Rotation über viele Center wären das
    // rund +46 statt +6 gewesen. Der feste 20-s-Ausklang (PR_DECAY_SEC) hat
    // diese Lücke inzwischen ohnehin geschlossen — die Regel bleibt trotzdem,
    // weil sie die Obergrenze unabhängig vom Abkling-Tempo garantiert.
    //
    // Freigeschaltet werden die Plätze über dieselben Nodes, die auch die
    // Kampagnen öffnen — eine Kampagne, ein Platz: mk_presse gibt die
    // Marken-Profile und Platz 1, mk_partner die Creator-Beteiligung und Platz 2,
    // mk_analyse in Phase 3 die Zielgruppen-Offensive und Platz 3. Dadurch braucht es keine Phasen-
    // Tabelle, und jede neue PR-Art ist nebeneinander mit den vorhandenen
    // buchbar statt gegen sie — aus Alternativen werden Kombinationen.
    //
    // Zwei Bauarten: mk_presse/mk_partner/mk_analyse bringen ihren Platz
    // ZUSAMMEN mit einer neuen Kampagne (eine Art verdrängt die andere also
    // nie), mk_team und mk_monitoring sind REINE Platz-Nodes ohne eigenen
    // Inhalt — das Gegenstück zum Bürogebäude. 3 Plätze am Ende von Phase 2,
    // 5 in Phase 3.
    //
    // ⚠️ Die Zahl der Plätze IST die Trend-Obergrenze der PR: sie liegt bei
    // Plätze × bestem Trend-Wert, also +15,0 rein für Geld (5× Influencer,
    // 3.333 €/s) und +20,0 mit Metadaten (5× Zielgruppe, braucht 200 %
    // Abdeckung — erreichbar, aber in Farm-Kapazität bezahlt: 3,0× je User).
    //
    // ⚠️ +20,0 ist EXAKT TREND_MAX. Fünf Zielgruppen-Offensiven fahren den
    // Trend allein an den Cap, jeder Node-Bonus verfällt dann lautlos. Ab hier
    // ist TREND_MAX selbst eine Balance-Größe und kein Sicherheitsnetz mehr.
    //
    // Diese Decke muss gegen den RUHEWERT gelesen werden, nicht gegen 0. Alle
    // fünf Dark Patterns zusammen sind −4,1, dazu der laufende Werbe-Malus.
    // Der dritte Platz ist deshalb keine Lockerung, sondern die Bedingung
    // dafür, dass der Dark-Pattern-Schaden „bezahlbar statt tödlich" bleibt
    // (CLAUDE.md §8). Rechnung steht in §7.2.
    //
    // ⚠️ Die −4,1 sind seit dem 2026-08-06 die Hälfte der früheren −8,0 —
    // begründet ist das an den Nodes selbst (js/techtree.js, Kommentar über
    // pushNotifications). Bei −8,0 blieb mit den drei Phase-2-Plätzen netto
    // +1,0 übrig, und ein einziger Video-Deal fraß auch den noch auf. Wer die
    // Schuld wieder anhebt, muss zuerst hier Plätze nachlegen.
    //
    // Wer hier einen Namen hinzufügt, hebt die Decke; das ist der einzige Weg
    // dorthin, und er ist bewusst kurz gehalten.
    PR_SLOT_NODES: ['mk_presse', 'mk_partner', 'mk_team',
                    'mk_analyse', 'mk_monitoring'],
    prSlotsTotal: function () {
      var tt = this.current.techtree || {}, n = 0;
      for (var i = 0; i < this.PR_SLOT_NODES.length; i++) {
        var e = tt[this.PR_SLOT_NODES[i]];
        if (e && e.status === 'done') n++;
      }
      // Befristeter Zusatzplatz aus der Ereigniskarte „Hilfsorganisation" —
      // die einzige Stelle im Spiel, an der ein Platz nicht an einer Node
      // hängt. Er ist befristet und damit keine Verschiebung der Decke.
      if (RT.events && RT.events.prSlotBonus) n += RT.events.prSlotBonus();
      return n;
    },
    // Modifikator-Id eines Platzes. Bewusst OHNE Instanz-Bezug — sonst wäre
    // der Platz wieder an ein Gebäude gebunden.
    // ⚠️ Nicht 'pr:' — dieses Präfix trug die alte PR in der Werbeagentur, und
    // storage.migrate() löscht es bei JEDEM Laden weg.
    prSlotModId: function (slot) { return 'prslot:' + slot; },
    // Plätze, die gerade von einer laufenden PR-Kampagne besetzt sind.
    prSlotsUsed: function () {
      var mk = this.instancesByType('marketing'), out = [];
      for (var i = 0; i < mk.length; i++) {
        var a = mk[i].state && mk[i].state.active;
        if (!a || !a.prSlot) continue;
        var c = this.campaignById(a.campaignId);
        if (c && c.kind === 'trend') out.push(a.prSlot);
      }
      return out;
    },
    // Nächster freier Platz (1-basiert) oder 0, wenn alle belegt sind.
    nextFreePrSlot: function () {
      var used = this.prSlotsUsed(), total = this.prSlotsTotal();
      for (var slot = 1; slot <= total; slot++) {
        if (used.indexOf(slot) < 0) return slot;
      }
      return 0;
    },

    // User, die eine Reichweiten-Kampagne liefert. Absolute Zahl (users) oder
    // Anteil der AKTUELLEN User (usersPct) — genau eins von beiden, dieselbe
    // Bauart wie models/coverage bei den Umwandlungsarten.
    //
    // Gerechnet wird beim BUCHEN, nicht beim Auszahlen: der Spieler sieht auf
    // der Karte eine Zahl und soll genau die bekommen. Bei Auszahl-Rechnung
    // würde eine Abwanderung während der Laufzeit die schon bezahlte Kampagne
    // nachträglich kleiner machen.
    campaignUsers: function (campaignId) {
      var c = this.campaignById(campaignId);
      if (!c) return 0;
      if (c.usersPct) return Math.floor((this.current.users || 0) * c.usersPct);
      return c.users || 0;
    },

    // Metadaten-Kosten einer Kampagne. Feste Menge (`metadata`) oder ein
    // Betrag JE USER (`metadataPerUser`) — genau eins von beiden, dieselbe
    // Bauart wie users/usersPct darüber.
    //
    // ⚠️ Der Anteil ist bei einem Metadaten-Preis die tragende Variante, nicht
    // die Kür: der Metadaten-Strom wächst linear mit den Usern, eine feste
    // Menge wäre also ab einer bestimmten Plattformgröße gratis. Nur wenn
    // beide Seiten mitwachsen, bleibt der Laufanteil konstant — und die
    // eigentliche Schranke ist dann die Abdeckung statt der Kontostand.
    //
    // Wie beim Buchen gilt: Wert JETZT festhalten (startCampaign speichert
    // ihn), damit die Karte nicht lügt, wenn während der Laufzeit User
    // abwandern.
    campaignMetadata: function (campaignId) {
      var c = this.campaignById(campaignId);
      if (!c) return 0;
      if (c.metadataPerUser) return Math.floor((this.current.users || 0) * c.metadataPerUser);
      return c.metadata || 0;
    },

    // Gesamtwirkung einer Trend-Kampagne in Trend-Sekunden: Laufzeit auf
    // vollem Wert plus die Dreiecksfläche des linearen Abklingens danach.
    // Das ist die Zahl, gegen die sich der Preis rechnet (siehe PREIS-ANKER).
    //
    // Weil PR in FESTER Zeit ausklingt (PR_DECAY_SEC), ist die Dreiecksfläche
    // hier linear im Wert statt quadratisch — der Schwanz ist schlicht ein
    // Zuschlag von PR_DECAY_SEC/2 Sekunden auf die Laufzeit.
    campaignTrendSeconds: function (campaignId) {
      var c = this.campaignById(campaignId);
      if (!c || !c.trend) return 0;
      return c.trend * (c.duration + PR_DECAY_SEC / 2);
    },

    // --- Regler-Kampagnen (bisher nur die Creator-Beteiligung) ------------
    // Eine Kampagne mit `trendMin` ist in `trendSteps` Stufen zwischen trendMin
    // und trend buchbar; ihr Preis kommt dann aus costBase + costPerTrend ×
    // trend statt aus `cost`. Alle anderen Kampagnen laufen unverändert über
    // `cost` und `trend`, es gibt also keinen zweiten Kampagnen-Typ.
    campaignHasSlider: function (campaignId) {
      var c = this.campaignById(campaignId);
      return !!(c && c.trendMin);
    },
    campaignTrendSteps: function (campaignId) {
      var c = this.campaignById(campaignId);
      return (c && c.trendSteps) || 0;
    },
    // Trend-Wert einer Stufe (1 … trendSteps). Die Stufen liegen gleichmäßig
    // zwischen trendMin und trend; bei 5 Stufen von +1,0 bis +3,0 sind das
    // 1,0 / 1,5 / 2,0 / 2,5 / 3,0 — alle exakt auf dem 0,1-Raster.
    campaignTrendAtStep: function (campaignId, step) {
      var c = this.campaignById(campaignId);
      if (!c || !c.trendMin) return c ? (c.trend || 0) : 0;
      var n = c.trendSteps || 1;
      var i = Math.max(1, Math.min(n, Math.round(step || 1)));
      if (n <= 1) return c.trend;
      var v = c.trendMin + (c.trend - c.trendMin) * (i - 1) / (n - 1);
      return Math.round(v * 10) / 10;
    },
    // Umkehrung: zu einem gebuchten Trend-Wert die nächstgelegene Stufe. Wird
    // gebraucht, damit der Regler beim nächsten Öffnen dort steht, wo er
    // zuletzt stand (mkS.lastTrend speichert den Wert, nicht die Stufe).
    campaignStepOfTrend: function (campaignId, t) {
      var c = this.campaignById(campaignId);
      if (!c || !c.trendMin) return 1;
      var n = c.trendSteps || 1;
      if (n <= 1 || typeof t !== 'number' || isNaN(t)) return n;
      var raw = 1 + (t - c.trendMin) / (c.trend - c.trendMin) * (n - 1);
      return Math.max(1, Math.min(n, Math.round(raw)));
    },
    // Reglerwert auf eine gültige Stufe zwingen. Ein Wert zwischen zwei Stufen
    // rastet auf die nächste ein — es gibt keine Zwischenwerte, auch nicht über
    // einen alten Spielstand oder einen manipulierten Aufruf.
    // Ohne Argument (oder mit Unsinn) gilt das Maximum: jeder Aufrufer, der
    // von Reglern nichts weiß, bucht damit die alte, feste Kampagne.
    clampCampaignTrend: function (campaignId, t) {
      var c = this.campaignById(campaignId);
      if (!c) return 0;
      var max = c.trend || 0;
      if (!c.trendMin) return max;
      if (typeof t !== 'number' || isNaN(t)) return max;
      return this.campaignTrendAtStep(campaignId, this.campaignStepOfTrend(campaignId, t));
    },
    // Was die Kampagne VOR der Marktplatz-Provision kostet.
    // ⚠️ Die Grundgebühr macht den Kurs nach oben besser — das ist die Aussage
    // der Kampagne und kein Rundungsposten (siehe CAMPAIGNS).
    campaignCostGross: function (campaignId, t) {
      var c = this.campaignById(campaignId);
      if (!c) return 0;
      if (!c.trendMin) return c.cost || 0;
      return Math.round(c.costBase + c.costPerTrend * this.clampCampaignTrend(campaignId, t));
    },
    // Was tatsächlich abgebucht wird. ⚠️ Jede Stelle, die früher c.cost gelesen
    // hat, muss hierüber gehen — sonst prüft der Kauf gegen einen anderen Preis
    // als die Karte anzeigt.
    campaignCost: function (campaignId, t) {
      var gross = this.campaignCostGross(campaignId, t);
      if (!this.campaignHasSlider(campaignId)) return gross;
      return Math.ceil(gross * (1 - this.creatorCut()));
    },
    // Anteil, der über den Marktplatz zurückkommt. Ohne die Node 0, sonst
    // linear mit dem Trend bis MARKETPLACE_TREND_FULL.
    creatorCut: function () {
      if (!this.nodeDone('marketplace')) return 0;
      var t = this.trendValue();
      if (t <= 0) return 0;
      return MARKETPLACE_CUT * Math.min(1, t / MARKETPLACE_TREND_FULL);
    },

    // Geld wächst LINEAR mit der Intensität, der Trend-Malus QUADRATISCH.
    // Dadurch ist niedrige Intensität trend-effizient (aber watchtime-verschwendend)
    // und hohe Intensität watchtime-effizient (aber trend-teuer) — der Regler ist
    // damit eine echte Entscheidung statt eines reinen Tempo-Knopfes.
    //
    // Seit den Anteils-Stufen hängt das Geld nicht mehr an eur50 × Stufe,
    // sondern an der tatsächlich ausgelieferten Watchtime × Kurs der Art
    // (eur50 / watchtime). Für Stufe 1 ist das rechnerisch identisch zu
    // vorher — die Formel verallgemeinert nur, statt sich zu ändern.
    //
    // `grossWt` überschreibt die Live-Rechnung: der Loop bucht die Watchtime
    // am ANFANG eines Zyklus ab und zahlt das Geld am ENDE aus. Bei einer
    // Anteils-Stufe ist das Lager dann ein anderes, und ohne den gemerkten
    // Wert bekäme man Geld für eine Menge, die man nie bezahlt hat.
    adMoneyPerCycle: function (typeId, intensity, volume, targeting, grossWt) {
      var t = this.adTypeById(typeId);
      if (!t || !t.watchtime) return 0;
      var r     = this.clampAdIntensity(intensity) / AD_INTENSITY_MAX;
      var gross = (typeof grossWt === 'number' && !isNaN(grossWt))
        ? grossWt
        : this.adWatchtimeGross(typeId, volume);
      return gross * (t.eur50 / t.watchtime) * r * this.adRevenueMult()
           * (targeting ? TARGETING_REVENUE_MULT : 1);
    },
    // Malus am Arbeitspunkt (25 %) verankert: dort immer trend50/4, darüber
    // mit AD_TREND_EXPONENT hochgezogen. Siehe den Block bei den Konstanten.
    //
    // Das Volumen geht über `trendMult` ein, nicht über `mult`: auf den
    // Anteils-Stufen sind beide gleich (Bedingung dafür, dass der
    // Volumen-Knopf nicht den Intensitäts-Regler ersetzt), „fest ×4" liefert
    // dagegen bewusst vierfach zum einfachen Malus. Siehe AD_VOLUME_STEPS.
    // Targeting taucht hier bewusst NICHT auf: dass es den Trend in Ruhe
    // lässt, ist sein ganzer Sinn.
    adTrendMalus: function (typeId, intensity, volume) {
      var t = this.adTypeById(typeId);
      if (!t) return 0;
      var i    = this.clampAdIntensity(intensity);
      var work = t.trend50 * (AD_INTENSITY_WORK / AD_INTENSITY_MAX)
                           * (AD_INTENSITY_WORK / AD_INTENSITY_MAX);
      return work * Math.pow(i / AD_INTENSITY_WORK, AD_TREND_EXPONENT)
                  * this.adTrendMult()
                  * this.adStep(this.clampAdVolume(volume)).trendMult;
    },

    // Watchtime, die ein Zyklus AUSLIEFERT — Basis für Geld und Metadaten.
    // Stufe 1 liefert die feste Zahl der Werbeart, die Anteils-Stufen einen
    // Anteil des Lagers.
    //
    // ⚠️ Getrennt von adWatchtimePerCycle, und der Unterschied ist
    // adWatchtimeMult: ein Verbrauchs-Rabatt senkt, was der Zyklus KOSTET,
    // nicht was er ausliefert. Würde das Geld am Netto-Wert hängen, wäre so
    // eine Node ein Downgrade (−25 % Verbrauch = −25 % Ertrag), statt wie
    // gedacht dieselbe Werbung billiger zu machen. Der Haken ist derzeit
    // unbelegt (siehe unten), die Trennung muss trotzdem stehen bleiben.
    adWatchtimeGross: function (typeId, volume) {
      var t = this.adTypeById(typeId);
      if (!t) return 0;
      var s = this.adStep(this.clampAdVolume(volume));
      if (!s.pct) return t.watchtime * s.mult;
      return (this.current.watchtime || 0) * this.adTypeShare(typeId) * s.mult;
    },

    // Watchtime, die ein Zyklus tatsächlich kostet. Einzige Quelle für Loop
    // UND UI — die rohe type.watchtime steht seit Volumen und
    // Anzeigen-Optimierung nirgends mehr für sich allein.
    adWatchtimePerCycle: function (typeId, volume) {
      return Math.ceil(this.adWatchtimeGross(typeId, volume) * this.adWatchtimeMult());
    },

    // Metadaten je Zyklus. 0 ohne Targeting — der Schalter ist die einzige
    // Stelle, an der ein Werbedeal Metadaten anfasst.
    adMetadataPerCycle: function (typeId, volume, targeting) {
      if (!targeting) return 0;
      return Math.ceil(this.adWatchtimePerCycle(typeId, volume) * TARGETING_META_PER_WT);
    },

    // --- Volumen ---
    // `volume` ist überall die Stufen-ID, nicht ein Multiplikator und auch
    // kein Rang. Wie stark eine Stufe ist, sagt allein ihre Position im
    // Array — deshalb geht jede Rangfrage über adStepIndex und nicht über
    // einen Zahlenvergleich.
    adStep: function (v) {
      for (var i = 0; i < AD_VOLUME_STEPS.length; i++) {
        if (AD_VOLUME_STEPS[i].step === v) return AD_VOLUME_STEPS[i];
      }
      return AD_VOLUME_STEPS[0];
    },
    // Position auf der Leiter. Unbekannte IDs (eine entfernte Stufe in einem
    // alten Spielstand) landen auf der Grundstufe.
    adStepIndex: function (v) {
      for (var i = 0; i < AD_VOLUME_STEPS.length; i++) {
        if (AD_VOLUME_STEPS[i].step === v) return i;
      }
      return 0;
    },
    adIsBaseVolume: function (v) {
      return this.adStepIndex(v) === 0;
    },
    // Anteil des Lagers, den eine Werbeart je Anteils-Stufe frisst.
    adTypeShare: function (typeId) {
      var t = this.adTypeById(typeId);
      return t ? t.watchtime / AD_PCT_ANCHOR : 0;
    },
    adVolumeUnlocked: function (v) {
      var s = this.adStep(v);
      return s.unlockedBy ? this.nodeDone(s.unlockedBy) : true;   // Stufe 1 ist immer da
    },
    // Wie viele Stufen offenstehen. Die Knopfreihe im Buchungs-Modal hängt
    // daran: bei nur einer erreichbaren Stellung ist sie kein Regler, sondern
    // ein Schild, das dem Modal Platz wegnimmt.
    adVolumeOpenCount: function () {
      var n = 0;
      for (var i = 0; i < AD_VOLUME_STEPS.length; i++) {
        if (this.adVolumeUnlocked(AD_VOLUME_STEPS[i].step)) n++;
      }
      return n;
    },
    // Auf eine freigeschaltete Stufe einrasten: von der gewünschten Position
    // aus die Leiter hinunter, bis eine offen ist. Fängt auch alte Spielstände
    // ohne volume und Deals ab, deren Stufe nachträglich gesperrt wäre.
    clampAdVolume: function (v) {
      var base = AD_VOLUME_STEPS[0].step;
      if (typeof v !== 'number' || isNaN(v)) return base;
      for (var i = this.adStepIndex(v); i >= 0; i--) {
        if (this.adVolumeUnlocked(AD_VOLUME_STEPS[i].step)) return AD_VOLUME_STEPS[i].step;
      }
      return base;
    },
    // Beschriftung einer Stufe. Die absoluten stehen als ×1 / ×4 da, die
    // Anteils-Stufen tragen den echten Prozentwert DIESER Werbeart — bei
    // Video also 8 / 24 %, bei Banner 0,3 / 0,9 %.
    adStepLabel: function (typeId, volume) {
      var s = this.adStep(this.clampAdVolume(volume));
      if (!s.pct) return '×' + s.mult;
      var p = this.adTypeShare(typeId) * s.mult * 100;
      return (p % 1 === 0 ? String(p) : p.toFixed(1).replace('.', ',')) + ' %';
    },

    // --- Targeting ---
    adTargetingUnlocked: function () { return this.nodeDone('wb_retarget'); },

    // Techtree-Schnittstelle. adTrendMult ist weiter neutral und wartet auf
    // eine Node, die ihn belegt — er wäre der wichtigere Hebel: er macht die
    // Ökonomie verlustärmer, statt eine weitere Trend-Quelle danebenzustellen.
    // (Das Gebäude, für das er gedacht war, ist gestrichen — der Haken selbst
    // bleibt gültig, siehe CLAUDE.md §9 „Noch offen".)
    //
    // adWatchtimeMult ist datengetrieben über die Node-Felder gebaut (gleiche
    // Bauart wie watchtimeMult()), hat aber seit dem Umbau der
    // Anzeigen-Optimierung keinen Träger mehr und liefert konstant 1. Er senkt
    // den VERBRAUCH, drehte also als einziger der drei nicht am Ertrag — der
    // Haken bleibt reserviert für die Konkurrenz, die Phase 3 ausmacht:
    // Werbeagentur und KI-Labor saufen aus demselben Lager. Ein Feld
    // `adWatchtimeMult: 0.75` an irgendeiner Node reicht, um ihn zu beleben.
    //
    // adRevenueMult trägt seit Phase 3 Marcus' Beteiligung: ab dem Moment, in
    // dem er zurückkommt, gehen 15 % jedes Werbeertrags an ihn. Der Abzug sitzt
    // bewusst hier und nicht im Loop — die Werbeagentur-Karte rechnet über
    // dieselbe Funktion und zeigt dadurch von allein den Betrag an, der
    // wirklich ankommt.
    // Der Preiskampf aus der Ereigniskarte „Der Konkurrent wird stark" sitzt
    // aus demselben Grund hier: die Werbeagentur-Karte rechnet über diese
    // Funktion und zeigt dadurch von allein, was wirklich ankommt.
    adRevenueMult: function () {
      // Marcus' Anteil — es sei denn, er ist über die Ereigniskarte
      // „Marcus will Zahlen sehen → Anteile zurückkaufen" ausbezahlt worden.
      var out  = RT.events && RT.events.investorOut && RT.events.investorOut();
      var base = (this.current.phase3Triggered && !out) ? (1 - INVESTOR_PAYOUT_SHARE) : 1;
      if (RT.events && RT.events.adRevenueMult) base *= RT.events.adRevenueMult();
      return base;
    },
    adTrendMult:   function () { return 1; },
    adWatchtimeMultMods: function () {
      var nodes = (RT.techtree && RT.techtree.NODES) || {};
      var out   = [];
      for (var nid in nodes) {
        if (!Object.prototype.hasOwnProperty.call(nodes, nid)) continue;
        if (!nodes[nid].adWatchtimeMult) continue;
        if (!this.nodeDone(nid)) continue;
        out.push({ id: nid, label: nodes[nid].name, value: nodes[nid].adWatchtimeMult });
      }
      return out;
    },
    adWatchtimeMult: function () {
      var mods = this.adWatchtimeMultMods();
      var m    = 1;
      for (var i = 0; i < mods.length; i++) m *= mods[i].value;
      return Math.round(m * 10000) / 10000;
    },

    // Kapazität pro Farm = users pro Tier × Slot-Anzahl.
    farmCapacity: function (farmInst) {
      if (!farmInst) return 0;
      var t = this.tierById(farmInst.state.tierId);
      if (!t) return 0;
      return t.users * FARM_CAPACITY_ANIMALS;
    },

    // Summe aller Farm-Kapazitäten — das ist die Serverkapazität-Ressource.
    serverCapacityTotal: function () {
      var farms = this.instancesByType('farm');
      var total = 0;
      for (var i = 0; i < farms.length; i++) total += this.farmCapacity(farms[i]);
      return total;
    },

    // ── Serverkosten ────────────────────────────────────────────────────────

    // Tarifstufe aus der GESAMTEN Kapazität. Die Stufe gilt für jede Farm,
    // auch für die kleinste — siehe Kommentar bei SERVER_UPKEEP_TIERS.
    serverUpkeepTier: function () {
      var cap = this.serverCapacityTotal();
      for (var i = 0; i < SERVER_UPKEEP_TIERS.length; i++) {
        if (cap <= SERVER_UPKEEP_TIERS[i].upTo) return SERVER_UPKEEP_TIERS[i];
      }
      return SERVER_UPKEEP_TIERS[SERVER_UPKEEP_TIERS.length - 1];
    },
    // Nächste Stufe samt Schwelle — die UI muss den Sprung ankündigen können,
    // sonst ist der Kostenschub beim Überschreiten unerklärt.
    serverUpkeepNextTier: function () {
      var cur = this.serverUpkeepTier();
      for (var i = 0; i < SERVER_UPKEEP_TIERS.length; i++) {
        if (SERVER_UPKEEP_TIERS[i].id === cur.id) {
          return SERVER_UPKEEP_TIERS[i + 1] || null;
        }
      }
      return null;
    },

    // Zyklen je Zahlung — „Effizientere Farmen" hebt sie von 25 auf 30.
    serverUpkeepCycles: function () {
      return SERVER_UPKEEP_CYCLES + (this.nodeDone('en_effizient') ? SERVER_UPKEEP_CYCLES_BONUS : 0);
    },
    // Zyklen bis zur Sparflamme (Zahlung + Kulanz).
    serverUpkeepCrawlAt: function () {
      return this.serverUpkeepCycles() + SERVER_UPKEEP_GRACE;
    },
    // Kapazitätseinheit, auf die sich der Tarif bezieht — erneuerbare Energien
    // machen daraus 1.500 und senken den Preis so um ein Drittel.
    serverUpkeepUnit: function () {
      return this.nodeDone('en_erneuerbar') ? SERVER_UPKEEP_UNIT_GREEN : SERVER_UPKEEP_UNIT;
    },

    // Was eine volle Versorgung dieser Farm kostet.
    serverUpkeepFullCost: function (farmInst) {
      if (!farmInst) return 0;
      return this.serverUpkeepTier().rate * this.farmCapacity(farmInst) / this.serverUpkeepUnit();
    },
    // Was JETZT für diese Farm fällig ist — anteilig nach verbrauchten Zyklen.
    //
    // ⚠️ Die Anteiligkeit ist kein Rabatt, sondern die Bedingung dafür, dass
    // der Sammelklick des Werks überhaupt benutzbar ist: ohne sie wäre jedes
    // frühe Drücken eine Strafe, und man würde warten, bis alle Farmen leer
    // sind — also genau die Klick-Last, die das Werk abschaffen soll.
    serverUpkeepDueCost: function (farmInst) {
      if (!farmInst) return 0;
      var used = Math.min(farmInst.state.upkeepCycles || 0, this.serverUpkeepCycles());
      return this.serverUpkeepFullCost(farmInst) * (used / this.serverUpkeepCycles());
    },

    // Belegt = User, Code oder Modelle liegen darauf. Nur belegte Farmen
    // können Serverprobleme auslösen (siehe SERVER_TROUBLE_MOD).
    farmOccupied: function (farmInst) {
      var f = this.farmFill(farmInst);
      return (f.users + f.programm + f.models) > 0;
    },
    // Die Farm will Geld sehen — ab hier läuft sie langsamer und das Icon steht.
    farmUpkeepDue: function (farmInst) {
      if (!farmInst) return false;
      return (farmInst.state.upkeepCycles || 0) >= this.serverUpkeepCycles();
    },
    // Tempofaktor: 1 → 0,5 → 0,2. Der Serverausfall aus den Ereigniskarten
    // multipliziert sich darauf — eine unversorgte Farm im Ausfall läuft
    // also wirklich nur noch auf einem Zehntel.
    farmSpeedFactor: function (farmInst) {
      if (!farmInst) return 1;
      var ev = (RT.events && RT.events.farmSpeedFactor) ? RT.events.farmSpeedFactor() : 1;
      var n = farmInst.state.upkeepCycles || 0;
      if (n < this.serverUpkeepCycles()) return ev;
      if (n < this.serverUpkeepCrawlAt()) return SERVER_UPKEEP_SLOW * ev;
      return SERVER_UPKEEP_CRAWL * ev;
    },

    // Farmen, die das Energiewerk übernimmt — ab Stufe ENERGY_PLANT_MIN_TIER.
    // Kleinere bleiben Handarbeit; das ist der Konsolidierungs-Anreiz und der
    // Grund, warum das Werk nicht einfach alle Klicks abschafft.
    energyPlantCovers: function (farmInst) {
      if (!farmInst) return false;
      var min = this.tierIndex(ENERGY_PLANT_MIN_TIER);
      var idx = this.tierIndex(farmInst.state.tierId);
      return idx >= 0 && min >= 0 && idx >= min;
    },
    hasEnergyPlant: function () {
      return this.instancesByType('energie').length > 0;
    },

    // Alle Farmen, für die gerade etwas zu zahlen ist — optional gefiltert auf
    // die, die das Werk abdeckt.
    farmsAwaitingUpkeep: function (onlyPlantCovered) {
      var farms = this.instancesByType('farm'), out = [];
      for (var i = 0; i < farms.length; i++) {
        if ((farms[i].state.upkeepCycles || 0) <= 0) continue;
        if (onlyPlantCovered && !this.energyPlantCovers(farms[i])) continue;
        out.push(farms[i]);
      }
      return out;
    },

    // Teilmenge von farmsAwaitingUpkeep(true), die den Sammel-Button am Werk
    // überhaupt rechtfertigt: entweder schon fällig (farmUpkeepDue) oder
    // mindestens ENERGY_PLANT_ALERT_CYCLES Zyklen alt. Bezahlt wird beim Klick
    // trotzdem ALLES, was angefallen ist — die Schwelle entscheidet nur, wann
    // der Knopf sichtbar wird, nicht was er abrechnet.
    farmsNeedingUpkeepAlert: function () {
      var farms = this.farmsAwaitingUpkeep(true), out = [];
      for (var i = 0; i < farms.length; i++) {
        var used = farms[i].state.upkeepCycles || 0;
        if (used >= ENERGY_PLANT_ALERT_CYCLES || this.farmUpkeepDue(farms[i])) out.push(farms[i]);
      }
      return out;
    },

    // Serverprobleme: eine BELEGTE Farm ist unversorgt — oder die Kapazität ist
    // voll. Ein Zustand, ein Modifikator, nicht additiv.
    serverTroubleReasons: function () {
      var out = [];
      var farms = this.instancesByType('farm');
      for (var i = 0; i < farms.length; i++) {
        if (this.farmUpkeepDue(farms[i]) && this.farmOccupied(farms[i])) {
          out.push('supply');
          break;
        }
      }
      if (this.serverCapacityTotal() > 0 && this.freeUserCapacity() <= 0) out.push('full');
      return out;
    },
    serverTrouble: function () { return this.serverTroubleReasons().length > 0; },

    // Belegung ALLER Farmen in einem Durchlauf. User und Programme teilen sich
    // dieselbe Kapazität, deshalb müssen sie auch gemeinsam verteilt werden:
    // je Farm zuerst das Programm (Kisten haben Vorrang), der Rest der Kapazität
    // geht an User. Farm 1 (nach Kauf-Reihenfolge) läuft zuerst voll, dann
    // Farm 2 usw. — Reihenfolge = placedBuildings-Array.
    //
    // Früher liefen User und Programme in zwei getrennten Durchläufen, die
    // beide bei Farm 1 anfingen und jeweils bis zur vollen Kapazität füllten.
    // Dadurch bekam dieselbe Farm ihre Kapazität doppelt zugeteilt: eine
    // 80.000er-Farm zeigte 80.000 User UND 11.000 Programm.
    // Ein Modell belegt genau 1 Kapazität — die Gesamtzahl IST die Kapazität.
    modelCapacityTotal: function () {
      return Math.max(0, Math.floor(this.current.models || 0));
    },

    farmFills: function () {
      var farms  = this.instancesByType('farm');
      var users  = this.current.users || 0;
      var prog   = this.programmCapacity();
      var models = this.modelCapacityTotal();
      var out    = [];
      for (var i = 0; i < farms.length; i++) {
        var cap = this.farmCapacity(farms[i]);
        // Reihenfolge: Code, dann User, dann Modelle. Modelle stehen bewusst
        // HINTEN — sie sind der Nachzügler, der sich den Platz nimmt, der
        // übrig ist. Dadurch füllen sich die Farmen von vorn mit Usern und die
        // Modelle sammeln sich hinten; im Belegungs-Balken und auf der Weide
        // stehen sie an derselben Stelle.
        var p = Math.min(cap, prog);               prog   -= p;
        var u = Math.min(cap - p, users);          users  -= u;
        var m = Math.min(cap - p - u, models);     models -= m;
        out.push({ instanceId: farms[i].instanceId, cap: cap, users: u, programm: p, models: m });
      }
      // Überhang kann nur entstehen, wenn eine Balance-Änderung die Kapazität
      // unter den Bestand drückt (im laufenden Spiel prüft jede User-Quelle
      // freeUserCapacity). Er landet in der letzten Farm, damit die Summe über
      // alle Farmen weiter dem User-Zähler entspricht und keine Watchtime-
      // Produktion still verschwindet.
      if (users > 0 && out.length) out[out.length - 1].users += users;
      return out;
    },

    farmFill: function (farmInst) {
      var empty = { instanceId: null, cap: 0, users: 0, programm: 0, models: 0 };
      if (!farmInst) return empty;
      var fills = this.farmFills();
      for (var i = 0; i < fills.length; i++) {
        if (fills[i].instanceId === farmInst.instanceId) return fills[i];
      }
      return empty;
    },

    usersInFarm: function (farmInst) {
      return this.farmFill(farmInst).users;
    },

    // Anzahl sichtbarer Tiere im Zaun (aufgerundet, letztes Tier ggf. partial).
    // 1250 User in Küken-Farm = ceil(1250/250) = 5 Küken; 1250 User in Huhn-Farm
    // = ceil(1250/1000) = 2 Hühner.
    animalsInFarm: function (farmInst) {
      var slots = this.farmSlots(farmInst);
      return slots.animals;
    },

    // Verteilung der 8 Slots pro Farm auf Kisten (Programm) und Tiere (User).
    // Kisten haben Vorrang — sowohl numerisch (farmFills) als auch visuell.
    // Tiere werden abgeschnitten, wenn die Aufrundung beider Seiten zusammen
    // über die 8 Slots hinausgeht. Regel: min. 1 Kiste sobald Programm > 0.
    // Verteilung der 8 Slots auf Kisten (Code), Modell-Sprites und Tiere.
    // Alle drei sind Kapazitätszahlen und werden nach derselben Regel in Slots
    // umgerechnet: aufgerundet, aber mindestens einer, sobald überhaupt etwas
    // da ist. „Sobald ein Modell in der Farm liegt, sieht man es" ist damit
    // dieselbe Zusage wie bei den Code-Kisten.
    farmSlots: function (farmInst) {
      if (!farmInst) return { boxes: 0, models: 0, animals: 0 };
      var t = this.tierById(farmInst.state.tierId);
      if (!t) return { boxes: 0, models: 0, animals: 0 };
      var fill = this.farmFill(farmInst);
      var u = fill.users;
      var p = fill.programm;
      var m = fill.models || 0;

      var boxes = 0;
      if (p > 0) boxes = Math.max(1, Math.ceil(p / t.users));
      boxes = Math.min(FARM_CAPACITY_ANIMALS, boxes);

      var animals = 0;
      if (u > 0) animals = Math.ceil(u / t.users);
      animals = Math.min(FARM_CAPACITY_ANIMALS - boxes, animals);

      var models = 0;
      if (m > 0) models = Math.max(1, Math.ceil(m / t.users));
      models = Math.min(FARM_CAPACITY_ANIMALS - boxes - animals, models);
      // ⚠️ Wenn Kisten und Tiere alle 8 Slots aufgerundet haben, bliebe für
      // ein vorhandenes Modell keiner übrig — dann verschwände es aus dem
      // Bild, obwohl es Kapazität belegt. Es bekommt deshalb einen Slot vom
      // Tier-Kontingent. Betrifft nur den Rundungsrand: die Kapazität selbst
      // ist in farmFills längst korrekt verteilt.
      if (m > 0 && models === 0 && animals > 0) { animals -= 1; models = 1; }

      return { boxes: boxes, models: models, animals: animals };
    },

    modelsInFarm: function (farmInst) {
      return this.farmFill(farmInst).models || 0;
    },

    // Ist diese Node fertig? Einzige Stelle, an der andere Module den
    // Techtree-Status abfragen sollten — sonst steht die Prüfung
    // `status === 'done'` verstreut in fünf Dateien.
    nodeDone: function (nodeId) {
      var e = (this.current.techtree || {})[nodeId];
      return !!(e && e.status === 'done');
    },

    // --- KI-Labor: Watchtime → User-Modelle (Phase 3) ---
    convTypeById: function (id) {
      for (var i = 0; i < CONV_TYPES.length; i++) if (CONV_TYPES[i].id === id) return CONV_TYPES[i];
      return null;
    },
    // Freigeschaltete Umwandlungsarten. `unlockedBy` zeigt auf eine Node im
    // KI-Reiter — gleiche Bauart wie AD_TYPES.unlockedBy.
    convTypesUnlocked: function () {
      var out = [];
      for (var i = 0; i < CONV_TYPES.length; i++) {
        var c = CONV_TYPES[i];
        if (!c.unlockedBy || this.nodeDone(c.unlockedBy)) out.push(c);
      }
      return out;
    },
    // Platz, den neue Modelle noch finden: die freie Serverkapazität, abzüglich
    // dessen, was schon fertig in den Laboren liegt. Ohne den Abzug könnte man
    // beliebig oft buchen und den Deckel über den Umweg „nicht einsammeln"
    // überrennen.
    //
    // ⚠️ Der Deckel ist die KAPAZITÄT, nicht die User-Zahl. Ein früherer
    // Entwurf begrenzte auf „nicht mehr Modelle als User" — mit der Begründung,
    // ein Modell sei das Modell EINES Users. Das trägt weder fachlich (ein
    // zweites Modell desselben Users ist ein feineres, keine Dublette) noch
    // mechanisch: der User-Deckel schlug vor dem Kapazitäts-Deckel zu und nahm
    // damit genau die Entscheidung weg, um die es in Phase 3 geht — Kapazität,
    // die Modelle trägt, trägt keine User.
    modelRoom: function () {
      return Math.max(0, Math.floor(this.freeUserCapacity() - this.modelsPendingTotal()));
    },
    modelsPendingTotal: function () {
      var labs = this.instancesByType('kilabor');
      var n = 0;
      for (var i = 0; i < labs.length; i++) n += Math.floor(labs[i].state.modelsReady || 0);
      return n;
    },
    // Modelle je User. Darf über 1 liegen — mehr Modelle als User heißt
    // feinere Modelle, nicht doppelte. Reine Anzeigegröße ohne Deckelfunktion.
    modelCoverage: function () {
      var u = this.current.users || 0;
      if (u <= 0) return 0;
      return (this.current.models || 0) / u;
    },

    // Modelle, die ein Zyklus dieser Art VOR dem Kapazitäts-Deckel liefert.
    // Getrennt von convModelsPerCycle(), damit die Karten im Labor auch dann
    // noch zeigen können, was die Art normalerweise kann, wenn gerade kein
    // Platz frei ist.
    convModelsFull: function (typeId) {
      var c = this.convTypeById(typeId);
      if (!c) return 0;
      var base = c.coverage ? (this.current.users || 0) * c.coverage : (c.models || 0);
      return Math.max(0, Math.floor(base * this.modelYieldMult()));
    },
    // Was ein Zyklus tatsächlich liefert: begrenzt durch den freien Platz. Ein
    // Zyklus, der nur noch die Restlücke füllen kann, liefert weniger — und
    // kostet über convWatchtimePerCycle() entsprechend weniger.
    convModelsPerCycle: function (typeId) {
      return Math.min(this.convModelsFull(typeId), this.modelRoom());
    },
    // Watchtime, die ein Zyklus kostet — abgeleitet aus dem, was er liefert.
    // Ein Zyklus, der wegen der Obergrenze nur noch halb so viele Modelle
    // baut, kostet auch nur die Hälfte.
    convWatchtimePerCycle: function (typeId) {
      var c = this.convTypeById(typeId);
      if (!c) return 0;
      return Math.ceil(this.convModelsPerCycle(typeId) * c.wtPerModel);
    },
    // Watchtime je Modell — die Vergleichsgröße zwischen den Trainingsarten.
    // Rechnet den Ausbau-Multiplikator mit ein, zeigt also den Kurs, der
    // gerade gilt.
    //
    // ⚠️ Bewusst NICHT im KI-Labor angezeigt: im Modal steht, was ein Zyklus
    // kostet und bringt — der abgeleitete Kurs blähte die Karte auf, ohne
    // eine Entscheidung zu tragen. Die Funktion bleibt trotzdem, weil sie die
    // Balance-Prüfung ist: eine neue Trainingsart muss diesen Wert SENKEN,
    // sonst ist sie nur eine größere Zahl. Aufgerufen aus den Balance-Tests.
    convWtPerModel: function (typeId) {
      var c = this.convTypeById(typeId);
      if (!c) return 0;
      return c.wtPerModel / this.modelYieldMult();
    },

    // --- Metadaten (Phase 3) ---
    // Multiplikator aus fertigen Nodes (metadataMult) — dieselbe Bauart wie
    // watchtimeMult(), damit beide Achsen sich gleich verhalten.
    metadataMultMods: function () {
      var nodes = (RT.techtree && RT.techtree.NODES) || {};
      var out   = [];
      for (var nid in nodes) {
        if (!Object.prototype.hasOwnProperty.call(nodes, nid)) continue;
        if (!nodes[nid].metadataMult) continue;
        if (!this.nodeDone(nid)) continue;
        out.push({ id: nid, label: nodes[nid].name, value: nodes[nid].metadataMult });
      }
      return out;
    },
    metadataMult: function () {
      var mods = this.metadataMultMods();
      var m    = 1;
      for (var i = 0; i < mods.length; i++) m *= mods[i].value;
      return Math.round(m * 10000) / 10000;
    },
    // Ausbeute-Multiplikator der Watchtime→Modell-Umwandlung (modelYieldMult
    // an den Nodes). Zweiter der beiden Ausbau-Hebel im KI-Reiter.
    modelYieldMultMods: function () {
      var nodes = (RT.techtree && RT.techtree.NODES) || {};
      var out   = [];
      for (var nid in nodes) {
        if (!Object.prototype.hasOwnProperty.call(nodes, nid)) continue;
        if (!nodes[nid].modelYieldMult) continue;
        if (!this.nodeDone(nid)) continue;
        out.push({ id: nid, label: nodes[nid].name, value: nodes[nid].modelYieldMult });
      }
      return out;
    },
    modelYieldMult: function () {
      var mods = this.modelYieldMultMods();
      var m    = 1;
      for (var i = 0; i < mods.length; i++) m *= mods[i].value;
      return Math.round(m * 10000) / 10000;
    },

    // Metadaten, die die Modelle EINER Farm je Zyklus liefern. Der Zyklus ist
    // derselbe wie bei der Watchtime — beide hängen am Stapel-Zähler der Farm.
    metadataPerCycle: function (farmInst) {
      return this.modelsInFarm(farmInst) * METADATA_PER_MODEL * this.metadataMult();
    },
    metadataPerSec: function (farmInst) {
      return this.metadataPerCycle(farmInst) / WATCHTIME_CYCLE_SEC;
    },

    // Watchtime-Multiplikator aus fertigen Techtree-Nodes — multiplikativ.
    // Diese Features ändern, wie lange User an der Plattform kleben; die
    // Wirkung ist dauerhaft (anders als die Trend-Boni).
    watchtimeMultMods: function () {
      var tt    = this.current.techtree || {};
      var nodes = (RT.techtree && RT.techtree.NODES) || {};
      var out   = [];
      for (var nid in nodes) {
        if (!Object.prototype.hasOwnProperty.call(nodes, nid)) continue;
        if (!nodes[nid].watchtimeMult) continue;
        var e = tt[nid];
        if (!e || e.status !== 'done') continue;
        out.push({ id: nid, label: nodes[nid].name, value: nodes[nid].watchtimeMult });
      }
      // Ereigniskarten: „Lobbyist annehmen" und „Kanal empfehlen" geben
      // dauerhaft Watchtime. Sie tauchen dadurch im Aufschlüsselungs-Modal
      // hinter dem ×-Chip auf, ohne dass dieses die Karten kennen muss.
      var evm = (RT.events && RT.events.wtMult) ? RT.events.wtMult() : 1;
      if (evm !== 1) {
        out.push({ id: 'events', label: '🃏 Entscheidungen', value: evm });
      }
      return out;
    },
    // Was beim Ernten greift. Ausschließlich Nodes: seit dem Wegfall des
    // Community Centers gibt es keinen befristeten Faktor mehr, der sich hier
    // dazwischenschiebt — der Multiplikator ist damit durchgehend dauerhaft,
    // und das Watchtime-Modal zeigt genau die Node-Liste und ihr Produkt.
    watchtimeMult: function () {
      var mods = this.watchtimeMultMods();
      var m    = 1;
      for (var i = 0; i < mods.length; i++) m *= mods[i].value;
      // Auf 4 Stellen runden: 1,15 × 1,15 ergibt in Fließkomma 1,3224999…,
      // was beim Abrunden der Ernte eine Watchtime verschluckt.
      return Math.round(m * 10000) / 10000;
    },

    // Watchtime pro Sekunde = User in Farm × 1 / Zyklus × Multiplikator.
    watchtimePerSec: function (farmInst) {
      if (!farmInst) return 0;
      return this.usersInFarm(farmInst) * WATCHTIME_PER_USER_PER_CYCLE
             / WATCHTIME_CYCLE_SEC * this.watchtimeMult();
    },

    // Summe der Server-Kapazität, die aktive Techtree-Nodes belegen.
    // Zählt done + in_progress + ready — sobald eine Node gestartet wird, ist
    // ihr Server-Anteil reserviert. Das verhindert User-Überläufe während Bau.
    programmCapacity: function () {
      var tt = this.current.techtree || {};
      var nodes = (RT.techtree && RT.techtree.NODES) || {};
      var total = 0;
      for (var nid in nodes) {
        if (!Object.prototype.hasOwnProperty.call(nodes, nid)) continue;
        var entry = tt[nid];
        if (!entry) continue;
        if (entry.status === 'done' || entry.status === 'in_progress' || entry.status === 'ready') {
          total += nodes[nid].server || 0;
        }
      }
      return total;
    },

    // Programm-Anteil einer Farm — kommt aus derselben Verteilung wie die User
    // (farmFills), damit beide zusammen nie über die Kapazität hinausgehen.
    programmInFarm: function (farmInst) {
      return this.farmFill(farmInst).programm;
    },

    // --- Trend ---
    // Grundinteresse: TREND_BASE_START am Anfang, linear auf 0 über
    // TREND_BASE_FADE_SEC Sekunden Phase-2-Spielzeit.
    trendGrundinteresse: function () {
      var t    = this.current.phase2Sec || 0;
      var rest = 1 - (t / TREND_BASE_FADE_SEC);
      if (rest <= 0) return 0;
      return Math.round(TREND_BASE_START * rest * 10) / 10;
    },

    // --- Netzwerkeffekt ---
    // Fertige Vertrauens-Features (White Patterns), die die STEIGUNG heben.
    // Bewusst kein Sockel: ein Vertrauens-Feature gibt heute wenig und wächst
    // mit der Plattform mit — „nicht dauerhaft +, aber langfristig".
    networkKMods: function () {
      var nodes = (RT.techtree && RT.techtree.NODES) || {};
      var out   = [];
      for (var nid in nodes) {
        if (!Object.prototype.hasOwnProperty.call(nodes, nid)) continue;
        if (!nodes[nid].networkK) continue;
        if (!this.nodeDone(nid)) continue;
        out.push({ id: nid, label: nodes[nid].name, value: nodes[nid].networkK });
      }
      // Ereigniskarten: „Hilfsorganisation prominent platzieren" und „Team
      // zustimmen" heben dieselbe Steigung wie die Vertrauens-Features.
      // Inhaltlich sind sie genau das — nur als Entscheidung statt als Node.
      var evk = (RT.events && RT.events.networkK) ? RT.events.networkK() : 0;
      if (evk) out.push({ id: 'events', label: '🃏 Entscheidungen', value: evk });
      return out;
    },
    // Die Steigung: Trend je Verzehnfachung der User.
    networkK: function () {
      var mods = this.networkKMods();
      var k    = NETWORK_K_BASE;
      for (var i = 0; i < mods.length; i++) k += mods[i].value;
      return Math.round(k * 100) / 100;
    },
    // Wie viele Dekaden über NETWORK_U0 die Plattform steht, gedeckelt.
    // Eigene Funktion, weil Leiter, Chip und Wert alle dieselbe Zahl brauchen.
    networkDecades: function (users) {
      var u = (typeof users === 'number') ? users : (this.current.users || 0);
      if (u <= NETWORK_U0) return 0;
      return Math.min(NETWORK_CAP_L, Math.log10(u / NETWORK_U0));
    },
    // Der zweite Faktor: wie viel von „da sind ja alle" noch übrig ist.
    // 1 bis zum Gipfel, dann quadratisch auf 0 bei NETWORK_FULL — waagerecht
    // am Gipfel, damit dort kein Knick entsteht (siehe Kommentar oben).
    // ⚠️ Hängt bewusst NICHT an k. Ein Vertrauens-Feature macht die Plattform
    // attraktiver, es schafft keine zusätzlichen Menschen.
    networkSaturation: function (users) {
      var u = (typeof users === 'number') ? users : (this.current.users || 0);
      if (u <= NETWORK_PEAK) return 1;
      if (u >= NETWORK_FULL) return 0;
      var t = (u - NETWORK_PEAK) / (NETWORK_FULL - NETWORK_PEAK);
      return 1 - t * t;
    },
    // Der Trend-Posten selbst. Auf das 0,1-Raster gerundet wie jeder andere,
    // damit die Aufschlüsselung im Info-Modal per Konstruktion aufgeht.
    networkEffect: function (users, k) {
      var kk = (typeof k === 'number') ? k : this.networkK();
      return Math.round(kk * this.networkDecades(users)
                           * this.networkSaturation(users) * 10) / 10;
    },
    // Gipfel erreicht — ab hier bringt Wachstum nichts mehr dazu.
    networkAtCap: function (users) {
      return this.networkDecades(users) >= NETWORK_CAP_L;
    },
    // Und darüber hinaus: die Welt füllt sich, der Posten fällt wieder.
    networkSaturating: function (users) {
      return this.networkSaturation(users) < 1;
    },
    // Die Sprossen für die Leiter im Trend-Modal: je Stufe die User-Zahl, der
    // Wert dort und ob der Spieler gerade auf oder über dieser Sprosse steht.
    // `k` optional, damit die Erklär-Karte „vorher/nachher" zwei Leitern mit
    // unterschiedlichem k nebeneinander stellen kann.
    //
    // ⚠️ `peakOnly` schneidet die Sättigungs-Sprossen ab. Die Erklär-Karten
    // brauchen das aus zwei Gründen: dort geht es um die STEIGUNG, und eine
    // Sprosse, die in beiden Leitern 0 zeigt, sagt darüber genau nichts —
    // und acht Sprossen nebeneinander sind in der Kartenbreite unlesbar.
    networkLadder: function (k, peakOnly) {
      var u    = this.current.users || 0;
      var out  = [];
      var last = NETWORK_LADDER.length - 1;
      for (var i = 0; i < NETWORK_LADDER.length; i++) {
        var step = NETWORK_LADDER[i];
        var next = NETWORK_LADDER[i + 1];
        var past = step > NETWORK_PEAK;
        if (peakOnly && past) continue;
        out.push({
          users:   step,
          value:   this.networkEffect(step, k),
          reached: u >= step,
          // „du bist hier" sitzt auf der höchsten erreichten Sprosse.
          here:    u >= step && (!next || u < next),
          // Der Gipfel trägt das MAX, nicht mehr die letzte Sprosse: dort
          // steht seit der Sättigung eine 0, und „MAX" über einer Null wäre
          // die Aussage auf den Kopf gestellt.
          isMax:   step === NETWORK_PEAK,
          past:    past,
          // Die letzte Sprosse ist die volle Welt — dort ist nichts mehr übrig.
          isFull:  i === last
        });
      }
      return out;
    },

    // Dauerhafte Verschiebungen des Ruhewerts durch Dark Patterns.
    // Das ist die EINZIGE Stelle im Spiel mit bleibender Trend-Wirkung:
    // gute Features nutzen sich ab (befristeter Modifikator), Schaden bleibt.
    // Wird aus dem Techtree abgeleitet statt gespeichert — dadurch wirkt eine
    // geänderte Balance sofort und kann nicht aus dem Tritt geraten.
    // ⚠️ Liefert seit dem Netzwerkeffekt BEIDE dauerhaften Posten — den
    // positiven aus der Plattformgröße und die negativen aus den Dark
    // Patterns. Beide gehören in den Ruhewert, und beide werden abgeleitet
    // statt gespeichert; dadurch wirkt jede Balance-Änderung sofort auch auf
    // alte Spielstände. Der Netzwerkeffekt steht vorn, weil er im Modal die
    // erste Zeile sein soll: er ist das Fundament, alles andere liegt darauf.
    trendBaseMods: function () {
      var tt    = this.current.techtree || {};
      var nodes = (RT.techtree && RT.techtree.NODES) || {};
      var out   = [];
      var net   = this.networkEffect();
      if (net) {
        out.push({ id: 'network', label: 'Netzwerkeffekt', value: net,
                   network: true });
      }
      for (var nid in nodes) {
        if (!Object.prototype.hasOwnProperty.call(nodes, nid)) continue;
        if (!nodes[nid].trendBase) continue;
        var e = tt[nid];
        if (!e || e.status !== 'done') continue;
        out.push({ id: 'base:' + nid, label: nodes[nid].name, value: nodes[nid].trendBase });
      }
      // Ereigniskarten (Phase 4). Sie stehen als EINE Zeile da und nicht je
      // Karte: die auslösenden Entscheidungen liegen einzeln im Protokoll
      // des Karten-Modals, und im Trend-Modal geht es um den Ruhewert.
      var evb = (RT.events && RT.events.trendBase) ? RT.events.trendBase() : 0;
      if (evb) {
        out.push({ id: 'base:events', label: '🃏 Entscheidungen', value: evb });
      }
      return out;
    },

    // Der Ruhewert, auf den der Trend ohne aktive Modifikatoren zuläuft.
    trendBaseValue: function () {
      var v    = this.trendGrundinteresse();
      var mods = this.trendBaseMods();
      for (var i = 0; i < mods.length; i++) v += mods[i].value;
      return Math.round(v * 10) / 10;
    },

    // Wert eines Modifikators JETZT — voll während der Haltezeit, danach
    // betragsmäßig gegen 0 abklingend. Läuft rein über Zeitstempel, damit
    // Offline-Zeit ohne Nachrechnen korrekt berücksichtigt wird.
    //
    // Immer auf 0,1 gerundet: der Trend wird überall mit einer Nachkommastelle
    // angezeigt, und nur wenn die Posten selbst auf diesem Raster liegen,
    // ergibt die Aufschlüsselung im Info-Modal exakt den Gesamtwert.
    trendModValue: function (m) {
      if (!m || !m.value) return 0;
      var now = Date.now();
      var mag = Math.abs(m.value);
      if (m.holdUntil && now > m.holdUntil) {
        mag -= ((now - m.holdUntil) / 1000) * this.trendDecayFor(m);
      }
      mag = Math.round(mag * 10) / 10;
      if (mag <= 0) return 0;
      return m.value > 0 ? mag : -mag;
    },

    // Abkling-Tempo eines Modifikators. NEGATIVE klingen vierfach schneller ab
    // als positive — die einzige Asymmetrie in dieser Richtung, und sie ist
    // Absicht.
    //
    // Grund: seit AD_TREND_EXPONENT = 3 ist der Malus am oberen Reglerende
    // doppelt so groß, und weil der Schwanz QUADRATISCH im Wert ist, wuchs er
    // dabei auf das Vierfache. Ein Banner @50 % (−10,0) hätte mit dem langsamen
    // Tempo 2.000 s zum Ausklingen gebraucht und allein 10.800 Trend-Sekunden
    // gekostet — mehr, als der gesamte Hauptbaum an positivem Trend liefert.
    // Das ist keine teure Entscheidung mehr, sondern eine unumkehrbare. Der
    // schnellere Abbau macht das Übersteuern wieder zu einem Fehler, aus dem
    // man lernen kann.
    //
    // ⚠️ Das widerspricht der früheren Festlegung "pos/neg nicht trennen" —
    // bewusst, weil sich die Grundlage geändert hat: damals war der Malus
    // klein und der Schwanz nebensächlich.
    //
    // ⚠️ OBERGRENZE für diesen Faktor: bei ×9 (0,045) würde ein Banner-Deal
    // erstmals genug einbringen, um seine eigene PR-Reparatur zu bezahlen —
    // damit fiele die Design-Aussage "Banner macht sich selbst überflüssig"
    // (CLAUDE.md §6/§7.2). Bei ×4 liegt Banner mit 40 gegen 48 €/Trend-Sekunde
    // noch darunter, aber nur mit 16 % Luft. Wer weiter hochgeht, muss die
    // Aussage nachrechnen.
    //
    // Die Unterscheidung läuft sonst über das VORZEICHEN, nicht über die Id:
    // sie braucht dadurch keine Migration für alte Spielstände.
    //
    // Eine eigene Rate am Modifikator (m.decay) schlägt beides — das nutzen
    // die PR-Kampagnen für ihren festen 20-s-Ausklang (PR_DECAY_SEC). Derselbe
    // Weg steht einer negativen Quelle offen, die einen langen Schwanz braucht
    // (Shitstorm-Event).
    trendDecayFor: function (m) {
      if (m && m.decay > 0) return m.decay;
      return (m && m.value < 0) ? TREND_DECAY_NEG_PER_SEC : TREND_DECAY_PER_SEC;
    },

    // Klingt der Modifikator schon ab? Für die Anzeige im Info-Modal.
    trendModFading: function (m) {
      return !!(m && m.holdUntil && Date.now() > m.holdUntil);
    },

    // Alle wirksamen Posten, absteigend nach Betrag. Das Grundinteresse ist
    // ein berechneter Posten und steht deshalb nicht in trendMods.
    // Gleichzeitig die Datenquelle für die Aufschlüsselung im Modal.
    activeTrendMods: function () {
      var mods = this.current.trendMods || {};
      var out  = [];
      var gi   = this.trendGrundinteresse();
      if (gi) {
        out.push({ id: 'basis', label: 'Grundinteresse', value: gi,
                   fading: true, holdUntil: 0, permanent: false });
      }
      // Dark Patterns einzeln auflisten — ein unerklärter dauerhafter Malus
      // im Ruhewert wäre für Spieler nicht nachvollziehbar.
      var bm = this.trendBaseMods();
      for (var b = 0; b < bm.length; b++) {
        out.push({ id: bm[b].id, label: bm[b].label, value: bm[b].value,
                   fading: false, holdUntil: 0, permanent: true,
                   // Der Netzwerkeffekt ist zwar dauerhaft, aber nicht
                   // „unumkehrbar" wie ein Dark Pattern — das Modal darf ihn
                   // nicht mit demselben Warn-Vermerk versehen.
                   network: !!bm[b].network });
      }
      for (var id in mods) {
        if (!Object.prototype.hasOwnProperty.call(mods, id)) continue;
        var m = mods[id];
        var v = this.trendModValue(m);
        if (!v) continue;
        out.push({ id: id, label: m.label, value: v,
                   fading: this.trendModFading(m), holdUntil: m.holdUntil || 0 });
      }
      out.sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); });
      return out;
    },

    // Der Trend selbst: Summe aller wirksamen Posten, auf ±20 geklemmt.
    trendValue: function () {
      var mods = this.activeTrendMods();
      var sum  = 0;
      for (var i = 0; i < mods.length; i++) sum += mods[i].value;
      sum = Math.round(sum * 10) / 10;
      return Math.max(TREND_MIN, Math.min(TREND_MAX, sum));
    },

    // holdSec = wie lange der volle Wert anliegt, bevor er abzuklingen beginnt.
    // 0 bzw. weggelassen heißt: klingt sofort ab.
    // decayPerSec (optional) überschreibt das Tempo aus trendDecayFor(). Nur
    // PR nutzt das bisher.
    // ⚠️ Der Wert muss aus dem BUCHUNGSwert gerechnet und hier festgehalten
    // werden — nicht laufend aus dem Restwert. Sonst wäre das Abklingen
    // exponentiell statt linear, und der Modifikator erreichte nie 0.
    setTrendMod: function (id, label, value, holdSec, decayPerSec) {
      if (!this.current.trendMods) this.current.trendMods = {};
      this.current.trendMods[id] = {
        label:     label,
        value:     value,
        holdUntil: Date.now() + (holdSec || 0) * 1000,
        decay:     decayPerSec || 0
      };
    },

    // Haltezeit verlängern, ohne den Wert anzufassen — der Werbe-Tick hält
    // damit den Malus am Leben, solange der Deal produziert.
    holdTrendMod: function (id, holdSec) {
      var m = (this.current.trendMods || {})[id];
      if (!m) return;
      var until = Date.now() + (holdSec || 0) * 1000;
      if (until > m.holdUntil) m.holdUntil = until;
    },

    removeTrendMod: function (id) {
      if (this.current.trendMods) delete this.current.trendMods[id];
    },

    // Ausgeklungene Modifikatoren wegräumen — der Tick ruft das auf.
    pruneTrendMods: function () {
      var mods = this.current.trendMods || {};
      for (var id in mods) {
        if (!Object.prototype.hasOwnProperty.call(mods, id)) continue;
        if (!this.trendModValue(mods[id])) delete mods[id];
      }
    },

    // Freie User-Plätze: Serverkapazität minus User, laufende Programme und
    // User-Modelle. Alle drei liegen auf denselben Farmen und teilen sich
    // dieselbe Kapazität.
    freeUserCapacity: function () {
      return Math.max(0, this.serverCapacityTotal() - this.current.users
                         - this.programmCapacity() - this.modelCapacityTotal());
    },

    // User-Veränderung, die ein einzelner Zyklus bringt (negativ = Abwanderung).
    trendUsersPerCycle: function () {
      var t = this.trendValue();
      if (!t) return 0;
      var n = Math.max(1, Math.floor(Math.abs(this.current.users) * Math.abs(t) / 100));
      return t < 0 ? -n : n;
    },

    // User, die die aktuell gebunkerten Stapel einbringen würden.
    // Linear pro Stapel — 5 Stapel bei +3 % sind +15 %, nicht 1,03^5.
    // Was `st` Trend-Schübe an Usern einbringen. Steht getrennt von
    // trendUsersReady(), weil der Offline-Aufholpass mit einer Stapelzahl
    // rechnet, die gar nicht in state.current steht — alles über
    // TREND_STACK_MAX hinaus wird dort direkt gutgeschrieben statt gestapelt.
    // Zwei Kopien derselben Formel wären genau die Sorte Duplikat, die beim
    // nächsten Balance-Pass auseinanderläuft.
    trendUsersFor: function (st) {
      var t = this.trendValue();
      if (t <= 0 || st <= 0) return 0;
      return Math.max(st, Math.floor(this.current.users * t / 100 * st));
    },

    trendUsersReady: function () {
      return this.trendUsersFor(this.current.trendStacks || 0);
    },

    trendShieldActive: function () { return Date.now() <  (this.current.trendShieldUntil   || 0); },
    trendShieldReady:  function () { return Date.now() >= (this.current.trendShieldReadyAt || 0); },

    // Effektive Grid-Größe pro Phase.
    //   freeCols/freeRows = Start-Freizone (0..freeCols-1 × 0..freeRows-1),
    //             gehört von Anfang an und wird nicht bezahlt.
    //   minCol/maxCol/minRow/maxRow = Render-Range inkl. der Kranz-Felder
    //             (Phase 2). Was davon kaufbar bzw. schon gekauft ist, sagt
    //             isTilePurchasable / isTileOwned — der Kranz ist die
    //             Obergrenze des Ausbaus.
    // Phase 0/1: 3×3, keine Kranz-Felder.
    // Phase 2: 5×4 frei, plus 8 Reihen Ausbaufläche in jede Richtung.
    //
    // Die Freizone ist bewusst rechteckig: Werbeagentur und Marketing-Center
    // sind 1×1 und werden mehrfach gebaut, eine 4×4-Zone verlor an ein zweites
    // Marketing-Center schon einen halben Farmplatz. 5×4 = 20 Felder tragen
    // HQ + zwei Service-Gebäude + vier Farmen, ohne dass ein Feld gekauft
    // werden muss — erst die 5. Farm kostet Land.
    gridSizeEffective: function () {
      if (this.currentPhase() < 2) {
        return { freeCols: 3, freeRows: 3, minCol: 0, maxCol: 2, minRow: 0, maxRow: 2 };
      }
      return { freeCols: 5, freeRows: 4, minCol: -8, maxCol: 12, minRow: -8, maxRow: 11 };
    },

    // Spielphase: 0 = vor Go-Live, 1 = online, jagen die ersten 1000 User,
    // 2 = nach Investor (Watchtime + Trend werden erst hier relevant),
    // 3 = ab RT.actions.PHASE3_USER_THRESHOLD Usern (KI-Labor, User-Modelle,
    //     Metadaten) — und ab Marcus' Ausschüttung,
    // 4 = ab RT.actions.PHASE4_USER_THRESHOLD Usern: die Welt schaut zurück,
    //     alle 5 Minuten eine Ereigniskarte (js/events.js). Phase 4 bringt
    //     keine neue Ressource und kein neues Gebäude — sie bringt
    //     Entscheidungen von außen.
    currentPhase: function () {
      if (!this.current.goLiveUnlocked)  return 0;
      if (!this.current.investorTriggered) return 1;
      if (!this.current.phase3Triggered) return 2;
      if (!this.current.phase4Triggered) return 3;
      return 4;
    },

    // Notification-Badge sichtbar? Ein Badge (Key aus seenBadges) zeigt, dass
    // an einem UI-Element neuer Inhalt wartet. Bei Klick wird er dauerhaft weg.
    badgeVisible: function (key) {
      return !this.current.seenBadges[key];
    },
    markSeen: function (key) {
      if (this.current.seenBadges[key]) return;
      this.current.seenBadges[key] = true;
      if (RT.bus && RT.bus.emit) RT.bus.emit('state:changed');
    },

    // Sprite-Pfad des HQ. Die Stufe ist das Maximum aus gekaufter Hardware
    // (inst.state.level) und der Phase — ab Phase 2 steht mindestens das
    // Bürogebäude aus dem Investor-Deal da, auch wenn nie ein Rechner gekauft
    // wurde. Weil buildIsoGrid() bei jedem state:changed neu zeichnet, wechselt
    // das Bild im Moment des Investor-Deals ohne eigenen Anstoß.
    hqSprite: function (inst) {
      var lvl = (inst && inst.state && inst.state.level) || 0;
      if (this.currentPhase() >= 2 && lvl < 2) lvl = 2;
      if (this.currentPhase() >= 3 && lvl < 3) lvl = 3;
      return HQ_SPRITES[Math.min(lvl, HQ_SPRITES.length - 1)];
    },

    // Sprite-Pfad einer Serverfarm nach ihrem Tier (Küken- bis Elefantenfarm,
    // Stufe 1..7 aus tierIndex()). Jede Stufe hat ihr eigenes Gebäude-Sprite.
    farmSprite: function (inst) {
      var idx = this.tierIndex((inst && inst.state && inst.state.tierId) || 'kueken');
      if (idx < 0) idx = 0;
      return FARM_SPRITES[Math.min(idx, FARM_SPRITES.length - 1)];
    },

    // Sprite-Pfad des Strom- & Wasserwerks: wechselt auf die grüne Variante,
    // sobald 'Erneuerbare Energien' erforscht ist.
    energieSprite: function () {
      return this.nodeDone('en_erneuerbar') ? ENERGY_SPRITE_GREEN : ENERGY_SPRITE_BASE;
    },

    // Logo-Redesign erforscht? Steuert, welche Logo-Variante RT.assets liefert.
    logoUpgraded: function () {
      var e = (this.current.techtree || {}).logoNeu;
      return !!(e && e.status === 'done');
    },

    // Flyerbonus aktiv: mk_flyer fertig UND wir sind noch in der 0..1000-Phase.
    flyerBonusActive: function () {
      if (this.currentPhase() >= 2) return false;
      if ((this.current.users || 0) >= 1000) return false;
      var e = (this.current.techtree || {}).mk_flyer;
      return !!(e && e.status === 'done');
    },

    // Player wird beim Onboarding (character + platform Screen) gesetzt.
    setPlayer: function (patch) {
      Object.assign(this.current.player, patch);
    },

    // Ein neuer Datenpunkt in die Sparkline-Historie schieben. Ältester fliegt raus.
    pushSparkSample: function () {
      var h = this.current.sparkHistory;
      h.money.push(this.current.money);
      if (h.money.length > 60) h.money.shift();
      h.users.push(this.current.users);
      if (h.users.length > 60) h.users.shift();
    }
  };
})(window.RT3);
