# GitHub에 NullReferenceMusic 원격 저장소 보이게 하기

제품·프로그램 이름은 **NullReference** / **NullReferenceMusic** 이다. 아래 `git clone`·원격 URL의 **`NullReferMusic`** 은 GitHub 저장소 폴더명(기존 식별자)이며, 같은 프로젝트를 가리킨다.

지금 PC에는 **`gh` 로그인이 없고**, 과거에 **`git push`도 하지 않은 상태**라서  
`https://github.com/yoonhs3648/NullReferMusic` 주소는 **아직 GitHub에 존재하지 않습니다.**  
(로컬 커밋만 있고, 원격이 비어 있음.)

에이전트가 대신 로그인할 수는 없으므로, **본인 계정으로 한 번만** 아래 중 **하나**를 진행하면 저장소가 생성되고 브라우저에서 들어갈 수 있습니다.

---

## 준비물 (제가 채팅으로 요청하는 정보)

| 필요 여부 | 내용 |
|-----------|------|
| **필수** | GitHub 계정 **`yoonhs3648`** 로 **본인 PC**에서 로그인할 수 있을 것 |
| **선택** | GitHub CLI: `gh auth login` 완료 **또는** Personal Access Token (아래 참고) |
| **채팅에 넣지 말 것** | 비밀번호, PAT 토큰 문자열 — 터미널/브라우저에서만 입력 |

저장소 이름은 **`NullReferMusic`** (대소문자 그대로) 을 권장합니다. 다른 이름을 쓰면 아래 URL의 저장소 이름만 바꾸면 됩니다.

---

## 방법 A — 웹에서 빈 저장소 만들기 + `git push` (가장 단순)

### 1) 브라우저

1. 로그인: https://github.com/login  
2. 우측 **+** → **New repository**  
3. **Repository name**: `NullReferMusic`  
4. **Public** 선택  
5. **Add a README** / **.gitignore** / **license** 는 **전부 체크하지 않음** (완전 빈 저장소)  
6. **Create repository**

### 2) 이 PC에서 푸시

저장소 루트에서 PowerShell 또는 CMD:

```powershell
cd C:\NullReferMusic
git remote remove origin 2>$null
git remote add origin https://github.com/yoonhs3648/NullReferMusic.git
git branch -M main
git push -u origin main
```

처음이면 **Git Credential Manager** 창이 뜨고, 브라우저로 GitHub 로그인하면 됩니다.

### 3) 확인

브라우저에서 열기: **https://github.com/yoonhs3648/NullReferMusic**

---

## 방법 B — GitHub CLI로 만들기 + 푸시

PowerShell:

```powershell
gh auth login
cd C:\NullReferMusic
gh repo create NullReferMusic --public --source=. --remote=origin --push
```

`gh auth login` 에서 HTTPS, 브라우저 인증을 선택하면 됩니다.

---

## 방법 C — 토큰으로 `gh` 로그인 (CLI만 쓸 때)

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**  
   - Classic: `repo` 권한  
2. PC에서 (토큰은 화면에만 붙여넣기, 채팅 금지):

```powershell
$env:GH_TOKEN = 'ghp_여기에_토큰'
cd C:\NullReferMusic
$env:GH_TOKEN | gh auth login --with-token
git push -u origin main
```

---

## 자주 나는 오류

| 메시지 | 대응 |
|--------|------|
| `repository not found` | 빈 저장소를 웹에서 먼저 만들었는지, 계정/이름 철자가 `yoonhs3648` / `NullReferMusic` 인지 확인 |
| `failed to push` / 인증 | 방법 A의 Credential Manager 또는 PAT |
| `remote origin already exists` | `git remote remove origin` 후 다시 `git remote add ...` |

---

| 날짜 | 내용 |
|------|------|
| 2026-04-18 | 원격 없음·미로그인으로 GitHub에 저장소가 안 보이는 경우 대응 절차 정리 |
