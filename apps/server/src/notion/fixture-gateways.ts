import holdingsFixture from "../toss/fixtures/holdings.json" with { type: "json" };
import watchlistFixture from "../toss/fixtures/watchlist.json" with { type: "json" };
import etfsFixture from "../toss/fixtures/etfs.json" with { type: "json" };
import {
  EtfDefSchema,
  NotionStockRowSchema,
  type EtfDef,
  type NotionStockRow,
} from "@toss-notion/core";
import { getSecurity } from "../directory.js";
import { log } from "../util/logger.js";
import type {
  NotionEtfGateway,
  NotionStockGateway,
  NotionWatchlistGateway,
  WatchlistEntry,
} from "./gateway.js";

/**
 * fixture 게이트웨이 — Notion 토큰/DB ID 수령 전 전체 파이프라인을 굴린다.
 * 종목 DB는 토스 보유 fixture(holdings.json)로 대체, 관심/ETF는 전용 fixture.
 */
export class FixtureStockGateway implements NotionStockGateway {
  /** fixture에는 Notion이 없으니 쓰기는 메모리에만 반영(검증·로그용). */
  private readonly written = new Map<string, number>();

  async listStockRows(): Promise<NotionStockRow[]> {
    const raw = holdingsFixture as Array<{
      ticker: string;
      quantity: number;
      avgPrice?: number;
    }>;
    return raw.map((h, i) => {
      const sec = getSecurity(h.ticker);
      return NotionStockRowSchema.parse({
        pageId: `fixture-stock-${i}`,
        ticker: h.ticker,
        name: sec?.name,
        market: sec?.market ?? "domestic",
        avgPrice: h.avgPrice ?? null,
        quantity: h.quantity ?? null,
        currentPrice: this.written.get(h.ticker) ?? null,
      });
    });
  }

  async updateCurrentPrice(pageId: string, price: number): Promise<void> {
    this.written.set(pageId, price);
    log.info("[notion:fixture] 현재가 갱신(메모리)", { pageId, price });
  }
}

export class FixtureWatchlistGateway implements NotionWatchlistGateway {
  async listWatchlist(): Promise<WatchlistEntry[]> {
    const raw = watchlistFixture as Array<{
      query: string;
      order?: number;
    }>;
    return raw.map((w, i) => ({
      pageId: `fixture-watch-${i}`,
      query: w.query,
      ...(w.order != null ? { order: w.order } : {}),
    }));
  }
}

export class FixtureEtfGateway implements NotionEtfGateway {
  async listEtfs(): Promise<EtfDef[]> {
    return EtfDefSchema.array().parse(etfsFixture);
  }
}
