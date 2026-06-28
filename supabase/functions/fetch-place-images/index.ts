// ============================================================================
// DEPRECATED / RETIRED — DO NOT DEPLOY.
// This function generated place "photos" with an LLM image model. Those images
// are hallucinated/fake representations of real establishments, which is
// misleading for a product users rely on. It has been retired in favor of REAL
// photos sourced from the Google Places API (see the `enrich-place` function /
// Phase B of the project plan). Kept in the repo for reference only.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function generateImage(placeName: string, address: string, apiKey: string): Promise<string | null> {
  try {
    const prompt = `A high quality photograph of "${placeName}" located at ${address}, Pune, India. Show the exterior or interior of this establishment. Realistic photography style, well-lit, inviting atmosphere. 4:3 aspect ratio.`;
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      console.error(`AI image gen failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const imageDataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    return imageDataUrl || null;
  } catch (err) {
    console.error(`Image generation error for ${placeName}:`, err);
    return null;
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { area, limit = 10 } = await req.json();

    // Get places without images
    let query = supabase
      .from("places")
      .select("id, name, address, area, slug")
      .is("cover_image_url", null)
      .eq("is_active", true)
      .limit(limit);

    if (area) query = query.eq("area", area);

    const { data: places, error: fetchError } = await query;
    if (fetchError) throw fetchError;
    if (!places?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No places need images", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating images for ${places.length} places`);
    let updated = 0;
    const errors: string[] = [];

    for (const place of places) {
      try {
        console.log(`Generating image for: ${place.name}`);
        const imageDataUrl = await generateImage(place.name, place.address, lovableApiKey);

        if (!imageDataUrl) {
          errors.push(`${place.name}: AI generation returned no image`);
          continue;
        }

        // Extract base64 data
        const base64Match = imageDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
        if (!base64Match) {
          errors.push(`${place.name}: Invalid image data format`);
          continue;
        }

        const imageType = base64Match[1];
        const base64Data = base64Match[2];
        const imageBytes = base64ToUint8Array(base64Data);
        const fileName = `${place.slug}.${imageType === 'jpeg' ? 'jpg' : imageType}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("place-images")
          .upload(fileName, imageBytes, {
            contentType: `image/${imageType}`,
            upsert: true,
          });

        if (uploadError) {
          errors.push(`${place.name}: Upload failed - ${uploadError.message}`);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("place-images")
          .getPublicUrl(fileName);

        // Update place record
        const { error: updateError } = await supabase
          .from("places")
          .update({ cover_image_url: urlData.publicUrl })
          .eq("id", place.id);

        if (updateError) {
          errors.push(`${place.name}: DB update failed - ${updateError.message}`);
        } else {
          updated++;
          console.log(`✓ ${place.name} - image saved`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${place.name}: ${msg}`);
      }
    }

    console.log(`Done: ${updated}/${places.length} images generated`);

    return new Response(
      JSON.stringify({ success: true, total: places.length, updated, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-place-images error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
