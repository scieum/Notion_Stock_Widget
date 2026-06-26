import type { Market } from "@toss-notion/core";
import { resolveByQuery } from "./instruments.js";
import { log } from "./util/logger.js";
import type { WatchlistEntry } from "./notion/gateway.js";

export interface WatchlistItem {
  ticker: string;
  name: string;
  market: Market;
  currency: string;
}

export interface ResolvedWatchlist {
  items: WatchlistItem[];
  /** 코드·이름 어느 것으로도 못 찾은 입력값(사용자 안내용) */
  unresolved: string[];
}

/**
 * 관심종목 원본 행 → 표시용 종목 목록.
 *  - 코드 또는 종목명으로 매칭(resolveByQuery) — 사용자가 코드를 몰라도 됨.
 *  - order(있으면)로 정렬, 중복 티커 제거.
 *  - 최대 max개까지만(정책: 10). 초과분은 잘라내고 로그.
 */
export function resolveWatchlist(entries: WatchlistEntry[], max: number): ResolvedWatchlist {
  const sorted = [...entries].sort((a, b) => {
    const ao = a.order ?? Number.POSITIVE_INFINITY;
    const bo = b.order ?? Number.POSITIVE_INFINITY;
    return ao - bo;
  });

  const items: WatchlistItem[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  for (const e of sorted) {
    const inst = resolveByQuery(e.query);
    if (!inst) {
      unresolved.push(e.query);
      continue;
    }
    if (seen.has(inst.ticker)) continue;
    seen.add(inst.ticker);
    items.push({
      ticker: inst.ticker,
      name: inst.name,
      market: inst.market,
      currency: inst.currency,
    });
  }

  if (items.length > max) {
    log.warn("[watchlist] 최대 보관 수 초과 — 초과분 잘림", { max, total: items.length });
  }
  return { items: items.slice(0, max), unresolved };
}
