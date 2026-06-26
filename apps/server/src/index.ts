import express from "express";
import cron from "node-cron";
import { CandleInterval, Market } from "@toss-notion/core";
import { config } from "./config.js";
import { createTossClient } from "./toss/client.js";
import { QuoteCache } from "./cache/quote-cache.js";
import { resolveByQuery, resolveInstrument } from "./instruments.js";
import { createNotionGateways } from "./notion/factory.js";
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
    const candles = await toss.getCandles(ticker, interval.data, count);
    res.json({ ticker, interval: interval.data, candles });
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
app.get("/api/watchlist", async (_req, res) => {
  try {
    const entries = await notion.watchlist.listWatchlist();
    const { items, unresolved } = resolveWatchlist(entries, config.WATCHLIST_MAX);
    res.json({ items, unresolved, max: config.WATCHLIST_MAX });
  } catch (err) {
    log.error("[api] /api/watchlist 실패", { msg: (err as Error).message });
    res.status(502).json({ error: "watchlist failed" });
  }
});

// 보유 종목 — 종목 DB 행(국내+국외). 라이브 평가손익은 위젯이 시세로 계산.
app.get("/api/holdings", async (_req, res) => {
  try {
    const rows = await notion.stock.listStockRows();
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
    res.json({ items });
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
