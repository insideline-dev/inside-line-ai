/// <reference types="vite/client" />

// Web environment variables (Vite)
export const env = {
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL || "/api",
  VITE_FRONTEND_BASE_URL: import.meta.env.VITE_FRONTEND_BASE_URL || (import.meta.env.DEV ? "http://localhost:3030" : ""),
  VITE_MOCK_AUTH: import.meta.env.DEV && import.meta.env.VITE_MOCK_AUTH === "true",
} as const;
