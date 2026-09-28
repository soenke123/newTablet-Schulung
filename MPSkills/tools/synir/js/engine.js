/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — engine.js   ·   Die Uhr
   ══════════════════════════════════════════════════════════════
   Das Herzstück, und der eine Punkt, an dem dieser Prototyp sich
   grundsätzlich vom Java-Original unterscheidet.

   ── Wie Filius es macht ───────────────────────────────────────
   Jedes Kabel ist dort ein Paar Threads, die an einem Puffer
   warten (wait/notify) und die Leitungslänge mit Thread.sleep()
   nachstellen. Jede Protokollschicht jedes Geräts ist noch ein
   Thread, jede Anwendung auch. Ein Netz aus 15 Geräten läuft mit
   über 150 Threads.

   Das funktioniert — aber es kostet vier Dinge, die im Unterricht
   alle vier wehtun:

     · Es läuft nie zweimal gleich. Ein Fehler, den eine Klasse
       gerade gesehen hat, lässt sich nicht noch einmal zeigen.
     · Es lässt sich nicht beschleunigen. Ein TCP-Verbindungsaufbau
       dauert, was er dauert.
     · Es lässt sich nicht anhalten und schrittweise ansehen —
       genau das, wofür man einen Simulator baut.
     · Es lässt sich nicht prüfen. Ein Test, der von der Laune des
       Schedulers abhängt, ist kein Test.

   Und im Browser gibt es überhaupt keine Threads.

   ── Wie es hier läuft ─────────────────────────────────────────
   Eine einzige Warteschlange von Ereignissen, geordnet nach
   VIRTUELLER Zeit. Kein sleep, kein Warten, kein Nebeneinander:
   die Schleife nimmt das früheste Ereignis, stellt die Uhr darauf
   und führt es aus. Ereignisse dürfen dabei neue einplanen.

   Die virtuelle Zeit hat mit der Wanduhr nur zu tun, was der
   Tempo-Regler sagt. Bei Tempo 1 vergeht eine simulierte Sekunde
   in einer echten; bei 0 steht alles; bei 0,05 kann eine Klasse
   einem ARP-Request beim Fliegen zusehen.

   ── Warum Gleichstände eine laufende Nummer brauchen ──────────
   Zwei Ereignisse zur selben Mikrosekunde müssen eine Reihenfolge
   haben, und zwar immer dieselbe. Die laufende Nummer gibt sie:
   was zuerst eingeplant wurde, läuft zuerst. Ohne das hinge das
   Ergebnis an der Sortierung des Haufens, und der Determinismus
   wäre wieder weg — nur subtiler als bei Threads.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  function Engine(opts) {
    opts = opts || {};

    let now = 0;            // virtuelle Zeit in Mikrosekunden
    let seq = 0;            // laufende Nummer für Gleichstände
    let seed = opts.seed || 12345;
    let rand = U.rng(seed);
    let steps = 0;          // wie viele Ereignisse gelaufen sind

    // Früheste Zeit zuerst; bei Gleichstand die kleinere laufende
    // Nummer. Damit ist die Reihenfolge vollständig bestimmt.
    const queue = U.Heap((a, b) => a.t !== b.t ? a.t < b.t : a.n < b.n);

    const listeners = { tick: [], event: [] };

    /* ─── Einplanen ───────────────────────────────────────────
       delay in Mikrosekunden, relativ zu jetzt. delay 0 heißt
       „gleich nach mir, aber noch in dieser Mikrosekunde" — nicht
       „sofort", denn sofort gibt es nicht: der Aufrufer läuft ja
       gerade.

       tag dient nur der Anzeige und dem gezielten Abräumen. */
    function at(delay, fn, tag, owner) {
      if (!(delay >= 0)) delay = 0;
      const ev = {
        t: now + Math.round(delay),
        n: ++seq,
        fn: fn,
        tag: tag || '',
        owner: owner || null   // Geräte-ID, damit Löschen möglich ist
      };
      queue.push(ev);
      return ev;
    }

    /* Ein eingeplantes Ereignis wieder absagen. Es aus dem Haufen
       zu entfernen wäre teuer — stattdessen wird es entwertet und
       beim Auslaufen übersprungen. Das ist das übliche Muster für
       Zeitgeber, die häufiger abgesagt als ausgelöst werden (ARP-
       Wiederholungen, Ping-Zeitüberschreitungen). */
    function cancel(ev) { if (ev) ev.dead = true; }

    /* Alles wegwerfen, was zu einem Gerät gehört. Wird gebraucht,
       wenn ein Gerät gelöscht wird: sonst läuft Sekunden später
       noch ein Zeitgeber auf ein Gerät, das es nicht mehr gibt. */
    function dropOwner(id) {
      queue.removeWhere(ev => ev.owner === id);
    }

    /* ─── Ein Ereignis ausführen ──────────────────────────────
       Gibt false zurück, wenn nichts mehr da war. */
    function step() {
      for (;;) {
        const ev = queue.pop();
        if (!ev) return false;
        if (ev.dead) continue;          // abgesagt: überspringen
        now = ev.t;                     // die Uhr FOLGT den Ereignissen
        steps++;
        try {
          ev.fn();
        } catch (e) {
          // Ein Fehler in einem Protokoll darf nicht die ganze
          // Simulation anhalten — sonst steht bei einem Tippfehler
          // im Unterricht das Netz still und niemand weiß warum.
          console.error('[sim] Ereignis "%s" ist gescheitert:', ev.tag, e);
          emit('event', { kind: 'error', tag: ev.tag, message: String(e && e.message || e) });
        }
        return true;
      }
    }

    /* Bis zu einer virtuellen Zeit laufen lassen. Das Limit an
       Ereignissen ist eine Notbremse gegen Schleifen, die sich
       selbst einplanen (ein Paket, das zwischen zwei Routern
       pendelt, wäre ohne TTL genau das). */
    function runUntil(t, maxSteps) {
      const cap = maxSteps || 200000;
      let n = 0;
      while (n < cap) {
        const head = queue.peek();
        if (!head) { now = Math.max(now, t); return n; }
        /* ⚠️ Ein abgesagtes Ereignis vorn in der Schlange wird HIER
           weggeräumt und nicht in `step`. Sonst sah die Prüfung
           unten die Zeit des toten Ereignisses, `step` übersprang
           es und führte das NÄCHSTE aus — ohne dessen Zeit je mit
           `t` verglichen zu haben. Aufgefallen mit dem cww: eine
           abgesagte ARP-Wiederholung bei 0,8 s ließ die 30-s-Frist
           eines Pings sofort ablaufen, und die Uhr sprang dabei
           vor und wieder zurück. */
        if (head.dead) { queue.pop(); continue; }
        if (head.t > t) { now = t; return n; }
        step(); n++;
      }
      console.warn('[sim] Notbremse: %d Ereignisse in einem Durchgang.', cap);
      emit('event', { kind: 'overload', steps: cap });
      return n;
    }

    /* ─── Kopplung an die Wanduhr ─────────────────────────────
       Nur hier gibt es Echtzeit. Der Rest des Programms kennt nur
       `now`. Ein Bild pro Aufruf, virtuelle Zeit = echte Zeit ×
       Tempo. Der Deckel auf dt verhindert, dass ein Tab, der im
       Hintergrund lag, beim Zurückkommen zwanzig Sekunden Netz in
       einem Rutsch abarbeitet. */
    let speed = 1;
    let running = false;
    let raf = null, lastWall = 0;

    function frame(wall) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (!lastWall) { lastWall = wall; return; }
      let dtMs = wall - lastWall;
      lastWall = wall;
      if (dtMs > 100) dtMs = 100;              // Deckel: höchstens 0,1 s je Bild
      const target = now + Math.round(dtMs * U.MS * speed);
      const n = runUntil(target);
      emit('tick', { now: now, ran: n });
    }

    function start() {
      if (running) return;
      running = true; lastWall = 0;
      raf = requestAnimationFrame(frame);
      emit('tick', { now: now, ran: 0 });
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      emit('tick', { now: now, ran: 0 });
    }

    /* Einzelschritt für die Fehlersuche und für den Unterricht:
       ein Ereignis, dann stehenbleiben. Das ist die Ansicht, in
       der man einen ARP-Request wirklich verstehen kann. */
    function stepOnce() {
      stop();
      const ok = step();
      emit('tick', { now: now, ran: ok ? 1 : 0 });
      return ok;
    }

    /* ─── Beobachter ──────────────────────────────────────────
       'tick'  — die Uhr ist weitergelaufen (für das Neuzeichnen)
       'event' — etwas Berichtenswertes ist passiert (Mitschnitt,
                 Terminal-Ausgaben, Fehler)                      */
    function on(name, fn) {
      (listeners[name] || (listeners[name] = [])).push(fn);
      return () => off(name, fn);
    }
    function off(name, fn) {
      const a = listeners[name];
      if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
    }
    function emit(name, data) {
      const a = listeners[name];
      if (!a) return;
      for (const fn of a.slice()) {
        try { fn(data); } catch (e) { console.error('[sim] Beobachter:', e); }
      }
    }

    /* ─── Zurücksetzen ────────────────────────────────────────
       Uhr auf null, Warteschlange leer, Würfel auf denselben
       Startwert. Danach läuft dasselbe Szenario wieder genau
       gleich ab — das ist die Zusage, für die die ganze Engine
       gebaut ist. */
    function reset(newSeed) {
      stop();
      queue.clear();
      now = 0; seq = 0; steps = 0;
      if (newSeed != null) seed = newSeed;
      rand = U.rng(seed);
    }

    return {
      at, cancel, dropOwner,
      step, stepOnce, runUntil,
      start, stop, reset,
      on, off, emit,
      get now()     { return now; },
      get running() { return running; },
      get pending() { return queue.size; },
      get steps()   { return steps; },
      get seed()    { return seed; },
      get speed()   { return speed; },
      set speed(v)  { speed = U.clamp(+v || 0, 0, 200); },
      // Der Würfel gehört der Engine, damit alles Zufällige am
      // Startwert hängt: MAC-Adressen, Paketverluste, Jitter.
      rand: () => rand(),
      randInt: (n) => Math.floor(rand() * n)
    };
  }

  window.Engine = Engine;
})();
