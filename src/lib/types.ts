// Get Place Go - Core Types

export type NoiseLevel = 'silent' | 'quiet' | 'moderate' | 'lively' | 'loud';
export type VibeCategory = 'work_study' | 'social_dating' | 'food_experience' | 'nightlife' | 'fitness_wellness' | 'arts_culture' | 'outdoor_adventure' | 'shopping' | 'family_kids';
export type PriceRange = 'budget' | 'moderate' | 'premium' | 'luxury';
export type Area = 'baner' | 'koregaon_park' | 'viman_nagar' | 'hinjewadi' | 'kothrud' | 'aundh' | 'wakad' | 'hadapsar' | 'deccan' | 'camp' | 'kalyani_nagar' | 'magarpatta' | 'pimpri_chinchwad' | 'pune_all';

export interface Place {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string;
  area: Area;
  locality?: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  opening_hours?: { raw?: string } | Record<string, unknown> | null;
  
  // Vibe attributes
  noise_level: NoiseLevel;
  is_work_friendly: boolean;
  has_wifi: boolean;
  has_power_outlets: boolean;
  is_pet_friendly: boolean;
  is_romantic: boolean;
  is_group_friendly: boolean;
  aesthetic_score: number;
  
  // Categorization
  primary_vibe: VibeCategory | null;
  price_range: PriceRange;
  cuisine_type: string[] | null;
  tags: string[];
  
  // Media
  cover_image_url: string | null;
  images: string[];
  
  // Metadata
  average_rating: number;
  review_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  place_id: string;
  user_id: string | null;
  content: string;
  rating: number | null;
  detected_vibes: VibeCategory[];
  sentiment_score: number;
  source: string;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_vibes: VibeCategory[];
  preferred_areas: Area[];
  created_at: string;
  updated_at: string;
}

export interface SearchFilters {
  area?: Area;
  vibe?: VibeCategory;
  noise_level?: NoiseLevel;
  price_range?: PriceRange;
  is_work_friendly?: boolean;
  has_wifi?: boolean;
}

export interface VibeSearchResult {
  place: Place;
  similarity: number;
  explanation: string;
}

export interface AIRecommendation {
  places: VibeSearchResult[];
  summary: string;
  itinerary_suggestion?: string;
}

// Vibe category display info
export const VIBE_INFO: Record<VibeCategory, { label: string; emoji: string; color: string }> = {
  work_study: { label: 'Work & Study', emoji: '💻', color: 'vibe-work' },
  social_dating: { label: 'Social & Dating', emoji: '💕', color: 'vibe-social' },
  food_experience: { label: 'Food & Experience', emoji: '🍽️', color: 'vibe-food' },
  nightlife: { label: 'Nightlife', emoji: '🌙', color: 'vibe-night' },
  fitness_wellness: { label: 'Fitness & Wellness', emoji: '🧘', color: 'vibe-fitness' },
  arts_culture: { label: 'Arts & Culture', emoji: '🎨', color: 'vibe-arts' },
  outdoor_adventure: { label: 'Outdoor & Adventure', emoji: '🏔️', color: 'vibe-outdoor' },
  shopping: { label: 'Shopping', emoji: '🛍️', color: 'vibe-shopping' },
  family_kids: { label: 'Family & Kids', emoji: '👨‍👩‍👧', color: 'vibe-family' },
};

export const AREA_INFO: Record<Area, { label: string; description: string }> = {
  pune_all: { label: 'All Pune', description: 'Search across all areas' },
  baner: { label: 'Baner', description: 'Tech hub with modern cafes' },
  koregaon_park: { label: 'Koregaon Park', description: 'Upscale dining & nightlife' },
  viman_nagar: { label: 'Viman Nagar', description: 'IT corridor with diverse food' },
  hinjewadi: { label: 'Hinjewadi', description: 'IT park hub' },
  kothrud: { label: 'Kothrud', description: 'Residential with local gems' },
  aundh: { label: 'Aundh', description: 'University area with cafes' },
  wakad: { label: 'Wakad', description: 'Growing food scene' },
  hadapsar: { label: 'Hadapsar', description: 'Eastern Pune hub' },
  deccan: { label: 'Deccan', description: 'Heritage & street food' },
  camp: { label: 'Camp', description: 'Colonial charm & iconic eateries' },
  kalyani_nagar: { label: 'Kalyani Nagar', description: 'Trendy restaurants & bars' },
  magarpatta: { label: 'Magarpatta', description: 'Township dining' },
  pimpri_chinchwad: { label: 'Pimpri Chinchwad', description: 'Twin city with growing scene' },
};

export const NOISE_LABELS: Record<NoiseLevel, string> = {
  silent: '🤫 Silent',
  quiet: '🔇 Quiet',
  moderate: '🔉 Moderate',
  lively: '🔊 Lively',
  loud: '📢 Loud',
};

export const PRICE_LABELS: Record<PriceRange, string> = {
  budget: '₹',
  moderate: '₹₹',
  premium: '₹₹₹',
  luxury: '₹₹₹₹',
};
