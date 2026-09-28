import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const apiTarget = loadEnv(mode, ".", "").PAYMENT_API_TARGET || "http://127.0.0.1:58002";
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": apiTarget,
        "/healthz": apiTarget,
        "/saml": apiTarget,
      },
    },
  };
});
