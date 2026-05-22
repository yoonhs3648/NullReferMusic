import { nrmChartsLastfmNotConfiguredMessage } from '@/lib/nrmChartsStrings';

import { issueLastfmAccessToken } from '@/lib/nrmLastfmApiClient';

import {

  getLastfmCredentials,

  getManualLastfmAccessToken,

  getLastfmAccessTokenCache,

  persistClientCredentialsLastfmToken,

} from '@/lib/nrmLastfmApiSettings';



export type LastfmChartAuthHeaders = {

  headers: HeadersInit;

};



export async function issueLastfmAccessTokenFromCredentials(): Promise<

  | { ok: true; accessToken: string; expiresAt: number }

  | { ok: false; message: string }

> {

  const creds = await getLastfmCredentials();

  if (!creds?.clientId?.trim()) {
    return { ok: false, message: nrmChartsLastfmNotConfiguredMessage };
  }

  const issued = await issueLastfmAccessToken(creds);

  if (!issued.ok) {

    return { ok: false, message: issued.message };

  }

  const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;

  await persistClientCredentialsLastfmToken(issued.apiKey, 365 * 24 * 60 * 60);

  return { ok: true, accessToken: issued.apiKey, expiresAt };

}



export async function buildLastfmChartAuthHeaders(): Promise<

  LastfmChartAuthHeaders | { error: string }

> {

  const creds = await getLastfmCredentials();

  if (!creds?.clientId && !(await getManualLastfmAccessToken())) {

    return { error: nrmChartsLastfmNotConfiguredMessage };

  }



  const manual = await getManualLastfmAccessToken();

  if (manual) {

    return {

      headers: {

        Authorization: `Bearer ${manual}`,

        'X-NRM-Lastfm-Api-Key': manual,

      },

    };

  }



  const cache = await getLastfmAccessTokenCache();

  if (cache && cache.expiresAt > Date.now()) {

    return {

      headers: {

        Authorization: `Bearer ${cache.accessToken}`,

        'X-NRM-Lastfm-Api-Key': cache.accessToken,

      },

    };

  }



  if (creds?.clientId) {

    const apiKey = creds.clientId.trim();

    return {

      headers: {

        Authorization: `Bearer ${apiKey}`,

        'X-NRM-Lastfm-Api-Key': apiKey,

      },

    };

  }



  const issued = await issueLastfmAccessTokenFromCredentials();

  if (!issued.ok) {

    return { error: issued.message };

  }

  return {

    headers: {

      Authorization: `Bearer ${issued.accessToken}`,

      'X-NRM-Lastfm-Api-Key': issued.accessToken,

    },

  };

}



export async function refreshLastfmChartToken(): Promise<

  | { ok: true; headers: HeadersInit }

  | { ok: false; message: string }

> {

  const out = await issueLastfmAccessTokenFromCredentials();

  if (!out.ok) {

    return { ok: false, message: out.message };

  }

  return {

    ok: true,

    headers: {

      Authorization: `Bearer ${out.accessToken}`,

      'X-NRM-Lastfm-Api-Key': out.accessToken,

    },

  };

}

