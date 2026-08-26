const allowedModes = new Set(["mock", "hybrid", "api"]);

export function createDataSource() {
  const configuredMode = String(import.meta.env.VITE_DATA_SOURCE || "hybrid").toLowerCase();
  const mode = allowedModes.has(configuredMode) ? configuredMode : "hybrid";
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8002").replace(/\/$/, "");

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      credentials: "include",
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) },
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.detail || `API request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  return {
    mode,
    async getSession() {
      if (mode === "mock") return { mock: true, user: null };
      return apiRequest("/api/v1/auth/session");
    },
    async login(email, password) {
      return apiRequest("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    },
    async logout(csrfToken) {
      if (mode === "mock") return;
      return apiRequest("/api/v1/auth/logout", { method: "POST", headers: { "X-CSRF-Token": csrfToken } });
    },
    listUsers() { return apiRequest("/api/v1/users"); },
    listRoles() { return apiRequest("/api/v1/roles"); },
    listPermissions() { return apiRequest("/api/v1/permissions"); },
    listDepartments() { return apiRequest("/api/v1/departments"); },
    createDepartment(payload, csrfToken) {
      return apiRequest("/api/v1/departments", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
    },
    updateDepartment(departmentId, payload, csrfToken) {
      return apiRequest(`/api/v1/departments/${departmentId}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
    },
    deleteDepartment(departmentId, csrfToken) {
      return apiRequest(`/api/v1/departments/${departmentId}`, { method: "DELETE", headers: { "X-CSRF-Token": csrfToken } });
    },
    createUser(payload, csrfToken) {
      return apiRequest("/api/v1/users", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
    },
    updateUser(userId, payload, csrfToken) {
      return apiRequest(`/api/v1/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
    },
    deleteUser(userId, csrfToken) {
      return apiRequest(`/api/v1/users/${userId}`, { method: "DELETE", headers: { "X-CSRF-Token": csrfToken } });
    },
    createRole(payload, csrfToken) { return apiRequest("/api/v1/roles", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) }); },
    updateRole(roleId, payload, csrfToken) { return apiRequest(`/api/v1/roles/${roleId}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) }); },
    deleteRole(roleId, csrfToken) { return apiRequest(`/api/v1/roles/${roleId}`, { method: "DELETE", headers: { "X-CSRF-Token": csrfToken } }); },
    createPermission(payload, csrfToken) { return apiRequest("/api/v1/permissions", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) }); },
    updatePermission(permissionId, payload, csrfToken) { return apiRequest(`/api/v1/permissions/${permissionId}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) }); },
    deletePermission(permissionId, csrfToken) { return apiRequest(`/api/v1/permissions/${permissionId}`, { method: "DELETE", headers: { "X-CSRF-Token": csrfToken } }); },
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
