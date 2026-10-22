// Kopiert die Web-App aus MPSkills/tools/Master PDF Skill nach dist/ (das
// packt Tauri in die .exe) und übernimmt die Versionsnummer aus deren
// version.json in tauri.conf.json und Cargo.toml. Nur was die App zum
// Laufen braucht – keine Tests, Doku, Schaufenster-Dateien.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '../../MPSkills/tools/Master PDF Skill');
const dist = join(here, 'dist');
const KEEP = ['index.html', 'version.json', 'site.webmanifest', 'MasterPDFSkill Logo.png', 'css', 'js', 'lib', 'icons'];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const name of KEEP) {
  if (!existsSync(join(app, name))) throw new Error(`fehlt in der App: ${name}`);
  cpSync(join(app, name), join(dist, name), { recursive: true });
}

// „1.0“ → „1.0.0“: Tauri und der Windows-Installer wollen drei Zahlen.
const version = JSON.parse(readFileSync(join(app, 'version.json'), 'utf8')).version;
const semver = [...String(version).split('.'), '0', '0'].slice(0, 3).map(n => parseInt(n, 10) || 0).join('.');
// Nur die Zeile mit der Version ersetzen und nur schreiben, wenn sie sich
// ändert – sonst sieht git im Build geänderte Dateien.
const setVersion = (file, re, line) => {
  const path = join(here, file), old = readFileSync(path, 'utf8'), neu = old.replace(re, line);
  if (neu !== old) writeFileSync(path, neu);
};
setVersion('src-tauri/tauri.conf.json', /^  "version": ".*",$/m, `  "version": "${semver}",`);
setVersion('src-tauri/Cargo.toml', /^version = ".*"$/m, `version = "${semver}"`);

console.log(`Master PDF Skill ${version} (${semver}) nach dist/ kopiert`);
