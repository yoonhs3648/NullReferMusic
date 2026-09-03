import { applyNrmLoggedInIdentity } from '@/lib/nrmBrandIdentity';
import {
  clearNrmOAuthPendingProfile,
  loadNrmAuthSession,
  loadNrmOAuthPendingProfile,
  saveNrmAuthSession,
  type NrmAuthSession,
} from '@/lib/nrmAuthSession';
import { getNrmAppVersion } from '@/lib/nrmAppInfo';
import { clearNrmAppSerialCache } from '@/lib/nrmAppSerialNo';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { nrmSbRpc } from '@/lib/nrmSupabaseCrud';

type RegisterRpcRow = {
  id: number;
  serial_no: string;
  user_name: string;
  user_email: string;
  app_kind: string;
  is_admin: string;
  version: string;
};

export async function registerNrmOAuthUserIfNeeded(): Promise<NrmAuthSession> {
  const existing = await loadNrmAuthSession();
  const pending = await loadNrmOAuthPendingProfile();
  const profile = pending ?? (existing
    ? {
        appKind: existing.appKind,
        userName: existing.userName,
        userEmail: existing.userEmail,
      }
    : null);
  if (!profile) {
    throw new Error('로그인 정보가 없습니다. 다시 로그인해 주세요.');
  }

  try {
    logNrmDev('oauth.register.start', {
      provider: profile.appKind,
      hasExistingSession: !!existing,
    });
    const row = await nrmSbRpc<RegisterRpcRow | null>('nrm_rpc_register_oauth_user', {
      p_app_kind: profile.appKind,
      p_user_name: profile.userName,
      p_user_email: profile.userEmail,
      p_version: getNrmAppVersion(),
    });
    if (!row) {
      throw new Error('사용자 등록에 실패했습니다.');
    }

    const session: NrmAuthSession = {
      serialNo: String(row.serial_no ?? '').trim(),
      userName: String(row.user_name ?? profile.userName).trim(),
      userEmail: String(row.user_email ?? profile.userEmail).trim(),
      appKind: row.app_kind === 'kakao' ? 'kakao' : 'google',
      isAdmin: String(row.is_admin ?? '').trim().toLowerCase() === 'y',
    };
    if (!session.serialNo) {
      throw new Error('사용자 등록에 실패했습니다.');
    }

    await saveNrmAuthSession(session);
    await clearNrmOAuthPendingProfile();
    clearNrmAppSerialCache();
    await applyNrmLoggedInIdentity(session.serialNo, session.userName);
    logNrmDev('oauth.register.success', {
      provider: session.appKind,
      isAdmin: session.isAdmin,
    });
    return session;
  } catch (e) {
    logNrmRunError('oauth.register.failed', e, {
      provider: profile.appKind,
      hasExistingSession: !!existing,
    });
    if (existing?.serialNo) {
      await applyNrmLoggedInIdentity(existing.serialNo, existing.userName);
      return existing;
    }
    throw e;
  }
}
