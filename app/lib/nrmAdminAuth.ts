import { sha256HexUtf8 } from '@/lib/nrmSha256';
import { grantAdminSession } from '@/lib/nrmAdminSession';
import { notifyUser, promptUser } from '@/lib/nrmUserNotify';

/** Search 탭 히든 트리거 — 유튜브 검색으로 전달하지 않음 */
export const NRM_ADMIN_SEARCH_TRIGGER = '신월동흰수염';

/** SHA-256("건실한청년윤현상") — 평문 비밀번호는 코드에 두지 않음 */
const ADMIN_PASSWORD_SHA256 = '120a031b94cf326068bbb23f8f337fa1dd7e4189bcdc799a32978a5ec956f487';

export function isAdminSearchTrigger(query: string): boolean {
  return query.trim() === NRM_ADMIN_SEARCH_TRIGGER;
}

export async function verifyAdminPassword(input: string): Promise<boolean> {
  const hash = await sha256HexUtf8(input);
  return hash === ADMIN_PASSWORD_SHA256;
}

/** 비밀번호 입력 → 성공/실패 알림. 취소 시 `cancelled`. */
export async function runAdminAuthFlow(): Promise<'success' | 'fail' | 'cancelled'> {
  const password = await promptUser('관리자 비밀번호를 입력하세요.', {
    confirmLabel: '확인',
    cancelLabel: '취소',
  });
  if (password === null) return 'cancelled';
  const ok = await verifyAdminPassword(password);
  if (ok) {
    await grantAdminSession();
    await notifyUser('관리자 인증완료');
    return 'success';
  }
  await notifyUser('관리자 인증에 실패했습니다.');
  return 'fail';
}
