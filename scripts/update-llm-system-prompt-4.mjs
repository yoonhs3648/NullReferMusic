/**
 * PromptID=4 시스템 프롬프트 Content 갱신 (원격 Supabase).
 * 필요: NRM_SUPABASE_SERVICE_ROLE_KEY
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'package.json'));
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bwkiaapffroyveqqjhom.supabase.co';
const CONTENT =
  '음악 다운로드, 삭제, 가사생성, 가사삭제, 가사번역, 오디오파일의 메타데이터 추가 및 편집과 같은 요청은, ' +
  '이번 요청에 Tool이 제공된 경우에만 해당 Tool을 사용하세요.\n' +
  '\n' +
  'Tool이 없으면 직접 수행했다고 말하지 말고, 앱에서 해당 기능(다운로드/가사/메타데이터)을 쓰도록 안내하세요.\n' +
  '\n' +
  '직접 다운로드·삭제·가사 작업을 했다고 거짓말하지 마세요.';

async function main() {
  const key = process.env.NRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    console.error('NRM_SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
    process.exit(1);
  }
  const sb = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: before, error: readErr } = await sb
    .from('LLMSystemPrompt')
    .select('PromptID,Title,SortOrder')
    .or('PromptID.eq.4,Title.eq.앱 기능 안내 및 도구 호출');
  if (readErr) {
    console.error('read failed', readErr.message);
    process.exit(1);
  }
  console.log(
    'before',
    (before ?? []).map((r) => ({
      PromptID: r.PromptID,
      Title: r.Title,
      SortOrder: r.SortOrder,
    })),
  );

  const { data, error } = await sb
    .from('LLMSystemPrompt')
    .update({
      Content: CONTENT,
      UpdateDate: new Date().toISOString(),
      UpdatedBySerialNo: 'admin',
    })
    .eq('PromptID', 4)
    .select('PromptID,Title,SortOrder,Content,UpdateDate');

  if (error) {
    console.error('update by PromptID failed', error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    const { data: data2, error: error2 } = await sb
      .from('LLMSystemPrompt')
      .update({
        Content: CONTENT,
        UpdateDate: new Date().toISOString(),
        UpdatedBySerialNo: 'admin',
      })
      .eq('Title', '앱 기능 안내 및 도구 호출')
      .select('PromptID,Title,SortOrder,Content,UpdateDate');
    if (error2) {
      console.error('update by Title failed', error2.message);
      process.exit(1);
    }
    console.log('updated by Title PromptID=', data2?.[0]?.PromptID);
    console.log('contentPreview=', String(data2?.[0]?.Content ?? '').slice(0, 120));
    return;
  }
  console.log('updated PromptID=', data[0]?.PromptID, 'Title=', data[0]?.Title);
  console.log('contentPreview=', String(data[0]?.Content ?? '').slice(0, 120));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
