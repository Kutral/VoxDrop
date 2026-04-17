# PROJECT.md — VoxDrop

## Project name and description

**VoxDrop** — Windows-first desktop dictation app that captures speech with a global hotkey, transcribes and cleans it with Groq, expands snippets, then pastes the final text into the currently focused app.

## Tech stack

### Frontend
- **React** 19.1.0
- **TypeScript** ~5.8.3
- **Vite** 7.0.4 (bundler/dev server)
- **Tailwind CSS** 3.4.19 (styling)
- **Zustand** 5.0.11 (state management with localStorage persistence)
- **Framer Motion** 12.35.2 (animations)
- **Lucide React** 0.577.0 (icon library)

### Native backend (Tauri)
- **Tauri** 2.x (desktop app framework)
- **Rust** edition 2021
- **cpal** 0.15 (audio recording)
- **hound** 3.5 (WAV encoding)
- **arboard** 3 (clipboard operations)
- **enigo** 0.1.3 (input simulation)
- **windows-sys** 0.59 (Win32 API bindings)
- **windows** 0.58.0 (Windows Media Control)

### External services
- **Groq API** — transcription (whisper-large-v3-turbo) and text cleanup (llama-3.1-8b-instant)
- **GitHub Releases** — update checking

### Tauri plugins
- `@tauri-apps/plugin-global-shortcut` 2.3.1
- `@tauri-apps/plugin-opener` 2.x
- `@tauri-apps/plugin-os` 2.3.2
- `@tauri-apps/plugin-sql` 2.3.2 (SQLite)

## Folder structure

```
VoxDrop/
├── memory/              # AI memory filing system (new)
├── logs/                # Session logs (new)
├── src/                 # React frontend
│   ├── components/      # MainView.tsx, PillView.tsx
│   ├── lib/             # groq.ts, updates.ts
│   ├── App.tsx          # Window router (main vs pill)
│   ├── main.tsx         # React entry point
│   ├── store.ts         # Zustand persisted state
│   └── index.css        # Global styles
├── src-tauri/           # Rust native backend
│   ├── src/
│   │   ├── lib.rs       # Tauri setup, commands, tray, hotkey handlers
│   │   ├── main.rs      # Binary entry point
│   │   ├── audio.rs     # Mic recording, WAV output, system mute
│   │   ├── paste.rs     # Clipboard-based text pasting (Win32 API)
│   │   ├── db.rs        # SQLite migrations
│   │   └── windows_hotkey.rs  # Low-level keyboard hook for chorded hotkeys
│   ├── capabilities/    # Tauri permissions
│   ├── icons/           # Platform icons
│   └── tauri.conf.json  # Tauri app config
├── public/              # Static assets (favicon)
├── docs/                # Architecture diagrams, banners
├── .github/workflows/   # CI/CD (release.yml)
└── [config files]       # vite, tailwind, tsconfig, postcss
```

## How to run locally

| Command | Description |
|---------|-------------|
| `npm install` | Install frontend dependencies |
| `npm run tauri dev` | Run full desktop app in development mode (recommended) |
| `npm run dev` | Run Vite web dev server only (no native features) |
| `npm run build` | Build web frontend (tsc + vite build) |
| `npm run tauri build` | Build production desktop installer/bundles |
| `npm run preview` | Preview built web frontend |

## How to deploy

- **Desktop distribution**: `npm run tauri build` produces platform-specific installers/bundles
- **CI/CD**: GitHub Actions workflow at `.github/workflows/release.yml` handles releases
- **Update mechanism**: In-app update checker polls GitHub Releases API

## External services / APIs

- **Groq** — Neural API for transcription and text cleanup
- **GitHub Releases API** — Version update checking

## Key environment variables

- `VITE_GROQ_API_KEY` — Groq API key (used via `.env.local` or Settings UI)

## Entry points

- **Rust binary**: `src-tauri/src/main.rs` → calls `run()` in `src-tauri/src/lib.rs`
- **React app**: `src/main.tsx` → mounts `src/App.tsx`
- **App routing**: `App.tsx` switches between `MainView` (dashboard) and `PillView` (dictation pill) based on Tauri window label
- **Vite config**: `vite.config.ts` (port 1420, strict port for Tauri)

## Architecture notes

- Dual-window architecture: hidden "pill" window for dictation UI, main window for dashboard/settings
- Hotkey triggers pill window + immediate audio recording + system mute all in Rust (<50ms response)
- Clipboard-based pasting via Win32 API using `ExcludeClipboardContentFromMonitorProcessing` format
- State persisted to localStorage via Zustand persist middleware
- SQLite database for structured data (via Tauri SQL plugin)
- Audio earcons synthesized via Web Audio API (no external audio files)
- Audio stream uses pause/play pattern to avoid keeping microphone active when idle (fixes Windows privacy indicator showing mic "in use" when not recording)
