import { withRetry } from "../util/retry.js";

/**
 * 토스 OAuth 토큰 관리 (S0). client_credentials, expires_in≈3600.
 * 만료 60초 전 자동 갱신. 시크릿·토큰은 로그 금지 (CLAUDE.md §6, C1/C3).
 *
 * now()는 테스트 주입용. 실런타임은 Date.now.
 */
export interface TokenManagerOptions {
  apiBase: string;
  clientId: string;
  clientSecret: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

interface CachedToken {
  accessToken: string;
  /** epoch millis */
  expiresAt: number;
}

const RENEW_SKEW_MS = 60_000;

export class TokenManager {
  private cached: CachedToken | null = null;
  private inflight: Promise<string> | null = null;
  private readonly now: () => number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: TokenManagerOptions) {
    this.now = opts.now ?? Date.now;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** 유효 토큰 반환. 만료 임박이면 갱신. 동시 호출은 1개 요청으로 합친다. */
  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - RENEW_SKEW_MS > this.now()) {
      return this.cached.accessToken;
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async fetchToken(): Promise<string> {
    const token = await withRetry(() => this.requestToken());
    this.cached = token;
    return token.accessToken;
  }

  private async requestToken(): Promise<CachedToken> {
    const res = await this.fetchImpl(`${this.opts.apiBase}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`token request failed: ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    return {
      accessToken: json.access_token,
      expiresAt: this.now() + json.expires_in * 1000,
    };
  }
}
