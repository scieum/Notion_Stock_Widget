import { describe, expect, it } from "vitest";
import type { NotionStockRow, Quote } from "@toss-notion/core";
import type { NotionStockGateway } from "./gateway.js";
import { syncCurrentPrices } from "./price-sync.js";

const noSleep = async () => {};

const row = (
  pageId: string,
  ticker: string,
  currentPrice: number | null,
): NotionStockRow => ({
  pageId,
  ticker,
  market: "domestic",
  avgPrice: null,
  quantity: null,
  currentPrice,
});

const quote = (ticker: string, price: number): Quote => ({
  ticker,
  price,
  changeRate: 0,
  market: "domestic",
  currency: "KRW",
  asOf: 0,
});

/** 쓰기를 기록하는 fake. failOn에 든 pageId는 항상 실패. */
function fakeGateway(
  rows: NotionStockRow[],
  failOn: Set<string> = new Set(),
): { gateway: NotionStockGateway; writes: Array<{ pageId: string; price: number }> } {
  const writes: Array<{ pageId: string; price: number }> = [];
  return {
    writes,
    gateway: {
      async listStockRows() {
        return rows;
      },
      async updateCurrentPrice(pageId, price) {
        if (failOn.has(pageId)) throw new Error("notion write 500");
        writes.push({ pageId, price });
      },
    },
  };
}

describe("syncCurrentPrices", () => {
  it("티커 매칭되는 행의 현재가만 쓴다", async () => {
    const { gateway, writes } = fakeGateway([
      row("p1", "005930", 70000),
      row("p2", "000660", 170000),
    ]);
    const quotes = new Map([
      ["005930", quote("005930", 74200)],
      ["000660", quote("000660", 178500)],
    ]);
    const r = await syncCurrentPrices(gateway, quotes, { sleep: noSleep });
    expect(r.updated).toBe(2);
    expect(writes).toEqual([
      { pageId: "p1", price: 74200 },
      { pageId: "p2", price: 178500 },
    ]);
  });

  it("값이 같으면 쓰지 않는다(변경 없는 쓰기 생략)", async () => {
    const { gateway, writes } = fakeGateway([row("p1", "005930", 74200)]);
    const quotes = new Map([["005930", quote("005930", 74200)]]);
    const r = await syncCurrentPrices(gateway, quotes, { sleep: noSleep });
    expect(r.unchanged).toBe(1);
    expect(r.updated).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it("시세 없는 종목은 스킵(쓰기 안 함)", async () => {
    const { gateway, writes } = fakeGateway([row("p1", "AAPL", null)]);
    const r = await syncCurrentPrices(gateway, new Map(), { sleep: noSleep });
    expect(r.skippedNoQuote).toBe(1);
    expect(writes).toHaveLength(0);
  });

  it("레코드 실패는 failures로 모으고 나머지는 계속 진행", async () => {
    const { gateway, writes } = fakeGateway(
      [row("p1", "005930", 0), row("p2", "000660", 0)],
      new Set(["p1"]),
    );
    const quotes = new Map([
      ["005930", quote("005930", 74200)],
      ["000660", quote("000660", 178500)],
    ]);
    const r = await syncCurrentPrices(gateway, quotes, { sleep: noSleep, retries: 2 });
    expect(r.updated).toBe(1);
    expect(r.failures).toEqual([{ pageId: "p1", ticker: "005930", error: "notion write 500" }]);
    expect(writes).toEqual([{ pageId: "p2", price: 178500 }]);
  });

  it("쓰기 사이에 레이트리밋 간격을 적용한다(첫 쓰기 제외)", async () => {
    const delays: number[] = [];
    const { gateway } = fakeGateway([
      row("p1", "A", 0),
      row("p2", "B", 0),
      row("p3", "C", 0),
    ]);
    const quotes = new Map([
      ["A", quote("A", 1)],
      ["B", quote("B", 2)],
      ["C", quote("C", 3)],
    ]);
    await syncCurrentPrices(gateway, quotes, {
      minIntervalMs: 350,
      retries: 1,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    // 3건 쓰기 → 간격은 2번
    expect(delays).toEqual([350, 350]);
  });
});
