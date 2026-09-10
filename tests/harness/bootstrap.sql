-- =============================================================================
-- TEST BOOTSTRAP -- minimal stand-ins for the parts of a Supabase instance that
-- are provided by GoTrue and storage-api rather than by our migrations.
--
-- These mirror the real definitions closely enough that the migrations run
-- unchanged: same schema names, same function signatures, same JWT mechanism
-- (a `request.jwt.claims` GUC read by auth.uid()). Nothing in src/ or
-- supabase/migrations/ knows this file exists.
-- =============================================================================

-- PostgREST connection roles ---------------------------------------------------
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- auth schema (GoTrue) ---------------------------------------------------------
create schema auth;

-- Column set kept compatible with the real GoTrue table for the columns that
-- supabase/seed.sql writes, so one seed file works here and on Supabase.
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  instance_id        uuid,
  aud                text,
  role               text,
  email              text unique not null,
  encrypted_password text,
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,  -- user-supplied, untrusted
  raw_app_meta_data  jsonb not null default '{}'::jsonb,  -- service-role only, trusted
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table auth.identities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider_id     text not null,
  provider        text not null,
  identity_data   jsonb not null default '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, provider_id)
);

-- Supabase pre-installs pgcrypto into the `extensions` schema. PGlite does not
-- ship it, so the seed's password hashing is stubbed here. Tests never log in
-- with a password -- they set JWT claims directly, exactly like PostgREST.
create schema extensions;

create or replace function extensions.gen_salt(p_type text)
returns text language sql immutable as $$ select 'test-salt-' || p_type; $$;

create or replace function extensions.crypt(p_password text, p_salt text)
returns text language sql immutable as $$ select 'stub$' || p_salt || '$' || md5(p_password); $$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'role';
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt()
  to anon, authenticated, service_role;

-- storage schema (storage-api) -------------------------------------------------
create schema storage;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant all on storage.objects, storage.buckets to service_role;
