# GEMINI CLI — project context adapter

## Tool-specific commands
- Dev: `npm run tauri dev`
- Build: `npm run build` / `npm run tauri build`
- Test: `[TO VERIFY]`
- Lint: `[TO VERIFY]`

## Load at session start
 @memory/PROJECT.md @memory/CURRENT_TASK.md @memory/KNOWN_ISSUES.md

## Session rules
- Read CURRENT_TASK.md before touching any code
- If making a non-obvious architectural decision, append to memory/DECISIONS.md first
- At session end: update memory/CURRENT_TASK.md with where you stopped and what is next
- At session end: append a summary to logs/[today's date].md
- Never rename or restructure files without explicit user approval
- Mark any uncertainty with [TO VERIFY] rather than guessing silently
