import { useState } from "react";
import {
  clearCredentials,
  hasCredentials,
  loadCredentials,
  saveCredentials,
  setSkipped,
  type Brokerage,
} from "../store/credentials.js";

/** 증권사 목록 — 토스만 활성, 나머지는 준비중(BYOK 확장 지점). */
const BROKERAGES: Array<{ id: Brokerage | "soon"; label: string; ready: boolean }> = [
  { id: "toss", label: "토스증권", ready: true },
  { id: "soon", label: "키움·미래에셋 외 (준비중)", ready: false },
];

/**
 * BYOK 등록 화면. 사용자가 본인 증권사 API 키/시크릿을 입력한다.
 * 키는 이 브라우저에만 저장되고 서버엔 저장되지 않는다(store/credentials).
 * 임베드 첫 로드 시(키 없음) 위젯 대신 이 화면이 먼저 뜬다.
 */
export function Connect({
  onDone,
  embedded = false,
}: {
  onDone?: () => void;
  embedded?: boolean;
}) {
  const existing = loadCredentials();
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? "");
  const [secretKey, setSecretKey] = useState(existing?.secretKey ?? "");
  const [account, setAccount] = useState(existing?.account ?? "");
  const [connected, setConnected] = useState(hasCredentials());

  const canSave = apiKey.trim().length > 0 && secretKey.trim().length > 0;

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    saveCredentials({
      brokerage: "toss",
      apiKey: apiKey.trim(),
      secretKey: secretKey.trim(),
      ...(account.trim() ? { account: account.trim() } : {}),
    });
    setConnected(true);
    onDone?.();
  };

  const onDisconnect = () => {
    clearCredentials();
    setApiKey("");
    setSecretKey("");
    setAccount("");
    setConnected(false);
  };

  const onSkip = () => {
    setSkipped();
    onDone?.();
  };

  return (
    <div className={`connect${embedded ? " embedded" : ""}`}>
      <div className="connect-card w-card">
        <h2 className="connect-title">증권사 연결</h2>
        <p className="connect-sub muted">
          본인 증권사 API 키로 실시간 시세·보유를 불러옵니다.
        </p>

        <div className="seg connect-brokers">
          {BROKERAGES.map((b) => (
            <button
              key={b.id}
              type="button"
              className={b.id === "toss" ? "seg-on" : ""}
              disabled={!b.ready}
              title={b.ready ? "" : "준비중"}
            >
              {b.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSave}>
          <label className="field">
            API 키 (client_id)
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="tsck_live_..."
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="field">
            시크릿 키 (client_secret)
            <input
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="tssk_live_..."
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="field">
            계좌번호 (선택 · 보유 조회용)
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="비우면 자동 선택"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <p className="connect-privacy micro muted">
            키는 <b>이 브라우저에만</b> 저장됩니다. 우리 서버·DB에는 저장하지 않으며,
            시세를 불러올 때만 요청에 담겨 전달된 뒤 즉시 폐기됩니다.
          </p>

          <div className="connect-actions">
            <button type="submit" className="btn" disabled={!canSave}>
              {connected ? "키 업데이트" : "연결하기"}
            </button>
            {connected && (
              <button type="button" className="link-danger" onClick={onDisconnect}>
                연결 해제
              </button>
            )}
            <button type="button" className="more-btn connect-skip" onClick={onSkip}>
              예시 데이터로 둘러보기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
