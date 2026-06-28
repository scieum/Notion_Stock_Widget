// Vercel 서버리스 함수 — 위젯 백엔드(Express)를 같은 배포 안에서 서빙한다.
// 별도 호스트(Railway 등) 없이 Vercel URL 하나로 프론트 + API가 동작한다.
// 모든 /api/* 요청이 이 catch-all 함수로 들어와 Express 라우터가 처리한다.
// cron(현재가 주기 동기화)은 상시 프로세스가 아니라 여기선 동작하지 않는다 —
// 위젯 표시/라이브 평가손익은 영향 없음(필요 시 Vercel Cron으로 별도 트리거).
//
// dist(빌드 산출물)에서 가져온다: buildCommand가 packages/core·apps/server를
// 먼저 빌드하므로, fixture JSON은 esbuild가 번들에 인라인한다.
import { createApp } from "../apps/server/dist/app.js";

const app = createApp();

export default app;
