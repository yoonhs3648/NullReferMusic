import { runWorker } from "./worker.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let different = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    different |= (a[index % Math.max(a.length, 1)] ?? 0) ^
      (b[index % Math.max(b.length, 1)] ?? 0);
  }
  return different === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const cronToken = Deno.env.get("MUSICBRAINZ_CRON_TOKEN") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  if (!cronToken || !constantTimeEqual(authorization, `Bearer ${cronToken}`)) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return json({ error: "invalid_payload" }, 400);
  }
  const body = payload as Record<string, unknown>;
  const allowed = new Set(["scheduled_at", "mode"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return json({ error: "unknown_payload_key" }, 400);
  }
  if (typeof body.scheduled_at !== "string" || !Number.isFinite(Date.parse(body.scheduled_at))) {
    return json({ error: "invalid_scheduled_at" }, 400);
  }
  const mode = body.mode == null ? "sync" : body.mode;
  if (mode !== "sync" && mode !== "retention") return json({ error: "invalid_mode" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userAgent = Deno.env.get("MUSICBRAINZ_USER_AGENT");
  const lastfmApiKey = Deno.env.get("LASTFM_API_KEY") ?? undefined;
  if (!supabaseUrl || !serviceRoleKey || !userAgent) {
    return json({ error: "server_misconfigured" }, 500);
  }
  try {
    return json(await runWorker({
      supabaseUrl,
      serviceRoleKey,
      userAgent,
      lastfmApiKey,
    }, mode));
  } catch (error) {
    console.error(JSON.stringify({
      fn: "musicbrainz-sync",
      event: "worker_failed",
      message: error instanceof Error ? error.message.slice(0, 900) : "unknown",
    }));
    return json({ error: "worker_failed" }, 500);
  }
});
