import { useEffect, useState } from "react";
import { useMarketData } from "../data/DataProvider.js";
import { fetchResolve, fetchWatchlist, type WatchlistItem } from "../data/api.js";
import { CandleChartWidget } from "./CandleChartWidget.js";
import { money, moveClass, pct, StockLogo } from "./StockLogo.js";

/**
 * 관심종목 테이블. 두 소스 모두 코드/종목명 매칭(이름만 적어도 연동):
 *  - source="notion": 별도 '관심종목 DB'에서 자동(최대 10).
 *  - source="manual": config.tickers(코드 또는 이름)를 서버에서 해석.
 */
export function WatchlistWidget({
  tickers,
  title,
  source,
  watchlistDbId,
}: {
  tickers: string[];
  title?: string;
  source?: "notion" | "manual";
  watchlistDbId?: string;
}) {
  const isNotion = source === "notion";
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [dataSource, setDataSource] = useState<"live" | "fixture">("fixture");
  const [loadErr, setLoadErr] = useState(false);
  // 클릭한 종목 — 있으면 세부(캔들 차트) 화면으로 전환.
  const [sel, setSel] = useState<{ ticker: string; name: string } | null>(null);
  const manualKey = tickers.join(",");

  useEffect(() => {
    let alive = true;
    // 코드 입력 폴백 — resolve가 실패해도 직접 입력한 코드는 그대로 시세 조회.
    const rawItems = (): WatchlistItem[] =>
      tickers.map((t) => ({ ticker: t, name: t, market: "domestic", currency: "KRW" }));
    const load = () =>
      (isNotion
        ? fetchWatchlist(watchlistDbId).then((r) => {
            if (alive) setDataSource(r.source ?? "fixture");
            return r.items;
          })
        : fetchResolve(tickers).then((r) => [
            ...r.items,
            // 못 찾은 입력도 코드일 수 있으니 그대로 노출(시세 없으면 — 표시)
            ...r.unresolved.map((q) => ({ ticker: q, name: q, market: "domestic" as const, currency: "KRW" })),
          ]))
        .then((list) => alive && (setItems(list), setLoadErr(false)))
        .catch(() => alive && (setItems(isNotion ? [] : rawItems()), setLoadErr(true)));
    load();
    // notion은 DB 변경 폴링(30초), manual은 입력이 바뀔 때만.
    const id = isNotion ? setInterval(load, 30_000) : undefined;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotion, manualKey, watchlistDbId]);

  const tickerList = items.map((r) => r.ticker);
  const { quotes, instruments, error, updatedAt } = useMarketData(tickerList);
  const rows = items;

  // 세부 화면 — 클릭한 종목의 캔들 차트. 위로는 목록으로 돌아가는 버튼.
  if (sel) {
    return (
      <div className="w-detail">
        <button type="button" className="link-back" onClick={() => setSel(null)}>
          ← {title || "관심종목"}
        </button>
        <CandleChartWidget ticker={sel.ticker} title={sel.name} />
      </div>
    );
  }

  return (
    <div className="w-card">
      <div className="w-head">
        <h3 className="w-title">{title || "관심종목"}</h3>
        {(updatedAt || isNotion) && (
          <span className="muted micro">
            {isNotion && dataSource === "fixture" && <span className="tag warn">예시</span>}
            {error || loadErr ? "지연" : "실시간"}
          </span>
        )}
      </div>
      <table className="quote-table tap">
        <tbody>
          {rows.map((r) => {
            const q = quotes.get(r.ticker);
            const inst = instruments.get(r.ticker);
            const cur = q?.currency ?? r.currency;
            const nm = inst?.name ?? r.name;
            return (
              <tr
                key={r.ticker}
                onClick={() => setSel({ ticker: r.ticker, name: nm })}
                title={`${nm} 세부 보기`}
              >
                <td className="cell-name">
                  <StockLogo ticker={r.ticker} name={nm} url={inst?.logoUrl} size={22} />
                  <span className="name">{nm}</span>
                  {r.market === "overseas" && <span className="tag">US</span>}
                </td>
                <td className="num">{q ? money(q.price, cur) : "—"}</td>
                <td className={`num ${q ? moveClass(q.changeRate) : ""}`}>
                  {q ? pct(q.changeRate) : "—"}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td className="muted micro" colSpan={3}>
                {isNotion ? "관심종목 DB가 비어있어요." : "종목을 추가하세요."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {isNotion && <p className="muted micro note">관심종목 DB 자동 연동 · 최대 10종목</p>}
    </div>
  );
}
