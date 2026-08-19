const allowedModes = new Set(["mock", "hybrid", "api"]);

export function createDataSource() {
  const configuredMode = String(import.meta.env.VITE_DATA_SOURCE || "hybrid").toLowerCase();
  const mode = allowedModes.has(configuredMode) ? configuredMode : "hybrid";
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8002").replace(/\/$/, "");

  return {
    mode,
    async getSystemStatus() {
      if (mode === "mock") return { state: "mock", label: "Mock data" };
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/system/status`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) throw new Error(`API status ${response.status}`);
        const payload = await response.json();
        return {
          state: payload.database === "connected" ? "connected" : "unavailable",
          label: payload.database === "connected" ? "API connected" : "API unavailable",
          payload,
        };
      } catch (error) {
        if (mode === "api") return { state: "unavailable", label: "API required", error: String(error) };
        return { state: "mock", label: "Hybrid · mock fallback", error: String(error) };
      }
    },
  };
}
