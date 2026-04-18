# 🎧 nullReferMusic - 완전 로컬 실행 아키텍처 (v5.0)

## 1. 개요

본 프로젝트는 **서버, API, DB 없이** 동작하는

완전 로컬 기반 유튜브 음원 추출 애플리케이션이다.

모든 처리는 사용자 디바이스 내부에서 수행되며,

외부 통신은 **YouTube와의 통신만 존재**한다.

웹과 모바일앱(특히 안드로이드)에서 지원하는 하이드리드 앱을 만든다.

---

## 2. 핵심 설계 원칙

- ❌ 서버 없음 (Spring Boot 포함 안함)
- ❌ API 없음
- ❌ DB 없음
- ✔ 모든 로직은 클라이언트 내부 실행
- ✔ yt-dlp + ffmpeg 직접 실행

---

## 3. 아키텍처

```
[ 사용자 앱 (Web / Mobile ) ]
                |
                v
        [ yt-dlp 실행 ]
                |
                v
        [ ffmpeg 변환 ]
                |
                v
        [ 로컬 파일 저장 ]

```

---

## 4. 처리 흐름

```
1. 사용자 YouTube URL 입력
2. 앱 내부에서 yt-dlp 실행
3. 오디오 다운로드
4. ffmpeg 실행
5. mp3 변환
6. 로컬 저장
7. 사용자 재생 또는 다운로드

```

---

## 5. 기술 스택

### 공통

- yt-dlp (필수)
- ffmpeg (필수)

### 웹

- **현재 저장소 구현**: 프론트는 Expo(웹 포함), 로컬 다운로드 API는 `backend/`의 **Spring Boot**가 담당한다. yt-dlp·ffmpeg는 CLI로 이 API 프로세스에서 실행하며, 바이너리 경로는 `C:\NullReferMusic\library` 를 기준으로 한다.

### 모바일

- Expo(React Native) — Android에서 **온디바이스**: Chaquopy + `yt-dlp` (APK 내장), FFmpeg는 최초 실행 시 기기에 다운로드. **PC 서버 모드**로 `backend/`(Spring Boot)에 위임 가능.

---

## 6. 플랫폼별 가능성

### Web (브라우저)

제약:

- 웹에서 사용자가 url을 반환하면 백앤드에서 해당 url을 읽어서 yt-dlp, ffmpeg 등 실행 파일이 해석가능한 cli명령어를 만들어서 음원 추출 진행

---

### Mobile

- Android: 위와 같이 기기 내 yt-dlp·FFmpeg 경로 지원 (또는 PC 서버 경유).
- iOS: 현재는 웹과 동일하게 로컬/망 내 서버 연동을 전제로 확장 가능.

---

---

## 7. 실행 방식 및 명령어 참고

`해당 안내는 틀릴 수 있으므로 실제로 실행가능한 CLI 명령인지는 직접 확인해야함.`

yt-dlp.exe

- 유튜브 영상 다운로드를 위한 CLI 도구 (음원 포함)
- `youtube-dl`은 원조, `yt-dlp`는 더 활발하게 유지보수되고 있는 포크 버전
- `.exe`로도 배포됨
- 다운로드: https://github.com/yt-dlp/yt-dlp/releases (yt-dlp.exe 다운로드)

ffmpeg.exe

- 다운로드된 영상에서 오디오만 추출(mp3 변환 등) 하려면 `ffmpeg`가 필요함
- `yt-dlp`는 내부적으로 `ffmpeg`를 호출해서 음원 추출을 처리함
- 다운로드: https://www.gyan.dev/ffmpeg/builds/ (Windows용 FFmpeg)

- yt-dlp.exe 명령어

| 항목 | 옵션 | 설명 |
| --- | --- | --- |
| 1. 실행 | `yt-dlp.exe` | yt-dlp.exe 를 실행한다 |
| 2. 추출 타입 | `-x` | 오디옴나 추출 |
| 3. 확장자 (파일 형식) | `--audio-format` `mp3` | `mp3`이외에도 `wav`, `flac` 등 가능 |
| 4. 음질 | `--audio-quality 0` | `0`(최고), `9`(최저). mp3일 때만 적용됨. m4a에는 적용되지 않음 |
| 5. 다운로드 경로  | `-P "경로"`  | 원하는 폴더 지정 가능 (예: `-P "C:\Music"`) |
| 6. 파일명  | `-o "파일명.확장자"`   예) `-o "youtube_audio.%(ext)s"` | 저장할 파일명 지정 (예: `-o "my_audio.%(ext)s"`). 확장자는 자동 대체됨  |
| 7. 유튜브 경로 | `"https://www.youtube.com/watch?v=~~~"` | 다운로드 받을려는 유튜브 URL 경로 |
- 예시
    
    ```bash
    yt-dlp.exe -x --audio-format mp3 --audio-quality 0 -P "C:\MyMusic" -o "youtube_audio.%(ext)s" "https://www.youtube.com/watch?v=영상ID"
    ```
    
- m4a 확장자로 다운로드

| 항목 | 옵션 | 설명 |
| --- | --- | --- |
| 1. 실행 | `yt-dlp.exe` | yt-dlp.exe 를 실행한다 |
| 2. 음질 | `-f bestaudio[ext=m4a]` | m4a 형식의 가장 좋은 오디오 선택 |
| 3. 추출 타입 | `-x` | 오디오만 추출 (extract audio) |
| 4. 확장자 (파일 형식) | `--audio-format m4a` | m4a 형식 유지 (변환하지 않고 추출 시 빠름) |
| 5. 다운로드 경로  | `-P "C:\MyMusic"` | 저장 경로 지정 |
| 6. 파일명  | `-o "파일명.확장자"`   예) `-o "youtube_audio.%(ext)s"` | 저장될 파일명 지정 (%(ext)s는 실제 확장자로 자동 대체됨) |
| 7. 유튜브 경로 | `"https://www.youtube.com/watch?v=~~~"` | 다운로드 받을려는 유튜브 URL 경로 |
- 예시
    
    ```bash
    yt-dlp.exe -f bestaudio[ext=m4a] -x --audio-format m4a -P "C:\MyMusic" -o "youtube_audio.%(ext)s" "https://www.youtube.com/watch?v=영상ID"
    ```
    

- ffmpeg 명령어

| 옵션 | 풀네임/형식 | 대상 스트림 | 역할/설명 | 흔한 대안/팁 |
| --- | --- | --- | --- | --- |
| `-i input` | `-i <파일>` | 입력 | 입력 파일을 지정. 위 예시에서는 1번째 입력이 오디오(mp3), 2번째 입력이 이미지(jpg) | 여러 개 가능. 순서가 중요(0번/1번 입력 인덱스가 달라짐). |
| `-map 0:a` | `-map <입력인덱스>:<스트림타입>` | 출력에 포함할 스트림 선택 | 0번 입력의 오디오 스트림을 출력에 포함. `0`은 첫 번째 `-i`, `a`는 audio | `-map 0:0`(스트림 인덱스 직접), `-map 0:a:0`(첫 번째 오디오) 등도 가능 |
| `-map 1:v` | `-map <입력인덱스>:<스트림타입>` | 출력에 포함할 스트림 선택 | 1번 입력의 비디오(이미지) 스트림을 출력에 포함. 커버아트로 쓰기 위함 | 이미지가 여러 장이면 `-map 1:v:0` 처럼 인덱스 지정 |
| `-c copy` | `-c[:스트림] <코덱>` | 전 스트림(기본) | 재인코딩 없이 컨테이너만 다시 씌움(무손실, 빠름) | 개별 지정 가능: `-c:a copy`(오디오만), `-c:v mjpeg`(이미지 재인코딩) 등 |
| `-metadata key=value` | 메타데이터 쓰기 | 컨테이너/오디오 | 파일(또는 오디오 스트림)에 태그 입력. 여기서는 아티스트/제목 | 다른 키: `album`, `genre`, `date`, `comment` 등 |
| `-metadata:s:v key=value` | 스트림 메타데이터 | 비디오(커버) | 커버 이미지 스트림에 메타 태그 작성. 플레이어에서 “앨범 아트”로 인식 | 관례적으로 `title="Album cover"`, `comment="Cover (front)"` 사용 |
| `-y` | (스위치) | 전체 | 출력 파일 덮어쓰기 자동 승인 | 없으면 같은 이름이 있을 때 확인 대기 |
| `-map_metadata` | `-map_metadata <0 | 1 | …>` | 전체 |
| `-disposition:v attached_pic` | 스트림 속성 | 비디오(이미지) | 커버 이미지를 첨부 이미지로 표시(MP4/MP3에서 사용) | 일부 플레이어 호환성에 도움. 필요 시 추가 |

---

## 8. 저장 전략

1. 사용자가 원하는 사용자의 로컬내 파일 경로에 오디오관련 확장자로 음원 추출하여 파일을 저장
2. 단, 오디오 파일의 메타데이터로 아래의 기능을 지원한다
    1. 해당 음원의 썸네일(앨범커버). 공식 앨범커버를 다운로드 받을 수 있는 경로가 있으면 그를 통해 다운로드 받고, 아니라면 기본이미지 또는 사용자가 임의로 넣을수 있게 지원
    2. 가사. 오픈데이터베이스가 있는걸로 조사했음. 그 오픈데이터베이스를 통해 가사를 가져옴. (외국 팝송일 경우 추후에 번역 기능도 지원할 예정)
    3. 가수이름 및 노래제목 및 앨범명 및 발행처 등. 해당 정보는 공식적으로 가져올 수 있느 경로가 있으면 그를 이용한다 

---

## 9. WebView 기반 확장

```
1. 앱 내 YouTube 페이지 로드
2. 사용자 검색 및 탐색
3. 현재 URL 감지
4. video URL 추출
5. yt-dlp 실행

```

---

## 10. Docker

❌ 사용하지 않음

이 프로젝트는 로컬 실행 기반이므로 불필요

---

## 11. 형상 관리

- git 이용
- https://github.com/yoonhs3648 계정에 새로운 레파지토리로 nullReferMusic 프로젝트 생성
- 해당 레포지토리에서 전체 코드 관리

---

## 12. 개발 단계

### 1단계

- yt-dlp 실행
- ffmpeg 변환

### 2단계

- UI 구현 (React)

### 3단계

- WebView 검색 기능

---
