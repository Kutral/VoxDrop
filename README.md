<p align="center">
  <img src="./docs/assets/voxdrop-banner.svg" alt="VoxDrop banner" width="100%" />
</p>

<h1 align="center">VoxDrop</h1>

<p align="center">
  Hotkey-powered desktop dictation that captures your voice, cleans it with Groq, expands shortcuts, and pastes polished text straight into the app you are already using.
</p>

<p align="center">
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/Tauri-2.x-0f172a?style=for-the-badge&logo=tauri&logoColor=24c8db" alt="Tauri 2" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-111827?style=for-the-badge&logo=react&logoColor=61dafb" alt="React 19" /></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-1f2937?style=for-the-badge&logo=vite&logoColor=ffd62e" alt="Vite 7" /></a>
  <a href="https://groq.com/"><img src="https://img.shields.io/badge/Groq-Whisper%20%2B%20Llama-111827?style=for-the-badge" alt="Groq" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-0b1220?style=for-the-badge" alt="MIT license" /></a>
  <a href="https://github.com/Kutral/VoxDrop/releases"><img src="https://img.shields.io/github/v/release/Kutral/VoxDrop?style=for-the-badge" alt="GitHub release (latest by date)" /></a>
</p>

---

VoxDrop is an **Open Source** tool built for the moment when typing is slower than thinking. Built with a premium **"Ethereal Dark"** aesthetic, it features glassmorphism and energy-efficient radial gradients. 

Hold a global shortcut, speak naturally, release the keys, and let the app transcribe, clean, expand your saved snippets, and paste the final text into your current workflow.

## 🚀 How to Get Started

### Option 1: Download the Release (Recommended)
To use VoxDrop as a standalone app, download the latest installer from the **[GitHub Releases](https://github.com/Kutral/VoxDrop/releases)** page.

1. Download the `.exe` installer (for Windows).
2. Run the installer to add VoxDrop to your Start Menu and create a Desktop Shortcut.

### Option 2: Run from Source (Development)
If you want to contribute or modify the app:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Kutral/VoxDrop.git
   cd VoxDrop
   ```
2. **Install dependencies:** `npm install`
3. **Run in Dev Mode:** `npm run tauri dev`
   *This launches the app with Live Reload—any changes will appear instantly.*

---

## ⌨️ Using the App

### Dictation Hotkey
*   **Default:** `Ctrl + Shift + Space`
*   **How to use:** **Hold** the hotkey to start recording. A minimal "listening pill" will float above your taskbar.
*   **Release:** **Release** the keys to stop recording. VoxDrop will instantly transcribe, clean up the text with AI, and paste it directly at your cursor.

### Customizing the Hotkey
1. Open the main VoxDrop window.
2. Go to the **Settings** tab.
3. Under "Dictation Hotkey", click the input box and press your new combination (e.g., `Ctrl + Alt + V`).
   *Note: For safety, the app requires at least 2 modifier keys (like Ctrl and Shift) to avoid accidental collisions.*

### Snippets
Enhance your typing speed by adding shortcuts:
1. Go to the **Snippets** tab.
2. Add a **Trigger Phrase** (e.g., `my-email`).
3. Add the **Expansion** (e.g., `hello@example.com`).
4. Next time you dictate that phrase, VoxDrop will automatically swap it for your expansion before pasting.

---

## 🛠️ Tech Stack & Structure

VoxDrop is built with modern, high-performance tools:
- **Frontend:** React 19, Vite 7, TypeScript, Tailwind CSS, Framer Motion, Zustand.
- **Backend:** Tauri 2 (Rust).
- **AI:** Groq SDK (Whisper for transcription, Llama for cleanup).

The full project breakdown lives in [project.md](./project.md).

---

## 🔧 Troubleshooting

### Local Data Issues
If you find your settings or hotkeys are stuck, you can reset the local state:
1. Open the app and press `F12` to open DevTools.
2. Go to the **Application** tab -> **Local Storage**.
3. Clear the data and restart the app.

### API Key
VoxDrop requires a Groq API key. You can add it in `Settings -> Neural API Key`.

---

## 📜 License
This project is **Open Source** and licensed under the [MIT License](./LICENSE). Contributions are welcome!
