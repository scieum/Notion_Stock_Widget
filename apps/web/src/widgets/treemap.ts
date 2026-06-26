/**
 * Squarified treemap (Bruls et al. 2000) — 외부 라이브러리 없이 직접 구현.
 * 셀이 정사각형에 가깝도록 배치해 면적(=시가총액) 비교가 쉽다.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Node<T> {
  item: T;
  area: number;
}

/** 한 행의 최악 종횡비 — 작을수록 정사각형에 가깝다. */
function worst<T>(row: Node<T>[], side: number): number {
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const n of row) {
    sum += n.area;
    if (n.area > max) max = n.area;
    if (n.area < min) min = n.area;
  }
  const s2 = sum * sum;
  const w2 = side * side;
  return Math.max((w2 * max) / s2, s2 / (w2 * min));
}

/**
 * value(>0) 비례 면적으로 rect를 분할. 각 입력에 좌표(Rect)를 붙여 돌려준다.
 * value 합이 rect 면적과 같아지도록 스케일.
 */
export function squarify<T>(
  input: { item: T; value: number }[],
  rect: Rect,
): (Rect & { item: T })[] {
  const out: (Rect & { item: T })[] = [];
  const items = input.filter((n) => n.value > 0);
  const total = items.reduce((s, n) => s + n.value, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return out;

  const scale = (rect.w * rect.h) / total;
  const nodes: Node<T>[] = items
    .map((n) => ({ item: n.item, area: n.value * scale }))
    .sort((a, b) => b.area - a.area);

  let { x, y, w, h } = rect;
  let i = 0;
  while (i < nodes.length) {
    const side = Math.min(w, h);
    const row: Node<T>[] = [];
    while (i < nodes.length) {
      const next = nodes[i]!;
      if (row.length > 0 && worst(row, side) < worst([...row, next], side)) break;
      row.push(next);
      i++;
    }
    const rowArea = row.reduce((s, n) => s + n.area, 0);
    if (w >= h) {
      // 세로 한 줄(폭 colW)로 쌓는다
      const colW = rowArea / h;
      let cy = y;
      for (const n of row) {
        const nh = n.area / colW;
        out.push({ item: n.item, x, y: cy, w: colW, h: nh });
        cy += nh;
      }
      x += colW;
      w -= colW;
    } else {
      // 가로 한 줄(높이 rowH)로 늘어놓는다
      const rowH = rowArea / w;
      let cx = x;
      for (const n of row) {
        const nw = n.area / rowH;
        out.push({ item: n.item, x: cx, y, w: nw, h: rowH });
        cx += nw;
      }
      y += rowH;
      h -= rowH;
    }
  }
  return out;
}
