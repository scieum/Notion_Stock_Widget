import type { Candle, CandleInterval, Market, Quote, RankedQuote } from "@toss-notion/core";
import { credentialHeaders } from "../store/credentials.js";

/**
 * 위젯은 자체 백엔드만 호출한다 (CLAUDE.md §6).
 * 개발: 빈 값 → vite proxy가 /api → :3000.
 * 배포(Vercel 등): VITE_API_BASE에 백엔드 URL을 넣으면 그쪽으로 호출(예: https://api.example.com).
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const api = (path: string) => `${API_BASE}${path}`;

/**
 * 모든 호출에 BYOK 자격증명 헤더를 붙인다(있으면 라이브, 없으면 백엔드가 fixture로 응답).
 * 키는 요청 시점에 localStorage에서 읽어 헤더로만 전달 — 어디에도 저장되지 않는다.
 */
const get = (path: string) => fetch(api(path), { headers: credentialHeaders() });

export async function fetchQuotes(tickers: string[]): Promise<Quote[]> {
  if (tickers.length === 0) return [];
  const res = await get(`/api/quotes?tickers=${encodeURIComponent(tickers.join(","))}`);
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
  const res = await get(`/api/instruments?tickers=${encodeURIComponent(tickers.join(","))}`);
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
  const res = await get(`/api/resolve?q=${encodeURIComponent(queries.join(","))}`);
  if (!res.ok) throw new Error(`resolve ${res.status}`);
  return (await res.json()) as ResolveResponse;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  unresolved: string[];
  max: number;
  /** live = 실제 Notion DB 연동, fixture = 예시 데이터(미연결) */
  source?: "live" | "fixture";
}

/**
 * 별도 '관심종목 DB'에서 코드/이름 매칭된 목록(최대 10).
 * dbId를 주면 그 Notion DB를 읽는다(서버 토큰 사용). 없으면 서버 기본 DB.
 */
export async function fetchWatchlist(dbId?: string): Promise<WatchlistResponse> {
  const qs = dbId ? `?dbId=${encodeURIComponent(dbId)}` : "";
  const res = await get(`/api/watchlist${qs}`);
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

export interface HoldingsResult {
  items: HoldingItem[];
  /** live = 실제 Notion DB 연동, fixture = 예시 데이터(미연결) */
  source: "live" | "fixture";
}

/**
 * 종목 DB의 보유 종목(국내+국외). 라이브 평가손익은 시세로 위젯이 계산.
 * dbId를 주면 그 Notion 종목 DB를 읽는다(서버 토큰 사용). 없으면 서버 기본 DB.
 */
export async function fetchHoldings(dbId?: string): Promise<HoldingsResult> {
  const qs = dbId ? `?dbId=${encodeURIComponent(dbId)}` : "";
  const res = await get(`/api/holdings${qs}`);
  if (!res.ok) throw new Error(`holdings ${res.status}`);
  const data = (await res.json()) as { items: HoldingItem[]; source?: "live" | "fixture" };
  return { items: data.items, source: data.source ?? "fixture" };
}

export interface NotionStatus {
  /** 서버에 NOTION_TOKEN이 설정돼 있는지(값은 노출 안 함). */
  hasToken: boolean;
  /** 서버 .env에 기본 종목 DB가 지정돼 있는지. */
  defaultStockDb: boolean;
}

/** 서버의 Notion 연결 상태(위젯 DB 연결 안내용). */
export async function fetchNotionStatus(): Promise<NotionStatus> {
  const res = await get("/api/notion-status");
  if (!res.ok) throw new Error(`notion status ${res.status}`);
  return (await res.json()) as NotionStatus;
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
  const res = await get("/api/etf-after-hours");
  if (!res.ok) throw new Error(`etf ${res.status}`);
  return ((await res.json()) as { items: EtfAfterHoursItem[] }).items;
}

/** 국내/국외 시장 규모 상위 100. */
export async function fetchTop(market: Market): Promise<RankedQuote[]> {
  const res = await get(`/api/top?market=${market}`);
  if (!res.ok) throw new Error(`top ${res.status}`);
  return ((await res.json()) as { items: RankedQuote[] }).items;
}

export interface Sentiment {
  market: Market;
  /** 0(극단적 공포)~100(극단적 탐욕) */
  index: number;
  label: string;
  up: number;
  down: number;
  neutral: number;
  count: number;
  avgChangeRate: number;
}

/** 공포·탐욕 지수(탐욕지수) — 대형주 바스켓 등락 기반. */
export async function fetchSentiment(market: Market): Promise<Sentiment> {
  const res = await get(`/api/sentiment?market=${market}`);
  if (!res.ok) throw new Error(`sentiment ${res.status}`);
  return (await res.json()) as Sentiment;
}

export interface CandleResponse {
  ticker: string;
  interval: CandleInterval;
  candles: Candle[];
  /** true면 실데이터가 아닌 합성 폴백(fixture 또는 라이브 실패). */
  synthetic?: boolean;
}

/** 캔들(OHLCV) — 차트용. ticker는 코드 또는 종목명(서버에서 코드로 해석). */
export async function fetchCandles(
  ticker: string,
  interval: CandleInterval,
  count = 80,
): Promise<CandleResponse> {
  const q = `ticker=${encodeURIComponent(ticker)}&interval=${interval}&count=${count}`;
  const res = await get(`/api/candles?${q}`);
  if (!res.ok) throw new Error(`candles ${res.status}`);
  return (await res.json()) as CandleResponse;
}
