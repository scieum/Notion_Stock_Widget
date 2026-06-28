import cron from "node-cron";
import { config } from "./config.js";
import { createApp, notion, quoteCache } from "./app.js";
import { runSyncCycle } from "./sync-cycle.js";
import { log } from "./util/logger.js";

/**
 * 상시 실행 진입점 (로컬 dev / 상시 호스트):
 *  1) API 레이어  — createApp()이 구성한 라우트(시세/관심종목/보유/ETF/TOP100).
 *  2) 스케줄러    — node-cron 장중 주기로 종목DB.현재가 동기화.
 *
 * 서버리스(Vercel)에선 app만 쓰고 cron은 안 돈다(상시 프로세스가 없으므로).
 */
const app = createApp();

// [§8.2] 스케줄러 — 장중 주기로 종목DB.현재가 동기화.
if (cron.validate(config.SYNC_INTERVAL_CRON)) {
  cron.schedule(config.SYNC_INTERVAL_CRON, () => {
    runSyncCycle(notion.stock, quoteCache, config).catch((err) =>
      log.error("[sync] 사이클 예외", { msg: (err as Error).message }),
    );
  });
  log.info("[sync] 스케줄러 등록", { cron: config.SYNC_INTERVAL_CRON });
} else {
  log.warn("[sync] SYNC_INTERVAL_CRON 형식 오류 — 스케줄러 미등록", {
    cron: config.SYNC_INTERVAL_CRON,
  });
}

app.listen(config.PORT, () => {
  log.info(`[server] listening on :${config.PORT}`, { dataSource: config.DATA_SOURCE });
});
