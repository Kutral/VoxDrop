// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

mod audio;
mod db;
mod paste;

use tauri::{Manager, Emitter, Listener};

#[tauri::command]
fn update_hotkey(app: tauri::AppHandle, new_hotkey: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    use std::str::FromStr;

    // Unregister whatever is currently active
    let _ = app.global_shortcut().unregister_all();

    // Register the new hotkey
    let new_shortcut = Shortcut::from_str(&new_hotkey)
        .map_err(|e| format!("Invalid shortcut format: {}", e))?;
    
    app.global_shortcut().register(new_shortcut)
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(std::sync::Mutex::new(audio::AudioState::default()))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:voxdrop.db", db::get_migrations()).build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            update_hotkey,
            audio::start_recording,
            audio::stop_recording,
            paste::paste_text
        ]);

    builder = builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                use tauri_plugin_global_shortcut::ShortcutState;
                // Since Voxdrop only uses ONE global hotkey, we can trigger on any match.
                match event.state() {
                    ShortcutState::Pressed => {
                        if let Some(window) = app.get_webview_window("pill") {
                            if let Ok(Some(monitor)) = window.primary_monitor() {
                                let screen_size = monitor.size();
                                let scale = monitor.scale_factor();
                                let pill_w = 320.0;
                                let pill_h = 48.0;
                                let x = ((screen_size.width as f64 / scale) - pill_w) / 2.0;
                                let y = (screen_size.height as f64 / scale) - pill_h - 80.0; // 80px from bottom to clear taskbar
                                let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
                            }
                            let _ = window.show();
                        }
                        let _ = app.emit("shortcut-down", ());
                    }
                    ShortcutState::Released => {
                        let _ = app.emit("shortcut-up", ());
                    }
                }
            })
            .build()
    );

    builder = builder.setup(|app| {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        let default_shortcut = tauri_plugin_global_shortcut::Shortcut::new(Some(tauri_plugin_global_shortcut::Modifiers::CONTROL | tauri_plugin_global_shortcut::Modifiers::SHIFT), tauri_plugin_global_shortcut::Code::Space);
        let _ = app.global_shortcut().register(default_shortcut);

        if let Some(window) = app.get_webview_window("pill") {
            let _ = window.hide();
            let _ = window.set_always_on_top(true);
        }

        // Listen for pill-hide events from the frontend to hide the window reliably
        let app_handle = app.handle().clone();
        app.listen("pill-hide", move |_event| {
            if let Some(window) = app_handle.get_webview_window("pill") {
                let _ = window.hide();
            }
        });

        // Relay history-update from pill window to all windows (JS emit only reaches Rust)
        let app_handle2 = app.handle().clone();
        app.listen("history-update", move |event| {
            // Re-broadcast to all webview windows so main window receives it
            let _ = app_handle2.emit("history-sync", event.payload());
        });

        Ok(())
    });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
