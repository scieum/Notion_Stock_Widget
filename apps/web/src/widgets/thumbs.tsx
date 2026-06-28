import { useEffect, useState, type ReactNode } from "react";
import type { Candle, Market } from "@toss-notion/core";
import {
  fetchCandles,
  fetchEtfAfterHours,
  fetchHoldings,
  fetchInstruments,
  fetchQuotes,
  fetchSentiment,
  fetchTop,
  fetchWatchlist,
} from "../data/api.js";
import type { WidgetConfig, WidgetTypeId } from "./registry.js";
import { money, moveClass, pct, signed } from "./StockLogo.js";

/**
 * 썸네일(미리보기) — 위젯 전체가 아니라 "핵심 요소 1개"만 크게 보여준다.
 * Home의 My Widgets / Explore 카드에서 사용. 실데이터를 1회 로드(틱 폴링 없음).
 */

/** 마운트 시 1회 로드. 실패/로딩 중엔 undefined. */
function useOnce<T>(fn: () => Promise<T>, deps: unknown[]): T | undefined {
  const [val, setVal] = useState<T>();
  useEffect(() => {
    let alive = true;
    fn()
      .then((r) => alive && setVal(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return val;
}

/** 공통 히어로 레이아웃 — 작은 라벨 + 큰 값 + 보조(등락/라벨). */
function Thumb({
  label,
  value,
  sub,
  subClass = "",
  nameValue = false,
  children,
}: {
  label?: string;
  value?: ReactNode;
  sub?: ReactNode;
  subClass?: string;
  nameValue?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="thumb">
      {label && <span className="thumb-label">{label}</span>}
      {value != null && <span className={`thumb-value${nameValue ? " name" : ""}`}>{value}</span>}
      {sub != null && <span className={`thumb-sub ${subClass}`}>{sub}</span>}
      {children}
    </div>
  );
}

const marketLabel = (m: Market) => (m === "domestic" ? "국내" : "미국");

/** 보유 종목 → 통화별(원화) 총 평가금액·매입·평가손익·수익률. 라이브 시세로 계산. */
function useKrwTotals(dbId?: string) {
  return useOnce(async () => {
    const { items } = await fetchHoldings(dbId);
    const krw = items.filter((h) => (h.currency ?? "KRW") === "KRW");
    let quoteMap = new Map<string, number>();
    try {
      const qs = await fetchQuotes(krw.map((h) => h.ticker));
      quoteMap = new Map(qs.map((q) => [q.ticker, q.price]));
    } catch {
      /* 시세 실패 시 Notion 현재가·평단가로 폴백 */
    }
    let marketValue = 0;
    let pnl = 0;
    let cost = 0;
    for (const h of krw) {
      const price = quoteMap.get(h.ticker) ?? h.currentPrice ?? h.avgPrice ?? null;
      if (price != null && h.avgPrice != null && h.quantity != null) {
        marketValue += price * h.quantity;
        cost += h.avgPrice * h.quantity;
        pnl += (price - h.avgPrice) * h.quantity;
      }
    }
    return { marketValue, pnl, ret: cost > 0 ? pnl / cost : 0, count: items.length };
  }, [dbId]);
}

function PortfolioThumb({ dbId }: { dbId?: string }) {
  const t = useKrwTotals(dbId);
  return (
    <Thumb
      label="원화 자산"
      value={t ? money(t.marketValue, "KRW") : "—"}
      sub={t ? pct(t.ret) : ""}
      subClass={t ? moveClass(t.ret) : ""}
    />
  );
}

function HoldingsThumb({ dbId }: { dbId?: string }) {
  const t = useKrwTotals(dbId);
  return (
    <Thumb
      label={t ? `평가손익 · ${t.count}종목` : "평가손익"}
      value={t ? signed(t.pnl, "KRW") : "—"}
      subClass={t ? moveClass(t.pnl) : ""}
      sub={t ? pct(t.ret) : ""}
    />
  );
}

function WatchlistThumb({
  source,
  tickers,
  dbId,
}: {
  source?: "notion" | "manual";
  tickers: string[];
  dbId?: string;
}) {
  const data = useOnce(async () => {
    const ticker =
      source === "manual" ? tickers[0] : (await fetchWatchlist(dbId)).items[0]?.ticker;
    if (!ticker) return null;
    const [qs, inst] = await Promise.all([
      fetchQuotes([ticker]).catch(() => []),
      fetchInstruments([ticker]).catch(() => []),
    ]);
    const q = qs[0];
    return { name: inst[0]?.name ?? ticker, q };
  }, [source, dbId, tickers.join(",")]);

  if (data === null) return <Thumb label="관심종목" value="비어 있음" nameValue />;
  return (
    <Thumb
      label="관심종목"
      value={data?.name ?? "—"}
      nameValue
      sub={data?.q ? `${money(data.q.price, data.q.currency)} · ${pct(data.q.changeRate)}` : ""}
      subClass={data?.q ? moveClass(data.q.changeRate) : ""}
    />
  );
}

function EtfThumb() {
  const items = useOnce(() => fetchEtfAfterHours(), []);
  const top = items?.[0];
  return (
    <Thumb
      label={top ? top.name : "ETF 시간외 예상가"}
      value={top?.expectedChangeRate != null ? pct(top.expectedChangeRate) : "—"}
      nameValue
      subClass={top?.expectedChangeRate != null ? moveClass(top.expectedChangeRate) : ""}
      sub="시간외 예상 (iNAV 근사)"
    />
  );
}

function TopTableThumb({ market }: { market: Market }) {
  const items = useOnce(() => fetchTop(market), [market]);
  const top = items?.[0];
  return (
    <Thumb
      label={`${marketLabel(market)} 실시간 1위`}
      value={top?.name ?? "—"}
      nameValue
      sub={top ? `${money(top.price, top.currency)} · ${pct(top.changeRate)}` : ""}
      subClass={top ? moveClass(top.changeRate) : ""}
    />
  );
}

/** 시총맵 → 상위 종목을 시총 비례 크기·등락 색의 작은 블록으로(미니 트리맵). */
function TreemapThumb({ market }: { market: Market }) {
  const items = useOnce(() => fetchTop(market), [market]);
  const top = (items ?? []).slice(0, 7);
  return (
    <Thumb label={`${marketLabel(market)} 시총맵`}>
      <div className="thumb-tm">
        {top.length === 0
          ? <span style={{ flex: 1, background: "var(--border)" }} />
          : top.map((s) => (
              <span
                key={s.ticker}
                style={{ flexGrow: Math.max(0.3, Math.sqrt(s.marketCap || 1)), background: heatColor(s.changeRate) }}
                title={s.name}
              />
            ))}
      </div>
    </Thumb>
  );
}

function FearGreedThumb({ market }: { market: Market }) {
  const s = useOnce(() => fetchSentiment(market), [market]);
  const color = s ? fgColor(s.index) : "var(--muted-light)";
  return (
    <Thumb label={`${marketLabel(market)} 탐욕지수`}>
      <span className="thumb-value" style={{ color, fontSize: 34 }}>
        {s ? s.index : "—"}
      </span>
      <span className="thumb-sub" style={{ color }}>
        {s?.label ?? ""}
      </span>
    </Thumb>
  );
}

function HeatmapThumb({ tickers }: { tickers: string[] }) {
  const data = useOnce(async () => {
    const [qs, inst] = await Promise.all([
      fetchQuotes(tickers).catch(() => []),
      fetchInstruments(tickers).catch(() => []),
    ]);
    const nameMap = new Map(inst.map((i) => [i.ticker, i.name]));
    return qs.slice(0, 4).map((q) => ({ name: nameMap.get(q.ticker) ?? q.ticker, rate: q.changeRate }));
  }, [tickers.join(",")]);
  return (
    <Thumb label="등락률 히트맵">
      <div className="thumb-cells">
        {(data ?? []).map((c, i) => (
          <span key={i} className="thumb-cell" style={{ background: heatColor(c.rate) }}>
            {pct(c.rate)}
          </span>
        ))}
        {(!data || data.length === 0) && <span className="thumb-cell" style={{ background: "var(--border)", color: "var(--muted)" }}>—</span>}
      </div>
    </Thumb>
  );
}

function TickerThumb({ ticker }: { ticker: string }) {
  const data = useOnce(async () => {
    const [qs, inst] = await Promise.all([
      fetchQuotes([ticker]).catch(() => []),
      fetchInstruments([ticker]).catch(() => []),
    ]);
    return { name: inst[0]?.name ?? ticker, q: qs[0] };
  }, [ticker]);
  return (
    <Thumb
      label={data?.name ?? "종목 시세"}
      value={data?.q ? money(data.q.price, data.q.currency) : "—"}
      subClass={data?.q ? moveClass(data.q.changeRate) : ""}
      sub={data?.q ? pct(data.q.changeRate) : ""}
    />
  );
}

/** 캔들 → 최근 일봉 미니 스파크라인 + 마지막 종가·기간 등락. */
function CandleThumb({ ticker }: { ticker: string }) {
  const data = useOnce(async () => {
    const [r, inst] = await Promise.all([
      fetchCandles(ticker, "1d", 40),
      fetchInstruments([ticker]).catch(() => []),
    ]);
    return { candles: r.candles, name: inst[0]?.name ?? ticker };
  }, [ticker]);
  const candles = data?.candles ?? [];
  const last = candles[candles.length - 1];
  const first = candles[0];
  const chg = last && first ? last.close - first.open : 0;
  const rate = first && first.open > 0 ? chg / first.open : 0;
  return (
    <Thumb
      label={data?.name ?? "캔들 차트"}
      value={last ? money(last.close, "KRW") : "—"}
      subClass={moveClass(chg)}
      sub={last ? pct(rate) : ""}
    >
      <Spark candles={candles} up={chg >= 0} />
    </Thumb>
  );
}

function Spark({ candles, up }: { candles: Candle[]; up: boolean }) {
  if (candles.length < 2) return null;
  const w = 160;
  const h = 38;
  const closes = candles.map((c) => c.close);
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const span = hi - lo || 1;
  const pts = closes
    .map((c, i) => {
      const x = (i / (closes.length - 1)) * w;
      const y = h - ((c - lo) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = up ? "var(--up)" : "var(--down)";
  return (
    <svg className="thumb-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}

/** 등락률 → 히트맵/트리맵 셀 배경색(빨강=상승, 파랑=하락, 한국 관습). */
function heatColor(rate: number): string {
  const a = Math.min(0.85, Math.max(0.12, Math.abs(rate) * 12 + 0.12));
  if (rate > 0) return `rgba(var(--up-rgb), ${a.toFixed(2)})`;
  if (rate < 0) return `rgba(var(--down-rgb), ${a.toFixed(2)})`;
  return "var(--muted-light)";
}

/** 탐욕지수 값 → 색(공포=파랑, 탐욕=빨강). */
function fgColor(index: number): string {
  if (index < 20) return "var(--down)";
  if (index < 40) return "rgba(var(--down-rgb), 0.7)";
  if (index < 60) return "var(--muted)";
  if (index < 80) return "rgba(var(--up-rgb), 0.75)";
  return "var(--up)";
}

/** 위젯 종류별 썸네일을 렌더한다. 정의가 없으면 null(호출부가 폴백). */
export function renderThumb(id: WidgetTypeId, cfg: WidgetConfig): ReactNode {
  switch (id) {
    case "portfolio-summary":
      return <PortfolioThumb dbId={cfg.stockDbId} />;
    case "holdings":
      return <HoldingsThumb dbId={cfg.stockDbId} />;
    case "watchlist":
      return <WatchlistThumb source={cfg.source} tickers={cfg.tickers ?? []} dbId={cfg.watchlistDbId} />;
    case "etf-afterhours":
      return <EtfThumb />;
    case "top-treemap-domestic":
      return <TreemapThumb market="domestic" />;
    case "top-treemap-overseas":
      return <TreemapThumb market="overseas" />;
    case "top-table-domestic":
      return <TopTableThumb market="domestic" />;
    case "top-table-overseas":
      return <TopTableThumb market="overseas" />;
    case "fear-greed-domestic":
      return <FearGreedThumb market="domestic" />;
    case "fear-greed-overseas":
      return <FearGreedThumb market="overseas" />;
    case "heatmap":
      return <HeatmapThumb tickers={cfg.tickers ?? []} />;
    case "ticker":
      return <TickerThumb ticker={cfg.ticker ?? "005930"} />;
    case "candle":
      return <CandleThumb ticker={cfg.ticker ?? "005930"} />;
    default:
      return null;
  }
}
