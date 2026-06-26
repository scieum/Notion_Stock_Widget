import type { ReactNode } from "react";
import type { CandleInterval } from "@toss-notion/core";
import { CandleChartWidget } from "./CandleChartWidget.js";
import { EtfAfterHoursWidget } from "./EtfAfterHoursWidget.js";
import { FearGreedWidget } from "./FearGreedWidget.js";
import { HeatmapWidget } from "./HeatmapWidget.js";
import { HoldingsWidget } from "./HoldingsWidget.js";
import { TickerWidget } from "./TickerWidget.js";
import { TopTableWidget } from "./TopTableWidget.js";
import { TopTreemapWidget } from "./TopTreemapWidget.js";
import { WatchlistWidget } from "./WatchlistWidget.js";

/** 위젯 설정 — 위젯 종류별로 일부만 사용 */
export interface WidgetConfig {
  title?: string;
  /** watchlist / heatmap 용 */
  tickers?: string[];
  /** ticker / candle 용 */
  ticker?: string;
  /** watchlist 용 — notion(관심종목 DB 자동) / manual(직접 입력) */
  source?: "notion" | "manual";
  /** candle 용 — 기본 간격(틱/1분/일/주/월) */
  interval?: CandleInterval;
}

export type WidgetTypeId =
  | "watchlist"
  | "ticker"
  | "heatmap"
  | "holdings"
  | "etf-afterhours"
  | "top-treemap-domestic"
  | "top-treemap-overseas"
  | "top-table-domestic"
  | "top-table-overseas"
  | "fear-greed-domestic"
  | "fear-greed-overseas"
  | "candle";

/** 주제별 카테고리 (Explore 그룹·정렬 순서) */
export type WidgetCategory = "내 자산" | "시장 전체" | "개별 종목";
export const CATEGORY_ORDER: WidgetCategory[] = ["내 자산", "시장 전체", "개별 종목"];

/** 설정 입력 종류 */
export type ConfigField =
  | { kind: "text"; key: "title"; label: string; placeholder?: string }
  | { kind: "tickers"; key: "tickers"; label: string }
  | { kind: "ticker"; key: "ticker"; label: string }
  | { kind: "source"; key: "source"; label: string };

export interface WidgetTypeDef {
  id: WidgetTypeId;
  name: string;
  description: string;
  category: WidgetCategory;
  accent: string; // Explore 카드 미리보기 배경
  defaultConfig: WidgetConfig;
  fields: ConfigField[];
  render: (cfg: WidgetConfig) => ReactNode;
}

export interface ComingSoonDef {
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  comingSoon: true;
}

export const WIDGET_TYPES: WidgetTypeDef[] = [
  {
    id: "watchlist",
    name: "관심종목",
    description: "관심종목 DB 자동 연동(코드·이름 매칭, 최대 10) 또는 직접 입력",
    category: "내 자산",
    accent: "#eef4ff",
    defaultConfig: { title: "관심종목", source: "notion", tickers: ["005930", "000660", "035420"] },
    fields: [
      { kind: "text", key: "title", label: "제목", placeholder: "관심종목" },
      { kind: "source", key: "source", label: "종목 소스" },
      { kind: "tickers", key: "tickers", label: "종목 코드(직접 입력 시)" },
    ],
    render: (cfg) => (
      <WatchlistWidget tickers={cfg.tickers ?? []} title={cfg.title} source={cfg.source ?? "notion"} />
    ),
  },
  {
    id: "holdings",
    name: "내 보유 종목",
    description: "종목 DB 보유내역 + 라이브 평가손익(국내·국외)",
    category: "내 자산",
    accent: "#f0fbf3",
    defaultConfig: { title: "내 보유 종목" },
    fields: [{ kind: "text", key: "title", label: "제목", placeholder: "내 보유 종목" }],
    render: (cfg) => <HoldingsWidget title={cfg.title} />,
  },
  {
    id: "etf-afterhours",
    name: "ETF 시간외 예상가",
    description: "보유 ETF 구성종목 기반 시간외 예상가(iNAV 근사)",
    category: "내 자산",
    accent: "#fff7ec",
    defaultConfig: { title: "보유 ETF 시간외 예상가" },
    fields: [{ kind: "text", key: "title", label: "제목", placeholder: "보유 ETF 시간외 예상가" }],
    render: (cfg) => <EtfAfterHoursWidget title={cfg.title} />,
  },
  {
    id: "top-treemap-domestic",
    name: "국내 시총맵",
    description: "국내 시총 상위 100 트리맵(크기=시총, 색=등락)",
    category: "시장 전체",
    accent: "#fdeef0",
    defaultConfig: { title: "국내 시총 상위 100" },
    fields: [{ kind: "text", key: "title", label: "제목" }],
    render: (cfg) => <TopTreemapWidget market="domestic" title={cfg.title} />,
  },
  {
    id: "top-treemap-overseas",
    name: "미국 시총맵",
    description: "미국 시총 상위 100 트리맵(크기=시총, 색=등락)",
    category: "시장 전체",
    accent: "#eef0fd",
    defaultConfig: { title: "미국 시총 상위 100" },
    fields: [{ kind: "text", key: "title", label: "제목" }],
    render: (cfg) => <TopTreemapWidget market="overseas" title={cfg.title} />,
  },
  {
    id: "top-table-domestic",
    name: "국내 TOP 100",
    description: "국내 실시간 TOP 100 표 — 순위·현재가·대비·등락률(더보기)",
    category: "시장 전체",
    accent: "#fdf0ee",
    defaultConfig: { title: "국내 실시간 TOP 100" },
    fields: [{ kind: "text", key: "title", label: "제목" }],
    render: (cfg) => <TopTableWidget market="domestic" title={cfg.title} />,
  },
  {
    id: "top-table-overseas",
    name: "미국 TOP 100",
    description: "미국 실시간 TOP 100 표 — 순위·현재가·대비·등락률(더보기)",
    category: "시장 전체",
    accent: "#f0eefd",
    defaultConfig: { title: "미국 실시간 TOP 100" },
    fields: [{ kind: "text", key: "title", label: "제목" }],
    render: (cfg) => <TopTableWidget market="overseas" title={cfg.title} />,
  },
  {
    id: "fear-greed-domestic",
    name: "국내 탐욕지수",
    description: "공포·탐욕 지수 — 대형주 등락 기반 시장 심리(0~100)",
    category: "시장 전체",
    accent: "#fdeef0",
    defaultConfig: { title: "국내 탐욕지수" },
    fields: [{ kind: "text", key: "title", label: "제목" }],
    render: (cfg) => <FearGreedWidget market="domestic" title={cfg.title} />,
  },
  {
    id: "fear-greed-overseas",
    name: "미국 탐욕지수",
    description: "공포·탐욕 지수 — 미국 대형주 등락 기반 시장 심리(0~100)",
    category: "시장 전체",
    accent: "#eef0fd",
    defaultConfig: { title: "미국 탐욕지수" },
    fields: [{ kind: "text", key: "title", label: "제목" }],
    render: (cfg) => <FearGreedWidget market="overseas" title={cfg.title} />,
  },
  {
    id: "heatmap",
    name: "등락률 히트맵",
    description: "고른 종목들의 등락을 색으로",
    category: "시장 전체",
    accent: "#f6eefd",
    defaultConfig: {
      title: "등락률 히트맵",
      tickers: ["005930", "000660", "035420", "373220", "0167A0"],
    },
    fields: [
      { kind: "text", key: "title", label: "제목", placeholder: "등락률 히트맵" },
      { kind: "tickers", key: "tickers", label: "종목 코드" },
    ],
    render: (cfg) => <HeatmapWidget tickers={cfg.tickers ?? []} title={cfg.title} />,
  },
  {
    id: "ticker",
    name: "단일 종목 시세",
    description: "한 종목의 현재가를 크게",
    category: "개별 종목",
    accent: "#eefbfb",
    defaultConfig: { ticker: "005930" },
    fields: [{ kind: "ticker", key: "ticker", label: "종목 코드" }],
    render: (cfg) => <TickerWidget ticker={cfg.ticker ?? "005930"} />,
  },
  {
    id: "candle",
    name: "캔들 차트",
    description: "OHLCV 캔들 차트 — 틱·1분·일·주·월 전환",
    category: "개별 종목",
    accent: "#eef7ff",
    defaultConfig: { ticker: "005930", interval: "1d" },
    fields: [{ kind: "ticker", key: "ticker", label: "종목 코드 또는 이름" }],
    render: (cfg) => (
      <CandleChartWidget ticker={cfg.ticker ?? "005930"} title={cfg.title} interval={cfg.interval} />
    ),
  },
];

export const COMING_SOON: ComingSoonDef[] = [];

export function getWidgetType(id: string): WidgetTypeDef | undefined {
  return WIDGET_TYPES.find((w) => w.id === id);
}
