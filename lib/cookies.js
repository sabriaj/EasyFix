export const COOKIE_NAMES = Object.freeze({
  userSession: "easyfix_user_session",
  adminSession: "easyfix_admin_session",
  ownerSession: "easyfix_owner_session",
  paySession: "easyfix_pay_session",
  deleteSession: "easyfix_delete_session"
});

export function parseCookieHeader(headerValue) {
  const header = String(headerValue || "");
  if (!header) return {};

  const cookies = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();

    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }

  return cookies;
}

export function getCookieValue(req, cookieName) {
  return String(parseCookieHeader(req?.headers?.cookie || "")[cookieName] || "").trim();
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value || ""))}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(Number(options.maxAge) || 0))}`);
  }

  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  parts.push(`Path=${options.path || "/"}`);

  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);

  return parts.join("; ");
}

export function appendResponseCookie(res, serializedCookie) {
  if (!serializedCookie) return;

  if (typeof res.append === "function") {
    res.append("Set-Cookie", serializedCookie);
    return;
  }

  if (typeof res.getHeader === "function" && typeof res.setHeader === "function") {
    const existing = res.getHeader("Set-Cookie");
    if (!existing) {
      res.setHeader("Set-Cookie", serializedCookie);
      return;
    }

    if (Array.isArray(existing)) {
      res.setHeader("Set-Cookie", [...existing, serializedCookie]);
      return;
    }

    res.setHeader("Set-Cookie", [existing, serializedCookie]);
  }
}
