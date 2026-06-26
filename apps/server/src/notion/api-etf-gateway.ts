import { Client, isFullPage } from "@notionhq/client";
import { EtfDefSchema, type EtfDef, type Market } from "@toss-notion/core";
import { lookup } from "../directory.js";
import { withRetry } from "../util/retry.js";
import type { NotionEtfGateway } from "./gateway.js";

/**
 * 실제 'ETF별 구성종목 DB' 어댑터(읽기 전용). 토큰·DB ID 수령 후 사용.
 *
 * DB 한 개에 구성종목 행들이 있고, 각 행은 어느 ETF에 속하는지(etf), 구성종목
 * (코드 또는 이름), 비중(0~1)을 가진다. ETF 기준으로 묶어 EtfDef[]로 돌려준다.
 * 구성종목은 §5.6대로 사용자가 수동 등록. 시간외 예상가는 위젯에만 표시(쓰기 없음).
 */
export interface NotionEtfProps {
  /** 소속 ETF(코드 또는 이름) — title/rich_text/select */
  etf: string;
  /** 구성종목(코드 또는 이름) */
  constituent: string;
  /** 비중(number, 0~1) */
  weight: string;
}

export const DEFAULT_ETF_PROPS: NotionEtfProps = {
  etf: "ETF",
  constituent: "구성종목",
  weight: "비중",
};

type AnyProp = { type: string; [k: string]: unknown };

function getPlainText(prop: AnyProp | undefined): string {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title as Array<{ plain_text: string }>).map((t) => t.plain_text).join("");
  if (prop.type === "rich_text")
    return (prop.rich_text as Array<{ plain_text: string }>).map((t) => t.plain_text).join("");
  if (prop.type === "select") return ((prop.select as { name?: string })?.name ?? "").trim();
  return "";
}

function getNumber(prop: AnyProp | undefined): number | null {
  return prop?.type === "number" ? ((prop.number as number | null) ?? null) : null;
}

export class NotionApiEtfGateway implements NotionEtfGateway {
  constructor(
    private readonly client: Client,
    private readonly databaseId: string,
    private readonly props: NotionEtfProps = DEFAULT_ETF_PROPS,
  ) {}

  async listEtfs(): Promise<EtfDef[]> {
    // etf 키 → { name, market, constituents }
    const groups = new Map<string, { ticker: string; name?: string; market: Market; constituents: { ticker: string; weight: number }[] }>();
    let cursor: string | undefined;
    do {
      const res = await withRetry(() =>
        this.client.databases.query({
          database_id: this.databaseId,
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      );
      for (const page of res.results) {
        if (!isFullPage(page)) continue;
        const p = page.properties as unknown as Record<string, AnyProp>;
        const etfRaw = getPlainText(p[this.props.etf]).trim();
        const consRaw = getPlainText(p[this.props.constituent]).trim();
        const weight = getNumber(p[this.props.weight]);
        if (!etfRaw || !consRaw || weight == null) continue;

        const etfSec = lookup(etfRaw);
        const consSec = lookup(consRaw);
        const etfKey = etfSec?.ticker ?? etfRaw;
        const g =
          groups.get(etfKey) ??
          { ticker: etfKey, name: etfSec?.name ?? etfRaw, market: etfSec?.market ?? "domestic", constituents: [] };
        g.constituents.push({ ticker: consSec?.ticker ?? consRaw, weight });
        groups.set(etfKey, g);
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);

    return [...groups.values()].map((g) => EtfDefSchema.parse(g));
  }
}
