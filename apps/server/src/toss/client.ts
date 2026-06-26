import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CandleSchema,
  QuoteSchema,
  RankedQuoteSchema,
  TossHoldingSchema,
  type Candle,
  type CandleInterval,
  type Market,
  type Quote,
  type RankedQuote,
  type TossHolding,
} from "@toss-notion/core";
import type { Config } from "../config.js";
import { getSecurity, SECURITIES } from "../directory.js";
import { tossLogoUrl } from "./logo.js";
import { log } from "../util/logger.js";
import { withRetry } from "../util/retry.js";
import { TokenManager } from "./token.js";

/**
 * 토스 조회 전용 클라이언트 (부록 A). fixture와 live 둘 다 동일 zod 스키마를 통과한다.
 * 키 수령 시 live 어댑터만 채우면 된다 (CLAUDE.md §2).
 */
export interface TossClient {
  /** 요청한 티커들의 현재가. 일부 누락 가능(스킵+로그). */
  getQuotes(tickers: string[]): Promise<Quote[]>;
  /** 토스증권 계좌 보유내역(국내+국외). */
  getHoldings(): Promise<TossHolding[]>;
  /** 국내/국외 시장 규모 상위 100 랭킹(트리맵·표용). */
  getTopMovers(market: Market): Promise<RankedQuote[]>;
  /** 캔들(OHLCV) — 차트용. 간격별 count개, 오래된→최신 순. */
  getCandles(ticker: string, interval: CandleInterval, count: number): Promise<Candle[]>;
}

/** 간격별 봉 간격(ms) — fixture 합성·라이브 폴백의 시각 스탬프용. */
const INTERVAL_MS: Record<CandleInterval, number> = {
  tick: 10_000,
  "1m": 60_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000, // ~30일
};

/** 간격별 봉 변동성(시각화용 진폭). */
const INTERVAL_VOL: Record<CandleInterval, number> = {
  tick: 0.0015,
  "1m": 0.003,
  "1d": 0.02,
  "1w": 0.04,
  "1M": 0.07,
};

/** 결정론적 PRNG(mulberry32) — 같은 (ticker,interval)이면 항상 같은 캔들. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 디렉터리 기준가에서 결정론적 OHLCV 캔들을 합성.
 * fixture 모드 + 라이브 캔들 실패 시 폴백으로 공용 사용(차트가 항상 그려지도록).
 */
function synthCandles(ticker: string, interval: CandleInterval, count: number, now: number): Candle[] {
  const sec = getSecurity(ticker);
  const base = sec && sec.price > 0 ? sec.price : 50_000;
  const currency = sec?.currency ?? "KRW";
  const round = (n: number) => Math.max(0.01, currency === "KRW" ? Math.round(n) : Math.round(n * 100) / 100);
  const step = INTERVAL_MS[interval];
  const vol = INTERVAL_VOL[interval];
  const rnd = mulberry32(hashStr(`${ticker}|${interval}`));
  const startTime = now - step * (count - 1);
  let price = base * (0.9 + rnd() * 0.2);
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = open * (1 + (rnd() - 0.5) * 2 * vol);
    const high = Math.max(open, close) * (1 + rnd() * vol * 0.6);
    const low = Math.min(open, close) * (1 - rnd() * vol * 0.6);
    out.push(
      CandleSchema.parse({
        time: startTime + i * step,
        open: round(open),
        high: round(high),
        low: round(low),
        close: round(close),
        volume: Math.round(1_000 + rnd() * 100_000),
      }),
    );
    price = close;
  }
  return out;
}

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** 티커 기반 결정론적 등락률 — fixture에서 안정적·다양한 시세를 합성하기 위함(±6%). */
function seededRate(ticker: string): number {
  let h = 2166136261;
  for (let i = 0; i < ticker.length; i++) {
    h ^= ticker.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (h >>> 0) / 0xffffffff; // 0..1
  return Math.round((u - 0.5) * 0.12 * 10000) / 10000; // -0.06..0.06, 0.0001 단위
}

/** 통화별 가격 반올림(KRW=정수, 그 외 소수 2자리). */
function roundPrice(price: number, currency: string): number {
  return currency === "KRW" ? Math.round(price) : Math.round(price * 100) / 100;
}

/** 디렉터리 기준가(전일종가)에서 결정론적 시세 1건을 합성. */
function synthQuote(ticker: string, override?: { price: number; changeRate: number }, asOf = 0): Quote | null {
  const sec = getSecurity(ticker);
  // 기준가가 없는 종목(전체 마스터 보강분 price=0)은 fixture 합성 불가 → 스킵.
  if (!override && (!sec || !(sec.price > 0))) return null;
  const currency = sec?.currency ?? "KRW";
  const market = sec?.market ?? "domestic";
  if (override) {
    const prevClose = override.price / (1 + override.changeRate);
    return QuoteSchema.parse({
      ticker,
      price: override.price,
      changeRate: override.changeRate,
      change: roundPrice(override.price - prevClose, currency),
      market,
      currency,
      asOf,
    });
  }
  const rate = seededRate(ticker);
  const price = roundPrice(sec!.price * (1 + rate), currency);
  return QuoteSchema.parse({
    ticker,
    price,
    changeRate: rate,
    change: roundPrice(price - sec!.price, currency),
    market,
    currency,
    asOf,
  });
}

/** fixture 모드 — 키 수령 전 전체 파이프라인을 굴리기 위한 구현. now()는 신선도 스탬프용. */
export function createFixtureTossClient(now: () => number = Date.now): TossClient {
  return {
    async getQuotes(tickers) {
      // quotes.json은 데모용 고정 오버라이드. 없는 종목은 디렉터리에서 합성.
      const raw = JSON.parse(await readFile(join(fixturesDir, "quotes.json"), "utf8")) as Array<{
        ticker: string;
        price: number;
        changeRate: number;
      }>;
      const overrides = new Map(raw.map((q) => [q.ticker, q]));
      const asOf = now();
      const out: Quote[] = [];
      for (const t of tickers) {
        const q = synthQuote(t, overrides.get(t), asOf);
        if (q) out.push(q);
        else log.warn("[toss] 디렉터리에 없는 티커 — 시세 스킵", { ticker: t });
      }
      return out;
    },
    async getHoldings() {
      const raw = JSON.parse(await readFile(join(fixturesDir, "holdings.json"), "utf8")) as Array<{
        ticker: string;
        quantity: number;
        avgPrice?: number;
        currency?: string;
      }>;
      // 시장/통화는 디렉터리로 보정(국내+국외 혼재).
      return raw.map((h) => {
        const sec = getSecurity(h.ticker);
        return TossHoldingSchema.parse({
          ...h,
          market: sec?.market ?? "domestic",
          currency: h.currency ?? sec?.currency ?? "KRW",
        });
      });
    },
    async getTopMovers(market) {
      const top = SECURITIES.filter((s) => !s.isEtf && s.market === market && s.marketCap > 0)
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, 100);
      return top.map((s, i) => {
        const rate = seededRate(s.ticker);
        const price = roundPrice(s.price * (1 + rate), s.currency);
        return RankedQuoteSchema.parse({
          rank: i + 1,
          ticker: s.ticker,
          name: s.name,
          price,
          change: roundPrice(price - s.price, s.currency),
          changeRate: rate,
          sector: s.sector,
          marketCap: s.marketCap,
          market: s.market,
          currency: s.currency,
          logoUrl: tossLogoUrl(s.ticker),
        });
      });
    },
    async getCandles(ticker, interval, count) {
      return synthCandles(ticker, interval, count, now());
    },
  };
}

/* ───────────────────────── live (실 토스 OpenAPI) ─────────────────────────
 * 엔드포인트(2026-06 OpenAPI 기준, base=openapi.tossinvest.com):
 *   POST /oauth2/token              client_credentials → access_token (token.ts)
 *   GET  /api/v1/prices?symbols=    현재가(최대 200, 콤마). result[]: {symbol,timestamp,lastPrice,currency}
 *   GET  /api/v1/candles?symbol&interval=1d&count=2   전일종가(등락 계산용)
 *   GET  /api/v1/accounts           계좌목록 → accountSeq (X-Tossinvest-Account)
 *   GET  /api/v1/holdings           보유내역(Bearer + X-Tossinvest-Account)
 *
 * 주의: prices 응답에 등락률/전일종가가 없다 → 일봉(candles)에서 전일종가를 받아
 *       changeRate·change를 파생한다. 전일종가는 하루 단위로만 바뀌므로 일자별 캐시.
 *       랭킹(TOP100) 전용 엔드포인트는 없음 → 디렉터리 기준가로 등락 근사(§5.4 참고용).
 * 레이트리밋: 순차 호출 + withRetry 지수백오프(C4). 시크릿·토큰 로그 금지(C1).
 */

interface PriceItem {
  symbol: string;
  timestamp: string;
  lastPrice: string;
  currency: string;
}
interface CandleItem {
  timestamp: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  closePrice: string;
  tradingVolume?: string;
}

/**
 * 앱 간격 → 토스 캔들 interval 토큰. 스펙 확정 전 추정값(§12: OpenAPI 재확인).
 * 토스 캔들은 봉 단위라 '틱'은 최소 분봉으로 근사(실패 시 합성 폴백).
 */
const TOSS_INTERVAL: Record<CandleInterval, string> = {
  tick: "1m",
  "1m": "1m",
  "1d": "1d",
  "1w": "1w",
  "1M": "1M",
};
interface AccountItem {
  accountNo: string;
  accountSeq: number;
  accountType: string;
}
interface HoldingItem {
  symbol: string;
  name?: string;
  marketCountry?: string;
  currency?: string;
  quantity: string;
  averagePurchasePrice?: string;
}

/** 토스는 가격을 문자열로 준다 → 숫자화. 빈/비정상 값은 null. */
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function marketOf(currency: string | undefined, marketCountry?: string): Market {
  if (marketCountry) return marketCountry.toUpperCase() === "KR" ? "domestic" : "overseas";
  return (currency ?? "KRW").toUpperCase() === "KRW" ? "domestic" : "overseas";
}

/** 토스 시세/일봉이 받는 심볼(코드) 형식. 한글 종목명 등은 여기에 안 맞아 거른다. */
const TOSS_SYMBOL = /^[A-Za-z0-9.\-]+$/;

export function createLiveTossClient(config: Config): TossClient {
  if (!config.TOSS_CLIENT_ID || !config.TOSS_CLIENT_SECRET) {
    throw new Error(
      "[toss] live 모드에 TOSS_CLIENT_ID/TOSS_CLIENT_SECRET 필요. .env 확인 또는 DATA_SOURCE=fixture.",
    );
  }
  const base = config.TOSS_API_BASE;
  const tokens = new TokenManager({
    apiBase: base,
    clientId: config.TOSS_CLIENT_ID,
    clientSecret: config.TOSS_CLIENT_SECRET,
  });

  /** Bearer 인증 GET → JSON. 4xx/5xx는 throw(상위에서 재시도/스킵). */
  async function authedGet<T>(path: string, extraHeaders: Record<string, string> = {}): Promise<T> {
    const token = await tokens.getAccessToken();
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GET ${path} → ${res.status} ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  /** 토스 응답 봉투는 {result: ...} 형태. result를 꺼낸다. */
  function unwrap<T>(json: unknown): T {
    if (json && typeof json === "object" && "result" in json) {
      return (json as { result: T }).result;
    }
    return json as T;
  }

  // 전일종가 일자별 캐시 (등락 계산용). key=symbol, value={day, prevClose}.
  const prevCloseCache = new Map<string, { day: string; prevClose: number }>();
  const dayKey = () => new Date().toISOString().slice(0, 10);

  /** 일봉 2개에서 전일종가(마지막 직전 봉)를 구한다. 실패 시 디렉터리 기준가 폴백. */
  async function getPrevClose(symbol: string): Promise<number | null> {
    const today = dayKey();
    const cached = prevCloseCache.get(symbol);
    if (cached && cached.day === today) return cached.prevClose;
    try {
      const json = await withRetry(() =>
        authedGet<unknown>(
          `/api/v1/candles?symbol=${encodeURIComponent(symbol)}&interval=1d&count=2`,
        ),
      );
      // 토스 일봉 응답은 {result:{candles:[...]}} 이고 최신순(newest-first)이다.
      // candles[0]=오늘(진행중) → '오늘이 아닌 가장 최근 봉'이 전일종가. 전부 오늘뿐이면 그걸 사용.
      const result = unwrap<{ candles?: CandleItem[] }>(json);
      const candles = result?.candles ?? [];
      const prev = candles.find((c) => c.timestamp.slice(0, 10) !== today) ?? candles[0];
      const close = num(prev?.closePrice);
      if (close && close > 0) {
        prevCloseCache.set(symbol, { day: today, prevClose: close });
        return close;
      }
    } catch (err) {
      log.warn("[toss] 전일종가(candle) 실패 — 디렉터리 기준가 폴백", {
        symbol,
        msg: (err as Error).message,
      });
    }
    const dir = getSecurity(symbol);
    return dir ? dir.price : null;
  }

  async function fetchPrices(symbols: string[]): Promise<PriceItem[]> {
    // 토스 prices는 symbols에 코드 형식만 받는다(^[A-Za-z0-9.,-]+). 한글 종목명 등
    // 형식에 안 맞는 값이 하나라도 섞이면 요청 전체가 400 → 정상 코드까지 못 받는다.
    // 보내기 전에 코드가 아닌 심볼은 걸러낸다(스킵+로그, §6: 배치 전체를 죽이지 않는다).
    const valid = symbols.filter((s) => {
      if (TOSS_SYMBOL.test(s)) return true;
      log.warn("[toss] 코드 형식이 아닌 심볼 — 시세 스킵", { symbol: s });
      return false;
    });
    const out: PriceItem[] = [];
    // 최대 200개/요청. 순차 호출.
    for (let i = 0; i < valid.length; i += 200) {
      const chunk = valid.slice(i, i + 200);
      const json = await withRetry(() =>
        authedGet<unknown>(`/api/v1/prices?symbols=${chunk.map(encodeURIComponent).join(",")}`),
      );
      out.push(...(unwrap<PriceItem[]>(json) ?? []));
    }
    return out;
  }

  let accountSeq: number | null = null;
  async function resolveAccountSeq(): Promise<number> {
    if (accountSeq != null) return accountSeq;
    // 사용자가 명시한 계좌가 있으면 우선.
    if (config.TOSS_ACCOUNT && /^\d+$/.test(config.TOSS_ACCOUNT)) {
      accountSeq = Number(config.TOSS_ACCOUNT);
      return accountSeq;
    }
    const json = await withRetry(() => authedGet<unknown>(`/api/v1/accounts`));
    const accounts = unwrap<AccountItem[]>(json) ?? [];
    const brokerage = accounts.find((a) => a.accountType === "BROKERAGE") ?? accounts[0];
    if (!brokerage) throw new Error("토스 계좌 없음 (/api/v1/accounts 빈 응답)");
    accountSeq = brokerage.accountSeq;
    return accountSeq;
  }

  return {
    async getQuotes(tickers) {
      if (tickers.length === 0) return [];
      const prices = await fetchPrices(tickers);
      const asOfFallback = Date.now();
      const out: Quote[] = [];
      for (const p of prices) {
        const price = num(p.lastPrice);
        if (!price || price <= 0) {
          log.warn("[toss] 비정상 현재가 — 스킵", { symbol: p.symbol });
          continue;
        }
        const currency = p.currency ?? getSecurity(p.symbol)?.currency ?? "KRW";
        const prevClose = await getPrevClose(p.symbol);
        const changeRate = prevClose && prevClose > 0 ? (price - prevClose) / prevClose : 0;
        const ts = Date.parse(p.timestamp);
        out.push(
          QuoteSchema.parse({
            ticker: p.symbol,
            price: roundPrice(price, currency),
            changeRate: Math.round(changeRate * 1_000_000) / 1_000_000,
            change: prevClose ? roundPrice(price - prevClose, currency) : undefined,
            market: marketOf(currency),
            currency,
            asOf: Number.isFinite(ts) ? ts : asOfFallback,
          }),
        );
      }
      return out;
    },

    async getHoldings() {
      const seq = await resolveAccountSeq();
      const json = await withRetry(() =>
        authedGet<unknown>(`/api/v1/holdings`, { "X-Tossinvest-Account": String(seq) }),
      );
      const overview = unwrap<{ items?: HoldingItem[] }>(json);
      const items = overview?.items ?? [];
      const out: TossHolding[] = [];
      for (const h of items) {
        const quantity = num(h.quantity);
        if (quantity == null) continue;
        const currency = h.currency ?? getSecurity(h.symbol)?.currency ?? "KRW";
        const avg = num(h.averagePurchasePrice);
        out.push(
          TossHoldingSchema.parse({
            ticker: h.symbol,
            quantity,
            ...(avg != null && avg >= 0 ? { avgPrice: avg } : {}),
            market: marketOf(currency, h.marketCountry),
            currency,
          }),
        );
      }
      return out;
    },

    async getTopMovers(market) {
      // 토스에 랭킹 전용 엔드포인트가 없다 → 디렉터리 시총 상위 100의 실시간 시세로 구성.
      // 등락은 디렉터리 기준가 대비(참고용 §5.4). 시세는 한 번에 배치 조회.
      const top = SECURITIES.filter((s) => !s.isEtf && s.market === market && s.marketCap > 0)
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, 100);
      const priceMap = new Map<string, number>();
      try {
        const prices = await fetchPrices(top.map((s) => s.ticker));
        for (const p of prices) {
          const v = num(p.lastPrice);
          if (v && v > 0) priceMap.set(p.symbol, v);
        }
      } catch (err) {
        log.warn("[toss] TOP 시세 배치 실패 — 기준가로 표시", { msg: (err as Error).message });
      }
      return top.map((s, i) => {
        const price = roundPrice(priceMap.get(s.ticker) ?? s.price, s.currency);
        const rate = s.price > 0 ? (price - s.price) / s.price : 0;
        return RankedQuoteSchema.parse({
          rank: i + 1,
          ticker: s.ticker,
          name: s.name,
          price,
          change: roundPrice(price - s.price, s.currency),
          changeRate: Math.round(rate * 1_000_000) / 1_000_000,
          sector: s.sector,
          marketCap: s.marketCap,
          market: s.market,
          currency: s.currency,
          logoUrl: tossLogoUrl(s.ticker),
        });
      });
    },

    async getCandles(ticker, interval, count) {
      // 코드 형식이 아니면(한글명 등) 토스 호출 불가 → 바로 합성.
      if (!TOSS_SYMBOL.test(ticker)) return synthCandles(ticker, interval, count, Date.now());
      try {
        const token = TOSS_INTERVAL[interval];
        const json = await withRetry(() =>
          authedGet<unknown>(
            `/api/v1/candles?symbol=${encodeURIComponent(ticker)}&interval=${token}&count=${count}`,
          ),
        );
        const result = unwrap<{ candles?: CandleItem[] }>(json);
        const raw = result?.candles ?? [];
        const currency = getSecurity(ticker)?.currency ?? "KRW";
        const round = (n: number) => roundPrice(n, currency);
        const candles: Candle[] = [];
        for (const c of raw) {
          const close = num(c.closePrice);
          if (!close || close <= 0) continue;
          // O/H/L 누락 시 종가로 대체(최소한 선으로는 보이도록).
          const open = num(c.openPrice) ?? close;
          const high = num(c.highPrice) ?? Math.max(open, close);
          const low = num(c.lowPrice) ?? Math.min(open, close);
          const vol = num(c.tradingVolume);
          const ts = Date.parse(c.timestamp);
          candles.push(
            CandleSchema.parse({
              time: Number.isFinite(ts) ? ts : Date.now(),
              open: round(open),
              high: round(Math.max(high, open, close)),
              low: round(Math.min(low, open, close)),
              close: round(close),
              ...(vol != null && vol >= 0 ? { volume: vol } : {}),
            }),
          );
        }
        if (candles.length > 0) {
          // 토스 응답은 최신순 → 오래된→최신으로 정렬.
          candles.sort((a, b) => a.time - b.time);
          return candles.slice(-count);
        }
        log.warn("[toss] 캔들 빈 응답 — 합성 폴백", { ticker, interval });
      } catch (err) {
        log.warn("[toss] 캔들 조회 실패 — 합성 폴백", {
          ticker,
          interval,
          msg: (err as Error).message,
        });
      }
      return synthCandles(ticker, interval, count, Date.now());
    },
  };
}

export function createTossClient(config: Config): TossClient {
  if (config.DATA_SOURCE === "fixture") {
    log.info("[toss] fixture 모드로 시작");
    return createFixtureTossClient();
  }
  log.info("[toss] live 모드로 시작");
  return createLiveTossClient(config);
}
