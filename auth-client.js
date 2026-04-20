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
    buildAuthHeaders
  });
})();
