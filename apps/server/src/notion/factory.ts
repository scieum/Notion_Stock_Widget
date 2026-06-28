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

// 서버 토큰으로 만든 Notion Client는 한 번만 생성해 재사용한다(시크릿은 서버에만, §6/C1).
let cachedClient: Client | null | undefined;
function notionClient(config: Config): Client | null {
  if (cachedClient === undefined) {
    cachedClient = config.NOTION_TOKEN ? new Client({ auth: config.NOTION_TOKEN }) : null;
  }
  return cachedClient;
}

/** 서버에 Notion 토큰이 설정돼 있는지(위젯 UI 연결 안내용). 토큰 값은 노출하지 않는다. */
export function notionHasToken(config: Config): boolean {
  return notionClient(config) !== null;
}

// dbId별 종목 게이트웨이 캐시(요청마다 재생성 방지).
const stockGatewayByDb = new Map<string, NotionStockGateway>();

/**
 * 종목 게이트웨이를 해석한다.
 *  - dbId가 주어지면 서버 토큰으로 그 DB의 어댑터(토큰 없으면 fixture).
 *  - dbId가 없으면 기본(env) 게이트웨이.
 * `live`는 실제 Notion DB에 연결됐는지(=fixture가 아닌지) 여부.
 */
export function resolveStockGateway(
  config: Config,
  defaults: NotionGateways,
  dbId?: string,
): { gateway: NotionStockGateway; live: boolean } {
  if (dbId) {
    const client = notionClient(config);
    if (!client) return { gateway: new FixtureStockGateway(), live: false };
    let gw = stockGatewayByDb.get(dbId);
    if (!gw) {
      gw = new NotionApiGateway(client, dbId);
      stockGatewayByDb.set(dbId, gw);
    }
    return { gateway: gw, live: true };
  }
  const live = Boolean(notionClient(config) && config.NOTION_STOCK_DB_ID);
  return { gateway: defaults.stock, live };
}

// dbId별 관심종목 게이트웨이 캐시.
const watchlistGatewayByDb = new Map<string, NotionWatchlistGateway>();

/**
 * 관심종목 게이트웨이를 해석한다(resolveStockGateway와 동일 규칙).
 *  - dbId가 주어지면 서버 토큰으로 그 DB의 어댑터(토큰 없으면 fixture).
 *  - dbId가 없으면 기본(env) 게이트웨이.
 */
export function resolveWatchlistGateway(
  config: Config,
  defaults: NotionGateways,
  dbId?: string,
): { gateway: NotionWatchlistGateway; live: boolean } {
  if (dbId) {
    const client = notionClient(config);
    if (!client) return { gateway: new FixtureWatchlistGateway(), live: false };
    let gw = watchlistGatewayByDb.get(dbId);
    if (!gw) {
      gw = new NotionApiWatchlistGateway(client, dbId);
      watchlistGatewayByDb.set(dbId, gw);
    }
    return { gateway: gw, live: true };
  }
  const live = Boolean(notionClient(config) && config.NOTION_WATCHLIST_DB_ID);
  return { gateway: defaults.watchlist, live };
}

/**
 * 토큰·DB ID가 있으면 실제 Notion 어댑터, 없으면 fixture로 폴백한다(부분 연동 허용).
 * 예: 관심종목 DB만 연결하고 ETF는 아직 fixture 가능.
 */
export function createNotionGateways(config: Config): NotionGateways {
  const client = notionClient(config);

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
