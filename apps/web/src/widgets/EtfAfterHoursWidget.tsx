import { useEffect, useState } from "react";
import { fetchEtfAfterHours, type EtfAfterHoursItem } from "../data/api.js";
import { money, moveClass, pct, signed, StockLogo } from "./StockLogo.js";

/**
 * 보유 ETF 시간외 예상가 — 구성종목 등락률 가중합으로 기준가를 보정(iNAV 근사).
 * 위젯 표시 전용(§1: Notion 현재가에 쓰지 않음). 구성종목은 ETF별 구성 DB에서.
 */
export function EtfAfterHoursWidget({ title }: { title?: string }) {
  const [items, setItems] = useState<EtfAfterHoursItem[]>([]);
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchEtfAfterHours()
        .then((r) => alive && (setItems(r), setLoadErr(false)))
        .catch(() => alive && setLoadErr(true));
    load();
    const id = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="w-card">
      <div className="w-head">
        <h3 className="w-title">{title || "보유 ETF 시간외 예상가"}</h3>
        <span className="muted micro">{loadErr ? "지연" : "참고용"}</span>
      </div>
      <table className="quote-table etf">
        <thead>
          <tr>
            <th>ETF</th>
            <th className="num">기준가</th>
            <th className="num">예상가</th>
            <th className="num">예상등락</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => {
            const rate = e.expectedChangeRate;
            return (
              <tr key={e.ticker}>
                <td className="cell-name">
                  <StockLogo ticker={e.ticker} name={e.name} size={22} />
                  <span className="name">{e.name}</span>
                  {e.coverage < 0.999 && (
                    <span className="tag warn">{Math.round(e.coverage * 100)}%</span>
                  )}
                </td>
                <td className="num">{e.basePrice != null ? money(e.basePrice, e.currency) : "—"}</td>
                <td className={`num ${rate != null ? moveClass(rate) : ""}`}>
                  {e.expectedPrice != null ? money(e.expectedPrice, e.currency) : "—"}
                </td>
                <td className={`num ${rate != null ? moveClass(rate) : ""}`}>
                  {rate != null ? (
                    <>
                      {pct(rate)}
                      <span className="micro muted"> {signed(e.expectedChange ?? 0, e.currency)}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td className="muted micro" colSpan={4}>
                보유 ETF가 없거나 구성종목이 등록되지 않았어요.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="muted micro note">iNAV 근사·참고용 · 구성종목 시세 가중합 (% = 시세 확보 비중)</p>
    </div>
  );
}
