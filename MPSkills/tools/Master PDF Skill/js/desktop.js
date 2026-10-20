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
