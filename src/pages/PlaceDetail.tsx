import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Star, MapPin, Wifi, Zap, Volume2, Clock, Navigation, Heart, Loader2,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlaceMap } from '@/components/places/PlaceMap';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useGeolocation } from '@/hooks/useGeolocation';
import { getOpenStatus } from '@/lib/openingHours';
import { haversineKm, formatDistance, directionsUrl } from '@/lib/geo';
import { scrapegraphApi } from '@/lib/api/scrapegraph';
import { Place, VIBE_INFO, NOISE_LABELS, PRICE_LABELS } from '@/lib/types';

export default function PlaceDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { coords, request } = useGeolocation();

  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const photoTried = useRef(false);

  const fetchPlace = useCallback(async () => {
    if (!slug) return;
    const { data } = await supabase.from('places').select('*').eq('slug', slug).maybeSingle();
    setPlace((data as Place) ?? null);
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchPlace(); }, [fetchPlace]);
  useEffect(() => { request(); }, [request]); // ask for location for the distance feature

  // Load favorite state
  useEffect(() => {
    if (user && place) {
      supabase.from('favorites').select('id').eq('user_id', user.id).eq('place_id', place.id).maybeSingle()
        .then(({ data }) => setIsFavorite(!!data));
    }
  }, [user, place]);

  // Lazy photo: only when a user actually opens a place with no image (credit-safe, one-time).
  useEffect(() => {
    if (place && !place.cover_image_url && !photoTried.current) {
      photoTried.current = true;
      setLoadingPhoto(true);
      scrapegraphApi.enrichPlaces({ placeIds: [place.id] })
        .then(() => fetchPlace())
        .finally(() => setLoadingPhoto(false));
    }
  }, [place, fetchPlace]);

  const toggleFavorite = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!place) return;
    if (isFavorite) {
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('place_id', place.id);
      setIsFavorite(false);
      toast({ title: 'Removed from favorites' });
    } else {
      await supabase.from('favorites').insert({ user_id: user.id, place_id: place.id });
      setIsFavorite(true);
      toast({ title: 'Added to favorites' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-32 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  if (!place) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-32 text-center text-muted-foreground">
          <p>Place not found.</p>
          <Button variant="link" onClick={() => navigate('/explore')}>Back to Explore</Button>
        </div>
      </div>
    );
  }

  const vibeInfo = place.primary_vibe ? VIBE_INFO[place.primary_vibe] : null;
  const openStatus = getOpenStatus(place.opening_hours);
  const distanceKm = coords && place.latitude != null && place.longitude != null
    ? haversineKm(coords.lat, coords.lng, place.latitude, place.longitude) : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {/* Hero image */}
          <div className="relative h-64 rounded-2xl overflow-hidden bg-muted mb-6">
            {place.cover_image_url ? (
              <img src={place.cover_image_url} alt={place.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10 text-muted-foreground">
                {loadingPhoto ? (
                  <><Loader2 className="w-8 h-8 animate-spin mb-2" /><span className="text-sm">Finding a real photo…</span></>
                ) : (
                  <MapPin className="w-12 h-12 opacity-40" />
                )}
              </div>
            )}
          </div>

          {/* Title + live status */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="font-display text-3xl font-bold">{place.name}</h1>
              <p className="text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="w-4 h-4" /> {place.address}
                {place.locality ? ` · ${place.locality}` : ''}
              </p>
            </div>
            {place.average_rating > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                <span className="font-semibold text-lg">{place.average_rating.toFixed(1)}</span>
              </div>
            )}
          </div>

          {/* Live-context badges — the verified, real-time layer GPT can't show */}
          <div className="flex flex-wrap gap-2 mb-6">
            {openStatus.state !== 'unknown' && (
              <Badge className={openStatus.state === 'open' ? 'bg-green-600 hover:bg-green-600' : 'bg-gray-600 hover:bg-gray-600'}>
                <Clock className="w-3 h-3 mr-1" />
                {openStatus.state === 'open'
                  ? (openStatus.closesAt ? `Open now · till ${openStatus.closesAt}` : openStatus.text)
                  : 'Closed now'}
              </Badge>
            )}
            {distanceKm != null && (
              <Badge variant="secondary"><Navigation className="w-3 h-3 mr-1" />{formatDistance(distanceKm)} from you</Badge>
            )}
            {vibeInfo && <Badge variant="secondary">{vibeInfo.emoji} {vibeInfo.label}</Badge>}
            <Badge variant="outline"><Volume2 className="w-3 h-3 mr-1" />{NOISE_LABELS[place.noise_level]}</Badge>
            {place.has_wifi && <Badge variant="outline"><Wifi className="w-3 h-3 mr-1" />WiFi</Badge>}
            {place.has_power_outlets && <Badge variant="outline"><Zap className="w-3 h-3 mr-1" />Power</Badge>}
            <Badge variant="outline">{PRICE_LABELS[place.price_range]}</Badge>
          </div>

          {/* Actions — a tool that DOES things */}
          <div className="flex flex-wrap gap-3 mb-8">
            <Button asChild>
              <a href={directionsUrl(place.latitude, place.longitude, place.name)} target="_blank" rel="noopener noreferrer">
                <Navigation className="w-4 h-4 mr-2" /> Directions
              </a>
            </Button>
            <Button variant={isFavorite ? 'default' : 'outline'} onClick={toggleFavorite}>
              <Heart className={`w-4 h-4 mr-2 ${isFavorite ? 'fill-current' : ''}`} />
              {isFavorite ? 'Saved' : 'Save'}
            </Button>
          </div>

          {/* Description */}
          {place.description && <p className="text-foreground mb-8 leading-relaxed">{place.description}</p>}

          {/* Map */}
          {place.latitude != null && place.longitude != null && (
            <div className="rounded-2xl overflow-hidden border h-72 mb-8">
              <PlaceMap latitude={Number(place.latitude)} longitude={Number(place.longitude)} name={place.name} className="h-full w-full" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
