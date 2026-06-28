import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getWidgetType } from "../widgets/registry.js";
import { decodeConfig } from "../store/instances.js";
import { hasCredentials, isSkipped } from "../store/credentials.js";
import { Connect } from "./Connect.js";
import { FitScaler } from "./FitScaler.js";

/**
 * 무상태 임베드 뷰 — Notion iframe에 그대로 들어간다.
 * 설정은 URL ?d= 에 인코딩되어 있어 백엔드 저장 없이도 이식 가능.
 */
export function Embed() {
  const { type = "" } = useParams();
  const [params] = useSearchParams();
  const def = getWidgetType(type);
  const config = decodeConfig(params.get("d") ?? "");
  // 첫 로드 시 키가 없고 둘러보기도 안 했으면 BYOK 등록 화면을 먼저 보여준다.
  const [ready, setReady] = useState(() => hasCredentials() || isSkipped());

  if (!def) return <div className="embed-root muted">알 수 없는 위젯: {type}</div>;

  if (!ready) {
    return (
      <div className="embed-root">
        <Connect embedded onDone={() => setReady(true)} />
      </div>
    );
  }

  return (
    <FitScaler>
      <div className="embed-root">{def.render(config)}</div>
    </FitScaler>
  );
}
