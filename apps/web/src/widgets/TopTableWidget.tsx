import { useEffect, useState } from "react";
import type { Market, RankedQuote } from "@toss-notion/core";
import { fetchTop } from "../data/api.js";
import { money, moveClass, pct, signed, StockLogo } from "./StockLogo.js";

const PAGE = 10; // '더보기' 한 번에 늘리는 개수

/**
 * 국내/국외 실시간 TOP 100 표 — 순위·종목명·현재가·대비·등락률.
 * 길어지지 않도록 10개씩 보여주고 '더보기'로 확장.
 */
export function TopTableWidget({ market, title }: { market: Market; title?: string }) {
  const [items, setItems] = useState<RankedQuote[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchTop(market)
        .then((r) => alive && (setItems(r), setErr(false)))
        .catch(() => alive && setErr(true));
    load();
    const id = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [market]);

  const visible = items.slice(0, shown);

  return (
    <div className="w-card">
      <div className="w-head">
        <h3 className="w-title">
          {title || `${market === "domestic" ? "국내" : "미국"} 실시간 TOP 100`}
        </h3>
        <span className="muted micro">{err ? "지연" : items.length ? "실시간" : "…"}</span>
      </div>
      <table className="quote-table rank">
        <thead>
          <tr>
            <th className="rk">순위</th>
            <th>종목명</th>
            <th className="num">현재가</th>
            <th className="num">대비</th>
            <th className="num">등락률</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((q) => (
            <tr key={q.ticker}>
              <td className="rk num">{q.rank}</td>
              <td className="cell-name">
                <StockLogo ticker={q.ticker} name={q.name} url={q.logoUrl} size={20} />
                <span className="name">{q.name}</span>
              </td>
              <td className="num">{money(q.price, q.currency)}</td>
              <td className={`num ${moveClass(q.change)}`}>{signed(q.change, q.currency)}</td>
              <td className={`num ${moveClass(q.changeRate)}`}>{pct(q.changeRate)}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td className="muted micro" colSpan={5}>
                불러오는 중…
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {shown < items.length && (
        <button className="more-btn" onClick={() => setShown((s) => s + PAGE)}>
          더보기 ({shown}/{items.length})
        </button>
      )}
    </div>
  );
}
