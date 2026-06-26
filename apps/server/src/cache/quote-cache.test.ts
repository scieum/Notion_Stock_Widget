import { describe, expect, it, vi } from "vitest";
import type { Quote } from "@toss-notion/core";
import type { TossClient } from "../toss/client.js";
import { QuoteCache } from "./quote-cache.js";

const q = (ticker: string, asOf: number): Quote => ({
  ticker,
  price: 1000,
  changeRate: 0,
  market: "domestic",
  currency: "KRW",
  asOf,
});

function fakeClient(): { client: TossClient; getQuotes: ReturnType<typeof vi.fn> } {
  const getQuotes = vi.fn(async (tickers: string[]) => tickers.map((t) => q(t, 0)));
  return {
    client: { getQuotes, getHoldings: vi.fn(), getTopMovers: vi.fn(), getCandles: vi.fn() },
    getQuotes,
  };
}

describe("QuoteCache", () => {
  it("첫 호출은 토스에서 가져오고 캐시한다", async () => {
    const { client, getQuotes } = fakeClient();
    let now = 1000;
    const cache = new QuoteCache(client, 4000, () => now);

    const r = await cache.getQuotes(["A", "B"]);
    expect(r.map((x) => x.ticker)).toEqual(["A", "B"]);
    expect(getQuotes).toHaveBeenCalledTimes(1);
  });

  it("TTL 이내 재호출은 네트워크 호출 없음", async () => {
    const { client, getQuotes } = fakeClient();
    let now = 1000;
    const cache = new QuoteCache(client, 4000, () => now);

    await cache.getQuotes(["A"]);
    now += 3000; // < TTL
    await cache.getQuotes(["A"]);
    expect(getQuotes).toHaveBeenCalledTimes(1);
  });

  it("TTL 만료 후엔 다시 가져온다", async () => {
    const { client, getQuotes } = fakeClient();
    let now = 1000;
    const cache = new QuoteCache(client, 4000, () => now);

    await cache.getQuotes(["A"]);
    now += 5000; // > TTL
    await cache.getQuotes(["A"]);
    expect(getQuotes).toHaveBeenCalledTimes(2);
  });

  it("만료/누락분만 골라서 가져온다", async () => {
    const { client, getQuotes } = fakeClient();
    let now = 1000;
    const cache = new QuoteCache(client, 4000, () => now);

    await cache.getQuotes(["A"]); // A 캐시
    getQuotes.mockClear();
    await cache.getQuotes(["A", "B"]); // A는 신선 → B만 요청
    expect(getQuotes).toHaveBeenCalledTimes(1);
    expect(getQuotes).toHaveBeenCalledWith(["B"]);
  });

  it("못 구한 티커는 결과에서 제외(개별 실패 스킵)", async () => {
    const getQuotes = vi.fn(async () => [q("A", 0)]); // B는 안 줌
    const cache = new QuoteCache(
      { client: { getQuotes, getHoldings: vi.fn(), getTopMovers: vi.fn(), getCandles: vi.fn() } as TossClient }.client,
      4000,
    );
    const r = await cache.getQuotes(["A", "B"]);
    expect(r.map((x) => x.ticker)).toEqual(["A"]);
  });
});
