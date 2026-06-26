import { useMarketData } from "../data/DataProvider.js";
import { money, moveClass, pct, signed, StockLogo } from "./StockLogo.js";

/** 단일 종목 시세 카드 — 로고 + 큰 현재가 + 대비 금액 + 등락률. */
export function TickerWidget({ ticker }: { ticker: string }) {
  const { quotes, instruments } = useMarketData([ticker]);
  const q = quotes.get(ticker);
  const inst = instruments.get(ticker);
  const cls = q ? moveClass(q.changeRate) : "";
  const cur = q?.currency ?? "KRW";
  // 대비(전일대비액) — change가 없으면 현재가·등락률에서 파생.
  const change = q ? (q.change ?? q.price - q.price / (1 + q.changeRate)) : 0;

  return (
    <div className="w-card ticker-card">
      <div className="ticker-top">
        <StockLogo ticker={ticker} name={inst?.name} url={inst?.logoUrl} size={36} />
        <div>
          <div className="name lg">{inst?.name ?? ticker}</div>
          <div className="muted micro">{ticker}</div>
        </div>
      </div>
      <div className="ticker-price num">{q ? money(q.price, cur) : "—"}</div>
      <div className={`ticker-change num ${cls}`}>
        {q ? (
          <>
            {signed(change, cur)} <span className="ticker-pct">{pct(q.changeRate)}</span>
          </>
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}
