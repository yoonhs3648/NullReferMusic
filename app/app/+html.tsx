import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#0066cc" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap"
          rel="stylesheet"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const globalCss = `
html, body, #root {
  height: 100%;
}
body {
  margin: 0;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background-color: #272729;
}
@media (prefers-color-scheme: light) {
  body {
    background-color: #f5f5f7;
  }
}

/* 메뉴 드로어 등 — 웹만 얇은 스크롤바 (모바일은 NrmMenuDrawerScroll에서 인디케이터 off) */
.nrm-scroll-web {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
}
.nrm-scroll-web::-webkit-scrollbar {
  width: 6px;
}
.nrm-scroll-web::-webkit-scrollbar-track {
  background: transparent;
}
.nrm-scroll-web::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.nrm-scroll-web::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.34);
}
@media (prefers-color-scheme: light) {
  .nrm-scroll-web {
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  }
  .nrm-scroll-web::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.16);
  }
  .nrm-scroll-web::-webkit-scrollbar-thumb:hover {
    background-color: rgba(0, 0, 0, 0.26);
  }
}

/* 기간별 차트 — 네이티브 select 펼침 목록 (인라인 option 스타일만으로는 브라우저마다 안 먹는 경우 있음) */
.nrm-period-select option {
  background-color: #1c1c1e;
  color: #f5f5f7;
}
@media (prefers-color-scheme: light) {
  .nrm-period-select option {
    background-color: #ffffff;
    color: #111111;
  }
}
`;
