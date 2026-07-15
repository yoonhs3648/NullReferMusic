/**
 * APK 업데이트 게이트 동안 콜드스타트 부수 작업(캐시 정리·ffmpeg 워밍)을 미룬다.
 * Innertube 워밍은 여기에 포함하지 않는다(최초 YouTube 검색 시).
 * 업데이트 프롬프트/다운로드 중에는 절대 실행하지 않는다.
 */

type GateState = 'pending' | 'blocking' | 'passed';

let gateState: GateState = 'pending';
const deferred: Array<() => void> = [];

/** 게이트 마운트·업데이트 필요 확정 시 — 부수 작업 중단 */
export function markNrmApkUpdateGateBlocking(): void {
  gateState = 'blocking';
}

/** 업데이트 불필요 또는 게이트 스킵 — 미뤄둔 작업 실행 가능 */
export function markNrmApkUpdateGatePassed(): void {
  gateState = 'passed';
  // 동기 flush는 메인 UI 페인트를 가로막음 → 다음 틱에 실행
  const jobs = deferred.splice(0, deferred.length);
  if (jobs.length === 0) return;
  setTimeout(() => {
    for (const job of jobs) {
      try {
        job();
      } catch {
        /* ignore */
      }
    }
  }, 0);
}

export function isNrmApkUpdateGateBlocking(): boolean {
  return gateState === 'blocking' || gateState === 'pending';
}

/**
 * 게이트 통과 후에만 실행. 이미 통과했으면 즉시(비동기 틱) 실행.
 * APK 다운로드 대역폭·JS 메인 스레드를 건드리지 않게 한다.
 */
export function runAfterNrmApkUpdateGate(job: () => void): void {
  if (gateState === 'passed') {
    setTimeout(job, 0);
    return;
  }
  deferred.push(job);
}
