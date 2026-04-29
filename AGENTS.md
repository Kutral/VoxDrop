# AGENTS.md — Voxdrop Agent Guide

This file is persistent repo guidance for Codex and other agents. Keep it concise: only include instructions that must apply every session. Put large or task-specific workflows in imported memory/topic files so this file stays easy to load and unlikely to be truncated.

## How agents should use this file
- Read this file before work. Also load the memory files listed below at session start.
- Follow global agent instructions first, then this project file, then any closer nested `AGENTS.md`; more local guidance overrides earlier guidance.
- Keep instructions minimal and actionable. Unnecessary requirements reduce task success and increase cost.
- If this file grows large, split stable detail into focused imported files and watch for truncation limits such as `project_doc_max_bytes`.

## Tool-specific commands
- Dev: `npm run tauri dev` (full desktop app in development mode)
- Dev (frontend only): `npm run dev` (Vite web server, no native features)
- Build: `npm run build` (tsc && vite build)
- Build (desktop): `npm run tauri build` (production installer/bundles)
- Preview: `npm run preview`
- Lint: [TO VERIFY — no lint script found in package.json]
- Test: [TO VERIFY — no test script found in package.json]

## Load at session start
@memory/PROJECT.md
@memory/CURRENT_TASK.md
@memory/KNOWN_ISSUES.md

## Working rules
- Read `memory/CURRENT_TASK.md` before touching code.
- Plan first for large, cross-cutting, risky, or ambiguous changes; keep small edits direct.
- Prefer repo conventions over new patterns. Capture durable naming conventions, quirks, dependencies, and architectural constraints here or in memory files.
- If making a non-obvious architectural decision, append to `memory/DECISIONS.md` first.
- Never rename or restructure files without explicit user approval.
- Mark uncertainty with `[TO VERIFY]` rather than guessing silently.
- Use `gh` CLI for GitHub work when available.
- At session end: update `memory/CURRENT_TASK.md` with where you stopped and what is next.
- At session end: append a summary to `logs/[today's date].md`.

## Safe subagent deployment
- Use focused subagents only when work can be split cleanly by disjoint file ownership, investigation area, or verification target.
- Give each subagent a clear responsibility, detailed prompt, allowed files, constraints, and expected output.
- Avoid duplicated work. State what each subagent must not touch and how its result will be integrated.
- Do not let subagents edit the same files unless the main agent explicitly coordinates order and conflict handling.
- Keep agent configs and reusable prompts version-controlled when they become part of the repo workflow.
- The main agent owns integration: review subagent output, apply or reject changes, run verification, and report final status.
