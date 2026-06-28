import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const ItineraryRequestSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(1000, "Description too long").optional(),
  existingPlaces: z.array(z.string().max(100)).max(20).default([]),
});

const MAX_REQUEST_SIZE = 10000; // 10KB

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const OPENROUTER_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    // Verify user token
    const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userSupabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Request size limit
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
      return new Response(
        JSON.stringify({ error: "Request too large" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate input
    const rawBody = await req.json();
    const validationResult = ItineraryRequestSchema.safeParse(rawBody);
    
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid input", 
          details: validationResult.error.errors.map(e => e.message) 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { title, description, existingPlaces } = validationResult.data;

    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    // Use service role for database queries
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all available places
    const { data: places, error: placesError } = await supabase
      .from("places")
      .select("*")
      .eq("is_active", true);

    if (placesError) throw placesError;

    if (!places || places.length === 0) {
      return new Response(
        JSON.stringify({ suggestions: [], summary: "No places available yet!" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter out already added places
    const availablePlaces = places.filter(
      (p) => !existingPlaces.includes(p.name)
    );

    // Sanitize inputs for AI prompt
    const sanitizedTitle = title.replace(/[<>{}]/g, "").trim();
    const sanitizedDescription = description?.replace(/[<>{}]/g, "").trim() || "";

    // Prefer places WITH coordinates so the planner can order stops by proximity.
    const withCoords = availablePlaces.filter((p) => p.latitude != null && p.longitude != null);
    const candidatePool = (withCoords.length >= 10 ? withCoords : availablePlaces).slice(0, 120);

    const systemPrompt = `You are an expert day-trip planner for Pune, India. You design COMPLETE, structured day itineraries — not just a list of places.

Build a realistic, flowing plan of 4-6 stops that someone can actually follow start to finish:
- Order stops by time of day and a natural rhythm: breakfast/coffee in the morning, an activity, lunch midday, something relaxed in the afternoon, dinner/evening to close.
- Keep stops GEOGRAPHICALLY SENSIBLE: prefer places close together (use the latitude/longitude provided) so the user isn't crossing the city repeatedly. Group nearby stops.
- Respect the theme/vibe (e.g. a "chill" day = relaxed, quiet, unhurried; avoid loud party spots).
- For each stop give: a suggested start time, a realistic duration, what to DO there (the activity), and why it fits.
- Add a short travel hint between consecutive stops when areas differ.
- Be warm and practical.`;

    const userPrompt = `Plan this day: "${sanitizedTitle}"
${sanitizedDescription ? `Notes from user: ${sanitizedDescription}` : ""}
${existingPlaces.length > 0 ? `Already chosen (build around these, don't repeat): ${existingPlaces.join(", ")}` : ""}

Choose ONLY from these real places (id, name, area, coords, vibe, etc.):
${JSON.stringify(candidatePool.map(p => ({
  id: p.id,
  name: p.name,
  area: p.area,
  lat: p.latitude,
  lng: p.longitude,
  primary_vibe: p.primary_vibe,
  noise_level: p.noise_level,
  price_range: p.price_range,
  tags: p.tags,
})), null, 2)}

Return ONLY JSON in this exact shape:
{
  "summary": "1-2 sentences describing the day you've planned",
  "tips": "1 short practical tip (what to carry, best timing, etc.)",
  "suggestions": [
    {
      "id": "place-uuid-from-the-list",
      "suggested_time": "09:30",
      "duration": "1 hour",
      "activity": "What to do here, e.g. 'Relaxed breakfast & coffee'",
      "reason": "Why this fits the plan",
      "travel_note": "e.g. '~10 min to the next stop' or '' if same area"
    }
  ]
}
Order suggestions chronologically by suggested_time.`;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://getplacego.app",
        "X-Title": "Get Place Go",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Log the real OpenRouter error server-side (visible in function logs) but
      // don't leak upstream details to the client.
      const errBody = await aiResponse.text();
      console.error(`OpenRouter error ${aiResponse.status}:`, errBody);
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";

    let result;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { suggestions: [], summary: "" };
    } catch {
      result = { suggestions: [], summary: "Here are some great places for your trip!" };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("generate-itinerary error:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred processing your request" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
