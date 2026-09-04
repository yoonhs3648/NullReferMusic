import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

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

async function loadCapacity(
  client: SupabaseClient,
  rpcName: 'music_rpc_capacity_status' | 'vector_rpc_capacity_status',
): Promise<CapacityStatus> {
  const { data, error } = await client.rpc(rpcName);
  if (error) throw new Error(`${rpcName}_failed`);
  if (!isCapacityStatus(data)) throw new Error(`${rpcName}_invalid_response`);
  return data;
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

  const project1 = createClient(project1Url, project1ServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isAdmin, error: adminError } = await project1.rpc('nrm_is_admin_caller', {
    p_serial: callerSerial,
  });
  if (adminError) {
    console.error(JSON.stringify({ fn: 'music-admin-capacity', event: 'admin_check_failed' }));
    return jsonResponse({ error: 'admin_check_failed' }, 500);
  }
  if (isAdmin !== true) return jsonResponse({ error: 'forbidden' }, 403);

  const project2 = createClient(project2Origin, project2SecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const [project1Status, project2Status] = await Promise.all([
      loadCapacity(project1, 'music_rpc_capacity_status'),
      loadCapacity(project2, 'vector_rpc_capacity_status'),
    ]);
    return jsonResponse({
      projects: [project1Status, project2Status],
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        fn: 'music-admin-capacity',
        event: 'capacity_load_failed',
        code: error instanceof Error ? error.message : 'unknown',
      }),
    );
    return jsonResponse({ error: 'capacity_load_failed' }, 502);
  }
});
