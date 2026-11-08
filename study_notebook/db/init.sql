create extension if not exists vector;

create table notebooks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks on delete cascade,
  filename text not null,
  file_path text not null,
  status text not null default 'pending'
    check (status in ('pending','processing','ready','failed')),
  error text,
  created_at timestamptz default now()
);

create table chunks (
  id bigserial primary key,
  document_id uuid not null references documents on delete cascade,
  notebook_id uuid not null references notebooks on delete cascade,
  content text not null,
  page int,
  embedding vector(384)  -- dimensión del modelo MiniLM multilingüe
);
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);
create index chunks_notebook_idx on chunks (notebook_id);

create table summaries (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

create table question_sets (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks on delete cascade,
  created_at timestamptz default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  question_set_id uuid not null references question_sets on delete cascade,
  type text not null check (type in ('multiple','vf','abierta')),
  question text not null,
  options jsonb,
  answer text not null,
  explanation text,
  page int
);
