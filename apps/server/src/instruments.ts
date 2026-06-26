import type { Market } from "@toss-notion/core";
import { getSecurity, lookup } from "./directory.js";
import { tossLogoUrl } from "./toss/logo.js";

/**
 * 종목 표시정보(이름·로고·시장·통화). 디렉터리(directory.ts)에서 가져온다.
 * 사전에 없으면 이름은 티커로 폴백(국내·KRW로 가정).
 */
export interface Instrument {
  ticker: string;
  name: string;
  logoUrl: string;
  market: Market;
  currency: string;
}

export function resolveInstrument(ticker: string): Instrument {
  const s = getSecurity(ticker);
  return {
    ticker,
    name: s?.name ?? ticker,
    logoUrl: tossLogoUrl(ticker),
    market: s?.market ?? "domestic",
    currency: s?.currency ?? "KRW",
  };
}

/**
 * 코드 또는 종목명으로 종목을 찾아 표시정보를 돌려준다(관심종목 이름 매칭용).
 * 못 찾으면 null.
 */
export function resolveByQuery(query: string): Instrument | null {
  const s = lookup(query);
  if (!s) return null;
  return {
    ticker: s.ticker,
    name: s.name,
    logoUrl: tossLogoUrl(s.ticker),
    market: s.market,
    currency: s.currency,
  };
}
