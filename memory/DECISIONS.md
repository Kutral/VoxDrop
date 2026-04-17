# Architecture Decision Records

## ADR-001 — Dual-Window Architecture for UI
Date: 2026-04-10
Status: Accepted
Context: The app needs a main dashboard for settings and history, but also requires a fast, unobtrusive UI for dictation feedback that doesn't interrupt the user's workflow.
Decision: Implemented a dual-window architecture using Tauri. A main window handles the dashboard and settings, while a separate, transparent, borderless "pill" window is used for dictation status.
Consequences: Allows for a clean separation of concerns and a non-blocking user experience during dictation. Requires careful state synchronization between windows (e.g., using Tauri events to broadcast settings changes and history updates).
Trade-offs: Increased complexity in state management and event routing compared to a single-window application.

<!-- Add new ADRs above this line -->
