/**
 * 큰 배열을 한 번에 state에 밀어넣지 않고, 앞에서부터 청크 단위로 잘라
 * 조금씩 노출한다. 각 청크 사이에 이벤트 루프에 양보해 JS 스레드를
 * 막지 않고, 화면은 이미 로드된 만큼 먼저 보여준 뒤 나머지를 이어서 채운다.
 *
 * 네이티브 폴더 스캔(readDirectoryAsync/SAF) 자체는 단일 비동기 호출이라
 * 중간 결과를 스트리밍할 수 없지만, 그 결과를 받은 뒤 정렬·섹션 구성·
 * 리스트 마운트를 전부 한 번에 하지 않고 이 유틸로 나눠서 진행하면
 * 첫 화면이 훨씬 빨리 뜬다.
 */

export type RevealController = {
  cancel: () => void;
};

export function revealInChunks<T>(
  items: T[],
  onChunk: (visibleSoFar: T[]) => void,
  options?: { chunkSize?: number; firstChunkSize?: number },
): RevealController {
  const chunkSize = Math.max(1, options?.chunkSize ?? 250);
  // 첫 화면은 더 작은 청크로 최대한 빨리 그려서 "초기화 중" 화면을 즉시 벗어난다
  const firstChunkSize = Math.max(1, Math.min(options?.firstChunkSize ?? 60, chunkSize));
  let cancelled = false;
  const controller: RevealController = {
    cancel: () => {
      cancelled = true;
    },
  };

  if (items.length <= firstChunkSize) {
    onChunk(items);
    return controller;
  }

  let end = firstChunkSize;
  onChunk(items.slice(0, end));

  const step = () => {
    if (cancelled) return;
    end = Math.min(end + chunkSize, items.length);
    onChunk(items.slice(0, end));
    if (end < items.length && !cancelled) {
      setTimeout(step, 0);
    }
  };
  setTimeout(step, 0);

  return controller;
}

/** revealInChunks를 Promise로 감싸 "전부 노출 완료"를 기다릴 수 있게 한다 */
export function revealInChunksAsync<T>(
  items: T[],
  onChunk: (visibleSoFar: T[]) => void,
  options?: { chunkSize?: number },
): { controller: RevealController; done: Promise<void> } {
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const inner = revealInChunks(
    items,
    (visibleSoFar) => {
      onChunk(visibleSoFar);
      if (visibleSoFar.length === items.length) resolveDone();
    },
    options,
  );

  // cancel() 호출 시 스케줄된 다음 청크도 멈추고, 대기 중인 done도 즉시 풀어줘야
  // 취소한 쪽의 reload()가 `await done`에서 영원히 멈추지 않는다.
  const controller: RevealController = {
    cancel: () => {
      inner.cancel();
      resolveDone();
    },
  };

  return { controller, done };
}
