-- ============================================================================
-- Phase 6+ polish: member profiles — mention handles + avatar uploads
-- ----------------------------------------------------------------------------
-- Adds a per-member `handle` (a unique, lowercase nickname used for @-mentions,
-- distinct from the display name `full_name`) and the storage policies for a
-- new PUBLIC `avatars` bucket (the bucket itself is created manually in the
-- dashboard, like `note-attachments`).
--
-- `profiles_update_self` (init) already lets a user UPDATE their own
-- full_name / handle / avatar_url, so no new table RLS is needed here.
-- ============================================================================

-- handle column + constraints ------------------------------------------------
alter table public.profiles add column if not exists handle text;

-- Unique, case-insensitively (handles are stored lowercase, but be defensive).
create unique index if not exists profiles_handle_key
  on public.profiles (lower(handle));

-- Format: lowercase letters / digits / underscore, 3–20 chars (nullable so a
-- profile can briefly exist without one; the editor + trigger always set it).
alter table public.profiles
  drop constraint if exists profiles_handle_format;
alter table public.profiles
  add constraint profiles_handle_format
  check (handle is null or handle ~ '^[a-z0-9_]{3,20}$');

-- generate_handle(base) ------------------------------------------------------
-- Sanitize an arbitrary base string into a valid, UNIQUE handle. Lowercases,
-- strips to [a-z0-9_], pads short stems, truncates to 20, then appends a
-- numeric suffix until lower(handle) is free. SECURITY DEFINER so the signup
-- trigger (which runs as the auth system) can read profiles to check uniqueness.
create or replace function public.generate_handle(base text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  stem      text;
  candidate text;
  n         int := 0;
begin
  -- lowercase, replace runs of disallowed chars with '_', trim leading/trailing '_'
  stem := lower(coalesce(base, ''));
  stem := regexp_replace(stem, '[^a-z0-9_]+', '_', 'g');
  stem := trim(both '_' from stem);
  if stem = '' then
    stem := 'member';
  end if;
  -- enforce min length 3 (pad) and max length 17 (leave room for a suffix)
  while length(stem) < 3 loop
    stem := stem || '0';
  end loop;
  stem := left(stem, 17);

  candidate := stem;
  loop
    exit when not exists (
      select 1 from public.profiles where lower(handle) = lower(candidate)
    );
    n := n + 1;
    candidate := left(stem, 17) || n::text;
  end loop;
  return candidate;
end;
$$;

-- backfill existing profiles -------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id, full_name, email from public.profiles where handle is null loop
    update public.profiles
       set handle = public.generate_handle(
         coalesce(nullif(r.full_name, ''), split_part(r.email, '@', 1))
       )
     where id = r.id;
  end loop;
end;
$$;

-- signup trigger: also assign a handle on profile creation -------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, handle)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    public.generate_handle(
      coalesce(
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        split_part(new.email, '@', 1)
      )
    )
  )
  on conflict (id) do update set email = excluded.email;

  -- Invite-gated auto-join: flip any pending invite for this email to active.
  -- Works for both password and Google signups (both populate new.email).
  update public.memberships
     set user_id   = new.id,
         status    = 'active',
         joined_at = now()
   where user_id is null
     and status = 'pending'
     and lower(invited_email) = lower(new.email);

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Storage object RLS for the PUBLIC `avatars` bucket.
-- The BUCKET itself is created manually in the Supabase dashboard (public,
-- 5 MB). Public bucket ⇒ reads need no policy; we only gate writes/deletes to
-- workspace members. Path convention: {workspace_id}/avatars/{uuid}.{ext}
-- so (storage.foldername(name))[1] = workspace_id (matches note-attachments).
-- ----------------------------------------------------------------------------
create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  );
create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  );
