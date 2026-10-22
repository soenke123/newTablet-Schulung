/* Nur in der Windows-Fassung (Tauri, desktop/master-pdf) geladen: öffnet die
   PDF, mit der Windows das Programm gestartet hat (Doppelklick, „Öffnen mit“).
   Liefert true, wenn eine Datei geöffnet wurde. */
export async function openLaunchFile(openFiles) {
  const { invoke } = window.__TAURI__.core;
  const name = await invoke('launch_file_name');
  if (!name) return false;
  const bytes = await invoke('launch_file_bytes');
  const type = /\.pdf$/i.test(name) ? 'application/pdf' : '';
  await openFiles([new File([bytes], name, { type })], { replace: true });
  return true;
}

/* Fenster schließen mit ungesicherter Arbeit: Speichern · Nicht speichern ·
   Weiter arbeiten. (beforeunload gilt in der Tauri-Hülle nicht für das
   Schließen des Fensters.) isDirty(): gibt es Nicht-Exportiertes; save():
   startet den Export, danach ist isDirty() false, wenn er geklappt hat. */
export function guardClose({ isDirty, save }) {
  const win = window.__TAURI__.window.getCurrentWindow();
  let asking = false;
  const ask = () => new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.setAttribute('aria-labelledby', 'close-title');
    dlg.innerHTML = '<form method="dialog"><h2 id="close-title">Noch nicht gespeichert</h2><p class="dialog-hint">Die Änderungen am Dokument sind noch nicht als PDF exportiert. Sie gehen verloren, wenn du das Programm jetzt schließt.</p><div class="dialog-actions"><button value="stay" class="button">Weiter arbeiten</button><span class="dialog-spacer"></span><button value="discard" class="button danger-text">Nicht speichern</button><button value="save" class="button primary">Speichern</button></div></form>';
    dlg.addEventListener('close', () => { dlg.remove(); resolve(dlg.returnValue || 'stay'); });
    dlg.addEventListener('cancel', () => { dlg.returnValue = 'stay'; });
    document.body.append(dlg);
    dlg.showModal();
  });
  return win.onCloseRequested(async event => {
    if (!isDirty()) return;
    event.preventDefault();
    if (asking) return;
    asking = true;
    try {
      const choice = await ask();
      if (choice === 'discard') return void (await win.destroy());
      if (choice === 'save') {
        await save();
        if (!isDirty()) await win.destroy();
      }
    } finally { asking = false; }
  });
}
