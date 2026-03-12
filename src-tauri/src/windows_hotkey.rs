#[cfg(target_os = "windows")]
mod imp {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, OnceLock};

    use tauri::{AppHandle, Emitter};
    use windows_sys::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        UnhookWindowsHookEx, HC_ACTION, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN,
        WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    const VK_SHIFT: u16 = 0x10;
    const VK_CONTROL: u16 = 0x11;
    const VK_MENU: u16 = 0x12;
    const VK_LSHIFT: u16 = 0xA0;
    const VK_RSHIFT: u16 = 0xA1;
    const VK_LCONTROL: u16 = 0xA2;
    const VK_RCONTROL: u16 = 0xA3;
    const VK_LMENU: u16 = 0xA4;
    const VK_RMENU: u16 = 0xA5;
    const VK_LWIN: u16 = 0x5B;
    const VK_RWIN: u16 = 0x5C;

    static SHARED_STATE: OnceLock<SharedState> = OnceLock::new();

    struct SharedState {
        hotkey: Mutex<String>,
        app: AppHandle,
        is_active: AtomicBool,
        ctrl_down: AtomicBool,
        alt_down: AtomicBool,
        shift_down: AtomicBool,
        super_down: AtomicBool,
    }

    #[derive(Clone, Copy, Default)]
    struct ModifierHotkey {
        ctrl: bool,
        alt: bool,
        shift: bool,
        super_key: bool,
    }

    impl ModifierHotkey {
        fn parse(value: &str) -> Option<Self> {
            let mut hotkey = Self::default();
            let mut parts = 0;

            for raw_part in value.split('+') {
                let part = raw_part.trim().to_ascii_lowercase();
                if part.is_empty() {
                    continue;
                }

                match part.as_str() {
                    "control" | "ctrl" => hotkey.ctrl = true,
                    "alt" | "option" => hotkey.alt = true,
                    "shift" => hotkey.shift = true,
                    "super" | "meta" | "command" | "cmd" => hotkey.super_key = true,
                    _ => return None,
                }

                parts += 1;
            }

            if parts >= 2 {
                Some(hotkey)
            } else {
                None
            }
        }

        fn matches(self, state: &SharedState) -> bool {
            self.ctrl == state.ctrl_down.load(Ordering::SeqCst)
                && self.alt == state.alt_down.load(Ordering::SeqCst)
                && self.shift == state.shift_down.load(Ordering::SeqCst)
                && self.super_key == state.super_down.load(Ordering::SeqCst)
        }
    }

    pub fn install(app: AppHandle) {
        let _ = SHARED_STATE.set(SharedState {
            hotkey: Mutex::new(String::new()),
            app,
            is_active: AtomicBool::new(false),
            ctrl_down: AtomicBool::new(false),
            alt_down: AtomicBool::new(false),
            shift_down: AtomicBool::new(false),
            super_down: AtomicBool::new(false),
        });

        std::thread::spawn(move || unsafe {
            let module_handle: HINSTANCE = GetModuleHandleW(std::ptr::null());
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module_handle, 0);

            if hook.is_null() {
                return;
            }

            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }

            let _ = UnhookWindowsHookEx(hook);
        });
    }

    pub fn set_hotkey(value: &str) {
        if let Some(state) = SHARED_STATE.get() {
            if let Ok(mut hotkey) = state.hotkey.lock() {
                *hotkey = value.to_string();
            }
            state.is_active.store(false, Ordering::SeqCst);
        }
    }

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code == HC_ACTION as i32 {
            if let Some(state) = SHARED_STATE.get() {
                let event = &*(lparam as *const KBDLLHOOKSTRUCT);
                let is_key_down = matches!(wparam as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
                let is_key_up = matches!(wparam as u32, WM_KEYUP | WM_SYSKEYUP);

                if is_key_down || is_key_up {
                    let is_pressed = is_key_down;
                    match event.vkCode as u16 {
                        VK_CONTROL | VK_LCONTROL | VK_RCONTROL => {
                            state.ctrl_down.store(is_pressed, Ordering::SeqCst);
                        }
                        VK_MENU | VK_LMENU | VK_RMENU => {
                            state.alt_down.store(is_pressed, Ordering::SeqCst);
                        }
                        VK_SHIFT | VK_LSHIFT | VK_RSHIFT => {
                            state.shift_down.store(is_pressed, Ordering::SeqCst);
                        }
                        VK_LWIN | VK_RWIN => {
                            state.super_down.store(is_pressed, Ordering::SeqCst);
                        }
                        _ => {}
                    }

                    let configured_hotkey = state
                        .hotkey
                        .lock()
                        .ok()
                        .map(|value| value.clone())
                        .unwrap_or_default();

                    if let Some(modifier_hotkey) = ModifierHotkey::parse(&configured_hotkey) {
                        let should_be_active = modifier_hotkey.matches(state);
                        let was_active = state.is_active.swap(should_be_active, Ordering::SeqCst);

                        if should_be_active && !was_active {
                            let _ = state.app.emit("shortcut-down", ());
                        } else if !should_be_active && was_active {
                            let _ = state.app.emit("shortcut-up", ());
                        }
                    }
                }
            }
        }

        CallNextHookEx(
            std::ptr::null_mut::<std::ffi::c_void>() as HHOOK,
            code,
            wparam,
            lparam,
        )
    }
}

#[cfg(target_os = "windows")]
pub use imp::{install, set_hotkey};

#[cfg(not(target_os = "windows"))]
pub fn install(_app: tauri::AppHandle) {}

#[cfg(not(target_os = "windows"))]
pub fn set_hotkey(_value: &str) {}
