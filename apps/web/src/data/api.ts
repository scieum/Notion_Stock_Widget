import type { Candle, CandleInterval, Market, Quote, RankedQuote } from "@toss-notion/core";

/** 위젯은 자체 백엔드만 호출한다 (CLAUDE.md §6). vite proxy가 /api → :3000 */

export async function fetchQuotes(tickers: string[]): Promise<Quote[]> {
  if (tickers.length === 0) return [];
  const res = await fetch(`/api/quotes?tickers=${encodeURIComponent(tickers.join(","))}`);
  if (!res.ok) throw new Error(`quotes ${res.status}`);
  return ((await res.json()) as { quotes: Quote[] }).quotes;
}

export interface Instrument {
  ticker: string;
  name: string;
  logoUrl: string;
  market: Market;
  currency: string;
}

export async function fetchInstruments(tickers: string[]): Promise<Instrument[]> {
  if (tickers.length === 0) return [];
  const res = await fetch(`/api/instruments?tickers=${encodeURIComponent(tickers.join(","))}`);
  if (!res.ok) throw new Error(`instruments ${res.status}`);
  return ((await res.json()) as { instruments: Instrument[] }).instruments;
}

export interface WatchlistItem {
  ticker: string;
  name: string;
  market: Market;
  currency: string;
}

export interface ResolveResponse {
  items: Array<{ query: string; ticker: string; name: string; market: Market; currency: string }>;
  unresolved: string[];
}

/** 코드 또는 종목명 목록을 종목으로 해석(이름만 적어도 매칭). */
export async function fetchResolve(queries: string[]): Promise<ResolveResponse> {
  if (queries.length === 0) return { items: [], unresolved: [] };
  const res = await fetch(`/api/resolve?q=${encodeURIComponent(queries.join(","))}`);
  if (!res.ok) throw new Error(`resolve ${res.status}`);
  return (await res.json()) as ResolveResponse;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  unresolved: string[];
  max: number;
}

/** 별도 '관심종목 DB'에서 코드/이름 매칭된 목록(최대 10). */
export async function fetchWatchlist(): Promise<WatchlistResponse> {
  const res = await fetch("/api/watchlist");
  if (!res.ok) throw new Error(`watchlist ${res.status}`);
  return (await res.json()) as WatchlistResponse;
}

export interface HoldingItem {
  ticker: string;
  name: string;
  market: Market;
  currency: string;
  avgPrice: number | null;
  quantity: number | null;
  currentPrice: number | null;
}

/** 종목 DB의 보유 종목(국내+국외). 라이브 평가손익은 시세로 위젯이 계산. */
export async function fetchHoldings(): Promise<HoldingItem[]> {
  const res = await fetch("/api/holdings");
  if (!res.ok) throw new Error(`holdings ${res.status}`);
  return ((await res.json()) as { items: HoldingItem[] }).items;
}

export interface EtfAfterHoursItem {
  ticker: string;
  name: string;
  market: Market;
  currency: string;
  basePrice: number | null;
  expectedPrice: number | null;
  expectedChange: number | null;
  expectedChangeRate: number | null;
  coverage: number;
}

/** 보유 ETF 시간외 예상가(구성종목 기반, 참고용). */
export async function fetchEtfAfterHours(): Promise<EtfAfterHoursItem[]> {
  const res = await fetch("/api/etf-after-hours");
  if (!res.ok) throw new Error(`etf ${res.status}`);
  return ((await res.json()) as { items: EtfAfterHoursItem[] }).items;
}

/** 국내/국외 시장 규모 상위 100. */
export async function fetchTop(market: Market): Promise<RankedQuote[]> {
  const res = await fetch(`/api/top?market=${market}`);
  if (!res.ok) throw new Error(`top ${res.status}`);
  return ((await res.json()) as { items: RankedQuote[] }).items;
}

export interface CandleResponse {
  ticker: string;
  interval: CandleInterval;
  candles: Candle[];
}

/** 캔들(OHLCV) — 차트용. ticker는 코드 또는 종목명(서버에서 코드로 해석). */
export async function fetchCandles(
  ticker: string,
  interval: CandleInterval,
  count = 80,
): Promise<CandleResponse> {
  const q = `ticker=${encodeURIComponent(ticker)}&interval=${interval}&count=${count}`;
  const res = await fetch(`/api/candles?${q}`);
  if (!res.ok) throw new Error(`candles ${res.status}`);
  return (await res.json()) as CandleResponse;
}
