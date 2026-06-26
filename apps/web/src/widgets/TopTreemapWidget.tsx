import { useEffect, useMemo, useState } from "react";
import type { Market, RankedQuote } from "@toss-notion/core";
import { fetchTop } from "../data/api.js";
import { squarify, type Rect } from "./treemap.js";
import { money, pct, signed } from "./StockLogo.js";

/** 좌표 공간(가상). 화면에는 % 로 환산해 반응형으로 렌더. */
const SPACE: Rect = { x: 0, y: 0, w: 1000, h: 680 };
const HEADER = 22; // 섹터 라벨 높이(가상 단위)

/** 등락률 → 셀 배경(상승=빨강/하락=파랑, ±5% 상한). 색은 변수로(§9). */
function cellBg(r: number): string {
  if (r === 0) return "var(--bg-alt)";
  const intensity = Math.min(1, Math.abs(r) / 0.05);
  const rgb = r > 0 ? "var(--up-rgb)" : "var(--down-rgb)";
  return `rgba(${rgb}, ${0.16 + intensity * 0.62})`;
}

interface Placed {
  q: RankedQuote;
  rect: Rect;
}

/**
 * 국내/국외 시장 규모 상위 100 — 섹터별로 묶은 트리맵.
 * 셀 크기 = 시가총액, 색 = 등락률(빨강 상승 / 파랑 하락). (S&P 500 맵 스타일)
 */
export function TopTreemapWidget({ market, title }: { market: Market; title?: string }) {
  const [items, setItems] = useState<RankedQuote[]>([]);
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

  // 섹터 그룹 → 외부 트리맵, 각 섹터 내부 → 종목 트리맵.
  const { sectors, cells } = useMemo(() => {
    const bySector = new Map<string, RankedQuote[]>();
    for (const q of items) {
      const arr = bySector.get(q.sector) ?? [];
      arr.push(q);
      bySector.set(q.sector, arr);
    }
    const groups = [...bySector.entries()].map(([sector, qs]) => ({
      sector,
      qs,
      value: qs.reduce((s, q) => s + q.marketCap, 0),
    }));
    const sectorRects = squarify(
      groups.map((g) => ({ item: g, value: g.value })),
      SPACE,
    );
    const cells: Placed[] = [];
    const sectors: (Rect & { sector: string })[] = [];
    for (const sr of sectorRects) {
      sectors.push({ sector: sr.item.sector, x: sr.x, y: sr.y, w: sr.w, h: sr.h });
      const inner: Rect = {
        x: sr.x + 1,
        y: sr.y + HEADER,
        w: Math.max(0, sr.w - 2),
        h: Math.max(0, sr.h - HEADER - 1),
      };
      const stockRects = squarify(
        sr.item.qs.map((q) => ({ item: q, value: q.marketCap })),
        inner,
      );
      for (const cr of stockRects) cells.push({ q: cr.item, rect: cr });
    }
    return { sectors, cells };
  }, [items]);

  const toPct = (v: number, axis: "x" | "y") =>
    `${(v / (axis === "x" ? SPACE.w : SPACE.h)) * 100}%`;

  return (
    <div className="w-card">
      <div className="w-head">
        <h3 className="w-title">
          {title || `${market === "domestic" ? "국내" : "미국"} 시총 상위 100`}
        </h3>
        <span className="muted micro">{err ? "지연" : items.length ? "실시간" : "…"}</span>
      </div>
      <div className="treemap" style={{ aspectRatio: `${SPACE.w} / ${SPACE.h}` }}>
        {sectors.map((s) => (
          <div
            key={s.sector}
            className="tm-sector"
            style={{ left: toPct(s.x, "x"), top: toPct(s.y, "y"), width: toPct(s.w, "x"), height: toPct(s.h, "y") }}
          >
            <span className="tm-sector-label">{s.sector}</span>
          </div>
        ))}
        {cells.map(({ q, rect }) => (
          <div
            key={q.ticker}
            className="tm-cell"
            title={`${q.name} ${money(q.price, q.currency)} ${pct(q.changeRate)} (${signed(q.change, q.currency)})`}
            style={{
              left: toPct(rect.x, "x"),
              top: toPct(rect.y, "y"),
              width: toPct(rect.w, "x"),
              height: toPct(rect.h, "y"),
              background: cellBg(q.changeRate),
            }}
          >
            <span className="tm-tk">{q.ticker}</span>
            <span className="tm-pc">{pct(q.changeRate)}</span>
          </div>
        ))}
      </div>
      <p className="muted micro note">셀 크기 = 시가총액 · 색 = 등락률(빨강 상승/파랑 하락)</p>
    </div>
  );
}
