import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Candle, CandleInterval } from "@toss-notion/core";
import { useMarketData } from "../data/DataProvider.js";
import { fetchCandles, fetchResolve } from "../data/api.js";
import { money, moveClass, pct, signed, StockLogo } from "./StockLogo.js";

/** 간격 탭 — 틱·1분·일·주·월 (많이 쓰는 구성). */
const INTERVALS: { id: CandleInterval; label: string }[] = [
  { id: "tick", label: "틱" },
  { id: "1m", label: "1분" },
  { id: "1d", label: "일" },
  { id: "1w", label: "주" },
  { id: "1M", label: "월" },
];

/**
 * 연속 줌 모델 — 줌 값 g 하나가 (간격, 표시 봉 수)로 매핑된다.
 * 거친(coarse)→고운(fine) 순으로 간격을 늘어놓고, 각 간격 안에서 STEPS_PER 단계로 확대.
 * 한 간격 끝까지 확대하면 자동으로 다음 고운 간격으로 넘어간다(틱←1분←일←주←월).
 */
const COARSE_TO_FINE: CandleInterval[] = ["1M", "1w", "1d", "1m", "tick"];
const STEPS_PER = 10;
const ZOOM_MAX = COARSE_TO_FINE.length * STEPS_PER - 1; // 49
const MIN_VISIBLE = 16; // 가장 확대(봉 적게)
const MAX_VISIBLE = 160; // 가장 축소(봉 많이)
const FETCH_COUNT = 200; // 간격별로 넉넉히 받아두고 표시량만 줌으로 조절

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** 줌 값 → 간격 + 표시 봉 수. g가 클수록 확대(고운 간격·적은 봉). */
function fromZoom(g: number): { interval: CandleInterval; visible: number; idx: number } {
  const z = clamp(g, 0, ZOOM_MAX);
  const idx = Math.min(COARSE_TO_FINE.length - 1, Math.floor(z / STEPS_PER));
  const within = z - idx * STEPS_PER; // 0..STEPS_PER-1 (클수록 확대)
  const t = STEPS_PER > 1 ? within / (STEPS_PER - 1) : 0;
  const visible = Math.round(MAX_VISIBLE - t * (MAX_VISIBLE - MIN_VISIBLE));
  return { interval: COARSE_TO_FINE[idx]!, visible, idx };
}

/** 간격 → 그 간격의 줌 기본값(가운데). 탭/기본 설정에서 사용. */
function toZoom(interval: CandleInterval): number {
  const idx = Math.max(0, COARSE_TO_FINE.indexOf(interval));
  return idx * STEPS_PER + Math.floor(STEPS_PER / 2);
}

/** 간격별 폴링 주기 — 분 단위 이하는 자주, 일 이상은 느리게. */
const POLL_MS: Record<CandleInterval, number> = {
  tick: 4000,
  "1m": 5000,
  "1d": 60_000,
  "1w": 120_000,
  "1M": 300_000,
};

function fmtTime(ms: number, interval: CandleInterval): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  if (interval === "tick" || interval === "1m") return `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (interval === "1M") return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}`;
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

/** 툴팁용 상세 날짜 — 일/주/월은 날짜까지, 틱/1분은 시:분까지. */
function fmtFull(ms: number, interval: CandleInterval): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  if (interval === "tick" || interval === "1m") return `${date} ${p(d.getHours())}:${p(d.getMinutes())}`;
  if (interval === "1M") return `${d.getFullYear()}.${p(d.getMonth() + 1)}`;
  return date;
}

/**
 * 캔들(OHLCV) 차트 — 틱/1분/일/주/월. 외부 차트 라이브러리 없이 SVG로 직접 그린다.
 * 휠/슬라이더로 조금씩 확대·축소하면 간격이 자동 전환된다. 한국 관습: 상승=빨강, 하락=파랑.
 */
export function CandleChartWidget({
  ticker,
  title,
  interval: initialInterval = "1d",
}: {
  ticker: string;
  title?: string;
  interval?: CandleInterval;
}) {
  const [code, setCode] = useState(ticker);
  const [name, setName] = useState(ticker);
  const [zoom, setZoom] = useState(() => toZoom(initialInterval));
  const [candles, setCandles] = useState<Candle[]>([]);
  const [err, setErr] = useState(false);

  const { interval, visible } = useMemo(() => fromZoom(zoom), [zoom]);

  // 종목명 입력도 허용 → 코드로 해석(시세·로고는 코드로 받는다).
  useEffect(() => {
    let alive = true;
    fetchResolve([ticker])
      .then((r) => {
        const hit = r.items[0];
        if (alive && hit) {
          setCode(hit.ticker);
          setName(hit.name);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ticker]);

  // 캔들 로드 + 간격별 폴링. (표시량은 visible로 잘라내므로 간격이 바뀔 때만 재요청)
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchCandles(code, interval, FETCH_COUNT)
        .then((r) => alive && (setCandles(r.candles), setErr(false)))
        .catch(() => alive && setErr(true));
    load();
    const id = window.setInterval(load, POLL_MS[interval]);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [code, interval]);

  const { instruments } = useMarketData(code ? [code] : []);
  const inst = instruments.get(code);
  const currency = inst?.currency ?? "KRW";

  const shown = useMemo(() => candles.slice(-visible), [candles, visible]);
  const handleZoom = useCallback((dir: number) => setZoom((g) => clamp(g + dir, 0, ZOOM_MAX)), []);

  return (
    <div className="w-card chart-card">
      <div className="chart-head">
        <div className="chart-id">
          <StockLogo ticker={code} name={inst?.name ?? name} url={inst?.logoUrl} size={26} />
          <div className="chart-id-text">
            <span className="name">{title || inst?.name || name}</span>
            <span className="muted micro">{code}</span>
          </div>
        </div>
        <ChartPrice candles={shown} currency={currency} err={err} />
      </div>

      <div className="chart-tabs">
        {INTERVALS.map((iv) => (
          <button
            key={iv.id}
            type="button"
            className={interval === iv.id ? "on" : ""}
            onClick={() => setZoom(toZoom(iv.id))}
          >
            {iv.label}
          </button>
        ))}
      </div>

      <CandleSvg
        candles={shown}
        interval={interval}
        currency={currency}
        onZoom={handleZoom}
      />

      <div className="chart-zoom">
        <span className="chart-zoom-end muted micro">월</span>
        <input
          type="range"
          min={0}
          max={ZOOM_MAX}
          value={zoom}
          aria-label="확대/축소 (간격 자동 전환)"
          onChange={(e) => setZoom(Number(e.target.value))}
        />
        <span className="chart-zoom-end muted micro">틱</span>
      </div>
    </div>
  );
}

/** 헤더 우측 — 마지막 종가 + 기간 등락. */
function ChartPrice({
  candles,
  currency,
  err,
}: {
  candles: Candle[];
  currency: string;
  err: boolean;
}) {
  if (candles.length === 0) {
    return <span className="muted micro">{err ? "지연" : "…"}</span>;
  }
  const first = candles[0]!;
  const last = candles[candles.length - 1]!;
  const change = last.close - first.open;
  const rate = first.open > 0 ? change / first.open : 0;
  const cls = moveClass(change);
  return (
    <div className="chart-price">
      <span className="chart-last num">{money(last.close, currency)}</span>
      <span className={`chart-chg num ${cls}`}>
        {signed(change, currency)} {pct(rate)}
      </span>
    </div>
  );
}

/** SVG 캔들 차트 — 폭은 컨테이너에 맞춰 측정(ResizeObserver), 높이는 고정. 휠로 줌. */
function CandleSvg({
  candles,
  interval,
  currency,
  onZoom,
}: {
  candles: Candle[];
  interval: CandleInterval;
  currency: string;
  onZoom: (dir: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 휠로 확대·축소(페이지 스크롤 막기 위해 non-passive 네이티브 리스너). 위로=확대.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      while (Math.abs(acc) >= 40) {
        onZoom(acc < 0 ? 1 : -1); // 위로 스크롤(deltaY<0) = 확대
        acc -= acc < 0 ? -40 : 40;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoom]);

  const H = 248;
  const padT = 10;
  const padB = 18;
  const padL = 6;
  const padR = 56; // 우측 가격 축 라벨
  const volH = 40;
  const gap = 8;
  const priceH = H - padT - padB - volH - gap;
  const priceTop = padT;
  const priceBottom = padT + priceH;
  const volTop = priceBottom + gap;
  const volBottom = volTop + volH;
  const plotL = padL;
  const plotR = Math.max(plotL + 10, w - padR);
  const plotW = plotR - plotL;

  const geo = useMemo(() => {
    const n = candles.length;
    if (n === 0) return null;
    let lo = Infinity;
    let hi = -Infinity;
    let volMax = 0;
    for (const c of candles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
      if ((c.volume ?? 0) > volMax) volMax = c.volume ?? 0;
    }
    const pad = (hi - lo) * 0.06 || hi * 0.02 || 1;
    const pMin = lo - pad;
    const pMax = hi + pad;
    const span = pMax - pMin || 1;
    const colW = plotW / n;
    const bodyW = Math.max(1, Math.min(14, colW * 0.62));
    const x = (i: number) => plotL + (i + 0.5) * colW;
    const y = (p: number) => priceTop + ((pMax - p) / span) * priceH;
    const vy = (v: number) => volBottom - (volMax > 0 ? (v / volMax) * volH : 0);
    return { n, pMin, pMax, colW, bodyW, x, y, vy };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, plotW, priceH]);

  if (!geo) {
    return (
      <div className="chart-svg-wrap" ref={ref}>
        <div className="chart-empty muted micro">불러오는 중…</div>
      </div>
    );
  }

  const last = candles[candles.length - 1]!;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => geo.pMin + (geo.pMax - geo.pMin) * t);
  const labelIdx = Array.from(
    new Set([0, geo.n >> 2, geo.n >> 1, (geo.n * 3) >> 2, geo.n - 1]),
  ).filter((i) => i >= 0 && i < geo.n);

  const onMove = (e: ReactMouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const i = Math.max(0, Math.min(geo.n - 1, Math.round((mx - plotL) / geo.colW - 0.5)));
    setHover({ i, x: geo.x(i), y: my });
  };
  const onLeave = () => setHover(null);

  const hc = hover ? candles[hover.i] : null;
  const crossY = hover ? Math.max(priceTop, Math.min(priceBottom, hover.y)) : 0;
  const crossPrice = hover ? geo.pMax - ((crossY - priceTop) / priceH) * (geo.pMax - geo.pMin) : 0;

  return (
    <div className="chart-svg-wrap" ref={ref}>
      <svg
        ref={svgRef}
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        role="img"
        className="chart-svg"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {/* 가로 그리드 + 가격 라벨 */}
        {ticks.map((p, i) => {
          const yy = geo.y(p);
          return (
            <g key={i}>
              <line className="chart-grid" x1={plotL} y1={yy} x2={plotR} y2={yy} />
              <text className="chart-axis" x={plotR + 5} y={yy + 3}>
                {money(p, currency)}
              </text>
            </g>
          );
        })}

        {/* 거래량 막대 */}
        {candles.map((c, i) => {
          const up = c.close >= c.open;
          const v = c.volume ?? 0;
          const top = geo.vy(v);
          return (
            <rect
              key={`v${i}`}
              className={up ? "c-up vol" : "c-down vol"}
              x={geo.x(i) - geo.bodyW / 2}
              y={top}
              width={geo.bodyW}
              height={Math.max(0, volBottom - top)}
            />
          );
        })}

        {/* 캔들 (심지 + 몸통) */}
        {candles.map((c, i) => {
          const up = c.close >= c.open;
          const cls = up ? "c-up" : "c-down";
          const cx = geo.x(i);
          const yHigh = geo.y(c.high);
          const yLow = geo.y(c.low);
          const yOpen = geo.y(c.open);
          const yClose = geo.y(c.close);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH = Math.max(1, Math.abs(yClose - yOpen));
          return (
            <g key={`c${i}`}>
              <line className={`${cls} wick`} x1={cx} y1={yHigh} x2={cx} y2={yLow} />
              <rect
                className={`${cls} body`}
                x={cx - geo.bodyW / 2}
                y={bodyTop}
                width={geo.bodyW}
                height={bodyH}
              />
            </g>
          );
        })}

        {/* 마지막 종가 점선 + 라벨 */}
        <line
          className="chart-lastline"
          x1={plotL}
          y1={geo.y(last.close)}
          x2={plotR}
          y2={geo.y(last.close)}
        />
        <rect
          className="chart-lastlabel-bg"
          x={plotR + 1}
          y={geo.y(last.close) - 8}
          width={padR - 2}
          height={16}
        />
        <text className="chart-lastlabel" x={plotR + 5} y={geo.y(last.close) + 3}>
          {money(last.close, currency)}
        </text>

        {/* x축 시간 라벨 */}
        {labelIdx.map((i) => (
          <text
            key={`t${i}`}
            className="chart-axis"
            x={geo.x(i)}
            y={H - 5}
            textAnchor={i === 0 ? "start" : i === geo.n - 1 ? "end" : "middle"}
          >
            {fmtTime(candles[i]!.time, interval)}
          </text>
        ))}

        {/* 십자선(crosshair) — 마우스를 올린 봉/가격 */}
        {hover && hc && (
          <g className="chart-cross">
            <line x1={hover.x} y1={priceTop} x2={hover.x} y2={volBottom} />
            <line x1={plotL} y1={crossY} x2={plotR} y2={crossY} />
            <circle className="chart-cross-dot" cx={hover.x} cy={geo.y(hc.close)} r={3} />
            <rect className="chart-lastlabel-bg" x={plotR + 1} y={crossY - 8} width={padR - 2} height={16} />
            <text className="chart-lastlabel" x={plotR + 5} y={crossY + 3}>
              {money(crossPrice, currency)}
            </text>
          </g>
        )}
      </svg>

      {/* 정보 툴팁 — 날짜·시고저종·등락·거래량 */}
      {hover && hc && (
        <div
          className="chart-tooltip"
          style={hover.x > w * 0.55 ? { right: w - hover.x + 12 } : { left: hover.x + 12 }}
        >
          <div className="chart-tt-time">{fmtFull(hc.time, interval)}</div>
          <TtRow k="시가" v={money(hc.open, currency)} />
          <TtRow k="고가" v={money(hc.high, currency)} cls="up" />
          <TtRow k="저가" v={money(hc.low, currency)} cls="down" />
          <TtRow k="종가" v={money(hc.close, currency)} />
          <TtRow
            k="등락"
            v={`${signed(hc.close - hc.open, currency)} ${pct(hc.open > 0 ? (hc.close - hc.open) / hc.open : 0)}`}
            cls={moveClass(hc.close - hc.open)}
          />
          {hc.volume != null && <TtRow k="거래량" v={hc.volume.toLocaleString("ko-KR")} />}
        </div>
      )}
    </div>
  );
}

function TtRow({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className="chart-tt-row">
      <span className="k">{k}</span>
      <span className={`v ${cls}`}>{v}</span>
    </div>
  );
}
