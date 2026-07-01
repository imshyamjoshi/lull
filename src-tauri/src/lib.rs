use tauri::{AppHandle, Manager, WindowEvent};

mod tray;

/// Id used to look the tray icon back up when updating its tooltip.
pub const TRAY_ID: &str = "lull-tray";

/// Update the tray tooltip (called from the frontend with the remaining time).
#[tauri::command]
fn set_tray_tooltip(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(&text));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // One running copy only. A second launch focuses the existing main window.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        // Persist settings to a single JSON file in the app config dir.
        .plugin(tauri_plugin_store::Builder::default().build())
        // Optional native notifications at transitions (gated by settings in the UI).
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![set_tray_tooltip])
        .setup(|app| {
            tray::build_tray(app.handle())?;
            Ok(())
        })
        // Close-to-tray: closing the main window hides it instead of quitting.
        // Quit is available from the tray menu.
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
