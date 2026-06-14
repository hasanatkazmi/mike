# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Mike is a legal document assistant. It is a monorepo with two independently
installed Node packages:

- `frontend/` — Next.js 16 (App Router, React 19) app, deployed to Cloudflare via OpenNext.
- `backend/` — Express API that handles auth verification, document processing, LLM streaming, and storage.

State lives in Supabase (Auth + Postgres) and an S3-compatible bucket
(Cloudflare R2 / MinIO). The frontend talks to Supabase directly for auth and to
the backend for everything else.

## Commands

Install (each package separately — there is no root package manager):

```bash
npm install --prefix backend
npm install --prefix frontend
```

Run locally (two processes):

```bash
npm run dev --prefix backend     # tsx watch, port 3001
npm run dev --prefix frontend    # next dev, port 3000
```

Checks (run the one(s) for the area you changed — there is **no test suite**):

```bash
npm run build --prefix backend   # tsc, the only backend verification
npm run build --prefix frontend  # next build
npm run lint --prefix frontend   # eslint (next core-web-vitals + ts)
```

Backend correctness is enforced only by `tsc` (`strict: true`) — always run the
backend build after backend changes. The frontend has no lint command for `backend/`.

## Architecture

### Request flow

1. Frontend calls the backend exclusively through `frontend/src/app/lib/mikeApi.ts`,
   which attaches the Supabase access token as a `Bearer` header. Add new API
   calls here rather than calling `fetch` from components.
2. Backend routes live in `backend/src/routes/*` and are mounted in
   `backend/src/index.ts`, which also configures Helmet, CORS, and per-route
   rate limiters (chat, upload, export, delete each have their own limiter).
3. `backend/src/middleware/auth.ts` (`requireAuth`) validates the token with the
   Supabase service-role client and sets `res.locals.userId` / `userEmail` /
   `token`. `requireMfaIfEnrolled` and the login-MFA gate enforce AAL2 when a
   user has MFA enabled; a `403` with code `mfa_verification_required` signals
   the frontend to prompt for a TOTP code (`isMfaRequiredError` in `mikeApi.ts`).

### LLM abstraction

All model access goes through `backend/src/lib/llm/`. `index.ts` exposes
`streamChatWithTools` and `completeText`, which dispatch to `claude.ts`,
`gemini.ts`, or `openai.ts` based on `providerForModel()` in `models.ts`
(provider is inferred from the model id prefix: `claude*`, `gemini*`, `gpt-*`).

`models.ts` is the single source of truth for available model ids, organized
into **main** (user-selectable per message), **mid** (tabular review), and
**low** (title generation, light extraction) tiers, with `DEFAULT_*` fallbacks.
Add or change models here.

Provider keys resolve per-request: a key set in `backend/.env` makes that
provider globally available; otherwise the user's own key (stored encrypted via
`lib/userApiKeys.ts`, decrypted with `USER_API_KEYS_ENCRYPTION_SECRET`) is used.
The same pattern applies to the CourtListener token.

### Chat + tools

`backend/src/lib/chatTools.ts` (large, ~4500 lines) is the core: it builds
document context, assembles messages, defines the tool set the model can call,
and runs the streaming loop (`runLLMStream`). Chat responses are streamed to the
frontend as SSE; assistant message content is an array of typed
`AssistantEvent`s (text, tool calls, citations, case-law panels), not a plain
string. Tool results can edit documents and surface citations/quotes.

Document editing uses tracked changes: `lib/docxTrackedChanges.ts` applies
`EditInput`s into DOCX as Word tracked changes. `lib/convert.ts` shells out to
LibreOffice for DOC/DOCX→PDF conversion (LibreOffice must be on PATH; provisioned
via `backend/nixpacks.toml` in deployment). PDF text extraction uses `pdfjs-dist`.

### Legal research (CourtListener)

`backend/src/lib/courtlistener.ts` and `lib/legalSourcesTools/courtlistenerTools.ts`
implement citation verification, case fetching, and opinion search, exposed as
model tools. When `COURTLISTENER_BULK_DATA_ENABLED=true`, lookups try local
Supabase tables (`courtlistener_citation_index`, `courtlistener_opinion_cluster_index`)
and R2-cached opinion JSON before falling back to the live API.

### Frontend structure

- Pages: `frontend/src/app/(pages)/...` (App Router route groups). Main product
  areas are **assistant** (chat), **projects** (document collections),
  **tabular-reviews** (spreadsheet-style document extraction), and **workflows**
  (reusable prompt/column templates).
- Feature components: `frontend/src/app/components/{assistant,projects,tabular,workflows,shared}/`.
- Reusable UI primitives (shadcn-style): `frontend/src/components/ui/`.
- App-wide state: React contexts in `frontend/src/contexts/` (`AuthContext`,
  `UserProfileContext`) and `frontend/src/app/contexts/` (chat history, sidebar, page chrome).
- Import alias `@/*` → `frontend/src/*`.

### Database

`backend/schema.sql` is the full schema for **fresh** databases only — never run
it against an existing/production DB. Incremental changes for existing OSS
deployments go in `backend/oss-migrations/` (timestamp-prefixed). When you change
the schema, update `schema.sql` **and** add a matching migration file.

## Conventions

- TypeScript strict mode everywhere; backend uses CommonJS, `@/*` → `backend/src/*`.
- Errors returned to the frontend use `{ detail: string }` (and optionally `code`).
  Use `lib/safeError.ts` (`safeErrorMessage` / `safeErrorLog`) to avoid leaking
  internals. Dev-only logging uses a guarded `devLog` helper pattern repeated
  across files.
- Keep PRs small and focused (see `CONTRIBUTING.md`). Do not propose
  local-hosting refactors (local LLMs/DB/filesystem) for the main app.
- Never commit `.env` / `.env.local`. Only `NEXT_PUBLIC_`-prefixed vars may reach
  the browser; service-role and provider keys stay in `backend/.env`.
</content>
</invoke>
