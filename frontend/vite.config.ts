import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/** 백엔드 어디로 보낼지 — 브라우저는 안 맞춰도 되고 개발 서버 프록시만 이 값을 씀 (`frontend/.env.development`) */
function devBackendTarget(mode: string) {
  const env = loadEnv(mode, process.cwd(), "");
  const raw = typeof env.VITE_API_BASE === "string" ? env.VITE_API_BASE.trim().replace(/\/$/, "") : "";
  return raw.length > 0 ? raw : "http://127.0.0.1:8000";
}

export default defineConfig(({ mode }) => {
  const backend = devBackendTarget(mode);

  return {
    plugins: [
      react(),
      {
        name: "favicon-ico-redirect",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === "/favicon.ico" || req.url?.startsWith("/favicon.ico?")) {
              res.statusCode = 302;
              res.setHeader("Location", "/favicon.svg");
              res.end();
              return;
            }
            next();
          });
        },
      },
    ],
    server: {
      /** IPv4 로 접속해야 함(API/SSE 기본값이 127.0.0.1 이라 브라우저도 같은 호스트 사용 권장) */
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/sessions": { target: backend, changeOrigin: true },
        "/settings": { target: backend, changeOrigin: true },
      },
    },
  };
});
