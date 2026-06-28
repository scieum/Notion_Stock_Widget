import { useParams, useSearchParams } from "react-router-dom";
import { getWidgetType } from "../widgets/registry.js";
import { decodeConfig } from "../store/instances.js";
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

  if (!def) return <div className="embed-root muted">알 수 없는 위젯: {type}</div>;

  return (
    <FitScaler>
      <div className="embed-root">{def.render(config)}</div>
    </FitScaler>
  );
}
