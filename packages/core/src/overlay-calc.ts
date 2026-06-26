import type { EtfConstituent, Quote } from "./schemas.js";

/**
 * overlay-calc — 순수함수. 부수효과·NaN 금지 (CLAUDE.md §6, §7).
 *
 * 불변식(§5):
 *  - 평단가·평가금액·평가손익·수익률은 Notion 수식이 계산한다.
 *  - 여기서 만드는 값은 위젯 화면용 "라이브 오버레이"일 뿐, Notion에 쓰지 않는다.
 */

/**
 * 라이브 평가손익 = (라이브현재가 − Notion평단가) × Notion보유수량.
 * 평단가/수량은 Notion 값을 그대로 받는다. 저장하지 않는다(화면 즉석 계산).
 */
export function liveUnrealizedPnl(
  livePrice: number,
  notionAvgPrice: number,
  notionQuantity: number,
): number {
  return (livePrice - notionAvgPrice) * notionQuantity;
}

/** 라이브 평가금액 = 라이브현재가 × 보유수량 */
export function liveMarketValue(livePrice: number, notionQuantity: number): number {
  return livePrice * notionQuantity;
}

/** 라이브 수익률 (평단가 0이면 null — 0으로 나누지 않는다) */
export function liveReturnRate(
  livePrice: number,
  notionAvgPrice: number,
): number | null {
  if (notionAvgPrice <= 0) return null;
  return (livePrice - notionAvgPrice) / notionAvgPrice;
}

/**
 * ETF 예상등락률 = Σ(구성종목 등락률 × 비중). iNAV 근사·참고용.
 * 구성종목 시세가 일부 빠지면 가용분만으로 계산하고 비중을 정규화한다.
 * 가용 구성종목이 하나도 없으면 null.
 */
export function etfExpectedChangeRate(
  constituents: EtfConstituent[],
  quotesByTicker: ReadonlyMap<string, Quote>,
): number | null {
  let weighted = 0;
  let totalWeight = 0;
  for (const c of constituents) {
    const q = quotesByTicker.get(c.ticker);
    if (!q) continue;
    weighted += q.changeRate * c.weight;
    totalWeight += c.weight;
  }
  if (totalWeight <= 0) return null;
  return weighted / totalWeight; // 가용분 비중 정규화
}

/** ETF 예상가 ≈ 기준가 × (1 + 예상등락률). 참고용 근사 */
export function etfExpectedPrice(basePrice: number, expectedChangeRate: number): number {
  return basePrice * (1 + expectedChangeRate);
}

/** 시세가 확보된 구성종목 비중 합 ÷ 전체 비중 합 (0~1). 신뢰도 표시용. */
export function etfCoverage(
  constituents: EtfConstituent[],
  quotesByTicker: ReadonlyMap<string, Quote>,
): number {
  let covered = 0;
  let total = 0;
  for (const c of constituents) {
    total += c.weight;
    if (quotesByTicker.has(c.ticker)) covered += c.weight;
  }
  if (total <= 0) return 0;
  return covered / total;
}

export interface EtfAfterHours {
  /** 구성종목 기반 예상등락률 (가용 구성종목 없으면 null) */
  expectedChangeRate: number | null;
  /** 예상가 ≈ 기준가 × (1+예상등락률). 등락률 null이면 null */
  expectedPrice: number | null;
  /** 기준가 대비 변동액(대비). 등락률 null이면 null */
  expectedChange: number | null;
  /** 시세 확보 구성종목 비중 (0~1) */
  coverage: number;
}

/**
 * 보유 ETF의 "시간외 종가" 근사 — 구성종목 등락률 가중합으로 기준가를 보정.
 * 위젯 표시 전용(§1: Notion 현재가에 쓰지 않는다, iNAV 근사·참고용).
 *
 * basePrice = ETF의 정규장 종가(기준가). constituents/quotes로 예상등락률을 구해 적용.
 * 가용 구성종목이 없으면 등락률·예상가 null, coverage 0.
 */
export function etfAfterHoursEstimate(
  basePrice: number,
  constituents: EtfConstituent[],
  quotesByTicker: ReadonlyMap<string, Quote>,
): EtfAfterHours {
  const expectedChangeRate = etfExpectedChangeRate(constituents, quotesByTicker);
  const coverage = etfCoverage(constituents, quotesByTicker);
  if (expectedChangeRate == null) {
    return { expectedChangeRate: null, expectedPrice: null, expectedChange: null, coverage };
  }
  const expectedPrice = etfExpectedPrice(basePrice, expectedChangeRate);
  return {
    expectedChangeRate,
    expectedPrice,
    expectedChange: expectedPrice - basePrice,
    coverage,
  };
}

/**
 * 토스 평균매입가 ↔ Notion 평단가 대조 (자동 덮어쓰기 없음 — §5.2).
 * 차이가 허용오차(원)를 넘으면 mismatch=true → 데이터 플래그 표시(선택).
 * 한쪽이라도 값이 없으면 비교 불가(null).
 */
export function comparePrice(
  tossAvgPrice: number | null | undefined,
  notionAvgPrice: number | null | undefined,
  toleranceKrw: number,
): { mismatch: boolean; diff: number } | null {
  if (tossAvgPrice == null || notionAvgPrice == null) return null;
  const diff = Math.abs(tossAvgPrice - notionAvgPrice);
  return { mismatch: diff > toleranceKrw, diff };
}
