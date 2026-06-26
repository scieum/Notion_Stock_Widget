import { z } from "zod";

/**
 * 외부 경계(토스/Notion 응답, API 입출력)는 반드시 이 스키마로 파싱 후 사용한다.
 * fixture와 실 응답 모두 동일 스키마를 통과해야 한다 (CLAUDE.md §2, §7).
 */

/** 시장 구분 — 국내(KRX)/국외(US 등). 국내외 종목을 함께 관리한다. */
export const Market = z.enum(["domestic", "overseas"]);
export type Market = z.infer<typeof Market>;

/** 시세 1건 — 토스 Market Data 정규화 결과 */
export const QuoteSchema = z.object({
  /** 종목 티커/코드 (Notion 매칭 키와 동일 형식) */
  ticker: z.string().min(1),
  /** 현재가. 국내=원, 국외=현지통화(currency). 가격은 항상 0 초과 */
  price: z.number().positive(),
  /** 전일대비 등락률 (예: 0.0123 = +1.23%) */
  changeRate: z.number(),
  /** 전일대비 변동액(대비). 통화 단위는 currency를 따른다. 없으면 changeRate에서 파생 가능 */
  change: z.number().optional(),
  /** 시장 구분(국내/국외). 미지정 시 국내로 본다. */
  market: Market.default("domestic"),
  /** 통화 (국내 KRW, 국외 USD 등) */
  currency: z.string().default("KRW"),
  /** 시세 신선도 — epoch millis */
  asOf: z.number().int().nonnegative(),
});
export type Quote = z.infer<typeof QuoteSchema>;

/**
 * 국내/국외 실시간 TOP 100 랭킹 1행.
 * 표 컬럼: 순위·종목명·현재가·대비(change)·등락률(changeRate).
 * 트리맵: sector로 그룹, marketCap으로 셀 크기, changeRate로 색.
 */
export const RankedQuoteSchema = z.object({
  rank: z.number().int().positive(),
  ticker: z.string().min(1),
  name: z.string().min(1),
  price: z.number().positive(),
  /** 전일대비 변동액(대비) */
  change: z.number(),
  /** 전일대비 등락률 */
  changeRate: z.number(),
  /** 업종/섹터 — 트리맵 그룹 키 */
  sector: z.string().min(1),
  /** 시가총액(셀 크기). 통화 무관 상대크기로만 사용 */
  marketCap: z.number().positive(),
  market: Market,
  currency: z.string().default("KRW"),
  /** 종목 로고 URL (표 표시용). 없으면 위젯이 이니셜로 폴백 */
  logoUrl: z.string().optional(),
});
export type RankedQuote = z.infer<typeof RankedQuoteSchema>;

/**
 * 캔들 간격 — 틱/1분/일/주/월 (많이 쓰는 구성).
 * 라이브 토스 간격 토큰 매핑은 toss/client.ts에서 1곳으로 관리(스펙 변동 대비).
 */
export const CandleInterval = z.enum(["tick", "1m", "1d", "1w", "1M"]);
export type CandleInterval = z.infer<typeof CandleInterval>;

/** OHLCV 캔들 1개 (차트용). fixture·실응답 동일 스키마 통과. */
export const CandleSchema = z.object({
  /** 봉 시작 시각 — epoch millis */
  time: z.number().int().nonnegative(),
  open: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  close: z.number().positive(),
  /** 거래량(선택) — 없을 수 있음 */
  volume: z.number().nonnegative().optional(),
});
export type Candle = z.infer<typeof CandleSchema>;

/** 토스증권 보유 1건 (토스증권 계좌만) */
export const TossHoldingSchema = z.object({
  ticker: z.string().min(1),
  quantity: z.number().nonnegative(),
  /** 토스가 제공하는 평균매입가 (제공 여부 미확정 → optional, 부록 D #3) */
  avgPrice: z.number().nonnegative().optional(),
  market: Market.default("domestic"),
  currency: z.string().default("KRW"),
});
export type TossHolding = z.infer<typeof TossHoldingSchema>;

/** Notion 종목 DB에서 읽어오는 값 (평단가·수량은 Notion 수식/롤업 소유) */
export const NotionStockRowSchema = z.object({
  pageId: z.string().min(1),
  ticker: z.string().min(1),
  /** 종목명(표시용) — Notion에 있으면 사용, 없으면 instruments 폴백 */
  name: z.string().optional(),
  /** 시장 구분(국내/국외). Notion에 없으면 instruments로 보정 */
  market: Market.default("domestic"),
  /** Notion이 매매일지에서 계산한 평단가 (시스템은 읽기/대조만) */
  avgPrice: z.number().nonnegative().nullable(),
  /** Notion이 계산한 순보유수량 */
  quantity: z.number().nonnegative().nullable(),
  /** 현재 저장된 현재가 — 변경 없는 쓰기를 건너뛰기 위한 비교용(시스템 소유 필드) */
  currentPrice: z.number().nullable(),
});
export type NotionStockRow = z.infer<typeof NotionStockRowSchema>;

/**
 * 관심종목 DB 1행 (별도 '관심종목 DB' — §사용자 결정).
 * 시스템은 읽기만 하며 시세를 위젯에 띄운다(쓰기 없음).
 */
export const WatchlistRowSchema = z.object({
  pageId: z.string().min(1),
  ticker: z.string().min(1),
  name: z.string().optional(),
  market: Market.default("domestic"),
  /** 정렬 순서(선택) — 작을수록 위. 없으면 DB 순서 유지 */
  order: z.number().optional(),
});
export type WatchlistRow = z.infer<typeof WatchlistRowSchema>;

/** ETF 구성종목 (사용자가 Notion에 수동 등록 — 부록 D #2 / §5.4) */
export const EtfConstituentSchema = z.object({
  ticker: z.string().min(1),
  /** 비중 (0~1). 합이 1이 아닐 수 있음 → 계산 시 정규화 가능 */
  weight: z.number().min(0).max(1),
});
export type EtfConstituent = z.infer<typeof EtfConstituentSchema>;

/**
 * 보유 ETF 정의 (ETF별 구성종목 DB → relation으로 묶음 — §사용자 결정).
 * 시간외 예상가는 위젯에만 표시(§1 불변식: Notion 현재가에 쓰지 않음).
 */
export const EtfDefSchema = z.object({
  ticker: z.string().min(1),
  name: z.string().optional(),
  market: Market.default("domestic"),
  constituents: EtfConstituentSchema.array(),
});
export type EtfDef = z.infer<typeof EtfDefSchema>;

/** 사이클 상태 (CLAUDE.md §6 로깅) */
export const CycleStatus = z.enum(["LIVE", "DEGRADED", "MARKET_CLOSED"]);
export type CycleStatus = z.infer<typeof CycleStatus>;
