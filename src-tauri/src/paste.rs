/// Tags the keystrokes VoxDrop injects so its own keyboard hook can skip them.
pub const INJECTED_MARKER: usize = 0x564F_5844; // "VOXD"

/// Paste `text` into the focused app via the clipboard and an injected Ctrl+V,
/// then put back whatever text the user had on the clipboard.
#[tauri::command]
pub async fn paste_text(text: String) -> Result<(), String> {
    // Clipboard waits and SendInput must not run on the UI thread.
    tauri::async_runtime::spawn_blocking(move || paste_blocking(&text))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(target_os = "windows")]
mod win {
    use std::mem::size_of;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{GetLastError, GlobalFree, HANDLE};
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber,
        IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
        VK_CONTROL, VK_LCONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT, VK_V,
    };

    const CF_UNICODETEXT: u32 = 13;

    fn last_error(context: &str) -> String {
        format!("{} failed with Win32 error {}", context, unsafe { GetLastError() })
    }

    /// RAII guard so every exit path closes the clipboard.
    struct Clipboard;

    impl Clipboard {
        /// Clipboard managers and other apps hold the clipboard briefly; retry
        /// instead of failing the whole dictation on the first collision.
        fn open() -> Result<Self, String> {
            for _ in 0..10 {
                if unsafe { OpenClipboard(std::ptr::null_mut()) } != 0 {
                    return Ok(Clipboard);
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(last_error("OpenClipboard"))
        }
    }

    impl Drop for Clipboard {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }

    fn exclude_format() -> u32 {
        let name: Vec<u16> = "ExcludeClipboardContentFromMonitorProcessing\0"
            .encode_utf16()
            .collect();
        unsafe { RegisterClipboardFormatW(name.as_ptr()) }
    }

    fn global_from_bytes(bytes: &[u8]) -> Result<HANDLE, String> {
        unsafe {
            let handle = GlobalAlloc(GMEM_MOVEABLE, bytes.len().max(1));
            if handle.is_null() {
                return Err(last_error("GlobalAlloc"));
            }
            let locked = GlobalLock(handle) as *mut u8;
            if locked.is_null() {
                GlobalFree(handle);
                return Err(last_error("GlobalLock"));
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), locked, bytes.len());
            GlobalUnlock(handle);
            Ok(handle)
        }
    }

    /// The user's clipboard text (UTF-16 with terminator), if any.
    fn read_text(_clipboard: &Clipboard) -> Option<Vec<u8>> {
        unsafe {
            if IsClipboardFormatAvailable(CF_UNICODETEXT) == 0 {
                return None;
            }
            let handle = GetClipboardData(CF_UNICODETEXT);
            if handle.is_null() {
                return None;
            }
            let size = GlobalSize(handle);
            let locked = GlobalLock(handle) as *const u8;
            if locked.is_null() || size == 0 {
                return None;
            }
            let bytes = std::slice::from_raw_parts(locked, size).to_vec();
            GlobalUnlock(handle);
            Some(bytes)
        }
    }

    /// Replace the clipboard with `utf16_bytes`, flagged so Windows clipboard
    /// history and cloud sync ignore it (dictations shouldn't pile up there).
    fn write_text(_clipboard: &Clipboard, utf16_bytes: &[u8]) -> Result<(), String> {
        unsafe {
            if EmptyClipboard() == 0 {
                return Err(last_error("EmptyClipboard"));
            }
            let text = global_from_bytes(utf16_bytes)?;
            if SetClipboardData(CF_UNICODETEXT, text).is_null() {
                let err = last_error("SetClipboardData");
                GlobalFree(text);
                return Err(err);
            }
            let cf_exclude = exclude_format();
            if cf_exclude != 0 {
                if let Ok(marker) = global_from_bytes(&[0]) {
                    if SetClipboardData(cf_exclude, marker).is_null() {
                        GlobalFree(marker);
                    }
                }
            }
            Ok(())
        }
    }

    fn is_held(vk: u16) -> bool {
        unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
    }

    /// Ctrl+V sent while the user still holds Win/Alt/Shift becomes a
    /// different shortcut (Win+Ctrl+V, Ctrl+Shift+V…). Wait briefly for them.
    fn wait_for_modifiers_released(max: Duration) {
        let deadline = Instant::now() + max;
        let keys = [VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN];
        while keys.iter().any(|&vk| is_held(vk)) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    fn key(vk: u16, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                    time: 0,
                    dwExtraInfo: super::INJECTED_MARKER,
                },
            },
        }
    }

    pub fn paste(text: &str) -> Result<(), String> {
        let utf16: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes: Vec<u8> = utf16.iter().flat_map(|unit| unit.to_le_bytes()).collect();

        wait_for_modifiers_released(Duration::from_millis(600));

        let previous = {
            let clipboard = Clipboard::open()?;
            let previous = read_text(&clipboard);
            write_text(&clipboard, &bytes)?;
            previous
        };
        let our_sequence = unsafe { GetClipboardSequenceNumber() };

        let mut inputs = [
            key(VK_LCONTROL, false),
            key(VK_V, false),
            key(VK_V, true),
            key(VK_LCONTROL, true),
        ];
        let sent = unsafe {
            SendInput(inputs.len() as u32, inputs.as_mut_ptr(), size_of::<INPUT>() as i32)
        };

        // The target reads the clipboard only when it processes the queued
        // Ctrl+V, which slow apps (Electron, browsers under load, RDP) can take
        // hundreds of ms to do. Restore afterwards on a detached thread, and
        // only if nobody else has written to the clipboard in the meantime.
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(if sent == 4 { 700 } else { 0 }));
            if unsafe { GetClipboardSequenceNumber() } != our_sequence {
                return;
            }
            let Ok(clipboard) = Clipboard::open() else {
                return;
            };
            match previous {
                Some(previous) => {
                    let _ = write_text(&clipboard, &previous);
                }
                None => unsafe {
                    EmptyClipboard();
                },
            }
        });

        if sent != inputs.len() as u32 {
            return Err(format!(
                "SendInput sent {} of {} events; Win32 error {}",
                sent,
                inputs.len(),
                unsafe { GetLastError() }
            ));
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn paste_blocking(text: &str) -> Result<(), String> {
    win::paste(text)
}

#[cfg(not(target_os = "windows"))]
fn paste_blocking(text: &str) -> Result<(), String> {
    use enigo::{Enigo, KeyboardControllable};
    let mut enigo = Enigo::new();
    enigo.key_sequence(text);
    Ok(())
}
