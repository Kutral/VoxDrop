# Current task

## Objective
Fix microphone showing as "in use" when app is idle

## Completed Secondary Objectives (2026-04-26)
- Completely overhauled the frontend to feature a premium fluid glassmorphic UI with animated mesh backgrounds.
- Fixed an IPC event mismatch (`history-update` vs `history-sync`) that was preventing the Dashboard statistics (streak, word count, speed) from updating after a dictation.
- Prior to this (2026-04-17): Implemented inline Copy/Edit buttons for Snippets and bumped version to v0.0.9.

## Scope
### In scope
- Modifying audio stream initialization to start paused
- Pausing/resuming audio stream on start/stop recording
- Ensuring microphone is released when idle

### Out of scope (do not touch)
- Modifying the frontend UI for recording (unless specifically requested)
- Changing audio format or processing

## Files involved
- `src-tauri/src/audio.rs`

## Definition of done
- The microphone privacy indicator in Windows does not show "in use" when the app is running but not actively recording.
- Audio recording still works correctly when triggered by the hotkey.

## Blockers / open questions
- None currently.

## Last updated
2026-04-26 — Overhauled the UI with a fluid glassmorphic design and fixed the dashboard counters synchronization bug. The very next step for the next session is to return to the primary objective (modifying `src-tauri/src/audio.rs` to fix the idle microphone privacy indicator issue).