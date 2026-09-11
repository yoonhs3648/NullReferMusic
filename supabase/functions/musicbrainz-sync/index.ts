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

function edgeLog(event: string, detail: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    fn: "musicbrainz-sync",
    ts: new Date().toISOString(),
    event,
    ...detail,
  }));
}

Deno.serve(async (request) => {
  const started = Date.now();
  edgeLog("http_received", {
    method: request.method,
    has_authorization: Boolean(request.headers.get("authorization")),
  });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const cronToken = Deno.env.get("MUSICBRAINZ_CRON_TOKEN") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  if (!cronToken || !constantTimeEqual(authorization, `Bearer ${cronToken}`)) {
    edgeLog("http_unauthorized", {
      has_cron_token: Boolean(cronToken),
      has_authorization: Boolean(authorization),
    });
    return json({ error: "unauthorized" }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    edgeLog("http_invalid_json", { level: "error" });
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
  edgeLog("http_authorized", {
    mode,
    scheduled_at: body.scheduled_at,
    has_supabase_url: Boolean(supabaseUrl),
    has_service_role: Boolean(serviceRoleKey),
    has_user_agent: Boolean(userAgent),
    has_lastfm_key: Boolean(lastfmApiKey),
  });
  if (!supabaseUrl || !serviceRoleKey || !userAgent) {
    edgeLog("http_misconfigured", {
      level: "error",
      missing: [
        supabaseUrl ? null : "SUPABASE_URL",
        serviceRoleKey ? null : "SUPABASE_SERVICE_ROLE_KEY",
        userAgent ? null : "MUSICBRAINZ_USER_AGENT",
      ].filter(Boolean),
    });
    return json({ error: "server_misconfigured" }, 500);
  }
  try {
    const result = await runWorker({
      supabaseUrl,
      serviceRoleKey,
      userAgent,
      lastfmApiKey,
      lastfmUserAgent: "NullReferMusic/lastfm-sync",
    }, mode);
    edgeLog("http_ok", { ...result, elapsed_ms: Date.now() - started });
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 900) : "unknown";
    edgeLog("worker_failed", {
      level: "error",
      message,
      elapsed_ms: Date.now() - started,
    });
    return json({ error: "worker_failed", message }, 500);
  }
});
