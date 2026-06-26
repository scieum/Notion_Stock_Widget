import type { EtfDef, NotionStockRow } from "@toss-notion/core";

/**
 * Notion DB 접근 추상화. 로직을 Notion SDK 없이 테스트하기 위한 경계.
 *
 * 소유권 불변식(§5.3): 시스템이 쓸 수 있는 건 종목 DB의 `현재가`뿐이다.
 * 따라서 종목 게이트웨이는 **현재가 쓰기 메서드만** 노출한다. 관심종목·ETF
 * 게이트웨이는 **읽기 전용**(위젯 표시용) — 쓰기 통로 자체가 없다.
 */
export interface NotionStockGateway {
  /** 종목 DB 전 행을 읽어 정규화(pageId·ticker·평단가·수량·현재가). */
  listStockRows(): Promise<NotionStockRow[]>;
  /** 단일 페이지의 `현재가` 필드만 갱신. */
  updateCurrentPrice(pageId: string, price: number): Promise<void>;
}

/** 관심종목 DB의 원본 1행 — `query`는 코드 또는 종목명(매칭은 서비스가 수행). */
export interface WatchlistEntry {
  pageId: string;
  /** 사용자가 적은 값 — 코드("005930") 또는 이름("삼성전자"). */
  query: string;
  /** 정렬 순서(선택). 작을수록 위. */
  order?: number;
}

/** 별도 '관심종목 DB' 읽기 전용 게이트웨이. */
export interface NotionWatchlistGateway {
  listWatchlist(): Promise<WatchlistEntry[]>;
}

/** ETF별 구성종목 DB 읽기 전용 게이트웨이(시간외 예상가 계산용). */
export interface NotionEtfGateway {
  listEtfs(): Promise<EtfDef[]>;
}
