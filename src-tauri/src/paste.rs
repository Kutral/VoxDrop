#[tauri::command]
pub fn paste_text(text: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::mem::size_of;
        use windows_sys::Win32::Foundation::{GetLastError, GlobalFree};
        use windows_sys::Win32::System::DataExchange::{
            CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW,
            SetClipboardData,
        };
        use windows_sys::Win32::System::Memory::{
            GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
        };
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_LCONTROL,
            VK_V,
        };

        let utf16_chars: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();

        unsafe {
            fn last_error(context: &str) -> String {
                format!("{} failed with Win32 error {}", context, unsafe {
                    GetLastError()
                })
            }

            let format_name: Vec<u16> = "ExcludeClipboardContentFromMonitorProcessing\0"
                .encode_utf16()
                .collect();
            let cf_exclude = RegisterClipboardFormatW(format_name.as_ptr());
            if cf_exclude == 0 {
                return Err(last_error("RegisterClipboardFormatW"));
            }

            let str_bytes = utf16_chars.len() * size_of::<u16>();
            let hglob_str = GlobalAlloc(GMEM_MOVEABLE, str_bytes);
            if hglob_str.is_null() {
                return Err(last_error("GlobalAlloc for clipboard text"));
            }
            let locked = GlobalLock(hglob_str) as *mut u8;
            if locked.is_null() {
                GlobalFree(hglob_str);
                return Err(last_error("GlobalLock for clipboard text"));
            }
            std::ptr::copy_nonoverlapping(utf16_chars.as_ptr() as *const u8, locked, str_bytes);
            GlobalUnlock(hglob_str);

            let hglob_exclude = GlobalAlloc(GMEM_MOVEABLE, 1);
            if hglob_exclude.is_null() {
                GlobalFree(hglob_str);
                return Err(last_error("GlobalAlloc for clipboard exclusion marker"));
            }
            let locked = GlobalLock(hglob_exclude) as *mut u8;
            if locked.is_null() {
                GlobalFree(hglob_str);
                GlobalFree(hglob_exclude);
                return Err(last_error("GlobalLock for clipboard exclusion marker"));
            }
            std::ptr::write(locked, 0);
            GlobalUnlock(hglob_exclude);

            if OpenClipboard(std::ptr::null_mut()) == 0 {
                GlobalFree(hglob_str);
                GlobalFree(hglob_exclude);
                return Err(last_error("OpenClipboard"));
            }
            if EmptyClipboard() == 0 {
                let err = last_error("EmptyClipboard");
                GlobalFree(hglob_str);
                GlobalFree(hglob_exclude);
                CloseClipboard();
                return Err(err);
            }

            if SetClipboardData(13, hglob_str).is_null() {
                let err = last_error("SetClipboardData for clipboard text");
                GlobalFree(hglob_str);
                GlobalFree(hglob_exclude);
                CloseClipboard();
                return Err(err);
            }

            if SetClipboardData(cf_exclude, hglob_exclude).is_null() {
                let err = last_error("SetClipboardData for clipboard exclusion marker");
                GlobalFree(hglob_exclude);
                CloseClipboard();
                return Err(err);
            }

            CloseClipboard();

            let mut inputs = [
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: VK_LCONTROL,
                            wScan: 0,
                            dwFlags: 0,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                },
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: VK_V,
                            wScan: 0,
                            dwFlags: 0,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                },
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: VK_V,
                            wScan: 0,
                            dwFlags: KEYEVENTF_KEYUP,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                },
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: VK_LCONTROL,
                            wScan: 0,
                            dwFlags: KEYEVENTF_KEYUP,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                },
            ];

            let sent = SendInput(
                inputs.len() as u32,
                inputs.as_mut_ptr(),
                size_of::<INPUT>() as i32,
            );
            if sent != inputs.len() as u32 {
                return Err(format!(
                    "SendInput sent {} of {} events; Win32 error {}",
                    sent,
                    inputs.len(),
                    GetLastError()
                ));
            }

            std::thread::sleep(std::time::Duration::from_millis(50));

            if OpenClipboard(std::ptr::null_mut()) != 0 {
                EmptyClipboard();
                CloseClipboard();
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use enigo::{Enigo, KeyboardControllable};
        let mut enigo = Enigo::new();
        enigo.key_sequence(&text);
    }

    Ok(())
}
