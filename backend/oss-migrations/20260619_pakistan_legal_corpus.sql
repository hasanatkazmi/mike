-- Pakistan legal corpus: statutes and case law for the Pakistani jurisdiction.
--
-- This adds the data layer for full Pakistani legal research:
--   * pk_statutes / pk_statute_sections  - consolidated federal & provincial
--     legislation (e.g. imported from pakistancode.gov.pk).
--   * pk_cases / pk_case_citations / pk_case_chunks - reported and unreported
--     judgments from the Supreme Court, High Courts, Federal Shariat Court and
--     tribunals, with reporter-citation lookup and chunked, embedded opinion
--     text for retrieval-augmented research.
--
-- Retrieval uses pgvector. The embedding dimension (1536) matches the default
-- configured in backend/src/lib/legalSourcesTools/pakistanEmbeddings.ts. If you
-- change the embedding model/dimension, update both places and re-embed.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Statutes (legislation)
-- ---------------------------------------------------------------------------

create table if not exists public.pk_statutes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  short_title text,
  act_number text,
  year integer,
  -- federal | punjab | sindh | kpk | balochistan | ict | gb | ajk
  jurisdiction text not null default 'federal',
  category text,
  source_url text,
  enacted_on date,
  -- in_force | repealed | amended
  status text not null default 'in_force',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pk_statutes_jurisdiction
  on public.pk_statutes(jurisdiction);

create index if not exists idx_pk_statutes_year
  on public.pk_statutes(year);

create table if not exists public.pk_statute_sections (
  id uuid primary key default gen_random_uuid(),
  statute_id uuid not null references public.pk_statutes(id) on delete cascade,
  -- Section/article reference as printed, e.g. "3", "302", "9(1)", "Art. 199".
  section_number text,
  heading text,
  chapter text,
  text text not null,
  -- Order of this section within the statute.
  ordinal integer not null default 0,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists idx_pk_statute_sections_statute
  on public.pk_statute_sections(statute_id, ordinal);

-- Approximate-nearest-neighbour index for semantic statute search.
create index if not exists idx_pk_statute_sections_embedding
  on public.pk_statute_sections
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Case law (judgments)
-- ---------------------------------------------------------------------------

create table if not exists public.pk_cases (
  id uuid primary key default gen_random_uuid(),
  case_name text not null,
  -- SC | LHC | SHC | PHC | BHC | IHC | FSC | banking | atc | itat | service | ...
  court text not null,
  bench text,
  judges text[] not null default '{}',
  date_decided date,
  -- e.g. "Civil Appeal No. 123 of 2019"
  case_number text,
  source_url text,
  -- R2 object key for the original judgment PDF.
  pdf_storage_key text,
  -- en | ur  (language of the judgment text)
  language text not null default 'en',
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pk_cases_court
  on public.pk_cases(court);

create index if not exists idx_pk_cases_date
  on public.pk_cases(date_decided);

-- Reporter citations such as "PLD 2019 SC 318" or "2020 SCMR 456". A single
-- judgment may be reported in several reporters, so this is one-to-many.
create table if not exists public.pk_case_citations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.pk_cases(id) on delete cascade,
  -- PLD | SCMR | CLC | YLR | MLD | PLC | PTD | PCrLJ | GBLR | ...
  reporter text not null,
  year integer,
  -- Court/volume marker as it appears in the citation, e.g. "SC", "Lahore".
  court_or_volume text,
  page integer,
  -- Full citation string as printed.
  raw text not null,
  -- Canonical lookup key (uppercased, single-spaced) for exact verification.
  normalized text not null,
  created_at timestamptz not null default now(),
  unique(normalized)
);

create index if not exists idx_pk_case_citations_case
  on public.pk_case_citations(case_id);

create index if not exists idx_pk_case_citations_reporter
  on public.pk_case_citations(reporter, year);

-- Chunked judgment text for retrieval-augmented research.
create table if not exists public.pk_case_chunks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.pk_cases(id) on delete cascade,
  chunk_index integer not null,
  text text not null,
  -- Source page in the judgment PDF, when known.
  page integer,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists idx_pk_case_chunks_case
  on public.pk_case_chunks(case_id, chunk_index);

create index if not exists idx_pk_case_chunks_embedding
  on public.pk_case_chunks
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Privileges: corpus tables are backend-owned (service role only).
-- ---------------------------------------------------------------------------

alter table public.pk_statutes enable row level security;
alter table public.pk_statute_sections enable row level security;
alter table public.pk_cases enable row level security;
alter table public.pk_case_citations enable row level security;
alter table public.pk_case_chunks enable row level security;

revoke all on public.pk_statutes from anon, authenticated;
revoke all on public.pk_statute_sections from anon, authenticated;
revoke all on public.pk_cases from anon, authenticated;
revoke all on public.pk_case_citations from anon, authenticated;
revoke all on public.pk_case_chunks from anon, authenticated;
