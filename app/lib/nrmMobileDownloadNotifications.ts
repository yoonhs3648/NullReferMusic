/**
 * Metro가 `.native` / `.web`를 우선하므로 런타임에는 해당 파일이 쓰인다.
 * TypeScript·IDE용 폴백으로 웹 구현을 가리킨다.
 */
export * from './nrmMobileDownloadNotifications.web';
