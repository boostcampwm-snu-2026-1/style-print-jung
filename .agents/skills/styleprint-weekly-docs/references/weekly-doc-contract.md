# StylePrint Weekly Doc Contract

## Canonical Locations

- Weekly drafts live in `docs/wiki/`.
- Prefer `weekN-task-issues.md` for weekly task plans and issue drafts.
- Prefer `weekN-technical-requirements.md` for a requirements execution plan.
- `Home.md` is the local Wiki index. Keep it short and link only durable weekly deliverables.

## Required Weekly Sections

Use these sections unless the user asks for a different format:

1. `# N주차 Task 계획`
2. `## 목표`
3. `## 완료 기준`
4. `## 현재 상태`
5. `## Task 1. ...`
6. `## Task 2. ...`
7. `## 리스크 및 보류`
8. `## 작업 순서`

Each task should include:

- `목표`
- `작업 범위`
- `검증 기준`

## Repo-Specific Constraints

- Keep the core architecture vocabulary: `apps/web`, `apps/api`, `packages/shared`, `IntentSpec`, facet extraction, recipe selection, evaluate/repair, v0 generation, audit, preview artifact.
- Keep API route compatibility with existing `/api/...` paths.
- If a weekly task changes API contracts, mention `packages/shared/src/types.ts` first in the work order.
- Treat `data/*.json` and `public/uploads` as local runtime data, not stable fixtures.
- Use `npm run typecheck` as the minimum code verification. Use `npm run build` when frontend/backend behavior changes. Use `npm run test` when tests are added or touched.
- Do not mark Vercel/Railway deployment, smoke checks, or external API behavior as complete without current evidence.

## Writing Rules

- Write in Korean for project docs unless the user requests English.
- Separate confirmed current state from planned work.
- Keep issue candidates concrete enough to paste into GitHub Issues.
- Avoid broad refactor or architecture migration proposals unless the weekly goal is explicitly architecture work.
- Prefer one canonical term over parallel names. Use `IntentSpec` rather than introducing a separate design-spec term.
