import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Quote } from "@toss-notion/core";
import { fetchInstruments, fetchQuotes, type Instrument } from "./api.js";

/**
 * 여러 위젯이 같은 시세/로고를 공유하도록 구독을 한데 모아 한 번에 폴링한다.
 * (위젯마다 따로 요청하지 않음 — 백엔드 부담↓, CLAUDE.md §2 온디맨드 경로.)
 */
interface DataContextValue {
  quotes: Map<string, Quote>;
  instruments: Map<string, Instrument>;
  error: boolean;
  updatedAt: number | null;
  /** 티커 구독. 정리 함수를 반환한다. */
  subscribe: (tickers: string[]) => () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({
  children,
  refreshMs = 5000,
}: {
  children: ReactNode;
  refreshMs?: number;
}) {
  const counts = useRef<Map<string, number>>(new Map());
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [instruments, setInstruments] = useState<Map<string, Instrument>>(new Map());
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const tickers = [...counts.current.keys()];
    if (tickers.length === 0) return;
    try {
      const qs = await fetchQuotes(tickers);
      setQuotes((prev) => {
        const m = new Map(prev);
        for (const q of qs) m.set(q.ticker, q);
        return m;
      });
      setError(false);
      setUpdatedAt(Date.now());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, refreshMs);
    return () => clearInterval(id);
  }, [refresh, refreshMs]);

  const subscribe = useCallback(
    (tickers: string[]) => {
      const fresh: string[] = [];
      for (const t of tickers) {
        const c = counts.current.get(t) ?? 0;
        counts.current.set(t, c + 1);
        if (c === 0) fresh.push(t);
      }
      void refresh();
      if (fresh.length > 0) {
        fetchInstruments(fresh)
          .then((list) =>
            setInstruments((prev) => {
              const m = new Map(prev);
              for (const i of list) m.set(i.ticker, i);
              return m;
            }),
          )
          .catch(() => {});
      }
      return () => {
        for (const t of tickers) {
          const c = counts.current.get(t) ?? 1;
          if (c <= 1) counts.current.delete(t);
          else counts.current.set(t, c - 1);
        }
      };
    },
    [refresh],
  );

  return (
    <DataContext.Provider value={{ quotes, instruments, error, updatedAt, subscribe }}>
      {children}
    </DataContext.Provider>
  );
}

/** 티커 묶음을 구독하고 시세/로고를 받는다. */
export function useMarketData(tickers: string[]) {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useMarketData must be used within DataProvider");
  const key = tickers.join(",");
  useEffect(() => ctx.subscribe(tickers), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    quotes: ctx.quotes,
    instruments: ctx.instruments,
    error: ctx.error,
    updatedAt: ctx.updatedAt,
  };
}
