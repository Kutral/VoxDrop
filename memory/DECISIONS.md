# Architecture Decision Records

## ADR-001 — Dual-Window Architecture for UI
Date: 2026-04-10
Status: Accepted
Context: The app needs a main dashboard for settings and history, but also requires a fast, unobtrusive UI for dictation feedback that doesn't interrupt the user's workflow.
Decision: Implemented a dual-window architecture using Tauri. A main window handles the dashboard and settings, while a separate, transparent, borderless "pill" window is used for dictation status.
Consequences: Allows for a clean separation of concerns and a non-blocking user experience during dictation. Requires careful state synchronization between windows (e.g., using Tauri events to broadcast settings changes and history updates).
Trade-offs: Increased complexity in state management and event routing compared to a single-window application.

## ADR-002 — Fluid Glassmorphic UI & Animation Layer
Date: 2026-04-26
Status: Accepted
Context: The app required a more modern, premium aesthetic that felt "alive" while maintaining maximum performance without weighing down the main process.
Decision: Implemented a fluid glassmorphic design utilizing a CSS-only animated gradient mesh (`blob` keyframes) in the background. All content layers (Sidebar, Dashboard cards, Lists) were transitioned to `glass-panel` components using `backdrop-blur-3xl` and semi-transparent backgrounds to compose depth.
Consequences: Significantly elevates the visual quality of the app. The CSS-only approach guarantees that animations are offloaded to the GPU and do not block the main thread or interfere with the Tauri native backend.
Trade-offs: Increased CSS complexity; requires strict adherence to transparency and blur variables to maintain visual harmony across differing themes.

## ADR-003 — Microphone Cache Priming and Stream Deallocation
Date: 2026-05-22
Status: Accepted
Context: Windows shows the microphone "in use" indicator in the taskbar whenever an audio capture stream is active, even if paused. Keeping the stream permanently open for "pre-warming" was violating privacy standards by showing the microphone as active when the app was idle. However, completely initializing CPAL and creating the WASAPI stream on hotkey-press introduces a ~500ms startup latency.
Decision: Spawn a background thread on startup that only initializes CPAL and queries the default host/device parameters. This primes the COM library and OS input device enumeration cache without building or starting a stream. Modified `stop_recording` to call `.take()` on the state stream, dropping it immediately.
Consequences: Releasing (dropping) the stream wrapper immediately closes the WASAPI capture endpoint when recording stops, instantly removing the microphone "in use" system tray indicator. On the next recording request, recreating the stream is extremely fast (~20-50ms) because the COM device parameters are already warm in memory.
Trade-offs: None; resolves both the privacy indicator issue and the hotkey recording latency.

<!-- Add new ADRs above this line -->
