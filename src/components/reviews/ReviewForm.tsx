import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Search, Send, Loader2, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Database } from '@/integrations/supabase/types';
import { PlaceMap } from '@/components/places/PlaceMap';

type VibeCategory = Database['public']['Enums']['vibe_category'];

interface Place {
  id: string;
  name: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
}

const VIBE_OPTIONS: { value: VibeCategory | 'other'; label: string; emoji: string }[] = [
  { value: 'work_study', label: 'Work & Study', emoji: '💻' },
  { value: 'social_dating', label: 'Social & Dating', emoji: '💕' },
  { value: 'food_experience', label: 'Food Experience', emoji: '🍽️' },
  { value: 'other', label: 'Other', emoji: '✨' },
];

export function ReviewForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const mapRef = useRef<HTMLDivElement>(null);
  
  const [isOpen, setIsOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVibes, setSelectedVibes] = useState<(VibeCategory | 'other')[]>([]);
  const [customVibe, setCustomVibe] = useState('');
  const [showPlacesList, setShowPlacesList] = useState(false);

  const fetchPlaces = async () => {
    setIsLoadingPlaces(true);
    const { data, error } = await supabase
      .from('places')
      .select('id, name, area, latitude, longitude, address')
      .eq('is_active', true)
      .order('name');
    
    if (!error && data) {
      setPlaces(data);
    }
    setIsLoadingPlaces(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      fetchPlaces();
    } else {
      // Reset form
      setSelectedPlace(null);
      setRating(0);
      setContent('');
      setSearchQuery('');
      setSelectedVibes([]);
      setCustomVibe('');
      setShowPlacesList(false);
    }
  };

  const handleVibeToggle = (vibe: VibeCategory | 'other') => {
    setSelectedVibes(prev => 
      prev.includes(vibe) 
        ? prev.filter(v => v !== vibe)
        : [...prev, vibe]
    );
    if (vibe === 'other' && selectedVibes.includes('other')) {
      setCustomVibe('');
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to submit a review",
      });
      setIsOpen(false);
      navigate('/auth');
      return;
    }

    if (!selectedPlace || !content.trim()) {
      toast({
        title: "Missing information",
        description: "Please select a place and write your review",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    // Prepare detected vibes - filter out 'other' and only include actual vibes
    const detectedVibes = selectedVibes.filter((v): v is VibeCategory => v !== 'other');
    
    // If "other" is selected and custom vibe is provided, add it to the content
    const reviewContent = selectedVibes.includes('other') && customVibe.trim()
      ? `${content.trim()}\n\n[Custom Vibe: ${customVibe.trim()}]`
      : content.trim();

    const { error } = await supabase
      .from('reviews')
      .insert({
        place_id: selectedPlace.id,
        user_id: user.id,
        content: reviewContent,
        rating: rating > 0 ? rating : null,
        source: 'user',
        detected_vibes: detectedVibes.length > 0 ? detectedVibes : null,
      });

    if (error) {
      console.error('Review submission error:', error);
      toast({
        title: "Error",
        description: "Failed to submit review. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Review submitted!",
        description: "Thank you for sharing your experience",
      });
      setIsOpen(false);
    }

    setIsSubmitting(false);
  };

  const filteredPlaces = places.filter(place =>
    place.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    place.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePlaceSelect = (place: Place) => {
    setSelectedPlace(place);
    setSearchQuery(place.name);
    setShowPlacesList(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline" className="gap-2">
          <Star className="w-5 h-5" />
          Write a Review
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Share Your Experience</DialogTitle>
          <DialogDescription>
            Help others find their perfect vibe by sharing your honest review
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Place Selection with Map */}
          <div className="space-y-3">
            <Label>Select a Place</Label>
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by place name or address..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowPlacesList(true);
                  if (!e.target.value) setSelectedPlace(null);
                }}
                onFocus={() => setShowPlacesList(true)}
                className="pl-9 pr-9"
              />
              {selectedPlace && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlace(null);
                    setSearchQuery('');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            {/* Places List Dropdown */}
            {showPlacesList && searchQuery && !selectedPlace && (
              <div className="border rounded-lg max-h-48 overflow-y-auto bg-background shadow-lg">
                {isLoadingPlaces ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredPlaces.length > 0 ? (
                  filteredPlaces.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => handlePlaceSelect(place)}
                      className="w-full px-4 py-3 text-left hover:bg-accent transition-colors border-b last:border-b-0 flex items-start gap-3"
                    >
                      <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{place.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {place.address} • {place.area.replace('_', ' ')}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    No places found matching "{searchQuery}"
                  </div>
                )}
              </div>
            )}

            {/* Selected Place Card with Mini Map */}
            {selectedPlace && (
              <div className="border rounded-lg p-4 bg-accent/30">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{selectedPlace.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{selectedPlace.address}</p>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {selectedPlace.area.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
                
                {/* Map Preview (free Leaflet + OpenStreetMap) */}
                {selectedPlace.latitude && selectedPlace.longitude && (
                  <div className="mt-3 rounded-lg overflow-hidden border h-32 bg-muted">
                    <PlaceMap
                      latitude={Number(selectedPlace.latitude)}
                      longitude={Number(selectedPlace.longitude)}
                      name={selectedPlace.name}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vibe Tags */}
          <div className="space-y-3">
            <Label>What's the Vibe? (Select all that apply)</Label>
            <div className="flex flex-wrap gap-2">
              {VIBE_OPTIONS.map((vibe) => (
                <button
                  key={vibe.value}
                  type="button"
                  onClick={() => handleVibeToggle(vibe.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    selectedVibes.includes(vibe.value)
                      ? 'bg-primary text-primary-foreground shadow-md scale-105'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  <span>{vibe.emoji}</span>
                  <span>{vibe.label}</span>
                </button>
              ))}
            </div>
            
            {/* Custom Vibe Input */}
            {selectedVibes.includes('other') && (
              <div className="mt-2">
                <Input
                  placeholder="Describe your custom vibe (e.g., Pet-friendly, Live music, etc.)"
                  value={customVibe}
                  onChange={(e) => setCustomVibe(e.target.value)}
                  className="text-sm"
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {customVibe.length}/50 characters
                </p>
              </div>
            )}
          </div>

          {/* Star Rating */}
          <div className="space-y-2">
            <Label>Your Rating (optional)</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= (hoverRating || rating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-muted-foreground/30'
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <button
                  type="button"
                  onClick={() => setRating(0)}
                  className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Review Content */}
          <div className="space-y-2">
            <Label htmlFor="review">Your Review</Label>
            <Textarea
              id="review"
              placeholder="Share your experience... What did you love? What's the vibe like? Any tips for others?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="resize-none"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {content.length}/500 characters
            </p>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedPlace || !content.trim()}
            className="w-full gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Review
              </>
            )}
          </Button>

          {!user && (
            <p className="text-xs text-center text-muted-foreground">
              You'll need to sign in to submit your review
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
