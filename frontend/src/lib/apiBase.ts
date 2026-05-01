/**
 * - `npm run dev`: 빈 문자열 → fetch/SSE 모두 브라우저는 같은 출처(5173)로 보냄 · 실제 포트는 Vite 가 `vite.config` 프록시로 전달함.
 * - `vite build` / 미리보기: 백엔드가 다른 호스트면 `VITE_API_BASE`(또는 아래 폴백) 로 직접 호출.
 */
function trimBase(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  return raw.trim().replace(/\/$/, "");
}

const fromEnv = trimBase(import.meta.env.VITE_API_BASE);

export const API_BASE = import.meta.env.DEV
  ? ""
  : fromEnv.length > 0
    ? fromEnv
    : "http://127.0.0.1:8000";
