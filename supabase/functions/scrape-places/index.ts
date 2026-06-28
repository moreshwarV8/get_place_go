import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SCRAPEGRAPH_BASE = "https://api.scrapegraphai.com/v1";

const RequestSchema = z.object({
  url: z.string().url(),
  area: z.enum(["baner", "koregaon_park", "viman_nagar", "hinjewadi", "kothrud", "aundh", "wakad", "hadapsar", "deccan", "camp", "kalyani_nagar", "magarpatta", "pimpri_chinchwad"]),
  prompt: z.string().optional().default(
    "Extract all restaurant/cafe listings with: name, address, description, cuisine types, price range (budget/moderate/premium/luxury), average rating, whether it has wifi, whether it's pet friendly, whether it's work friendly, noise level (silent/quiet/moderate/lively/loud), and any tags or categories."
  ),
});

const outputSchema = {
  type: "object",
  properties: {
    places: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          description: { type: "string" },
          cuisine_type: { type: "array", items: { type: "string" } },
          price_range: { type: "string", enum: ["budget", "moderate", "premium", "luxury"] },
          average_rating: { type: "number" },
          has_wifi: { type: "boolean" },
          is_pet_friendly: { type: "boolean" },
          is_work_friendly: { type: "boolean" },
          is_romantic: { type: "boolean" },
          is_group_friendly: { type: "boolean" },
          noise_level: { type: "string", enum: ["silent", "quiet", "moderate", "lively", "loud"] },
          tags: { type: "array", items: { type: "string" } },
          primary_vibe: { type: "string", enum: ["work_study", "social_dating", "food_experience"] },
        },
        required: ["name", "address"],
      },
    },
  },
};

async function pollForResult(requestId: string, action: string, apiKey: string) {
  const maxAttempts = 24;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    console.log(`Polling attempt ${i + 1}/${maxAttempts} for ${requestId}`);
    const res = await fetch(`${SCRAPEGRAPH_BASE}/${action}/${requestId}`, {
      headers: { "SGAI-APIKEY": apiKey },
    });
    const data = await res.json();
    console.log(`Poll status: ${data.status}`);
    if (data.status === "completed" || data.status === "failed") {
      return data;
    }
  }
  return { status: "timeout", error: "Scraping timed out" };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractPlaces(data: any): any[] {
  // Try multiple paths to find the places array
  if (Array.isArray(data)) return data;
  if (data?.places && Array.isArray(data.places)) return data.places;
  if (data?.result?.places && Array.isArray(data.result.places)) return data.result.places;
  if (data?.result && Array.isArray(data.result)) return data.result;
  if (data?.data?.result?.places && Array.isArray(data.data.result.places)) return data.data.result.places;
  if (data?.data?.result && Array.isArray(data.data.result)) return data.data.result;
  if (data?.data?.places && Array.isArray(data.data.places)) return data.data.places;
  
  // If result is an object with a single key that's an array, use that
  if (data?.result && typeof data.result === 'object') {
    const keys = Object.keys(data.result);
    for (const key of keys) {
      if (Array.isArray(data.result[key])) {
        return data.result[key];
      }
    }
  }
  
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = await requireAdmin(req, corsHeaders);
  if (denied) return denied;

  try {
    const apiKey = Deno.env.get("SCRAPEGRAPH_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "SCRAPEGRAPH_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawBody = await req.json();
    const parsed = RequestSchema.parse(rawBody);
    const url = encodeURI(parsed.url);
    const area = parsed.area;
    const prompt = parsed.prompt;

    console.log(`Scraping places from: ${url} for area: ${area}`);

    // Call SmartScraper
    const scrapeRes = await fetch(`${SCRAPEGRAPH_BASE}/smartscraper`, {
      method: "POST",
      headers: {
        "SGAI-APIKEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        website_url: url,
        user_prompt: prompt,
        output_schema: outputSchema,
      }),
    });

    let scrapeData = await scrapeRes.json();
    console.log(`Initial ScrapeGraph response status: ${scrapeRes.status}, keys: ${JSON.stringify(Object.keys(scrapeData))}`);
    console.log(`Initial response preview: ${JSON.stringify(scrapeData).slice(0, 500)}`);

    if (!scrapeRes.ok) {
      console.error("ScrapeGraph error:", JSON.stringify(scrapeData));
      throw new Error(`ScrapeGraph API error: ${scrapeRes.status} - ${JSON.stringify(scrapeData)}`);
    }

    // Poll if async
    if (scrapeData.request_id && (scrapeData.status === "queued" || scrapeData.status === "pending")) {
      console.log(`Job queued with request_id: ${scrapeData.request_id}, polling...`);
      scrapeData = await pollForResult(scrapeData.request_id, "smartscraper", apiKey);
      console.log(`Final poll result keys: ${JSON.stringify(Object.keys(scrapeData))}`);
      console.log(`Final poll result preview: ${JSON.stringify(scrapeData).slice(0, 500)}`);
    }

    if (scrapeData.status === "failed" || scrapeData.status === "timeout") {
      throw new Error(scrapeData.error || "Scraping failed");
    }

    // Extract places from result using flexible extraction
    const scrapedPlaces = extractPlaces(scrapeData);
    console.log(`Extracted ${scrapedPlaces.length} places`);

    if (scrapedPlaces.length > 0) {
      console.log(`First place sample: ${JSON.stringify(scrapedPlaces[0]).slice(0, 300)}`);
    }

    if (!scrapedPlaces.length) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No places found on this page", 
          inserted: 0,
          debug_keys: Object.keys(scrapeData),
          debug_preview: JSON.stringify(scrapeData).slice(0, 300),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert into database
    const supabase = createClient(supabaseUrl, supabaseKey);
    let inserted = 0;
    const errors: string[] = [];

    for (const place of scrapedPlaces) {
      if (!place.name || !place.address) continue;

      const slug = slugify(place.name) + "-" + slugify(area);

    const validNoiseLevels = ["silent", "quiet", "moderate", "lively", "loud"];
      const validPriceRanges = ["budget", "moderate", "premium", "luxury"];
      const validVibes = ["work_study", "social_dating", "food_experience"];

      const sanitize = (val: any, valid: string[], fallback: string) => {
        if (typeof val === "string") {
          const lower = val.toLowerCase().trim().replace(/\s+/g, "_");
          if (valid.includes(lower)) return lower;
        }
        return fallback;
      };

      const record = {
        name: place.name,
        slug,
        address: place.address,
        area,
        description: place.description || null,
        cuisine_type: Array.isArray(place.cuisine_type) ? place.cuisine_type : [],
        price_range: sanitize(place.price_range, validPriceRanges, "moderate"),
        average_rating: typeof place.average_rating === "number" ? place.average_rating : 0,
        has_wifi: place.has_wifi === true,
        is_pet_friendly: place.is_pet_friendly === true,
        is_work_friendly: place.is_work_friendly === true,
        is_romantic: place.is_romantic === true,
        is_group_friendly: place.is_group_friendly === true,
        noise_level: sanitize(place.noise_level, validNoiseLevels, "moderate"),
        tags: Array.isArray(place.tags) ? place.tags : [],
        primary_vibe: sanitize(place.primary_vibe, validVibes, "food_experience"),
        is_active: true,
      };

      const { error } = await supabase
        .from("places")
        .upsert(record, { onConflict: "slug" });

      if (error) {
        console.error(`Failed to insert ${place.name}:`, error.message);
        errors.push(`${place.name}: ${error.message}`);
      } else {
        inserted++;
      }
    }

    console.log(`Inserted ${inserted}/${scrapedPlaces.length} places`);

    return new Response(
      JSON.stringify({
        success: true,
        total_scraped: scrapedPlaces.length,
        inserted,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("scrape-places error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
