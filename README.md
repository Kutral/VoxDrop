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
</p>

## Why VoxDrop?

VoxDrop is built for the moment when typing is slower than thinking. Hold a global shortcut, speak naturally, release the keys, and let the app transcribe, clean, expand your saved snippets, and paste the final text into your current workflow. It is designed for notes, chat replies, drafting, support work, repetitive text entry, and fast desktop-first writing.

## Highlights

<table>
  <tr>
    <td width="50%">
      <h3>Fast desktop dictation</h3>
      <p>Press a global shortcut from anywhere, record instantly, and get feedback through a floating pill window that stays out of the way.</p>
    </td>
    <td width="50%">
      <h3>AI cleanup without chatbot behavior</h3>
      <p>Groq Whisper handles transcription and a Groq Llama model reformats raw speech into cleaner text without changing the original meaning.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>Snippet expansion</h3>
      <p>Turn spoken trigger phrases into long-form text like links, signatures, canned replies, and repeated instructions.</p>
    </td>
    <td width="50%">
      <h3>Native paste flow</h3>
      <p>The app copies the result and simulates paste into the currently focused desktop application, so the output lands where you were already working.</p>
    </td>
  </tr>
</table>

## App Flow

<p align="center">
  <img src="./docs/assets/voxdrop-architecture.svg" alt="VoxDrop runtime flow diagram" width="100%" />
</p>

1. Press the global hotkey.
2. Rust starts microphone recording.
3. Release the hotkey to stop capture.
4. Groq Whisper transcribes the WAV audio.
5. A Groq Llama model cleans punctuation and removes filler.
6. Saved snippets are expanded.
7. VoxDrop syncs history and pastes the final text into your active app.

## Feature Set

- Global shortcut dictation with a floating pill overlay
- Main dashboard with `History`, `Snippets`, and `Settings`
- Groq API key validation from inside the UI
- Selectable Whisper and Llama models
- Local snippet management
- Local persisted settings using Zustand
- Tauri-native audio capture and paste automation

## Tech Stack

- React 19
- TypeScript
- Vite 7
- Tailwind CSS
- Framer Motion
- Tauri 2
- Rust
- Groq SDK
- Zustand

## Project Structure

The full project breakdown lives in [project.md](./project.md). That file documents the directories, key files, runtime responsibilities, generated folders, and setup notes in detail.

```text
.
|-- docs/
|-- public/
|-- src/
|-- src-tauri/
|-- .env.example
|-- LICENSE
|-- README.md
`-- project.md
```

## Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/Kutral/VoxDrop.git
cd VoxDrop
```

### 2. Install dependencies

```bash
npm install
```

### 3. Install Rust and Tauri prerequisites

You need the Rust stable toolchain plus the OS-specific Tauri prerequisites.

On Windows, make sure you have:

- [Rust](https://www.rust-lang.org/tools/install)
- Microsoft C++ Build Tools
- WebView2 Runtime

Official guide:

- [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### 4. Add your API key

VoxDrop currently uses Groq for both transcription and cleanup.

Create a local environment file:

```bash
cp .env.example .env.local
```

PowerShell alternative:

```powershell
Copy-Item .env.example .env.local
```

Then set:

```env
VITE_GROQ_API_KEY=your_groq_api_key_here
```

You can also skip the env file and paste the key into the app later inside `Settings -> Neural API Key`.

### 5. Start the desktop app

```bash
npm run tauri dev
```

This is the recommended command because it launches the full native app with global shortcuts, microphone capture, and paste automation.

### 6. Optional web-only preview

```bash
npm run dev
```

This only starts the Vite frontend. Native features require Tauri mode.

## Build a Production App

```bash
npm run tauri build
```

## API Configuration

Current UI model options:

### Whisper transcription

- `whisper-large-v3-turbo`
- `whisper-large-v3`

### Llama cleanup

- `llama-3.1-8b-instant`
- `llama-3.3-70b-versatile`
- `allam-2-7b`

The app currently calls Groq directly from the frontend using browser-enabled SDK access. That is convenient for personal desktop use, but if you plan to distribute VoxDrop broadly, moving requests behind a trusted backend or native command would be safer.

## How to Use VoxDrop

1. Launch the app with `npm run tauri dev`.
2. Open `Settings`.
3. Add your Groq API key and click `Authenticate`.
4. Optionally change the Whisper and Llama models.
5. Add snippet triggers in the `Snippets` tab.
6. Focus any text field in another app.
7. Hold the dictation hotkey, speak, then release.
8. VoxDrop will transcribe, clean, and paste the result automatically.

## Default Shortcut

```text
Control + Shift + Space
```

You can change it in settings. The UI requires at least two modifier keys plus one main key to reduce accidental collisions.

## Troubleshooting

### The hotkey does not trigger

- Run the app with `npm run tauri dev`, not only `npm run dev`
- Make sure another application is not already using the same shortcut
- Reset the hotkey in settings

### The app cannot record audio

- Check microphone permissions for the app and your OS
- Confirm your default input device is available
- Try another microphone if the current one is blocked

### The API key test fails

- Make sure the key is valid for Groq
- Check your internet connection
- Remove any accidental spaces or quotes

### Text does not paste into the target app

- Keep focus on the destination app before using the hotkey
- Some secure apps block simulated paste input
- Test in a normal text editor first

## Security Notes

- The API key is stored locally if you enter it in the settings screen.
- Groq requests are currently made from the frontend layer.
- The app simulates `Ctrl+V`, so final behavior depends on the target application.

## License

This project is licensed under the [MIT License](./LICENSE).
