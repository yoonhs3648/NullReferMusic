import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260904162000_ailab_chat_retention_llm_logs.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(sql.includes('delete from public."LLMCallAttemptLog"'), "missing LLMCallAttemptLog delete");
assert(sql.includes('delete from public."LLMTokenHistory"'), "missing LLMTokenHistory delete");
assert(sql.includes('l."RegDate" < v_cutoff'), "attempt log must use RegDate cutoff");
assert(sql.includes('th."RegDate" < v_cutoff'), "token history must use RegDate cutoff");
assert(sql.includes('delete from public."ChatMessage"'), "chat message delete must remain");
assert(sql.includes('delete from public."ChatSession"'), "chat session delete must remain");
assert(sql.includes("deleted_attempt_logs") && sql.includes("deleted_token_history"), "result counters missing");

console.log("ailab chat retention llm logs contract checks passed");
