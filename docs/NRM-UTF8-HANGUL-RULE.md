# NRM UTF-8 한글 깨짐 방지 (필수 규칙)

Windows에서 에이전트·스크립트가 소스를 잘못 저장하면 **UTF-8 한글이 `??`로 깨진 채 APK에 포함**된다.  
특히 **APK 업데이트 게이트**(앱 준비중 / 다운로드 중 / 설치 안내) 문자열이 반복적으로 깨져 출시된 이력이 있다.

이 문서는 **필수**다. `.cursor/rules/nrm-utf8-source.mdc` 와 동일 계열이다.

---

## 1. 원인

| 위험한 쓰기 | 결과 |
|-------------|------|
| PowerShell `Set-Content`, `Out-File` | 기본 인코딩(CP949)으로 UTF-8 덮어씀 → 한글 → `??` |
| PowerShell `>` / `>>` 리다이렉트 | UTF-16 LE 등으로 저장되거나 한글 손실 |
| `.ps1` 안에 한글 리터럴 직접 작성 | Release 본문·파일 패치 시 깨짐 (`docs/RELEASE-APK-IPA-RULE.md` §6-4-b) |

한 번 `??`가 소스에 들어가면 **메트로 번들 → release APK**까지 그대로 간다. 폰트 문제가 아니라 **소스 손상**이다.

---

## 2. 절대 금지

1. PowerShell로 `.ts` / `.tsx` / `.kt` / `.json` / `.md`(한글 포함) **내용을 덮어쓰지 않는다.**
2. APK 업데이트 UI에 **가-힣 원문 리터럴**을 넣지 않는다.
3. 깨진 `??` 문구를 “임시 영문”으로만 두고 방치하지 않는다 — `\uXXXX`로 복구한다.

---

## 3. 허용하는 수정 방법

- Cursor **Write / StrReplace** 도구
- Python: `open(path, "w", encoding="utf-8", newline="\n")`
- PowerShell이 필요하면 `scripts/NrmUtf8.ps1`의 `Write-TextFileUtf8NoBom` 만 사용

---

## 4. APK 업데이트 UI — 하드닝 규칙

| 파일 | 규칙 |
|------|------|
| `app/lib/nrmApkUpdateCopy.ts` | 사용자에게 보이는 한글 **전부** 여기. `\uXXXX` ASCII 이스케이프만. |
| `app/components/nrm/NrmApkUpdateGate.tsx` | COPY import만. Hangul 리터럴 금지. |
| `app/lib/nrmApkUpdate.ts` | 게이트로 넘어가는 error message도 COPY 상수만. Hangul 리터럴 금지. |

예시:

```ts
// BAD — PowerShell이 깨뜨리면 기기에 "?? 준비중"으로 출시됨
const label = '다운로드 준비 중...';

// GOOD — 소스 파일이 ASCII만 있어도 런타임에는 정상 한글
const label = '\uB2E4\uC6B4\uB85C\uB4DC \uC900\uBE44 \uC911...';
```

문구를 바꿀 때:

1. `nrmApkUpdateCopy.ts`만 수정한다.
2. 한글을 직접 타이핑하지 말고, 에디터/도구로 `\uXXXX`를 넣거나 Python으로 이스케이프 생성한다.
3. 아래 검사 스크립트를 돌린다.

---

## 5. 자동 검사 (필수)

```powershell
cd app
npm run check:apk-update-copy
```

- Hangul 음절이 `nrmApkUpdateCopy.ts` / `NrmApkUpdateGate.tsx` / `nrmApkUpdate.ts`에 있으면 **실패**.
- `app` TypeScript를 건드린 뒤 `npx tsc --noEmit` 과 함께 **이 검사도 실행**한다 (`docs/BUILD-VERIFY-RULE.md`).
- release 조립 (`preandroid:release`) 전에 돌리도록 `package.json`에 연결한다.

---

## 6. 이미 깨진 APK를 쓰는 사용자

소스를 고쳐도 **이미 설치된 구 APK**의 번들은 그대로다.  
수정 반영은 **새 release APK를 빌드해 배포**해야 한다.

---

## 7. 체크리스트 (에이전트)

- [ ] APK 업데이트/다운로드 UI 문구 변경 → `nrmApkUpdateCopy.ts`만 `\uXXXX`로
- [ ] PowerShell로 해당 소스 미덮어씀
- [ ] `npm run check:apk-update-copy` 통과
- [ ] `npx tsc --noEmit` 통과
- [ ] (배포 시) release APK에 포함됐는지 확인
