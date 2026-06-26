/**
 * 경량 로거. 시크릿·토큰은 절대 넘기지 않는다 (CLAUDE.md §6).
 * 사이클 상태(LIVE/DEGRADED/MARKET_CLOSED)와 스킵 사유를 남기는 용도.
 */
type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  out(`[${level}] ${line}`);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
