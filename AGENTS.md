# AGENTS.md — Repo rules

## Operating mode
- Follow `CODEX_OPERATING_MODE.md` (loaded via fallback instruction discovery).

## Repo intent
- This is a project to investigate the sources of Spain's electricity generation and the marginal technologies that defined the price of electricity

## Folder conventions
- Never commit large data; keep data/ gitignored by default

## Takeover / handover requirements (always keep updated)
- Keep README.md accurate (what this is, key outputs, how to run)
- Keep docs/RUNBOOK.md updated (step-by-step run instructions for human read and autonomous reproducibility)
- After each task:
  - append a short entry to docs/CHANGELOG.md with date, task summary, files changed, how to reproduce
  - append a short entry to docs/PROMPT_LOG.md with date/time and user prompt in the Codex / AI agent tool that led to that task being run


