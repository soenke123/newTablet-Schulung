/* ══════════════════════════════════════════════════════════════
   MPSkills — insel.js   ·   Die eigene Insel
   ══════════════════════════════════════════════════════════════
   Die einzige Seite in MPSkills, auf der kein Raum steht. Ein Kind
   öffnet sie, sieht seine Insel und übt darauf die Units, die ihm
   Lehrkräfte über die Jahre freigespielt haben (Migration 0136).

   ── Warum eine eigene Seite ───────────────────────────────────
   j.html ist die Tür in einen Raum: Code abtippen, beitreten,
   mitmachen. Hier gibt es keinen Code, keine Lehrkraft und keinen
   Ablauf. Das in dieselbe Seite zu legen hieße, in j.js überall
   „falls kein Raum" zu schreiben — und die Hälfte davon wäre nach
   der zweiten Änderung falsch.

   Das WERKZEUG ist dasselbe: tools/wordisland/tool.js, in seiner
   dritten Rolle (`solo`). Es teilt sich mit dem Raum-Spiel die
   Karte, den Antwortweg und die Fehlertexte — was hier steht, ist
   nur der Rahmen darum.

   ── Wessen Insel ──────────────────────────────────────────────
   Angemeldet: die des Kontos, der Server findet sie über auth.uid().
   Abgemeldet: die des Geräts, über den Token aus lib/room.js.

   Zwei getrennte Datensätze, die sich nie treffen. Meldet sich
   jemand mitten auf der Seite an oder ab, wird die Insel deshalb
   neu geholt statt weitergeführt — sonst stünde nach dem Anmelden
   die Insel des Vormittagskurses da.
   ══════════════════════════════════════════════════════════════ */

'use strict';

/* Der ZWEITE Riegel gegen das Mitzoomen der Seite. Der erste steht
   als maximum-scale im Kopf von insel.html; auf dem iPad beachtet
   Safari den bei einer Kneifgeste nicht zuverlässig, und dann zoomt
   der Finger die Seite statt der Insel (Regel:
   feedback_ios_viewport_checklist). */
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
}

let toastTimer = null;
function toast(message, kind) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show' + (kind === 'error' ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}

const host = () => document.getElementById('inselHost');

let tool = null;
let laden = false;

function unmountTool() {
  if (!tool) return;
  try { tool.unmount(); } catch (e) { console.warn('[mpskills] unmount:', e.message); }
  tool = null;
  document.body.classList.remove('inselseite--voll');
}

/* Noch keine Insel. Das ist kein Fehler, sondern der Normalfall vor
   der ersten Wordisland-Stunde — und der Text sagt deshalb, was
   passieren muss, und nicht, was fehlt. */
function renderLeer() {
  host().innerHTML = `
    <main class="wrap wrap--narrow">
      <div class="card">
        <h1 class="card-h">Deine Insel gibt es noch nicht</h1>
        <p>Sie entsteht von selbst, sobald du bei einer <strong>Myth-of-Wordisland</strong>-Stunde
           dabei warst. Jede Unit, die deine Lehrkraft dort spielt, kommt danach als
           Eier auf deine Insel — und bleibt dort, auch wenn der Raum längst abgelaufen ist.</p>
        <p><a class="btn btn--primary" href="index.html">Zur Startseite</a></p>
      </div>
    </main>`;
}

function renderFehler(text) {
  host().innerHTML = `
    <main class="wrap wrap--narrow">
      <div class="card">
        <div class="msg msg--err">${text}</div>
        <button type="button" class="btn" onclick="location.reload()">Noch einmal</button>
      </div>
    </main>`;
}

async function oeffne() {
  if (laden) return;
  laden = true;
  unmountTool();
  host().innerHTML = '<main class="wrap"><p class="booting">Lade …</p></main>';

  try {
    const token = window.MPRoom.soloToken();

    /* Erst fragen, ob es überhaupt eine gibt. Das Werkzeug wiegt mit
       seinen neun Bildern ein halbes Megabyte — es zu laden, um dann
       „hier ist noch nichts" anzuzeigen, wäre auf einem Schul-WLAN
       eine gefühlte Ewigkeit für eine Absage. */
    const r = await window.MPRoom.rpc('wi_solo_open', { p_token: token ?? null });
    if (!r || !r.ok) {
      // 404 heißt hier fast immer: Migration 0136 ist noch nicht
      // eingespielt (Regel: feedback_missing_migration_looks_like_network).
      renderFehler(window.MPTool.errText(r?.error || 'network'));
      return;
    }
    if (!r.learner) { renderLeer(); return; }

    const impl = await window.MPTool.load('wordisland', 'wordisland');

    const ctx = window.MPTool.makeCtx({
      actions: window.MPTool.soloActions(token),
      title:   'Meine Insel',
      toast:   (m, err) => toast(m, err ? 'error' : '')
    });

    host().innerHTML = '<div id="inselBox"></div>';
    document.body.classList.add('inselseite--voll');
    tool = impl;
    tool.mount(document.getElementById('inselBox'), ctx);
  } catch (e) {
    console.error('[mpskills] Insel:', e);
    renderFehler('Die Insel lässt sich gerade nicht laden.');
  } finally {
    laden = false;
  }
}

/* An- oder Abmeldung in diesem oder einem anderen Tab: die Insel
   gehört dann jemand anderem. Komplett neu holen statt
   weiterzuführen — der Lernstand des Geräts darf nicht in einem
   Konto landen und umgekehrt. */
window.addEventListener('lernwelt:session-changed', () => { oeffne(); });

(async function boot() {
  window.MPUserBar?.mount();
  await (window.waitForSession?.() ?? Promise.resolve());
  oeffne();
})();
