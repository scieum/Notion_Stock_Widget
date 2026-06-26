import { useEffect, useState } from "react";
import { liveReturnRate, liveUnrealizedPnl } from "@toss-notion/core";
import { useMarketData } from "../data/DataProvider.js";
import { fetchHoldings, type HoldingItem } from "../data/api.js";
import { money, moveClass, pct, signed, StockLogo } from "./StockLogo.js";

/**
 * 보유 종목(국내+국외) — 종목 DB에서 읽고, 라이브 시세로 평가손익을 즉석 계산.
 * 평단가·수량은 Notion 소유(읽기), 손익은 화면용 오버레이(§5: Notion에 쓰지 않음).
 */
export function HoldingsWidget({ title }: { title?: string }) {
  const [items, setItems] = useState<HoldingItem[]>([]);
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchHoldings()
        .then((r) => alive && (setItems(r), setLoadErr(false)))
        .catch(() => alive && setLoadErr(true));
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const { quotes, instruments, error } = useMarketData(items.map((h) => h.ticker));

  return (
    <div className="w-card">
      <div className="w-head">
        <h3 className="w-title">{title || "내 보유 종목"}</h3>
        <span className="muted micro">{error || loadErr ? "지연" : "실시간"}</span>
      </div>
      <table className="quote-table holdings">
        <thead>
          <tr>
            <th>종목</th>
            <th className="num">현재가</th>
            <th className="num">평가손익</th>
            <th className="num">수익률</th>
          </tr>
        </thead>
        <tbody>
          {items.map((h) => {
            const q = quotes.get(h.ticker);
            const inst = instruments.get(h.ticker);
            const cur = q?.currency ?? h.currency;
            const price = q?.price ?? h.currentPrice ?? null;
            const pnl =
              price != null && h.avgPrice != null && h.quantity != null
                ? liveUnrealizedPnl(price, h.avgPrice, h.quantity)
                : null;
            const ret =
              price != null && h.avgPrice != null ? liveReturnRate(price, h.avgPrice) : null;
            return (
              <tr key={h.ticker}>
                <td className="cell-name">
                  <StockLogo ticker={h.ticker} name={inst?.name ?? h.name} url={inst?.logoUrl} size={22} />
                  <span className="name" title={inst?.name ?? h.name}>{inst?.name ?? h.name}</span>
                  {h.market === "overseas" && <span className="tag">US</span>}
                </td>
                <td className="num">{price != null ? money(price, cur) : "—"}</td>
                <td className={`num ${pnl != null ? moveClass(pnl) : ""}`}>
                  {pnl != null ? signed(pnl, cur) : "—"}
                </td>
                <td className={`num ${ret != null ? moveClass(ret) : ""}`}>
                  {ret != null ? pct(ret) : "—"}
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td className="muted micro" colSpan={4}>
                종목 DB에 보유 종목이 없어요.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="muted micro note">평단·수량은 Notion 기준 · 손익은 라이브 시세로 즉석 계산</p>
    </div>
  );
}
