import { Client, isFullPage } from "@notionhq/client";
import { NotionStockRowSchema, type NotionStockRow } from "@toss-notion/core";
import { withRetry } from "../util/retry.js";
import type { NotionStockGateway } from "./gateway.js";

/**
 * 실제 Notion 종목 DB 어댑터. 토큰·DB ID 수령 후 사용.
 * 속성명은 한국어(부록 B)라 설정으로 분리 — 사용자 템플릿에 맞춰 조정.
 */
export interface NotionStockProps {
  ticker: string; // "티커/코드"
  currentPrice: string; // "현재가" (시스템이 쓰는 유일 필드)
  avgPrice: string; // "평단가" (롤업/수식, 읽기만)
  quantity: string; // "보유수량(순)" (롤업/수식, 읽기만)
}

export const DEFAULT_STOCK_PROPS: NotionStockProps = {
  ticker: "티커/코드",
  currentPrice: "현재가",
  avgPrice: "평단가",
  quantity: "보유수량(순)",
};

// SDK 속성 유니온은 거대해서 어댑터 경계에서만 느슨하게 다룬다.
type AnyProp = { type: string; [k: string]: unknown };

/** number / formula(number) / rollup(number) 에서 숫자 추출 */
function getNumber(prop: AnyProp | undefined): number | null {
  if (!prop) return null;
  if (prop.type === "number") return (prop.number as number | null) ?? null;
  if (prop.type === "formula") {
    const f = prop.formula as AnyProp;
    return f?.type === "number" ? ((f.number as number | null) ?? null) : null;
  }
  if (prop.type === "rollup") {
    const r = prop.rollup as AnyProp;
    return r?.type === "number" ? ((r.number as number | null) ?? null) : null;
  }
  return null;
}

/** title / rich_text 에서 평문 추출 */
function getPlainText(prop: AnyProp | undefined): string {
  if (!prop) return "";
  const arr =
    prop.type === "title"
      ? (prop.title as Array<{ plain_text: string }>)
      : prop.type === "rich_text"
        ? (prop.rich_text as Array<{ plain_text: string }>)
        : null;
  return arr?.map((t) => t.plain_text).join("") ?? "";
}

export class NotionApiGateway implements NotionStockGateway {
  constructor(
    private readonly client: Client,
    private readonly databaseId: string,
    private readonly props: NotionStockProps = DEFAULT_STOCK_PROPS,
  ) {}

  async listStockRows(): Promise<NotionStockRow[]> {
    const rows: NotionStockRow[] = [];
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
        const ticker = getPlainText(p[this.props.ticker]).trim();
        if (!ticker) continue; // 티커 없는 행은 매칭 대상 아님
        rows.push(
          NotionStockRowSchema.parse({
            pageId: page.id,
            ticker,
            avgPrice: getNumber(p[this.props.avgPrice]),
            quantity: getNumber(p[this.props.quantity]),
            currentPrice: getNumber(p[this.props.currentPrice]),
          }),
        );
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return rows;
  }

  async updateCurrentPrice(pageId: string, price: number): Promise<void> {
    // 오직 `현재가` 한 필드만 쓴다 (소유권 §5.3).
    await this.client.pages.update({
      page_id: pageId,
      properties: { [this.props.currentPrice]: { number: price } },
    });
  }
}
