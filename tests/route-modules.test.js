import assert from "node:assert/strict";
import crypto from "crypto";
import { readFile } from "node:fs/promises";

import { registerAdminRoutes } from "../lib/admin-routes.js";
import { createRequireUserSession, getSessionTokenFromRequest, requireRole } from "../lib/auth.js";
import { unlockFirmContact } from "../lib/contact-unlock.js";
import { runCleanup } from "../lib/maintenance.js";
import { registerOwnerRoutes } from "../lib/owner-routes.js";
import { registerPayNowRoutes } from "../lib/pay-now-routes.js";
import { processPaymentWebhook } from "../lib/payment-webhook.js";
import { createAgentaProductHelpers, handleAgentaOSWebhook, processAgentaOSWebhook, recoverExpiredAgentaOSReceipts, registerAgentaCheckoutRoutes } from "../lib/agentaos-payments.js";
import { AgentaOS } from "@agentaos/pay";

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

function createAgentaHarness({ failNextCredit = false, failNextFirmaWrite = false, failNextPaymentFulfillment = false, state = null } = {}) {
  const receipts = state?.receipts || new Map();
  const payments = state?.payments || new Map();
  const subscriptions = state?.subscriptions || new Map();
  const users = state?.users || new Map([["user-1", { _id: "user-1", credits: 0, agentaos_credit_transactions: [] }]]);
  const firms = state?.firms || new Map([["firm-1", { _id: "firm-1", owner_user_id: "user-1", plan: "free" }]]);
  const failures = { credit: failNextCredit, firma: failNextFirmaWrite, payment: failNextPaymentFulfillment };
  const duplicate = () => Object.assign(new Error("duplicate"), { code: 11000 });
  const EventReceipt = {
    create: async (row) => {
      if (receipts.has(row.event_key)) throw duplicate();
      receipts.set(row.event_key, { ...row });
    },
    findOne: (query) => ({ lean: async () => { const row = receipts.get(query.event_key); return row && (!query.claim_token || row.claim_token === query.claim_token) ? row : null; } }),
    findOneAndUpdate: async (query, update) => {
      const row = receipts.get(query.event_key);
      const canReclaim = row && query.$or.some((condition) => condition.status === row.status && (condition.status !== "processing" || row.lease_until <= condition.lease_until.$lte) && (condition.status !== "retry_wait" || row.next_retry_at <= condition.next_retry_at.$lte));
      if (!canReclaim) return null;
      Object.assign(row, update.$set);
      if (update.$inc) for (const [key, value] of Object.entries(update.$inc)) row[key] = Number(row[key] || 0) + value;
      return row;
    },
    updateOne: async (query, update) => {
      const row = receipts.get(query.event_key);
      if (row && row.claim_token === query.claim_token) {
        Object.assign(row, update.$set);
        for (const key of Object.keys(update.$unset || {})) delete row[key];
      }
      return { matchedCount: row ? 1 : 0 };
    },
    find: (query) => ({ limit: (limit) => ({ lean: async () => [...receipts.values()].filter((row) => row.event_payload && ((row.status === "failed") || (row.status === "processing" && row.lease_until <= new Date()) || (row.status === "retry_wait" && row.next_retry_at <= new Date()))).slice(0, limit) }) })
  };
  const AgentaPayment = {
    findOne: (query) => ({ lean: async () => payments.get(query.provider_transaction_id) || null }),
    updateOne: async (query, update) => {
      const key = query.provider_transaction_id;
      if (failures.payment && update.$set?.fulfillment_status === "fulfilled") { failures.payment = false; throw new Error("temporary payment write failure"); }
      if (!payments.has(key)) payments.set(key, { ...update.$setOnInsert });
      if (update.$set) Object.assign(payments.get(key), update.$set);
      return { matchedCount: 1 };
    }
  };
  const AgentaSubscription = {
    findOne: (query) => ({ lean: async () => subscriptions.get(query.provider_subscription_id) || null }),
    findOneAndUpdate: async (query, update) => {
      const row = subscriptions.get(query.provider_subscription_id);
      if (!row || !(row.lock_until == null || row.lock_until <= new Date())) return null;
      Object.assign(row, update.$set);
      if (update.$inc) for (const [key, value] of Object.entries(update.$inc)) row[key] = Number(row[key] || 0) + value;
      return row;
    },
    updateOne: async (query, update) => {
      const id = query.provider_subscription_id;
      const row = subscriptions.get(id) || { provider_subscription_id: id, event_ids: [], lock_fence: 0 };
      row.event_ids ||= [];
      if (query.lock_token && row.lock_token !== query.lock_token) return { matchedCount: 0 };
      if (query.$or) {
        const current = row.current_period_end ? new Date(row.current_period_end) : null;
        const eligible = query.$or.some((option) => {
          if (option.current_period_end?.$exists === false) return !Object.hasOwn(row, "current_period_end");
          if (option.current_period_end === null) return current === null;
          if (option.current_period_end?.$lt) return !current || current < option.current_period_end.$lt;
          if (option.current_period_end && option.provider_status?.$ne) return current?.getTime() === option.current_period_end.getTime() && row.provider_status !== option.provider_status.$ne;
          return false;
        });
        if (!eligible) return { matchedCount: 0 };
      }
      if (update.$set) Object.assign(row, update.$set);
      if (update.$unset) for (const key of Object.keys(update.$unset)) delete row[key];
      if (update.$setOnInsert) for (const [key, value] of Object.entries(update.$setOnInsert)) if (row[key] == null) row[key] = value;
      if (update.$addToSet?.event_ids && !row.event_ids.includes(update.$addToSet.event_ids)) row.event_ids.push(update.$addToSet.event_ids);
      subscriptions.set(id, row);
      return { matchedCount: 1, upsertedCount: 0 };
    }
  };
  const User = {
    updateOne: async (query, update) => {
      if (failures.credit) { failures.credit = false; throw new Error("temporary mongo failure"); }
      const user = users.get(query._id);
      if (!user) return { matchedCount: 0 };
      if (user.agentaos_credit_transactions.includes(query.agentaos_credit_transactions.$ne)) return { matchedCount: 0 };
      user.credits += update.$inc.credits;
      user.agentaos_credit_transactions.push(update.$addToSet.agentaos_credit_transactions);
      return { matchedCount: 1 };
    },
    findOne: (query) => ({ select: () => ({ lean: async () => {
      const user = users.get(query._id);
      return user && user.agentaos_credit_transactions.includes(query.agentaos_credit_transactions) ? user : null;
    } }) })
  };
  const Firma = {
    findOneAndUpdate: async (query, update) => {
      const firm = firms.get(query._id);
      if (!firm || !(firm.payment_lock_until == null || firm.payment_lock_until <= new Date())) return null;
      Object.assign(firm, update.$set);
      if (update.$inc) for (const [key, value] of Object.entries(update.$inc)) firm[key] = Number(firm[key] || 0) + value;
      return firm;
    },
    updateOne: async (query, update) => {
      const firm = firms.get(query._id);
      if (!firm) return { matchedCount: 0 };
      if (failures.firma && update.$set?.plan) { failures.firma = false; throw new Error("temporary Firma write failure"); }
      if (query.payment_lock_token && firm.payment_lock_token !== query.payment_lock_token) return { matchedCount: 0 };
      if (update.$set) Object.assign(firm, update.$set);
      if (update.$unset) for (const key of Object.keys(update.$unset)) delete firm[key];
      return { matchedCount: 1 };
    }
  };
  return { EventReceipt, AgentaPayment, AgentaSubscription, User, Firma, receipts, payments, subscriptions, users, firms, state: { receipts, payments, subscriptions, users, firms } };
}

const AGENTA_PRODUCTS = createAgentaProductHelpers({
  premium: "premium-link", credits1: "credits-1", credits5: "credits-5", credits10: "credits-10"
});

async function sendAgentaEvent(harness, { id = crypto.randomUUID(), type = "checkout.session.completed", data, loadLatestSubscription }) {
  return processAgentaOSWebhook({
    event: { id, type, business: "test-business", data: { livemode: false, ...data } },
    ...harness,
    products: AGENTA_PRODUCTS,
    expectedLivemode: false,
    ...(loadLatestSubscription ? { loadLatestSubscription } : {})
  });
}

for (const [pack, productId] of [[1, "credits-1"], [5, "credits-5"], [10, "credits-10"]]) {
  test(`AgentaOS grants exactly ${pack} credit${pack === 1 ? "" : "s"} from mapped product`, async () => {
    const harness = createAgentaHarness();
    const result = await sendAgentaEvent(harness, {
      data: { sessionId: `session-${pack}`, amount: "4.00", currency: "EUR", customerId: "customer-1", metadata: { productId, userId: "user-1", creditPack: "999" } }
    });
    assert.equal(result.status, 200);
    assert.equal(harness.users.get("user-1").credits, pack);
    assert.equal(harness.payments.get(`session-${pack}`).credit_amount, pack);
    assert.equal(harness.payments.get(`session-${pack}`).provider_customer_id, "customer-1");
  });
}

test("AgentaOS duplicate event and same transaction under another event id grant once", async () => {
  const harness = createAgentaHarness();
  const data = { sessionId: "session-once", amount: "4.00", currency: "EUR", metadata: { productId: "credits-5", userId: "user-1" } };
  await sendAgentaEvent(harness, { id: "event-a", data });
  const duplicateResult = await sendAgentaEvent(harness, { id: "event-a", data });
  await sendAgentaEvent(harness, { id: "event-b", data: { ...data, amount: "4.01" } });
  assert.equal(duplicateResult.text, "Duplicate ignored");
  assert.equal(harness.users.get("user-1").credits, 5);
});

test("AgentaOS failed database fulfillment can be retried", async () => {
  const harness = createAgentaHarness({ failNextCredit: true });
  const event = { id: "retry-event", data: { sessionId: "retry-session", amount: "2.00", currency: "EUR", metadata: { productId: "credits-1", userId: "user-1" } } };
  await assert.rejects(() => sendAgentaEvent(harness, event), /temporary mongo failure/);
  assert.equal(harness.receipts.get("checkout.session.completed:retry-session").status, "retry_wait");
  harness.receipts.get("checkout.session.completed:retry-session").next_retry_at = new Date(Date.now() - 1_000);
  await sendAgentaEvent(harness, event);
  assert.equal(harness.users.get("user-1").credits, 1);
  assert.equal(harness.receipts.get("checkout.session.completed:retry-session").status, "processed");
});

test("AgentaOS concurrent duplicate webhook requests do not double grant", async () => {
  const harness = createAgentaHarness();
  const event = { id: "concurrent-event", data: { sessionId: "concurrent-session", amount: "2.00", currency: "EUR", metadata: { productId: "credits-10", userId: "user-1" } } };
  const results = await Promise.all([sendAgentaEvent(harness, event), sendAgentaEvent(harness, event)]);
  assert.equal(harness.users.get("user-1").credits, 10);
  assert.ok(results.some((result) => result.status === 200));
});

test("AgentaOS invalid signature, missing secret and test/live mismatch are rejected", async () => {
  const client = new AgentaOS("sk_test_sdk-test-key");
  const harness = createAgentaHarness();
  const body = Buffer.from(JSON.stringify({ id: "event", type: "webhook.test", business: "x", data: { livemode: false, message: "test" } }));
  assert.equal((await handleAgentaOSWebhook({ rawBody: body, signature: "", secret: "", client, ...harness, products: AGENTA_PRODUCTS, expectedLivemode: false })).status, 503);
  assert.equal((await handleAgentaOSWebhook({ rawBody: body, signature: "t=1,v1=bad", secret: "secret", client, ...harness, products: AGENTA_PRODUCTS, expectedLivemode: false })).status, 400);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `t=${timestamp},v1=${crypto.createHmac("sha256", "secret").update(`${timestamp}.${body}`).digest("hex")}`;
  const mismatch = await handleAgentaOSWebhook({ rawBody: body, signature, secret: "secret", client, ...harness, products: AGENTA_PRODUCTS, expectedLivemode: true });
  assert.equal(mismatch.status, 400);
});

test("AgentaOS premium activates from provider period and renewal updates provider period", async () => {
  const harness = createAgentaHarness();
  const checkout = await sendAgentaEvent(harness, { id: "premium-checkout", data: { sessionId: "premium-session", amount: "20.00", currency: "EUR", customerId: "customer-pro", metadata: { productId: "premium-link", productKind: "premium", firmId: "firm-1", userId: "user-1", subscriptionId: "subscription-1" } } });
  assert.equal(checkout.status, 200);
  await sendAgentaEvent(harness, { id: "premium-create", type: "subscription.created", data: { id: "subscription-1", status: "active", linkId: "premium-link", currency: "EUR", amountMinor: 2000, currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(), cancelAtPeriodEnd: false } });
  assert.equal(harness.firms.get("firm-1").plan, "premium");
  assert.equal(harness.firms.get("firm-1").agentaos_subscription_id, "subscription-1");
  const renewalEnd = new Date(Date.now() + 31 * 86_400_000).toISOString();
  await sendAgentaEvent(harness, { id: "premium-renew", type: "subscription.renewed", data: { id: "subscription-1", status: "active", linkId: "premium-link", currency: "EUR", amountMinor: 2000, currentPeriodEnd: renewalEnd, cancelAtPeriodEnd: true } });
  assert.equal(harness.firms.get("firm-1").agentaos_current_period_end.toISOString(), renewalEnd);
  assert.equal(harness.firms.get("firm-1").agentaos_cancel_at_period_end, true);
});

test("AgentaOS subscription.created can arrive before checkout metadata and still links the Firma", async () => {
  const harness = createAgentaHarness();
  await sendAgentaEvent(harness, { id: "sub-first", type: "subscription.created", data: { id: "sub-order-first", status: "active", linkId: "premium-link", currency: "EUR", amountMinor: 2000, currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(), cancelAtPeriodEnd: false } });
  await sendAgentaEvent(harness, { id: "checkout-second", data: { sessionId: "checkout-order-second", amount: "20.00", currency: "EUR", customerId: "customer-1", metadata: { productId: "premium-link", firmId: "firm-1", userId: "user-1", subscriptionId: "sub-order-first" } } });
  assert.equal(harness.firms.get("firm-1").plan, "premium");
  assert.equal(harness.subscriptions.get("sub-order-first").firm_id, "firm-1");
});

test("AgentaOS scheduled cancellation keeps paid access until end; canceled subscription expires access", async () => {
  const harness = createAgentaHarness();
  harness.subscriptions.set("sub-cancel", { provider_subscription_id: "sub-cancel", firm_id: "firm-1", product_id: "premium-link", provider_status: "active", current_period_end: new Date(Date.now() + 86_400_000), cancel_at_period_end: true });
  await sendAgentaEvent(harness, { id: "scheduled-cancel", type: "subscription.updated", data: { id: "sub-cancel", status: "active", linkId: "premium-link", currency: "EUR", amountMinor: 2000, currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(), cancelAtPeriodEnd: true } });
  assert.equal(harness.firms.get("firm-1").plan, "premium");
  assert.equal(harness.subscriptions.get("sub-cancel").cancel_at_period_end, true);
});

test("AgentaOS cancellation removes Premium only after provider period has ended", async () => {
  const harness = createAgentaHarness();
  const ended = new Date(Date.now() - 1000);
  harness.subscriptions.set("sub-ended", { provider_subscription_id: "sub-ended", firm_id: "firm-1", user_id: "user-1", product_id: "premium-link", provider_status: "active", current_period_end: ended, lock_fence: 0 });
  harness.firms.get("firm-1").plan = "premium";
  await sendAgentaEvent(harness, { id: "actual-cancel", type: "subscription.canceled", data: { id: "sub-ended", status: "canceled", linkId: "premium-link", currency: "EUR", amountMinor: 2000, currentPeriodEnd: ended.toISOString(), cancelAtPeriodEnd: false } });
  assert.equal(harness.firms.get("firm-1").plan, "free");
});

test("AgentaOS failed renewal preserves access only through authoritative paid period", async () => {
  const harness = createAgentaHarness();
  await sendAgentaEvent(harness, { id: "checkout", data: { sessionId: "premium-session", amount: "20.00", currency: "EUR", metadata: { productId: "premium-link", firmId: "firm-1", subscriptionId: "sub-failed" } } });
  await sendAgentaEvent(harness, { id: "failed-payment", type: "subscription.payment_failed", data: { id: "sub-failed", status: "past_due", linkId: "premium-link", currency: "EUR", amountMinor: 2000, currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(), cancelAtPeriodEnd: false } });
  assert.equal(harness.firms.get("firm-1").plan, "premium");
  assert.equal(harness.firms.get("firm-1").agentaos_subscription_status, "past_due");
});

test("AgentaOS older subscription event does not regress a newer paid period", async () => {
  const harness = createAgentaHarness();
  await sendAgentaEvent(harness, { id: "created-new", type: "subscription.renewed", data: { id: "sub-order", status: "active", linkId: "premium-link", currency: "EUR", amountMinor: 2000, currentPeriodEnd: "2026-12-31T00:00:00.000Z", cancelAtPeriodEnd: false } });
  await sendAgentaEvent(harness, { id: "created-old", type: "subscription.created", data: { id: "sub-order", status: "active", linkId: "premium-link", currency: "EUR", amountMinor: 2000, currentPeriodEnd: "2026-11-30T00:00:00.000Z", cancelAtPeriodEnd: false } });
  assert.equal(harness.subscriptions.get("sub-order").current_period_end.toISOString(), "2026-12-31T00:00:00.000Z");
});

test("AgentaOS renewal checkout metadata never grants credits and renewal updates Premium", async () => {
  const harness = createAgentaHarness();
  const firstEnd = new Date(Date.now() + 86_400_000);
  harness.subscriptions.set("sub-renew", { provider_subscription_id: "sub-renew", firm_id: "firm-1", user_id: "user-1", product_id: "premium-link", link_id: "premium-link", provider_status: "active", current_period_end: firstEnd, lock_fence: 0 });
  harness.firms.get("firm-1").plan = "premium";
  await sendAgentaEvent(harness, { id: "renewal-checkout", data: { sessionId: "renewal-session", amount: "20.00", currency: "EUR", metadata: { subscriptionId: "sub-renew", subscriptionCycle: true } } });
  assert.equal(harness.users.get("user-1").credits, 0);
  assert.equal(harness.payments.get("renewal-session").product_kind, "premium");
  const renewedEnd = new Date(Date.now() + 32 * 86_400_000);
  await sendAgentaEvent(harness, { id: "renewal-event", type: "subscription.renewed", data: { id: "sub-renew", status: "active", linkId: "premium-link", currency: "EUR", amountMinor: 2000, currentPeriodEnd: renewedEnd.toISOString(), cancelAtPeriodEnd: false } });
  assert.equal(harness.firms.get("firm-1").agentaos_current_period_end.toISOString(), renewedEnd.toISOString());
});

test("AgentaOS subscription.updated applies distinct latest states in the same period", async () => {
  const harness = createAgentaHarness();
  const end = new Date(Date.now() + 86_400_000).toISOString();
  harness.subscriptions.set("sub-update", { provider_subscription_id: "sub-update", firm_id: "firm-1", user_id: "user-1", product_id: "premium-link", provider_status: "active", current_period_end: new Date(end), lock_fence: 0 });
  const base = { id: "sub-update", status: "active", linkId: "premium-link", currency: "EUR", amountMinor: 2000, currentPeriodEnd: end };
  await sendAgentaEvent(harness, { id: "cancel-scheduled", type: "subscription.updated", data: { ...base, cancelAtPeriodEnd: true } });
  await sendAgentaEvent(harness, { id: "cancel-resumed", type: "subscription.updated", data: { ...base, cancelAtPeriodEnd: false } });
  assert.equal(harness.subscriptions.get("sub-update").cancel_at_period_end, false);
  assert.equal(harness.firms.get("firm-1").plan, "premium");
});

test("AgentaOS concurrent lifecycle events are fenced and cannot regress newer state", async () => {
  const harness = createAgentaHarness();
  const newest = "2026-12-31T00:00:00.000Z";
  harness.subscriptions.set("sub-concurrent", { provider_subscription_id: "sub-concurrent", firm_id: "firm-1", user_id: "user-1", product_id: "premium-link", provider_status: "active", current_period_end: new Date("2026-11-30T00:00:00.000Z"), lock_fence: 0 });
  harness.firms.get("firm-1").plan = "premium";
  const oldEvent =
    { id: "old-event", type: "subscription.created", data: { id: "sub-concurrent", status: "active", linkId: "premium-link", currentPeriodEnd: "2026-11-30T00:00:00.000Z", cancelAtPeriodEnd: false } };
  const newEvent = { id: "new-event", type: "subscription.renewed", data: { id: "sub-concurrent", status: "active", linkId: "premium-link", currentPeriodEnd: newest, cancelAtPeriodEnd: false } };
  await sendAgentaEvent(harness, newEvent);
  await sendAgentaEvent(harness, oldEvent);
  await recoverExpiredAgentaOSReceipts({ EventReceipt: harness.EventReceipt, processing: { ...harness, products: AGENTA_PRODUCTS, expectedLivemode: false } });
  assert.equal(harness.subscriptions.get("sub-concurrent").current_period_end.toISOString(), newest);
  assert.equal(harness.firms.get("firm-1").agentaos_current_period_end.toISOString(), newest);
});

test("AgentaOS canceled event cannot overwrite a newer paid subscription period", async () => {
  const harness = createAgentaHarness();
  const newest = new Date(Date.now() + 40 * 86_400_000);
  harness.subscriptions.set("sub-cancel-race", { provider_subscription_id: "sub-cancel-race", firm_id: "firm-1", user_id: "user-1", product_id: "premium-link", provider_status: "active", current_period_end: newest, lock_fence: 0 });
  harness.firms.get("firm-1").plan = "premium";
  await sendAgentaEvent(harness, { id: "stale-cancel", type: "subscription.canceled", data: { id: "sub-cancel-race", status: "canceled", linkId: "premium-link", currentPeriodEnd: new Date(Date.now() - 1_000).toISOString(), cancelAtPeriodEnd: false } });
  assert.equal(harness.subscriptions.get("sub-cancel-race").provider_status, "active");
  assert.equal(harness.firms.get("firm-1").plan, "premium");
});

test("AgentaOS non-Premium subscription products cannot activate Premium", async () => {
  const harness = createAgentaHarness();
  await assert.rejects(() => sendAgentaEvent(harness, { id: "wrong-product", type: "subscription.created", data: { id: "sub-wrong", status: "active", linkId: "credits-10", currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(), cancelAtPeriodEnd: false } }), /does not match the Premium product/);
  assert.equal(harness.firms.get("firm-1").plan, "free");
});

test("AgentaOS changed product on an existing Premium subscription is rejected", async () => {
  const harness = createAgentaHarness();
  harness.subscriptions.set("sub-product-change", { provider_subscription_id: "sub-product-change", firm_id: "firm-1", user_id: "user-1", product_id: "premium-link", provider_status: "active", current_period_end: new Date(Date.now() + 86_400_000), lock_fence: 0 });
  await assert.rejects(() => sendAgentaEvent(harness, { id: "changed-product", type: "subscription.updated", data: { id: "sub-product-change", status: "active", linkId: "credits-1", currentPeriodEnd: new Date(Date.now() + 40 * 86_400_000).toISOString(), cancelAtPeriodEnd: false } }), /does not match the Premium product/);
  assert.equal(harness.firms.get("firm-1").plan, "free");
});

test("AgentaOS reconciliation validates the actual SDK subscription response", async () => {
  const harness = createAgentaHarness();
  const end = new Date(Date.now() + 86_400_000).toISOString();
  await sendAgentaEvent(harness, { id: "reconcile", type: "subscription.renewed", data: { id: "sub-api", status: "active", linkId: "premium-link", currentPeriodEnd: end, cancelAtPeriodEnd: false }, loadLatestSubscription: async () => ({ id: "sub-api", status: "active", linkId: "premium-link", currency: "EUR", unitAmountMinor: 2000, currentPeriodEnd: end, cancelAtPeriodEnd: false }) });
  assert.equal(harness.subscriptions.get("sub-api").amount_minor, 2000);
});

test("AgentaOS reconciliation errors leave existing Premium state untouched", async () => {
  const harness = createAgentaHarness();
  const end = new Date(Date.now() + 86_400_000);
  harness.subscriptions.set("sub-api-error", { provider_subscription_id: "sub-api-error", firm_id: "firm-1", user_id: "user-1", product_id: "premium-link", provider_status: "active", current_period_end: end, lock_fence: 0 });
  harness.firms.get("firm-1").plan = "premium";
  await assert.rejects(() => sendAgentaEvent(harness, { id: "api-error", type: "subscription.canceled", data: { id: "sub-api-error", status: "canceled", linkId: "premium-link", currentPeriodEnd: new Date(Date.now() - 1_000).toISOString(), cancelAtPeriodEnd: false }, loadLatestSubscription: async () => { throw new Error("API unavailable"); } }), /API unavailable/);
  assert.equal(harness.subscriptions.get("sub-api-error").provider_status, "active");
  assert.equal(harness.firms.get("firm-1").plan, "premium");
});

test("AgentaOS expired webhook lease is reclaimed after a worker crash", async () => {
  const harness = createAgentaHarness();
  const event = { id: "crashed-worker", type: "checkout.session.completed", data: { livemode: false, sessionId: "crashed-session", amount: "3.00", currency: "EUR", metadata: { productId: "credits-1", userId: "user-1" } } };
  harness.receipts.set("checkout.session.completed:crashed-session", { event_key: "checkout.session.completed:crashed-session", event_id: event.id, event_type: event.type, event_payload: event, status: "processing", claim_token: "dead-worker", lease_until: new Date(Date.now() - 1_000) });
  const recovered = await recoverExpiredAgentaOSReceipts({ EventReceipt: harness.EventReceipt, processing: { ...harness, products: AGENTA_PRODUCTS, expectedLivemode: false } });
  assert.equal(recovered, 1);
  assert.equal(harness.users.get("user-1").credits, 1);
});

test("AgentaOS active duplicate receipt is retried and cannot strand fulfillment", async () => {
  const harness = createAgentaHarness();
  const event = { id: "active-duplicate", type: "checkout.session.completed", data: { sessionId: "active-session", amount: "3.00", currency: "EUR", metadata: { productId: "credits-5", userId: "user-1" } } };
  harness.receipts.set("checkout.session.completed:active-session", { event_key: "checkout.session.completed:active-session", event_id: event.id, event_type: event.type, event_payload: { ...event, data: { livemode: false, ...event.data } }, status: "processing", claim_token: "original-worker", lease_until: new Date(Date.now() + 10_000) });
  const busy = await sendAgentaEvent(harness, event);
  assert.equal(busy.status, 503);
  harness.receipts.get("checkout.session.completed:active-session").lease_until = new Date(Date.now() - 1_000);
  await recoverExpiredAgentaOSReceipts({ EventReceipt: harness.EventReceipt, processing: { ...harness, products: AGENTA_PRODUCTS, expectedLivemode: false } });
  assert.equal(harness.users.get("user-1").credits, 5);
});

test("AgentaOS Premium checkout keeps the original Pro dashboard return workflow", async () => {
  const source = await readFile(new URL("../lib/agentaos-payments.js", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../pro-dashboard.html", import.meta.url), "utf8");
  assert.match(source, /successUrl: `\$\{FRONTEND_BASE_URL\}\/pro-dashboard\.html\?premium=success`/);
  const returnStart = dashboard.indexOf("function handlePremiumReturn()");
  const returnHandler = dashboard.slice(returnStart, returnStart + 600);
  assert.match(returnHandler, /showStatus\(tr\("premium_payment_success"\), "success"\)/);
  assert.doesNotMatch(returnHandler, /plan\s*=|agentaos|fetch\(/i);
});

test("AgentaOS subscription write failure in Firma projection is reconciled from retained receipt after restart", async () => {
  const firstProcess = createAgentaHarness({ failNextFirmaWrite: true });
  const event = { id: "partial-premium", type: "subscription.created", data: { id: "sub-partial", status: "active", linkId: "premium-link", currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(), cancelAtPeriodEnd: false } };
  firstProcess.subscriptions.set("sub-partial", { provider_subscription_id: "sub-partial", firm_id: "firm-1", user_id: "user-1", product_id: "premium-link", provider_status: "pending", lock_fence: 0 });
  await assert.rejects(() => sendAgentaEvent(firstProcess, event), /temporary Firma write failure/);
  const receipt = firstProcess.receipts.get("subscription.created:sub-partial:" + event.data.currentPeriodEnd);
  assert.equal(receipt.status, "retry_wait");
  assert.ok(receipt.event_payload);
  assert.equal(firstProcess.subscriptions.get("sub-partial").provider_status, "active");
  assert.equal(firstProcess.firms.get("firm-1").plan, "free");

  // New harness instance simulates a server restart while durable Mongo-like
  // collections remain present.
  const afterRestart = createAgentaHarness({ state: firstProcess.state });
  receipt.next_retry_at = new Date(Date.now() - 1_000);
  const recovered = await recoverExpiredAgentaOSReceipts({ EventReceipt: afterRestart.EventReceipt, processing: { ...afterRestart, products: AGENTA_PRODUCTS, expectedLivemode: false } });
  assert.equal(recovered, 1);
  assert.equal(afterRestart.firms.get("firm-1").plan, "premium");
  assert.equal(afterRestart.subscriptions.get("sub-partial").provider_status, "active");
  assert.equal(receipt.status, "processed");
});

test("AgentaOS recovery receipt claim prevents two recovery workers processing the same job", async () => {
  const harness = createAgentaHarness();
  const event = { id: "multi-worker", type: "checkout.session.completed", data: { livemode: false, sessionId: "multi-worker-session", amount: "3.00", currency: "EUR", metadata: { productId: "credits-5", userId: "user-1" } } };
  harness.receipts.set("checkout.session.completed:multi-worker-session", { event_key: "checkout.session.completed:multi-worker-session", event_id: event.id, event_type: event.type, event_payload: event, status: "processing", claim_token: "crashed", lease_until: new Date(Date.now() - 1_000), attempt_count: 1 });
  const processing = { ...harness, products: AGENTA_PRODUCTS, expectedLivemode: false };
  const results = await Promise.all([
    recoverExpiredAgentaOSReceipts({ EventReceipt: harness.EventReceipt, processing }),
    recoverExpiredAgentaOSReceipts({ EventReceipt: harness.EventReceipt, processing })
  ]);
  assert.equal(results.reduce((sum, count) => sum + count, 0), 1);
  assert.equal(harness.users.get("user-1").credits, 5);
});

test("AgentaOS retries after a later write failure do not grant a credit twice", async () => {
  const harness = createAgentaHarness({ failNextPaymentFulfillment: true });
  const event = { id: "credit-partial", data: { sessionId: "credit-partial-session", amount: "3.00", currency: "EUR", metadata: { productId: "credits-1", userId: "user-1" } } };
  await assert.rejects(() => sendAgentaEvent(harness, event), /temporary payment write failure/);
  assert.equal(harness.users.get("user-1").credits, 1);
  const receipt = harness.receipts.get("checkout.session.completed:credit-partial-session");
  receipt.next_retry_at = new Date(Date.now() - 1_000);
  await recoverExpiredAgentaOSReceipts({ EventReceipt: harness.EventReceipt, processing: { ...harness, products: AGENTA_PRODUCTS, expectedLivemode: false } });
  assert.equal(harness.users.get("user-1").credits, 1);
  assert.equal(harness.payments.get("credit-partial-session").fulfillment_status, "fulfilled");
});

test("AgentaOS permanently invalid receipt is quarantined and remains inspectable", async () => {
  const harness = createAgentaHarness();
  const event = { id: "invalid-limited", type: "subscription.created", data: { id: "sub-invalid-limited", status: "active", linkId: "credits-1", currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString() } };
  await assert.rejects(() => sendAgentaEvent(harness, event), /does not match the Premium product/);
  const receipt = [...harness.receipts.values()][0];
  assert.equal(receipt.status, "permanent_failed");
  assert.equal(receipt.failure_kind, "invalid_event");
  assert.ok(receipt.event_payload);
  assert.equal(await recoverExpiredAgentaOSReceipts({ EventReceipt: harness.EventReceipt, processing: { ...harness, products: AGENTA_PRODUCTS, expectedLivemode: false } }), 0);
});

test("AgentaOS transient failures stop retrying at the configured attempt limit", async () => {
  const harness = createAgentaHarness();
  const event = { id: "transient-limit", type: "subscription.created", data: { id: "sub-transient-limit", status: "active", linkId: "premium-link", currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString() } };
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await assert.rejects(() => sendAgentaEvent(harness, { ...event, loadLatestSubscription: async () => { throw new Error("temporary provider unavailable"); } }), /temporary provider unavailable/);
    const receipt = [...harness.receipts.values()][0];
    assert.equal(receipt.attempt_count, attempt);
    if (attempt < 8) receipt.next_retry_at = new Date(Date.now() - 1_000);
  }
  const receipt = [...harness.receipts.values()][0];
  assert.equal(receipt.status, "permanent_failed");
  assert.equal(receipt.failure_kind, "attempt_limit");
  assert.ok(receipt.event_payload);
});

test("AgentaOS scheduled cancellation retains Premium through paid expiry and final cancellation expires it", async () => {
  const harness = createAgentaHarness();
  const end = new Date(Date.now() + 86_400_000).toISOString();
  harness.subscriptions.set("sub-cancel-compat", { provider_subscription_id: "sub-cancel-compat", firm_id: "firm-1", user_id: "user-1", product_id: "premium-link", provider_status: "active", current_period_end: new Date(end), lock_fence: 0 });
  await sendAgentaEvent(harness, { id: "scheduled-compat", type: "subscription.updated", data: { id: "sub-cancel-compat", status: "active", linkId: "premium-link", currentPeriodEnd: end, cancelAtPeriodEnd: true } });
  assert.equal(harness.firms.get("firm-1").plan, "premium");
  assert.equal(harness.firms.get("firm-1").expires_at.toISOString(), end);
  await sendAgentaEvent(harness, { id: "final-compat", type: "subscription.canceled", data: { id: "sub-cancel-compat", status: "canceled", linkId: "premium-link", currentPeriodEnd: end, cancelAtPeriodEnd: false } });
  assert.equal(harness.firms.get("firm-1").plan, "free");
});

test("AgentaOS dispute on credit transaction does not downgrade Premium or reverse spent credits", async () => {
  const harness = createAgentaHarness();
  await sendAgentaEvent(harness, { id: "credit-sale", data: { sessionId: "sale-1", amount: "3.00", currency: "EUR", metadata: { productId: "credits-1", userId: "user-1" } } });
  harness.firms.get("firm-1").plan = "premium";
  await sendAgentaEvent(harness, { id: "dispute-1", type: "dispute.created", data: { transactionId: "sale-1", disputeId: "dispute-1", status: "open" } });
  assert.equal(harness.users.get("user-1").credits, 1);
  assert.equal(harness.payments.get("sale-1").status, "disputed");
  assert.equal(harness.firms.get("firm-1").plan, "premium");
});

test("AgentaOS Premium dispute is flagged without prematurely changing subscription access", async () => {
  const harness = createAgentaHarness();
  harness.payments.set("premium-sale", { provider_transaction_id: "premium-sale", status: "paid", product_kind: "premium" });
  harness.firms.get("firm-1").plan = "premium";
  await sendAgentaEvent(harness, { id: "premium-dispute", type: "dispute.created", data: { transactionId: "premium-sale", disputeId: "dispute-2", status: "open" } });
  assert.equal(harness.payments.get("premium-sale").status, "disputed");
  assert.equal(harness.firms.get("firm-1").plan, "premium");
});

test("AgentaOS checkout routes enforce roles and ownership and use server product ids", async () => {
  const app = createAppMock();
  let created = null;
  let checkoutCalls = 0;
  const attempts = new Map();
  const CheckoutAttempt = {
    findOne: (query) => ({ lean: async () => attempts.get(query.scope) || null }),
    create: async (row) => { attempts.set(row.scope, { ...row }); return attempts.get(row.scope); },
    findOneAndUpdate: async (query, update) => {
      const row = attempts.get(query.scope);
      if (!row || !(row.status === "completed" || row.expires_at <= new Date())) return null;
      Object.assign(row, update.$set);
      for (const key of Object.keys(update.$unset || {})) delete row[key];
      return row;
    },
    updateOne: async (query, update) => {
      const row = [...attempts.values()].find((item) => item.session_id === query.session_id);
      if (row) Object.assign(row, update.$set);
      return { matchedCount: row ? 1 : 0 };
    }
  };
  const Firma = { findById: () => ({ select: () => ({ lean: async () => ({ _id: "firm-1", owner_user_id: "user-1", email: "pro@example.com" }) }) }) };
  const sendError = (res, status, code) => res.status(status).json({ success: false, error_code: code });
  const middleware = (_req, _res, next) => next();
  registerAgentaCheckoutRoutes({
    app, AgentaOS: { checkouts: { create: async (params, options) => { checkoutCalls += 1; created = { params, options }; return { checkoutUrl: `https://app.agentaos.ai/pay/session-${checkoutCalls}`, sessionId: `session-${checkoutCalls}` }; } } },
    products: AGENTA_PRODUCTS, User: {}, Firma, requireUserSession: middleware, requireRole: () => middleware, sendError,
    FRONTEND_BASE_URL: "https://easyfix.test", FRONTEND_SUCCESS_URL: "https://easyfix.test/success.html", errorWithTime: () => {}, getPayNowFirm: async () => ({ _id: "firm-1", email: "pro@example.com" }), CheckoutAttempt
  });
  const creditHandlers = app.route("POST", "/agentaos/credits/buy");
  const creditResponse = await runRoute(creditHandlers, { authUser: { _id: "user-1", email: "client@example.com", role: "client", credits: 2 }, body: { pack: 1, productId: "evil", creditAmount: 999 } });
  assert.equal(creditResponse.body.checkoutUrl, "https://app.agentaos.ai/pay/session-1");
  assert.equal(created.params.linkId, "credits-1");
  assert.equal(created.params.metadata.productId, "credits-1");
  assert.ok(created.options.idempotencyKey);
  const repeatedCreditResponse = await runRoute(creditHandlers, { authUser: { _id: "user-1", email: "client@example.com", role: "client", credits: 2 }, body: { pack: 1 } });
  assert.equal(repeatedCreditResponse.body.checkoutUrl, "https://app.agentaos.ai/pay/session-1");
  assert.equal(checkoutCalls, 1);
  attempts.values().next().value.status = "completed";
  await runRoute(creditHandlers, { authUser: { _id: "user-1", email: "client@example.com", role: "client", credits: 2 }, body: { pack: 1 } });
  assert.equal(checkoutCalls, 2);
  const roleGuard = (role) => (req, res, next) => req.authUser?.role === role ? next() : sendError(res, 403, "FORBIDDEN");
  const unauthorizedApp = createAppMock();
  registerAgentaCheckoutRoutes({ app: unauthorizedApp, AgentaOS: {}, products: AGENTA_PRODUCTS, User: {}, Firma, requireUserSession: middleware, requireRole: roleGuard, sendError, FRONTEND_BASE_URL: "https://easyfix.test", FRONTEND_SUCCESS_URL: "https://easyfix.test/success.html", errorWithTime: () => {}, getPayNowFirm: async () => null });
  const unauthorized = await runRoute(unauthorizedApp.route("POST", "/agentaos/credits/buy"), { authUser: { _id: "user-1", role: "pro" }, body: { pack: 1 } });
  assert.equal(unauthorized.statusCode, 403);
  const premium = await runRoute(app.route("POST", "/agentaos/pro/premium/checkout"), { authUser: { _id: "user-1", email: "pro@example.com", role: "pro" }, body: { firmId: "firm-1", userId: "attacker" } });
  assert.equal(premium.body.checkoutUrl, "https://app.agentaos.ai/pay/session-3");
  assert.equal(created.params.successUrl, "https://easyfix.test/pro-dashboard.html?premium=success");
  Firma.findById = () => ({ select: () => ({ lean: async () => ({ _id: "firm-1", owner_user_id: "other-user" }) }) });
  const forbidden = await runRoute(app.route("POST", "/agentaos/pro/premium/checkout"), { authUser: { _id: "user-1", role: "pro" }, body: { firmId: "firm-1" } });
  assert.equal(forbidden.statusCode, 403);
});

test("AgentaOS pay-now checkout preserves its email-token session gate", async () => {
  const app = createAppMock();
  let paidNowFirm = null;
  const middleware = (_req, _res, next) => next();
  registerAgentaCheckoutRoutes({ app, AgentaOS: { checkouts: { create: async (params) => { paidNowFirm = params.metadata.firmId; return { checkoutUrl: "https://app.agentaos.ai/pay/paynow", sessionId: "paynow-session" }; } } }, products: AGENTA_PRODUCTS, User: {}, Firma: {}, requireUserSession: middleware, requireRole: () => middleware, sendError: (res, status, code) => res.status(status).json({ success: false, error_code: code }), FRONTEND_BASE_URL: "https://easyfix.test", FRONTEND_SUCCESS_URL: "https://easyfix.test/success.html", errorWithTime: () => {}, getPayNowFirm: async (req) => req.validPaySession ? { _id: "firm-1", email: "pay@example.com" } : null });
  const denied = await runRoute(app.route("GET", "/agentaos/pay-now/checkout"), { query: { plan: "premium" }, validPaySession: false });
  assert.equal(denied.statusCode, 400);
  const allowed = await runRoute(app.route("GET", "/agentaos/pay-now/checkout"), { query: { plan: "premium" }, validPaySession: true });
  assert.equal(allowed.body.checkoutUrl, "https://app.agentaos.ai/pay/paynow");
  assert.equal(paidNowFirm, "firm-1");
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
