---
name: styleprint-weekly-docs
description: Create or update StylePrint weekly planning, task, issue-draft, and GitHub Wiki Markdown documents. Use when Codex is asked to prepare week N docs such as week3/week4 plans, keep docs/wiki weekly deliverables current, turn project status into issue-ready weekly tasks, or update StylePrint agent workflow notes.
---

# StylePrint Weekly Docs

## Overview

Use this skill to produce repo-local weekly Wiki drafts for StylePrint. Keep output grounded in inspected files and current repo state, and distinguish implemented behavior from planned work.

## Workflow

1. Inspect current context before writing:
   - `docs/wiki/Home.md`
   - existing `docs/wiki/week*.md`
   - `README.md`
   - `AGENTS.md`
   - `package.json`
   - `git status --short`

2. Determine the target week:
   - Use the explicit week if the user names one.
   - Otherwise, choose the next week after the highest existing `docs/wiki/weekN-*.md`.
   - If current and target week are ambiguous, state the assumption before writing.

3. Decide the document type:
   - Use `docs/wiki/weekN-task-issues.md` for weekly task plans and GitHub Issue drafts.
   - Use `docs/wiki/weekN-technical-requirements.md` only when the user asks for a technical requirements plan.
   - Update `docs/wiki/Home.md` only when the user asks for index/wiki navigation updates or when creating a new weekly deliverable set.

4. Create or update the document:
   - Prefer updating the existing week file over creating a parallel concept.
   - Preserve useful existing sections and append/update the minimal necessary content.
   - Keep sections issue-ready: goal, scope, success criteria, verification, risks, and order.
   - Do not claim deployment, tests, or implementation are complete unless verified in this turn.

5. Verify:
   - Run a lightweight Markdown/file check, usually `rg -n "TODO|\\[이번 주|\\[검증" docs/wiki/weekN-*.md` to catch unfilled placeholders.
   - If code changed as part of the task, follow repo rules: `npm run typecheck`; use `npm run build` for broader frontend/backend changes.

## Helper Script

Use `scripts/create_weekly_doc.mjs` to create a new weekly draft scaffold:

```bash
node docs/agent-skills/styleprint-weekly-docs/scripts/create_weekly_doc.mjs --week 4 --kind task-issues --focus "production demo hardening"
```

If `--week` is omitted, the script uses the next week after the highest existing `docs/wiki/weekN-*.md`. The script refuses to overwrite an existing file unless `--force` is passed. Use `--dry-run` to preview the target path and template without writing.

Read `references/weekly-doc-contract.md` before drafting a substantial weekly doc or changing `docs/wiki/Home.md`.
