# GitHub 원격 데이터 JSON (`data/`)

앱이 GitHub `data/` 아래 JSON을 읽고 쓰는 기능의 **필드 정의·동기화 규칙**이다.  
`docs/ARCHITECTURE-AND-AI-RULES.md`와 함께 AI·개발자가 준수한다.

---

## 1. 형상 관리 대상

| 경로 | 용도 |
|------|------|
| `data/alarm.json` | 인앱 알림·상단 공지 |
| `data/userBanList.json` | 사용자 차단·해제 이력 |
| `data/inquiry.json` | 문의하기 등록 목록 |
| `data/custom-apk/userList.json` | OAuth 사용자 등록 이력 (앱이 `nrm_user_list`에 직접 upsert. 빌드 시 행을 만들지 않음) |
| **`data/nrm-github-data-fields.xlsx`** | 위 JSON들의 **필드 정의서** (시트 1개 = JSON 1개) |

`data/nrm-github-data-fields.xlsx`는 **반드시 Git에 포함**한다. 로컬에서만 두지 않는다.

---

## 2. 필드 정의서 참조 (필수)

`data/` JSON과 연동되는 **로직·타입·관리자 UI·등록 스크립트**를 수정할 때는, 작업 전·중에 **`data/nrm-github-data-fields.xlsx`를 반드시 참조**한다.

대표 코드 위치:

| JSON | 앱/스크립트 |
|------|-------------|
| `alarm.json` | `app/lib/nrmAlarmClient.ts`, `app/lib/nrmGithubAlarmRegister.ts`, `app/components/nrm/settings/NrmAdminAlarmRegisterPanel.tsx` |
| `userBanList.json` | `app/lib/nrmUserBanClient.ts`, `app/lib/nrmGithubUserBanRegister.ts` |
| `inquiry.json` | `app/lib/nrmGithubInquiryRegister.ts`, `app/components/nrm/settings/NrmInquiryPanel.tsx` |
| `userList.json` | `nrm_user_list` (OAuth 등록 RPC). 레거시 `scripts/Register-NrmCustomApkUserList.ps1`는 빌드에서 호출하지 않음 |
| 공통 | `app/lib/nrmRemoteDataConfig.ts`, `app/lib/nrmGithubContentsApi.ts` |

엑셀에 없는 필드를 임의로 추가·삭제·이름 변경하지 않는다. 구조 변경이 필요하면 아래 §3 절차를 따른다.

---

## 3. JSON 구조 변경 시 엑셀 자동 갱신 (필수)

JSON **필드 추가·삭제·이름·타입·의미**가 바뀌면, 코드·샘플 JSON과 함께 **엑셀 정의서도 같은 PR/커밋에서 갱신**한다.

### 절차

1. `app/scripts/generate-github-data-fields-xlsx.mjs` 안 **`SCHEMAS`** 객체를 실제 구조에 맞게 수정한다. (엑셀 내용의 단일 출처)
2. 아래 명령으로 `data/nrm-github-data-fields.xlsx`를 재생성한다.

   ```bash
   cd app && npm run generate:github-data-fields
   ```

3. 변경된 `data/*.json` 샘플(해당 시), TypeScript 타입·등록 로직, **재생성된 xlsx**를 함께 커밋한다.

**엑셀만 옛날 채로 두고 코드만 바꾸는 커밋은 금지**한다.

---

## 4. 에이전트·빌드 검증

`data/` JSON 연동 코드를 건드렸다면 `docs/BUILD-VERIFY-RULE.md`에 따라 타입 검증 후, 구조를 바꿨다면 **§3 명령을 실행해 xlsx가 최신인지 확인**한다.

---

## 6. APK 빌드 시 GitHub PAT 내장

문의하기·관리자 알림 등록 등 **쓰기** 기능은 APK 안에 PAT가 있어야 한다.

1. PC에 `.secrets/nrm-github-data.pat` (또는 `NRM_GITHUB_DATA_PAT` 환경변수) 설정
2. 릴리스 APK 빌드 (`NullReferMusic-Build-Release-Apk.bat`, `build-release-apk-custom.bat`, `npm run android:release`) 시 `Ensure-NrmGithubDataPat.ps1`가 `local.properties`에 반영
3. Gradle이 `BuildConfig.NRM_GITHUB_DATA_PAT` → `NrmGithubDataModule` → JS `getNrmGithubDataPat()` 로 전달

PAT 없이 빌드하면 **빌드 단계에서 중단**된다. 이미 설치된 APK는 PAT를 나중에 넣을 수 없으므로 **재빌드·재설치**가 필요하다.

---

## 7. 요약

| 상황 | 행동 |
|------|------|
| JSON 연동 로직 수정 | **`nrm-github-data-fields.xlsx` 참조** 후 작업 |
| JSON 필드 구조 변경 | `SCHEMAS` 수정 → `npm run generate:github-data-fields` → xlsx 커밋 |
| 새 GitHub JSON 추가 | `data/` JSON + `SCHEMAS` + xlsx 시트 + 이 문서 표 갱신 |
