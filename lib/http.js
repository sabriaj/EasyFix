export function sendError(res, status, code, extra = {}) {
  return res.status(status).json({
    success: false,
    error_code: code,
    ...extra,
  });
}
