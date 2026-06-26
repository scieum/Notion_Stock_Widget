import { etfAfterHoursEstimate, type EtfDef, type Market, type Quote } from "@toss-notion/core";
import type { QuoteCache } from "./cache/quote-cache.js";
import { getSecurity } from "./directory.js";
import { log } from "./util/logger.js";

export interface EtfAfterHoursView {
  ticker: string;
  name: string;
  market: Market;
  currency: string;
  /** 기준가(정규장 종가) */
  basePrice: number | null;
  expectedPrice: number | null;
  expectedChange: number | null;
  expectedChangeRate: number | null;
  /** 시세 확보 구성종목 비중(0~1) */
  coverage: number;
}

/**
 * 보유 ETF들의 시간외 예상가(구성종목 기반) 계산 — 위젯 표시 전용(§1: Notion에 쓰지 않음).
 * 기준가 = ETF 자체 현재가(정규장 종가). 구성종목 시세는 캐시에서 모아 가중합.
 */
export async function computeEtfAfterHours(
  etfs: EtfDef[],
  cache: QuoteCache,
): Promise<EtfAfterHoursView[]> {
  // ETF 본체 + 모든 구성종목 티커를 한 번에 모아 시세 조회(캐시 공유).
  const allTickers = new Set<string>();
  for (const etf of etfs) {
    allTickers.add(etf.ticker);
    for (const c of etf.constituents) allTickers.add(c.ticker);
  }

  let quotes: Quote[] = [];
  try {
    quotes = await cache.getQuotes([...allTickers]);
  } catch (err) {
    log.error("[etf] 시세 조회 실패", { msg: (err as Error).message });
  }
  const byTicker = new Map(quotes.map((q) => [q.ticker, q]));

  return etfs.map((etf) => {
    const sec = getSecurity(etf.ticker);
    const base = byTicker.get(etf.ticker)?.price ?? null;
    const est =
      base != null
        ? etfAfterHoursEstimate(base, etf.constituents, byTicker)
        : { expectedPrice: null, expectedChange: null, expectedChangeRate: null, coverage: 0 };
    return {
      ticker: etf.ticker,
      name: etf.name ?? sec?.name ?? etf.ticker,
      market: etf.market,
      currency: sec?.currency ?? "KRW",
      basePrice: base,
      expectedPrice: est.expectedPrice,
      expectedChange: est.expectedChange,
      expectedChangeRate: est.expectedChangeRate,
      coverage: est.coverage,
    };
  });
}
