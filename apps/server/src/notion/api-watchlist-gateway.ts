import { Client, isFullPage } from "@notionhq/client";
import { withRetry } from "../util/retry.js";
import type { NotionWatchlistGateway, WatchlistEntry } from "./gateway.js";

/**
 * 실제 '관심종목 DB' 어댑터(읽기 전용). 토큰·DB ID 수령 후 사용.
 * 종목 칸은 코드("005930") 또는 종목명("삼성전자") 어느 쪽이든 허용 — 매칭은
 * 서비스(resolveByQuery)가 수행한다. 시스템은 이 DB에 절대 쓰지 않는다.
 */
export interface NotionWatchlistProps {
  /** 종목(코드 또는 이름) — title 또는 rich_text */
  query: string;
  /** 정렬 순서(number, 선택) */
  order: string;
}

export const DEFAULT_WATCHLIST_PROPS: NotionWatchlistProps = {
  query: "종목",
  order: "정렬",
};

type AnyProp = { type: string; [k: string]: unknown };

function getPlainText(prop: AnyProp | undefined): string {
  if (!prop) return "";
  const arr =
    prop.type === "title"
      ? (prop.title as Array<{ plain_text: string }>)
      : prop.type === "rich_text"
        ? (prop.rich_text as Array<{ plain_text: string }>)
        : prop.type === "select"
          ? null
          : null;
  if (arr) return arr.map((t) => t.plain_text).join("");
  if (prop.type === "select") return ((prop.select as { name?: string })?.name ?? "").trim();
  return "";
}

function getNumber(prop: AnyProp | undefined): number | undefined {
  if (prop?.type === "number") return (prop.number as number | null) ?? undefined;
  return undefined;
}

export class NotionApiWatchlistGateway implements NotionWatchlistGateway {
  constructor(
    private readonly client: Client,
    private readonly databaseId: string,
    private readonly props: NotionWatchlistProps = DEFAULT_WATCHLIST_PROPS,
  ) {}

  async listWatchlist(): Promise<WatchlistEntry[]> {
    const out: WatchlistEntry[] = [];
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
        const query = getPlainText(p[this.props.query]).trim();
        if (!query) continue;
        const order = getNumber(p[this.props.order]);
        out.push({ pageId: page.id, query, ...(order != null ? { order } : {}) });
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return out;
  }
}
