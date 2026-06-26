# 토스증권 × Notion 주식 위젯

폴링 기반 시세 위젯(시세·캔들차트·ETF 히트맵·시총맵·TOP100)과, 토스 시세를 Notion `종목 DB.현재가`에 주기 동기화하는 데이터 파이프라인. 런타임 LLM이 없는 **결정론적 웹앱 + 동기화 서버**.

## 구성 (npm workspaces 모노레포)

```
apps/web      React + Vite 위젯 (Notion에 iframe 임베드)
apps/server   Express API + node-cron 동기화 + 토스/Notion 클라이언트
packages/core overlay-calc 순수함수 + 공유 zod 스키마/타입
```

자세한 설계·규약은 [CLAUDE.md](CLAUDE.md), [DESIGN.md](DESIGN.md), [설계서](toss_notion_stock_widget_design.md) 참고.

## 위젯
- 관심종목(코드·이름 매칭, 행 클릭 → 캔들 세부) · 보유 종목 라이브 평가손익
- 캔들 차트(틱·1분·일·주·월, 휠/슬라이더 연속 줌, 십자선 호버 정보)
- 국내/미국 실시간 TOP 100 표·시총맵(트리맵) · 등락률 히트맵 · ETF 시간외 예상가

## 개발

```bash
npm install
cp .env.example .env     # 토스/Notion 키 입력 (없으면 DATA_SOURCE=fixture)
npm run dev:server       # http://localhost:3000  (API + cron)
npm run dev:web          # http://localhost:5173  (위젯)
```

- **키 미수령 시** `DATA_SOURCE=fixture` — 고정 응답으로 전체 파이프라인 동작.
- 외부 응답은 zod로 검증, `packages/core`는 Vitest 단위테스트.

## 데이터 출처
- 시세/보유/체결/캔들: 토스증권 Open API (조회 전용)
- 국내 종목 마스터: KRX 상장법인목록 → `apps/server/scripts/gen-kr-master.mjs`로 생성

## 시크릿
`client_secret`·`access_token`·`NOTION_TOKEN`은 **서버에만**(`.env`, 커밋 금지). 프론트는 자체 백엔드만 호출.
