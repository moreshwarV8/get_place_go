import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowLeft, Plus, Trash2, Loader2, Sparkles, Clock, MapPin, GripVertical, Share2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableItem } from '@/components/itinerary/SortableItem';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Place, VIBE_INFO, AREA_INFO } from '@/lib/types';

interface ItineraryPlace {
  place_id: string;
  place: Place;
  time_slot: string;
  notes: string;
}

interface Itinerary {
  id: string;
  title: string;
  description: string | null;
  places: string[];
  schedule: Record<string, { time_slot: string; notes: string }>;
  is_public: boolean;
  user_id: string;
}

const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'
];

export default function ItineraryBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [itineraryPlaces, setItineraryPlaces] = useState<ItineraryPlace[]>([]);
  const [availablePlaces, setAvailablePlaces] = useState<Place[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [planOverview, setPlanOverview] = useState<{ summary?: string; tips?: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (id) {
      fetchItinerary();
      fetchAvailablePlaces();
    }
  }, [id]);

  const fetchItinerary = async () => {
    try {
      const { data: itineraryData, error: itError } = await supabase
        .from('itineraries')
        .select('*')
        .eq('id', id)
        .single();

      if (itError) throw itError;
      const formattedItinerary = {
        ...itineraryData,
        schedule: (itineraryData.schedule as Record<string, { time_slot: string; notes: string }>) || {}
      };
      setItinerary(formattedItinerary);

      // Fetch places in the itinerary
      if (itineraryData.places?.length > 0) {
        const { data: placesData, error: placesError } = await supabase
          .from('places')
          .select('*')
          .in('id', itineraryData.places);

        if (placesError) throw placesError;

        const scheduleData = (itineraryData.schedule as Record<string, { time_slot: string; notes: string }>) || {};
        const orderedPlaces = itineraryData.places.map((placeId: string) => {
          const place = placesData?.find((p: Place) => p.id === placeId);
          const schedule = scheduleData[placeId] || { time_slot: '', notes: '' };
          return place ? { place_id: placeId, place, ...schedule } : null;
        }).filter(Boolean) as ItineraryPlace[];

        setItineraryPlaces(orderedPlaces);
      }
    } catch (err) {
      console.error('Error fetching itinerary:', err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load itinerary' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAvailablePlaces = async () => {
    const { data } = await supabase.from('places').select('*').eq('is_active', true);
    setAvailablePlaces(data || []);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItineraryPlaces((items) => {
        const oldIndex = items.findIndex((i) => i.place_id === active.id);
        const newIndex = items.findIndex((i) => i.place_id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addPlace = (place: Place) => {
    if (itineraryPlaces.some((p) => p.place_id === place.id)) {
      toast({ title: 'Already added', description: 'This place is already in your itinerary' });
      return;
    }
    setItineraryPlaces([...itineraryPlaces, { place_id: place.id, place, time_slot: '', notes: '' }]);
    setAddDialogOpen(false);
    setSearchQuery('');
  };

  const removePlace = (placeId: string) => {
    setItineraryPlaces(itineraryPlaces.filter((p) => p.place_id !== placeId));
  };

  const updateTimeSlot = (placeId: string, timeSlot: string) => {
    setItineraryPlaces(itineraryPlaces.map((p) =>
      p.place_id === placeId ? { ...p, time_slot: timeSlot } : p
    ));
  };

  const saveItinerary = async () => {
    if (!itinerary) return;
    setIsSaving(true);

    try {
      const places = itineraryPlaces.map((p) => p.place_id);
      const schedule = itineraryPlaces.reduce((acc, p) => ({
        ...acc,
        [p.place_id]: { time_slot: p.time_slot, notes: p.notes }
      }), {});

      const { error } = await supabase
        .from('itineraries')
        .update({ places, schedule })
        .eq('id', itinerary.id);

      if (error) throw error;
      toast({ title: 'Saved!', description: 'Your itinerary has been updated' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save itinerary' });
    } finally {
      setIsSaving(false);
    }
  };

  const generateAISuggestions = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-itinerary', {
        body: {
          title: itinerary?.title,
          description: itinerary?.description,
          existingPlaces: itineraryPlaces.map((p) => p.place.name),
        },
      });

      if (error) throw error;

      if (data.suggestions) {
        setPlanOverview({ summary: data.summary, tips: data.tips });

        setItineraryPlaces((prev) => {
          const merged = [...prev];
          for (const s of data.suggestions) {
            const place = availablePlaces.find((p) => p.id === s.id);
            if (place && !merged.some((ip) => ip.place_id === place.id)) {
              const activity = s.duration ? `${s.activity || ''} (${s.duration})` : (s.activity || '');
              const notes = [activity, s.reason, s.travel_note].filter(Boolean).join(' · ');
              merged.push({ place_id: place.id, place, time_slot: s.suggested_time || '', notes });
            }
          }
          // Order the day chronologically (places without a time go last).
          merged.sort((a, b) => (a.time_slot || '99:99').localeCompare(b.time_slot || '99:99'));
          return merged;
        });

        toast({ title: 'Day plan ready!', description: data.summary || 'Your structured itinerary is below.' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to generate the plan' });
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredPlaces = availablePlaces.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center pt-32">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="text-center pt-32">
          <p>Itinerary not found</p>
          <Button onClick={() => navigate('/itineraries')} className="mt-4">Back to Itineraries</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" onClick={() => navigate('/itineraries')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="font-display text-2xl font-bold">{itinerary.title}</h1>
              {itinerary.description && (
                <p className="text-muted-foreground text-sm">{itinerary.description}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={saveItinerary} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mb-6">
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Place
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Add Place to Itinerary</DialogTitle>
                </DialogHeader>
                <Input
                  placeholder="Search places..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="my-4"
                />
                <div className="overflow-y-auto flex-1 space-y-2">
                  {filteredPlaces.map((place) => (
                    <div
                      key={place.id}
                      className="p-3 rounded-lg border hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => addPlace(place)}
                    >
                      <div className="font-medium">{place.name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <MapPin className="w-3 h-3" />
                        {AREA_INFO[place.area].label}
                        {place.primary_vibe && (
                          <Badge variant="secondary" className="text-xs">
                            {VIBE_INFO[place.primary_vibe].emoji} {VIBE_INFO[place.primary_vibe].label}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              className="gap-2"
              onClick={generateAISuggestions}
              disabled={isGenerating}
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              AI Suggest
            </Button>
          </div>

          {/* AI Day-Plan Overview */}
          {planOverview && (planOverview.summary || planOverview.tips) && (
            <Card className="mb-6 border-primary/30 bg-primary/5">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <Sparkles className="w-4 h-4" /> Your Day Plan
                </div>
                {planOverview.summary && <p className="text-sm text-foreground">{planOverview.summary}</p>}
                {planOverview.tips && (
                  <p className="text-sm text-muted-foreground"><span className="font-medium">Tip:</span> {planOverview.tips}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Places List */}
          {itineraryPlaces.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground mb-4">No places added yet</p>
                <Button onClick={() => setAddDialogOpen(true)} variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Your First Place
                </Button>
              </CardContent>
            </Card>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={itineraryPlaces.map((p) => p.place_id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {itineraryPlaces.map((item, index) => (
                    <SortableItem key={item.place_id} id={item.place_id}>
                      <Card className="group">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <GripVertical className="w-5 h-5 cursor-grab" />
                              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center font-medium">
                                {index + 1}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold">{item.place.name}</h3>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {item.place.address}
                              </p>
                              {item.place.primary_vibe && (
                                <Badge variant="secondary" className="mt-2 text-xs">
                                  {VIBE_INFO[item.place.primary_vibe].emoji} {VIBE_INFO[item.place.primary_vibe].label}
                                </Badge>
                              )}
                              {item.notes && (
                                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{item.notes}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <Select value={item.time_slot} onValueChange={(v) => updateTimeSlot(item.place_id, v)}>
                                <SelectTrigger className="w-24">
                                  <Clock className="w-3 h-3 mr-1" />
                                  <SelectValue placeholder="Time" />
                                </SelectTrigger>
                                <SelectContent>
                                  {TIME_SLOTS.map((slot) => (
                                    <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => removePlace(item.place_id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </main>
    </div>
  );
}
