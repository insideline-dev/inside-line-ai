/// <reference types="vite/client" />

// Web environment variables (Vite)
export const env = {
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8080",
  VITE_FRONTEND_BASE_URL: import.meta.env.VITE_FRONTEND_BASE_URL || "http://localhost:3030",
} as const;
