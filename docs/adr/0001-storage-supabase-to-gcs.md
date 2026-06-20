# ADR 0001 — File storage: Supabase Storage now, GCS swap path

- **Status:** Accepted
- **Date:** 2026-06-20
- **Phase:** 1 (Foundation)

## Context

Kore must run on **$0/month** (free tiers only) and stores user files (note images, chat
attachments, etc.). Two free options:

- **Supabase Storage** — 1 GB free, already part of our Supabase project, S3-compatible,
  integrates with the same Auth + RLS we already use.
- **Google Cloud Storage (GCS)** — 5 GB always-free (Standard, us-regions), but a
  separate account, IAM, and signing setup.

The 1 GB Supabase cap is plenty for text-heavy work but could be hit if the team uploads
many images. We do **not** want a storage choice that forces a rebuild later. (The
Google **Drive** API is explicitly rejected — it's not object storage for an app.)

## Decision

Use **Supabase Storage for Phase 1+**, and make the backend swappable by referencing
every file as a **URL stored in Postgres** rather than coupling the app to a storage SDK.

- Files are recorded in an `attachments` table (later phase) as `url` + `target_type` +
  `target_id`. The app reads/renders `url`; it never hard-codes a Supabase bucket path.
- All upload/download goes through a single helper module (e.g. `lib/storage.ts`,
  introduced when the first upload feature lands) exposing `uploadFile()` →
  `{ url }` and `getSignedUrl()`. Components depend on that interface, not on Supabase.

## Consequences

- **Swapping to GCS** = reimplement the one `lib/storage.ts` helper against GCS (signed
  URLs / resumable uploads) and point new uploads at the GCS bucket. Existing rows keep
  their Supabase URLs and keep working; no data model change, no component changes.
- Public vs. private files: prefer **signed URLs** generated server-side so access stays
  governed by our membership checks regardless of backend.
- Trigger to switch: approaching the 1 GB Supabase cap, or needing the 5 GB GCS free tier.
- Cost stays **$0** in both states (Supabase 1 GB free → GCS 5 GB always-free).

## Alternatives considered

- **GCS from day one** — more setup now for storage we don't yet need; deferred behind
  the URL-indirection so the switch stays cheap.
- **Google Drive API** — rejected: it's user-drive file management, not app object
  storage; awkward auth, quotas, and sharing semantics.
