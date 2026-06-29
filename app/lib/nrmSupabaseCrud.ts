import type { SupabaseClient } from '@supabase/supabase-js';

import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { getNrmSupabase } from '@/lib/nrmSupabaseClient';
import { throwSupabaseError } from '@/lib/nrmSupabaseRows';

type CrudOp = 'select' | 'insert' | 'update' | 'upsert' | 'storage_upload';

function logCrudStart(op: CrudOp, table: string, detail?: Record<string, unknown>): void {
  logNrmDev('supabase.crud', { phase: 'start', op, table, ...detail });
}

function logCrudOk(op: CrudOp, table: string, detail?: Record<string, unknown>): void {
  logNrmDev('supabase.crud', { phase: 'ok', op, table, ...detail });
}

function logCrudError(
  op: CrudOp,
  table: string,
  error: unknown,
  detail?: Record<string, unknown>,
): void {
  logNrmRunError('supabase.crud', error, { phase: 'error', op, table, ...detail });
}

type SbResult<T> = { data: T | null; error: { message: string } | null };

export async function nrmSbSelect<T>(
  table: string,
  run: (q: ReturnType<SupabaseClient['from']>) => unknown,
): Promise<T[]> {
  logCrudStart('select', table);
  try {
    const { data, error } = (await run(getNrmSupabase().from(table))) as SbResult<T[]>;
    throwSupabaseError(error, `${table} select`);
    const rows = (Array.isArray(data) ? data : []) as T[];
    logCrudOk('select', table, { rowCount: rows.length });
    return rows;
  } catch (e) {
    logCrudError('select', table, e);
    throw e;
  }
}

export async function nrmSbMaybeSingle<T>(
  table: string,
  run: (q: ReturnType<SupabaseClient['from']>) => unknown,
): Promise<T | null> {
  logCrudStart('select', table, { single: 'maybe' });
  try {
    const { data, error } = (await run(getNrmSupabase().from(table))) as SbResult<T>;
    throwSupabaseError(error, `${table} select`);
    logCrudOk('select', table, { single: 'maybe', found: data != null });
    return (data as T | null) ?? null;
  } catch (e) {
    logCrudError('select', table, e, { single: 'maybe' });
    throw e;
  }
}

export async function nrmSbRpc<T>(
  fn: string,
  params: Record<string, unknown>,
): Promise<T> {
  logCrudStart('insert', `rpc:${fn}`, { keys: Object.keys(params) });
  try {
    const { data, error } = await getNrmSupabase().rpc(fn, params);
    throwSupabaseError(error, `rpc ${fn}`);
    logCrudOk('insert', `rpc:${fn}`);
    return data as T;
  } catch (e) {
    logCrudError('insert', `rpc:${fn}`, e);
    throw e;
  }
}

export async function nrmSbInsert<T>(
  table: string,
  row: Record<string, unknown>,
  select = '*',
): Promise<T> {
  logCrudStart('insert', table, { keys: Object.keys(row) });
  try {
    const { data, error } = await getNrmSupabase()
      .from(table)
      .insert(row)
      .select(select)
      .single();
    throwSupabaseError(error, `${table} insert`);
    logCrudOk('insert', table, { id: (data as { id?: number })?.id });
    return data as T;
  } catch (e) {
    logCrudError('insert', table, e);
    throw e;
  }
}

export async function nrmSbUpdate(
  table: string,
  patch: Record<string, unknown>,
  match: Record<string, string | number>,
  options?: { select?: string; requireRow?: boolean },
): Promise<void> {
  logCrudStart('update', table, { patchKeys: Object.keys(patch), match });
  try {
    let q = getNrmSupabase().from(table).update(patch);
    for (const [k, v] of Object.entries(match)) {
      q = q.eq(k, v);
    }
    if (options?.select) {
      const { data, error } = await q.select(options.select).maybeSingle();
      throwSupabaseError(error, `${table} update`);
      if (options.requireRow && !data) {
        throw new Error(`${table} update: row not found`);
      }
      logCrudOk('update', table, { found: data != null });
      return;
    }
    const { error } = await q;
    throwSupabaseError(error, `${table} update`);
    logCrudOk('update', table);
  } catch (e) {
    logCrudError('update', table, e);
    throw e;
  }
}

export async function nrmSbStorageUpload(
  bucket: string,
  path: string,
  body: Uint8Array,
  options?: { contentType?: string; upsert?: boolean },
): Promise<void> {
  logCrudStart('storage_upload', bucket, { path, bytes: body.length });
  try {
    const { error } = await getNrmSupabase()
      .storage
      .from(bucket)
      .upload(path, body, {
        upsert: options?.upsert ?? false,
        contentType: options?.contentType ?? 'application/octet-stream',
      });
    throwSupabaseError(error, `${bucket}/${path} upload`);
    logCrudOk('storage_upload', bucket, { path });
  } catch (e) {
    logCrudError('storage_upload', bucket, e, { path });
    throw e;
  }
}
