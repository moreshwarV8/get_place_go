// Shared caller-identity helpers for admin-gated edge functions.
// Used by import-places / scrape-places / scrapegraph-scrape (admin-only) and
// enrich-place (admin for bulk backfill, any signed-in user for targeted enrich).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Cors = Record<string, string>;

function deny(status: number, error: string, corsHeaders: Cors): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Resolve the caller from the request's JWT and whether they hold the admin role.
async function getCaller(req: Request): Promise<{ userId: string | null; isAdmin: boolean }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { userId: null, isAdmin: false };

  const token = authHeader.replace("Bearer ", "");
  // Service-role client: validates the token and can call has_role() regardless of RLS.
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return { userId: null, isAdmin: false };

  const { data: isAdmin } = await client.rpc("has_role", { _user_id: user.id, _role: "admin" });
  return { userId: user.id, isAdmin: !!isAdmin };
}

// Returns a Response to short-circuit with if the caller is NOT an admin; otherwise null.
export async function requireAdmin(req: Request, corsHeaders: Cors): Promise<Response | null> {
  const { userId, isAdmin } = await getCaller(req);
  if (!userId) return deny(401, "Unauthorized — please sign in.", corsHeaders);
  if (!isAdmin) return deny(403, "Forbidden — admin access only.", corsHeaders);
  return null;
}

// Returns a Response to short-circuit with if the caller is NOT signed in; otherwise null.
export async function requireAuth(req: Request, corsHeaders: Cors): Promise<Response | null> {
  const { userId } = await getCaller(req);
  if (!userId) return deny(401, "Unauthorized — please sign in.", corsHeaders);
  return null;
}
