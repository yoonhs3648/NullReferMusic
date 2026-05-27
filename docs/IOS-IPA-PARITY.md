# iOS IPA ↔ Android APK 동작 정합

릴리스 **IPA**는 **APK**와 동일한 사용자 기능을 목표로 한다.  
**Expo Go·웹·기존 APK** 동작은 변경하지 않으며, iOS standalone 전용 분기는 `isStandaloneIos()` / `Platform.OS`로 격리한다.

## 빌드 전 준비

1. `cd app && npm install` — 로컬 모듈 `nrm-audio-metadata` 링크
2. `npx expo prebuild --platform ios` — iOS 네이티브 프로젝트 생성·모듈 링크
3. EAS 또는 Xcode로 IPA 빌드 (`docs/RELEASE-APK-IPA-RULE.md` 참고)

## 기능별 parity

| 기능 | Android APK | iOS IPA | Expo Go / 웹 |
|------|-------------|---------|----------------|
| YouTube 검색 | Innertube (기기) | 동일 | PC 백엔드 또는 Innertube(Expo Go) |
| YouTube 다운로드 | yt-dlp (Chaquopy) | youtubei.js (innertube) | PC 백엔드 또는 Innertube |
| 확장자·음질 설정 | yt-dlp 변환 | 확장자만 스트림 우선 선택 (`isStandaloneIos`) | 기존과 동일 |
| 메타·앨범아트 임베딩 | Kotlin + ffmpeg | Swift AVFoundation (`NrmAudioMetadata`) | 웹 noop / Expo Go 동일 경로 |
| 저장 위치 | SAF + MediaStore | 앱 Documents → «파일» 앱 | 백엔드 또는 앱 Documents |
| Spotify Charts SP-DC | Android CookieManager 자동 | WebView 로그인(모달) | WebView / 백엔드 |
| 차트 API | `isStandaloneApp()` 직접 호출 | 동일 | PC 백엔드 프록시 |

## IPA에서 APK와 **완전 동일할 수 없는** 항목

다음은 iOS·App Store·샌드박스 제약으로 **구현 불가 또는 다르게 동작**한다. 사용자에게 안내할 내용이다.

1. **yt-dlp / Chaquopy** — iOS에서 임의 Python·네이티브 바이너리 실행 불가. 다운로드는 innertube만 사용하며, YouTube 403·포맷 제한이 APK보다 자주 발생할 수 있다.
2. **SAF·임의 폴더 저장** — 사용자가 고른 외부 폴더에 직접 쓰기 불가. `UIFileSharingEnabled`로 «파일» 앱에서만 접근 가능한 앱 Documents 하위 `NullReferenceMusic/` 사용.
3. **MediaStore 앨범아트 DB** — Android `content://media` 보강 없음. 태그는 파일 내 메타데이터(AVFoundation)로만 반영.
4. **음질 슬라이더** — yt-dlp 전용. iOS는 YouTube 제공 비트레이트 그대로 저장.
5. **확장자 강제 변환** — ffmpeg 없이 스트림에 맞는 컨테이너만 선택 가능(예: `.mp3` 선택 시 스트림에 mp3가 없으면 m4a로 저장될 수 있음).
6. **Spotify SP-DC 자동 읽기** — Android `CookieManager` 전용. iOS는 차트용 WebView 로그인 UI 사용(UX 차이, 기능은 동일 목적).

## 코드 위치

- iOS 메타: `app/modules/nrm-audio-metadata/ios/NrmAudioMetadataModule.swift`
- 분기 헬퍼: `app/lib/nrmStandalonePlatform.ts`
- 적용: `app/lib/nrmApplyAudioMetadata.native.ts`, `app/lib/nrmInnertubeYoutube.native.ts`
- 저장: `app/lib/nrmPersistDownload.native.ts` (iOS 분기)
- 설정 UI: `app/components/nrm/settings/NrmDownloadSettingsPanel.tsx`

## 회귀 체크

- `cd app && npx tsc --noEmit`
- Expo Go(Android/iOS): 검색·다운로드·차트가 **이전과 같이** PC 백엔드 또는 기존 경로 사용
- 웹: 변경 없음
- APK: yt-dlp·SAF·ffmpeg 메타 경로 유지
