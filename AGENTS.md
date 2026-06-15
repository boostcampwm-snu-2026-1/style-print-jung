# AGENTS.md

## Project Context

- Architecture: `apps/web` is the Vite React frontend, `apps/api` is the Fastify backend, and `packages/shared` contains shared TypeScript types.
- Run locally with `npm run dev`. Web uses `http://localhost:5173`; API uses `http://localhost:4000`.
- Verify changes with `npm run typecheck` and `npm run build`.
- Keep API routes compatible with the existing `/api/...` paths because the web app proxies those paths to Fastify.
- Local runtime data lives in `data/*.json` and uploaded files live in `public/uploads`; do not treat them as source fixtures unless explicitly asked.
- Prefer updating shared contracts in `packages/shared/src/types.ts` before duplicating frontend/backend types.

## Development Workflow

- Manage branches in this order: `main` -> `dev` -> `feature/*`.
- Keep `main` as the stable branch and merge development work through `dev`.
- Create feature branches from `dev`, using names like `feature/reference-metadata` or `feature/recipe-builder`.
- Manage development tasks as GitHub Issues before implementation.
- Manage planning documents, weekly deliverables, and workflow notes in GitHub Wiki.
- Open pull requests per feature from `feature/*` to `dev`.
- Do not merge feature work directly into `main` unless the team explicitly decides to release or stabilize.
- Include related issue numbers in PR descriptions when possible.

## Agent Work Rules

- Before coding, identify the target issue or task and state the success criteria.
- Keep changes scoped to the task; avoid unrelated refactors.
- If a task changes API contracts, update `packages/shared/src/types.ts` first.
- After implementation, run `npm run typecheck`; run `npm run build` for broader frontend/backend changes.
- If documentation or workflow changes are made, keep README and wiki drafts consistent.
