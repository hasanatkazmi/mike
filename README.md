# Mike

Mike is a legal document assistant for the Pakistani legal market, with a Next.js frontend, an Express backend, Supabase Auth/Postgres, and Cloudflare R2-compatible object storage. It helps lawyers analyse documents, answer questions on Pakistani law, and draft legal documents, with research over a corpus of Pakistani statutes and case law and support for Urdu (OCR and right-to-left drafting).

Website: [mikeoss.com](https://mikeoss.com)

## Contents

- `frontend/` - Next.js application
- `backend/` - Express API, Supabase access, document processing, and database schema
- `backend/schema.sql` - Supabase schema for fresh databases
- `backend/oss-migrations/` - OSS-specific migrations that should be applied to existing open-source deployments

## Prerequisites

- Node.js 20 or newer
- npm
- git
- A Supabase project
- A Cloudflare R2 bucket, MinIO bucket, or another S3-compatible bucket
- At least one supported model provider API key: Anthropic, Google Gemini, or OpenAI
- A Google Gemini or OpenAI key is also required for embeddings (Pakistani legal research) and for OCR of scanned/Urdu judgments
- LibreOffice installed locally if you need DOC/DOCX to PDF conversion

## Database Setup

For a new Supabase database, open the Supabase SQL editor and run:

```sql
-- copy and run the contents of:
-- backend/schema.sql
```

The schema file is for fresh deployments and already includes the latest database shape.

For an existing database, do not run the full schema file over production data. Apply the relevant incremental files in `backend/oss-migrations/` instead; these capture schema changes for open-source deployments.

## Environment

Create local env files:

```bash
touch backend/.env
touch frontend/.env.local
```

Create `backend/.env`:

```bash
PORT=3001
FRONTEND_URL=http://localhost:3000
DOWNLOAD_SIGNING_SECRET=replace-with-a-random-32-byte-hex-string
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-service-role-key

R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=mike

GEMINI_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
RESEND_API_KEY=your-resend-key
USER_API_KEYS_ENCRYPTION_SECRET=your-long-random-secret
```

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

Supabase values come from the project dashboard. Use the project URL for `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, the service role key for the backend `SUPABASE_SECRET_KEY`, and the anon/public key for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`. If your Supabase project shows multiple key formats, use the legacy JWT-style anon and service role keys expected by the Supabase client libraries.

Provider keys are only needed for the models, legal research, and email features you plan to use. Model provider keys can be configured in `backend/.env` for the whole instance, or per user in **Account > Models & API Keys**. If a provider key is present in `backend/.env`, that provider is available by default and the matching browser API key field is read-only. A Gemini or OpenAI key is required for Pakistani legal research (embeddings) and OCR.

## Pakistani Legal Research

Mike researches Pakistani law over a corpus of statutes and case law stored in Supabase (pgvector). The assistant has tools to search statutes and case law, fetch and read judgments, search within a case, and verify reporter citations (PLD, SCMR, CLC, YLR, MLD, PLC, PTD, PCrLJ, etc.).

Retrieval is semantic, so an embedding provider key (`GEMINI_API_KEY` or `OPENAI_API_KEY`) is required to embed corpus text and queries. Citation verification is exact: a citation that is not in the corpus is reported as unverified rather than assumed to exist.

Fresh databases created from `backend/schema.sql` already include the corpus tables (`pk_statutes`, `pk_statute_sections`, `pk_cases`, `pk_case_citations`, `pk_case_chunks`) and the `pk_match_*` similarity functions. Existing deployments should apply `backend/oss-migrations/20260619_pakistan_legal_corpus.sql`.

### Building the corpus

The corpus starts empty. Populate it with the ingestion scripts (run in an environment with outbound access to the source sites, and respect each site's terms of use and robots.txt):

```bash
# Statutes from pakistancode.gov.pk
tsx src/scripts/ingestStatutes.ts --list "<pakistancode listing URL>" --limit 50

# Judgments from a JSON manifest of { url|text, case_name, court, citations, ... }
tsx src/scripts/ingestCaseLaw.ts --manifest judgments.json
```

Scanned and Urdu-language judgment PDFs are transcribed with OCR (via Gemini multimodal) during ingestion; the judgment language (`en`/`ur`) is recorded. Drafted documents containing Urdu are rendered right-to-left in a Nastaliq font.

## Install

Install each app package:

```bash
npm install --prefix backend
npm install --prefix frontend
```

## Run Locally

Start the backend:

```bash
npm run dev --prefix backend
```

Start the main app:

```bash
npm run dev --prefix frontend
```

Open `http://localhost:3000`.

## First Run

1. Sign up in the app.
2. If you did not set provider keys in `backend/.env`, open **Account > Models & API Keys** and add an Anthropic, Gemini, or OpenAI API key.
3. To use legal research tools, ensure a Gemini or OpenAI key is configured (for embeddings) and populate the corpus with the ingestion scripts (see Pakistani Legal Research).
4. Create or open a project and start chatting with documents.

## Troubleshooting

**Sign-up confirmation email never arrives.** Confirmation emails are sent by Supabase Auth, not by Mike. For local development, the simplest fix is to disable email confirmation in **Supabase > Authentication > Providers > Email**. For production, configure custom SMTP in Supabase; the built-in mailer is heavily rate-limited and may be restricted on newer projects.

**The model picker shows a missing-key warning.** Add a key for that provider in **Account > Models & API Keys**, or configure the provider key in `backend/.env` and restart the backend.

**Legal research returns no results.** The corpus starts empty — run the ingestion scripts (see Pakistani Legal Research) and confirm a Gemini or OpenAI key is configured for embeddings. Citation verification reports citations that are not in the corpus as unverified by design.

**DOC or DOCX conversion fails.** Install LibreOffice locally and restart the backend so document conversion commands are available on the process path.

## Useful Checks

```bash
npm run build --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
```
