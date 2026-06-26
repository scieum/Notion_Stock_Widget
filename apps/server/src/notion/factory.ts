import { Client } from "@notionhq/client";
import type { Config } from "../config.js";
import { log } from "../util/logger.js";
import { NotionApiGateway } from "./api-gateway.js";
import { NotionApiEtfGateway } from "./api-etf-gateway.js";
import { NotionApiWatchlistGateway } from "./api-watchlist-gateway.js";
import {
  FixtureEtfGateway,
  FixtureStockGateway,
  FixtureWatchlistGateway,
} from "./fixture-gateways.js";
import type {
  NotionEtfGateway,
  NotionStockGateway,
  NotionWatchlistGateway,
} from "./gateway.js";

export interface NotionGateways {
  stock: NotionStockGateway;
  watchlist: NotionWatchlistGateway;
  etf: NotionEtfGateway;
}

/**
 * 토큰·DB ID가 있으면 실제 Notion 어댑터, 없으면 fixture로 폴백한다(부분 연동 허용).
 * 예: 관심종목 DB만 연결하고 ETF는 아직 fixture 가능.
 */
export function createNotionGateways(config: Config): NotionGateways {
  const client = config.NOTION_TOKEN ? new Client({ auth: config.NOTION_TOKEN }) : null;

  let stock: NotionStockGateway;
  if (client && config.NOTION_STOCK_DB_ID) {
    stock = new NotionApiGateway(client, config.NOTION_STOCK_DB_ID);
    log.info("[notion] 종목 DB: live");
  } else {
    stock = new FixtureStockGateway();
    log.info("[notion] 종목 DB: fixture");
  }

  let watchlist: NotionWatchlistGateway;
  if (client && config.NOTION_WATCHLIST_DB_ID) {
    watchlist = new NotionApiWatchlistGateway(client, config.NOTION_WATCHLIST_DB_ID);
    log.info("[notion] 관심종목 DB: live");
  } else {
    watchlist = new FixtureWatchlistGateway();
    log.info("[notion] 관심종목 DB: fixture");
  }

  let etf: NotionEtfGateway;
  if (client && config.NOTION_ETF_DB_ID) {
    etf = new NotionApiEtfGateway(client, config.NOTION_ETF_DB_ID);
    log.info("[notion] ETF 구성 DB: live");
  } else {
    etf = new FixtureEtfGateway();
    log.info("[notion] ETF 구성 DB: fixture");
  }

  return { stock, watchlist, etf };
}
