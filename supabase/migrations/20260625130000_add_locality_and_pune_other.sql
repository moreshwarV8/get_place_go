-- Phase C (long-tail coverage): support places in ANY Pune locality, not just the 13 curated areas.
-- 'pune_other' is a catch-all area for places discovered via web search; 'locality' holds the
-- precise neighborhood text (e.g. "Ravet") since the area enum can't enumerate every locality.
ALTER TYPE public.area ADD VALUE IF NOT EXISTS 'pune_other';

ALTER TABLE public.places ADD COLUMN IF NOT EXISTS locality TEXT;
