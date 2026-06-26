---
name: toss-api-ref
description: 토스증권 Open API 연동 코드를 쓸 때 참조. OAuth 토큰 관리, 시세/보유/체결/캔들 조회 래퍼, 엔드포인트맵, 레이트리밋·백오프 규칙.
---

# toss-api-ref (빌드 참조)

> 토스 연동 코드(`apps/server/src/toss/*`)를 작성/수정할 때 읽는다. 런타임 스킬 아님.
> **현재 토스 API 키 미수령** → `DATA_SOURCE=fixture`. 실 호출은 어댑터로 격리하고, fixture와 실 응답은 **동일 zod 스키마**(`@toss-notion/core`)를 통과해야 한다.

## 원칙
- **조회 전용.** Order(주문) 엔드포인트는 사용하지 않는다.
- **토스증권 계좌만** 조회 가능 — `X-Tossinvest-Account` 헤더. 타 증권사 데이터는 들어오지 않는다(§5.5).
- 시크릿(`client_secret`)·access_token은 **서버에만**. 로그 금지.

## OAuth (S0)
- `POST /oauth2/token`, `grant_type=client_credentials`. `expires_in≈3600`.
- 서버 캐싱 + 자동 갱신: **만료 60초 전** 재발급. 검증: 만료시각 > 현재+60초.
- 실패 시 재시도 3회(지수 백오프) → 사이클 스킵 + 로그(이전 캐시 유지).

## 사용 표면 (부록 A)
| 카테고리 | 용도 | 비고 |
|----------|------|------|
| Auth `POST /oauth2/token` | client_credentials 토큰 | 서버 캐싱 |
| Market Data | 현재가·호가·체결·캔들·상하한가 | **REST 폴링**(WebSocket 미공개, C2) |
| Stock/Market Info | 종목 마스터·환율·장 운영시간 | 장중 판정·해외환산 |
| Account·Asset | 토스증권 보유·체결 조회 | `X-Tossinvest-Account` |
| (미사용) Order | 주문 | 조회 전용 원칙 |

## 레이트리밋·신뢰성
- **순차 + 지수 백오프**(C4). 동시 다발 호출 금지.
- 시세 조회는 대상의 **≥90%** 확보를 성공 기준으로(미만이면 사이클 스킵).
- 개별 종목 실패는 스킵+로그(셀 stale), 전체 실패는 사이클 스킵.

## 정규화
- 토스 응답 → `QuoteSchema` / `TossHoldingSchema`로 파싱 후 반환. 가격>0·신선도(asOf) 검증.
- 보유 평균매입가 제공 여부 미확정(부록 D #3) → `avgPrice` optional.

## 미해결
- 인증·엔드포인트는 GA 진행에 따라 변동 → **구현 직전 최신 OpenAPI JSON 재확인.**
- fixture 파일 위치: `apps/server/src/toss/fixtures/`.
