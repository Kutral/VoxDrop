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
use tauri::{Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_HOTKEY: &str = "Control+Super";
const DEFAULT_WINDOW_WIDTH: f64 = 720.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 780.0;
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

fn force_present_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.set_skip_taskbar(false);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = window.set_always_on_top(true);
    let _ = window.set_always_on_top(false);

    #[cfg(windows)]
    {
        match window.hwnd() {
            Ok(hwnd) => {
                eprintln!("[window] presenting hwnd={hwnd:?}");
                let handle = hwnd.0 as windows_sys::Win32::Foundation::HWND;
                unsafe {
                    windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                        handle,
                        windows_sys::Win32::UI::WindowsAndMessaging::SW_RESTORE,
                    );
                    windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                        handle,
                        windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOW,
                    );
                    windows_sys::Win32::UI::WindowsAndMessaging::SetWindowPos(
                        handle,
                        windows_sys::Win32::UI::WindowsAndMessaging::HWND_TOPMOST,
                        0,
                        0,
                        0,
                        0,
                        windows_sys::Win32::UI::WindowsAndMessaging::SWP_NOMOVE
                            | windows_sys::Win32::UI::WindowsAndMessaging::SWP_NOSIZE
                            | windows_sys::Win32::UI::WindowsAndMessaging::SWP_SHOWWINDOW,
                    );
                    windows_sys::Win32::UI::WindowsAndMessaging::SetWindowPos(
                        handle,
                        windows_sys::Win32::UI::WindowsAndMessaging::HWND_NOTOPMOST,
                        0,
                        0,
                        0,
                        0,
                        windows_sys::Win32::UI::WindowsAndMessaging::SWP_NOMOVE
                            | windows_sys::Win32::UI::WindowsAndMessaging::SWP_NOSIZE
                            | windows_sys::Win32::UI::WindowsAndMessaging::SWP_SHOWWINDOW,
                    );
                    windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(handle);
                }
            }
            Err(err) => eprintln!("[window] hwnd unavailable: {err}"),
        }
    }
}

/// Clamp the window into the monitor's work area (screen minus taskbar).
/// A window taller than the work area gets pushed off-screen by Windows,
/// hiding the title bar and its minimize/close buttons.
fn fit_window_to_work_area<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let monitor = match window.current_monitor() {
        Ok(Some(monitor)) => monitor,
        _ => match window.primary_monitor() {
            Ok(Some(monitor)) => monitor,
            _ => return,
        },
    };
    let Ok(outer) = window.outer_size() else {
        return;
    };
    let Ok(inner) = window.inner_size() else {
        return;
    };
    let work = monitor.work_area();
    // Use the monitor's scale: the window's own scale_factor can still report
    // the creation-time (pre-WM_DPICHANGED) value during early startup.
    let scale = monitor.scale_factor();

    // `set_size` sets the client size while `outer_size` includes the title bar
    // and borders — reserve that chrome so the visible frame fits the work area.
    let chrome_width = outer.width.saturating_sub(inner.width);
    let chrome_height = outer.height.saturating_sub(inner.height);

    let available_inner_width = work.size.width.saturating_sub(chrome_width);
    let available_inner_height = work.size.height.saturating_sub(chrome_height);

    // Preferred size from the window config at the current scale — creation-time
    // DPI quirks can leave the window smaller than configured, and a config size
    // taller than the work area gets its title bar pushed off-screen by Windows.
    let desired_inner_width = (DEFAULT_WINDOW_WIDTH * scale) as u32;
    let desired_inner_height = (DEFAULT_WINDOW_HEIGHT * scale) as u32;

    let target_inner_width = desired_inner_width.min(available_inner_width);
    let target_inner_height = desired_inner_height.min(available_inner_height);

    if target_inner_width != inner.width || target_inner_height != inner.height {
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
            target_inner_width,
            target_inner_height,
        )));
    }

    let final_outer_width = target_inner_width + chrome_width;
    let final_outer_height = target_inner_height + chrome_height;
    let x = work.position.x + ((work.size.width as i32 - final_outer_width as i32) / 2).max(0);
    let y = work.position.y + ((work.size.height as i32 - final_outer_height as i32) / 2).max(0);
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, y)));
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        eprintln!("[window] show_main_window");
        force_present_window(&window);
    } else {
        eprintln!("[window] main missing");
    }
}

fn ensure_pill_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<tauri::WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window("pill") {
        return Some(window);
    }

    let builder = WebviewWindowBuilder::new(app, "pill", WebviewUrl::App("index.html".into()))
        .title("Voxdrop Pill")
        .inner_size(320.0, 48.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .resizable(false)
        .transparent(true);

    match builder.build() {
        Ok(window) => {
            eprintln!("[window] created pill");
            Some(window)
        }
        Err(err) => {
            eprintln!("[window] pill create failed: {err}");
            None
        }
    }
}

fn position_and_show_pill<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
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

fn show_pill_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("pill") {
        position_and_show_pill(&window);
        return;
    }

    // Pill was never created (or creation failed earlier): build it on the main
    // thread, then position and show it.
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = ensure_pill_window(&handle) {
            position_and_show_pill(&window);
        }
    });
}

#[tauri::command]
fn update_hotkey(app: tauri::AppHandle, new_hotkey: String) -> Result<(), String> {
    use std::str::FromStr;
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    let normalized_hotkey = new_hotkey.trim().to_string();

    // Unregister whatever is currently active
    let _ = app.global_shortcut().unregister_all();

    if hotkey_is_modifier_only(&normalized_hotkey) {
        windows_hotkey::set_hotkey(&normalized_hotkey);
        return Ok(());
    }

    windows_hotkey::set_hotkey("");

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

        // Pre-warm CPAL device enumeration cache on startup without opening a stream,
        // so that the microphone indicator doesn't show "in use" when idle.
        std::thread::spawn(move || {
            use cpal::traits::{HostTrait, DeviceTrait};
            let host = cpal::default_host();
            if let Some(device) = host.default_input_device() {
                if let Ok(name) = device.name() {
                    eprintln!("[audio] Pre-warmed CPAL input device cache for: {}", name);
                }
            }
        });

        if let Some(window) = app.get_webview_window("main") {
            eprintln!(
                "[window] main visible={:?} size={:?} pos={:?}",
                window.is_visible(),
                window.outer_size(),
                window.outer_position()
            );
            force_present_window(&window);
            fit_window_to_work_area(&window);
        } else {
            eprintln!("[window] main window was not created from config");
        }

        // Re-fit once the window has settled: a late WM_DPICHANGED rescale right
        // after launch can push the frame back outside the work area.
        let app_handle5 = app.handle().clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            if let Some(window) = app_handle5.get_webview_window("main") {
                fit_window_to_work_area(&window);
            }
        });

        // Pre-create the dictation pill in the background (hidden) so the first
        // hotkey press doesn't pay WebView2 window-creation latency. Deferred a
        // couple of seconds and built on the main thread to avoid the startup
        // window-creation failures that lazy creation in config caused on Windows.
        let app_handle4 = app.handle().clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(2));
            if app_handle4.get_webview_window("pill").is_some() {
                return;
            }
            let handle = app_handle4.clone();
            let _ = app_handle4.run_on_main_thread(move || {
                if handle.get_webview_window("pill").is_none() && ensure_pill_window(&handle).is_some() {
                    eprintln!("[window] pre-created pill");
                }
            });
        });

        // Listen for pill-hide events from the frontend to hide the window once
        // its exit animation finished. A hidden webview stops compositing; an
        // offscreen-but-visible one kept rendering in the background forever.
        let app_handle = app.handle().clone();
        app.listen("pill-hide", move |_event| {
            if let Some(window) = app_handle.get_webview_window("pill") {
                let _ = window.hide();
            }
        });

        let app_handle3 = app.handle().clone();
        app.listen("shortcut-down", move |_event| {
            // This listener runs synchronously on whatever thread calls `emit` —
            // including the low-level keyboard hook thread. Blocking there makes
            // Windows silently drop the hook (hotkey dies) and lags ALL system
            // input, so the capture work runs on its own thread.
            let app_handle = app_handle3.clone();
            std::thread::spawn(move || {
                show_pill_window(&app_handle);

                // Immediate recording start and system mute in Rust
                let audio_state = app_handle.state::<std::sync::Mutex<audio::AudioState>>();
                let did_start = match audio::start_recording_internal(&audio_state) {
                    Ok(did_start) => did_start,
                    Err(err) => {
                        eprintln!("[audio] Failed to start recording: {}", err);
                        return;
                    }
                };
                if !did_start {
                    return;
                }

                let did_mute = audio::mute_system_internal().unwrap_or(false);

                // Notify frontend about the mute state so it can unmute later
                let _ = app_handle.emit("audio-muted", did_mute);
            });
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
