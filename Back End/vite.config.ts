import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "");
  const developerDataMode = mode === "mock" || mode === "hybrid" ? mode : null;
  const requestedDataMode = (developerDataMode || env.VITE_DATA_SOURCE || "api").toLowerCase();
  if (command === "build" && ["mock", "hybrid"].includes(requestedDataMode)) {
    throw new Error("Mock and hybrid data sources are development-only. Production builds must use VITE_DATA_SOURCE=api.");
  }
  const apiTarget = env.PAYMENT_API_TARGET || "http://127.0.0.1:58002";
  return {
    plugins: [react()],
    define: developerDataMode ? {
      "import.meta.env.VITE_DATA_SOURCE": JSON.stringify(developerDataMode),
      "import.meta.env.VITE_ENABLE_MOCK_DATA": JSON.stringify("true"),
    } : undefined,
    server: {
      proxy: {
        "/api": apiTarget,
        "/healthz": apiTarget,
        "/saml": apiTarget,
      },
    },
  };
});
