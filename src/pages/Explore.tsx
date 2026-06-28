import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MapPin, Sparkles, AlertCircle, Globe, Loader2, Navigation, Clock, Map as MapIcon, List } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { VibeSearch } from '@/components/search/VibeSearch';
import { PlaceCard } from '@/components/places/PlaceCard';
import { PlaceCardSkeleton } from '@/components/places/PlaceCardSkeleton';
import { ResultsMap } from '@/components/places/ResultsMap';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { scrapegraphApi } from '@/lib/api/scrapegraph';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useTasteProfile } from '@/hooks/useTasteProfile';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getOpenStatus } from '@/lib/openingHours';
import { haversineKm } from '@/lib/geo';
import { fetchWeather, timeOfDay, Weather } from '@/lib/weather';
import { VibeCategory, Area, Place, PriceRange } from '@/lib/types';

const PRICE_ORDER: Record<PriceRange, number> = { budget: 1, moderate: 2, premium: 3, luxury: 4 };

interface SearchResult {
  place: Place;
  similarity: number;
  explanation: string;
}

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { coords, request: requestLocation } = useGeolocation();
  const taste = useTasteProfile();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWebSearching, setIsWebSearching] = useState(false);

  // Geo-spatial + context controls
  const [sortMode, setSortMode] = useState<'relevance' | 'nearest'>('relevance');
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [weather, setWeather] = useState<Weather | null>(null);
  const [maxPrice, setMaxPrice] = useState<PriceRange | undefined>();

  const query = searchParams.get('q') || '';
  const vibe = searchParams.get('vibe') as VibeCategory | undefined;
  const area = searchParams.get('area') as Area | undefined;
  const budget = searchParams.get('budget') as PriceRange | undefined;

  // Load user's favorites if logged in
  useEffect(() => {
    if (user) {
      supabase
        .from('favorites')
        .select('place_id')
        .eq('user_id', user.id)
        .then(({ data }) => {
          if (data) {
            setFavorites(new Set(data.map(f => f.place_id)));
          }
        });
    }
  }, [user]);

  const performSearch = useCallback(async (searchQuery: string, filters: { vibe?: VibeCategory; area?: Area; maxPrice?: PriceRange }) => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    setMaxPrice(filters.maxPrice);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('vibe-search', {
        body: {
          query: searchQuery,
          ...(filters.vibe && { vibe: filters.vibe }),
          ...(filters.area && { area: filters.area }),
          ...(filters.maxPrice && { maxPrice: filters.maxPrice }),
          limit: 12,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Search failed');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setResults(data.results || []);
      setSummary(data.summary || '');

      // Log the search for personalization (implicit signal). Fire-and-forget.
      if (user) {
        supabase.from('search_history').insert({
          user_id: user.id,
          query: searchQuery,
          filters: { ...(filters.vibe && { vibe: filters.vibe }), ...(filters.area && { area: filters.area }) },
          results_count: data.results?.length || 0,
        }).then(() => {});
      }
    } catch (err) {
      console.error('Search error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setResults([]);
      setSummary('');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Ask for location once so result cards can show real distance ("X km from you").
  useEffect(() => { requestLocation(); }, [requestLocation]);

  // Live weather context (free, no key) once we know where the user is.
  useEffect(() => {
    if (coords) fetchWeather(coords.lat, coords.lng).then(setWeather);
  }, [coords]);

  // Apply open-now filter, weather-aware context boost, and distance/relevance sort.
  const displayedResults = useMemo(() => {
    let list = results.slice();
    if (openNowOnly) {
      list = list.filter(r => getOpenStatus(r.place.opening_hours).state === 'open');
    }
    if (maxPrice) {
      list = list.filter(r => PRICE_ORDER[r.place.price_range] <= PRICE_ORDER[maxPrice]);
    }
    const contextBoost = (p: Place): number => {
      if (!weather) return 0;
      const indoor = ['work_study', 'food_experience', 'shopping', 'arts_culture', 'nightlife'].includes(p.primary_vibe || '');
      const outdoor = p.primary_vibe === 'outdoor_adventure';
      if (weather.isRaining) return indoor ? 0.15 : outdoor ? -0.25 : 0;
      if (weather.isPleasant && outdoor) return 0.15;
      return 0;
    };
    const distOf = (p: Place) =>
      coords && p.latitude != null && p.longitude != null
        ? haversineKm(coords.lat, coords.lng, p.latitude, p.longitude) : Infinity;

    // Personalization: boost places matching the user's learned taste (vibes/areas).
    const tasteBoost = (p: Place): number =>
      (taste.vibeWeights[p.primary_vibe || ''] || 0) * 0.2 + (taste.areaWeights[p.area] || 0) * 0.12;

    if (sortMode === 'nearest' && coords) {
      list.sort((a, b) => distOf(a.place) - distOf(b.place));
    } else {
      list.sort((a, b) =>
        (b.similarity + contextBoost(b.place) + tasteBoost(b.place)) -
        (a.similarity + contextBoost(a.place) + tasteBoost(a.place)));
    }
    return list;
  }, [results, openNowOnly, maxPrice, sortMode, coords, weather, taste]);

  // Search on initial load if query params exist
  useEffect(() => {
    if (query) {
      performSearch(query, { vibe, area, maxPrice: budget });
    }
  }, []); // Only on mount

  const handleSearch = (newQuery: string, filters: { vibe?: VibeCategory; area?: Area; maxPrice?: PriceRange }) => {
    const params = new URLSearchParams({ q: newQuery });
    if (filters.vibe) params.set('vibe', filters.vibe);
    if (filters.area) params.set('area', filters.area);
    if (filters.maxPrice) params.set('budget', filters.maxPrice);
    setSearchParams(params);
    performSearch(newQuery, filters);
  };

  // Opt-in live web search for long-tail queries the DB doesn't cover (costs ScrapeGraph credits).
  const handleWebSearch = async () => {
    if (!query.trim()) return;
    setIsWebSearching(true);
    try {
      const res = await scrapegraphApi.webSearch({ query, ...(area && { area }) });
      if (res.success && res.results && res.results.length > 0) {
        setResults(prev => {
          const existing = new Set(prev.map(r => r.place.id));
          const fresh = (res.results as SearchResult[]).filter(r => !existing.has(r.place.id));
          return [...prev, ...fresh];
        });
        toast({ title: res.summary || `Found ${res.results.length} more place(s) from the web.` });
      } else {
        toast({ title: res.summary || 'No additional places found on the web for this search.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Web search failed', description: 'Please try again.' });
    } finally {
      setIsWebSearching(false);
    }
  };

  // Reusable "search the wider web" opt-in prompt.
  const webSearchPrompt = query && !isLoading ? (
    <div className="max-w-2xl mx-auto mt-10 text-center border-t pt-8">
      <p className="text-sm text-muted-foreground mb-3">
        Not finding what you're looking for? Search beyond our local database — across the wider web.
      </p>
      <Button variant="outline" onClick={handleWebSearch} disabled={isWebSearching}>
        {isWebSearching ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching the web... (this can take a moment)</>
        ) : (
          <><Globe className="w-4 h-4 mr-2" /> Search the wider web</>
        )}
      </Button>
    </div>
  ) : null;

  const handleFavorite = async (placeId: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save favorites",
        variant: "default",
      });
      navigate('/auth');
      return;
    }

    const isFavorite = favorites.has(placeId);

    if (isFavorite) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('place_id', placeId);

      if (!error) {
        setFavorites(prev => {
          const next = new Set(prev);
          next.delete(placeId);
          return next;
        });
        toast({ title: "Removed from favorites" });
      }
    } else {
      const { error } = await supabase
        .from('favorites')
        .insert({ user_id: user.id, place_id: placeId });

      if (!error) {
        setFavorites(prev => new Set(prev).add(placeId));
        toast({ title: "Added to favorites" });
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Search */}
          <div className="mb-12">
            <VibeSearch onSearch={handleSearch} isLoading={isLoading} />
          </div>

          {/* Error State */}
          {error && (
            <Alert variant="destructive" className="mb-8 max-w-2xl mx-auto">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading State - Skeleton Cards */}
          {isLoading && (
            <div className="space-y-8">
              <div className="max-w-3xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent mb-4">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  <span className="text-sm font-medium">Finding your perfect vibe...</span>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <PlaceCardSkeleton key={idx} />
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {!isLoading && results.length > 0 && (
            <div className="space-y-6">
              {/* AI Summary */}
              {summary && (
                <div className="max-w-3xl mx-auto text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent mb-4">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-sm font-medium">AI Recommendation</span>
                  </div>
                  <p className="text-lg text-foreground">{summary}</p>
                </div>
              )}

              {/* Personalization indicator */}
              {taste.hasData && sortMode === 'relevance' && (
                <div className="max-w-3xl mx-auto text-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    <Sparkles className="w-3 h-3" /> Personalized for your taste
                  </span>
                </div>
              )}

              {/* Live context banner (weather + time) — GPT can't know this */}
              {weather && (
                <div className="max-w-3xl mx-auto text-center text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted">
                    {weather.emoji} {weather.label}, {Math.round(weather.tempC)}°C · {timeOfDay()}
                    {weather.isRaining ? ' — surfacing cozy indoor spots first'
                      : weather.isPleasant ? ' — great weather for outdoor spots' : ''}
                  </span>
                </div>
              )}

              {/* Geo-spatial control bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={sortMode === 'relevance' ? 'default' : 'outline'} onClick={() => setSortMode('relevance')}>
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Best match
                  </Button>
                  <Button size="sm" variant={sortMode === 'nearest' ? 'default' : 'outline'} onClick={() => setSortMode('nearest')} disabled={!coords}>
                    <Navigation className="w-3.5 h-3.5 mr-1.5" /> Nearest
                  </Button>
                  <Button size="sm" variant={openNowOnly ? 'default' : 'outline'} onClick={() => setOpenNowOnly(v => !v)}>
                    <Clock className="w-3.5 h-3.5 mr-1.5" /> Open now
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant={viewMode === 'list' ? 'default' : 'outline'} onClick={() => setViewMode('list')}>
                    <List className="w-3.5 h-3.5 mr-1.5" /> List
                  </Button>
                  <Button size="sm" variant={viewMode === 'map' ? 'default' : 'outline'} onClick={() => setViewMode('map')}>
                    <MapIcon className="w-3.5 h-3.5 mr-1.5" /> Map
                  </Button>
                </div>
              </div>

              {displayedResults.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No places match these filters. Try turning off "Open now".</p>
              ) : viewMode === 'map' ? (
                <div className="rounded-2xl overflow-hidden border">
                  <ResultsMap places={displayedResults.map(r => r.place)} userLocation={coords} />
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {displayedResults.map((result, idx) => (
                    <div key={result.place.id} style={{ animationDelay: `${idx * 0.05}s` }}>
                      <PlaceCard
                        place={result.place}
                        similarity={result.similarity}
                        explanation={result.explanation}
                        onFavorite={handleFavorite}
                        isFavorite={favorites.has(result.place.id)}
                        userLocation={coords}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Opt-in wider web search */}
              {webSearchPrompt}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && results.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              <MapPin className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">Search for places to see AI-powered recommendations</p>
              <p className="text-sm mt-2">Try "Quiet cafe for working" or "Romantic dinner in Koregaon Park"</p>
              {webSearchPrompt}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
