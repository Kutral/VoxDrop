<h1 align="center">
  <img src="public/voxdrop-favicon.svg" alt="VoxDrop Logo" width="80" height="80" style="vertical-align: middle; margin-right: 10px;"/><br/>
  VoxDrop
</h1>

<p align="center">
  <b>The fastest way to get your thoughts onto the screen.</b><br/>
  <i>Desktop dictation for Windows with a global hotkey, a floating listening pill, lightning-fast Groq-powered transcription, smart text cleanup, and instant snippet expansion.</i>
</p>

<p align="center">
  <a href="https://github.com/Kutral/VoxDrop/releases"><img src="https://img.shields.io/github/v/release/Kutral/VoxDrop?style=for-the-badge&color=6366f1&label=Latest%20Release" alt="Latest release" /></a>
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/Built%20with-Tauri-FFC131?style=for-the-badge&logo=tauri&logoColor=white" alt="Built with Tauri" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" /></a>
  <a href="https://rust-lang.org/"><img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-0b1220?style=for-the-badge" alt="MIT license" /></a>
</p>

<hr/>

<p align="center">
  <img src="./docs/assets/dashboard-v0.0.4.png" alt="VoxDrop Dashboard" width="100%" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);" />
</p>

## ✨ Why VoxDrop?

VoxDrop is designed for **fast desktop-first writing, short-form replies, repetitive text entry, and voice-driven workflows.** It bypasses the need for typing out long thoughts, giving you a seamless bridge between your voice and your active application.

Unlike heavy Electron-based alternatives, VoxDrop is built with **Rust and Tauri**, meaning it is **ultra-lightweight** and uses minimal RAM while idling in the background.

Hold a hotkey, speak your mind, release, and watch as perfectly polished text is magically pasted exactly where your cursor is.

---

## 🚀 Core Flow

1. ⌨️ **Hold** your custom dictation hotkey (default: `Ctrl + Win`).
2. 🎙️ **Speak** naturally while the unobtrusive floating pill listens.
3. 🤚 **Release** the keys.
4. ✨ **Magic happens:** VoxDrop records the audio, transcribes it instantly with Groq Whisper, polishes it with an advanced LLM (Llama 3.1/3.3 or Allam), expands any snippets, and pastes the final text directly into your active window.

---

## 🌟 Key Features

*   **⚡ Global Hotkey Dictation:** Start dictating from *any* application. The low-level Windows keyboard hook ensures instant response.
*   **🚀 Ultra-Lightweight:** Native Rust core that sips resources.
*   **🧠 Blazing Fast AI via Groq:**
    *   **Acoustic Models:** Choose between *Whisper Large V3 Turbo* (Fast) or *Whisper Large V3* (Accurate).
    *   **Inference Engines:** Format your text instantly with *Llama 3.1 8B*, *Llama 3.3 70B*, or *Allam 2 7B V1*.
*   **✂️ Smart Snippet Expansion:** Create voice macros! Say a trigger phrase (like `my-link`) and VoxDrop pastes the expansion (`https://github.com/Kutral`). Now features **inline editing** and a **quick copy button**!
*   **📊 Personalized Dashboard:** Real-time metrics for your weekly streak, average flowing speed (WPM), and total words dictated. Keep yourself motivated!
*   **💊 Floating Listening Pill:** A beautiful, non-intrusive UI element that appears above your taskbar only when listening.
*   **🎵 Native Media Control:** Automatically pauses background music via Windows kernel APIs while you dictate.
*   **⚙️ Local Settings & History:** Everything is stored locally via Zustand and SQLite on your machine for maximum privacy and speed.
*   **🔄 Built-in Update Checker:** Stay up to date with one-click access to the latest GitHub releases directly from the app settings.

---

## 🛠️ Installation & Usage

### 📥 Option 1: Permanent Installation (Recommended)

1.  Head over to the [Releases](https://github.com/Kutral/VoxDrop/releases) page.
2.  Download the latest Windows installer (`.msi` or `.exe`).
3.  Run the installer and launch VoxDrop from your Start Menu.

### ⌨️ How to Use

1.  Ensure VoxDrop is running in the background.
2.  Click into any text field in any app (Word, Chrome, Discord, VS Code, etc.).
3.  Hold `Ctrl + Win` (or your custom shortcut).
4.  Speak your message.
5.  Release the keys. Your text will be instantly pasted!

> 💡 *You can customize the hotkey at any time in the VoxDrop Preferences tab. Modifier-only shortcuts are fully supported.*

---

## 🔧 Setup Guide

### 🔑 Connecting to Groq

VoxDrop relies on Groq for its blazing-fast transcription and cleanup models. You'll need an API key to get started.

1.  Get your free API key from the [Groq Console](https://console.groq.com/).
2.  Open the VoxDrop app window.
3.  Navigate to **Settings**.
4.  Paste your key into the **Neural API Key** field and click **Authenticate**.

### 📝 Using Snippets

Snippets are powerful voice shortcuts.

1.  Open the **Snippets** tab in VoxDrop.
2.  Click **New Snippet**.
3.  Add a **Trigger Phrase** (e.g., `sign-off`).
4.  Add an **Expansion** (e.g., `Best regards,\nJohn Doe`).
5.  Next time you dictate "sign off", VoxDrop will instantly type out your full signature!
> *You can now quickly edit or copy existing snippets using the hover actions on any snippet card.*

---

## 💻 Local Development

Want to hack on VoxDrop? The stack is **Tauri (v2) + Rust + React 19 + TypeScript + Tailwind CSS + Zustand**.

### Prerequisites
*   [Node.js](https://nodejs.org/) & npm
*   [Rust stable toolchain](https://rustup.rs/)
*   [Tauri Windows prerequisites](https://tauri.app/start/prerequisites/) (C++ Build Tools, WebView2)

### Getting Started

```powershell
# 1. Clone the repository and install dependencies
git clone https://github.com/Kutral/VoxDrop.git
cd VoxDrop
npm install

# 2. Run in development mode (Live Reloading!)
npm run tauri dev
```

### Building for Production

```powershell
# Generate a Windows installer
npm run tauri build
```
*The installer will be generated at `src-tauri\target\release\bundle\msi\`.*

---

## 📐 Architecture

<p align="center">
  <img src="./docs/assets/voxdrop-architecture.svg" alt="VoxDrop Architecture" width="80%" style="background-color: white; padding: 20px; border-radius: 12px;" />
</p>

VoxDrop uses a unique **dual-window architecture**:
*   **Main Window:** React-based dashboard for settings, history, and snippet management.
*   **Pill Window:** A hidden, transparent window that acts as the dictation UI, summoned instantly by the global hotkey.

The Rust backend handles low-level OS interactions (global hotkeys, audio capture via `cpal`, system media muting via `windows` crate, and clipboard simulation via `arboard`/Win32 API) for lightning-fast performance (<50ms response times).

Read the detailed `memory/PROJECT.md` to learn more about the directory structure and technical decisions.

---

## 📜 License

This project is open-source and available under the [MIT License](./LICENSE).

<p align="center">
  <i>Built with ❤️ for faster workflows.</i>
</p>