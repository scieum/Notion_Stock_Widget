/**
 * BYOK 자격증명 — 사용자의 증권사 API 키/시크릿.
 * 저장은 **이 브라우저(localStorage)에만**. 우리 서버/DB엔 절대 저장하지 않는다.
 * 시세 조회 시에만 요청 헤더로 백엔드에 전달되고, 백엔드는 그 즉시 사용 후 버린다(저장·로그 X).
 *
 * 주의(임베드): Notion iframe 안에서는 저장소가 상위 사이트(notion.so) 기준으로
 * 파티셔닝된다. 그래서 키 입력/저장은 임베드 컨텍스트 안에서 이뤄져야 임베드들이 공유한다.
 * 일부 브라우저(사파리 등)는 서드파티 iframe 저장을 막을 수 있어 write가 실패할 수 있다 →
 * 그 경우 메모리 폴백으로 현재 세션 동안만 동작한다.
 */

export type Brokerage = "toss";

export interface Credentials {
  brokerage: Brokerage;
  /** 토스 client_id (앱키) */
  apiKey: string;
  /** 토스 client_secret (시크릿 키) */
  secretKey: string;
  /** 계좌번호(선택) — 보유 조회용 X-Tossinvest-Account */
  account?: string;
}

const KEY = "tnw.creds.v1";
const SKIP_KEY = "tnw.creds.skip";

// localStorage가 막힌 환경(서드파티 iframe 차단 등)을 위한 메모리 폴백.
let memoryCreds: Credentials | null = null;

export function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Credentials;
  } catch {
    /* 접근 불가 → 메모리 폴백 */
  }
  return memoryCreds;
}

export function saveCredentials(c: Credentials): void {
  memoryCreds = c;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* 저장 불가여도 메모리로 이번 세션은 동작 */
  }
}

export function clearCredentials(): void {
  memoryCreds = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export function hasCredentials(): boolean {
  const c = loadCredentials();
  return Boolean(c?.apiKey && c?.secretKey);
}

/** "예시로 둘러보기" — 이번 세션 동안 등록 페이지를 건너뛴다(다음 세션엔 다시 안내). */
export function isSkipped(): boolean {
  try {
    return sessionStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSkipped(): void {
  try {
    sessionStorage.setItem(SKIP_KEY, "1");
  } catch {
    /* noop */
  }
}

/** 모든 API 요청에 붙일 자격증명 헤더. 키 없으면 빈 객체(=fixture 동작). */
export function credentialHeaders(): Record<string, string> {
  const c = loadCredentials();
  if (!c?.apiKey || !c?.secretKey) return {};
  const h: Record<string, string> = {
    "X-Toss-Client-Id": c.apiKey,
    "X-Toss-Client-Secret": c.secretKey,
  };
  if (c.account) h["X-Toss-Account"] = c.account;
  return h;
}
