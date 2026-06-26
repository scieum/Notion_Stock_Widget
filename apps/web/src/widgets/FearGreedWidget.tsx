import { useEffect, useState } from "react";
import type { Market } from "@toss-notion/core";
import { fetchSentiment, type Sentiment } from "../data/api.js";

/** 반원 게이지의 각 구간(공포→탐욕). 한국 관습: 탐욕=빨강(상승), 공포=파랑(하락). */
const ZONES = [
  { to: 20, color: "var(--down)" },
  { to: 40, color: "rgba(var(--down-rgb), 0.5)" },
  { to: 60, color: "var(--muted-light)" },
  { to: 80, color: "rgba(var(--up-rgb), 0.55)" },
  { to: 100, color: "var(--up)" },
];

const CX = 100;
const CY = 104;
const R = 84;

/** 지수값(0~100) → 반원 위의 좌표. 0=왼쪽, 50=위, 100=오른쪽. */
function pointAt(v: number): { x: number; y: number } {
  const rad = ((180 - 1.8 * v) * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) };
}

/** v0→v1 구간의 반원 호 path(시계방향 sweep). */
function arc(v0: number, v1: number): string {
  const a = pointAt(v0);
  const b = pointAt(v1);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * 공포·탐욕 지수(탐욕지수) 게이지 — 0(극단적 공포)~100(극단적 탐욕).
 * 대형주 바스켓의 실제 등락(상승 비중 + 모멘텀)으로 산출. 참고용 시장 심리 지표.
 */
export function FearGreedWidget({ market, title }: { market: Market; title?: string }) {
  const [data, setData] = useState<Sentiment | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchSentiment(market)
        .then((r) => alive && (setData(r), setErr(false)))
        .catch(() => alive && setErr(true));
    load();
    const id = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [market]);

  const idx = data?.index ?? 0;
  const needle = pointAt(idx);
  // 바늘 끝을 살짝 안쪽으로(중심에서 R*0.82 지점).
  const nx = CX + (needle.x - CX) * 0.82;
  const ny = CY + (needle.y - CY) * 0.82;
  const valueColor = ZONES.find((z) => idx < z.to)?.color ?? "var(--up)";

  return (
    <div className="w-card fg-card">
      <div className="w-head">
        <h3 className="w-title">{title || `${market === "domestic" ? "국내" : "미국"} 탐욕지수`}</h3>
        <span className="muted micro">{err ? "지연" : data ? "실시간" : "…"}</span>
      </div>

      <div className="fg-gauge">
        <svg viewBox="0 0 200 120" role="img" className="fg-svg">
          {ZONES.map((z, i) => (
            <path
              key={i}
              d={arc(i === 0 ? 0 : ZONES[i - 1]!.to, z.to)}
              fill="none"
              stroke={z.color}
              strokeWidth={14}
            />
          ))}
          {data && (
            <>
              <line className="fg-needle" x1={CX} y1={CY} x2={nx} y2={ny} />
              <circle className="fg-hub" cx={CX} cy={CY} r={5} />
            </>
          )}
        </svg>
        <div className="fg-readout">
          <span className="fg-value" style={{ color: valueColor }}>
            {data ? idx : "—"}
          </span>
          <span className="fg-label" style={{ color: valueColor }}>
            {data?.label ?? ""}
          </span>
        </div>
      </div>

      {data && (
        <div className="fg-breadth muted micro">
          <span className="up">▲ 상승 {data.up}</span>
          <span className="down">▼ 하락 {data.down}</span>
          <span>― 보합 {data.neutral}</span>
          <span>· 대형주 {data.count}종목</span>
        </div>
      )}
      <p className="muted micro note">상승 비중·모멘텀 가중 · 참고용 시장 심리 지표</p>
    </div>
  );
}
