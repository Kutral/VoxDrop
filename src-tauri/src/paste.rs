#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
};

#[cfg(not(target_os = "windows"))]
use enigo::{Enigo, KeyboardControllable};

#[tauri::command]
pub fn paste_text(text: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut inputs = Vec::with_capacity(text.len() * 2);
        for c in text.encode_utf16() {
            let mut input_down: INPUT = unsafe { std::mem::zeroed() };
            input_down.type_ = INPUT_KEYBOARD;
            input_down.Anonymous.ki = KEYBDINPUT {
                wVk: 0,
                wScan: c,
                dwFlags: KEYEVENTF_UNICODE,
                time: 0,
                dwExtraInfo: 0,
            };
            inputs.push(input_down);

            let mut input_up: INPUT = unsafe { std::mem::zeroed() };
            input_up.type_ = INPUT_KEYBOARD;
            input_up.Anonymous.ki = KEYBDINPUT {
                wVk: 0,
                wScan: c,
                dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                time: 0,
                dwExtraInfo: 0,
            };
            inputs.push(input_up);
        }

        if !inputs.is_empty() {
            // SendInput may have a limit on how many inputs it can process at once.
            // A common limit is ~250-500. We'll chunk it to 256 inputs (128 characters) at a time.
            for chunk in inputs.chunks(256) {
                unsafe {
                    SendInput(
                        chunk.len() as u32,
                        chunk.as_ptr(),
                        std::mem::size_of::<INPUT>() as i32,
                    );
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut enigo = Enigo::new();
        // Simulate typing the text directly to avoid using the clipboard.
        enigo.key_sequence(&text);
    }

    Ok(())
}
