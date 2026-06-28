-- Phase B (geo + photos foundation): add opening_hours for day-trip time-feasibility.
-- Note: latitude, longitude, cover_image_url already exist in the places table from the
-- initial schema (20260117114601_*.sql) but were never populated — enrich-place will fill them.
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{}'::jsonb;
