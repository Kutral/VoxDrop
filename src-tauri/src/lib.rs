// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

mod audio;
mod db;
mod paste;
mod windows_hotkey;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Listener, Manager};

const DEFAULT_HOTKEY: &str = "Control+Super";
const TRAY_ID: &str = "voxdrop-tray";
const TRAY_SHOW_ID: &str = "show";
const TRAY_QUIT_ID: &str = "quit";

fn hotkey_is_modifier_only(value: &str) -> bool {
    let mut part_count = 0;

    for raw_part in value.split('+') {
        let part = raw_part.trim().to_ascii_lowercase();
        if part.is_empty() {
            continue;
        }

        part_count += 1;

        match part.as_str() {
            "control" | "ctrl" | "alt" | "option" | "shift" | "super" | "meta" | "command"
            | "cmd" => {}
            _ => return false,
        }
    }

    part_count >= 2
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn show_pill_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("pill") {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let screen_size = monitor.size();
            let scale = monitor.scale_factor();
            let pill_w = 320.0;
            let pill_h = 48.0;
            let x = ((screen_size.width as f64 / scale) - pill_w) / 2.0;
            let y = (screen_size.height as f64 / scale) - pill_h - 80.0;
            let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
        }
        let _ = window.show();
    }
}

#[tauri::command]
fn update_hotkey(app: tauri::AppHandle, new_hotkey: String) -> Result<(), String> {
    use std::str::FromStr;
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    let normalized_hotkey = new_hotkey.trim().to_string();
    windows_hotkey::set_hotkey(&normalized_hotkey);

    // Unregister whatever is currently active
    let _ = app.global_shortcut().unregister_all();

    if hotkey_is_modifier_only(&normalized_hotkey) {
        return Ok(());
    }

    // Register the new hotkey
    let new_shortcut = Shortcut::from_str(&normalized_hotkey)
        .map_err(|e| format!("Invalid shortcut format: {}", e))?;

    app.global_shortcut()
        .register(new_shortcut)
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(std::sync::Mutex::new(audio::AudioState::default()))
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_SHOW_ID => show_main_window(app),
            TRAY_QUIT_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:voxdrop.db", db::get_migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            update_hotkey,
            audio::start_recording,
            audio::stop_recording,
            audio::get_audio_level,
            audio::mute_system,
            audio::unmute_system,
            paste::paste_text
        ]);

    builder = builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                use tauri_plugin_global_shortcut::ShortcutState;
                // Since Voxdrop only uses ONE global hotkey, we can trigger on any match.
                match event.state() {
                    ShortcutState::Pressed => {
                        let _ = app.emit("shortcut-down", ());
                    }
                    ShortcutState::Released => {
                        let _ = app.emit("shortcut-up", ());
                    }
                }
            })
            .build(),
    );

    builder = builder.setup(|app| {
        let tray_menu = MenuBuilder::new(app)
            .text(TRAY_SHOW_ID, "Open VoxDrop")
            .separator()
            .text(TRAY_QUIT_ID, "Quit")
            .build()?;

        TrayIconBuilder::with_id(TRAY_ID)
            .menu(&tray_menu)
            .show_menu_on_left_click(false)
            .tooltip("VoxDrop")
            .icon(app.default_window_icon().cloned().ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::Other, "Missing app icon")
            })?)
            .build(app)?;

        windows_hotkey::install(app.handle().clone());
        update_hotkey(app.handle().clone(), DEFAULT_HOTKEY.to_string())
            .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err))?;

        // Pre-warm audio subsystem
        let audio_state = app.state::<std::sync::Mutex<audio::AudioState>>();
        audio::setup_audio(&audio_state).map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err))?;

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

        let app_handle3 = app.handle().clone();
        app.listen("shortcut-down", move |_event| {
            show_pill_window(&app_handle3);

            // Immediate recording start and system mute in Rust
            let audio_state = app_handle3.state::<std::sync::Mutex<audio::AudioState>>();
            let _ = audio::start_recording_internal(&audio_state);
            let did_mute = audio::mute_system_internal().unwrap_or(false);
            
            // Notify frontend about the mute state so it can unmute later
            let _ = app_handle3.emit("audio-muted", did_mute);
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
