import { useEffect, useState } from "react";
import { liveUnrealizedPnl } from "@toss-notion/core";
import { useMarketData } from "../data/DataProvider.js";
import { fetchHoldings, type HoldingItem } from "../data/api.js";
import { money, moveClass, pct, signed } from "./StockLogo.js";

interface CurrencyTotal {
  currency: string;
  marketValue: number; // 평가금액 합
  costValue: number; // 매입금액 합
  pnl: number; // 평가손익 합
  returnRate: number; // 금액가중 수익률(소수)
  priced: number; // 평가에 반영된 종목 수
  total: number; // 보유 종목 수(통화 내)
}

const CURRENCY_LABEL: Record<string, string> = { KRW: "원화 자산", USD: "달러 자산" };

/**
 * 내 자산 요약 — 보유 종목을 통화별로 묶어 총 평가금액·평가손익·수익률을 한눈에.
 * 환율 합산은 하지 않는다(통화별 분리). 평단·수량은 Notion 소유(읽기),
 * 손익은 라이브 시세로 즉석 계산(§5: Notion에 쓰지 않음).
 */
export function PortfolioSummaryWidget({ title, stockDbId }: { title?: string; stockDbId?: string }) {
  const [items, setItems] = useState<HoldingItem[]>([]);
  const [source, setSource] = useState<"live" | "fixture">("fixture");
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchHoldings(stockDbId)
        .then((r) => alive && (setItems(r.items), setSource(r.source), setLoadErr(false)))
        .catch(() => alive && setLoadErr(true));
    load();
    const id = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [stockDbId]);

  const { quotes, error } = useMarketData(items.map((h) => h.ticker));

  // 통화별 집계
  const byCurrency = new Map<string, CurrencyTotal>();
  for (const h of items) {
    const q = quotes.get(h.ticker);
    const cur = q?.currency ?? h.currency ?? "KRW";
    const acc =
      byCurrency.get(cur) ??
      { currency: cur, marketValue: 0, costValue: 0, pnl: 0, returnRate: 0, priced: 0, total: 0 };
    acc.total += 1;
    const price = q?.price ?? h.currentPrice ?? null;
    if (price != null && h.avgPrice != null && h.quantity != null) {
      acc.marketValue += price * h.quantity;
      acc.costValue += h.avgPrice * h.quantity;
      acc.pnl += liveUnrealizedPnl(price, h.avgPrice, h.quantity);
      acc.priced += 1;
    }
    byCurrency.set(cur, acc);
  }
  const groups = [...byCurrency.values()]
    .map((g) => ({ ...g, returnRate: g.costValue > 0 ? g.pnl / g.costValue : 0 }))
    .sort((a, b) => (a.currency === "KRW" ? -1 : b.currency === "KRW" ? 1 : 0));

  return (
    <div className="w-card pf-card">
      <div className="w-head">
        <h3 className="w-title">{title || "내 자산 요약"}</h3>
        <span className="muted micro">
          {source === "fixture" && <span className="tag warn">예시</span>}
          {error || loadErr ? "지연" : "실시간"}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="muted micro note">종목 DB에 보유 종목이 없어요.</p>
      ) : (
        <div className="pf-groups">
          {groups.map((g) => (
            <div className="pf-group" key={g.currency}>
              <div className="pf-grp-head">
                <span className="pf-grp-label">{CURRENCY_LABEL[g.currency] ?? g.currency}</span>
                <span className="muted micro">{g.total}종목</span>
              </div>
              <div className="pf-value">{money(g.marketValue, g.currency)}</div>
              <div className="pf-stats">
                <span className={`pf-pnl ${moveClass(g.pnl)}`}>{signed(g.pnl, g.currency)}</span>
                <span className={`pf-ret ${moveClass(g.returnRate)}`}>{pct(g.returnRate)}</span>
              </div>
              {g.priced < g.total && (
                <span className="muted micro">
                  {g.total - g.priced}종목 평단·시세 미확보(요약 제외)
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="muted micro note">통화별 분리 집계 · 평단·수량은 Notion 기준 · 손익은 라이브 시세</p>
    </div>
  );
}
