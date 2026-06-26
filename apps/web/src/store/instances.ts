import type { WidgetConfig, WidgetTypeId } from "../widgets/registry.js";

/** 사용자가 만든 위젯 인스턴스 ("My Widgets"). 지금은 localStorage, 추후 백엔드 저장으로 확장. */
export interface WidgetInstance {
  id: string;
  type: WidgetTypeId;
  name: string;
  config: WidgetConfig;
  createdAt: number;
}

const KEY = "tnw.widgets.v1";

export function loadInstances(): WidgetInstance[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WidgetInstance[]) : [];
  } catch {
    return [];
  }
}

function save(list: WidgetInstance[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `w_${Math.floor(performance.now() * 1000).toString(36)}`;
}

export function findByType(type: WidgetTypeId): WidgetInstance | undefined {
  return loadInstances().find((w) => w.type === type);
}

/**
 * 위젯 인스턴스 생성 — 단, 같은 타입이 이미 있으면 새로 만들지 않고 기존 것을 돌려준다.
 * (한 번 추가한 위젯이 My Widgets에 중복으로 쌓이지 않도록.)
 */
export function createInstance(
  type: WidgetTypeId,
  name: string,
  config: WidgetConfig,
): WidgetInstance {
  const existing = findByType(type);
  if (existing) return existing;
  const inst: WidgetInstance = { id: uid(), type, name, config, createdAt: Date.now() };
  save([inst, ...loadInstances()]);
  return inst;
}

export function getInstance(id: string): WidgetInstance | undefined {
  return loadInstances().find((w) => w.id === id);
}

export function updateInstance(id: string, patch: Partial<WidgetInstance>): void {
  save(loadInstances().map((w) => (w.id === id ? { ...w, ...patch } : w)));
}

export function deleteInstance(id: string): void {
  save(loadInstances().filter((w) => w.id !== id));
}

/** 임베드는 무상태 — 설정을 URL에 인코딩해 Notion에 그대로 붙일 수 있게 한다. */
export function encodeConfig(config: WidgetConfig): string {
  return btoa(encodeURIComponent(JSON.stringify(config)));
}

export function decodeConfig(d: string): WidgetConfig {
  try {
    return JSON.parse(decodeURIComponent(atob(d))) as WidgetConfig;
  } catch {
    return {};
  }
}

export function embedPath(type: WidgetTypeId, config: WidgetConfig): string {
  return `/embed/${type}?d=${encodeConfig(config)}`;
}
