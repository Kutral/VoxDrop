# Current task

## Objective
Fix microphone showing as "in use" when app is idle

## Secondary Objective (Completed 2026-04-17)
- Implemented inline Copy and Edit buttons for Snippets in the UI.

## Scope
### In scope
- Modifying audio stream initialization to start paused
- Pausing/resuming audio stream on start/stop recording
- Ensuring microphone is released when idle

### Out of scope (do not touch)
- Modifying the frontend UI for recording
- Changing audio format or processing

## Files involved
- `src-tauri/src/audio.rs`

## Definition of done
- The microphone privacy indicator in Windows does not show "in use" when the app is running but not actively recording.
- Audio recording still works correctly when triggered by the hotkey.

## Blockers / open questions
- None currently.

## Last updated
2026-04-17 — Finished adding copy and edit buttons to snippets. The primary objective (audio.rs fix) is up next.