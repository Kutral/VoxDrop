# Current task

## Objective
Fix microphone showing as "in use" when app is idle, optimize application performance/responsiveness, fix statistics calculations, and add clipboard feedback.

## Completed Objectives (2026-05-22)
- Configured WebView2 additional browser args to prevent background activity suspension.
- Added periodic keyboard hook re-registration (every 5 minutes) to ensure low-level keyboard input responsiveness.
- Pre-warmed CPAL input device cache on startup to ensure instant first-dictation trigger while keeping the microphone idle.
- Released the microphone device handle immediately when recording stops, ensuring the system-wide microphone "in use" privacy indicator remains inactive when idle.
- Added a hydration-aware glassmorphic startup loading screen.
- Decoupled statistics (Weekly Streak, WPM, and Word Counts) from the 100-item history cap using persisted Zustand accumulators.
- Fixed calendar week alignment to local Sunday boundaries to preserve weekly streaks across Wednesday/Thursday transitions.
- Implemented standard ordinal suffix formatting for streaks (e.g. 21st, 22nd, 23rd).
- Added visual "Copied" status feedback to the Activity Log copy button.

## Completed Secondary Objectives (2026-04-26)
- Completely overhauled the frontend to feature a premium fluid glassmorphic UI with animated mesh backgrounds.
- Fixed an IPC event mismatch (`history-update` vs `history-sync`) that was preventing the Dashboard statistics (streak, word count, speed) from updating after a dictation.
- Prior to this (2026-04-17): Implemented inline Copy/Edit buttons for Snippets and bumped version to v0.0.9.

## Files involved
- `src-tauri/src/audio.rs`
- `src-tauri/src/windows_hotkey.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- `src/App.tsx`
- `src/store.ts`
- `src/components/MainView.tsx`
- `src/index.css`

## Definition of done
- The microphone privacy indicator in Windows does not show "in use" when the app is running but not actively recording (Verified).
- Audio recording still works correctly when triggered by the hotkey (Verified).
- Weekly streaks and all-time word counts calculate and display correctly and stably (Verified).
- Copying a history item provides immediate "Copied" visual feedback (Verified).
- The build compiles and packages successfully (Verified).

## Last updated
2026-05-22 — Completed the performance, reliability, and statistics overhaul (v0.0.12). Addressed tab transition slowness by shortening the Tailwind fade-in duration to 100ms, minimizing translation offset, and accelerating sidebar button transitions to 100ms. All features implemented, verified to build cleanly, and dev server runs successfully. Task is complete.
2026-05-22 — Designed, developed, and integrated a premium animated SVG banner demonstrating the VoxDrop dictation workflow (Global Hotkey Trigger -> Listening Pill -> AI Text Typing & Auto-Paste) and pushed it to main. Later resolved sandboxing and caching issues by stripping external Google Fonts, adopting text elements instead of tspan, and removing the dot-slash prefix in the README image path to bypass GitHub's Camo CDN proxy cache. Fixed overlapping placeholder text inside the Listening Pill by introducing mutually exclusive opacity animations for the active and idle content states.


