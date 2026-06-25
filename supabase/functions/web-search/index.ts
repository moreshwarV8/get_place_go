import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SCRAPEGRAPH_BASE = "https://api.scrapegraphai.com/v1";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

const VALID_AREAS = ["baner", "koregaon_park", "viman_nagar", "hinjewadi", "kothrud", "aundh", "wakad", "hadapsar", "deccan", "camp", "kalyani_nagar", "magarpatta", "pimpri_chinchwad"];
const VALID_NOISE = ["silent", "quiet", "moderate", "lively", "loud"];
const VALID_PRICE = ["budget", "moderate", "premium", "luxury"];
const VALID_VIBES = ["work_study", "social_dating", "food_experience", "nightlife", "fitness_wellness", "arts_culture", "outdoor_adventure", "shopping", "family_kids"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sanitizeEnum<T extends string>(val: any, valid: T[], fallback: T): T {
  if (typeof val === "string") {
    const l = val.toLowerCase().trim().replace(/\s+/g, "_");
    if (valid.includes(l as T)) return l as T;
  }
  return fallback;
}

async function geocode(name: string, locality: string): Promise<{ lat: number; lon: number } | null> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(`${name}, ${locality}, Pune, India`)}&format=json&limit=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "GetPlaceGo/1.0 (place web-search)" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.lat && data[0]?.lon) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
    return null;
  } catch { return null; }
}

async function pollForResult(requestId: string, apiKey: string) {
  for (let i = 0; i < 18; i++) {
    await sleep(5000);
    const res = await fetch(`${SCRAPEGRAPH_BASE}/searchscraper/${requestId}`, { headers: { "SGAI-APIKEY": apiKey } });
    const data = await res.json();
    if (data.status === "completed" || data.status === "failed") return data;
  }
  return { status: "timeout" };
}

function extractPlaces(data: any): any[] {
  let result = data?.result;
  if (typeof result === "string") {
    try { const m = result.match(/\[[\s\S]*\]/); if (m) result = JSON.parse(m[0]); } catch { /* */ }
  }
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.places)) return result.places;
  if (Array.isArray(data?.places)) return data.places;
  if (result && typeof result === "object") {
    for (const k of Object.keys(result)) if (Array.isArray(result[k])) return result[k];
  }
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SCRAPEGRAPH_API_KEY = Deno.env.get("SCRAPEGRAPH_API_KEY");
    if (!SCRAPEGRAPH_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Web search is not configured." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const query = String(body.query || "").slice(0, 500).trim();
    if (!query) {
      return new Response(JSON.stringify({ success: false, error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Where to file these places: a known area enum, else the catch-all 'pune_other' + free-text locality.
    const areaEnum = VALID_AREAS.includes(body.area) ? body.area : "pune_other";
    const localityText: string | null = typeof body.locality === "string" && body.locality.trim()
      ? body.locality.trim() : (areaEnum === "pune_other" ? null : body.area);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ScrapeGraph web search across Zomato/blogs/Reddit/etc.
    const prompt = `Find real places matching: "${query}" in Pune, India${localityText ? ` (locality: ${localityText})` : ""}. For each place return JSON fields: name, address, locality/area, description, cuisine_type (array), price_range (budget/moderate/premium/luxury), average_rating (0-5), has_wifi (bool), is_work_friendly (bool), is_romantic (bool), is_group_friendly (bool), noise_level (quiet/moderate/lively), primary_vibe (one of work_study, social_dating, food_experience, nightlife, fitness_wellness, arts_culture, outdoor_adventure, shopping, family_kids), tags (array). Return a JSON array.`;

    const scrapeRes = await fetch(`${SCRAPEGRAPH_BASE}/searchscraper`, {
      method: "POST",
      headers: { "SGAI-APIKEY": SCRAPEGRAPH_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ user_prompt: prompt }),
    });
    let scrapeData = await scrapeRes.json();
    if (!scrapeRes.ok) {
      console.error("ScrapeGraph error:", JSON.stringify(scrapeData).slice(0, 300));
      throw new Error("Web search failed");
    }
    if (scrapeData.request_id && (scrapeData.status === "queued" || scrapeData.status === "pending")) {
      scrapeData = await pollForResult(scrapeData.request_id, SCRAPEGRAPH_API_KEY);
    }
    if (scrapeData.status === "failed" || scrapeData.status === "timeout") {
      throw new Error("Web search timed out");
    }

    const scraped = extractPlaces(scrapeData).slice(0, 8); // bound geocoding/time
    const results: any[] = [];

    for (const p of scraped) {
      if (!p.name || !p.address) continue;
      const placeLocality = (typeof p.locality === "string" && p.locality) || (typeof p.area === "string" && p.area) || localityText;
      const geo = await geocode(p.name, placeLocality || "Pune");

      const record: Record<string, unknown> = {
        name: p.name,
        slug: slugify(p.name) + "-" + slugify(placeLocality || areaEnum),
        address: p.address,
        area: areaEnum,
        locality: placeLocality || null,
        description: p.description || null,
        cuisine_type: Array.isArray(p.cuisine_type) ? p.cuisine_type : [],
        price_range: sanitizeEnum(p.price_range, VALID_PRICE, "moderate"),
        average_rating: typeof p.average_rating === "number" ? p.average_rating : 0,
        has_wifi: p.has_wifi === true,
        is_work_friendly: p.is_work_friendly === true,
        is_romantic: p.is_romantic === true,
        is_group_friendly: p.is_group_friendly === true,
        noise_level: sanitizeEnum(p.noise_level, VALID_NOISE, "moderate"),
        primary_vibe: sanitizeEnum(p.primary_vibe, VALID_VIBES, "food_experience"),
        tags: Array.isArray(p.tags) ? p.tags : [],
        latitude: geo?.lat ?? null,
        longitude: geo?.lon ?? null,
        is_active: true,
      };

      const { data: upserted, error } = await supabase
        .from("places")
        .upsert(record, { onConflict: "slug" })
        .select()
        .single();

      if (!error && upserted) {
        results.push({ place: upserted, similarity: 0.6, explanation: "Found via web search" });
      }
      await sleep(1100); // Nominatim politeness
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: results.length
          ? `Found ${results.length} place(s) from the web for "${query}".`
          : `No additional places found on the web for "${query}".`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("web-search error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Web search error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
