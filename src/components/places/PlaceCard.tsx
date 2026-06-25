import { Heart, Star, MapPin, Wifi, Zap, Volume2, Clock, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Place, VIBE_INFO, NOISE_LABELS, PRICE_LABELS } from '@/lib/types';
import { getOpenStatus } from '@/lib/openingHours';
import { haversineKm, formatDistance } from '@/lib/geo';

interface PlaceCardProps {
  place: Place;
  explanation?: string;
  similarity?: number;
  onFavorite?: (placeId: string) => void;
  isFavorite?: boolean;
  userLocation?: { lat: number; lng: number } | null;
}

export function PlaceCard({ place, explanation, similarity, onFavorite, isFavorite, userLocation }: PlaceCardProps) {
  const navigate = useNavigate();
  const vibeInfo = place.primary_vibe ? VIBE_INFO[place.primary_vibe] : null;
  const openStatus = getOpenStatus(place.opening_hours);
  const distanceKm =
    userLocation && place.latitude != null && place.longitude != null
      ? haversineKm(userLocation.lat, userLocation.lng, place.latitude, place.longitude)
      : null;

  return (
    <Card
      onClick={() => navigate(`/place/${place.slug}`)}
      className="group overflow-hidden hover:shadow-medium transition-all duration-300 animate-fade-in cursor-pointer"
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden bg-muted">
        {place.cover_image_url ? (
          <img
            src={place.cover_image_url}
            alt={place.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10">
            <MapPin className="w-12 h-12 text-muted-foreground/50" />
          </div>
        )}
        
        {/* Similarity Score */}
        {similarity !== undefined && (
          <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-accent text-accent-foreground text-xs font-semibold">
            {Math.round(similarity * 100)}% Match
          </div>
        )}
        
        {/* Favorite Button */}
        {onFavorite && (
          <Button
            size="icon"
            variant="ghost"
            className={`absolute top-3 right-3 w-9 h-9 rounded-full glass ${
              isFavorite ? 'text-destructive' : 'text-foreground'
            }`}
            onClick={(e) => { e.stopPropagation(); onFavorite(place.id); }}
          >
            <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
          </Button>
        )}

        {/* Live-context badges (open-now / distance) — the "GPT can't do this" layer */}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          {openStatus.state !== 'unknown' && (
            <span className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
              openStatus.state === 'open' ? 'bg-green-600 text-white' : 'bg-gray-700/90 text-white'
            }`}>
              <Clock className="w-3 h-3" />
              {openStatus.state === 'open'
                ? (openStatus.closesAt ? `Open · till ${openStatus.closesAt}` : openStatus.text)
                : 'Closed'}
            </span>
          )}
          {distanceKm != null && (
            <span className="px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 glass">
              <Navigation className="w-3 h-3" />
              {formatDistance(distanceKm)}
            </span>
          )}
        </div>
        
        {/* Price Badge */}
        <div className="absolute bottom-3 right-3 px-2 py-1 rounded-lg glass text-sm font-semibold">
          {PRICE_LABELS[place.price_range]}
        </div>
      </div>
      
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display font-semibold text-lg leading-tight group-hover:text-primary transition-colors">
              {place.name}
            </h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" />
              {place.address}
            </p>
          </div>
          
          {place.average_rating > 0 && (
            <div className="flex items-center gap-1 text-sm">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">{place.average_rating.toFixed(1)}</span>
            </div>
          )}
        </div>
        
        {/* Vibe & Features */}
        <div className="flex flex-wrap gap-2">
          {vibeInfo && (
            <Badge variant="secondary" className="gap-1">
              {vibeInfo.emoji} {vibeInfo.label}
            </Badge>
          )}
          <Badge variant="outline" className="gap-1">
            <Volume2 className="w-3 h-3" />
            {NOISE_LABELS[place.noise_level]}
          </Badge>
          {place.has_wifi && (
            <Badge variant="outline" className="gap-1">
              <Wifi className="w-3 h-3" />
              WiFi
            </Badge>
          )}
          {place.has_power_outlets && (
            <Badge variant="outline" className="gap-1">
              <Zap className="w-3 h-3" />
              Power
            </Badge>
          )}
        </div>
        
        {/* AI Explanation */}
        {explanation && (
          <p className="text-sm text-muted-foreground italic border-l-2 border-primary/30 pl-3">
            "{explanation}"
          </p>
        )}
        
        {/* Tags */}
        {place.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
