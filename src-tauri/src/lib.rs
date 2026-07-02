use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod tray;

/// Id used to look the tray icon back up when updating its tooltip.
pub const TRAY_ID: &str = "blink-tray";

/// Update the tray tooltip (called from the frontend with the remaining time).
#[tauri::command]
fn set_tray_tooltip(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(&text));
    }
}

fn hotkey() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space)
}

/// Register/unregister the global shortcut. Called from the frontend once
/// settings are loaded (boot) and again whenever the toggle changes, so the
/// setting is the single source of truth rather than always-on at startup.
/// Best-effort: another app may already own this combo, or it may already be
/// in the desired state — neither should ever crash the app.
#[tauri::command]
fn set_global_shortcut_enabled(app: AppHandle, enabled: bool) {
    let gs = app.global_shortcut();
    let shortcut = hotkey();
    if enabled {
        if !gs.is_registered(shortcut) {
            if let Err(err) = gs.register(shortcut) {
                eprintln!("global shortcut registration failed (already in use?): {err}");
            }
        }
    } else if gs.is_registered(shortcut) {
        let _ = gs.unregister(shortcut);
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
        // Launch on login, off by default; toggled from the settings panel.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // Ctrl+Shift+Space toggles start/pause from any app.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("blink://hotkey-toggle", ());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            set_tray_tooltip,
            set_global_shortcut_enabled
        ])
        .setup(|app| {
            tray::build_tray(app.handle())?;
            // Registration itself is driven by the frontend (see
            // set_global_shortcut_enabled) once it knows the setting's value.
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
