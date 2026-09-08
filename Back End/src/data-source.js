const allowedModes = new Set(["mock", "hybrid", "api"]);

export function createDataSource() {
  const configuredMode = String(import.meta.env.VITE_DATA_SOURCE || "hybrid").toLowerCase();
  const mode = allowedModes.has(configuredMode) ? configuredMode : "hybrid";
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || window.location.origin).replace(/\/$/, "");

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

  const mockMasterData = {
    "cost-centers": [
      ["OCP", "Office of the College President"], ["PNC", "People & Culture"], ["OOG", "Office of Growth"],
      ["DT", "Technology / Digital Transformation"], ["ACAD", "Academics / Residential Campus"],
      ["OPS", "Operations"], ["FIN", "Finance"], ["MKTG", "Marketing"],
    ].map(([code, name]) => ({ id: `mock-${code}`, code, name, is_active: true })),
    vendors: [{ id: "PMC-MNL-01", code: "PMC-MNL-01", name: "Power Mac Center, Inc.", email: "education@powermaccenter.com", status: "active", maskedBankAccountNumber: "•••• 6789" }],
    "chart-of-accounts": [
      { id: "mock-6000", code: "6000", name: "Operating Expenses", account_type: "expense", normal_balance: "debit", is_active: true },
    ],
    "tax-codes": [],
    currencies: [
      { code: "PHP", name: "Philippine Peso", symbol: "₱", decimal_precision: 2, is_active: true },
      { code: "USD", name: "US Dollar", symbol: "$", decimal_precision: 2, is_active: true },
      { code: "EUR", name: "Euro", symbol: "€", decimal_precision: 2, is_active: true },
    ],
    "payment-methods": [
      { id: "mock-check", code: "CHECK", name: "Check", category: "check", is_active: true },
      { id: "mock-transfer", code: "BANK_TRANSFER", name: "Bank Transfer / DigiBanker", category: "bank_transfer", is_active: true },
      { id: "mock-cash", code: "CASH", name: "Cash", category: "cash", is_active: true },
    ],
    "company-bank-accounts": [],
    "document-types": [
      { id: "mock-invoice", code: "INVOICE", name: "Invoice / Billing", copy_requirement: "soft", is_active: true },
      { id: "mock-receipt", code: "RECEIPT", name: "Official Receipt", copy_requirement: "soft", is_active: true },
    ],
  };

  async function masterDataRequest(resource, options) {
    if (mode === "mock") return options ? null : mockMasterData[resource] || [];
    try {
      return await apiRequest(`/api/v1/${resource}`, options);
    } catch (error) {
      if (mode === "hybrid" && !options) return mockMasterData[resource] || [];
      throw error;
    }
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
    listMasterData(resource) { return masterDataRequest(resource); },
    createMasterData(resource, payload, csrfToken) {
      return masterDataRequest(resource, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
    },
    updateMasterData(resource, id, payload, csrfToken) {
      return masterDataRequest(`${resource}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
    },
    deleteMasterData(resource, id, csrfToken) {
      return masterDataRequest(`${resource}/${id}`, { method: "DELETE", headers: { "X-CSRF-Token": csrfToken } });
    },
    createPaymentRequest(payload, csrfToken) {
      if (mode === "mock") return Promise.resolve(null);
      return apiRequest("/api/v1/requests", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
    },
    updatePaymentRequest(id, payload, csrfToken) {
      if (mode === "mock") return Promise.resolve(null);
      return apiRequest(`/api/v1/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
    },
    submitPaymentRequest(id, version, csrfToken, idempotencyKey = crypto.randomUUID()) {
      if (mode === "mock") return Promise.resolve(null);
      return apiRequest(`/api/v1/requests/${id}/submit`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ version }) });
    },
    async listBankAccess() {
      const fallback = [{ user_id: "mock-admin", display_name: "Development System Administrator", email: "admin@payment.local", has_sensitive_access: true }];
      if (mode === "mock") return fallback;
      try { return await apiRequest("/api/v1/bank-access"); }
      catch (error) { if (mode === "hybrid") return fallback; throw error; }
    },
    changeBankAccess(payload, csrfToken) {
      if (mode === "mock") return Promise.resolve(payload);
      return apiRequest("/api/v1/bank-access", { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
    },
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
