use std::thread;
use std::time::Duration;

#[tauri::command]
pub fn paste_text(text: String) -> Result<(), String> {
    // Use arboard to copy text to clipboard, then simulate Ctrl+V
    use arboard::Clipboard;

    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard error: {}", e))?;
    clipboard
        .set_text(&text)
        .map_err(|e| format!("Failed to set clipboard: {}", e))?;

    // Give a small delay for the clipboard to be set
    thread::sleep(Duration::from_millis(150));

    // Simulate Ctrl+V using enigo
    use enigo::{Enigo, KeyboardControllable};
    let mut enigo = Enigo::new();

    // Press Ctrl+V
    enigo.key_down(enigo::Key::Control);
    thread::sleep(Duration::from_millis(30));
    enigo.key_click(enigo::Key::Layout('v'));
    thread::sleep(Duration::from_millis(30));
    enigo.key_up(enigo::Key::Control);

    Ok(())
}
