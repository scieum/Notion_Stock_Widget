import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Market } from "@toss-notion/core";
import { log } from "./util/logger.js";

/**
 * 종목 마스터(디렉터리) — 국내/국외 통합.
 * 토스 종목 마스터 수령 전까지 내장 사전으로 동작한다(부록 D). 키 수령 시
 * 이 데이터를 토스 stock-infos 응답으로 교체하면 된다.
 *
 * 용도:
 *  - 이름↔티커 매칭 (관심종목에 코드 대신 종목명을 넣어도 찾도록 — 사용자 요청).
 *  - TOP 100 트리맵의 섹터·시가총액·기준가 출처.
 *  - 시세 fixture의 기준가(전일종가) 출처.
 */
export interface Security {
  ticker: string;
  name: string;
  /** 추가 매칭어(영문명·축약·별칭). 이름 매칭에 함께 쓴다. */
  aliases?: string[];
  market: Market;
  /** 업종/섹터 — 트리맵 그룹 키 */
  sector: string;
  /** 전일종가(기준가). 통화는 currency. */
  price: number;
  /** 시가총액(상대 크기). KR=조원, US=$B 등 스케일은 시장 내 상대값으로만 사용. */
  marketCap: number;
  currency: string;
  /** ETF 여부 — TOP 100(개별종목)에서는 제외 */
  isEtf?: boolean;
}

// 국내 KOSPI/KOSDAQ 주요 종목: [ticker, name, sector, price(원), marketCap(조원)]
const KR: Array<[string, string, string, number, number, string[]?]> = [
  ["005930", "삼성전자", "반도체", 74200, 442, ["samsung", "삼전"]],
  ["000660", "SK하이닉스", "반도체", 178500, 130, ["hynix", "하이닉스"]],
  ["006400", "삼성SDI", "2차전지", 318000, 22],
  ["373220", "LG에너지솔루션", "2차전지", 412000, 96, ["엘지에너지솔루션", "lg엔솔", "엘지엔솔"]],
  ["051910", "LG화학", "2차전지", 398000, 28, ["엘지화학"]],
  ["003670", "포스코퓨처엠", "2차전지", 268000, 21],
  ["035420", "NAVER", "인터넷", 215000, 35, ["네이버", "naver"]],
  ["035720", "카카오", "인터넷", 47200, 21, ["kakao"]],
  ["207940", "삼성바이오로직스", "바이오", 985000, 70, ["삼바", "samsung biologics"]],
  ["068270", "셀트리온", "바이오", 178000, 39, ["celltrion"]],
  ["000100", "유한양행", "바이오", 132000, 10],
  ["005380", "현대차", "자동차", 248000, 52, ["현대자동차", "hyundai"]],
  ["000270", "기아", "자동차", 102000, 41, ["kia", "기아차"]],
  ["012330", "현대모비스", "자동차", 248000, 23, ["mobis"]],
  ["105560", "KB금융", "금융", 86500, 34, ["kb", "국민금융", "케이비금융"]],
  ["055550", "신한지주", "금융", 58900, 30, ["shinhan", "신한금융"]],
  ["086790", "하나금융지주", "금융", 67800, 19, ["hana", "하나금융"]],
  ["138040", "메리츠금융지주", "금융", 109000, 21, ["meritz", "메리츠"]],
  ["032830", "삼성생명", "금융", 102000, 20],
  ["005490", "POSCO홀딩스", "철강소재", 412000, 33, ["포스코", "posco", "포스코홀딩스"]],
  ["010130", "고려아연", "철강소재", 1015000, 21, ["korea zinc"]],
  ["329180", "HD현대중공업", "조선기계", 248000, 22, ["현대중공업"]],
  ["009540", "HD한국조선해양", "조선기계", 248000, 18, ["한국조선해양"]],
  ["010140", "삼성중공업", "조선기계", 14800, 13],
  ["034020", "두산에너빌리티", "조선기계", 21500, 14, ["두산"]],
  ["012450", "한화에어로스페이스", "방산", 685000, 33, ["한화에어로", "한화"]],
  ["079550", "LIG넥스원", "방산", 412000, 9, ["lig", "넥스원"]],
  ["064350", "현대로템", "방산", 158000, 17, ["로템"]],
  ["028260", "삼성물산", "지주", 158000, 29],
  ["034730", "SK", "지주", 168000, 12, ["에스케이"]],
  ["003550", "LG", "지주", 82000, 13, ["엘지"]],
  ["017670", "SK텔레콤", "통신", 58900, 12, ["skt", "에스케이텔레콤"]],
  ["030200", "KT", "통신", 48500, 12, ["케이티"]],
  ["033780", "KT&G", "소비재", 128000, 16, ["ktng", "케이티앤지"]],
  ["090430", "아모레퍼시픽", "소비재", 138000, 8, ["amore", "아모레"]],
  ["051900", "LG생활건강", "소비재", 385000, 6, ["엘지생활건강"]],
  ["352820", "하이브", "엔터게임", 218000, 9, ["hybe", "방탄", "bts"]],
  ["035900", "JYP Ent.", "엔터게임", 68500, 2, ["jyp"]],
  ["041510", "에스엠", "엔터게임", 98500, 2, ["sm", "에스엠엔터"]],
  ["259960", "크래프톤", "엔터게임", 385000, 19, ["krafton", "배그"]],
  ["036570", "엔씨소프트", "엔터게임", 215000, 5, ["ncsoft", "엔씨"]],
  ["251270", "넷마블", "엔터게임", 58500, 5, ["netmarble"]],
  ["004170", "신세계", "유통", 168000, 2, ["shinsegae"]],
  ["066570", "LG전자", "전자", 92500, 15, ["엘지전자", "lg electronics"]],
  ["011200", "HMM", "운송", 21500, 21, ["에이치엠엠"]],
  ["096770", "SK이노베이션", "에너지", 118000, 11, ["에스케이이노베이션"]],
  ["015760", "한국전력", "에너지", 23500, 15, ["한전", "kepco"]],
  ["009150", "삼성전기", "전자", 138000, 10],
  ["302440", "SK바이오사이언스", "바이오", 58500, 4],
  ["247540", "에코프로비엠", "2차전지", 168000, 16, ["에코프로"]],
];

// 국외(미국) 주요 종목: [ticker, sector, price(USD), marketCap($B)]
const US: Array<[string, string, number, number]> = [
  ["NVDA", "Information Technology", 168, 4100],
  ["MSFT", "Information Technology", 472, 3500],
  ["AAPL", "Information Technology", 212, 3200],
  ["AVGO", "Information Technology", 248, 1150],
  ["ORCL", "Information Technology", 218, 610],
  ["AMD", "Information Technology", 168, 270],
  ["INTC", "Information Technology", 22, 95],
  ["MU", "Information Technology", 118, 130],
  ["SNDK", "Information Technology", 48, 8],
  ["ADBE", "Information Technology", 385, 165],
  ["AMAT", "Information Technology", 198, 160],
  ["PLTR", "Information Technology", 138, 320],
  ["LITE", "Information Technology", 92, 8],
  ["WDC", "Information Technology", 68, 24],
  ["LRCX", "Information Technology", 98, 125],
  ["QCOM", "Information Technology", 162, 178],
  ["STX", "Information Technology", 108, 23],
  ["NOW", "Information Technology", 985, 200],
  ["SMCI", "Information Technology", 42, 25],
  ["KLAC", "Information Technology", 825, 110],
  ["DELL", "Information Technology", 118, 82],
  ["COHR", "Information Technology", 88, 14],
  ["CRWD", "Information Technology", 478, 118],
  ["IBM", "Information Technology", 282, 260],
  ["APH", "Information Technology", 72, 87],
  ["CRM", "Information Technology", 268, 256],
  ["PANW", "Information Technology", 198, 130],
  ["INTU", "Information Technology", 685, 192],
  ["TER", "Information Technology", 98, 16],
  ["DDOG", "Information Technology", 138, 47],
  ["ADI", "Information Technology", 232, 115],
  ["HPE", "Information Technology", 21, 28],
  ["ANET", "Information Technology", 102, 128],
  ["MPWR", "Information Technology", 685, 33],
  ["CSCO", "Information Technology", 68, 270],
  ["GLW", "Information Technology", 52, 45],
  ["TXN", "Information Technology", 198, 180],
  ["APP", "Information Technology", 385, 130],
  ["HOOD", "Financials", 92, 82],
  ["BRK-B", "Financials", 485, 1050],
  ["MA", "Financials", 568, 520],
  ["BAC", "Financials", 45, 345],
  ["JPM", "Financials", 285, 800],
  ["V", "Financials", 358, 700],
  ["SCHW", "Financials", 88, 160],
  ["COIN", "Financials", 285, 72],
  ["GS", "Financials", 612, 195],
  ["C", "Financials", 82, 155],
  ["MS", "Financials", 138, 222],
  ["WFC", "Financials", 78, 255],
  ["UNH", "Health Care", 312, 285],
  ["MRK", "Health Care", 82, 205],
  ["ABT", "Health Care", 132, 230],
  ["CVS", "Health Care", 68, 86],
  ["LLY", "Health Care", 825, 785],
  ["TMO", "Health Care", 452, 170],
  ["SYK", "Health Care", 385, 145],
  ["AMGN", "Health Care", 298, 160],
  ["JNJ", "Health Care", 162, 390],
  ["PFE", "Health Care", 24, 138],
  ["ABBV", "Health Care", 198, 350],
  ["GEV", "Industrials", 562, 155],
  ["GE", "Industrials", 248, 265],
  ["UBER", "Industrials", 88, 185],
  ["CAT", "Industrials", 392, 185],
  ["BA", "Industrials", 212, 160],
  ["ETN", "Industrials", 348, 138],
  ["VRT", "Industrials", 118, 45],
  ["HON", "Industrials", 218, 142],
  ["FIX", "Industrials", 485, 18],
  ["TSLA", "Consumer Discretionary", 342, 1100],
  ["AMZN", "Consumer Discretionary", 218, 2300],
  ["HD", "Consumer Discretionary", 382, 380],
  ["BKNG", "Consumer Discretionary", 5680, 185],
  ["MCD", "Consumer Discretionary", 298, 213],
  ["CCL", "Consumer Discretionary", 28, 36],
  ["WMT", "Consumer Staples", 98, 785],
  ["COST", "Consumer Staples", 985, 437],
  ["PG", "Consumer Staples", 162, 382],
  ["PEP", "Consumer Staples", 138, 190],
  ["KO", "Consumer Staples", 68, 293],
  ["GOOGL", "Communication Services", 182, 2200],
  ["GOOG", "Communication Services", 184, 2200],
  ["NFLX", "Communication Services", 1085, 460],
  ["VZ", "Communication Services", 42, 178],
  ["META", "Communication Services", 712, 1800],
  ["SATS", "Communication Services", 28, 3],
  ["T", "Communication Services", 28, 200],
  ["DIS", "Communication Services", 112, 203],
  ["CEG", "Utilities", 312, 98],
  ["NEE", "Utilities", 72, 148],
  ["SO", "Utilities", 88, 96],
  ["XOM", "Energy", 112, 480],
  ["CVX", "Energy", 152, 270],
  ["LIN", "Materials", 462, 220],
  ["FCX", "Materials", 42, 60],
];

// ETF: TOP100(개별종목)에서는 제외, ETF 시간외/히트맵용
const ETF: Array<[string, string, Market, number, number, string]> = [
  ["0167A0", "SOL AI반도체TOP2플러스", "domestic", 12340, 1, "KRW"],
  ["069500", "KODEX 200", "domestic", 38500, 6, "KRW"],
  ["360750", "TIGER 미국S&P500", "domestic", 21500, 6, "KRW"],
];

// 국외 종목 한글/영문 별칭 — 관심종목에 "테슬라"처럼 적어도 매칭되도록.
const US_ALIASES: Record<string, string[]> = {
  NVDA: ["엔비디아", "nvidia"],
  TSLA: ["테슬라", "tesla"],
  AAPL: ["애플", "apple"],
  MSFT: ["마이크로소프트", "microsoft"],
  AMZN: ["아마존", "amazon"],
  GOOGL: ["구글", "google", "알파벳", "alphabet"],
  GOOG: ["구글c", "alphabet c"],
  META: ["메타", "meta", "페이스북", "facebook"],
  NFLX: ["넷플릭스", "netflix"],
  AMD: ["에이엠디"],
  AVGO: ["브로드컴", "broadcom"],
  INTC: ["인텔", "intel"],
  PLTR: ["팔란티어", "palantir"],
  COIN: ["코인베이스", "coinbase"],
  LLY: ["일라이릴리", "eli lilly"],
  COST: ["코스트코", "costco"],
};

function build(): Security[] {
  const list: Security[] = [];
  for (const [ticker, name, sector, price, mc, aliases] of KR) {
    list.push({
      ticker,
      name,
      ...(aliases ? { aliases } : {}),
      market: "domestic",
      sector,
      price,
      marketCap: mc,
      currency: "KRW",
    });
  }
  for (const [ticker, sector, price, mc] of US) {
    const aliases = US_ALIASES[ticker];
    list.push({
      ticker,
      name: ticker,
      ...(aliases ? { aliases } : {}),
      market: "overseas",
      sector,
      price,
      marketCap: mc,
      currency: "USD",
    });
  }
  for (const [ticker, name, market, price, mc, currency] of ETF) {
    list.push({ ticker, name, market, sector: "ETF", price, marketCap: mc, currency, isEtf: true });
  }
  return list;
}

const CURATED: Security[] = build();

/**
 * 전체 국내 상장 종목 마스터(KOSPI/KOSDAQ) — KRX 상장법인목록에서 생성한 kr-stocks.json.
 * 큐레이트 사전(섹터·시총·기준가 보유)에 없는 종목의 이름↔코드 매칭·표시명을 채운다.
 * 시세는 live 토스가 코드로 제공하므로 price/marketCap은 0 → TOP100·fixture 합성에서 제외.
 * 갱신: `node apps/server/scripts/gen-kr-master.mjs`로 재생성. 토스 종목 마스터 수령 시 대체(§12).
 */
interface MasterRow {
  code: string;
  name: string;
  sector: string;
}
const masterPath = join(dirname(fileURLToPath(import.meta.url)), "toss/fixtures/kr-stocks.json");
function loadKrMaster(): Security[] {
  try {
    const rows = JSON.parse(readFileSync(masterPath, "utf8")) as MasterRow[];
    return rows.map((r) => ({
      ticker: r.code,
      name: r.name,
      market: "domestic" as Market,
      sector: r.sector || "기타",
      price: 0, // 기준가 미보유 → fixture 합성/TOP100 제외(시세는 live 토스가 코드로 제공)
      marketCap: 0,
      currency: "KRW",
    }));
  } catch (err) {
    log.warn("[directory] kr-stocks.json 로드 실패 — 큐레이트 사전만 사용", {
      msg: (err as Error).message,
    });
    return [];
  }
}

// 큐레이트(풍부)를 우선하고, 마스터는 큐레이트에 없는 코드만 보강한다.
const curatedTickers = new Set(CURATED.map((s) => s.ticker.toUpperCase()));
const KR_MASTER = loadKrMaster().filter((s) => !curatedTickers.has(s.ticker.toUpperCase()));
export const SECURITIES: Security[] = [...CURATED, ...KR_MASTER];

/** 매칭용 정규화: 공백·하이픈 제거 + 소문자. */
function norm(s: string): string {
  return s.replace(/[\s\-_.]/g, "").toLowerCase();
}

// 큐레이트가 먼저라 동일 티커/이름은 큐레이트 종목이 우선 채택된다.
const byTicker = new Map<string, Security>();
for (const s of SECURITIES) {
  const k = s.ticker.toUpperCase();
  if (!byTicker.has(k)) byTicker.set(k, s);
}

const byName = new Map<string, Security>();
for (const s of SECURITIES) {
  const nk = norm(s.name);
  if (nk && !byName.has(nk)) byName.set(nk, s);
  for (const a of s.aliases ?? []) {
    const ak = norm(a);
    if (ak && !byName.has(ak)) byName.set(ak, s);
  }
}

export function getSecurity(ticker: string): Security | undefined {
  return byTicker.get(ticker.toUpperCase());
}

/**
 * 코드 또는 종목명(별칭 포함)으로 종목을 찾는다.
 * 사용자가 관심종목에 코드 대신 "삼성전자", "테슬라"처럼 적어도 매칭(요청사항).
 * 매칭 순서: 정확 티커 → 정확 이름/별칭 → 이름 부분일치(유일할 때만).
 */
export function lookup(query: string): Security | undefined {
  const raw = query.trim();
  if (!raw) return undefined;
  const exactTicker = byTicker.get(raw.toUpperCase());
  if (exactTicker) return exactTicker;
  const n = norm(raw);
  const exactName = byName.get(n);
  if (exactName) return exactName;
  // 부분일치 — 후보가 정확히 하나일 때만 채택(모호하면 매칭하지 않음)
  const hits = SECURITIES.filter(
    (s) => norm(s.name).includes(n) || (s.aliases ?? []).some((a) => norm(a).includes(n)),
  );
  return hits.length === 1 ? hits[0] : undefined;
}
