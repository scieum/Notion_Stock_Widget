import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * 임베드 폭에 맞춰 위젯을 자동 스케일한다 (Notion에서 임베드를 줄이면 같이 줄어든다).
 *  - 폭 ≥ designWidth: 스케일 1, 폭을 꽉 채워 유연 배치(reflow).
 *  - 폭 < designWidth: designWidth로 렌더 후 비율 그대로 축소(zoom) → 좁아도 안 깨짐.
 * 높이는 콘텐츠 실제 높이 × 스케일로 따라가, 폭을 줄이면 높이도 같이 준다.
 */
export function FitScaler({
  children,
  designWidth = 360,
}: {
  children: ReactNode;
  designWidth?: number;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [stageWidth, setStageWidth] = useState(designWidth);
  const [outerHeight, setOuterHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const stage = stageRef.current;
    if (!outer || !stage) return;

    const recompute = () => {
      const avail = outer.clientWidth;
      if (avail <= 0) return;
      const s = Math.min(1, avail / designWidth);
      const sw = avail / s; // s<1이면 designWidth, s=1이면 avail(유연)
      setScale(s);
      setStageWidth(sw);
      // 스케일 적용 전 자연 높이(레이아웃 박스) × 스케일
      setOuterHeight(stage.offsetHeight * s);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(outer); // 임베드 폭 변화
    ro.observe(stage); // 콘텐츠 높이 변화
    return () => ro.disconnect();
  }, [designWidth]);

  return (
    <div ref={outerRef} style={{ position: "relative", width: "100%", overflow: "hidden", height: outerHeight }}>
      <div
        ref={stageRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: stageWidth,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
