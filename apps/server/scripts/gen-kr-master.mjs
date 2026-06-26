// 전체 국내 상장 종목 마스터 생성기.
//   KRX 상장법인목록(kind.krx.co.kr) → 코드·종목명·업종 → src/toss/fixtures/kr-stocks.json
// 사용: node apps/server/scripts/gen-kr-master.mjs
//   directory.ts가 이 JSON을 읽어 이름↔코드 매칭·표시명을 보강한다(큐레이트 사전 보강분).
//   토스 종목 마스터 수령 시(§12) 이 스크립트/파일을 토스 응답 기반으로 대체.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../src/toss/fixtures/kr-stocks.json");

const url = (mkt) =>
  `https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType=${mkt}`;

async function fetchMarket(mkt) {
  const res = await fetch(url(mkt), {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://kind.krx.co.kr/" },
  });
  if (!res.ok) throw new Error(`${mkt} → ${res.status}`);
  // KRX 응답은 EUC-KR 인코딩의 HTML 표.
  return new TextDecoder("euc-kr").decode(Buffer.from(await res.arrayBuffer()));
}

function cell(s) {
  return s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function parse(html) {
  const rows = [];
  const trs = html.split(/<tr>/i).slice(2); // 헤더 행 제외
  for (const tr of trs) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cell(m[1]));
    if (tds.length < 4) continue;
    const [name, , code, sector] = tds; // 회사명, 시장구분, 종목코드, 업종
    if (!name || !/^\d{4,6}$/.test(code)) continue;
    rows.push({ code: code.padStart(6, "0"), name, sector });
  }
  return rows;
}

const kospi = parse(await fetchMarket("stockMkt"));
const kosdaq = parse(await fetchMarket("kosdaqMkt"));

// 코드 기준 중복 제거 + 코드순 정렬 → 결정론적 파일(불필요한 diff 방지).
const byCode = new Map();
for (const r of [...kospi, ...kosdaq]) if (!byCode.has(r.code)) byCode.set(r.code, r);
const list = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));

writeFileSync(OUT, JSON.stringify(list) + "\n", "utf8");
console.log(`작성: ${OUT}`);
console.log(`  KOSPI ${kospi.length} + KOSDAQ ${kosdaq.length} → 고유 ${list.length}종목`);
