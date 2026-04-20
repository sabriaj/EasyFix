import { COOKIE_NAMES, getCookieValue } from "./cookies.js";

export function createRequireAdmin({ adminKey, sendError }) {
  return function requireAdmin(req, res, next) {
    try {
      if (!adminKey) {
        return res.status(500).json({ success: false, error: "ADMIN_KEY is not configured on server" });
      }

      const cookieToken = getCookieValue(req, COOKIE_NAMES.adminSession);
      const auth = String(req.headers.authorization || "");
      const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      const token = cookieToken || bearerToken;

      if (!token || token !== adminKey) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      next();
    } catch {
      return sendError(res, 500, "ADMIN_AUTH_ERROR");
    }
  };
}
