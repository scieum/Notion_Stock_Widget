import type { Quote } from "@toss-notion/core";
import { withRetry } from "../util/retry.js";
import type { NotionStockGateway } from "./gateway.js";

/**
 * S4(필수) 종목 DB 현재가 주입 (CLAUDE.md §5, notion-sync 스킬).
 *  - 티커/코드를 매칭 키로 page를 찾는다.
 *  - 값이 바뀐 행만 쓴다(변경 없는 쓰기 생략 → 레이트리밋 절약).
 *  - ~3 req/s 준수: 쓰기 사이 최소 간격.
 *  - 레코드 단위 재시도 → 실패분은 failures로 반환(호출부가 실패 큐에 적재).
 *  - 평단가·수량 등 다른 필드는 절대 쓰지 않는다(게이트웨이에 통로 자체가 없음).
 */

export interface PriceSyncFailure {
  pageId: string;
  ticker: string;
  error: string;
}

export interface PriceSyncResult {
  updated: number;
  unchanged: number;
  /** 시세를 못 구해 건너뛴 종목(개별 스킵) */
  skippedNoQuote: number;
  failures: PriceSyncFailure[];
}

export interface PriceSyncOptions {
  /** Notion 레이트리밋(~3 req/s) 준수용 쓰기 간 최소 간격. 기본 350ms (C5) */
  minIntervalMs?: number;
  /** 대기 함수 (테스트 주입). 기본 setTimeout */
  sleep?: (ms: number) => Promise<void>;
  /** 재시도 횟수. 기본 3 */
  retries?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function syncCurrentPrices(
  gateway: NotionStockGateway,
  quotesByTicker: ReadonlyMap<string, Quote>,
  opts: PriceSyncOptions = {},
): Promise<PriceSyncResult> {
  const minIntervalMs = opts.minIntervalMs ?? 350;
  const sleep = opts.sleep ?? defaultSleep;
  const retries = opts.retries ?? 3;

  const rows = await gateway.listStockRows();
  const result: PriceSyncResult = {
    updated: 0,
    unchanged: 0,
    skippedNoQuote: 0,
    failures: [],
  };

  let first = true;
  for (const row of rows) {
    const quote = quotesByTicker.get(row.ticker);
    if (!quote) {
      result.skippedNoQuote++;
      continue;
    }
    if (row.currentPrice === quote.price) {
      result.unchanged++;
      continue;
    }

    // 실제 쓰기 직전에만 레이트리밋 간격 적용
    if (!first) await sleep(minIntervalMs);
    first = false;

    try {
      await withRetry(() => gateway.updateCurrentPrice(row.pageId, quote.price), {
        retries,
        sleep,
      });
      result.updated++;
    } catch (err) {
      result.failures.push({
        pageId: row.pageId,
        ticker: row.ticker,
        error: (err as Error).message,
      });
    }
  }

  return result;
}
