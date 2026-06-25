import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const SCRAPEGRAPH_BASE = "https://api.scrapegraphai.com/v1";

// Human-readable area labels for geocoding/search queries.
const AREA_LABELS: Record<string, string> = {
  baner: "Baner", koregaon_park: "Koregaon Park", viman_nagar: "Viman Nagar",
  hinjewadi: "Hinjewadi", kothrud: "Kothrud", aundh: "Aundh", wakad: "Wakad",
  hadapsar: "Hadapsar", deccan: "Deccan", camp: "Camp", kalyani_nagar: "Kalyani Nagar",
  magarpatta: "Magarpatta", pimpri_chinchwad: "Pimpri Chinchwad", pune_all: "Pune",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Geocoding via OpenStreetMap Nominatim (free, no key) ----
async function geocode(name: string, areaLabel: string): Promise<{ lat: number; lon: number } | null> {
  const query = `${name}, ${areaLabel}, Pune, India`;
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      // Nominatim usage policy REQUIRES a descriptive User-Agent identifying the app.
      headers: { "User-Agent": "GetPlaceGo/1.0 (place enrichment; Pune)" },
    });
    if (!res.ok) {
      console.error(`Nominatim ${res.status} for "${query}"`);
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
    return null;
  } catch (err) {
    console.error(`Geocode error for "${query}":`, err);
    return null;
  }
}

// ---- ScrapeGraph async-job poll helper (same pattern as scrape-places) ----
async function pollForResult(requestId: string, action: string, apiKey: string) {
  const maxAttempts = 18; // ~90s
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000);
    const res = await fetch(`${SCRAPEGRAPH_BASE}/${action}/${requestId}`, {
      headers: { "SGAI-APIKEY": apiKey },
    });
    const data = await res.json();
    if (data.status === "completed" || data.status === "failed") return data;
  }
  return { status: "timeout", error: "Scraping timed out" };
}

// ---- Photo URL + opening hours via ScrapeGraph searchscraper (best-effort) ----
async function fetchPhotoAndHours(
  name: string,
  areaLabel: string,
  apiKey: string,
): Promise<{ imageUrl?: string; openingHours?: Record<string, unknown> }> {
  const prompt = `Find the place "${name}" in ${areaLabel}, Pune, India. Return a direct, publicly accessible image URL of the place (key: image_url) and its weekly opening hours as an object keyed by day (key: opening_hours).`;
  const output_schema = {
    type: "object",
    properties: {
      image_url: { type: "string" },
      opening_hours: { type: "object" },
    },
  };
  try {
    const res = await fetch(`${SCRAPEGRAPH_BASE}/searchscraper`, {
      method: "POST",
      headers: { "SGAI-APIKEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ user_prompt: prompt, output_schema }),
    });
    let data = await res.json();
    if (!res.ok) {
      console.error("ScrapeGraph error:", JSON.stringify(data).slice(0, 300));
      return {};
    }
    if (data.request_id && (data.status === "queued" || data.status === "pending")) {
      data = await pollForResult(data.request_id, "searchscraper", apiKey);
    }
    if (data.status === "failed" || data.status === "timeout") return {};

    // The structured output usually lands in data.result (object) — be flexible.
    const r = (data.result && typeof data.result === "object") ? data.result : data;
    const imageUrl = typeof r.image_url === "string" && r.image_url.startsWith("http") ? r.image_url : undefined;
    const openingHours = r.opening_hours && typeof r.opening_hours === "object" ? r.opening_hours : undefined;
    return { imageUrl, openingHours };
  } catch (err) {
    console.error(`fetchPhotoAndHours error for "${name}":`, err);
    return {};
  }
}

// ---- Download an image URL and store it in the place-images bucket ----
async function downloadAndStore(supabase: any, imageUrl: string, slug: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) return null;
    const fileName = `${slug}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("place-images")
      .upload(fileName, bytes, { contentType, upsert: true });
    if (uploadError) {
      console.error(`Upload failed for ${slug}:`, uploadError.message);
      return null;
    }
    const { data } = supabase.storage.from("place-images").getPublicUrl(fileName);
    return data.publicUrl;
  } catch (err) {
    console.error(`downloadAndStore error for ${slug}:`, err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SCRAPEGRAPH_API_KEY = Deno.env.get("SCRAPEGRAPH_API_KEY"); // optional

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const placeIds: string[] | undefined = Array.isArray(body.placeIds) ? body.placeIds : undefined;
    const limit: number = typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 25) : 10;

    // Select target places: explicit ids, else rows missing coordinates (backfill).
    let query = supabase.from("places").select("id, name, slug, area, latitude, longitude, cover_image_url");
    if (placeIds && placeIds.length > 0) {
      query = query.in("id", placeIds);
    } else {
      query = query.is("latitude", null).eq("is_active", true).limit(limit);
    }

    const { data: places, error: placesError } = await query;
    if (placesError) throw placesError;

    if (!places || places.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No places need enrichment", enriched: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let enriched = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const place of places) {
      const areaLabel = AREA_LABELS[place.area] || "Pune";
      const update: Record<string, unknown> = {};
      const detail: Record<string, unknown> = { name: place.name };

      // 1) Geocode (free, Nominatim)
      const geo = await geocode(place.name, areaLabel);
      if (geo) {
        update.latitude = geo.lat;
        update.longitude = geo.lon;
        detail.geocoded = true;
      } else {
        detail.geocoded = false;
      }

      // 2) Photo + opening hours (best-effort, only if ScrapeGraph configured)
      if (SCRAPEGRAPH_API_KEY) {
        const { imageUrl, openingHours } = await fetchPhotoAndHours(place.name, areaLabel, SCRAPEGRAPH_API_KEY);
        if (openingHours) update.opening_hours = openingHours;
        if (imageUrl && !place.cover_image_url) {
          const storedUrl = await downloadAndStore(supabase, imageUrl, place.slug);
          if (storedUrl) {
            update.cover_image_url = storedUrl;
            detail.image = true;
          }
        }
      }

      // 3) Persist whatever we gathered
      if (Object.keys(update).length > 0) {
        const { error: updateError } = await supabase.from("places").update(update).eq("id", place.id);
        if (updateError) {
          detail.error = updateError.message;
        } else {
          enriched++;
        }
      }
      results.push(detail);

      // Respect Nominatim's ~1 req/sec politeness limit between places.
      await sleep(1100);
    }

    return new Response(
      JSON.stringify({ success: true, total: places.length, enriched, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("enrich-place error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
