import assert from "node:assert/strict";
import crypto from "crypto";

import { registerAdminRoutes } from "../lib/admin-routes.js";
import { createRequireUserSession, getSessionTokenFromRequest, requireRole } from "../lib/auth.js";
import { unlockFirmContact } from "../lib/contact-unlock.js";
import { runCleanup } from "../lib/maintenance.js";
import { registerOwnerRoutes } from "../lib/owner-routes.js";
import { registerPayNowRoutes } from "../lib/pay-now-routes.js";
import { processPaymentWebhook } from "../lib/payment-webhook.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createAppMock() {
  const routes = new Map();
  const app = {
    routes,
    route(method, path) {
      return routes.get(`${method.toUpperCase()} ${path}`);
    }
  };

  for (const method of ["get", "post", "put", "delete"]) {
    app[method] = (path, ...handlers) => {
      routes.set(`${method.toUpperCase()} ${path}`, handlers);
    };
  }

  return app;
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function runRoute(handlers, req) {
  const res = createResponse();

  async function dispatch(index) {
    const handler = handlers[index];
    if (!handler) return res;

    if (handler.length >= 3) {
      await handler(req, res, async () => {
        await dispatch(index + 1);
      });
      return res;
    }

    await handler(req, res);
    return res;
  }

  return dispatch(0);
}

function createNoopMiddleware() {
  return (_req, _res, next) => next();
}

test("session token is read from bearer, header, body, then query", async () => {
  assert.equal(
    getSessionTokenFromRequest({
      headers: { authorization: "Bearer bearer-token", "x-session-token": "header-token" },
      body: { sessionToken: "body-token" },
      query: { sessionToken: "query-token" }
    }),
    "bearer-token"
  );

  assert.equal(
    getSessionTokenFromRequest({
      headers: { "x-session-token": "header-token" },
      body: { sessionToken: "body-token" },
      query: { sessionToken: "query-token" }
    }),
    "header-token"
  );

  assert.equal(
    getSessionTokenFromRequest({
      headers: {},
      body: { session_token: "body-token" },
      query: { sessionToken: "query-token" }
    }),
    "body-token"
  );

  assert.equal(
    getSessionTokenFromRequest({
      headers: {},
      body: {},
      query: { session_token: "query-token" }
    }),
    "query-token"
  );
});

test("require user session loads auth user from session token", async () => {
  const requireUserSession = createRequireUserSession({
    User: {
      findOne: () => ({
        select: () => ({
          lean: async () => ({ _id: "user-1", role: "client", email: "client@example.com" })
        })
      })
    },
    sendError: (res, status, error) => res.status(status).json({ success: false, error }),
    errorWithTime: () => {}
  });

  const req = { headers: { "x-session-token": "session-123" }, body: {}, query: {} };
  const res = createResponse();
  let nextCalled = false;

  await requireUserSession(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.authUser._id, "user-1");
  assert.equal(res.statusCode, 200);
});

test("require role returns forbidden for mismatched role", async () => {
  const middleware = requireRole("pro");
  const req = { authUser: { role: "client" } };
  const res = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { success: false, error_code: "FORBIDDEN" });
});

test("admin delete performs a soft delete and downgrade", async () => {
  const app = createAppMock();
  let capturedUpdate = null;

  registerAdminRoutes({
    app,
    adminRouteLimiter: createNoopMiddleware(),
    requireAdmin: createNoopMiddleware(),
    Firma: {
      findByIdAndUpdate(id, update) {
        capturedUpdate = { id, update };
        return {
          lean: async () => ({ _id: id, ...update.$set })
        };
      }
    },
    sendMail: async () => {},
    normalizeEmail: (value) => value,
    runCleanup: async () => {},
    errorWithTime: () => {},
    normalizePhone: (value) => value,
    normalizeCountry: (value) => value,
    parseCategoriesFromBody: () => [],
    applyCategoryPlanLimit: (categories) => categories
  });

  const handlers = app.route("DELETE", "/admin/firms/:id");
  const res = await runRoute(handlers, { params: { id: "firm-1" } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(capturedUpdate.id, "firm-1");
  assert.equal(capturedUpdate.update.$set.payment_status, "expired");
  assert.equal(capturedUpdate.update.$set.plan, "free");
  assert.equal(capturedUpdate.update.$set.is_boosted, false);
  assert.equal(capturedUpdate.update.$set.boost_expires_at, null);
  assert.equal(capturedUpdate.update.$set.expires_at, null);
  assert.ok(capturedUpdate.update.$set.deleted_at instanceof Date);
});

test("admin restore clears stale paid and boost state", async () => {
  const app = createAppMock();
  let capturedUpdate = null;

  registerAdminRoutes({
    app,
    adminRouteLimiter: createNoopMiddleware(),
    requireAdmin: createNoopMiddleware(),
    Firma: {
      findByIdAndUpdate(id, update) {
        capturedUpdate = { id, update };
        return {
          lean: async () => ({ _id: id, ...update.$set })
        };
      }
    },
    sendMail: async () => {},
    normalizeEmail: (value) => value,
    runCleanup: async () => {},
    errorWithTime: () => {},
    normalizePhone: (value) => value,
    normalizeCountry: (value) => value,
    parseCategoriesFromBody: () => [],
    applyCategoryPlanLimit: (categories) => categories
  });

  const handlers = app.route("POST", "/admin/firms/:id/restore");
  const res = await runRoute(handlers, { params: { id: "firm-2" } });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(capturedUpdate.update.$set.deleted_at, null);
  assert.equal(capturedUpdate.update.$set.payment_status, "active");
  assert.equal(capturedUpdate.update.$set.plan, "free");
  assert.equal(capturedUpdate.update.$set.is_boosted, false);
  assert.equal(capturedUpdate.update.$set.boost_expires_at, null);
  assert.equal(capturedUpdate.update.$set.paid_at, null);
  assert.equal(capturedUpdate.update.$set.expires_at, null);
});

test("admin mark-paid enables premium and boost state", async () => {
  const app = createAppMock();
  let capturedUpdate = null;

  registerAdminRoutes({
    app,
    adminRouteLimiter: createNoopMiddleware(),
    requireAdmin: createNoopMiddleware(),
    Firma: {
      findByIdAndUpdate(id, update) {
        capturedUpdate = { id, update };
        return {
          lean: async () => ({ _id: id, ...update.$set })
        };
      }
    },
    sendMail: async () => {},
    normalizeEmail: (value) => value,
    runCleanup: async () => {},
    errorWithTime: () => {},
    normalizePhone: (value) => value,
    normalizeCountry: (value) => value,
    parseCategoriesFromBody: () => [],
    applyCategoryPlanLimit: (categories) => categories
  });

  const handlers = app.route("POST", "/admin/firms/:id/mark-paid");
  const res = await runRoute(handlers, { params: { id: "firm-3" }, body: { days: 45 } });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(capturedUpdate.update.$set.payment_status, "active");
  assert.equal(capturedUpdate.update.$set.plan, "premium");
  assert.equal(capturedUpdate.update.$set.is_boosted, true);
  assert.equal(capturedUpdate.update.$set.deleted_at, null);
  assert.ok(capturedUpdate.update.$set.paid_at instanceof Date);
  assert.ok(capturedUpdate.update.$set.boost_expires_at instanceof Date);
  assert.ok(capturedUpdate.update.$set.expires_at instanceof Date);
  assert.ok(capturedUpdate.update.$set.expires_at > capturedUpdate.update.$set.paid_at);
});

test("owner request-link is silent for missing firms", async () => {
  const app = createAppMock();
  let sentMail = false;
  let updatedRecord = false;

  registerOwnerRoutes({
    app,
    Firma: {
      findOne() {
        return {
          select() {
            return {
              lean: async () => null
            };
          }
        };
      },
      updateOne: async () => {
        updatedRecord = true;
      }
    },
    resend: {},
    sendMail: async () => {
      sentMail = true;
    },
    FRONTEND_BASE_URL: "https://easyfix.test",
    emailActionLimiter: createNoopMiddleware(),
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    isValidEmail: (value) => value.includes("@"),
    validateNameLike: () => true,
    validateAddressLike: () => true,
    normalizePhone: (value) => value,
    normalizeCountry: (value) => value,
    parseCategoriesFromBody: () => [],
    applyCategoryPlanLimit: (categories) => categories,
    makeToken: () => "token-123",
    sha256Hex: (value) => `hash:${value}`,
    sendError: (res, status, error) => res.status(status).json({ success: false, error }),
    errorWithTime: () => {},
    isRealFirmRecord: (firm) => Boolean(firm && !firm.deleted_at)
  });

  const handlers = app.route("POST", "/owner/request-link");
  const res = await runRoute(handlers, { body: { email: "missing@example.com" } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(sentMail, false);
  assert.equal(updatedRecord, false);
});

test("owner update applies category limits for free plans", async () => {
  const app = createAppMock();
  let capturedUpdate = null;

  registerOwnerRoutes({
    app,
    Firma: {
      findOne() {
        return {
          select() {
            return {
              lean: async () => ({
                _id: "firm-free-1",
                email: "owner@example.com",
                plan: "free",
                deleted_at: null
              })
            };
          }
        };
      },
      findByIdAndUpdate(id, update) {
        capturedUpdate = { id, update };
        return {
          select() {
            return {
              lean: async () => ({ _id: id, ...update.$set })
            };
          }
        };
      }
    },
    resend: {},
    sendMail: async () => {},
    FRONTEND_BASE_URL: "https://easyfix.test",
    emailActionLimiter: createNoopMiddleware(),
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    isValidEmail: (value) => value.includes("@"),
    validateNameLike: () => true,
    validateAddressLike: () => true,
    normalizePhone: (value) => value,
    normalizeCountry: (value) => value,
    parseCategoriesFromBody: ({ categories }) => categories,
    applyCategoryPlanLimit: (categories, plan) => (plan === "free" ? categories.slice(0, 2) : categories),
    makeToken: () => "token-123",
    sha256Hex: (value) => `hash:${value}`,
    getCookieValue: () => "hash:token-123",
    sendError: (res, status, error) => res.status(status).json({ success: false, error }),
    errorWithTime: () => {},
    isRealFirmRecord: (firm) => Boolean(firm && !firm.deleted_at)
  });

  const handlers = app.route("PUT", "/owner/update");
  const res = await runRoute(handlers, {
    body: {
      categories: ["plumber", "electrician", "painter"]
    }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(capturedUpdate.id, "firm-free-1");
  assert.deepEqual(capturedUpdate.update.$set.categories, ["plumber", "electrician"]);
  assert.equal(capturedUpdate.update.$set.category, "plumber");
});

test("owner me rejects invalid or expired links", async () => {
  const app = createAppMock();

  registerOwnerRoutes({
    app,
    Firma: {
      findOne() {
        return {
          select() {
            return {
              lean: async () => null
            };
          }
        };
      }
    },
    resend: {},
    sendMail: async () => {},
    FRONTEND_BASE_URL: "https://easyfix.test",
    emailActionLimiter: createNoopMiddleware(),
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    isValidEmail: (value) => value.includes("@"),
    validateNameLike: () => true,
    validateAddressLike: () => true,
    normalizePhone: (value) => value,
    normalizeCountry: (value) => value,
    parseCategoriesFromBody: ({ categories }) => categories || [],
    applyCategoryPlanLimit: (categories) => categories,
    makeToken: () => "token-123",
    sha256Hex: (value) => `hash:${value}`,
    getCookieValue: () => "hash:expired-token",
    sendError: (res, status, error) => res.status(status).json({ success: false, error }),
    errorWithTime: () => {},
    isRealFirmRecord: (firm) => Boolean(firm && !firm.deleted_at)
  });

  const handlers = app.route("GET", "/owner/me");
  const res = await runRoute(handlers, {});

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { success: false, error: "INVALID_OR_EXPIRED_LINK" });
});

test("pay-now request stays silent for missing firms", async () => {
  const app = createAppMock();
  let sentMail = false;
  let updatedFirm = false;

  registerPayNowRoutes({
    app,
    emailActionLimiter: createNoopMiddleware(),
    Firma: {
      findOne() {
        return {
          select() {
            return {
              lean: async () => null
            };
          }
        };
      },
      updateOne: async () => {
        updatedFirm = true;
      }
    },
    resend: {},
    sendMail: async () => {
      sentMail = true;
    },
    FRONTEND_BASE_URL: "https://easyfix.test",
    PAY_TOKEN_MINUTES: 30,
    makeToken: () => "pay-token-1",
    sha256Hex: (value) => `hash:${value}`,
    getCookieValue: () => "hash:pay-token-1",
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    isValidEmail: (value) => value.includes("@"),
    isRealFirmRecord: (firm) => Boolean(firm && !firm.deleted_at),
    planToVariant: () => null,
    createLemonCheckout: async () => "https://checkout.test",
    sendError: (res, status, error) => res.status(status).json({ success: false, error }),
    errorWithTime: () => {},
    isValidObjectId: () => true,
    isFirmVisibleStatus: () => true
  });

  const handlers = app.route("POST", "/pay-now/request");
  const res = await runRoute(handlers, { body: { email: "missing@example.com" } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: "If the email exists, we sent a link." });
  assert.equal(sentMail, false);
  assert.equal(updatedFirm, false);
});

test("pay-now checkout creates premium checkout for valid token", async () => {
  const app = createAppMock();
  let capturedCheckoutInput = null;

  registerPayNowRoutes({
    app,
    emailActionLimiter: createNoopMiddleware(),
    Firma: {
      findOne(query) {
        if (query.pay_token_hash) {
          return {
            select() {
              return {
                lean: async () => ({
                  _id: "firm-pay-1",
                  email: "owner@example.com",
                  deleted_at: null
                })
              };
            }
          };
        }

        return {
          select() {
            return {
              lean: async () => null
            };
          }
        };
      },
      updateOne: async () => {}
    },
    resend: {},
    sendMail: async () => {},
    FRONTEND_BASE_URL: "https://easyfix.test",
    PAY_TOKEN_MINUTES: 30,
    makeToken: () => "pay-token-1",
    sha256Hex: (value) => `hash:${value}`,
    getCookieValue: () => "hash:pay-token-1",
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    isValidEmail: (value) => value.includes("@"),
    isRealFirmRecord: (firm) => Boolean(firm && !firm.deleted_at),
    planToVariant: (plan) => (plan === "premium" ? "variant-premium-1" : null),
    createLemonCheckout: async (input) => {
      capturedCheckoutInput = input;
      return "https://checkout.test/premium";
    },
    sendError: (res, status, error) => res.status(status).json({ success: false, error }),
    errorWithTime: () => {},
    isValidObjectId: () => true,
    isFirmVisibleStatus: () => true
  });

  const handlers = app.route("GET", "/pay-now/checkout");
  const res = await runRoute(handlers, {
    query: {
      plan: "premium"
    }
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, checkoutUrl: "https://checkout.test/premium" });
  assert.deepEqual(capturedCheckoutInput, {
    variantId: "variant-premium-1",
    email: "owner@example.com",
    firmId: "firm-pay-1"
  });
});

test("check-status returns firm visibility for valid email lookup", async () => {
  const app = createAppMock();

  registerPayNowRoutes({
    app,
    emailActionLimiter: createNoopMiddleware(),
    Firma: {
      findOne(query) {
        assert.deepEqual(query, { email: "firm@example.com" });
        return {
          select() {
            return {
              lean: async () => ({
                _id: "firm-status-1",
                email: "firm@example.com",
                name: "Firm Status",
                country: "MK",
                plan: "free",
                payment_status: "active",
                deleted_at: null
              })
            };
          }
        };
      },
      updateOne: async () => {}
    },
    resend: {},
    sendMail: async () => {},
    FRONTEND_BASE_URL: "https://easyfix.test",
    PAY_TOKEN_MINUTES: 30,
    makeToken: () => "pay-token-1",
    sha256Hex: (value) => `hash:${value}`,
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    isValidEmail: (value) => value.includes("@"),
    isRealFirmRecord: (firm) => Boolean(firm && !firm.deleted_at),
    planToVariant: () => null,
    createLemonCheckout: async () => "https://checkout.test",
    sendError: (res, status, error) => res.status(status).json({ success: false, error }),
    errorWithTime: () => {},
    isValidObjectId: () => false,
    isFirmVisibleStatus: (status) => status === "active"
  });

  const handlers = app.route("GET", "/check-status");
  const res = await runRoute(handlers, {
    query: {
      email: "firm@example.com"
    }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.firma.email, "firm@example.com");
  assert.equal(res.body.firma.is_visible, true);
});

test("contact unlock spends one credit and returns firm contact", async () => {
  let remainingCredits = 1;
  let createdUnlock = null;

  const result = await unlockFirmContact({
    body: { userId: "user-1", firmId: "firm-1" },
    authUser: { _id: "user-1" },
    User: {
      findById: async (id) => {
        if (id === "user-1") return { _id: "user-1", credits: remainingCredits };
        return null;
      },
      findOneAndUpdate: async () => {
        remainingCredits -= 1;
        return { _id: "user-1", credits: remainingCredits };
      }
    },
    Firma: {
      findById() {
        return {
          lean: async () => ({
            _id: "firm-1",
            name: "Fix Co",
            payment_status: "active",
            phone: "+38970111222",
            email: "firm@example.com"
          })
        };
      }
    },
    ContactUnlock: {
      findOne() {
        return {
          lean: async () => null
        };
      },
      create: async (payload) => {
        createdUnlock = payload;
      }
    },
    isValidObjectId: () => true
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.alreadyUnlocked, false);
  assert.equal(result.body.credits, 0);
  assert.equal(result.body.contact.callLink, "tel:+38970111222");
  assert.equal(result.body.contact.mailLink, "mailto:firm@example.com");
  assert.deepEqual(createdUnlock, { user_id: "user-1", firm_id: "firm-1" });
});

test("contact unlock duplicate fallback returns already unlocked", async () => {
  const duplicateError = new Error("duplicate");
  duplicateError.code = 11000;

  const result = await unlockFirmContact({
    body: { userId: "user-2", firmId: "firm-2" },
    authUser: { _id: "user-2" },
    User: {
      findById() {
        return {
          _id: "user-2",
          credits: 3,
          lean: async () => ({ _id: "user-2", credits: 3 })
        };
      },
      findOneAndUpdate: async () => ({ _id: "user-2", credits: 2 })
    },
    Firma: {
      findById() {
        return {
          lean: async () => ({
            _id: "firm-2",
            name: "Fix Two",
            payment_status: "active",
            phone: "+38970222333",
            email: "two@example.com"
          })
        };
      }
    },
    ContactUnlock: {
      findOne() {
        return {
          lean: async () => null
        };
      },
      create: async () => {
        throw duplicateError;
      }
    },
    isValidObjectId: () => true
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.alreadyUnlocked, true);
  assert.equal(result.body.credits, 3);
  assert.equal(result.body.contact.smsLink, "sms:+38970222333");
});

test("payment webhook ignores duplicate receipts", async () => {
  const rawBody = Buffer.from(JSON.stringify({
    meta: { event_name: "order_created", custom_data: { userId: "user-9", creditPack: 5 } },
    data: { attributes: {} }
  }));
  const secret = "webhook-secret";
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  let updatedCredits = false;

  const result = await processPaymentWebhook({
    rawBody,
    signature,
    webhookSecret: secret,
    sha256Hex: (value) => crypto.createHash("sha256").update(String(value)).digest("hex"),
    WebhookReceipt: {
      create: async () => {
        const err = new Error("duplicate");
        err.code = 11000;
        throw err;
      }
    },
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    variantToCredits: () => 0,
    User: {
      findByIdAndUpdate: async () => {
        updatedCredits = true;
      }
    },
    Firma: {
      findByIdAndUpdate: async () => null,
      findOneAndUpdate: async () => null
    },
    log: () => {}
  });

  assert.equal(result.status, 200);
  assert.equal(result.text, "Duplicate ignored");
  assert.equal(updatedCredits, false);
});

test("payment webhook credits a user on order_created", async () => {
  const rawBody = Buffer.from(JSON.stringify({
    meta: { event_name: "order_created", custom_data: { userId: "user-10", creditPack: 7 } },
    data: { attributes: {} }
  }));
  const secret = "webhook-secret";
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  let creditUpdate = null;

  const result = await processPaymentWebhook({
    rawBody,
    signature,
    webhookSecret: secret,
    sha256Hex: (value) => crypto.createHash("sha256").update(String(value)).digest("hex"),
    WebhookReceipt: {
      create: async () => ({})
    },
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    variantToCredits: () => 0,
    User: {
      findByIdAndUpdate: async (id, update) => {
        creditUpdate = { id, update };
        return { _id: id, email: "user10@example.com", credits: 7 };
      }
    },
    Firma: {
      findByIdAndUpdate: async () => null,
      findOneAndUpdate: async () => null
    },
    log: () => {}
  });

  assert.equal(result.status, 200);
  assert.equal(result.text, "OK");
  assert.equal(creditUpdate.id, "user-10");
  assert.deepEqual(creditUpdate.update, { $inc: { credits: 7 } });
});

test("payment webhook upgrades a firm to premium on order_created", async () => {
  const rawBody = Buffer.from(JSON.stringify({
    meta: { event_name: "order_created", custom_data: { firmId: "firm-10" } },
    data: { attributes: {} }
  }));
  const secret = "webhook-secret";
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  let premiumUpdate = null;

  const result = await processPaymentWebhook({
    rawBody,
    signature,
    webhookSecret: secret,
    sha256Hex: (value) => crypto.createHash("sha256").update(String(value)).digest("hex"),
    WebhookReceipt: {
      create: async () => ({})
    },
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    variantToCredits: () => 0,
    User: {
      findByIdAndUpdate: async () => null
    },
    Firma: {
      findByIdAndUpdate: async (id, update) => {
        premiumUpdate = { id, update };
        return { _id: id, email: "firm10@example.com", plan: "premium" };
      },
      findOneAndUpdate: async () => null
    },
    log: () => {}
  });

  assert.equal(result.status, 200);
  assert.equal(result.text, "OK");
  assert.equal(premiumUpdate.id, "firm-10");
  assert.equal(premiumUpdate.update.$set.payment_status, "active");
  assert.equal(premiumUpdate.update.$set.plan, "premium");
  assert.equal(premiumUpdate.update.$set.is_boosted, true);
  assert.equal(premiumUpdate.update.$set.deleted_at, null);
  assert.ok(premiumUpdate.update.$set.paid_at instanceof Date);
  assert.ok(premiumUpdate.update.$set.boost_expires_at instanceof Date);
  assert.ok(premiumUpdate.update.$set.expires_at instanceof Date);
});

test("payment webhook downgrades a firm on refund", async () => {
  const rawBody = Buffer.from(JSON.stringify({
    meta: { event_name: "order_refunded", custom_data: { firmId: "firm-11" } },
    data: { attributes: {} }
  }));
  const secret = "webhook-secret";
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  let downgradeUpdate = null;

  const result = await processPaymentWebhook({
    rawBody,
    signature,
    webhookSecret: secret,
    sha256Hex: (value) => crypto.createHash("sha256").update(String(value)).digest("hex"),
    WebhookReceipt: {
      create: async () => ({})
    },
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    variantToCredits: () => 0,
    User: {
      findByIdAndUpdate: async () => null
    },
    Firma: {
      findByIdAndUpdate: async (id, update) => {
        downgradeUpdate = { id, update };
        return { _id: id, email: "firm11@example.com", plan: "free" };
      },
      findOneAndUpdate: async () => null
    },
    log: () => {}
  });

  assert.equal(result.status, 200);
  assert.equal(result.text, "OK");
  assert.equal(downgradeUpdate.id, "firm-11");
  assert.equal(downgradeUpdate.update.$set.payment_status, "active");
  assert.equal(downgradeUpdate.update.$set.plan, "free");
  assert.equal(downgradeUpdate.update.$set.is_boosted, false);
  assert.equal(downgradeUpdate.update.$set.boost_expires_at, null);
  assert.equal(downgradeUpdate.update.$set.expires_at, null);
});

test("maintenance cleanup removes stale stubs and downgrades expired premium boosts", async () => {
  let deleteManyQuery = null;
  let updateManyQuery = null;
  let updateManyUpdate = null;
  const logs = [];

  await runCleanup({
    Firma: {
      deleteMany: async (query) => {
        deleteManyQuery = query;
        return { deletedCount: 2 };
      },
      find: () => ({
        select: () => ({
          lean: async () => [{ _id: "firm-20", email: "firm20@example.com" }]
        })
      }),
      updateMany: async (query, update) => {
        updateManyQuery = query;
        updateManyUpdate = update;
        return { acknowledged: true };
      }
    },
    stubDeleteAfterHours: 24,
    log: (...args) => logs.push(args.join(" "))
  });

  assert.equal(deleteManyQuery.is_stub, true);
  assert.ok(deleteManyQuery.createdAt.$lte instanceof Date);
  assert.equal(updateManyQuery.plan, "premium");
  assert.equal(updateManyQuery.is_boosted, true);
  assert.ok(updateManyQuery.boost_expires_at.$lte instanceof Date);
  assert.equal(updateManyUpdate.$set.plan, "free");
  assert.equal(updateManyUpdate.$set.is_boosted, false);
  assert.equal(updateManyUpdate.$set.boost_expires_at, null);
  assert.equal(updateManyUpdate.$set.payment_status, "active");
  assert.ok(logs.some((line) => line.includes("Deleted OTP stubs: 2")));
  assert.ok(logs.some((line) => line.includes("Downgraded expired premium firms to free: 1")));
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`PASS ${tests.length} route checks`);
}
