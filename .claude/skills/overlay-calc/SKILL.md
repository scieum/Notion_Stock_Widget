---
name: overlay-calc
description: packages/core의 계산 로직을 구현·검증할 때 참조. 라이브 평가손익 오버레이, ETF 예상가 근사, 토스↔Notion 평단가 대조 사양과 단위테스트 규칙.
---

# overlay-calc (빌드 참조)

> `packages/core`(순수함수)를 구현/수정할 때 읽는다. 구현은 `src/overlay-calc.ts`, 테스트는 `src/overlay-calc.test.ts`.

## 원칙
- **순수함수.** 부수효과·IO·전역상태 없음. **NaN 금지**, 0 나눗셈은 null 반환.
- 여기서 만드는 값은 **위젯 화면용 라이브 오버레이**일 뿐 — **Notion에 쓰지 않는다**(평단가·손익은 Notion 수식, §5.2).
- 모든 함수는 **Vitest 단위테스트 필수**(§7).

## 사양
- `liveUnrealizedPnl(livePrice, notionAvgPrice, notionQty)` = (현재가 − 평단가) × 수량. 평단가·수량은 **Notion 값** 사용.
- `liveMarketValue` = 현재가 × 수량.
- `liveReturnRate` = (현재가 − 평단가) / 평단가. **평단가 ≤ 0 → null.**
- `etfExpectedChangeRate(constituents, quotesByTicker)` = Σ(등락률 × 비중). 시세 누락분은 제외하고 **가용 비중으로 정규화**. 가용 0개 → null. ("iNAV 근사·참고용" 고지, §5.4)
- `etfExpectedPrice(basePrice, rate)` = 기준가 × (1 + rate).
- `comparePrice(tossAvg, notionAvg, toleranceKrw)` → `{mismatch, diff}` / 한쪽 null이면 null. **자동 덮어쓰기 없음** — mismatch는 표시용 플래그(선택).

## 테스트 케이스 가이드
- 손실(음수)·수량 0·평단가 0(null) 경계.
- ETF: 시세 일부 누락 시 정규화, 전부 누락 시 null.
- 대조: 허용오차 경계값, 한쪽 값 부재.
