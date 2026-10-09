mod audio;
mod paste;
mod windows_hotkey;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_HOTKEY: &str = "Control+Super";
const DEFAULT_WINDOW_WIDTH: f64 = 720.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 780.0;
const TRAY_ID: &str = "voxdrop-tray";
const TRAY_SHOW_ID: &str = "show";
const TRAY_QUIT_ID: &str = "quit";

/// The pill window is larger than the visible capsule so its shadow isn't
/// clipped; the page centres the capsule inside it.
const PILL_WINDOW_W: f64 = 360.0;
const PILL_WINDOW_H: f64 = 72.0;
/// Gap between the pill window's bottom edge and the taskbar.
const PILL_BOTTOM_MARGIN: f64 = 56.0;

/// The hotkey string that is actually registered right now.
struct HotkeyState(Mutex<String>);

/// Incremented on every press, so a release watchdog can tell whether the
/// session it was guarding is still the current one.
static SESSION: AtomicU64 = AtomicU64::new(0);

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

    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SetForegroundWindow, SetWindowPos, ShowWindow, HWND_NOTOPMOST, HWND_TOPMOST,
            SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_RESTORE,
        };
        if let Ok(hwnd) = window.hwnd() {
            let handle = hwnd.0 as windows_sys::Win32::Foundation::HWND;
            unsafe {
                ShowWindow(handle, SW_RESTORE);
                // Briefly topmost: Windows otherwise refuses to raise a window
                // from a background process (tray click, second launch).
                let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW;
                SetWindowPos(handle, HWND_TOPMOST, 0, 0, 0, 0, flags);
                SetWindowPos(handle, HWND_NOTOPMOST, 0, 0, 0, 0, flags);
                SetForegroundWindow(handle);
            }
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

/// Show the dashboard, recreating it if it was closed. Closing destroys the
/// dashboard's webview instead of hiding it, which hands its renderer
/// process's memory back to the system while VoxDrop idles in the tray.
fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        force_present_window(&window);
        return;
    }

    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if handle.get_webview_window("main").is_some() {
            return;
        }
        let Some(config) = handle.config().app.windows.iter().find(|w| w.label == "main").cloned()
        else {
            eprintln!("[window] main window config missing");
            return;
        };
        match WebviewWindowBuilder::from_config(&handle, &config).and_then(|b| b.build()) {
            Ok(window) => {
                fit_window_to_work_area(&window);
                force_present_window(&window);
            }
            Err(err) => eprintln!("[window] could not reopen main window: {err}"),
        }
    });
}

fn ensure_pill_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<tauri::WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window("pill") {
        return Some(window);
    }

    // `pill.html` is a separate, tiny entry point: the overlay never loads the
    // dashboard's code.
    let builder = WebviewWindowBuilder::new(app, "pill", WebviewUrl::App("pill.html".into()))
        .title("VoxDrop pill")
        .inner_size(PILL_WINDOW_W, PILL_WINDOW_H)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .focusable(false)
        .resizable(false)
        .transparent(true);

    match builder.build() {
        Ok(window) => {
            // A status overlay: clicks go to whatever is underneath.
            let _ = window.set_ignore_cursor_events(true);
            park_pill(&window);
            Some(window)
        }
        Err(err) => {
            eprintln!("[window] pill create failed: {err}");
            None
        }
    }
}

/// Keep the pill visible but offscreen between takes: a hidden WebView2
/// suspends compositing, so the first frame after `show()` lags.
fn park_pill<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x: -9999.0, y: -9999.0 }));
    let _ = window.show();
}

/// Bottom-centre of the work area on the monitor under the mouse, so the pill
/// appears where the user is working on multi-monitor setups.
fn position_and_show_pill<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let monitor = window
        .cursor_position()
        .ok()
        .and_then(|p| window.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let work = monitor.work_area();
        let w = (PILL_WINDOW_W * scale) as i32;
        let h = (PILL_WINDOW_H * scale) as i32;
        let x = work.position.x + (work.size.width as i32 - w) / 2;
        let y = work.position.y + work.size.height as i32 - h - (PILL_BOTTOM_MARGIN * scale) as i32;
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, y)));
    }
    let _ = window.show();
}

fn show_pill_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("pill") {
        position_and_show_pill(&window);
        return;
    }

    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = ensure_pill_window(&handle) {
            position_and_show_pill(&window);
        }
    });
}

fn apply_hotkey<R: tauri::Runtime>(app: &tauri::AppHandle<R>, hotkey: &str) -> Result<(), String> {
    use std::str::FromStr;
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    if hotkey_is_modifier_only(hotkey) {
        let _ = app.global_shortcut().unregister_all();
        windows_hotkey::set_hotkey(hotkey);
        return Ok(());
    }

    // Validate before touching the working binding.
    let shortcut = Shortcut::from_str(hotkey).map_err(|_| {
        format!("\"{hotkey}\" isn't a shortcut VoxDrop can use. Try another combination.")
    })?;
    let _ = app.global_shortcut().unregister_all();
    windows_hotkey::set_hotkey("");
    app.global_shortcut().register(shortcut).map_err(|_| {
        format!("Another app is already using {}. Pick a different shortcut.", hotkey.replace('+', " + "))
    })
}

/// Switch the dictation hotkey. On failure the previous hotkey stays active,
/// so the app is never left without one.
#[tauri::command]
fn update_hotkey(
    app: tauri::AppHandle,
    state: tauri::State<'_, HotkeyState>,
    new_hotkey: String,
) -> Result<(), String> {
    let next = new_hotkey.trim().to_string();
    let mut current = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if *current == next {
        return Ok(());
    }

    match apply_hotkey(&app, &next) {
        Ok(()) => {
            *current = next;
            Ok(())
        }
        Err(err) => {
            if let Err(restore_err) = apply_hotkey(&app, &current) {
                eprintln!("[hotkey] could not restore '{}': {restore_err}", *current);
            }
            Err(err)
        }
    }
}

fn on_shortcut_down<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let session = SESSION.fetch_add(1, Ordering::SeqCst) + 1;

    // Pill first: it costs a few ms, while opening the mic can take most of
    // a second on some laptops. The pill shows "starting" until the
    // `recording-started` event says the mic is live.
    show_pill_window(app);

    let state = app.state::<audio::AudioState>();
    if !audio::capture_enabled(&state) {
        return;
    }
    match audio::start_recording_internal(&state) {
        Ok(true) => {
            let _ = app.emit("recording-started", ());
            if SESSION.load(Ordering::SeqCst) == session {
                audio::mute_for_dictation(&state);
            }
        }
        Ok(false) => {}
        Err(err) => {
            eprintln!("[audio] Failed to start recording: {err}");
            let _ = app.emit("recording-error", err);
        }
    }
}

fn on_shortcut_up<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    // The pill normally collects the audio within milliseconds. If its page
    // isn't listening (still loading, crashed), make sure the mic and media
    // don't stay captured forever.
    let session = SESSION.load(Ordering::SeqCst);
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        if SESSION.load(Ordering::SeqCst) == session {
            audio::cancel_recording_internal(&handle.state::<audio::AudioState>());
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Must be first: a second launch focuses the running app instead of
        // installing a second keyboard hook (double recordings, double pastes).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .manage(audio::AudioState::default())
        .manage(HotkeyState(Mutex::new(String::new())))
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
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    // VoxDrop registers exactly one shortcut, so any match is ours.
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
        )
        .invoke_handler(tauri::generate_handler![
            update_hotkey,
            audio::stop_recording,
            audio::cancel_recording,
            audio::get_audio_level,
            audio::set_capture_enabled,
            audio::set_keep_mic_ready,
            paste::paste_text
        ])
        .setup(|app| {
            let tray_menu = MenuBuilder::new(app)
                .text(TRAY_SHOW_ID, "Open VoxDrop")
                .separator()
                .text(TRAY_QUIT_ID, "Quit VoxDrop")
                .build()?;

            TrayIconBuilder::with_id(TRAY_ID)
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("VoxDrop")
                .icon(app.default_window_icon().cloned().ok_or_else(|| {
                    std::io::Error::other("Missing app icon")
                })?)
                .build(app)?;

            windows_hotkey::install(app.handle().clone());
            // The persisted hotkey is applied by the frontend once its store
            // loads; until then the default is active.
            if let Err(err) = apply_hotkey(app.handle(), DEFAULT_HOTKEY) {
                eprintln!("[hotkey] default hotkey unavailable: {err}");
            } else {
                *app.state::<HotkeyState>().0.lock().unwrap_or_else(|e| e.into_inner()) =
                    DEFAULT_HOTKEY.to_string();
            }

            if let Some(window) = app.get_webview_window("main") {
                fit_window_to_work_area(&window);
                force_present_window(&window);
            }

            // Re-fit once the window has settled: a late WM_DPICHANGED rescale right
            // after launch can push the frame back outside the work area.
            let refit = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(1500));
                if let Some(window) = refit.get_webview_window("main") {
                    fit_window_to_work_area(&window);
                }
            });

            // Pre-create the pill shortly after launch so the first press doesn't
            // pay WebView2 window-creation latency. Built on the main thread to
            // avoid the startup window-creation failures seen on Windows.
            let pill = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(800));
                let handle = pill.clone();
                let _ = pill.run_on_main_thread(move || {
                    let _ = ensure_pill_window(&handle);
                });
            });

            let park = app.handle().clone();
            app.listen("pill-hide", move |_event| {
                if let Some(window) = park.get_webview_window("pill") {
                    park_pill(&window);
                }
            });

            // These listeners run synchronously on whichever thread emitted
            // the event, so hand the work to a fresh thread right away.
            let down = app.handle().clone();
            app.listen("shortcut-down", move |_event| {
                let app = down.clone();
                std::thread::spawn(move || on_shortcut_down(&app));
            });

            let up = app.handle().clone();
            app.listen("shortcut-up", move |_event| on_shortcut_up(&up));

            let cancel = app.handle().clone();
            app.listen("shortcut-cancel", move |_event| {
                SESSION.fetch_add(1, Ordering::SeqCst);
                audio::cancel_recording_internal(&cancel.state::<audio::AudioState>());
            });

            Ok(())
        });

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Closing the dashboard destroys it; keep running in the tray.
            // Only the tray's Quit (an explicit exit code) ends the app.
            if let tauri::RunEvent::ExitRequested { code: None, api, .. } = event {
                api.prevent_exit();
            }
        });
}
