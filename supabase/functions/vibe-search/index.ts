import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_VIBES = ["work_study", "social_dating", "food_experience", "nightlife", "fitness_wellness", "arts_culture", "outdoor_adventure", "shopping", "family_kids"];
const VALID_AREAS = ["baner", "koregaon_park", "viman_nagar", "hinjewadi", "kothrud", "aundh", "wakad", "hadapsar", "deccan", "camp", "kalyani_nagar", "magarpatta", "pimpri_chinchwad", "pune_all"];
const VALID_ATTRS = ["wifi", "quiet", "work_friendly", "romantic", "group_friendly", "pet_friendly", "outdoor", "family", "power_outlets"];
const VALID_PRICES = ["budget", "moderate", "premium", "luxury"];

const PRICE_ORDER: Record<string, number> = { budget: 1, moderate: 2, premium: 3, luxury: 4 };

const SearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required").max(500, "Query too long"),
  vibe: z.enum(VALID_VIBES as [string, ...string[]]).optional(),
  area: z.enum(VALID_AREAS as [string, ...string[]]).optional(),
  maxPrice: z.enum(VALID_PRICES as [string, ...string[]]).optional(),
  limit: z.number().int().min(1).max(50).default(12),
});

const MAX_REQUEST_SIZE = 10000;

interface Intent {
  area: string | null;
  vibe: string | null;
  attributes: string[];
  price_range: string | null;
  keywords: string[];
}

// ---- Agent #1: Query understanding via OpenRouter LLM ----
async function understandQuery(query: string, apiKey: string, model: string): Promise<Intent | null> {
  const systemPrompt = `You convert a user's place-search query into structured JSON for a Pune, India places app.
Return ONLY a JSON object (no prose) with these keys:
- "area": one of [${VALID_AREAS.join(", ")}] or null if unspecified
- "vibe": one of [${VALID_VIBES.join(", ")}] or null
- "attributes": array, any of [${VALID_ATTRS.join(", ")}] that the user implies
- "price_range": one of [${VALID_PRICES.join(", ")}] or null
- "keywords": array of 1-5 important topic words (e.g. ["coffee","books"])
Infer sensibly: "work"/"study"/"laptop" => vibe work_study + attribute work_friendly; "date"/"romantic" => social_dating + romantic; "party"/"drinks" => nightlife; "gym"/"yoga" => fitness_wellness; "trek"/"park" => outdoor_adventure + outdoor.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://getplacego.app",
        "X-Title": "Get Place Go",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      console.error(`Query-understanding OpenRouter ${res.status}`);
      return null;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      area: VALID_AREAS.includes(parsed.area) ? parsed.area : null,
      vibe: VALID_VIBES.includes(parsed.vibe) ? parsed.vibe : null,
      attributes: Array.isArray(parsed.attributes) ? parsed.attributes.filter((a: string) => VALID_ATTRS.includes(a)) : [],
      price_range: VALID_PRICES.includes(parsed.price_range) ? parsed.price_range : null,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map((k: string) => String(k).toLowerCase()).slice(0, 5) : [],
    };
  } catch (err) {
    console.error("understandQuery error:", err);
    return null;
  }
}

// Fallback intent from naive keyword detection if the LLM is unavailable.
const VIBE_KEYWORDS: Record<string, string[]> = {
  work_study: ["cafe", "coffee", "study", "work", "quiet", "wifi", "laptop", "coworking"],
  social_dating: ["romantic", "date", "couple", "lounge", "candlelight", "fine dining"],
  food_experience: ["restaurant", "food", "eat", "cuisine", "biryani", "bakery", "thali"],
  nightlife: ["club", "pub", "bar", "nightlife", "dance", "dj", "brewery", "drinks"],
  fitness_wellness: ["gym", "yoga", "fitness", "spa", "wellness", "swim", "sports"],
  arts_culture: ["museum", "art", "gallery", "theatre", "heritage", "temple", "history"],
  outdoor_adventure: ["trek", "park", "garden", "hiking", "nature", "outdoor", "lake", "hill"],
  shopping: ["mall", "shop", "market", "store", "shopping", "boutique"],
  family_kids: ["family", "kids", "children", "amusement", "fun", "play", "picnic"],
};

function fallbackIntent(query: string): Intent {
  const q = query.toLowerCase();
  let vibe: string | null = null;
  let best = 0;
  for (const [v, kws] of Object.entries(VIBE_KEYWORDS)) {
    const score = kws.filter((kw) => q.includes(kw)).length;
    if (score > best) { best = score; vibe = v; }
  }
  return {
    area: null,
    vibe,
    attributes: [
      q.includes("wifi") ? "wifi" : "",
      q.includes("quiet") ? "quiet" : "",
      q.includes("work") || q.includes("laptop") ? "work_friendly" : "",
      q.includes("romantic") || q.includes("date") ? "romantic" : "",
    ].filter(Boolean),
    price_range: null,
    keywords: q.split(/\s+/).filter((w) => w.length > 2).slice(0, 5),
  };
}

// ---- Score & rank DB places against the structured intent ----
function scorePlaces(places: any[], intent: Intent, originalQuery: string) {
  const scored = places.map((p) => {
    let score = 0;
    const reasons: string[] = [];
    const name = (p.name || "").toLowerCase();
    const desc = (p.description || "").toLowerCase();
    const tags = (p.tags || []).join(" ").toLowerCase();
    const cuisine = (p.cuisine_type || []).join(" ").toLowerCase();
    const haystack = `${name} ${desc} ${tags} ${cuisine}`;

    // Keyword matches (name strongest)
    const matched: string[] = [];
    for (const kw of intent.keywords) {
      if (name.includes(kw)) { score += 0.3; matched.push(kw); }
      else if (tags.includes(kw) || cuisine.includes(kw)) { score += 0.2; matched.push(kw); }
      else if (desc.includes(kw)) { score += 0.12; matched.push(kw); }
    }
    if (matched.length) reasons.push(`Matches ${[...new Set(matched)].map((m) => `"${m}"`).join(", ")}`);

    // Vibe match
    if (intent.vibe && p.primary_vibe === intent.vibe) {
      score += 0.3;
      reasons.push(`${intent.vibe.replace(/_/g, " ")} vibe`);
    }

    // Attribute matches
    const attrChecks: Record<string, boolean> = {
      wifi: !!p.has_wifi,
      power_outlets: !!p.has_power_outlets,
      work_friendly: !!p.is_work_friendly,
      romantic: !!p.is_romantic,
      group_friendly: !!p.is_group_friendly,
      pet_friendly: !!p.is_pet_friendly,
      family: !!p.is_group_friendly || p.primary_vibe === "family_kids",
      quiet: p.noise_level === "quiet" || p.noise_level === "silent",
      outdoor: p.primary_vibe === "outdoor_adventure",
    };
    for (const attr of intent.attributes) {
      if (attrChecks[attr]) {
        score += 0.15;
        reasons.push(attr.replace(/_/g, " "));
      }
    }

    // Price match
    if (intent.price_range && p.price_range === intent.price_range) score += 0.1;

    // Rating boost
    if (p.average_rating && p.average_rating > 0) score += (p.average_rating / 5) * 0.15;

    return {
      place: p,
      similarity: Math.min(Math.round(score * 100) / 100, 1),
      explanation: reasons.length ? reasons.slice(0, 3).join(" · ") : "Available in your area",
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const OPENROUTER_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
      return new Response(JSON.stringify({ error: "Request too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.json();
    const validation = SearchRequestSchema.safeParse(rawBody);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: validation.error.errors.map((e) => e.message) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { query, vibe, area, maxPrice, limit } = validation.data;
    const sanitizedQuery = query.replace(/[<>{}]/g, "").trim();

    // 1) Understand the query (LLM, with keyword fallback).
    let intent: Intent | null = OPENROUTER_API_KEY
      ? await understandQuery(sanitizedQuery, OPENROUTER_API_KEY, OPENROUTER_MODEL)
      : null;
    if (!intent) intent = fallbackIntent(sanitizedQuery);

    // Explicit UI filters override the inferred ones.
    if (vibe) intent.vibe = vibe;
    if (area) intent.area = area;

    // 2) Fetch candidate places from the DB (filter by area when known to bound the set).
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let dbQuery = supabase.from("places").select("*").eq("is_active", true);
    if (intent.area && intent.area !== "pune_all") dbQuery = dbQuery.eq("area", intent.area);
    if (maxPrice) {
      const allowed = Object.keys(PRICE_ORDER).filter((p) => PRICE_ORDER[p] <= PRICE_ORDER[maxPrice]);
      dbQuery = dbQuery.in("price_range", allowed);
    }
    const { data: places, error: placesError } = await dbQuery;
    if (placesError) {
      console.error("DB error:", placesError);
      throw new Error("Failed to fetch places");
    }

    if (!places || places.length === 0) {
      return new Response(
        JSON.stringify({ results: [], summary: "No places found. Try a different search!", query }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3) Score & rank.
    const ranked = scorePlaces(places, intent, sanitizedQuery);
    const top = ranked.slice(0, limit);

    const vibeLabel = intent.vibe ? intent.vibe.replace(/_/g, " ") : "your search";
    const areaLabel = intent.area && intent.area !== "pune_all" ? ` in ${intent.area.replace(/_/g, " ")}` : "";
    const summary = `Found ${ranked.length} places matching "${query}"${areaLabel}. Showing the best for ${vibeLabel}.`;

    return new Response(
      JSON.stringify({ results: top, summary, query, intent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("vibe-search error:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred processing your request" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
