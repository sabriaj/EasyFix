(function initEasyFixAuth() {
  const STORAGE_KEY = "easyfix_user";

  function sanitizeUser(user) {
    if (!user || typeof user !== "object") return null;

    const rawId = user.id || user._id || user.userId || user.user_id;

    const safeUser = {
      id: rawId ? String(rawId) : "",
      name: String(user.name || ""),
      surname: String(user.surname || ""),
      address: String(user.address || ""),
      avatarUrl: String(user.avatarUrl || ""),
      email: String(user.email || ""),
      role: String(user.role || ""),
      credits: Number(user.credits || 0)
    };

    const sessionToken = String(user.sessionToken || "").trim();
    if (sessionToken) {
      safeUser.sessionToken = sessionToken;
    }

    if (!safeUser.id) return null;
    return safeUser;
  }

  function migrateLegacyUser() {
    try {
      const existing = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      const safeUser = sanitizeUser(existing);
      if (!safeUser) return null;

      if (
        existing &&
        (
          Object.prototype.hasOwnProperty.call(existing, "sessionToken") ||
          Object.prototype.hasOwnProperty.call(existing, "_id") ||
          Object.prototype.hasOwnProperty.call(existing, "userId") ||
          Object.prototype.hasOwnProperty.call(existing, "user_id")
        )
      ) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeUser));
      }

      return safeUser;
    } catch {
      return null;
    }
  }

  function getUser() {
    return migrateLegacyUser();
  }

  function setUser(user) {
    const safeUser = sanitizeUser(user);
    if (!safeUser) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeUser));
    return safeUser;
  }

  function clearUser() {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function buildAuthHeaders(extra = {}) {
    const headers = { ...extra };
    const user = getUser();
    const sessionToken = String(user?.sessionToken || "").trim();

    if (sessionToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${sessionToken}`;
    }

    return headers;
  }

  function translateApiError(errorCode, fallbackKey = "api_server_error") {
    const code = String(errorCode || "").trim().toUpperCase();
    const i18n = window.EASYFIX_I18N;
    const t = i18n?.t;

    if (!code || typeof t !== "function") {
      return String(errorCode || "");
    }

    const map = {
      MISSING_FIELDS: "api_missing_fields",
      INVALID_FIELDS: "api_invalid_fields",
      INVALID_PLAN: "api_invalid_plan",
      EMAIL_NOT_VERIFIED: "api_email_not_verified",
      EMAIL_EKZISTON: "api_email_exists",
      EMAIL_EXISTS: "api_email_exists",
      GEO_NOT_FOUND: "api_geo_not_found",
      SERVER_ERROR: "api_server_error",
      MISSING_EMAIL: "api_missing_email",
      EMAIL_SERVICE_NOT_CONFIGURED: "api_email_service_not_configured",
      MISSING_EMAIL_CODE: "api_missing_email_code",
      INVALID_CODE_FORMAT: "api_invalid_code_format",
      INVALID_CODE: "api_invalid_code",
      NO_ACTIVE_CODE: "api_no_active_code",
      CODE_EXPIRED: "api_code_expired",
      TOO_MANY_ATTEMPTS: "api_too_many_attempts",
      MISSING_LAT_LNG: "api_missing_lat_lng",
      NO_CREDITS: "api_no_credits",
      UNAUTHORIZED: "api_unauthorized",
      FORBIDDEN: "api_forbidden",
      USER_NOT_FOUND: "api_user_not_found",
      CHECKOUT_CREATE_FAILED: "api_checkout_create_failed",
      CHECKOUT_URL_MISSING: "api_checkout_url_missing"
    };

    const key = map[code] || fallbackKey;
    const translated = t(key);
    return translated && translated !== key ? translated : code;
  }

  function apiFetch(input, init = {}) {
    const user = getUser();
    const hasLegacyToken = Boolean(String(user?.sessionToken || "").trim());

    return window.fetch(input, {
      ...init,
      credentials: init.credentials || (hasLegacyToken ? "omit" : "include"),
      headers: buildAuthHeaders(init.headers || {})
    });
  }

  async function apiAuthFetch(input, init = {}) {
    try {
      return await window.fetch(input, {
        ...init,
        credentials: "include",
        headers: { ...(init.headers || {}) }
      });
    } catch {
      return window.fetch(input, {
        ...init,
        credentials: "omit",
        headers: { ...(init.headers || {}) }
      });
    }
  }

  window.EASYFIX_AUTH = Object.freeze({
    getUser,
    setUser,
    clearUser,
    apiFetch,
    apiAuthFetch,
    buildAuthHeaders,
    translateApiError
  });
})();
