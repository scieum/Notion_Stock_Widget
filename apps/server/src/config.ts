import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";

// 모노레포 루트의 .env를 로드한다. 워크스페이스 스크립트(`npm run --workspace`)는
// cwd가 apps/server라 기본 dotenv가 루트 .env를 못 찾는다 → 모듈 위치 기준 해석.
// src(tsx)와 dist(node) 모두 루트에서 3단계 아래라 경로가 동일하다.
// Railway 등 .env 없는 환경에선 파일이 없어 no-op(주입된 process.env 사용).
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

/**
 * 환경변수는 여기서 한 번만 zod로 파싱한다.
 * 시크릿은 서버에만 존재한다 (CLAUDE.md §6, C1). 로그에 절대 남기지 않는다.
 */
const EnvSchema = z.object({
  DATA_SOURCE: z.enum(["fixture", "live"]).default("fixture"),

  TOSS_CLIENT_ID: z.string().optional(),
  TOSS_CLIENT_SECRET: z.string().optional(),
  TOSS_ACCOUNT: z.string().optional(),
  TOSS_API_BASE: z.string().url().default("https://openapi.tossinvest.com"),

  NOTION_TOKEN: z.string().optional(),
  NOTION_STOCK_DB_ID: z.string().optional(),
  NOTION_JOURNAL_DB_ID: z.string().optional(),
  /** 별도 '관심종목 DB' (없으면 fixture 사용) */
  NOTION_WATCHLIST_DB_ID: z.string().optional(),
  /** ETF별 구성종목 DB (시간외 예상가용, 없으면 fixture) */
  NOTION_ETF_DB_ID: z.string().optional(),

  /** 관심종목 최대 저장 수 (사용자 정책: 10) */
  WATCHLIST_MAX: z.coerce.number().int().positive().default(10),

  QUOTE_CACHE_TTL_MS: z.coerce.number().int().positive().default(4000),
  SYNC_INTERVAL_CRON: z.string().default("*/3 9-15 * * 1-5"),
  QUOTE_SUCCESS_THRESHOLD: z.coerce.number().min(0).max(1).default(0.9),
  ENABLE_TRADE_IMPORT: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  PORT: z.coerce.number().int().positive().default(3000),
});

export const config = EnvSchema.parse(process.env);
export type Config = typeof config;
