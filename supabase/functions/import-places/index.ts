import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Approx center coordinates for each Pune area (lat, lon) — used for radius queries.
const AREA_CENTERS: Record<string, { lat: number; lon: number; label: string }> = {
  baner: { lat: 18.559, lon: 73.776, label: "Baner" },
  koregaon_park: { lat: 18.536, lon: 73.893, label: "Koregaon Park" },
  viman_nagar: { lat: 18.567, lon: 73.915, label: "Viman Nagar" },
  hinjewadi: { lat: 18.591, lon: 73.738, label: "Hinjewadi" },
  kothrud: { lat: 18.507, lon: 73.807, label: "Kothrud" },
  aundh: { lat: 18.558, lon: 73.807, label: "Aundh" },
  wakad: { lat: 18.598, lon: 73.762, label: "Wakad" },
  hadapsar: { lat: 18.500, lon: 73.926, label: "Hadapsar" },
  deccan: { lat: 18.516, lon: 73.841, label: "Deccan" },
  camp: { lat: 18.512, lon: 73.879, label: "Camp" },
  kalyani_nagar: { lat: 18.548, lon: 73.901, label: "Kalyani Nagar" },
  magarpatta: { lat: 18.516, lon: 73.928, label: "Magarpatta" },
  pimpri_chinchwad: { lat: 18.628, lon: 73.800, label: "Pimpri Chinchwad" },
};

// Category → OSM tag matchers (key,value pairs) + how it maps onto our schema.
// Order matters: classify() returns the FIRST matching category.
const CATEGORIES: Record<string, {
  match: [string, string][];
  primary_vibe: string;
  noise_level: string;
}> = {
  cafe: { match: [["amenity", "cafe"]], primary_vibe: "work_study", noise_level: "quiet" },
  restaurant: { match: [["amenity", "restaurant"]], primary_vibe: "food_experience", noise_level: "moderate" },
  bar: { match: [["amenity", "bar"], ["amenity", "pub"], ["amenity", "nightclub"]], primary_vibe: "nightlife", noise_level: "lively" },
  gym: { match: [["leisure", "fitness_centre"], ["leisure", "sports_centre"]], primary_vibe: "fitness_wellness", noise_level: "moderate" },
  park: { match: [["leisure", "park"], ["leisure", "garden"]], primary_vibe: "outdoor_adventure", noise_level: "quiet" },
  mall: { match: [["shop", "mall"], ["shop", "department_store"]], primary_vibe: "shopping", noise_level: "lively" },
  museum: { match: [["tourism", "museum"], ["tourism", "gallery"]], primary_vibe: "arts_culture", noise_level: "quiet" },
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Classify an OSM element's tags into one of our categories (first match wins).
function classify(tags: Record<string, string>): string | null {
  for (const [cat, def] of Object.entries(CATEGORIES)) {
    for (const [k, v] of def.match) {
      if (tags[k] === v) return cat;
    }
  }
  return null;
}

function buildOverpassQuery(categoryKeys: string[], lat: number, lon: number, radius: number): string {
  const parts: string[] = [];
  for (const cat of categoryKeys) {
    for (const [k, v] of CATEGORIES[cat].match) {
      parts.push(`node["${k}"="${v}"](around:${radius},${lat},${lon});`);
      parts.push(`way["${k}"="${v}"](around:${radius},${lat},${lon});`);
    }
  }
  return `[out:json][timeout:60];(${parts.join("")});out center tags;`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = await requireAdmin(req, corsHeaders);
  if (denied) return denied;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const area: string = body.area;
    // category may be a specific key or "all" (default) to import every category for the area.
    const category: string = body.category || "all";
    const radius: number = typeof body.radius === "number" ? Math.min(Math.max(body.radius, 500), 5000) : 2500;

    if (!AREA_CENTERS[area]) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown area. Valid: ${Object.keys(AREA_CENTERS).join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const categoryKeys = category === "all" ? Object.keys(CATEGORIES) : [category];
    if (categoryKeys.some((c) => !CATEGORIES[c])) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown category. Valid: all, ${Object.keys(CATEGORIES).join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const center = AREA_CENTERS[area];
    const query = buildOverpassQuery(categoryKeys, center.lat, center.lon, radius);

    console.log(`Overpass: ${category} in ${area} (r=${radius}m)`);
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "GetPlaceGo/1.0 (Pune places import)" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error(`Overpass ${res.status}:`, txt.slice(0, 300));
      throw new Error(`Overpass API error ${res.status}`);
    }

    const data = await res.json();
    const elements: any[] = Array.isArray(data.elements) ? data.elements : [];
    console.log(`Overpass returned ${elements.length} elements`);

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const el of elements) {
      const tags = el.tags || {};
      const name: string | undefined = tags.name;
      if (!name) { skipped++; continue; }

      const cat = classify(tags);
      if (!cat) { skipped++; continue; }
      const catDef = CATEGORIES[cat];

      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;

      const address =
        [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"]].filter(Boolean).join(", ") ||
        `${center.label}, Pune`;

      const hasWifi = ["wlan", "yes", "wifi"].includes((tags["internet_access"] || "").toLowerCase()) || tags["wifi"] === "yes";
      const cuisine = typeof tags.cuisine === "string" ? tags.cuisine.split(";").map((c: string) => c.trim()) : [];

      const placeTags: string[] = [cat];
      if (cuisine.length) placeTags.push(...cuisine);

      const record = {
        name,
        slug: slugify(name) + "-" + slugify(area),
        address,
        area,
        latitude: typeof lat === "number" ? lat : null,
        longitude: typeof lon === "number" ? lon : null,
        primary_vibe: catDef.primary_vibe,
        noise_level: catDef.noise_level,
        has_wifi: hasWifi,
        is_work_friendly: cat === "cafe" && hasWifi,
        cuisine_type: cuisine,
        tags: placeTags,
        opening_hours: tags.opening_hours ? { raw: tags.opening_hours } : {},
        is_active: true,
        average_rating: 0,
      };

      const { error, count } = await supabase
        .from("places")
        .upsert(record, { onConflict: "slug", ignoreDuplicates: true, count: "exact" });

      if (error) {
        errors.push(`${name}: ${error.message}`);
      } else if (count && count > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        category,
        area,
        found: elements.length,
        inserted,
        skipped,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("import-places error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
