import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchNotionStatus, type NotionStatus } from "../data/api.js";
import { getWidgetType, type WidgetConfig } from "../widgets/registry.js";
import { embedPath, getInstance, updateInstance } from "../store/instances.js";
import { WidgetFrame } from "./WidgetFrame.js";

export function Editor() {
  const { id = "" } = useParams();
  const inst = useMemo(() => getInstance(id), [id]);
  const def = inst ? getWidgetType(inst.type) : undefined;
  const [config, setConfig] = useState<WidgetConfig>(inst?.config ?? {});
  const [copied, setCopied] = useState(false);
  // 종목 입력은 원문을 그대로 보존(콤마/이름이 키 입력마다 지워지지 않도록).
  const [tickersText, setTickersText] = useState<string>((inst?.config.tickers ?? []).join(", "));
  // Notion 연결 상태(DB 연결 필드 안내용) — 서버에 토큰이 있는지 등.
  const [notion, setNotion] = useState<NotionStatus | null>(null);
  const needsNotion = !!def?.fields.some((f) => f.kind === "notion-db");
  useEffect(() => {
    if (!needsNotion) return;
    let alive = true;
    fetchNotionStatus()
      .then((s) => alive && setNotion(s))
      .catch(() => alive && setNotion(null));
    return () => {
      alive = false;
    };
  }, [needsNotion]);

  if (!inst || !def) {
    return (
      <div className="page">
        <p className="muted">위젯을 찾을 수 없습니다.</p>
        <Link to="/" className="btn">
          홈으로
        </Link>
      </div>
    );
  }

  const setField = (key: keyof WidgetConfig, value: unknown) => {
    const next = { ...config, [key]: value };
    setConfig(next);
    updateInstance(id, { config: next });
  };

  const embedUrl = `${location.origin}${embedPath(def.id, config)}`;
  const copy = async () => {
    await navigator.clipboard.writeText(embedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="page editor">
      <Link to="/" className="muted micro back">
        ← My Widgets
      </Link>
      <h2 className="section-h">{def.name} 설정</h2>

      <div className="editor-grid">
        <div className="editor-form">
          {def.fields.map((f) => {
            if (f.kind === "text") {
              return (
                <label className="field" key={f.key}>
                  <span>{f.label}</span>
                  <input
                    value={config.title ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setField("title", e.target.value)}
                  />
                </label>
              );
            }
            if (f.kind === "ticker") {
              return (
                <label className="field" key={f.key}>
                  <span>{f.label}</span>
                  <input
                    value={config.ticker ?? ""}
                    placeholder="005930"
                    onChange={(e) => setField("ticker", e.target.value.trim())}
                  />
                </label>
              );
            }
            if (f.kind === "source") {
              const cur = config.source ?? "notion";
              return (
                <div className="field" key={f.key}>
                  <span>{f.label}</span>
                  <div className="seg">
                    <button
                      type="button"
                      className={cur === "notion" ? "seg-on" : ""}
                      onClick={() => setField("source", "notion")}
                    >
                      관심종목 DB 연동
                    </button>
                    <button
                      type="button"
                      className={cur === "manual" ? "seg-on" : ""}
                      onClick={() => setField("source", "manual")}
                    >
                      직접 입력
                    </button>
                  </div>
                </div>
              );
            }
            if (f.kind === "notion-db") {
              const dbId = (config[f.key] as string | undefined) ?? "";
              return (
                <label className="field" key={f.key}>
                  <span>{f.label} · 링크 또는 ID 붙여넣기</span>
                  <input
                    value={dbId}
                    placeholder="https://notion.so/... 또는 32자리 ID (비우면 서버 기본 DB)"
                    onChange={(e) => setField(f.key, e.target.value.trim())}
                  />
                  {notion && !notion.hasToken ? (
                    <span className="micro field-warn">
                      서버에 NOTION_TOKEN이 없어 예시 데이터로 표시됩니다. 서버 .env에 토큰을
                      설정하고, Notion에서 통합(integration)을 해당 DB에 공유하세요.
                    </span>
                  ) : dbId ? (
                    <span className="micro muted">
                      이 DB를 읽습니다. 서버 통합이 해당 DB에 공유돼 있어야 합니다. (아래 미리보기로
                      확인)
                    </span>
                  ) : (
                    <span className="micro muted">
                      비우면 서버 기본 종목 DB(.env의 NOTION_STOCK_DB_ID)를 사용합니다.
                    </span>
                  )}
                </label>
              );
            }
            // tickers — 코드 또는 종목명을 콤마/줄바꿈으로 구분(이름만 적어도 매칭)
            return (
              <label className="field" key={f.key}>
                <span>{f.label} · 콤마로 구분 (이름·코드 모두 가능)</span>
                <textarea
                  rows={3}
                  value={tickersText}
                  placeholder="삼성전자, SK하이닉스, NVDA, 000660"
                  onChange={(e) => {
                    setTickersText(e.target.value);
                    setField(
                      "tickers",
                      e.target.value
                        .split(/[,\n]/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    );
                  }}
                />
              </label>
            );
          })}

          <div className="embed-box">
            <span className="micro muted">Notion 임베드 링크</span>
            <div className="embed-row">
              <input readOnly value={embedUrl} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={copy}>
                {copied ? "복사됨" : "복사"}
              </button>
            </div>
            <span className="micro muted">
              Notion에서 /embed → 이 링크 붙여넣기. (현재 설정이 링크에 포함됨)
            </span>
          </div>
        </div>

        <div className="editor-preview">
          <span className="micro muted">미리보기</span>
          <div className="preview-stage">
            <WidgetFrame>{def.render(config)}</WidgetFrame>
          </div>
        </div>
      </div>
    </div>
  );
}
