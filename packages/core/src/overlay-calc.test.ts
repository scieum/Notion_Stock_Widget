import { describe, expect, it } from "vitest";
import {
  comparePrice,
  etfAfterHoursEstimate,
  etfCoverage,
  etfExpectedChangeRate,
  etfExpectedPrice,
  liveReturnRate,
  liveUnrealizedPnl,
} from "./overlay-calc.js";
import type { Quote } from "./schemas.js";

const quote = (ticker: string, price: number, changeRate: number): Quote => ({
  ticker,
  price,
  changeRate,
  market: "domestic",
  currency: "KRW",
  asOf: 0,
});

describe("liveUnrealizedPnl", () => {
  it("(현재가 − 평단가) × 수량", () => {
    expect(liveUnrealizedPnl(12000, 10000, 5)).toBe(10000);
  });
  it("손실은 음수", () => {
    expect(liveUnrealizedPnl(9000, 10000, 5)).toBe(-5000);
  });
  it("수량 0이면 0", () => {
    expect(liveUnrealizedPnl(12000, 10000, 0)).toBe(0);
  });
});

describe("liveReturnRate", () => {
  it("정상 수익률", () => {
    expect(liveReturnRate(11000, 10000)).toBeCloseTo(0.1);
  });
  it("평단가 0이면 null (0 나눗셈 금지)", () => {
    expect(liveReturnRate(11000, 0)).toBeNull();
  });
});

describe("etfExpectedChangeRate", () => {
  it("Σ(등락률 × 비중)", () => {
    const quotes = new Map([
      ["A", quote("A", 100, 0.02)],
      ["B", quote("B", 200, -0.01)],
    ]);
    const rate = etfExpectedChangeRate(
      [
        { ticker: "A", weight: 0.6 },
        { ticker: "B", weight: 0.4 },
      ],
      quotes,
    );
    // (0.02*0.6 + -0.01*0.4) / (0.6+0.4) = 0.008
    expect(rate).toBeCloseTo(0.008);
  });

  it("시세 누락분은 빼고 비중 정규화", () => {
    const quotes = new Map([["A", quote("A", 100, 0.02)]]);
    const rate = etfExpectedChangeRate(
      [
        { ticker: "A", weight: 0.6 },
        { ticker: "B", weight: 0.4 }, // 시세 없음
      ],
      quotes,
    );
    // A만 → 0.02*0.6 / 0.6 = 0.02
    expect(rate).toBeCloseTo(0.02);
  });

  it("가용 구성종목 없으면 null", () => {
    expect(etfExpectedChangeRate([{ ticker: "A", weight: 1 }], new Map())).toBeNull();
  });
});

describe("etfExpectedPrice", () => {
  it("기준가 × (1 + 예상등락률)", () => {
    expect(etfExpectedPrice(10000, 0.05)).toBeCloseTo(10500);
  });
});

describe("etfCoverage", () => {
  it("시세 확보 비중 / 전체 비중", () => {
    const quotes = new Map([["A", quote("A", 100, 0.02)]]);
    const cov = etfCoverage(
      [
        { ticker: "A", weight: 0.7 },
        { ticker: "B", weight: 0.3 }, // 시세 없음
      ],
      quotes,
    );
    expect(cov).toBeCloseTo(0.7);
  });
  it("구성종목 없으면 0", () => {
    expect(etfCoverage([], new Map())).toBe(0);
  });
});

describe("etfAfterHoursEstimate", () => {
  it("기준가에 예상등락률을 적용해 예상가·대비·coverage 산출", () => {
    const quotes = new Map([
      ["A", quote("A", 100, 0.02)],
      ["B", quote("B", 200, -0.01)],
    ]);
    const est = etfAfterHoursEstimate(
      10000,
      [
        { ticker: "A", weight: 0.6 },
        { ticker: "B", weight: 0.4 },
      ],
      quotes,
    );
    // 예상등락률 0.008 → 예상가 10080, 대비 +80, coverage 1
    expect(est.expectedChangeRate).toBeCloseTo(0.008);
    expect(est.expectedPrice).toBeCloseTo(10080);
    expect(est.expectedChange).toBeCloseTo(80);
    expect(est.coverage).toBeCloseTo(1);
  });

  it("가용 구성종목 없으면 등락률·예상가 null, coverage 0", () => {
    const est = etfAfterHoursEstimate(10000, [{ ticker: "A", weight: 1 }], new Map());
    expect(est.expectedChangeRate).toBeNull();
    expect(est.expectedPrice).toBeNull();
    expect(est.expectedChange).toBeNull();
    expect(est.coverage).toBe(0);
  });
});

describe("comparePrice", () => {
  it("허용오차 이내면 mismatch=false", () => {
    expect(comparePrice(10000, 10050, 100)).toEqual({ mismatch: false, diff: 50 });
  });
  it("허용오차 초과면 mismatch=true", () => {
    expect(comparePrice(10000, 10500, 100)).toEqual({ mismatch: true, diff: 500 });
  });
  it("한쪽 값 없으면 비교 불가 null", () => {
    expect(comparePrice(null, 10000, 100)).toBeNull();
    expect(comparePrice(10000, undefined, 100)).toBeNull();
  });
});
