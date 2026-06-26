import { useMarketData } from "../data/DataProvider.js";
import { pct } from "./StockLogo.js";

/** 등락률 히트맵 — 셀 색이 등락률(적/녹), 종목별 한눈에. */
export function HeatmapWidget({ tickers, title }: { tickers: string[]; title?: string }) {
  const { quotes, instruments } = useMarketData(tickers);

  return (
    <div className="w-card">
      <div className="w-head">
        <h3 className="w-title">{title || "등락률 히트맵"}</h3>
      </div>
      <div className="heatmap">
        {tickers.map((t) => {
          const q = quotes.get(t);
          const inst = instruments.get(t);
          const r = q?.changeRate ?? 0;
          // 등락률 ±5%를 진하기 상한으로 매핑
          const intensity = Math.min(1, Math.abs(r) / 0.05);
          // 한국 관습: 상승=빨강(--up), 하락=파랑(--down) — 색은 변수로(§9)
          const bg =
            r === 0
              ? "var(--bg-alt)"
              : r > 0
                ? `rgba(var(--up-rgb), ${0.12 + intensity * 0.55})`
                : `rgba(var(--down-rgb), ${0.12 + intensity * 0.55})`;
          return (
            <div className="heat-cell" key={t} style={{ background: bg }}>
              <span className="heat-name">{inst?.name ?? t}</span>
              <span className="heat-pct num">{q ? pct(r) : "—"}</span>
            </div>
          );
        })}
      </div>
      <p className="muted micro note">iNAV 근사·참고용</p>
    </div>
  );
}
