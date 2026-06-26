import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry.js";

const noSleep = async () => {};

describe("withRetry", () => {
  it("첫 성공이면 한 번만 호출", async () => {
    const fn = vi.fn(async () => "ok");
    expect(await withRetry(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("실패 후 재시도해서 성공", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 3) throw new Error("transient");
      return "ok";
    });
    expect(await withRetry(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries 횟수만큼 시도 후 마지막 에러 throw", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always");
    });
    await expect(withRetry(fn, { retries: 3, sleep: noSleep })).rejects.toThrow("always");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("지수 백오프 지연 계산 (300, 600)", async () => {
    const delays: number[] = [];
    let n = 0;
    const fn = async () => {
      if (++n < 3) throw new Error("x");
      return "ok";
    };
    await withRetry(fn, {
      baseMs: 300,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    expect(delays).toEqual([300, 600]);
  });
});
