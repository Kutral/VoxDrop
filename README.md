<h1 align="center">
  <img src="public/voxdrop-favicon.svg" alt="VoxDrop" width="76" height="76" /><br/>
  <strong>VoxDrop</strong>
</h1>

<p align="center">
  <strong>Speak. Release. It's typed.</strong><br/>
  Hold a hotkey anywhere in Windows, say what you mean, and watch polished,<br/>
  punctuated text land in whatever app you're using.
</p>

<p align="center">
  <a href="https://github.com/Kutral/VoxDrop/releases/latest"><img src="https://img.shields.io/badge/Download%20for%20Windows-Free-4F46E5?style=for-the-badge&logo=github&logoColor=white" alt="Download VoxDrop" /></a>
</p>

<p align="center">
  <a href="https://github.com/Kutral/VoxDrop/releases"><img src="https://img.shields.io/github/v/release/Kutral/VoxDrop?style=flat-square&color=4F46E5&label=release" alt="Latest release" /></a>
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/Tauri%202-FFC131?style=flat-square&logo=tauri&logoColor=black" alt="Tauri" /></a>
  <a href="https://rust-lang.org/"><img src="https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React%2019-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-0b1220?style=flat-square" alt="MIT license" /></a>
</p>

<p align="center">
  <img src="docs/assets/animated-banner.svg" alt="VoxDrop dictation workflow" width="100%" />
</p>

---

<p align="center">
  <strong>&lt; 50 ms hotkey response</strong> &nbsp;·&nbsp; <strong>near-zero idle footprint</strong> &nbsp;·&nbsp; <strong>100% local history</strong>
</p>

Dictation tools are usually slow, heavy, or locked to one app. VoxDrop is a native **Rust + Tauri** desktop app that idles at almost zero cost, reacts the instant you release the hotkey, and streams your voice to Groq's LPUs for near-instant transcription. An LLM then cleans it up — filler removed, punctuation fixed — and the final text is pasted straight into whatever you were already typing in.

<p align="center">
  <img src="docs/assets/dashboard-v0.0.14.png" alt="The VoxDrop dashboard — aurora hero with a 14-day voiceprint, floating dock, and dictation telemetry" width="760" />
</p>

## How it works

| | |
|:---:|---|
| **1 · Hold** | Press and hold your hotkey — <kbd>Ctrl</kbd> <kbd>Win</kbd> by default — from *any* app. |
| **2 · Speak** | A floating pill appears above your taskbar and listens. Background music pauses automatically. |
| **3 · Release** | Recording stops the instant you let go. |
| **4 · Done** | Whisper transcribes, an LLM polishes it, snippets expand, and the text is pasted at your cursor. |

## Features

**Dictation engine**
- Global hotkey that works everywhere — modifier-only chords like `Ctrl + Win` included, fully remappable
- Pre-warmed dictation pill that renders instantly, with a live waveform while you speak
- Automatic media pause while dictating, resumed the moment you stop

**AI pipeline — Groq + Cerebras**

| Stage | Options |
|---|---|
| Transcription | Whisper **Turbo** (near-instant) · Whisper **Large V3** (max quality) |
| Text polish — Groq | GPT-OSS 20B · GPT-OSS 120B · Qwen 3.6 27B · ALLaM 2 7B |
| Text polish — Cerebras | Gemma 4 31B · GPT-OSS 120B |

- Inline API key testing — know your credentials work before your first dictation
- Switch providers and models any time in Preferences

**Voice snippets**
- Say *"my meet link"* — get the full URL pasted in its place
- Works for templates, signatures, code blocks, anything you repeat
- Instant search, inline editing, one-click copy

**Dashboard & privacy**
- Live telemetry: speaking speed, time saved, all-time words, weekly streak
- A 14-day voiceprint of your dictation rhythm, drawn from your real history
- History, snippets, and keys stay on your machine (localStorage + SQLite) — audio is streamed for transcription and never stored

## Installation

1. Download the latest installer from [**Releases**](https://github.com/Kutral/VoxDrop/releases/latest)
   - `VoxDrop_x64-setup.exe` — standard installer (recommended)
   - `VoxDrop_x64_en-US.msi` — MSI package
2. Run it, launch VoxDrop from the Start Menu.
3. Open **Preferences**, paste your free [Groq API key](https://console.groq.com/keys), hit **Authenticate** — you're live.

> **Requirements:** Windows 10/11 64-bit · WebView2 (auto-installed) · free Groq account
>
> **SmartScreen note:** installers are not yet code-signed, so Windows may show *"Windows protected your PC"* on first run. Click **More info → Run anyway** — expected for new unsigned releases.

## Voice snippets in 30 seconds

1. **Snippets** tab → **New Snippet**
2. Trigger: `sign-off` — Expansion: `Best regards, John`
3. Dictate *"sign off"* anywhere — your signature is typed for you

## Building from source

**Prerequisites:** [Node.js](https://nodejs.org/) · [Rust](https://rustup.rs/) · [Tauri's Windows prerequisites](https://tauri.app/start/prerequisites/) (MSVC build tools + WebView2)

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

- **Main window** — the React dashboard: telemetry, history, snippets, preferences
- **Pill window** — a transparent overlay pre-created at startup and kept render-ready, so the dictation UI appears the instant you release the hotkey

The Rust layer owns everything latency-sensitive: the low-level keyboard hook, audio capture via `cpal`, media control via the `windows` crate, and clipboard pasting via Win32 — keeping hotkey-to-recording under 50 ms.

## License

[MIT](./LICENSE) — built for faster workflows.
