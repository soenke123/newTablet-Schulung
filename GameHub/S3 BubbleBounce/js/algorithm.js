// Der "Algorithmus": simuliert einen Social-Media-Empfehlungs-Algo.
// Jede Interaktion (Landen auf grün oder Kontakt mit rot) erhöht das
// Gewicht der Kategorie. Auswahl neuer Plattformen zieht gewichtet —
// mit einem BASE_WEIGHT, der garantiert, dass keine Kategorie je auf 0
// fällt (analog: auch in echten Feeds tauchen ab und zu andere Themen
// auf, aber deutlich seltener).
//
// Recency-Fenster: gezählt werden nur die letzten WINDOW Interaktionen.
// Ältere Hits fallen hinten raus (FIFO), damit der Feed sich mit dem
// aktuellen Verhalten mitdreht — springt der Spieler eine Weile gezielt
// auf gute Quellen, kippt die Filterblase wieder zurück.
(function(){
  "use strict";
  const FE = window.FE = window.FE || {};

  const BASE_WEIGHT = 2;   // Mindest-Sichtbarkeit jeder Kategorie (Floor)
  const BUMP        = 1;   // Zuwachs pro Interaktion
  const WINDOW      = 90;  // gleitendes Fenster: nur die letzten N Hits zählen

  let interactions = {};   // id -> count (gespiegeltes Aggregat des Fensters)
  let recent = [];         // FIFO der letzten Kategorie-IDs, max WINDOW Einträge
  let history = [];        // Array<{ probs: {catId: pct, ...} }> — Snapshot pro Interaktion

  function reset(){
    interactions = {};
    recent = [];
    history = [];
    for (const c of FE.categories.ALL) interactions[c.id] = 0;
    snapshot();  // Ausgangsstand (uniform 1/N)
  }

  // Friert die aktuelle Kategorien-Verteilung als Zeitpunkt ein.
  // Wird bei reset() und nach jeder Interaktion aufgerufen — der
  // Endscreen kann daraus einen Verlaufs-Graphen zeichnen.
  function snapshot(){
    const probs = {};
    const cats = FE.categories.ALL;
    let total = 0;
    const weights = cats.map(c => {
      const w = (interactions[c.id] || 0) + BASE_WEIGHT;
      total += w; return w;
    });
    cats.forEach((c, i) => { probs[c.id] = weights[i] / total; });
    history.push({ probs });
  }

  function getHistory(){ return history; }

  // "Ausgangs-Wahrscheinlichkeit" jeder Kategorie am Rundenbeginn.
  // Bei uniformem BASE_WEIGHT und leerem interactions ist das genau 1/N.
  // Wird vom Endscreen als "Vorher"-Balken benötigt.
  function startProbability(){
    return 1 / FE.categories.ALL.length;
  }

  // Aktuelle Wahrscheinlichkeit jeder Kategorie im GLOBALEN Pool
  // (unabhängig davon, ob gerade nur good/bad gezogen wird). Das ist
  // die "Nachher"-Verteilung: was würde JETZT gezogen, wenn wir aus
  // allen Kategorien wählen würden?
  function currentProbabilities(){
    const cats = FE.categories.ALL;
    let total = 0;
    const weights = cats.map(c => {
      const w = (interactions[c.id] || 0) + BASE_WEIGHT;
      total += w; return w;
    });
    return cats.map((c, i) => ({ cat: c, pct: weights[i] / total }));
  }

  function recordInteraction(catId){
    if (interactions[catId] == null) interactions[catId] = 0;
    interactions[catId] += BUMP;
    recent.push(catId);
    if (recent.length > WINDOW){
      const dropped = recent.shift();
      interactions[dropped] -= BUMP;
      if (interactions[dropped] < 0) interactions[dropped] = 0;
    }
    snapshot();
  }

  // Zieht gewichtet aus dem übergebenen Kategorien-Pool.
  // pool: Array<Category>. Gibt eine Kategorie zurück.
  function pickFrom(pool){
    let total = 0;
    for (const c of pool) total += (interactions[c.id] || 0) + BASE_WEIGHT;
    let r = Math.random() * total;
    for (const c of pool){
      const w = (interactions[c.id] || 0) + BASE_WEIGHT;
      if ((r -= w) <= 0) return c;
    }
    return pool[pool.length - 1];
  }

  // Verteilung für den Filterblasen-Screen. Nur Kategorien mit
  // mindestens einer Interaktion, sortiert absteigend.
  function getDistribution(){
    const items = [];
    let total = 0;
    for (const c of FE.categories.ALL){
      const n = interactions[c.id] || 0;
      if (n > 0){ items.push({ cat: c, count: n }); total += n; }
    }
    for (const it of items) it.pct = total > 0 ? it.count / total : 0;
    items.sort((a,b) => b.count - a.count);
    return { items, total };
  }

  // Für Coaching-Text: höchster Anteil einer schlechten Kategorie.
  function worstBadShare(){
    const { items, total } = getDistribution();
    if (total === 0) return { cat: null, pct: 0 };
    let worst = { cat: null, pct: 0 };
    for (const it of items){
      if (it.cat.type === 'bad' && it.pct > worst.pct) worst = { cat: it.cat, pct: it.pct };
    }
    return worst;
  }

  // Aggregierter Anteil aller "good" Kategorien.
  function goodShare(){
    const { items, total } = getDistribution();
    if (total === 0) return 0;
    let s = 0;
    for (const it of items) if (it.cat.type === 'good') s += it.count;
    return s / total;
  }

  reset();

  FE.algorithm = {
    reset, recordInteraction, pickFrom,
    getDistribution, worstBadShare, goodShare,
    startProbability, currentProbabilities,
    getHistory,
    BASE_WEIGHT, WINDOW
  };
})();
