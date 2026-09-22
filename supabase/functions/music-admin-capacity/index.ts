const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROJECT_2_REF = 'eyzutsvsqxsxhjgydgoz';
const PROJECT_2_ORIGIN = `https://${PROJECT_2_REF}.supabase.co`;

type CapacityStatus = {
  project_ref: string;
  project_label: string;
  database_bytes: number;
  hard_limit_bytes: number;
  usage_ratio: number;
  capacity_state: 'normal' | 'warning' | 'discovery_disabled' | 'write_stopped';
  thresholds: {
    warning_bytes: number;
    disable_discovery_bytes: number;
    write_stop_bytes: number;
  };
  relations: {
    schema_name: string;
    relation_name: string;
    total_bytes: number;
    table_bytes: number;
    index_bytes: number;
  }[];
  captured_at: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function isCapacityStatus(value: unknown): value is CapacityStatus {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const thresholds = row.thresholds as Record<string, unknown> | null;
  return (
    typeof row.project_ref === 'string' &&
    typeof row.project_label === 'string' &&
    Number.isFinite(Number(row.database_bytes)) &&
    Number.isFinite(Number(row.hard_limit_bytes)) &&
    Number.isFinite(Number(row.usage_ratio)) &&
    typeof row.capacity_state === 'string' &&
    !!thresholds &&
    Number.isFinite(Number(thresholds.warning_bytes)) &&
    Number.isFinite(Number(thresholds.disable_discovery_bytes)) &&
    Number.isFinite(Number(thresholds.write_stop_bytes)) &&
    Array.isArray(row.relations) &&
    typeof row.captured_at === 'string'
  );
}

function sanitizeDetail(value: string): string {
  return value
    .replace(/sb_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 180);
}

/**
 * `sb_secret_` / `sb_publishable_` keys are not JWTs. Some projects reject them
 * on `Authorization: Bearer` and only accept `apikey`. Legacy JWT keys need both.
 * Try the format that matches the key, then the other format on 401.
 */
function serviceHeaders(apiKey: string, forceBearer: boolean): Headers {
  const headers = new Headers();
  headers.set('apikey', apiKey);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  const sendBearer = forceBearer || !apiKey.startsWith('sb_');
  if (sendBearer) headers.set('Authorization', `Bearer ${apiKey}`);
  return headers;
}

async function callRpcOnce(
  url: string,
  apiKey: string,
  name: string,
  body: Record<string, unknown>,
  forceBearer: boolean,
): Promise<{ data: unknown } | { status: number; detail: string }> {
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(apiKey, forceBearer),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { message?: unknown; code?: unknown };
      detail = String(parsed.message ?? parsed.code ?? text);
    } catch {
      detail = text;
    }
    return { status: response.status, detail: sanitizeDetail(detail) };
  }
  try {
    return { data: text ? JSON.parse(text) : null };
  } catch {
    return { status: response.status, detail: 'invalid_json' };
  }
}

async function callRpc(
  url: string,
  apiKey: string,
  name: string,
  body: Record<string, unknown>,
): Promise<{ data: unknown } | { status: number; detail: string }> {
  const preferBearer = !apiKey.startsWith('sb_');
  const first = await callRpcOnce(url, apiKey, name, body, preferBearer);
  if (!('detail' in first) || first.status !== 401) return first;
  return callRpcOnce(url, apiKey, name, body, !preferBearer);
}

async function loadCapacity(
  url: string,
  apiKey: string,
  rpcName: 'music_rpc_capacity_status' | 'vector_rpc_capacity_status',
): Promise<CapacityStatus> {
  const result = await callRpc(url, apiKey, rpcName, {});
  if ('detail' in result) {
    throw new Error(`${rpcName}_failed:${result.status}:${result.detail}`);
  }
  if (!isCapacityStatus(result.data)) throw new Error(`${rpcName}_invalid_response`);
  return result.data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const callerSerial = String(body.callerSerial ?? '').trim();
  if (!callerSerial || callerSerial.length > 128) {
    return jsonResponse({ error: 'invalid_caller' }, 400);
  }

  const project1Url = Deno.env.get('SUPABASE_URL')?.trim();
  const project1ServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const project2Url = Deno.env.get('MUSIC_VECTOR_SUPABASE_URL')?.trim();
  const project2SecretKey = Deno.env.get('MUSIC_VECTOR_SUPABASE_SECRET_KEY')?.trim();
  if (!project1Url || !project1ServiceKey || !project2Url || !project2SecretKey) {
    console.error(JSON.stringify({ fn: 'music-admin-capacity', event: 'missing_server_secret' }));
    return jsonResponse({ error: 'server_misconfigured' }, 500);
  }

  let project2Origin: string;
  try {
    project2Origin = new URL(project2Url).origin;
  } catch {
    return jsonResponse({ error: 'server_misconfigured' }, 500);
  }
  if (project2Origin !== PROJECT_2_ORIGIN) {
    console.error(JSON.stringify({ fn: 'music-admin-capacity', event: 'invalid_project2_origin' }));
    return jsonResponse({ error: 'server_misconfigured' }, 500);
  }

  const adminResult = await callRpc(project1Url, project1ServiceKey, 'nrm_is_admin_caller', {
    p_serial: callerSerial,
  });
  if ('detail' in adminResult) {
    console.error(JSON.stringify({
      fn: 'music-admin-capacity',
      event: 'admin_check_failed',
      status: adminResult.status,
      detail: adminResult.detail,
    }));
    return jsonResponse({ error: 'admin_check_failed' }, 500);
  }
  if (adminResult.data !== true) return jsonResponse({ error: 'forbidden' }, 403);

  try {
    const [project1Status, project2Status] = await Promise.all([
      loadCapacity(project1Url, project1ServiceKey, 'music_rpc_capacity_status'),
      loadCapacity(project2Origin, project2SecretKey, 'vector_rpc_capacity_status'),
    ]);
    return jsonResponse({
      projects: [project1Status, project2Status],
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    const detail = sanitizeDetail(error instanceof Error ? error.message : 'unknown');
    console.error(JSON.stringify({
      fn: 'music-admin-capacity',
      event: 'capacity_load_failed',
      detail,
    }));
    return jsonResponse({ error: 'capacity_load_failed', detail }, 502);
  }
});
