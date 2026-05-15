# AIStream — Project Rules for Claude Code

## Stack
- Node 20+, TypeScript strict mode, ESM modules
- No frameworks unless justified in the PRD
- Single source-of-truth config: `sources.json` and `.env`

## Quality Gates (Non-Negotiable)
- Every commit must pass `cr --agent --type uncommitted` with zero
  CRITICAL findings before being made.
- MAJOR findings: fix unless they conflict with the PRD. If conflict,
  pause and ask the operator.
- NIT findings: ignore unless trivially fixable in the same diff.
- Cap each review loop at 2 iterations. If critical findings persist
  after 2 loops, stop and surface them to the operator.

## CodeRabbit Workflow (per phase)
1. Implement the phase per the PRD.
2. Run `cr --agent --type uncommitted` in a **visible background shell**
   so the operator can watch progress. Always:
   - Launch via the Bash tool with `run_in_background: true`.
   - Tee output to a log file the operator can tail
     (e.g. `cr --agent --type uncommitted 2>&1 | tee /tmp/cr-phase-N-run-K.log`).
   - Never run `cr` as a silent foreground call.
3. Parse JSON findings. Build a task list grouped by severity.
4. Apply fixes for CRITICAL + MAJOR.
5. Re-run `cr --agent --type uncommitted` the same way (visible
   background shell, tee'd to a new log file).
6. Commit with format: `feat(phase-N): <what>` and a body listing
   the CodeRabbit findings that were resolved.
7. Move to next phase only after a clean verification pass.

## Security Rules (from PRD §8)
- Secrets only in `.env`. Never in source, never in logs.
- Web UI binds to 127.0.0.1 by default.
- Twitch OAuth, OBS WebSocket password, stream key: env vars only.

## Architectural Rules
- Director, voice listener, and dictation listener are separate
  processes. They communicate only through the director's HTTP API.
- No cloud round-trips on the hot path (PRD §3, §8).
- Every scene switch is logged with: timestamp, source, reason,
  outcome. Logs are queryable via the status endpoint.

## What to Pause For
- Any architectural choice not specified in stream_prd.md
- Any CRITICAL CodeRabbit finding you can't resolve in 2 loops
- Any open question listed in PRD §10

## GitHub Workflow

- Every phase ships as its own PR. Never commit directly to main.
- Branch naming: `feat/phase-N-<short-slug>`
- Before opening a PR, the CodeRabbit CLI loop (see above) must pass.
- After opening a PR, wait for CodeRabbit's PR review to post
  (typically 2–5 minutes). Treat its findings the same way as
  CLI findings: fix CRITICAL + MAJOR, ignore NIT.
- PR body must include:
    - One-line summary of the phase
    - Checklist of PRD requirements implemented (with §refs)
    - CodeRabbit CLI findings that were resolved pre-push
- Use `gh pr create` and `gh pr view` from the CLI. Don't ask
  the operator to open a browser.

## Two-Stage Review Model
- Stage 1 (local, fast): `cr --agent --type uncommitted` before push.
  Catches issues before they leave the machine.
- Stage 2 (PR, deep): CodeRabbit GitHub App reviews the PR with full
  context, summary, diagrams, and pre-merge checks. Address any new
  findings here before merging.
- Merge only when:
    - All CRITICAL/MAJOR PR findings resolved
    - Pre-merge checks green
    - PR description's acceptance checklist complete