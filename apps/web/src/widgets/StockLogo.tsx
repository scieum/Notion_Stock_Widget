import { useState } from "react";

/**
 * 종목 로고. 토스 CDN 이미지를 시도하고, 실패하면 종목명 첫 글자 원형 이니셜로 폴백.
 * (CDN 핫링크 차단/누락에 견디도록.)
 */
export function StockLogo({
  ticker,
  name,
  url,
  size = 24,
}: {
  ticker: string;
  name?: string;
  url?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      <img
        className="logo-img"
        src={url}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        alt=""
        onError={() => setFailed(true)}
        style={{ borderRadius: size }}
      />
    );
  }

  const label = (name ?? ticker).trim();
  const ch = label.charAt(0) || "?";
  const hue = [...ticker].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="logo-fallback"
      aria-hidden
      style={{
        width: size,
        height: size,
        background: `hsl(${hue} 55% 90%)`,
        color: `hsl(${hue} 45% 35%)`,
        fontSize: size * 0.5,
      }}
    >
      {ch}
    </span>
  );
}

export const won = (n: number) => n.toLocaleString("ko-KR");
export const moveClass = (r: number) => (r > 0 ? "up" : r < 0 ? "down" : "");

/** 등락 방향 마커 — 상승 ▲ / 하락 ▼ (속 채운 세모). 부호(+/−) 대신 사용. */
export const tri = (n: number) => (n > 0 ? "▲ " : n < 0 ? "▼ " : "");

/** 등락률 표기 — ▲/▼ + 절대값%. (부호는 세모로 표현) */
export const pct = (r: number) => `${tri(r)}${(Math.abs(r) * 100).toFixed(2)}%`;

/** 통화별 가격 표기. KRW는 정수+원, 그 외(USD 등)는 $ 기호+소수 2자리. */
export function money(n: number, currency = "KRW"): string {
  if (currency === "KRW") return `${Math.round(n).toLocaleString("ko-KR")}원`;
  const sym = currency === "USD" ? "$" : "";
  const v = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${sym}${v}` : `${v} ${currency}`;
}

/** 전일대비(대비) 표기 — ▲/▼ + 절대 금액. 통화 단위 적용. */
export function signed(n: number, currency = "KRW"): string {
  return `${tri(n)}${money(Math.abs(n), currency)}`;
}
