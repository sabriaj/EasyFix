import { COOKIE_NAMES, getCookieValue } from "./cookies.js";
import { sendError } from "./http.js";

export function getSessionTokenFromRequest(req) {
  const cookieToken = getCookieValue(req, COOKIE_NAMES.userSession);
  if (cookieToken) return cookieToken;

  const auth = String(req.headers.authorization || "").trim();
  if (auth.startsWith("Bearer ")) {
    const bearerToken = auth.slice(7).trim();
    if (bearerToken) return bearerToken;
  }

  const headerToken = String(req.headers["x-session-token"] || "").trim();
  if (headerToken) return headerToken;

  const bodyToken = String(req.body?.sessionToken || req.body?.session_token || "").trim();
  if (bodyToken) return bodyToken;

  const queryToken = String(req.query?.sessionToken || req.query?.session_token || "").trim();
  if (queryToken) return queryToken;

  return "";
}

export function createRequireUserSession({ User, sendError, errorWithTime }) {
  return async function requireUserSession(req, res, next) {
    try {
      const sessionToken = getSessionTokenFromRequest(req);
      if (!sessionToken) {
        return sendError(res, 401, "UNAUTHORIZED");
      }

      const user = await User.findOne({ session_token: sessionToken })
        .select("_id name surname address avatarUrl email role credits session_token")
        .lean();

      if (!user) {
        return sendError(res, 401, "UNAUTHORIZED");
      }

      req.authUser = user;
      next();
    } catch (err) {
      errorWithTime("AUTH SESSION ERROR:", err);
      return sendError(res, 500, "SERVER_ERROR");
    }
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const role = String(req.authUser?.role || "");
    if (!roles.includes(role)) {
      return sendError(res, 403, "FORBIDDEN");
    }
    next();
  };
}
