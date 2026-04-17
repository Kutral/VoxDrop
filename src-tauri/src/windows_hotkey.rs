#[cfg(target_os = "windows")]
mod imp {
    use std::collections::HashSet;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, OnceLock};

    use tauri::{AppHandle, Emitter};
    use windows_sys::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetTimer, SetWindowsHookExW,
        TranslateMessage, UnhookWindowsHookEx, HC_ACTION, HHOOK, KBDLLHOOKSTRUCT, MSG,
        WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
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
        main_keys_down: Mutex<HashSet<u16>>,
    }

    #[derive(Clone, Default)]
    struct ModifierHotkey {
        ctrl: bool,
        alt: bool,
        shift: bool,
        super_key: bool,
        vk_codes: HashSet<u16>,
    }

    fn parse_vk(name: &str) -> Option<u16> {
        let name = name.to_ascii_uppercase();
        if name.len() == 1 {
            let c = name.chars().next().unwrap();
            if c >= 'A' && c <= 'Z' {
                return Some(c as u16);
            }
            if c >= '0' && c <= '9' {
                return Some(c as u16);
            }
        }

        match name.as_str() {
            "SPACE" => Some(0x20),
            "ENTER" => Some(0x0D),
            "TAB" => Some(0x09),
            "ESCAPE" | "ESC" => Some(0x1B),
            "DELETE" | "DEL" => Some(0x2E),
            "BACKSPACE" => Some(0x08),
            "UP" => Some(0x26),
            "DOWN" => Some(0x28),
            "LEFT" => Some(0x25),
            "RIGHT" => Some(0x27),
            "F1" => Some(0x70),
            "F2" => Some(0x71),
            "F3" => Some(0x72),
            "F4" => Some(0x73),
            "F5" => Some(0x74),
            "F6" => Some(0x75),
            "F7" => Some(0x76),
            "F8" => Some(0x77),
            "F9" => Some(0x78),
            "F10" => Some(0x79),
            "F11" => Some(0x7A),
            "F12" => Some(0x7B),
            _ => None,
        }
    }

    impl ModifierHotkey {
        fn parse(value: &str) -> Option<Self> {
            let mut hotkey = Self::default();
            let mut parts_count = 0;

            for raw_part in value.split('+') {
                let part = raw_part.trim().to_ascii_lowercase();
                if part.is_empty() {
                    continue;
                }

                match part.as_str() {
                    "control" | "ctrl" => hotkey.ctrl = true,
                    "alt" | "option" => hotkey.alt = true,
                    "shift" => hotkey.shift = true,
                    "super" | "meta" | "command" | "cmd" | "win" => hotkey.super_key = true,
                    other => {
                        if let Some(vk) = parse_vk(other) {
                            hotkey.vk_codes.insert(vk);
                        } else {
                            return None;
                        }
                    }
                }
                parts_count += 1;
            }

            if parts_count >= 2 {
                Some(hotkey)
            } else {
                None
            }
        }

        fn matches(&self, state: &SharedState) -> bool {
            let modifiers_match = self.ctrl == state.ctrl_down.load(Ordering::SeqCst)
                && self.alt == state.alt_down.load(Ordering::SeqCst)
                && self.shift == state.shift_down.load(Ordering::SeqCst)
                && self.super_key == state.super_down.load(Ordering::SeqCst);

            let main_keys_match = {
                let down = state.main_keys_down.lock().unwrap();
                *down == self.vk_codes
            };

            modifiers_match && main_keys_match
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
            main_keys_down: Mutex::new(HashSet::new()),
        });

        std::thread::spawn(move || unsafe {
            let module_handle: HINSTANCE = GetModuleHandleW(std::ptr::null());
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module_handle, 0);

            if hook.is_null() {
                return;
            }

            let timer_id = 1usize;
            let timer_interval_ms = 60_000u32;
            SetTimer(std::ptr::null_mut(), timer_id, timer_interval_ms, None);

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
                    let vk = event.vkCode as u16;
                    let is_pressed = is_key_down;

                    let mut is_modifier = true;
                    match vk {
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
                        _ => {
                            is_modifier = false;
                        }
                    }

                    if !is_modifier {
                        let mut down = state.main_keys_down.lock().unwrap();
                        if is_pressed {
                            down.insert(vk);
                        } else {
                            down.remove(&vk);
                        }
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
