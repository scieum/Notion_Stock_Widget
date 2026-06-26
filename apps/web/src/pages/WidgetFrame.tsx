import type { ReactNode } from "react";

/** 위젯 미리보기 래퍼. preview면 클릭을 막아 카드 클릭과 충돌하지 않게 한다. */
export function WidgetFrame({
  children,
  preview = false,
}: {
  children: ReactNode;
  preview?: boolean;
}) {
  return (
    <div className={`widget-frame${preview ? " preview" : ""}`} style={preview ? { pointerEvents: "none" } : undefined}>
      {children}
    </div>
  );
}
