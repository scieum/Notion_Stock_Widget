/**
 * 외부 호출 공통 재시도 — 지수 백오프 (CLAUDE.md §6, C4).
 * 기본 3회. 마지막 시도까지 실패하면 마지막 에러를 throw한다(호출부에서 스킵+로그).
 */
export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  /** 백오프 상한 */
  maxMs?: number;
  /** 재시도 사이 대기 (테스트에서 주입). 기본 setTimeout */
  sleep?: (ms: number) => Promise<void>;
  /** 시도 로그 (선택) */
  onRetry?: (attempt: number, err: unknown) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 300;
  const maxMs = opts.maxMs ?? 5000;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      opts.onRetry?.(attempt, err);
      const delay = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
  throw lastErr;
}
