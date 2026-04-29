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
- None currently for the six release-blocking findings fixed in v0.0.11.
- [TO VERIFY] Manual Windows validation still needed for the microphone privacy indicator and real target-app paste behavior.

## Last updated
2026-04-29 — Fixed the six reviewed bugs for v0.0.11: hotkey/audio cleanup, re-entrant recording, paste error reporting, update comparison, duplicate non-modifier hotkey emitters, and fatal startup audio pre-warm. Build, audit, Rust format, and locked Rust check pass. Next step: publish and verify the GitHub release, then manually test on Windows.
