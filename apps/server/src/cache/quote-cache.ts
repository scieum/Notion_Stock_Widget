import type { Quote } from "@toss-notion/core";
import type { TossClient } from "../toss/client.js";

/**
 * 단기 시세 캐시 (CLAUDE.md §2.2 온디맨드 경로, TTL 3~5초).
 * 온디맨드 시세와 주기 동기화가 **같은 캐시를 공유**한다.
 * now()는 테스트 주입용.
 */
export class QuoteCache {
  private readonly store = new Map<string, { quote: Quote; expiresAt: number }>();

  constructor(
    private readonly client: TossClient,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** 요청 티커들의 시세. 신선한 건 캐시에서, 만료/누락분만 토스에서 가져온다. */
  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const t = this.now();
    const stale = tickers.filter((ticker) => {
      const hit = this.store.get(ticker);
      return !hit || hit.expiresAt <= t;
    });

    if (stale.length > 0) {
      const fresh = await this.client.getQuotes(stale);
      const expiresAt = this.now() + this.ttlMs;
      for (const q of fresh) {
        this.store.set(q.ticker, { quote: q, expiresAt });
      }
    }

    // 요청 순서 유지, 못 구한 티커는 제외(개별 실패는 스킵)
    return tickers
      .map((ticker) => this.store.get(ticker)?.quote)
      .filter((q): q is Quote => q !== undefined);
  }

  /** 캐시에 있는 신선한 스냅샷만 (네트워크 호출 없음) */
  peek(ticker: string): Quote | undefined {
    const hit = this.store.get(ticker);
    if (!hit || hit.expiresAt <= this.now()) return undefined;
    return hit.quote;
  }
}
