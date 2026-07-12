# eSpeak NG (FA 전처리 전용)

멜론 plain 가사의 **영어 구간을 한국어 발음 표기로 임시 변환**한 뒤, 기존 wav2vec2-base Forced Alignment에 넣습니다.  
LRC 생성 후 **원문 가사로 복원**합니다. FA 엔진(wav2vec2/Whisper) 코드는 변경하지 않습니다.

## 앱 동작

- 오프라인, 기기 내부에서만 동작
- `가사 언어 탐지 설정` → **eSpeak NG** 선택 시 전처리 적용
- 하단 **eSpeak NG** 섹션에서 다운로드·설치

## GitHub Release (arm64-v8a)

태그: `espeak-ng-v2` (v1은 APK `libttsespeak.so` + NDK CLI 혼용으로 링크 실패)

| 파일 | 설명 |
|------|------|
| `espeak-ng` | CLI 바이너리 (NDK) |
| `libespeak-ng.so` | **동일 NDK 빌드**의 공유 라이브러리 (APK lib 사용 금지) |
| `espeak-data.zip` | 음성/phoneme 데이터 (`ESPEAK_DATA_PATH`, 공식 APK에서 추출) |

공개 URL 예:

- `https://github.com/yoonhs3648/NullReferMusic/releases/download/espeak-ng-v2/espeak-ng`
- `https://github.com/yoonhs3648/NullReferMusic/releases/download/espeak-ng-v2/libespeak-ng.so`
- `https://github.com/yoonhs3648/NullReferMusic/releases/download/espeak-ng-v2/espeak-data.zip`

> **주의:** CLI와 `.so`는 반드시 같은 NDK 빌드 산출물이어야 합니다.  
> APK의 `libttsespeak.so`를 `libespeak-ng.so`로 올리면 `espeak_ng_CompileIntonation` 심볼을 못 찾아 `CANNOT LINK EXECUTABLE` 이 납니다.

## PC에서 1회 패키징 (개발자)

```powershell
cd D:\AIProj\CsTool\NullReferMusic
.\scripts\Setup-EspeakNg.ps1
.\scripts\Publish-EspeakNgGithub.ps1
.\scripts\Verify-EspeakNgReleaseUrl.ps1
```

공식 APK에서 **data만** 추출 + NDK로 `espeak-ng` CLI·`libespeak-ng.so`를 같은 빌드로 만든 뒤 Release `espeak-ng-v2`에 업로드합니다.  
앱 다운로드는 wav2vec2-base와 동일하게 `NrmResilientHttpDownload` + `NrmModelInstallQueue`를 사용합니다.

## 코드 위치

| 영역 | 파일 |
|------|------|
| TS 전처리/복원 | `app/lib/nrmEspeakLyricsPreprocess.ts` |
| FA 훅 | `app/lib/nrmMelonLyricsLrcStage.ts` |
| Android 부트스트랩 | `app/android/.../EspeakBootstrap.kt` |
| 전처리 | `app/android/.../EspeakLyricsPreprocessor.kt` |
