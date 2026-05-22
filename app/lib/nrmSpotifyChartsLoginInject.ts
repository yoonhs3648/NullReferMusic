/**
 * charts.spotify.com / open.spotify.com — Bearer 토큰 수집 inject 스크립트
 *
 * 캡처 전략(다중):
 *  1) `injectedJavaScriptBeforeContentLoaded`로 페이지 JS보다 먼저 설치되는 fetch/XHR 후킹
 *     → Spotify SPA가 charts-spotify-com-service / api/token 등에 보내는 Authorization 헤더 가로채기
 *  2) `get_access_token`(open.spotify.com) 응답 본문을 가로채 accessToken 추출
 *  3) 최후의 폴백: page가 `open.spotify.com/get_access_token` JSON일 때 body 텍스트를 파싱
 */

const NRM_CHARTS_BEARER_HOOK_BODY = `
  if (window.__nrmChartsBearerHook) return;
  window.__nrmChartsBearerHook = true;

  function sendBearer(rawToken) {
    if (!rawToken) return;
    var t = String(rawToken).replace(/^Bearer\\s+/i, '').trim();
    if (!t || t.length < 20) return;
    if (window.__nrmLastBearerSent === t) return;
    window.__nrmLastBearerSent = t;
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'charts_bearer', bearerToken: t }));
      }
    } catch (e) {}
  }

  function authFromAny(headers) {
    if (!headers) return null;
    try {
      if (typeof headers.get === 'function') {
        return headers.get('Authorization') || headers.get('authorization');
      }
    } catch (e) {}
    if (typeof headers === 'object') {
      return headers.Authorization || headers.authorization || null;
    }
    return null;
  }

  function isSpotifyApiUrl(url) {
    if (!url) return false;
    return (
      url.indexOf('charts-spotify-com-service') >= 0 ||
      url.indexOf('api-partner.spotify.com') >= 0 ||
      url.indexOf('spclient.wg.spotify.com') >= 0 ||
      url.indexOf('api.spotify.com') >= 0
    );
  }

  function isTokenUrl(url) {
    if (!url) return false;
    return url.indexOf('get_access_token') >= 0 || url.indexOf('/api/token') >= 0;
  }

  function tryHookFetch() {
    if (!window.fetch || window.__nrmFetchHooked) return;
    window.__nrmFetchHooked = true;
    var origFetch = window.fetch;
    window.fetch = function(input, init) {
      var url = '';
      try {
        if (typeof input === 'string') url = input;
        else if (input && typeof input.url === 'string') url = input.url;
      } catch (e) {}

      try {
        if (isSpotifyApiUrl(url)) {
          sendBearer(authFromAny(init && init.headers));
          if (input && typeof input === 'object' && input.headers) {
            sendBearer(authFromAny(input.headers));
          }
        }
      } catch (e) {}

      var p = origFetch.apply(this, arguments);
      try {
        if (isTokenUrl(url)) {
          p.then(function(res) {
            try {
              res.clone().json().then(function(data) {
                if (data && data.accessToken && data.isAnonymous !== true) {
                  sendBearer(data.accessToken);
                }
              }).catch(function() {});
            } catch (e) {}
            return res;
          }).catch(function() {});
        }
      } catch (e) {}
      return p;
    };
  }

  function tryHookXhr() {
    if (!window.XMLHttpRequest || window.__nrmXhrHooked) return;
    window.__nrmXhrHooked = true;
    var xhrOpen = XMLHttpRequest.prototype.open;
    var xhrSet = XMLHttpRequest.prototype.setRequestHeader;
    var xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this.__nrmUrl = url || '';
      this.__nrmHeaders = {};
      return xhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
      try { if (this.__nrmHeaders) this.__nrmHeaders[name] = value; } catch (e) {}
      return xhrSet.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
      var url = this.__nrmUrl || '';
      try {
        if (isSpotifyApiUrl(url) && this.__nrmHeaders) {
          sendBearer(this.__nrmHeaders.Authorization || this.__nrmHeaders.authorization);
        }
      } catch (e) {}
      if (isTokenUrl(url)) {
        var self = this;
        var origLoad = self.onload;
        self.addEventListener && self.addEventListener('load', function() {
          try {
            var txt = self.responseText || '';
            if (txt && txt.indexOf('accessToken') >= 0) {
              var data = JSON.parse(txt);
              if (data && data.accessToken && data.isAnonymous !== true) {
                sendBearer(data.accessToken);
              }
            }
          } catch (e) {}
        });
      }
      return xhrSend.apply(this, arguments);
    };
  }

  tryHookFetch();
  tryHookXhr();
`;

/** 페이지 로드 전에 fetch/XHR 후킹 설치 (가장 핵심) */
export const NRM_SPOTIFY_CHARTS_HARVEST_BEFORE_JS = `
(function() {
  ${NRM_CHARTS_BEARER_HOOK_BODY}
})();
true;
`;

/** 페이지 로드 후 — 후킹 재확인 + open.spotify.com 토큰 엔드포인트 직접 호출 */
export const NRM_SPOTIFY_CHARTS_HARVEST_JS = `
(function() {
  ${NRM_CHARTS_BEARER_HOOK_BODY}
  function pokeTokenEndpoint() {
    try {
      fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
        credentials: 'include',
        headers: { Accept: 'application/json' }
      }).then(function(r) { return r.text(); }).then(function(txt) {
        try {
          var data = JSON.parse(txt);
          if (data && data.accessToken && data.isAnonymous !== true) {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'charts_bearer', bearerToken: data.accessToken }));
            }
          }
        } catch (e) {}
      }).catch(function() {});
    } catch (e) {}
  }
  pokeTokenEndpoint();
  if (window.__nrmTokenPokeInterval) clearInterval(window.__nrmTokenPokeInterval);
  window.__nrmTokenPokeInterval = setInterval(pokeTokenEndpoint, 1500);
})();
true;
`;

/** open.spotify.com/get_access_token JSON 페이지 자체에서 토큰 추출 (폴백) */
export const NRM_SPOTIFY_TOKEN_PAGE_HARVEST_JS = `
(function() {
  try {
    var body = (document.body && document.body.innerText) || '';
    if (body && body.indexOf('accessToken') >= 0) {
      var data = JSON.parse(body);
      if (data && data.accessToken && data.isAnonymous !== true) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'charts_bearer', bearerToken: data.accessToken }));
        }
      }
    }
  } catch (e) {}
})();
true;
`;

/** 로그인 직후 inject — 후킹 재확인 + 토큰 엔드포인트 직접 호출 (1회) */
export const NRM_SPOTIFY_CHARTS_HARVEST_BURST_JS = `
(function() {
  ${NRM_CHARTS_BEARER_HOOK_BODY}
  try {
    fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    }).then(function(r) { return r.text(); }).then(function(txt) {
      try {
        var data = JSON.parse(txt);
        if (data && data.accessToken && data.isAnonymous !== true) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'charts_bearer', bearerToken: data.accessToken }));
          }
        }
      } catch (e) {}
    }).catch(function() {});
  } catch (e) {}
})();
true;
`;
