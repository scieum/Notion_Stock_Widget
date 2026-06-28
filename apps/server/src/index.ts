import express from "express";
import cron from "node-cron";
import { CandleInterval, Market } from "@toss-notion/core";
import { config } from "./config.js";
import { createTossClient } from "./toss/client.js";
import { QuoteCache } from "./cache/quote-cache.js";
import { SECURITIES } from "./directory.js";
import { resolveByQuery, resolveInstrument } from "./instruments.js";
import {
  createNotionGateways,
  notionHasToken,
  resolveStockGateway,
  resolveWatchlistGateway,
} from "./notion/factory.js";
import { resolveWatchlist } from "./watchlist-service.js";
import { computeEtfAfterHours } from "./etf-service.js";
import { runSyncCycle } from "./sync-cycle.js";
import { log } from "./util/logger.js";

/**
 * 백엔드 진입점 (CLAUDE.md §3 두 경로):
 *  1) API 레이어  — 위젯에 라이브 시세/관심종목/보유/ETF시간외/TOP100 제공(단기 캐시)
 *  2) 스케줄러    — node-cron 장중 주기로 종목DB.현재가 동기화
 */
const app = express();
app.use(express.json());

// CORS — 위젯은 Vercel 등 다른 오리진(또는 Notion iframe)에서 이 API를 호출한다.
// 조회 전용 공개 API(쿠키/인증 없음)라 기본은 모든 오리진 허용.
// WEB_ORIGIN을 지정하면 그 오리진만 허용한다(콤마로 여러 개).
const allowedOrigins = (process.env.WEB_ORIGIN ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const toss = createTossClient(config);
const quoteCache = new QuoteCache(toss, config.QUOTE_CACHE_TTL_MS);
const notion = createNotionGateways(config);

app.get("/health", (_req, res) => {
  res.json({ ok: true, dataSource: config.DATA_SOURCE });
});

function parseTickers(q: unknown): string[] {
  return String(q ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Notion DB ID 정규화. 링크/대시 포함 입력에서 32자리 hex만 추출한다.
 * (사용자가 DB URL을 통째로 붙여넣어도 동작.) 형식이 아니면 undefined.
 */
function normalizeNotionId(q: unknown): string | undefined {
  const m = String(q ?? "")
    .replace(/-/g, "")
    .match(/[0-9a-fA-F]{32}/);
  return m ? m[0] : undefined;
}

// 서버 Notion 연결 상태 — 위젯 설정 UI 안내용. 토큰 값 자체는 절대 노출하지 않는다(§6/C1).
app.get("/api/notion/status", (_req, res) => {
  res.json({
    hasToken: notionHasToken(config),
    defaultStockDb: Boolean(config.NOTION_STOCK_DB_ID),
  });
});

// [§8.1] 온디맨드 시세 — 단기 캐시. 예: /api/quotes?tickers=005930,NVDA
app.get("/api/quotes", async (req, res) => {
  const tickers = parseTickers(req.query.tickers);
  if (tickers.length === 0) {
    res.status(400).json({ error: "tickers query required" });
    return;
  }
  try {
    const quotes = await quoteCache.getQuotes(tickers);
    res.json({ quotes, ttlMs: config.QUOTE_CACHE_TTL_MS });
  } catch (err) {
    log.error("[api] /api/quotes 실패", { msg: (err as Error).message });
    res.status(502).json({ error: "quote fetch failed" });
  }
});

// 캔들(OHLCV) — 차트용. 예: /api/candles?ticker=005930&interval=1d&count=80
// ticker는 코드 또는 종목명(이름이면 코드로 resolve 후 조회).
app.get("/api/candles", async (req, res) => {
  const raw = String(req.query.ticker ?? "").trim();
  const interval = CandleInterval.safeParse(String(req.query.interval ?? "1d"));
  const count = Math.min(200, Math.max(5, Math.floor(Number(req.query.count)) || 80));
  if (!raw) {
    res.status(400).json({ error: "ticker query required" });
    return;
  }
  if (!interval.success) {
    res.status(400).json({ error: "interval must be tick|1m|1d|1w|1M" });
    return;
  }
  const ticker = resolveByQuery(raw)?.ticker ?? raw;
  try {
    const { candles, synthetic } = await toss.getCandles(ticker, interval.data, count);
    res.json({ ticker, interval: interval.data, candles, synthetic });
  } catch (err) {
    log.error("[api] /api/candles 실패", { msg: (err as Error).message });
    res.status(502).json({ error: "candles fetch failed" });
  }
});

// 종목 표시정보(이름·로고·시장·통화). 예: /api/instruments?tickers=005930,NVDA
app.get("/api/instruments", (req, res) => {
  const tickers = parseTickers(req.query.tickers);
  res.json({ instruments: tickers.map(resolveInstrument) });
});

// 코드 또는 종목명 → 종목 해석(이름만 적어도 매칭). 예: /api/resolve?q=삼성전자,NVDA
app.get("/api/resolve", (req, res) => {
  const queries = parseTickers(req.query.q);
  const items: Array<{
    query: string;
    ticker: string;
    name: string;
    market: string;
    currency: string;
  }> = [];
  const unresolved: string[] = [];
  for (const q of queries) {
    const inst = resolveByQuery(q);
    if (inst) {
      items.push({
        query: q,
        ticker: inst.ticker,
        name: inst.name,
        market: inst.market,
        currency: inst.currency,
      });
    } else {
      unresolved.push(q);
    }
  }
  res.json({ items, unresolved });
});

// 관심종목 — 별도 '관심종목 DB'에서 읽어 코드/이름 매칭·중복제거·최대 10.
app.get("/api/watchlist", async (req, res) => {
  const dbId = normalizeNotionId(req.query.dbId);
  if (req.query.dbId && !dbId) {
    res.status(400).json({ error: "invalid dbId" });
    return;
  }
  try {
    const { gateway, live } = resolveWatchlistGateway(config, notion, dbId);
    const entries = await gateway.listWatchlist();
    const { items, unresolved } = resolveWatchlist(entries, config.WATCHLIST_MAX);
    res.json({ items, unresolved, max: config.WATCHLIST_MAX, source: live ? "live" : "fixture" });
  } catch (err) {
    log.error("[api] /api/watchlist 실패", { msg: (err as Error).message });
    res.status(502).json({ error: "watchlist failed" });
  }
});

// 보유 종목 — 종목 DB 행(국내+국외). 라이브 평가손익은 위젯이 시세로 계산.
// ?dbId= 로 위젯별 종목 DB 지정 가능(서버 토큰으로 읽음). 없으면 기본(env) DB.
app.get("/api/holdings", async (req, res) => {
  const dbId = normalizeNotionId(req.query.dbId);
  if (req.query.dbId && !dbId) {
    res.status(400).json({ error: "invalid dbId" });
    return;
  }
  try {
    const { gateway, live } = resolveStockGateway(config, notion, dbId);
    const rows = await gateway.listStockRows();
    const items = rows.map((r) => {
      const inst = resolveInstrument(r.ticker);
      return {
        ticker: r.ticker,
        name: r.name ?? inst.name,
        market: r.market ?? inst.market,
        currency: inst.currency,
        avgPrice: r.avgPrice,
        quantity: r.quantity,
        currentPrice: r.currentPrice,
      };
    });
    res.json({ items, source: live ? "live" : "fixture" });
  } catch (err) {
    log.error("[api] /api/holdings 실패", { msg: (err as Error).message });
    res.status(502).json({ error: "holdings failed" });
  }
});

// 보유 ETF 시간외 예상가(구성종목 기반, 위젯 표시 전용 — §1 불변식).
app.get("/api/etf-after-hours", async (_req, res) => {
  try {
    const etfs = await notion.etf.listEtfs();
    const items = await computeEtfAfterHours(etfs, quoteCache);
    res.json({ items });
  } catch (err) {
    log.error("[api] /api/etf-after-hours 실패", { msg: (err as Error).message });
    res.status(502).json({ error: "etf after-hours failed" });
  }
});

// 공포·탐욕 지수(탐욕지수) — 대형주 바스켓의 실제 등락으로 시장 심리를 0~100으로.
// 등락률은 getQuotes(라이브=토스 전일종가 기반 정확)에서 받아 TOP100 기준가 버그를 피한다.
app.get("/api/sentiment", async (req, res) => {
  const parsed = Market.safeParse(String(req.query.market ?? "domestic"));
  if (!parsed.success) {
    res.status(400).json({ error: "market must be domestic|overseas" });
    return;
  }
  try {
    const basket = SECURITIES.filter((s) => !s.isEtf && s.market === parsed.data && s.marketCap > 0)
      .sort((a, b) => b.marketCap - a.marketCap)
      .slice(0, 20)
      .map((s) => s.ticker);
    const quotes = await quoteCache.getQuotes(basket);
    const rates = quotes.map((q) => q.changeRate);
    const total = rates.length || 1;
    const up = rates.filter((r) => r > 0).length;
    const down = rates.filter((r) => r < 0).length;
    const breadth = up / total; // 0..1 (상승 종목 비중)
    const avg = rates.reduce((s, r) => s + r, 0) / total;
    const momentum = Math.max(0, Math.min(1, 0.5 + avg * 10)); // ±0.05 → 0..1
    // breadth(폭) 0.6 + momentum(강도) 0.4 가중 → 0..100
    const index = Math.round(100 * (0.6 * breadth + 0.4 * momentum));
    const label =
      index < 20 ? "극단적 공포" : index < 40 ? "공포" : index < 60 ? "중립" : index < 80 ? "탐욕" : "극단적 탐욕";
    res.json({
      market: parsed.data,
      index,
      label,
      up,
      down,
      neutral: total - up - down,
      count: total,
      avgChangeRate: avg,
    });
  } catch (err) {
    log.error("[api] /api/sentiment 실패", { msg: (err as Error).message });
    res.status(502).json({ error: "sentiment failed" });
  }
});

// 국내/국외 시장 규모 상위 100 (트리맵·표). 예: /api/top?market=overseas
app.get("/api/top", async (req, res) => {
  const parsed = Market.safeParse(String(req.query.market ?? "domestic"));
  if (!parsed.success) {
    res.status(400).json({ error: "market must be domestic|overseas" });
    return;
  }
  try {
    const items = await toss.getTopMovers(parsed.data);
    res.json({ market: parsed.data, items });
  } catch (err) {
    log.error("[api] /api/top 실패", { msg: (err as Error).message });
    res.status(502).json({ error: "top fetch failed" });
  }
});

// [§8.2] 스케줄러 — 장중 주기로 종목DB.현재가 동기화.
if (cron.validate(config.SYNC_INTERVAL_CRON)) {
  cron.schedule(config.SYNC_INTERVAL_CRON, () => {
    runSyncCycle(notion.stock, quoteCache, config).catch((err) =>
      log.error("[sync] 사이클 예외", { msg: (err as Error).message }),
    );
  });
  log.info("[sync] 스케줄러 등록", { cron: config.SYNC_INTERVAL_CRON });
} else {
  log.warn("[sync] SYNC_INTERVAL_CRON 형식 오류 — 스케줄러 미등록", {
    cron: config.SYNC_INTERVAL_CRON,
  });
}

app.listen(config.PORT, () => {
  log.info(`[server] listening on :${config.PORT}`, { dataSource: config.DATA_SOURCE });
});
