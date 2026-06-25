import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface TasteProfile {
  vibeWeights: Record<string, number>;
  areaWeights: Record<string, number>;
  topVibes: string[];
  topAreas: string[];
  hasData: boolean;
}

const EMPTY: TasteProfile = { vibeWeights: {}, areaWeights: {}, topVibes: [], topAreas: [], hasData: false };

/**
 * Builds a lightweight "taste profile" for the signed-in user by blending three signals:
 *  - explicit preferences (profiles.preferred_vibes/areas)  — strongest
 *  - favorites (vibes/areas of saved places)                — strong implicit
 *  - recent search filters (search_history)                 — weak implicit
 * Used to personalize ranking and the concierge. GPT can't do this — it doesn't know the user.
 */
export function useTasteProfile(): TasteProfile {
  const { user } = useAuth();
  const [profile, setProfile] = useState<TasteProfile>(EMPTY);

  useEffect(() => {
    if (!user) { setProfile(EMPTY); return; }
    let cancelled = false;

    (async () => {
      const vibeWeights: Record<string, number> = {};
      const areaWeights: Record<string, number> = {};
      const bump = (map: Record<string, number>, key: string | null | undefined, w: number) => {
        if (key) map[key] = (map[key] || 0) + w;
      };

      const [{ data: prof }, { data: favs }, { data: hist }] = await Promise.all([
        supabase.from('profiles').select('preferred_vibes, preferred_areas').eq('user_id', user.id).maybeSingle(),
        supabase.from('favorites').select('places(primary_vibe, area)').eq('user_id', user.id).limit(50),
        supabase.from('search_history').select('filters').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      ]);

      (prof?.preferred_vibes || []).forEach((v: string) => bump(vibeWeights, v, 1.0));
      (prof?.preferred_areas || []).forEach((a: string) => bump(areaWeights, a, 1.0));
      (favs || []).forEach((f: any) => { bump(vibeWeights, f.places?.primary_vibe, 0.6); bump(areaWeights, f.places?.area, 0.6); });
      (hist || []).forEach((h: any) => { bump(vibeWeights, h.filters?.vibe, 0.3); bump(areaWeights, h.filters?.area, 0.3); });

      const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 3);
      const hasData = Object.keys(vibeWeights).length > 0 || Object.keys(areaWeights).length > 0;
      if (!cancelled) setProfile({ vibeWeights, areaWeights, topVibes: top(vibeWeights), topAreas: top(areaWeights), hasData });
    })();

    return () => { cancelled = true; };
  }, [user]);

  return profile;
}
