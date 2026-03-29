use enigo::{Enigo, KeyboardControllable};

#[tauri::command]
pub fn paste_text(text: String) -> Result<(), String> {
    let mut enigo = Enigo::new();
    
    // Simulate typing the text directly to avoid using the clipboard.
    // This respects the user's wish to not save the transcribed data in the Windows clipboard history.
    enigo.key_sequence(&text);

    Ok(())
}
