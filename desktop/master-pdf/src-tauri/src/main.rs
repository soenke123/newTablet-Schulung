// Master PDF Skill für Windows: eine Tauri-Hülle um die Web-App aus
// MPSkills/tools/Master PDF Skill (prepare.mjs kopiert sie nach dist/).
// Rust macht nur, was der Browser nicht kann: die PDF lesen, mit der
// Windows das Programm gestartet hat (Doppelklick / „Öffnen mit“).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

/// Erste Datei aus der Befehlszeile, die es gibt (Windows übergibt den Pfad als argv[1]).
fn launch_file() -> Option<PathBuf> {
    std::env::args_os().skip(1).map(PathBuf::from).find(|p| p.is_file())
}

/// Name der Startdatei oder null.
#[tauri::command]
fn launch_file_name() -> Option<String> {
    launch_file().and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
}

/// Inhalt der Startdatei als ArrayBuffer (roh, nicht als JSON-Zahlenliste).
#[tauri::command]
fn launch_file_bytes() -> Result<tauri::ipc::Response, String> {
    let path = launch_file().ok_or("keine Datei")?;
    std::fs::read(path).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![launch_file_name, launch_file_bytes])
        .run(tauri::generate_context!())
        .expect("Master PDF Skill konnte nicht starten");
}
