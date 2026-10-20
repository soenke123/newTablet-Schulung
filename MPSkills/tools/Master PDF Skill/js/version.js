/* Versionsanzeige im Menü Datei. Quelle ist allein version.json (Ordner der App).
   Online-Fassung = die dort liegende Datei. In der Windows-Fassung (später)
   steckt eine Kopie im Installer: dann ist das die INSTALLIERTE Version, und
   ONLINE_URL liefert die aktuelle zum Vergleich. */
const ONLINE_URL = 'https://tablet.mps-ki.de/MPSkills/tools/Master%20PDF%20Skill/version.json';
const el = document.getElementById('file-version');
const num = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; };
const get = async url => (await (await fetch(url, { cache: 'no-store' })).json()).version;
const desktop = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
(async () => {
  if (!el) return;
  let mine;
  try { mine = await get('version.json'); } catch { return; }
  el.textContent = 'Version ' + mine;
  if (!desktop) return;
  try {
    const latest = await get(ONLINE_URL);
    if (newer(latest, mine)) { el.textContent = `Version ${mine} – neue Version ${latest} verfügbar`; el.classList.add('is-old'); }
    else el.textContent = `Version ${mine} – aktuell`;
  } catch { /* offline: nur die installierte Version zeigen */ }
})();
