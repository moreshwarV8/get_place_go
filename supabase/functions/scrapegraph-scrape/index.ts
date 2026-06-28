import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SCRAPEGRAPH_BASE = "https://api.scrapegraphai.com/v1";

const SmartScrapeSchema = z.object({
  website_url: z.string().url(),
  user_prompt: z.string().min(1).max(1000),
  output_schema: z.record(z.any()).optional(),
  total_pages: z.number().int().min(1).max(100).optional(),
  number_of_scrolls: z.number().int().min(0).max(50).optional(),
});

const SearchScrapeSchema = z.object({
  user_prompt: z.string().min(1).max(1000),
  output_schema: z.record(z.any()).optional(),
});

const RequestSchema = z.object({
  action: z.enum(["smartscraper", "searchscraper", "markdownify"]),
  params: z.record(z.any()),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = await requireAdmin(req, corsHeaders);
  if (denied) return denied;

  try {
    const apiKey = Deno.env.get("SCRAPEGRAPH_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "SCRAPEGRAPH_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawBody = await req.json();
    const { action, params } = RequestSchema.parse(rawBody);

    // Validate params based on action
    if (action === "smartscraper") {
      SmartScrapeSchema.parse(params);
    } else if (action === "searchscraper") {
      SearchScrapeSchema.parse(params);
    }

    console.log(`ScrapeGraph ${action}:`, JSON.stringify(params).slice(0, 200));

    const response = await fetch(`${SCRAPEGRAPH_BASE}/${action}`, {
      method: "POST",
      headers: {
        "SGAI-APIKEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`ScrapeGraph API error [${response.status}]:`, data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SmartScraper returns a request_id for async processing — check status
    if (data.request_id && data.status === "queued") {
      // Poll for result (up to 60s)
      const requestId = data.request_id;
      let result = data;
      const maxAttempts = 12;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 5000));

        const statusRes = await fetch(
          `${SCRAPEGRAPH_BASE}/${action}/${requestId}`,
          {
            headers: { "SGAI-APIKEY": apiKey },
          }
        );
        result = await statusRes.json();

        if (result.status === "completed" || result.status === "failed") {
          break;
        }
      }

      return new Response(
        JSON.stringify({ success: result.status === "completed", data: result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ScrapeGraph error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
