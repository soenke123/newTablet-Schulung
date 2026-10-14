/* Tokenisierung, Stopwörter, einfache Grundform-Erkennung. Reine Textverarbeitung, kein Modellwissen. */
const STOP = new Set(('der die das den dem des ein eine einen einem einer eines und oder aber sondern denn doch ist sind war waren wird werden wurde wurden ' +
  'hat haben hatte hatten gibt gab es er sie ihn ihm ihr ihre ihren ihrem ihrer ihres sein seine seinen seinem seiner seines man wir uns ich du dich mich mir dir ' +
  'in im ins an am auf aus bei beim mit nach von vom zu zum zur für über unter um vor hinter neben durch gegen ohne bis als wie wenn weil damit dass so auch nicht ' +
  'kein keine keinen keiner nur noch schon sehr viel viele vielen oft immer wieder dann da dort hier heute jeden jede jeder jedes alle allem allen alles dabei deshalb ' +
  'danach dazu darin davon darauf dafür sich selbst einmal manchmal gern gerne sollte sollten soll muss müssen kann können darf will wollen wer was wo wann warum wie ' +
  'welche welcher welches welchen diese dieser dieses diesen andere anderen anderer anderes ganz fast etwas jemand nichts zuerst zurück herum hinaus herunter ' +
  'eigenen eigenes eigene eigener eigen hin her mehr weniger wenig ab weit kurz lang gut neue neues neuen neu zusammen miteinander denen deren dessen sowie ' +
  'macht machen mal ja nein bitte gehört ob unser unsere unserem unserer euer eure')
  .split(/\s+/));

const SUFFIXES = ['en', 'n', 'e', 's', 'er', 'es', 'ern'];

function tokenize(body) {
  const out = [];
  const re = /[A-Za-zÄÖÜäöüß0-9]+(?:-[A-Za-zÄÖÜäöüß0-9]+)*|[.!?]|[,;:]/g;
  let m, sent = 0, atStart = true;
  while ((m = re.exec(body))) {
    const raw = m[0];
    if (/^[.!?]$/.test(raw)) { out.push({ t: '.', raw: '.', punct: true, sent }); sent++; atStart = true; continue; }
    if (/^[,;:]$/.test(raw)) { out.push({ t: ',', raw: ',', punct: true, sent }); continue; }
    out.push({ t: raw.toLowerCase(), raw, punct: false, sent, start: atStart });
    atStart = false;
  }
  return out;
}

const isContentTok = t => !t.punct && !STOP.has(t.t) && !/^\d+$/.test(t.t) && t.t.length > 1;

/* Anzeigeform für Wörter in Listen/Chips (Kandidaten, Kontext, Nachbarn) — großgeschrieben, da die meisten
   Inhaltswörter hier Substantive sind; der fließende Antworttext nutzt stattdessen die Originalschreibung (ngram.js pieces()). */
function showWord(w) { return w.charAt(0).toUpperCase() + w.slice(1); }

/* Grundform: Endung nur abschneiden, wenn der Stamm selbst im Korpus vorkommt (formFreq). Pro Korpus neu erzeugen. */
function createLemmatizer(formFreq) {
  const cache = new Map();
  return function lemma(w) {
    if (cache.has(w)) return cache.get(w);
    let best = w;
    for (const s of SUFFIXES) {
      if (w.length - s.length >= 3 && w.endsWith(s)) {
        const b = w.slice(0, -s.length);
        if (formFreq.has(b)) { best = b; break; }
      }
    }
    cache.set(w, best);
    return best;
  };
}
