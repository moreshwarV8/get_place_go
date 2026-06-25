import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_VIBES = ["work_study", "social_dating", "food_experience", "nightlife", "fitness_wellness", "arts_culture", "outdoor_adventure", "shopping", "family_kids"];
const VALID_AREAS = ["baner", "koregaon_park", "viman_nagar", "hinjewadi", "kothrud", "aundh", "wakad", "hadapsar", "deccan", "camp", "kalyani_nagar", "magarpatta", "pimpri_chinchwad"];
const VALID_ATTRS = ["wifi", "quiet", "work_friendly", "romantic", "group_friendly", "pet_friendly", "outdoor", "family", "power_outlets"];

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

async function callLLM(messages: any[], apiKey: string, model: string, temperature = 0.5): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://getplacego.app",
      "X-Title": "Get Place Go",
    },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`OpenRouter ${res.status}: ${t.slice(0, 300)}`);
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// Agent #1 — understand the latest user turn into structured intent.
async function understand(query: string, apiKey: string, model: string) {
  const sys = `Convert the user's request into JSON for a Pune places app. Keys:
"area": one of [${VALID_AREAS.join(", ")}] or null; "vibe": one of [${VALID_VIBES.join(", ")}] or null;
"attributes": subset of [${VALID_ATTRS.join(", ")}]; "keywords": up to 5 topic words. Return ONLY JSON.`;
  try {
    const out = await callLLM([{ role: "system", content: sys }, { role: "user", content: query }], apiKey, model, 0.1);
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) return { area: null, vibe: null, attributes: [], keywords: [] };
    const p = JSON.parse(m[0]);
    return {
      area: VALID_AREAS.includes(p.area) ? p.area : null,
      vibe: VALID_VIBES.includes(p.vibe) ? p.vibe : null,
      attributes: Array.isArray(p.attributes) ? p.attributes.filter((a: string) => VALID_ATTRS.includes(a)) : [],
      keywords: Array.isArray(p.keywords) ? p.keywords.map((k: string) => String(k).toLowerCase()).slice(0, 5) : [],
    };
  } catch {
    return { area: null, vibe: null, attributes: [], keywords: [] };
  }
}

function scoreAndPick(places: any[], intent: any, limit = 8) {
  const attrField: Record<string, (p: any) => boolean> = {
    wifi: (p) => !!p.has_wifi, power_outlets: (p) => !!p.has_power_outlets, work_friendly: (p) => !!p.is_work_friendly,
    romantic: (p) => !!p.is_romantic, group_friendly: (p) => !!p.is_group_friendly, pet_friendly: (p) => !!p.is_pet_friendly,
    family: (p) => !!p.is_group_friendly || p.primary_vibe === "family_kids", quiet: (p) => p.noise_level === "quiet" || p.noise_level === "silent",
    outdoor: (p) => p.primary_vibe === "outdoor_adventure",
  };
  return places.map((p) => {
    let s = 0;
    const hay = `${p.name} ${p.description || ""} ${(p.tags || []).join(" ")} ${(p.cuisine_type || []).join(" ")}`.toLowerCase();
    for (const kw of intent.keywords) if (hay.includes(kw)) s += 0.3;
    if (intent.vibe && p.primary_vibe === intent.vibe) s += 0.3;
    for (const a of intent.attributes) if (attrField[a]?.(p)) s += 0.15;
    if (p.average_rating) s += (p.average_rating / 5) * 0.15;
    return { p, s };
  }).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.p);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const OPENROUTER_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const body = await req.json();
    const messages: { role: string; content: string }[] = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content?.slice(0, 500) || "";
    if (!lastUser) throw new Error("No user message");

    // Optional personalization signal (the user's learned taste).
    const prefs = body.preferences;
    const prefLine = prefs && (prefs.vibes?.length || prefs.areas?.length)
      ? `\nThis user generally likes ${(prefs.vibes || []).join(", ") || "various"} vibes` +
        `${prefs.areas?.length ? ` around ${prefs.areas.join(", ")}` : ""}. Gently factor this in when relevant, but always prioritize their current request.`
      : "";

    // 1) Understand + 2) retrieve REAL places from our DB (this is the grounding).
    const intent = await understand(lastUser, OPENROUTER_API_KEY, OPENROUTER_MODEL);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let q = supabase.from("places").select("*").eq("is_active", true);
    if (intent.area) q = q.eq("area", intent.area);
    const { data: places } = await q;
    const picked = scoreAndPick(places || [], intent, 8);

    // 3) Generate a grounded reply — the LLM may ONLY use the places we provide (no hallucination).
    const placeContext = picked.map((p, i) => (
      `${i + 1}. ${p.name} — area: ${p.area}${p.locality ? `/${p.locality}` : ""}, vibe: ${p.primary_vibe}, ` +
      `noise: ${p.noise_level}, wifi: ${p.has_wifi}, work_friendly: ${p.is_work_friendly}, romantic: ${p.is_romantic}, ` +
      `price: ${p.price_range}, rating: ${p.average_rating || "n/a"}. ${p.address}`
    )).join("\n");

    const systemPrompt = `You are the friendly local guide for "Get Place Go", a Pune (India) place-discovery app.
STRICT RULE: Recommend ONLY places from the NUMBERED LIST below. These are real places from our database. NEVER invent or mention a place that is not in the list — if nothing fits well, say so honestly and suggest the user refine their request or try the "Search the wider web" button.
Be warm, concise, and practical. When you recommend places, refer to them by their exact name. Briefly say why each fits. Do not output JSON or a numbered dump — write like a helpful human.${prefLine}

REAL PLACES YOU MAY RECOMMEND:
${placeContext || "(none found in the database for this request)"}`;

    const reply = await callLLM(
      [{ role: "system", content: systemPrompt }, ...messages],
      OPENROUTER_API_KEY, OPENROUTER_MODEL, 0.6,
    );

    return new Response(
      JSON.stringify({ reply, places: picked, grounded: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("concierge error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Concierge error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
