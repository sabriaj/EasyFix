export function createRateLimiter({ sendError, getKey, windowMs, max, errorCode }) {
  const rateLimitStore = new Map();

  function cleanupRateLimitStore(nowTs) {
    for (const [key, entry] of rateLimitStore.entries()) {
      if (!entry || entry.resetAt <= nowTs) {
        rateLimitStore.delete(key);
      }
    }
  }

  return (req, res, next) => {
    const nowTs = Date.now();
    cleanupRateLimitStore(nowTs);

    const key = String(getKey(req) || "").trim();
    if (!key) return next();

    const bucketKey = `${req.method}:${req.route?.path || req.path}:${key}`;
    const existing = rateLimitStore.get(bucketKey);

    if (!existing || existing.resetAt <= nowTs) {
      rateLimitStore.set(bucketKey, { count: 1, resetAt: nowTs + windowMs });
      return next();
    }

    if (existing.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - nowTs) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return sendError(res, 429, errorCode || "RATE_LIMITED", {
        retry_after_seconds: retryAfterSeconds
      });
    }

    existing.count += 1;
    rateLimitStore.set(bucketKey, existing);
    return next();
  };
}

export function getRateLimitClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.ip || req.socket?.remoteAddress || "unknown");
}
