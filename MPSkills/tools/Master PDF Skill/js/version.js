/* Versionsanzeige im Menü Datei. Quelle ist allein version.json (Ordner der App).
   Online-Fassung = die dort liegende Datei. In der Windows-Fassung (Tauri,
   desktop/master-pdf) steckt eine Kopie im Installer: dann ist das die
   INSTALLIERTE Version, verglichen mit der des Installers auf dem Server
   (LATEST_URL, geschrieben von .github/workflows/master-pdf-windows.yml). */
const SITE = 'https://tablet.mps-ki.de';
const LATEST_URL = SITE + '/downloads/master-pdf/version.json';
const SKILLS_URL = SITE + '/MPSkills/';
const el = document.getElementById('file-version');
const num = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; };
const get = async url => (await (await fetch(url, { cache: 'no-store' })).json()).version;
const tauri = window.__TAURI__;
(async () => {
  if (!el) return;
  let mine;
  try { mine = await get('version.json'); } catch { return; }
  el.textContent = 'Version ' + mine;
  if (!tauri) return;
  try {
    const latest = await get(LATEST_URL);
    if (!newer(latest, mine)) { el.textContent = `Version ${mine} – aktuell`; return; }
    el.textContent = `Version ${mine} – neue Version ${latest} verfügbar (klicken)`;
    el.title = 'Öffnet MPSkills im Browser: dort „Download für Windows“, dann einfach drüberinstallieren.';
    el.classList.add('is-old');
    el.addEventListener('click', () => tauri.core.invoke('plugin:opener|open_url', { url: SKILLS_URL }));
  } catch { /* offline: nur die installierte Version zeigen */ }
})();
