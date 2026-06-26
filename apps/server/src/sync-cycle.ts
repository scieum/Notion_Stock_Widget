import type { Quote } from "@toss-notion/core";
import type { QuoteCache } from "./cache/quote-cache.js";
import type { Config } from "./config.js";
import { isDomesticOpen, isOverseasOpen } from "./market.js";
import { syncCurrentPrices } from "./notion/price-sync.js";
import type { NotionStockGateway } from "./notion/gateway.js";
import { log } from "./util/logger.js";

/**
 * 주기 동기화 1사이클 (CLAUDE.md §3 주기 경로, §6 로깅, §7 임계).
 *  - 종목 DB 행을 읽어 대상 티커 수집(국내+국외).
 *  - 장중 시장이 하나도 없으면 MARKET_CLOSED — 종가 유지, 쓰기 없음.
 *  - 시세 확보율이 임계(기본 90%) 미만이면 DEGRADED — 사이클 스킵.
 *  - 임계 이상이면 변경된 현재가만 종목 DB에 주입(소유권 §5: 현재가 1필드만).
 */
export async function runSyncCycle(
  gateway: NotionStockGateway,
  cache: QuoteCache,
  config: Config,
): Promise<void> {
  const rows = await gateway.listStockRows();
  const tickers = [...new Set(rows.map((r) => r.ticker))];
  if (tickers.length === 0) {
    log.info("[sync] 대상 종목 없음");
    return;
  }

  const anyOpen = isDomesticOpen() || isOverseasOpen();
  if (!anyOpen) {
    log.info("[sync] MARKET_CLOSED — 종가 유지, 동기화 스킵");
    return;
  }

  let quotes: Quote[] = [];
  try {
    quotes = await cache.getQuotes(tickers);
  } catch (err) {
    log.error("[sync] 시세 조회 실패 — 사이클 스킵", { msg: (err as Error).message });
    return;
  }

  const rate = quotes.length / tickers.length;
  if (rate < config.QUOTE_SUCCESS_THRESHOLD) {
    log.warn("[sync] DEGRADED — 시세 확보율 미달, 쓰기 스킵", {
      got: quotes.length,
      want: tickers.length,
      rate: Number(rate.toFixed(2)),
    });
    return;
  }

  const byTicker = new Map(quotes.map((q) => [q.ticker, q]));
  const result = await syncCurrentPrices(gateway, byTicker);
  log.info("[sync] LIVE", {
    updated: result.updated,
    unchanged: result.unchanged,
    skippedNoQuote: result.skippedNoQuote,
    failures: result.failures.length,
  });
}
