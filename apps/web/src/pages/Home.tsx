import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CATEGORY_ORDER,
  COMING_SOON,
  getWidgetType,
  WIDGET_TYPES,
  type WidgetTypeDef,
} from "../widgets/registry.js";
import {
  createInstance,
  deleteInstance,
  loadInstances,
  type WidgetInstance,
} from "../store/instances.js";
import { renderThumb } from "../widgets/thumbs.js";

export function Home() {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<WidgetInstance[]>(() => loadInstances());

  // 이미 추가된 타입(중복 생성 방지 — 클릭 시 기존 위젯으로 이동)
  const addedType = new Map(instances.map((i) => [i.type, i.id]));

  const create = (def: WidgetTypeDef) => {
    const existingId = addedType.get(def.id);
    if (existingId) {
      navigate(`/edit/${existingId}`);
      return;
    }
    const inst = createInstance(def.id, def.name, def.defaultConfig);
    navigate(`/edit/${inst.id}`);
  };

  const remove = (id: string) => {
    deleteInstance(id);
    setInstances(loadInstances());
  };

  return (
    <div className="page">
      <h2 className="section-h">My Widgets</h2>
      <div className="grid">
        <button className="add-card" onClick={() => document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" })}>
          + Add new widget
        </button>
        {instances.map((inst) => {
          const def = getWidgetType(inst.type);
          return (
            <div className="my-card" key={inst.id}>
              <div className="my-preview" onClick={() => navigate(`/edit/${inst.id}`)}>
                {def ? renderThumb(def.id, inst.config) : <span className="muted">알 수 없는 위젯</span>}
              </div>
              <div className="my-meta">
                <span className="name">{inst.name}</span>
                <button className="link-danger" onClick={() => remove(inst.id)}>
                  삭제
                </button>
              </div>
            </div>
          );
        })}
        {instances.length === 0 && (
          <div className="empty muted">
            아직 만든 위젯이 없습니다. 아래 Explore에서 종류를 골라 만들어 보세요.
          </div>
        )}
      </div>

      <h2 className="section-h" id="explore">
        Explore Widgets
      </h2>
      {CATEGORY_ORDER.map((cat) => {
        const defs = WIDGET_TYPES.filter((w) => w.category === cat);
        const soon = COMING_SOON.filter((w) => w.category === cat);
        if (defs.length === 0 && soon.length === 0) return null;
        return (
          <section key={cat} className="volume">
            <h3 className="vol-h">{cat}</h3>
            <div className="grid">
              {defs.map((def) => {
                const added = addedType.has(def.id);
                return (
                  <button
                    key={def.id}
                    className={`explore-card${added ? " added" : ""}`}
                    onClick={() => create(def)}
                    style={{ "--accent": def.accent } as React.CSSProperties}
                  >
                    {added && <span className="added-badge">추가됨</span>}
                    <div className="explore-thumb" style={{ background: def.accent }}>
                      {renderThumb(def.id, def.defaultConfig)}
                    </div>
                    <div className="explore-name">{def.name}</div>
                    <div className="muted micro">{def.description}</div>
                  </button>
                );
              })}
              {soon.map((cs) => (
                <div key={cs.id} className="explore-card disabled">
                  <div className="explore-thumb soon">?</div>
                  <div className="explore-name">{cs.name}</div>
                  <div className="muted micro">Coming Soon</div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
