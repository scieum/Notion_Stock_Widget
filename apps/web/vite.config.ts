import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // 위젯은 자체 백엔드만 호출한다 (CLAUDE.md §6, C1)
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
