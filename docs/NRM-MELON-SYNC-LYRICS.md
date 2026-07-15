# 멜론 싱크 가사 (Forced Alignment) — 문제·개선 히스토리 & 에이전트 규칙

> **AI 에이전트 필수:** 사용자가 「싱크 가사」「멜론 가사」「LRC 정렬」「forced align」「wav2vec2 싱크」개선을 요청하거나, `nrm-debug-*.log`와 mp3/m4a 샘플을 주며 싱크·성능·생성 시간 개선을 요청하면 **이 문서를 먼저 읽고** 아래 히스토리·원칙을 반영한 뒤 작업한다.  
> 개선 작업을 마치면 **이 파일의 「개선 히스토리」 섹션에 날짜·원인·변경·로그 키워드를追加**한다.

---

## 1. 파이프라인 요약

```
멜론 URL → plain 가사 크롤링 (메모리만, 파일 메타에 plain 저장 안 함)
    → ffmpeg 16kHz mono WAV
    → wav2vec2-base CTC forced alignment (KO/EN 팩)
    → LRC 타임스탬프
    → (선택) DeepL 번역 줄 추가
    → 사이드카 .lrc 또는 mp3/m4a 내장 (싱크만)
```

| 단계 | 주요 코드 |
|------|-----------|
| TS 진입 | `app/lib/nrmMelonLyricsLrcStage.ts` → `transcribeMelonLyricsLrc` |
| 네이티브 게이트 | `app/lib/nrmAlignModelNative.ts` → `alignMelonLyricsToLrcNative` |
| 엔진 라우팅 | `app/android/.../ForcedAlignEngine.kt` |
| **핵심 정렬** | `app/android/.../Wav2Vec2CtcForcedAligner.kt` |
| 레거시(비딥러닝) | `app/android/.../AeneasForcedAligner.kt` |
| 옵션 | `app/android/.../MelonSyncAlignOptions.kt`, `app/lib/nrmMelonSyncSettings.ts` |
| 언어 팩 | `app/lib/nrmPickMelonAlignLanguage.ts`, `app/lib/nrmAlignLyricsLang.ts` |

**메타데이터 (2026-06 확정):** plain은 파일에 넣지 않음. URL은 mp3=`website`, m4a=`comment`. 싱크만 USLT/SYLT·©lyr에 임베드.

---

## 2. CTC 정렬 내부 단계 (디버깅용)

`Wav2Vec2CtcForcedAligner.kt` 처리 순서:

1. **보컬 구간** `detectVocalRange` — 에너지·`detectSingingOnsetMs` (긴 인트로 곡)
2. **세그먼트 분할** `planLyricSegments` — Silence/Time/Density Anchor → coalesce(목표 ~25s, 밀집 병합 금지) → trellis·시간·토큰·density 한도 재귀 분할
3. **ONNX 청크** `inferLogProbsForAudio` — chunk/overlap 밀도 적응 + **긴 줄 adaptive overlap** (+250/+500ms)
4. **CTC trellis** `forcedAlignTokenStarts` — 줄별 시작 프레임
5. **start_offset / first_line_bump** — 첫 세그먼트: blank 밀도+에너지로 전역 Start Offset, 아니면 첫 줄만 bump
6. **spreadCollapsedLineTimestamps** — 동일 프레임에 뭉친 줄을 글자 수 비율로 펼침
7. **enforceMonotonicAdaptive** — 발음 토큰 수 기반 줄 간 최소 간격
8. **세그먼트 local realign** — conf&lt;0.15 줄 ±4s (세그먼트당 최대 1회)
9. **refine** — chorus anchor 재사용 + low-conf boundary ±40ms smoothing
10. **다세그먼트** — 패스별 stretch 후 stitch, 경계 gap 보정
11. **post-merge realign** — 경계 ±300ms + conf&lt;0.10 줄 ±600ms → refine 재적용
12. **global affine drift** — 예상 vocal end 기준 Affine Time Warp

---

## 3. 로그 분석 가이드 (사용자가 `nrm-debug-*.log` 제공 시)

### 3-1. 먼저 grep할 태그

| 태그 | 의미 |
|------|------|
| `[whisperx-align]` / `process=forced-align` | CTC 정렬 전체 |
| `ctc_fa_profile` | 메모리 tier, chunkSamples, quality |
| `ctc_fa_vocal` / `ctc_fa_singing_onset` | 보컬 시작·끝 (ms) |
| `ctc_fa_plan segments=N` | N>1 이면 2패스 분할 |
| `ctc_fa_plan anchors=` / `ctc_fa_plan coalesce` | Silence/Time Anchor·짧은 세그먼트 병합 |
| `ctc_fa_blank_adapt` | Adaptive Blank early/late bias |
| `ctc_fa_line_conf` / `ctc_fa_local_realign` | 줄 confidence·±4s 국소 재정렬 |
| `ctc_fa_post_merge` / `ctc_fa_post_merge_realign` | Merge 후 저신뢰·경계 재정렬 |
| `ctc_fa_start_offset` | 전역 Start Offset (blank+energy) |
| `ctc_fa_affine_applied` / `ctc_fa_affine_skip` | 전역 Affine Drift |
| `ctc_fa_realign_abort` / `ctc_fa_mem_probe` | 저신뢰 세그먼트 realign 중단 · Native/VmRSS 계측 |
| `ctc_fa_chunk_adapt` | 밀도·줄길이 기반 chunk/overlap (`lineExtraMs`) |
| `ctc_fa_plan_density_cut` / `densityScore=` | 밀집 분할 이유 |
| `ctc_fa_refine` | `chorusCandidates/Accepted/Rejected`, `boundaryCandidates/Smooth` |
| `ctc_fa_plan_summary` | `densitySplits=` `forceSplits=` |
| `ctc_fa_onnx_opts` | ORT threads / memPattern |
| `ctc_fa_first_line_bump` | 첫 줄 인트로 보정 (과하면 초반 싱크 붕괴) |
| `ctc_fa_spread_run` | 뭉친 줄 펼침 (windowMs 너무 작으면 초반 압축) |
| `ctc_fa_stretch_applied` / `ctc_fa_stretch_skip` | 세그먼트/레거시 stretch |
| `ctc_fa_stretch_clamp` | ratio 상한 초과 시 1.28로 제한 적용 |
| `sync-lyrics` / `===== sync-lyrics` | Whisper·wav2vec2·eSpeak-align LRC 전문 덤프 (`phonetic_timed` / `sync_lrc` / `restored_lrc`) |
| `ctc_fa_boundary_close` | 세그먼트 경계 gap 당김 |
| `ctc_fa_stitch` | 다패스 합침 + globalAffine 여부 |
| `onnx_chunk` | ONNX 패스 진행 (idx, offset, availMb) |
| `fa_audio_probe` | 소스 vs WAV 길이 deltaMs (수십 ms 이내 정상) |
| `download.lyrics` / `whisperx-align` align_start/done | TS 측 총 소요 |

### 3-2. 증상 → 흔한 원인

| 사용자 증상 | 로그에서 볼 패턴 | 원인 |
|-------------|------------------|------|
| **초반만 크게 어긋남, 후반 나아짐** | `first_line_bump` delta 수만 ms, `after`가 실제 가사 시작보다 훨씬 늦음 | onset 프로브 오탐 + bump가 CTC 정답(세그먼트 시작 근처)을 덮어씀 |
| **초반 괜찮고 후반만 어긋남** | 2패스에서 `idx=1` + 큰 `first_line_bump`; `globalStretch=false` | 중간 세그먼트에 인트로 보정 오적용; 후반 stretch 부족 |
| **전체적으로 빠름/느림** | `stretch_skip ratio_out_of_range` | stretch 미적용 → CTC 누적 drift 그대로 |
| **가사가 한꺼번에 몰림** | `ctc_fa_spread_run` + 작은 `windowMs` | CTC 동일 프레임 collapse |
| **OOM/실패** | `ctc_fa_oom`, `ctc_fa_low_mem` | 청크·trellis 한도; 품질 tier 하향은 이미 있음 |
| **align_fail empty_lrc (stretch)** | `Cannot coerce value to an empty range` / `invalid_target_range` | 첫 줄이 이미 곡 끝 근처 → stretch clamp min>max (2026-07-12: 스킵으로 예외 제거) |

---

## 4. 알려진 문제 & 실증 로그 (2026-06-18)

사용자 샘플: **Charlie Puth - Dangerously.mp3**, **I Don't Think That I Like Her.m4a**  
로그: `nrm-debug-2026-06-18.log.txt` (메타 바인딩 변경 **이전** 빌드 — `nrm_plain_lyrics` 등은 무시)

### 4-1. Dangerously.mp3 — 초반 심각, 후반 개선

```
ctc_fa_singing_onset onsetMs=32090 startMs=31690
ctc_fa_first_line_bump before=31891 after=62708 delta=46226   ← CTC는 ~32s(정상), bump가 ~63s로 밀음
ctc_fa_stretch_skip reason=ratio_out_of_range ratio=1.324    ← 후반 보정 스킵
```

- CTC 첫 줄 `31891ms` ≈ 보컬 시작 `31690ms` → **정렬 자체는 맞았음**
- onset 프로브가 `minFirst≈62708`을 요구 → bump가 **+30초** 가사 지연 → 초반 체감 싱크 붕괴
- 후반은 drift가 자연히 줄어듦 + stretch 스킵으로 사용자가 「후반은 나아진다」고 느낌

### 4-2. I Don't Think That I Like Her.m4a — 초반 양호, 후반 악화

```
ctc_fa_plan segments=2
# 세그먼트 0: first_line_bump 902→9540 (정상 범위), stretch ratio=1.073
# 세그먼트 1: first_line_bump 94778→114984 delta=30310  ← 곡 중간인데 인트로 보정
ctc_fa_stitch segments=2 globalStretch=false
```

- 1패스(33줄)는 양호
- 2패스 첫 줄이 오디오 경계 `~94758ms`인데 가사 `~115s`로 밀림 → **후반 전체 지연 누적**
- stitch 후 전역 stretch 없음 → 끝까지 drift 잔존

---

## 5. 개선 히스토리 (날짜순)

에이전트는 **새 개선마다 이 섹션 맨 위에 항목 추가**.

### 2026-07-15 — Sync 안정화 5종 보완 (density score / chorus Jaccard / boundary gap)

| 변경 | 내용 |
|------|------|
| Density | `score = token/s×0.8 + line/s×0.2`, threshold 8.0 (≈ token/s 10). 로그 `densityScore=` `tokenDensity=` `lineDensity=` |
| Chorus | Dice 95% → **Jaccard≥0.92 AND editDist≤0.08** + 구두점 normalize (`Love Attack!!!` 매칭) |
| Boundary | conf&lt;0.2 **그리고** prev/next gap 둘 다 &lt;150ms 일 때만 ±40ms |
| 유지 | Adaptive overlap, Dictionary(+apostrophe), drift 80~2500ms |

### 2026-07-15 — Sync 안정화 5종 (overlap / density / chorus / dict / boundary)

**배경:** 5곡 FA 전부 성공. 남은 오차는 CTC 한계(혼용·후렴·애드립) 쪽이라 chunk/beam/realign2 대신 **후처리·안정화**만 추가.

| 변경 | 내용 |
|------|------|
| Adaptive overlap | 최장 줄 >45자 +250ms, >70자 +500ms 추가 (`ctc_fa_chunk_adapt … longestLine= lineExtraMs=`). 전역 overlap 확대 아님 |
| Density segment | plan 앵커에 `densitySplits`, coalesce 시 밀집 병합 금지, `planRecursive` `overDense` 강제 분할 |
| Chorus anchor | 유사 줄의 첫 (prev→curr) gap을 drift 80~2500ms일 때만 재사용 (`ctc_fa_refine chorusAnchors=`) |
| EnKo dictionary | `it's/i'm/don't/you're/…` → 한글 발음 선적용 후 ONNX (`dictHits=`). 중의성 키는 아포스트로피 있을 때만 |
| Boundary smooth | low-conf boundary ±40ms (`ctc_fa_refine boundarySmooth=`) — 추가 ONNX 없음 |
| 비권장 유지 | chunk 축소 / 전역 overlap↑ / beam / trellis↓ / realign 2회 — 미적용 |

**로그 키워드:** `lineExtraMs=`, `densitySplits=`, `densityScore=`, `overDense=`, `ctc_fa_refine`, `dictHits=`

### 2026-07-15 — EnKo Transliterator: unique-word + LRU + trim busy 가드

**배경:** REDRED 로그에서 FA `align_start` 전 en-ko `encode word=` 중 PeakRSS~966MiB·Native~951MB 후 silent kill. wav2vec2 FA는 이전 2곡 정상 완료.

| 변경 | 내용 |
|------|------|
| 추론 단위 확인 | **단어마다** encoder+decoder (문장 1회/ONNX batch 아님) — 혼합 가사 설계 |
| Unique warm | 곡당 유니크 라틴 단어만 선추론 후 줄 치환 (반복 yeah/red-red ONNX 제거) |
| Normalize key | lowercase+trim+구두점/아포스트로피 제거 (`Don't,`→`dont`); hyphen split (`red-red`→`red`×2) |
| Top words | `song_run_top_words yeah 132 \| oh 88 \| …` (가사 출현 Top10) |
| Segment 통계 | `ctc_fa_segment … segmentDurationMs=… lineCount=… tokenCount=… elapsed=…s onnxRuns=… trellisFrames=… realign=…` |
| LRU | 단어→한글·encode ids 캐시 (max 2048) |
| Session 로그 | `session_create`/`session_destroy` + `song_run_end` (elapsed/avgEncoderMs/avgDecoderMs/cacheHitRate…) |
| Trim | EnKo busy 시 invalidate 금지 → `low_mem_mode` (maxNewTokens 24→12, cache trim) |
| 유지 | FA 직전 EnKo invalidate, threads=1, memPattern/arena OFF; phrase-level 추론은 보류 |

**검증 로그:** `uniqueWords≈encoderRuns`, `cacheHits`≫`cacheMisses`. `encoderRuns>uniqueWords`면 `song_run_dup_infer` 경고.

**로그 키워드:** `song_run_start`, `song_run_end`, `session_create`, `session_destroy`, `low_mem_mode`, `release_onnx_sessions enko_busy→low_mem`

### 2026-07-15 — Segment 20~30s / Token Gap / Post-merge Realign / Start Offset·Affine

**배경:** 181초 곡이 `segments=15`(평균 ~12s)로 과도 분할되어 CTC→Stretch 후처리 오차가 누적·속도 저하. 한 줄씩 전반적으로 빠르/느림은 Audio Onset·Gap(문자 수) 왜곡 가능. 음역(EN→KO) 후 plainChars 감소로 문자 기반 Gap이 발화량과 불일치.

| 변경 | 내용 |
|------|------|
| Segment 정책 | Anchor ~28s, `TARGET=25s`/`MIN=18s`/`MAX=32s`, 짧은 세그먼트 coalesce, 분할 최소 간격 유지. Frames≤2800·Tokens≤220 |
| 분할 가중치 | 줄 수 60%→ **Token 45% + Duration proxy 35% + 줄 20%** |
| Gap | `chars×perChar` → **발음 토큰 수 × perToken** (KO 42 / EN 40) |
| Post-merge | conf&lt;0.10 줄 ±600ms 재정렬 + 경계 ±300ms (최대 10회) |
| Start Offset | 첫 세그먼트 blank 밀도≥0.55 + 에너지 저조 시 **전 줄 shift** (`ctc_fa_start_offset`) |
| Global Drift | stitch 후 `applyGlobalAffineDriftCorrection` (vocal end·소폭 start) |
| 유지 | ONNX Session 재사용, memPattern/arena OFF, Chunk·Overlap, 세그먼트당 localRealign 1회 |

**로그 키워드:** `ctc_fa_plan coalesce`, `ctc_fa_start_offset`, `ctc_fa_post_merge`, `ctc_fa_affine_applied`

### 2026-07-14 — Probe 1회 캐시 / Session 앱수명 / Segment ≤30s·Frame·Token 한도

**배경:** 로그상 transliterator `probe hello`가 곡당 2~3회, wav2vec2 Session이 곡마다 create/destroy, 토큰 밀집 세그먼트가 100s급 처리로 전체 FA가 수 배 느려짐. arena/memPattern OFF·PeakRSS↓는 유지.

| 변경 | 내용 |
|------|------|
| Probe 캐시 | `EnKoTransliteratorInfer.probe` — 동일 root면 프로세스당 `hello` 1회만, 이후 cache hit. FA 직전 `invalidate()`는 엔진만 해제(probe 캐시 유지) |
| Session 수명 | `ForcedAlignWorkQueue` idle 시 `releaseOnnxSession` 제거. `MainApplication` onLowMemory / onTrimMemory(COMPLETE·RUNNING_CRITICAL)에서만 destroy |
| Segment 한도 | `MAX_SEGMENT_MS=30s`, `MAX_SEGMENT_FRAMES=2500`, `MAX_SEGMENT_PLAIN_TOKENS=180` — 하나라도 초과 시 `planRecursive` 강제 분할 |
| 유지 | `localRealignCount=1`, arena OFF / memPattern OFF, Chunk·vocal detect 변경 없음 |

**로그 키워드:** `probe cache hit`, `ctc_fa_plan_force_split`, `ctc_fa_plan … maxSegMs=`, `release_onnx_sessions`, `ctc_fa_onnx_session create|reuse` (곡마다 destroy 없어야 함)

### 2026-07-14 — Native Memory Audit + Local Realign 제한 (LMKD 대응)

**배경:** SM-G781N에서 FA 중 silent kill. Java OOM/Fatal signal 없음 → Samsung LMKD + Native RSS + 장시간 CPU 유력. `availMb`만으로는 프로세스 RSS를 알 수 없음.

| 변경 | 내용 |
|------|------|
| Native Audit | `OnnxTensor`/`OrtSession.Result` `use{}` + logits deep-copy; `SessionOptions.close()` 누락 수정 |
| Telemetry | `ctc_fa_mem_probe` — nativeAlloc/Heap/Free + javaUsed + VmRSS/VmSize |
| Local Realign | trigger conf&lt;0.15, 세그먼트당 최대 2회, 저신뢰 비율≥45%면 1회로 abort 후 수용 |
| Overlap | 상한 4800 samples(~300ms) |
| Low-conf chunk | realign 경로 chunk ×0.5 |
| Session | singleton 유지 + create/release 시 mem_probe |

**로그 키워드:** `ctc_fa_mem_probe`, `ctc_fa_realign_abort`, `ctc_fa_local_realign … acceptBelow=`, `ctc_fa_onnx_session reuse|create|released`

### 2026-07-14 — 가사 생성 프로세스 생존성 (FGS / WakeLock / Align Queue)

**배경:** 가사(LRC) Forced Alignment 중 Activity/임시 Thread에서 ONNX를 돌리면, 앱이 포그라운드에서 이탈·발열·메모리 압박으로 kill 되기 쉬움. “큐 복구”가 아니라 **가능한 한 오래 살아남기**가 목표 (절대 불사는 불가).

| 변경 | 내용 |
|------|------|
| `ForcedAlignWorkQueue` | FA는 `newSingleThreadExecutor` 순차 실행 + `THREAD_PRIORITY_FOREGROUND` |
| FGS 토큰 | `align-run:` — `START_STICKY` Service + progress Notification 갱신 |
| FGS type | align/다운로드 모두 `dataSync` (Manifest도 dataSync 단일) |
| WakeLock / WifiLock | PARTIAL 유지; 모델·오디오 DL 중 WifiLock |
| ONNX Session | 큐 idle까지 singleton 재사용 (곡마다 create/close 금지) |
| Thermal | `NrmThermalGuard` — 과열 시 thread↓·chunk↓ |
| Chunk | 상한 ~4s (64k samples)로 GC/취소 포인트 확보 |

**로그 키워드:** `forced-align-queue`, `ctc_fa_onnx_session`, `ctc_fa_onnx_opts … thermal=`, `WifiLock`, `WakeLock`

### 2026-07-14 — wav2vec2 CTC FA 알고리즘 (Anchor / Adaptive Blank / Conf Re-align / Chunk)

**배경:** 고RAM에서 곡 전체를 한 trellis로 넣으면 후반 누적 drift가 남고, blank 고정값·품질 분기는 체감 이득이 적음.

| 변경 | 내용 | 기대 효과 |
|------|------|-----------|
| Silence + Time Line Anchor | `planLyricSegments` — 무음≥800ms·~25s 스냅 → 줄 경계 분할 후 trellis 한도 | 고RAM에서도 다중 trellis로 drift 리셋 |
| Adaptive Blank | CTC emit 시 blank logit ±0.05~0.15 (시간·에너지) | 초반 blank 과다 / 후반 어휘 유지 |
| Confidence Local Re-align | 줄 conf&lt;0.35만 ±4s 국소 FA 재실행 | 저신뢰 줄만 보정, 실패 시 원본 |
| Dynamic Chunk + Adaptive Overlap | 보컬 밀도로 chunk/overlap(1500~6400) | 전주 희박↑·랩 밀도↓ chunk |
| ONNX 속도 | memPattern on, threads 1~3, FloatArray pool (Java ORT에 IOBinding 없음) | 청크 할당·추론 오버헤드↓ |
| 상수 단순화 | onset 3.0 고정, collapse KO100/EN120, perChar KO35/EN38, trellis 상한 12e6 | 품질 분기 노이즈↓ |

**가드:** Anchor 세그먼트도 `applyIntro`는 **첫 세그먼트만** (`idx==0 && weightStart&lt;0.02`). mid-song bump 금지.

**로그 키워드:** `ctc_fa_plan anchors=`, `ctc_fa_blank_adapt`, `ctc_fa_line_conf`, `ctc_fa_local_realign`, `ctc_fa_chunk_adapt`, `ctc_fa_onnx_opts`

### 2026-07-14 — eSpeak NG → en-ko-transliterator (EN→KO 발음)

- **원인:** eSpeak NG는 CLI 실행파일·W^X·lib 심볼 불일치로 실기기 설치/프로브가 자주 실패해 UI에서 비활성 상태였음.
- **변경:** `eunsour/en-ko-transliterator`(mT5)를 ONNX로 변환해 **데이터만** `filesDir`에 설치. 추론은 APK의 onnxruntime. 모드 id `transliterator`.
- **계약 유지:** plain 전처리 → FA → LRC 원문 복원 + `phonetic_timed`/`restored_lrc` 로그.
- **배포:** GitHub Release `en-ko-transliterator-v1` (HF 직접 수신은 Xet 401 등 회피).
- **키워드:** `en-ko-transliterator`, `transliterator_preprocess_done`, `skip_transliterator_not_installed`

### 2026-07-12 — 싱크 LRC 전문 로그 (eSpeak / Whisper / wav2vec2)

**배경:** 정렬·전사 결과 텍스트를 로그에서 바로 확인하기 어려움.

| 변경 | 내용 |
|------|------|
| `logSyncLyricsLrcDump` / `NrmFileLogger.logLrcDump` | LRC 전문을 `===== sync-lyrics ... =====` 블록으로 기록 |
| eSpeak | FA 직후 `kind=phonetic_timed` (전처리 가사+타임스탬프), 복원 후 `kind=restored_lrc` |
| wav2vec2/aeneas | `ForcedAlignEngine.align_ok` + JS `sync_lrc` |
| Whisper | 네이티브 `transcribeToLrc` + JS `transcribe_done` 직후 `sync_lrc` |

**로그 키워드:** `sync-lyrics`, `phonetic_timed`, `restored_lrc`, `sync_lrc`.

### 2026-07-12 — stretch `coerceIn` 범위 역전 예외 방지 (Wav2Vec2CtcForcedAligner.kt)

**배경:** aespa LEMONADE 등에서 CTC FA는 성공했으나 `stretchLrcTimestampsToVocalEnd`가 `firstMs+12s` > `durationMs-400` 인 입력에 `coerceIn` → `IllegalArgumentException` → empty LRC / `melon_align_failed`.

| 변경 | 내용 | 기대 효과 |
|------|------|-----------|
| stretch 가드 | clampMin > clampMax 이면 **원본 LRC 반환** (`ctc_fa_stretch_skip reason=invalid_target_range`) | 품질용 후처리 실패로 정렬 전체가 죽지 않음 |

**검증:** `compileDebugKotlin`. 로그 키워드: `invalid_target_range`.

### 2026-06-19 — CTC 후처리 완화 (ChatGPT 검토 반영, Wav2Vec2CtcForcedAligner.kt)

**배경:** 긴 인트로 곡 onset 오탐·2패스 경계 drift·과도한 stretch clamp. CTC 결과는 유지하고 후처리만 완화.

| 변경 | 내용 | 기대 효과 |
|------|------|-----------|
| onset 프로브 | 탐색 창 `min(35%×세그먼트길이, 60s)` 내에서만 bestScore·threshold 계산; **첫 threshold 통과 프레임** 사용, 전역 bestFrame 폴백 제거 | Dangerously류 63s 오탐 방지 |
| intro bump 상한 | `delta > 15s` → bump 생략 (`ctc_fa_first_line_bump_skip`) | CTC ~32s 정답 보존 |
| boundary close | gap 임계 **6s → 3s** | 2패스 경계 2~4s drift 조기 보정 |
| stretch | 적용 **0.90~1.25**; 1.25~1.40 soft clamp `1.25+(r-1.25)×0.4`; >1.40 skip | 1.28 강제 clamp 부작용 완화 |
| overlap (accurate) | **2400 → 4000** samples (~250ms) | 청크 경계 토큰 잘림 감소 |
| 2패스 weight | 글자만 → **줄 60% + 글자 40%** | 연주 구간 있는 곡 세그먼트 경계 안정 |
| 안전 | `estimateFirstLineOnsetMs` try/catch → 실패 시 bump 생략 | 정렬 중 예외로 앱 중단 방지 |

**검증:** `compileDebugKotlin` 성공. 로그: `ctc_fa_first_line_bump_skip`, `ctc_fa_stretch_soft_clamp`, `ctc_fa_boundary_close`.

### 2026-06-18 — CTC 후처리: bump·경계·stretch (Wav2Vec2CtcForcedAligner.kt)

**배경:** 위 4절 로그 분석.

| 변경 | 내용 | 기대 효과 |
|------|------|-----------|
| bump 완화 | 세그먼트 시작 6초 이내 CTC + probe가 10초+ 뒤로 밀 때 bump **생략** | Dangerously류 인트로 오탐 |
| intro 보정 범위 | `firstLineIntroCorrection` → **첫 세그먼트(idx=0)만** | m4a 2패스 중간 bump 제거 |
| `closeSegmentBoundaryGap` | 이전 마지막 줄과 gap≥6s면 세그먼트 타임스탬프 **당김** | 패스 경계 20s 점프 완화 |
| stretch clamp | ratio 1.32~1.50 → 스킵 대신 **1.28 적용** | Dangerously ratio=1.324 보정 |
| global stretch | `segments>1` stitch 후 **전역 stretch 1회** | 후반 drift |

**검증:** `cd app/android && .\gradlew.bat :app:compileDebugKotlin` 성공.  
**재검증 필요:** 동일 Charlie Puth 곡 재다운로드 후 로그에서 `ctc_fa_boundary_close`, `globalStretch=true`, bump 생략 확인.

### 2026-06-18 — 메타·UI (plain 미저장, URL comment/website)

싱크 엔진과 직접 무관하지만 멜론 모드·URL 크롤 게이트가 정렬 입력(plain)에 영향.

- plain: 크롤링 → 메모리만, 파일 메타·`.nrmplain` 제거
- m4a URL → `comment`, mp3 → `website`
- 트랙 편집: URL 크롤 후에만 멜론 드롭다운 활성화

---

## 6. 개선 작업 시 원칙 (사용자 요구 반영)

1. **품질 우선, 단 기존보다 나빠지면 안 됨** — 회귀 금지. 변경 전후 로그 키워드 비교.
2. **생성 시간** — 사용자는 「조금 더 걸려도 됨, 너무 느리지만 말 것」.  
   - 품질 옵션: `MelonSyncAlignOptions.QUALITY_ACCURATE` (기본), chunk overlap↑, trellis margin↑  
   - 속도 희생 acceptable: ONNX 청크 overlap, 2패스 추가, 전역 stretch 1회  
   - 피할 것: 무의미한 ONNX 전체 재실행 2회+, trellis 한도 무시한 OOM
3. **여러 곡에 일반화** — 특정 곡 ID 하드코딩 금지. 에너지·CTC·비율 기반 휴리스틱만.
4. **로그 주면 반드시** — 3절 grep → 4절 유사 케이스 매칭 → 가설 → 최소 diff → 히스토리 기록.
5. **빌드 검증** — Kotlin 수정 시 `app/android` `compileDebugKotlin`. TS 수정 시 `cd app && npx tsc --noEmit`.

---

## 7. 튜닝 상수 참고 (Wav2Vec2CtcForcedAligner)

| 상수/임계값 | 값 | 비고 |
|-------------|-----|------|
| `MIN_INTRO_MS` | 800 | 첫 줄 최소 |
| `MAX_INTRO_BUMP_MS` | 15000 | 초과 시 bump 생략 (2026-06-19) |
| onset probe window | min(35%×dur, 60s) | 첫 threshold crossing (2026-06-19) |
| bump skip | segStart&lt;6s & delta&gt;10s | 2026-06-18 |
| `ANCHOR_TIME_MS` | 28000 | Time Anchor 간격 (2026-07-15: 25s→28s) |
| `TARGET` / `MIN` / `MAX_SEGMENT_MS` | 25s / 18s / 32s | coalesce·강제 분할 (2026-07-15) |
| `MAX_SEGMENT_FRAMES` / `TOKENS` | 2800 / 220 | 2026-07-15 |
| Gap | tokens×42(KO)/40(EN), clamp 52~480 | 발음 토큰 수 (2026-07-15) |
| Post-merge | conf&lt;0.10 ±600ms; boundary ±300ms; max 10 | 2026-07-15 |
| boundary close | gap≥3000ms | stitch 시 (2026-06-19: 6000→3000) |
| stretch/affine drift | 900ms | 미만이면 skip |
| stretch/affine ratio | ~0.88~1.28 적용; soft clamp | 2026-07-15 affine |
| `FRAME_STRIDE_SAMPLES` | 320 | @16kHz |
| accurate chunk overlap | 4000 samples (~250ms) + 줄길이 adaptive | 2026-07-15: >45자+250ms, >70자+500ms |
| Density split | score=token/s×0.8+line/s×0.2 &gt; 8.0 | 2026-07-15 |
| Chorus / boundary | Jaccard≥0.92+edit≤0.08; conf&lt;0.2 &amp; gap&lt;150ms ±40ms | 2026-07-15 |
| 분할 weight | Token 45% + Duration proxy 35% + 줄 20% | 2026-07-15 (구: 줄60+글자40) |

옵션 UI: `app/components/nrm/settings/NrmMelonSyncSettingsPanel.tsx` (`firstLineIntroCorrection`, quality 등).

---

## 8. 회귀 체크리스트 (개선 PR/작업 후)

- [ ] 한국어 곡 + 영어 곡 각 1곡 이상 (또는 사용자 제공 샘플)
- [ ] 인트로 긴 곡 (~30s+, Dangerously 유형)
- [ ] 3분+ 곡에서 2패스 분할 발생 시 경계 로그 확인
- [ ] `align_ok` / `align_done` 실패 없음
- [ ] 생성 시간이 이전 대비 **2배 초과**하지 않는지 (로그 `alignMs`, `elapsedMs`)
- [ ] 이 문서 「개선 히스토리」 갱신

---

## 9. 관련 문서

- `docs/WAV2VEC2-BASE-ALIGN-HF-MIGRATION.md` — 모델 호스팅·다운로드
- `docs/BUILD-VERIFY-RULE.md` — 빌드 검증
- `.cursor/rules/nrm-melon-sync-lyrics.mdc` — 에이전트 자동 참조 규칙
