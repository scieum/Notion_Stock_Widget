/**
 * 종목 로고 URL 조립 (서버 책임 — CDN/소스가 바뀌어도 여기만 고친다).
 * 출처: 토스 stock-infos의 logoImageUrl 패턴.
 * 토스 API 키 수령 시, 종목 마스터의 logoImageUrl을 그대로 쓰도록 교체.
 */
export function tossLogoUrl(ticker: string): string {
  return `https://static.toss.im/png-icons/securities/icn-sec-fill-${ticker}.png`;
}
