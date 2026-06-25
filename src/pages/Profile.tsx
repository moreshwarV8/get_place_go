import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Check, Sparkles } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { VIBE_INFO, AREA_INFO, VibeCategory, Area } from '@/lib/types';

const ALL_VIBES = Object.keys(VIBE_INFO) as VibeCategory[];
const ALL_AREAS = (Object.keys(AREA_INFO) as Area[]).filter((a) => a !== 'pune_all');

export default function Profile() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [vibes, setVibes] = useState<VibeCategory[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('preferred_vibes, preferred_areas').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        setVibes((data?.preferred_vibes as VibeCategory[]) || []);
        setAreas((data?.preferred_areas as Area[]) || []);
        setLoadingData(false);
      });
  }, [user]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const toggle = <T,>(list: T[], setList: (v: T[]) => void, val: T) =>
    setList(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles')
      .update({ preferred_vibes: vibes, preferred_areas: areas })
      .eq('user_id', user.id);
    setSaving(false);
    toast(error
      ? { variant: 'destructive', title: 'Could not save', description: error.message }
      : { title: 'Preferences saved', description: 'Your recommendations will now reflect your taste.' });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-2xl space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold">Your Preferences</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" /> We use these to personalize your search & concierge.
            </p>
          </div>

          {loadingData ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Favorite vibes</CardTitle>
                  <CardDescription>What kinds of places are you usually after?</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {ALL_VIBES.map((v) => (
                    <button key={v} onClick={() => toggle(vibes, setVibes, v)}
                      className={`px-3 py-2 rounded-full text-sm border transition-colors ${
                        vibes.includes(v) ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-primary'
                      }`}>
                      {VIBE_INFO[v].emoji} {VIBE_INFO[v].label}
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Preferred areas</CardTitle>
                  <CardDescription>Which parts of Pune do you frequent?</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {ALL_AREAS.map((a) => (
                    <button key={a} onClick={() => toggle(areas, setAreas, a)}
                      className={`px-3 py-2 rounded-full text-sm border transition-colors ${
                        areas.includes(a) ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-primary'
                      }`}>
                      {AREA_INFO[a].label}
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Button onClick={save} disabled={saving} className="w-full">
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : <><Check className="w-4 h-4 mr-2" /> Save Preferences</>}
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
