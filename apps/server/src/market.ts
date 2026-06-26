import type { Market } from "@toss-notion/core";

/**
 * 장 운영시간 판정 (CLAUDE.md §5.8: 장중에만 폴링/동기화, 장외엔 종가 유지).
 * 서버 TZ에 의존하지 않도록 UTC 기준으로 각 시장 현지시각을 계산한다.
 */

/** UTC epoch(ms) → 해당 타임존(분 오프셋)의 요일/시·분 */
function localParts(now: number, offsetMinutes: number): { day: number; minutes: number } {
  const d = new Date(now + offsetMinutes * 60_000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** 국내(KRX): 평일 09:00–15:30 KST(UTC+9). */
export function isDomesticOpen(now = Date.now()): boolean {
  const { day, minutes } = localParts(now, 9 * 60);
  if (day === 0 || day === 6) return false;
  return minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
}

/** 국외(미국 정규장): 평일 09:30–16:00 ET. DST 무시한 근사(UTC−4). */
export function isOverseasOpen(now = Date.now()): boolean {
  const { day, minutes } = localParts(now, -4 * 60);
  if (day === 0 || day === 6) return false;
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
}

export function isMarketOpen(market: Market, now = Date.now()): boolean {
  return market === "domestic" ? isDomesticOpen(now) : isOverseasOpen(now);
}
