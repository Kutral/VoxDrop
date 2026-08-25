<h1 align="center">
  <img src="public/voxdrop-favicon.svg" alt="VoxDrop" width="72" height="72" /><br/>
  VoxDrop
</h1>

<p align="center">
  <strong>Speak. Release. It's typed.</strong><br/>
  Hold a hotkey anywhere in Windows, say what you mean, and watch polished text land in whatever app you're using.
</p>

<p align="center">
  <a href="https://github.com/Kutral/VoxDrop/releases"><img src="https://img.shields.io/github/v/release/Kutral/VoxDrop?style=flat-square&color=4F46E5&label=download" alt="Latest release" /></a>
  <a href="https://github.com/Kutral/VoxDrop/releases"><img src="https://img.shields.io/badge/platform-Windows-0078D4?style=flat-square&logo=windows11&logoColor=white" alt="Windows" /></a>
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/Tauri%202-FFC131?style=flat-square&logo=tauri&logoColor=black" alt="Tauri" /></a>
  <a href="https://rust-lang.org/"><img src="https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React%2019-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-0b1220?style=flat-square" alt="MIT license" /></a>
</p>

<p align="center">
  <img src="docs/assets/animated-banner.svg" alt="VoxDrop dictation workflow" width="100%" />
</p>

---

## Why VoxDrop

Dictation tools are usually slow, heavy, or cloud-locked. VoxDrop is a native **Rust + Tauri** desktop app that idles at almost zero cost, reacts to your hotkey in **under 50&nbsp;ms**, and streams your voice to Groq's LPUs for near-instant transcription. Your words get cleaned up by an LLM — filler removed, punctuation fixed — and pasted straight into the app you were already typing in.

Everything stays on your machine: history, snippets, and keys live in local storage and SQLite.

<p align="center">
  <img src="docs/assets/dashboard-v0.0.14.png" alt="VoxDrop dashboard" width="720" />
</p>

## How it works

| | |
|---|---|
| **1 — Hold** | Press and hold your hotkey (`Ctrl + Win` by default) from any app. |
| **2 — Speak** | The floating pill appears at the bottom of your screen and listens. Background music pauses automatically. |
| **3 — Release** | Recording stops the instant you let go. |
| **4 — Done** | Whisper transcribes, an LLM polishes it, snippets expand, and the final text is pasted at your cursor. |

## Features

**Dictation engine**
- Global hotkey with a low-level Windows hook — modifier-only chords like `Ctrl + Win` work, and every shortcut is remappable in Preferences
- Pre-warmed dictation pill that renders instantly, with live waveform feedback
- Automatic media pause while you speak, resumed when you're done

**AI pipeline (Groq + Cerebras)**
- Whisper **Turbo** (near-instant) or **Large V3** (max quality) transcription
- Text polish through GPT-OSS 20B / 120B, Qwen 3.6, ALLaM 2 (Groq) or Gemma 4 31B (Cerebras) — switchable per preference
- Inline API key testing so you know credentials work before your first dictation

**Voice snippets**
- Say a trigger like *"my meet link"* and get the full URL, template, or code block pasted in its place
- Instant search, inline editing, and one-click copy

**Dashboard & privacy**
- Live telemetry: speaking speed (WPM), time saved, all-time words, weekly streak — plus a 14-day voiceprint of your dictation rhythm
- 100% local history and settings (localStorage + SQLite). Audio is streamed to Groq for transcription and never stored

## Installation

1. Grab the latest installer from [**Releases**](https://github.com/Kutral/VoxDrop/releases/latest)
   - `VoxDrop_x64-setup.exe` — standard installer (recommended)
   - `VoxDrop_x64_en-US.msi` — MSI package
2. Run it and launch VoxDrop from the Start Menu.
3. Open **Preferences**, paste your free [Groq API key](https://console.groq.com/keys), and hit **Authenticate**.

> **Windows SmartScreen note:** the installers are not yet code-signed, so Windows may show *"Windows protected your PC"* on first run. Click **More info → Run anyway**. This is expected for new unsigned releases.

## Voice snippets in 30 seconds

1. Open the **Snippets** tab → **New Snippet**
2. Trigger: `sign-off` — Expansion: `Best regards,\nJohn Doe`
3. Dictate *"sign off"* anywhere and your full signature is typed for you.

## Building from source

**Prerequisites:** [Node.js](https://nodejs.org/), [Rust](https://rustup.rs/), and [Tauri's Windows prerequisites](https://tauri.app/start/prerequisites/) (MSVC build tools + WebView2).

```bash
git clone https://github.com/Kutral/VoxDrop.git
cd VoxDrop
npm install

# development (Vite + hot reload)
npm run tauri dev

# production installer
npm run tauri build
```

## Architecture

<p align="center">
  <img src="docs/assets/voxdrop-architecture.svg" alt="VoxDrop architecture" width="720" />
</p>

Two windows, one Rust core:

- **Main window** — the React dashboard (dashboard, history, snippets, preferences)
- **Pill window** — a transparent overlay pre-created at startup and kept render-ready, so the dictation UI appears the instant you release the hotkey

The Rust layer owns everything latency-sensitive: the low-level keyboard hook, audio capture via `cpal`, media control via the `windows` crate, and clipboard pasting via Win32 — keeping hotkey-to-recording under 50 ms.

## License

[MIT](./LICENSE) — built for faster workflows.
