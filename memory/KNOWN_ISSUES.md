# Known issues and gotchas

## Active bugs
<!-- Add bugs here as: ID | Description | File/area | Severity | Status -->

## Don't-touch zones
- `src-tauri/src/windows_hotkey.rs` — Low-level Windows keyboard hook; fragile interaction with OS input pipeline
- `src-tauri/src/paste.rs` — Win32 clipboard manipulation with `ExcludeClipboardContentFromMonitorProcessing`; non-obvious dependencies on Windows clipboard chain
- `src/store.ts` partialize config — Changing persisted keys will break existing user localStorage data without migration
- `vite.config.ts` port configuration — Tauri expects fixed port 1420; changing it breaks the Tauri dev pipeline

## External blockers
- Groq API availability and rate limits directly impact core functionality
- GitHub API rate limits may affect update checking for unauthenticated requests
- Windows-specific features (hotkey hooks, clipboard API) limit cross-platform portability

## Resolved (keep for reference)
<!-- Move fixed bugs here with resolution note -->
- **v0.0.6** — State-sync race condition in Settings UI for hotkey recording (fixed by rewriting hotkey engine)
- **v0.0.6** — Hotkey latency reduced by moving audio recording start and system muting to Rust backend
- **March 2026** — Replaced `enigo` keystroke simulation with clipboard-based pasting for instant paste
