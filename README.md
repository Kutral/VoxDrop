<p align="center">
  <img src="./docs/assets/voxdrop-banner.svg" alt="VoxDrop banner" width="100%" />
</p>

<h1 align="center">VoxDrop</h1>

<p align="center">
  Desktop dictation for Windows with a global hotkey, a floating listening pill, Groq-powered transcription, smart text cleanup, and snippet expansion.
</p>

<p align="center">
  <a href="https://github.com/Kutral/VoxDrop/releases"><img src="https://img.shields.io/github/v/release/Kutral/VoxDrop?style=for-the-badge&label=Latest%20Release" alt="Latest release" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-0b1220?style=for-the-badge" alt="MIT license" /></a>
</p>

## Overview

VoxDrop lets you hold a hotkey, speak, release, and have polished text pasted directly into the app you are currently using. It is designed for fast desktop-first writing, short-form replies, repetitive text entry, and voice-driven workflows.

Core flow:

1. Hold the dictation hotkey.
2. Speak naturally.
3. Release the keys.
4. VoxDrop records audio, transcribes it with Groq Whisper, cleans it with a Groq Llama model, expands snippets, and pastes the result at your cursor.

## Main Features

- Global hotkey dictation
- Floating listening pill above the taskbar
- Groq Whisper transcription
- Groq Llama text cleanup
- Snippet expansion before paste
- Local settings and activity history
- Desktop build support through Tauri

## How to Open the App

### Option 1: Development mode

Use this while actively working on the app.

Open a terminal in the project folder:

```powershell
cd D:\Projects\Voxdrop
npm install
npm run tauri dev
```

This runs VoxDrop in live-reload mode, so code changes appear immediately.

### Option 2: Permanent installation

Build the app once to generate an installer:

```powershell
npm run tauri build
```

After the build finishes, the Windows installer will be generated under:

```text
src-tauri\target\release\bundle\msi\
```

Run the generated installer to add VoxDrop to the Start Menu and create a normal desktop-installed app experience.

## How to Use the App

### Dictation hotkey

Default hotkey:

```text
Ctrl + Shift + Space
```

Usage:

1. Hold the hotkey to start recording.
2. Speak while the listening pill is visible.
3. Release the keys to stop recording.
4. VoxDrop will transcribe, clean, and paste the text automatically.

### Change the hotkey

1. Open the main VoxDrop window.
2. Go to `Settings`.
3. Find `Dictation Hotkey`.
4. Click the input box.
5. Press the new key combination you want to use.

Note:

- The app requires at least two modifier keys such as `Ctrl`, `Shift`, or `Alt` to reduce accidental conflicts with common shortcuts.

### Snippets

Snippets let you replace spoken trigger phrases with longer saved text.

Example:

- Trigger phrase: `my-email`
- Expansion: `hello@example.com`

How to add one:

1. Open the `Snippets` tab.
2. Enter a trigger phrase.
3. Enter the expansion text.
4. Save it.

The next time you dictate that trigger phrase, VoxDrop replaces it before pasting the final result.

### If old hotkey settings feel stuck

If you still see older stored settings, clear the app's local storage and restart the app.

Suggested recovery flow:

1. Open DevTools with `F12`.
2. Go to `Application`.
3. Open `Local Storage`.
4. Clear the stored VoxDrop data.
5. Restart the app.

## API Setup

VoxDrop currently uses Groq for both transcription and cleanup.

You can provide the API key in either of these ways:

### Option 1: Set it in the app

1. Open `Settings`.
2. Paste your Groq API key into `Neural API Key`.
3. Click `Authenticate`.

### Option 2: Preload it with an env file

Create a local env file:

```powershell
Copy-Item .env.example .env.local
```

Then set:

```env
VITE_GROQ_API_KEY=your_groq_api_key_here
```

## Local Development

Install dependencies:

```powershell
npm install
```

Run the desktop app:

```powershell
npm run tauri dev
```

Build the production app:

```powershell
npm run tauri build
```

## Requirements

- Node.js
- npm
- Rust stable toolchain
- Tauri prerequisites for Windows
- Microsoft C++ Build Tools
- WebView2 Runtime

Official setup guide:

- [Tauri prerequisites](https://tauri.app/start/prerequisites/)

## Project Docs

Detailed project structure and directory documentation live in [project.md](./project.md).

## License

This project is licensed under the [MIT License](./LICENSE).
