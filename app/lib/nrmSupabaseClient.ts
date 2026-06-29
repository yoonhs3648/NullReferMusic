import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  NRM_SUPABASE_PUBLISHABLE_KEY,
  NRM_SUPABASE_URL,
} from '@/lib/nrmSupabaseConfig';

let client: SupabaseClient | null = null;

export function getNrmSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(NRM_SUPABASE_URL, NRM_SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
