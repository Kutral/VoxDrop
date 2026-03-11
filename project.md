# VoxDrop Project Reference

## Snapshot

- Project name: `VoxDrop`
- App type: desktop dictation utility built with Tauri, React, TypeScript, and Rust
- Primary purpose: record speech with a global shortcut, transcribe it with Groq Whisper, clean the text with a Groq Llama model, optionally expand snippets, then paste the result into the currently focused application
- Repository note: the remote GitHub repository `https://github.com/Kutral/VoxDrop` was empty before this documentation pass

## Product Summary

VoxDrop has two windows:

1. A main dashboard for history, snippets, and settings.
2. A compact always-on-top pill that appears during dictation.

End-to-end flow:

1. Register a global shortcut in Tauri.
2. Start audio capture in Rust when the shortcut is pressed.
3. Stop capture when the shortcut is released.
4. Send the captured WAV audio to Groq Whisper for transcription.
5. Send the raw transcript to a Groq Llama model for cleanup.
6. Expand saved snippet triggers into full text.
7. Store the result in local state and paste it into the active app.

## Tech Stack

- Frontend: React 19, TypeScript, Vite 7, Tailwind CSS, Framer Motion, Lucide React
- Desktop shell: Tauri 2
- Native backend: Rust
- Audio capture: `cpal`, `hound`
- Clipboard and paste automation: `arboard`, `enigo`
- Storage: Zustand persisted state, Tauri SQL migrations for SQLite
- AI provider: Groq SDK

## Runtime Architecture

### Frontend

- `src/App.tsx`: selects the correct UI based on the current Tauri window label
- `src/components/MainView.tsx`: main dashboard with `History`, `Snippets`, and `Settings`
- `src/components/PillView.tsx`: floating dictation status pill and orchestration flow
- `src/lib/groq.ts`: Groq transcription, cleanup, and API-key validation helpers
- `src/store.ts`: persisted local app state for API key, models, and snippets

### Rust backend

- `src-tauri/src/lib.rs`
  - boots the Tauri app
  - registers the global shortcut
  - positions and manages the pill window
  - exposes Tauri commands
  - relays events between windows
- `src-tauri/src/audio.rs`
  - records microphone audio
  - assembles WAV data in memory
  - returns base64 audio to the frontend
- `src-tauri/src/paste.rs`
  - writes text to the clipboard
  - simulates `Ctrl+V`
- `src-tauri/src/db.rs`
  - defines migrations for `history` and `snippets`

## Data and Configuration

- API key setup:
  - can be entered in the app settings UI
  - can also be preloaded with `VITE_GROQ_API_KEY`
- Persisted Zustand data:
  - API key
  - selected Whisper model
  - selected Llama model
  - snippets
- Runtime-only state:
  - transient recording and processing status
  - in-memory history list for the current session
- Native database:
  - migrations exist, but the current UI primarily uses Zustand persistence and event sync

## Directory Inventory

This inventory covers every current project directory in the workspace. Generated dependency and build directories are included and marked clearly.

```text
Voxdrop/
|-- .agents/
|   `-- skills/
|       |-- enhance-prompt/
|       |   |-- README.md
|       |   |-- SKILL.md
|       |   `-- references/
|       |       `-- KEYWORDS.md
|       |-- frontend-design/
|       |   `-- SKILL.md
|       |-- react-components/
|       |   |-- examples/
|       |   |   `-- gold-standard-card.tsx
|       |   |-- resources/
|       |   |   |-- architecture-checklist.md
|       |   |   |-- component-template.tsx
|       |   |   |-- stitch-api-reference.md
|       |   |   `-- style-guide.json
|       |   |-- scripts/
|       |   |   |-- fetch-stitch.sh
|       |   |   `-- validate.js
|       |   |-- package-lock.json
|       |   |-- package.json
|       |   |-- README.md
|       |   `-- SKILL.md
|       |-- remotion/
|       |   |-- examples/
|       |   |   |-- screens.json
|       |   |   `-- WalkthroughComposition.tsx
|       |   |-- resources/
|       |   |   |-- composition-checklist.md
|       |   |   `-- screen-slide-template.tsx
|       |   |-- scripts/
|       |   |   `-- download-stitch-asset.sh
|       |   |-- README.md
|       |   `-- SKILL.md
|       `-- stitch-loop/
|           |-- examples/
|           |   |-- next-prompt.md
|           |   `-- SITE.md
|           |-- resources/
|           |   |-- baton-schema.md
|           |   `-- site-template.md
|           |-- README.md
|           `-- SKILL.md
|-- .vscode/
|   `-- extensions.json
|-- docs/
|   `-- assets/
|       |-- voxdrop-architecture.svg
|       `-- voxdrop-banner.svg
|-- node_modules/                (generated npm dependency tree; do not commit)
|-- public/
|   |-- tauri.svg
|   `-- vite.svg
|-- src/
|   |-- assets/
|   |   `-- react.svg
|   |-- components/
|   |   |-- MainView.tsx
|   |   `-- PillView.tsx
|   |-- lib/
|   |   `-- groq.ts
|   |-- App.css
|   |-- App.tsx
|   |-- index.css
|   |-- main.tsx
|   |-- store.ts
|   `-- vite-env.d.ts
|-- src-tauri/
|   |-- capabilities/
|   |   `-- default.json
|   |-- gen/
|   |   `-- schemas/
|   |       |-- acl-manifests.json
|   |       |-- capabilities.json
|   |       |-- desktop-schema.json
|   |       `-- windows-schema.json
|   |-- icons/
|   |   |-- 128x128.png
|   |   |-- 128x128@2x.png
|   |   |-- 32x32.png
|   |   |-- icon.icns
|   |   |-- icon.ico
|   |   |-- icon.png
|   |   |-- Square107x107Logo.png
|   |   |-- Square142x142Logo.png
|   |   |-- Square150x150Logo.png
|   |   |-- Square284x284Logo.png
|   |   |-- Square30x30Logo.png
|   |   |-- Square310x310Logo.png
|   |   |-- Square44x44Logo.png
|   |   |-- Square71x71Logo.png
|   |   |-- Square89x89Logo.png
|   |   `-- StoreLogo.png
|   |-- src/
|   |   |-- audio.rs
|   |   |-- db.rs
|   |   |-- lib.rs
|   |   |-- main.rs
|   |   `-- paste.rs
|   |-- target/                  (generated Rust build tree; do not commit)
|   |-- .gitignore
|   |-- build.rs
|   |-- Cargo.lock
|   |-- Cargo.toml
|   `-- tauri.conf.json
|-- .env.example
|-- .gitignore
|-- index.html
|-- LICENSE
|-- package-lock.json
|-- package.json
|-- postcss.config.js
|-- project.md
|-- README.md
|-- tailwind.config.js
|-- tsconfig.json
|-- tsconfig.node.json
`-- vite.config.ts
```

## File Notes

### Root files

- `.env.example`: sample local environment file for preloading the Groq API key
- `.gitignore`: excludes dependency installs, build output, local env files, Rust artifacts, and local DB files
- `index.html`: Vite HTML entry
- `LICENSE`: MIT license text
- `package.json`: JavaScript dependencies and scripts
- `package-lock.json`: npm lockfile
- `postcss.config.js`: PostCSS setup
- `README.md`: public-facing project documentation
- `tailwind.config.js`: Tailwind configuration
- `tsconfig.json`: frontend TypeScript configuration
- `tsconfig.node.json`: tooling TypeScript configuration
- `vite.config.ts`: Vite and Tauri dev-server configuration

### `.agents/`

- local skills and references used by the Codex workspace
- supports the development environment, not the shipped desktop runtime

### `.vscode/`

- editor recommendations for contributors

### `docs/`

- repository-only visual assets used inside the README

### `public/`

- static Vite-served assets
- currently contains starter SVGs

### `src/`

- `App.tsx`: routes between the main window and pill window
- `App.css`: starter template CSS still present
- `index.css`: Tailwind imports and global visual styling
- `main.tsx`: React mount point
- `store.ts`: Zustand store, now also able to read `VITE_GROQ_API_KEY`
- `vite-env.d.ts`: Vite environment typings

### `src/components/`

- `MainView.tsx`: dashboard experience, tab navigation, snippet management, settings, and history
- `PillView.tsx`: dictation lifecycle, Groq processing, snippet expansion, and paste trigger

### `src/lib/`

- `groq.ts`: Groq SDK integration and helper functions

### `src-tauri/`

- `.gitignore`: subproject ignore rules
- `build.rs`: Tauri build script
- `Cargo.lock`: Rust lockfile
- `Cargo.toml`: Rust dependency manifest
- `tauri.conf.json`: app metadata, windows, bundling, and build hooks

### `src-tauri/capabilities/`

- `default.json`: desktop capability permissions

### `src-tauri/gen/schemas/`

- generated schema files for capabilities and window configuration

### `src-tauri/icons/`

- app icons for Windows, macOS, and packaging targets

### `src-tauri/src/`

- `audio.rs`: microphone capture and WAV generation
- `db.rs`: SQLite migrations
- `lib.rs`: runtime setup, shortcut registration, event bridge, and commands
- `main.rs`: binary entrypoint
- `paste.rs`: clipboard write and synthetic paste behavior

### Generated directories

- `node_modules/`: npm installation output
- `src-tauri/target/`: Rust compiler output

These directories are part of the local workspace today but should remain uncommitted.

## Commands

- `npm run dev`: start the Vite dev server only
- `npm run build`: build the web frontend
- `npm run preview`: preview the Vite production build
- `npm run tauri dev`: run the full desktop app
- `npm run tauri build`: create a desktop production build

## Local Development Requirements

- Node.js 20+
- npm 10+
- Rust stable
- Tauri prerequisites for your operating system
- On Windows: Microsoft C++ Build Tools and WebView2 runtime are commonly required

## API Setup

VoxDrop currently integrates with Groq only.

Ways to provide the Groq key:

1. Create `.env.local` from `.env.example` and set `VITE_GROQ_API_KEY`.
2. Start the app and enter the key in `Settings -> Neural API Key`.

Current model choices exposed by the UI:

- Whisper:
  - `whisper-large-v3-turbo`
  - `whisper-large-v3`
- Cleanup LLM:
  - `llama-3.1-8b-instant`
  - `llama-3.3-70b-versatile`
  - `allam-2-7b`

## Current Capabilities

- global shortcut dictation
- floating pill feedback window
- Groq transcription
- Groq text cleanup
- snippet expansion
- local settings persistence
- history sync between windows
- automatic paste into the focused application

## Observations

- SQLite migrations exist, but the current UI logic does not yet read and write history or snippets through the database
- `src/App.css`, `public/vite.svg`, `public/tauri.svg`, and `src/assets/react.svg` appear to be starter-template leftovers
- Groq calls currently run from the frontend with browser access enabled, so the API key is still a client-side secret

## Suggested Next Steps

1. Move Groq requests into trusted native commands or a backend service.
2. Wire the SQLite layer into the actual history and snippet workflows.
3. Add tests for snippet expansion and dictation edge cases.
4. Replace remaining starter-template assets and CSS with project-specific assets.
