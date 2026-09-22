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
      const detail = payload?.detail;
      const validationErrors = detail?.errors || payload?.errors;
      const fieldErrors = validationErrors?.map((item) => `${item.field || item.loc?.join(".")}: ${item.message || item.msg}`).join("; ");
      const message = fieldErrors || detail?.message || (typeof detail === "string" ? detail : "") || `API request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.details = detail;
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
    vendors: [{ id: "PMC-MNL-01", code: "PMC-MNL-01", name: "Power Mac Center, Inc.", email: "education@powermaccenter.com", status: "active" }],
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
    async listMasterData(resource) {
      if (mode === "mock") return mockMasterData[resource] || [];
      try {
        const items = [];
        let priorFirstId = null;
        for (let page = 1; ; page += 1) {
          const batch = await apiRequest(`/api/v1/${resource}?page=${page}&page_size=100`);
          const firstId = batch[0]?.id || batch[0]?.code || null;
          if (page > 1 && firstId && firstId === priorFirstId) throw new Error("Master-data pagination did not advance");
          priorFirstId = firstId;
          items.push(...batch);
          if (batch.length < 100) return items;
        }
      } catch (error) {
        if (mode === "hybrid") return mockMasterData[resource] || [];
        throw error;
      }
    },
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
    async listPaymentRequests(filters = {}) {
      if (mode === "mock") return null;
      const params = new URLSearchParams({ page: "1", page_size: "100" });
      const mappings = {
        voucher: "search", department: "department", type: "request_type", status: "status",
        minAmount: "min_amount", maxAmount: "max_amount", sortBy: "sort_by", sortDirection: "sort_direction",
        dateFrom: "date_from", dateTo: "date_to",
      };
      Object.entries(mappings).forEach(([source, target]) => {
        const value = filters[source];
        if (value !== undefined && value !== "" && value !== "all") params.set(target, value);
      });
      try { return await apiRequest(`/api/v1/requests?${params}`); }
      catch (error) { if (mode === "hybrid") return null; throw error; }
    },
    listOwnCashAdvances() {
      if (mode === "mock") return Promise.resolve(null);
      return apiRequest("/api/v1/requests/cash-advance-options");
    },
    getPaymentRequest(id) {
      if (mode === "mock") return Promise.resolve(null);
      return apiRequest(`/api/v1/requests/${id}`);
    },
    updatePaymentRequest(id, payload, csrfToken) {
      if (mode === "mock") return Promise.resolve(null);
      return apiRequest(`/api/v1/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
    },
    submitPaymentRequest(id, version, csrfToken, idempotencyKey = crypto.randomUUID()) {
      if (mode === "mock") return Promise.resolve(null);
      return apiRequest(`/api/v1/requests/${id}/submit`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ version }) });
    },
    deletePaymentRequest(id, csrfToken) {
      if (mode === "mock") return Promise.resolve();
      return apiRequest(`/api/v1/requests/${id}`, { method: "DELETE", headers: { "X-CSRF-Token": csrfToken } });
    },
    cancelPaymentRequest(id, version, note, csrfToken) {
      if (mode === "mock") return Promise.resolve(null);
      return apiRequest(`/api/v1/requests/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ version, note }) });
    },
    reopenPaymentRequest(id, version, note, csrfToken) {
      if (mode === "mock") return Promise.resolve(null);
      return apiRequest(`/api/v1/requests/${id}/reopen`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ version, note }) });
    },
    resubmitPaymentRequest(id, version, note, csrfToken, idempotencyKey = crypto.randomUUID()) {
      if (mode === "mock") return Promise.resolve(null);
      return apiRequest(`/api/v1/requests/${id}/resubmit`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ version, note }) });
    },
    returnPaymentRequest(id, version, note, csrfToken) {
      if (mode === "mock") return Promise.resolve(null);
      return apiRequest(`/api/v1/requests/${id}/return`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ version, note }) });
    },
    getRequestNumberingSetting() {
      if (mode === "mock") return Promise.resolve({ reset_month: 7, current_academic_year: "2026-2027", number_preview: "PR-2026-000001" });
      return apiRequest("/api/v1/request-settings/numbering");
    },
    updateRequestNumberingSetting(resetMonth, csrfToken) {
      if (mode === "mock") return Promise.resolve({ reset_month: resetMonth });
      return apiRequest("/api/v1/request-settings/numbering", { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ reset_month: resetMonth }) });
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
