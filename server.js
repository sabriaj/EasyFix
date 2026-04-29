// Main backend entrypoint. Legacy trial-era compatibility still exists in some fields/routes,
// but the live model is free listings plus optional premium upgrades.
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { Resend } from "resend";
import bcrypt from "bcrypt";
import { createRequireAdmin } from "./lib/admin-auth.js";
import { registerAdminRoutes } from "./lib/admin-routes.js";
import { createRequireUserSession, requireRole } from "./lib/auth.js";
import {
  isFirmVisibleStatus,
  isRealFirmRecord,
  unlockFirmContact
} from "./lib/contact-unlock.js";
import { sendError } from "./lib/http.js";
import { registerOwnerRoutes } from "./lib/owner-routes.js";
import { registerPayNowRoutes } from "./lib/pay-now-routes.js";
import { runCleanup as runCleanupMaintenance } from "./lib/maintenance.js";
import { processPaymentWebhook } from "./lib/payment-webhook.js";
import { applyCategoryPlanLimit, parseCategoriesFromBody } from "./lib/plan-helpers.js";
import { createPaymentVariantHelpers } from "./lib/payment-variants.js";
import { createRateLimiter, getRateLimitClientIp } from "./lib/rate-limit.js";
import {
  appendResponseCookie,
  COOKIE_NAMES,
  getCookieValue,
  serializeCookie
} from "./lib/cookies.js";
import {
  normalizeEmail,
  hasText,
  isValidEmail,
  isValidObjectId,
  validateNameLike,
  validateAddressLike,
  validatePasswordValue,
  validateDescriptionValue
} from "./lib/validation.js";
dotenv.config();

const app = express();
const jsonBodyParser = express.json();
const FRONTEND_ORIGIN = (() => {
  try {
    return new URL(String(process.env.FRONTEND_BASE_URL || "https://easyfix.services/")).origin;
  } catch {
    return "https://easyfix.services";
  }
})();
const COOKIE_SECURE = FRONTEND_ORIGIN.startsWith("https://");
const COOKIE_SAME_SITE = COOKIE_SECURE ? "None" : "Lax";
const allowedOrigins = new Set([
  FRONTEND_ORIGIN,
  "https://sabriaj.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

/* ================= CORS (FIXED for x-lang + preflight) ================= */
/*
  Frontend is sending header "x-lang" => browser triggers preflight OPTIONS.
  If server doesn't explicitly allow it, fetch fails with net::ERR_FAILED.
*/
/* ================= CORS (FIXED for x-lang + preflight) ================= */
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-lang"],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

app.use(cors(corsOptions));
// Express v5 s'e pranon "*" si path, prandaj regex:
app.options(/.*/, cors(corsOptions));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://app.lemonsqueezy.com",
    "connect-src 'self' https:",
    "frame-src https://app.lemonsqueezy.com",
    "form-action 'self' https://app.lemonsqueezy.com"
  ].join("; ");

  res.setHeader("Content-Security-Policy", csp);
  next();
});

function appendCookie(res, name, value, maxAgeSeconds) {
  appendResponseCookie(res, serializeCookie(name, value, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    path: "/",
    maxAge: maxAgeSeconds
  }));
}

function clearCookie(res, name) {
  appendResponseCookie(res, serializeCookie(name, "", {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    path: "/",
    expires: new Date(0),
    maxAge: 0
  }));
}

function appendUserSessionCookie(res, token) {
  appendCookie(res, COOKIE_NAMES.userSession, token, 60 * 60 * 24 * 30);
}

function appendAdminSessionCookie(res, token) {
  appendCookie(res, COOKIE_NAMES.adminSession, token, 60 * 60 * 8);
}

function appendOwnerSessionCookie(res, tokenHash, expiresAt) {
  const ttlSeconds = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  appendCookie(res, COOKIE_NAMES.ownerSession, tokenHash, ttlSeconds);
}

function appendPaySessionCookie(res, tokenHash, expiresAt) {
  const ttlSeconds = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  appendCookie(res, COOKIE_NAMES.paySession, tokenHash, ttlSeconds);
}

function appendDeleteSessionCookie(res, tokenHash, expiresAt) {
  const ttlSeconds = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  appendCookie(res, COOKIE_NAMES.deleteSession, tokenHash, ttlSeconds);
}



/* ================= resend email ================= */
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const RESEND_FROM = String(process.env.RESEND_FROM || "").trim();
const RESEND_REPLY_TO = String(process.env.RESEND_REPLY_TO || "").trim();
const FRONTEND_BASE_URL = String(process.env.FRONTEND_BASE_URL || "https://easyfix.services/").replace(/\/+$/, "");

const resend = (RESEND_API_KEY && RESEND_FROM) ? new Resend(RESEND_API_KEY) : null;

async function sendMail({ to, subject, html, text }) {
  if (!resend) throw new Error("Resend not configured (missing RESEND_API_KEY or RESEND_FROM)");
  await resend.emails.send({
    from: RESEND_FROM,
    to,
    subject,
    html,
    text,
    ...(RESEND_REPLY_TO ? { replyTo: RESEND_REPLY_TO } : {}),
  });
}



/* ================= CONFIG ================= */
const PORT = process.env.PORT || 5000;

const LEMON_WEBHOOK_SECRET = process.env.LEMON_WEBHOOK_SECRET || "";
const LEMON_API_KEY = process.env.LEMON_API_KEY || "";
const LEMON_STORE_ID = String(process.env.LEMON_STORE_ID || "");

const VARIANT_PREMIUM = String(process.env.VARIANT_PREMIUM || "");

/*===============variantat per credit ============== */
const VARIANT_CREDITS_1 = String(process.env.VARIANT_CREDITS_1 || "");
const VARIANT_CREDITS_5 = String(process.env.VARIANT_CREDITS_5 || "");
const VARIANT_CREDITS_10 = String(process.env.VARIANT_CREDITS_10 || "");



const FRONTEND_SUCCESS_URL =
  process.env.FRONTEND_SUCCESS_URL ||
  "https://easyfix.services/success.html";

const DELETE_AFTER_DAYS = Number(process.env.DELETE_AFTER_DAYS || 180);
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 60);

const DEFAULT_COUNTRY = String(process.env.DEFAULT_COUNTRY || "MK").toUpperCase();

const PAY_TOKEN_MINUTES = Number(process.env.PAY_TOKEN_MINUTES || 30);

/* ===== EMAIL OTP CONFIG ===== */
const EMAIL_OTP_MIN_SECONDS = Number(process.env.EMAIL_OTP_MIN_SECONDS || 30);
const EMAIL_OTP_EXPIRES_MINUTES = Number(process.env.EMAIL_OTP_EXPIRES_MINUTES || 10);
const EMAIL_OTP_MAX_ATTEMPTS = Number(process.env.EMAIL_OTP_MAX_ATTEMPTS || 8);

/* ===== DATA DELETION CONFIG ===== */
const DELETE_TOKEN_HOURS = Number(process.env.DELETE_TOKEN_HOURS || 24);

/* ===== STUB CLEANUP ===== */
const STUB_DELETE_AFTER_HOURS = Number(process.env.STUB_DELETE_AFTER_HOURS || 48);

/* ================= LOG HELPERS ================= */
function now() { return new Date().toISOString(); }
function log(...args) { console.log(now(), ...args); }
function errorWithTime(...args) { console.error(now(), ...args); }

/* ================= CLOUDINARY ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= MULTER ================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function uploadBufferToCloudinary(buffer, folder = "easyfix") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) return reject(err);
      resolve(result.secure_url);
    });
    stream.end(buffer);
  });
}

/* ================= HELPERS ================= */
function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeCountry(raw) {
  const c = String(raw || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c;
  return DEFAULT_COUNTRY;
}

function normalizePhone(raw) {
  let p = String(raw || "").trim();
  p = p.replace(/[^\d+]/g, "");

  if (p.startsWith("00")) p = "+" + p.slice(2);

  if (p.startsWith("+")) {
    if (p.length < 9 || p.length > 16) return null;
    return p;
  }

  const digits = p.replace(/[^\d]/g, "");
  if (digits.length === 8) return "+389" + digits;
  if (digits.length === 9 && digits.startsWith("0")) return "+389" + digits.slice(1);

  return null;
}

/* ===== OTP HELPERS ===== */
function makeOtp6() {
  return String(crypto.randomInt(100000, 1000000));
}

function canResendOtp(lastSentAt, minSeconds) {
  if (!lastSentAt) return true;
  const last = new Date(lastSentAt).getTime();
  return (Date.now() - last) >= (minSeconds * 1000);
}

/* ================= GEO ================= */
function fetchWithTimeout(url, timeoutMs = 8000, options = {}) {
  const controller = new AbortController();
  const tmr = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(tmr));
}

async function geocodeNominatim({ address, city, countryIso2 }) {
  const q = [address, city].filter(Boolean).join(", ").trim();
  if (!q) return null;

  const cc = String(countryIso2 || "").toLowerCase();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&countrycodes=${encodeURIComponent(cc)}&q=${encodeURIComponent(q)}`;

  try {
    const resp = await fetchWithTimeout(url, 9000, {
      headers: {
        "User-Agent": "EasyFix/1.0 (support@easyfix.services)",
        "Accept": "application/json",
      },
    });
    if (!resp.ok) return null;
    const arr = await resp.json().catch(() => null);
    if (!Array.isArray(arr) || !arr[0]) return null;

    const lat = Number(arr[0].lat);
    const lon = Number(arr[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return { lat, lng: lon };
  } catch {
    return null;
  }
}

async function geocodeFirmLocation({ address, city, countryIso2 }) {
  const addressText = String(address || "").trim();
  const cityText = String(city || "").trim();
  const countryText = normalizeCountry(countryIso2);

  const precise = await geocodeNominatim({
    address: addressText,
    city: cityText,
    countryIso2: countryText
  });

  if (precise || !cityText || !addressText) {
    return precise;
  }

  return geocodeNominatim({
    address: "",
    city: cityText,
    countryIso2: countryText
  });
}

/* ================= SCHEMA ================= */
const firmaSchema = new mongoose.Schema(
  {
    // ===== IMPORTANT: stubs created by OTP flow =====
    is_stub: { type: Boolean, default: false, index: true },

    owner_token_hash: String,
    owner_token_expires: Date,

    delete_token_hash: String,
    delete_token_expires: Date,

    paid_reminder_7d_sent_at: Date,
    paid_reminder_1d_sent_at: Date,
    paid_expired_email_sent_at: Date,

    trial_started_at: Date,
    trial_ends_at: Date,
    trial_reminder_7d_sent_at: Date,
    trial_reminder_1d_sent_at: Date,
    trial_expired_email_sent_at: Date,

    pay_token_hash: String,
    pay_token_expires: Date,

    email_verified: { type: Boolean, default: false },
    email_verified_at: Date,
    email_otp_hash: String,
    email_otp_expires: Date,
    email_otp_attempts: { type: Number, default: 0 },
    email_otp_last_sent_at: Date,

    name: String,
    email: { type: String, unique: true, required: true },
    phone: String,
    phone_verified: { type: Boolean, default: false },
    phone_verified_at: Date,

    address: String,
    city: String,

    owner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    description: { type: String, default: "" },

    categories: { type: [String], default: undefined },
    category: String,

    country: { type: String, default: DEFAULT_COUNTRY, index: true },

    location: {
      type: { type: String, enum: ["Point"], default: undefined },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },

    plan: { type: String, default: "free", index: true }, // free | premium
is_boosted: { type: Boolean, default: false, index: true },
boost_expires_at: Date,

payment_status: { type: String, default: "active", index: true }, // active | expired


logoUrl: String,
photos: [String],

paid_at: Date,
expires_at: Date,
deleted_at: Date,
  },
  { timestamps: true }
);

// Index per /firms dhe admin filters
firmaSchema.index({ payment_status: 1, country: 1, plan: 1, createdAt: -1 });

// Partial 2dsphere index - only index docs that have valid coordinates
firmaSchema.index(
  { location: "2dsphere", payment_status: 1, country: 1 },
  { partialFilterExpression: { "location.coordinates": { $type: "array" } } }
);

const Firma = mongoose.model("Firma", firmaSchema);

/* ===== LEGACY TRIAL USAGE COMPATIBILITY ===== */
const trialUsageSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, required: true, index: true },
    used_at: { type: Date, required: true },
    first_firm_id: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);
const TrialUsage = mongoose.model("TrialUsage", trialUsageSchema);

const webhookReceiptSchema = new mongoose.Schema(
  {
    event_key: { type: String, unique: true, required: true, index: true },
    event_name: { type: String, required: true },
    processed_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
const WebhookReceipt = mongoose.model("WebhookReceipt", webhookReceiptSchema);

/* ================= PLAN RULES ================= */
const planPhotoLimit = { free: 3, premium: 10 };
const { planToVariant, creditsPackToVariant, variantToCredits } = createPaymentVariantHelpers({
  premiumVariant: VARIANT_PREMIUM,
  credits1Variant: VARIANT_CREDITS_1,
  credits5Variant: VARIANT_CREDITS_5,
  credits10Variant: VARIANT_CREDITS_10
});

const authRateLimiter = createRateLimiter({
  sendError,
  windowMs: 15 * 60 * 1000,
  max: 10,
  getKey: (req) => getRateLimitClientIp(req),
  errorCode: "AUTH_RATE_LIMIT"
});

const emailOtpStartLimiter = createRateLimiter({
  sendError,
  windowMs: 10 * 60 * 1000,
  max: 5,
  getKey: (req) => `${getRateLimitClientIp(req)}:${normalizeEmail(req.body?.email) || "no-email"}`,
  errorCode: "OTP_START_RATE_LIMIT"
});

const emailOtpVerifyLimiter = createRateLimiter({
  sendError,
  windowMs: 10 * 60 * 1000,
  max: 10,
  getKey: (req) => `${getRateLimitClientIp(req)}:${normalizeEmail(req.body?.email) || "no-email"}`,
  errorCode: "OTP_VERIFY_RATE_LIMIT"
});

const emailActionLimiter = createRateLimiter({
  sendError,
  windowMs: 60 * 60 * 1000,
  max: 5,
  getKey: (req) => `${getRateLimitClientIp(req)}:${normalizeEmail(req.body?.email) || "no-email"}`,
  errorCode: "EMAIL_ACTION_RATE_LIMIT"
});

const contactLimiter = createRateLimiter({
  sendError,
  windowMs: 5 * 60 * 1000,
  max: 20,
  getKey: (req) => `${getRateLimitClientIp(req)}:${String(req.authUser?._id || req.body?.userId || "anon")}`,
  errorCode: "CONTACT_RATE_LIMIT"
});

const adminRouteLimiter = createRateLimiter({
  sendError,
  windowMs: 5 * 60 * 1000,
  max: 120,
  getKey: (req) => getRateLimitClientIp(req),
  errorCode: "ADMIN_RATE_LIMIT"
});

/* ================= ADMIN AUTH ================= */
const ADMIN_KEY = String(process.env.ADMIN_KEY || "").trim();
const requireAdmin = createRequireAdmin({ adminKey: ADMIN_KEY, sendError });

/* ================= JSON (SKIP WEBHOOK RAW BODY) ================= */
app.use((req, res, next) => {
  if (req.path === "/webhook") {
    return next();
  }
  return jsonBodyParser(req, res, next);
});

/* ================= ADMIN SESSION ================= */
app.post("/admin/session", adminRouteLimiter, async (req, res) => {
  try {
    const adminKey = String(req.body?.adminKey || "").trim();

    if (!ADMIN_KEY) {
      return res.status(500).json({ success: false, error: "ADMIN_KEY is not configured on server" });
    }

    if (!adminKey || adminKey !== ADMIN_KEY) {
      clearCookie(res, COOKIE_NAMES.adminSession);
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    appendAdminSessionCookie(res, ADMIN_KEY);
    return res.json({ success: true });
  } catch (err) {
    errorWithTime("ADMIN SESSION ERROR:", err);
    return sendError(res, 500, "ADMIN_AUTH_ERROR");
  }
});

app.post("/admin/logout", (_req, res) => {
  clearCookie(res, COOKIE_NAMES.adminSession);
  return res.json({ success: true });
});



registerAdminRoutes({
  app,
  adminRouteLimiter,
  requireAdmin,
  Firma,
  sendMail,
  normalizeEmail,
  runCleanup,
  errorWithTime,
  normalizePhone,
  normalizeCountry,
  parseCategoriesFromBody,
  applyCategoryPlanLimit
});


/* ================= CREATE CHECKOUT (LEMON API) ================= */
async function createLemonCheckout({ variantId, email, firmId }) {
  if (!LEMON_API_KEY) throw new Error("Missing LEMON_API_KEY");
  if (!LEMON_STORE_ID) throw new Error("Missing LEMON_STORE_ID");
  if (!variantId) throw new Error("Missing variantId");

  const redirectUrl =
    `${FRONTEND_SUCCESS_URL}?email=${encodeURIComponent(email)}&firmId=${encodeURIComponent(String(firmId || ""))}`;

  const payload = {
    data: {
      type: "checkouts",
      attributes: {
        product_options: { redirect_url: redirectUrl },
        checkout_data: {
          email,
          custom: { email, firmId: String(firmId || "") },
        },
      },
      relationships: {
        store: { data: { type: "stores", id: String(LEMON_STORE_ID) } },
        variant: { data: { type: "variants", id: String(variantId) } },
      },
    },
  };

  const resp = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LEMON_API_KEY}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify(payload),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Lemon API error: ${resp.status} ${JSON.stringify(json)}`);

  const url = json?.data?.attributes?.url;
  if (!url) throw new Error("Checkout URL missing from Lemon response");
  return url;
}

/* ================= WEBHOOK (RAW BODY) ================= */
/* ================= WEBHOOK (RAW BODY) ================= */
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const result = await processPaymentWebhook({
      rawBody: req.body,
      signature: req.headers["x-signature"] || req.headers["x-signature-256"] || "",
      webhookSecret: LEMON_WEBHOOK_SECRET,
      sha256Hex,
      WebhookReceipt,
      normalizeEmail,
      variantToCredits,
      User,
      Firma,
      log
    });

    return res.status(result.status).send(result.text);
  } catch (err) {
    errorWithTime("WEBHOOK ERROR:", err);
    return res.status(500).send("Webhook error");
  }
});


/* ================= CONTACT UNLOCKS ================= */
const contactUnlockSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    firm_id: { type: mongoose.Schema.Types.ObjectId, ref: "Firma", required: true, index: true },
    unlocked_at: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

contactUnlockSchema.index({ user_id: 1, firm_id: 1 }, { unique: true });

const ContactUnlock = mongoose.model("ContactUnlock", contactUnlockSchema);

/* ================= USERS ================= */
const userSchema = new mongoose.Schema(
  {
    name: String,
    surname: String,
    address: String,
    avatarUrl: String,
    

    email: { type: String, unique: true, required: true, index: true },
    password_hash: String,
    session_token: String,

    role: {
      type: String,
      enum: ["client", "pro"],
      default: "client",
      index: true
    },

    credits: { type: Number, default: 0 },

    email_verified: { type: Boolean, default: false },
    email_verified_at: Date,
    email_verification_required: { type: Boolean, default: false },
    email_otp_hash: String,
    email_otp_expires: Date,
    email_otp_attempts: { type: Number, default: 0 },
    email_otp_last_sent_at: Date,
    password_reset_otp_hash: String,
    password_reset_otp_expires: Date,
    password_reset_otp_attempts: { type: Number, default: 0 },
    password_reset_otp_last_sent_at: Date,
    password_reset_verified_at: Date,
    password_reset_token_hash: String,
    password_reset_token_expires: Date,
    deleted_at: Date,
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

const pendingSignupSchema = new mongoose.Schema(
  {
    name: String,
    surname: String,
    address: String,
    avatarUrl: { type: String, default: "" },
    email: { type: String, unique: true, required: true, index: true },
    password_hash: String,
    role: { type: String, enum: ["client"], default: "client" },
    credits: { type: Number, default: 3 },
    email_otp_hash: String,
    email_otp_expires: Date,
    email_otp_attempts: { type: Number, default: 0 },
    email_otp_last_sent_at: Date,
    expires_at: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

const PendingSignup = mongoose.model("PendingSignup", pendingSignupSchema);

const SALT = 10;

const requireUserSession = createRequireUserSession({ User, sendError, errorWithTime });

function makeCodeExpiry() {
  return new Date(Date.now() + EMAIL_OTP_EXPIRES_MINUTES * 60 * 1000);
}

async function sendUserVerificationEmail({ email, code }) {
  const verifyUrl = `${FRONTEND_BASE_URL}/verify-email.html?email=${encodeURIComponent(email)}`;

  await sendMail({
    to: email,
    subject: "EasyFix - Verify your email",
    text: `Your EasyFix verification code is ${code}. It expires in ${EMAIL_OTP_EXPIRES_MINUTES} minutes. Verify here: ${verifyUrl}`,
    html: `
      <div style="font-family:Arial;line-height:1.6">
        <h2>EasyFix</h2>
        <p>Use this code to verify your email:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:2px">${code}</p>
        <p style="color:#666">This code expires in ${EMAIL_OTP_EXPIRES_MINUTES} minutes.</p>
        <p><a href="${verifyUrl}">Open verification page</a></p>
      </div>
    `,
  });
}

async function issueUserVerificationCode(user) {
  if (!resend) {
    throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  }

  const code = makeOtp6();
  log("[mail] User verification email queued:", user.email);
  user.email_otp_hash = sha256Hex(code);
  user.email_otp_expires = makeCodeExpiry();
  user.email_otp_attempts = 0;
  user.email_otp_last_sent_at = new Date();
  user.email_verification_required = true;
  await user.save();
  await sendUserVerificationEmail({ email: user.email, code });
  log("[mail] User verification email sent:", user.email);
}

async function issuePendingSignupVerificationCode(pendingSignup) {
  if (!resend) {
    throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  }

  const code = makeOtp6();
  log("[mail] Pending signup verification email queued:", pendingSignup.email);
  pendingSignup.email_otp_hash = sha256Hex(code);
  pendingSignup.email_otp_expires = makeCodeExpiry();
  pendingSignup.email_otp_attempts = 0;
  pendingSignup.email_otp_last_sent_at = new Date();
  pendingSignup.expires_at = makeCodeExpiry();
  await pendingSignup.save();
  await sendUserVerificationEmail({ email: pendingSignup.email, code });
  log("[mail] Pending signup verification email sent:", pendingSignup.email);
}

async function sendPasswordResetEmail({ user, code }) {
  const resetUrl = `${FRONTEND_BASE_URL}/reset-code.html?email=${encodeURIComponent(user.email)}`;

  log("[mail] Password reset email sending:", user.email);
  await sendMail({
    to: user.email,
    subject: "EasyFix - Password reset code",
    text: `Your EasyFix password reset code is ${code}. It expires in ${EMAIL_OTP_EXPIRES_MINUTES} minutes. Continue here: ${resetUrl}`,
    html: `
      <div style="font-family:Arial;line-height:1.6">
        <h2>EasyFix</h2>
        <p>Use this code to reset your password:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:2px">${code}</p>
        <p style="color:#666">This code expires in ${EMAIL_OTP_EXPIRES_MINUTES} minutes.</p>
        <p><a href="${resetUrl}">Continue password reset</a></p>
      </div>
    `,
  });
  log("[mail] Password reset email sent:", user.email);
}

/* ================= REVIEWS / NOTIFICATIONS ================= */
const reviewSchema = new mongoose.Schema(
  {
    reviewer_user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reviewer_display_name: { type: String, required: true },
    reviewer_avatar_url: { type: String, default: "" },
    firm_id: { type: mongoose.Schema.Types.ObjectId, ref: "Firma", required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, maxlength: 1000 }
  },
  { timestamps: true }
);

reviewSchema.index({ reviewer_user_id: 1, firm_id: 1 }, { unique: true });

const Review = mongoose.model("Review", reviewSchema);

const notificationSchema = new mongoose.Schema(
  {
    recipient_user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    firm_id: { type: mongoose.Schema.Types.ObjectId, ref: "Firma", index: true },
    review_id: { type: mongoose.Schema.Types.ObjectId, ref: "Review" },
    type: { type: String, default: "review" },
    title: { type: String, required: true },
    message: { type: String, required: true },
    is_read: { type: Boolean, default: false, index: true },
    read_at: Date
  },
  { timestamps: true }
);

notificationSchema.index({ recipient_user_id: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

async function appendReviewSummariesToFirms(firms = []) {
  const list = Array.isArray(firms) ? firms : [];
  const ids = list.map(firm => firm?._id).filter(Boolean);
  if (!ids.length) return list;

  const summaries = await Review.aggregate([
    { $match: { firm_id: { $in: ids } } },
    {
      $group: {
        _id: "$firm_id",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  const summaryMap = new Map(
    summaries.map(item => [
      String(item._id),
      {
        averageRating: Math.round(Number(item.averageRating || 0) * 10) / 10,
        reviewCount: Number(item.reviewCount || 0)
      }
    ])
  );

  return list.map(firm => ({
    ...firm,
    averageRating: summaryMap.get(String(firm._id))?.averageRating || 0,
    reviewCount: summaryMap.get(String(firm._id))?.reviewCount || 0
  }));
}


/* ================= USER SIGNUP (CLIENT) ================= */
app.post("/user/signup", authRateLimiter, async (req, res) => {
  try {
    let { name, surname, address, email, password } = req.body;

    email = normalizeEmail(email);
    name = String(name || "").trim();
    surname = String(surname || "").trim();
    address = String(address || "").trim();
    password = String(password || "");

    if (!name || !surname || !email || !password) {
      return sendError(res, 400, "PLOTESO_TEDHENAT");
    }

    if (!validateNameLike(name) || !validateNameLike(surname) || (address && !validateAddressLike(address))) {
      return sendError(res, 400, "INVALID_FIELDS");
    }

    if (!isValidEmail(email)) {
      return sendError(res, 400, "INVALID_EMAIL");
    }

    if (!validatePasswordValue(password)) {
      return sendError(res, 400, "PASSWORD_SHKURT");
    }

    const exists = await User.findOne({ email, deleted_at: { $exists: false } });
    if (exists) {
      const isStaleUnverifiedClient =
        exists.role === "client" &&
        exists.email_verification_required &&
        !exists.email_verified;

      if (!isStaleUnverifiedClient) {
        return sendError(res, 409, "EMAIL_EKZISTON");
      }

      await User.deleteOne({ _id: exists._id });
      log("[auth] Removed stale unverified client before pending signup:", email);
    }

    if (!resend) {
      return sendError(res, 500, "EMAIL_SERVICE_NOT_CONFIGURED");
    }

    const hash = await bcrypt.hash(password, SALT);

    let pendingSignup = await PendingSignup.findOne({ email });
    if (!pendingSignup) {
      pendingSignup = new PendingSignup({ email });
    }

    pendingSignup.name = name;
    pendingSignup.surname = surname;
    pendingSignup.address = address;
    pendingSignup.avatarUrl = "";
    pendingSignup.password_hash = hash;
    pendingSignup.role = "client";
    pendingSignup.credits = 3;

    await issuePendingSignupVerificationCode(pendingSignup);

    return res.json({
      success: true,
      requiresVerification: true,
      email: pendingSignup.email
    });
  } catch (err) {
    errorWithTime("USER SIGNUP ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});


/* ================= PRO SIGNUP ================= */
app.post("/pro/signup", authRateLimiter, async (req, res) => {
  try {
    let { name, surname, address, email, password } = req.body;

    email = normalizeEmail(email);
    name = String(name || "").trim();
    surname = String(surname || "").trim();
    address = String(address || "").trim();
    password = String(password || "");

    if (!name || !surname || !email || !password) {
      return sendError(res, 400, "PLOTESO_TEDHENAT");
    }

    if (!validateNameLike(name) || !validateNameLike(surname) || (address && !validateAddressLike(address))) {
      return sendError(res, 400, "INVALID_FIELDS");
    }

    if (!isValidEmail(email)) {
      return sendError(res, 400, "INVALID_EMAIL");
    }

    if (!validatePasswordValue(password)) {
      return sendError(res, 400, "PASSWORD_SHKURT");
    }

    const existingUser = await User.findOne({ email, deleted_at: { $exists: false } });

    if (existingUser) {
      if (existingUser.role !== "pro") {
        return sendError(res, 409, "EMAIL_EKZISTON");
      }

      const hasFirm = await Firma.findOne({
        $or: [
          { owner_user_id: existingUser._id },
          { email, is_stub: { $ne: true }, name: { $exists: true, $nin: [null, ""] } }
        ]
      }).lean();

      if (hasFirm) {
        return sendError(res, 409, "EMAIL_EKZISTON");
      }

      const passwordOk = await bcrypt.compare(password, existingUser.password_hash || "");
      if (!passwordOk) {
        return sendError(res, 409, "EMAIL_EKZISTON");
      }

      existingUser.name = name;
      existingUser.surname = surname;
      existingUser.address = address;
      existingUser.email_verified = true;
      existingUser.email_verified_at = existingUser.email_verified_at || new Date();
      existingUser.email_verification_required = false;

      const sessionToken = crypto.randomBytes(32).toString("hex");
      existingUser.session_token = sessionToken;

      await existingUser.save();
      appendUserSessionCookie(res, sessionToken);

      return res.json({
        success: true,
        reused: true,
        sessionToken,
        user: {
          id: String(existingUser._id),
          name: existingUser.name,
          surname: existingUser.surname,
          address: existingUser.address,
          avatarUrl: existingUser.avatarUrl || "",
          email: existingUser.email,
          role: existingUser.role,
          credits: existingUser.credits,
        }
      });
    }

    const hash = await bcrypt.hash(password, SALT);
    const sessionToken = crypto.randomBytes(32).toString("hex");

    const user = await User.create({
      name,
      surname,
      address,
      avatarUrl: "",
      email,
      password_hash: hash,
      session_token: sessionToken,
      role: "pro",
      credits: 0,
      email_verified: true,
      email_verified_at: new Date(),
      email_verification_required: false,
    });

    appendUserSessionCookie(res, sessionToken);

    return res.json({
      success: true,
      reused: false,
      sessionToken,
      user: {
        id: String(user._id),
        name: user.name,
        surname: user.surname,
        address: user.address,
        avatarUrl: user.avatarUrl || "",
        email: user.email,
        role: user.role,
        credits: user.credits,
      }
    });
  } catch (err) {
    errorWithTime("PRO SIGNUP ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

app.post("/pro/rollback-signup", authRateLimiter, async (req, res) => {
  try {
    const userId = String(req.body?.userId || "").trim();
    const email = normalizeEmail(req.body?.email);

    if (!userId || !email) {
      return sendError(res, 400, "MISSING_FIELDS");
    }

    if (!isValidObjectId(mongoose, userId) || !isValidEmail(email)) {
      return sendError(res, 400, "INVALID_FIELDS");
    }

    const user = await User.findOne({
      _id: userId,
      email,
      role: "pro"
    });

    if (!user) {
      return res.json({ success: true, removed: false });
    }

    const hasFirm = await Firma.findOne({
      $or: [
        { owner_user_id: user._id },
        { email, is_stub: { $ne: true }, name: { $exists: true, $nin: [null, ""] } }
      ]
    }).lean();

    if (hasFirm) {
      return res.json({ success: true, removed: false });
    }

    await User.deleteOne({ _id: user._id });

    return res.json({ success: true, removed: true });
  } catch (err) {
    errorWithTime("PRO ROLLBACK SIGNUP ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

/* ================= USER LOGIN ================= */
app.post("/user/login", authRateLimiter, async (req, res) => {
  try {
    let { email, password } = req.body;

    email = normalizeEmail(email);
    password = String(password || "");

    if (!email || !password) {
      return sendError(res, 400, "MISSING_FIELDS");
    }

    if (!isValidEmail(email) || !validatePasswordValue(password)) {
      return sendError(res, 400, "INVALID_CREDENTIALS");
    }

    const user = await User.findOne({ email });
if (!user) return sendError(res, 400, "INVALID_CREDENTIALS");

if (user.deleted_at) return sendError(res, 400, "INVALID_CREDENTIALS");

const ok = await bcrypt.compare(password, user.password_hash || "");
if (!ok) return sendError(res, 400, "INVALID_CREDENTIALS");

if (user.email_verification_required && !user.email_verified) {
  return sendError(res, 403, "EMAIL_NOT_VERIFIED");
}

const sessionToken = crypto.randomBytes(32).toString("hex");
user.session_token = sessionToken;
await user.save();
appendUserSessionCookie(res, sessionToken);

return res.json({
  success: true,
  sessionToken,
  user: {
    id: String(user._id),
    name: user.name,
    surname: user.surname,
    address: user.address,
    avatarUrl: user.avatarUrl || "",
    email: user.email,
    role: user.role,
    credits: user.credits,
  }
});
  } catch (err) {
    errorWithTime("USER LOGIN ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

app.post("/auth/verify-email", emailOtpVerifyLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();

    if (!email || !code) return sendError(res, 400, "MISSING_EMAIL_CODE");
    if (!/^\d{6}$/.test(code)) return sendError(res, 400, "INVALID_CODE_FORMAT");

    const pendingSignup = await PendingSignup.findOne({ email });
    if (!pendingSignup) return sendError(res, 400, "INVALID_CODE");

    if (!pendingSignup.email_otp_hash || !pendingSignup.email_otp_expires) {
      return sendError(res, 400, "NO_ACTIVE_CODE");
    }

    if (new Date(pendingSignup.email_otp_expires).getTime() <= Date.now()) {
      await PendingSignup.deleteOne({ _id: pendingSignup._id });
      return sendError(res, 400, "CODE_EXPIRED");
    }

    const attempts = Number(pendingSignup.email_otp_attempts || 0);
    if (attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
      return sendError(res, 429, "TOO_MANY_ATTEMPTS");
    }

    if (sha256Hex(code) !== pendingSignup.email_otp_hash) {
      pendingSignup.email_otp_attempts = attempts + 1;
      await pendingSignup.save();
      return sendError(res, 400, "INVALID_CODE");
    }

    const existingUser = await User.findOne({ email, deleted_at: { $exists: false } });
    if (existingUser) {
      const isStaleUnverifiedClient =
        existingUser.role === "client" &&
        existingUser.email_verification_required &&
        !existingUser.email_verified;

      if (!isStaleUnverifiedClient) {
        await PendingSignup.deleteOne({ _id: pendingSignup._id });
        return sendError(res, 409, "EMAIL_EKZISTON");
      }

      await User.deleteOne({ _id: existingUser._id });
    }

    const user = await User.create({
      name: pendingSignup.name,
      surname: pendingSignup.surname,
      address: pendingSignup.address,
      avatarUrl: pendingSignup.avatarUrl || "",
      email: pendingSignup.email,
      password_hash: pendingSignup.password_hash,
      role: "client",
      credits: pendingSignup.credits,
      email_verified: true,
      email_verified_at: new Date(),
      email_verification_required: false,
    });

    await PendingSignup.deleteOne({ _id: pendingSignup._id });
    log("[auth] Verified pending signup and created user:", user.email);

    return res.json({ success: true, verified: true });
  } catch (err) {
    errorWithTime("USER EMAIL VERIFY ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

async function handleSendUserVerification(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return sendError(res, 400, "MISSING_EMAIL");
    if (!resend) return sendError(res, 500, "EMAIL_SERVICE_NOT_CONFIGURED");

    log("[auth] Pending signup verification email requested:", email);
    const pendingSignup = await PendingSignup.findOne({ email });
    if (!pendingSignup) return sendError(res, 404, "PENDING_SIGNUP_NOT_FOUND");

    if (pendingSignup.email_otp_last_sent_at && !canResendOtp(pendingSignup.email_otp_last_sent_at, EMAIL_OTP_MIN_SECONDS)) {
      return sendError(res, 429, "OTP_COOLDOWN", { retry_after_seconds: EMAIL_OTP_MIN_SECONDS });
    }

    await issuePendingSignupVerificationCode(pendingSignup);
    return res.json({ success: true });
  } catch (err) {
    errorWithTime("USER EMAIL RESEND ERROR:", err);
    return sendError(res, 500, err.message === "EMAIL_SERVICE_NOT_CONFIGURED" ? "EMAIL_SERVICE_NOT_CONFIGURED" : "SERVER_ERROR");
  }
}

app.post("/auth/resend-verification", emailActionLimiter, handleSendUserVerification);
app.post("/auth/send-verification", emailActionLimiter, handleSendUserVerification);
app.post("/send-verification", emailActionLimiter, handleSendUserVerification);

app.post("/auth/password/forgot", emailActionLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return sendError(res, 400, "MISSING_EMAIL");
    if (!resend) return sendError(res, 500, "EMAIL_SERVICE_NOT_CONFIGURED");

    const user = await User.findOne({ email, deleted_at: { $exists: false } });
    if (!user) {
      return res.json({ success: true });
    }

    if (user.password_reset_otp_last_sent_at && !canResendOtp(user.password_reset_otp_last_sent_at, EMAIL_OTP_MIN_SECONDS)) {
      return sendError(res, 429, "OTP_COOLDOWN", { retry_after_seconds: EMAIL_OTP_MIN_SECONDS });
    }

    const code = makeOtp6();
    user.password_reset_otp_hash = sha256Hex(code);
    user.password_reset_otp_expires = makeCodeExpiry();
    user.password_reset_otp_attempts = 0;
    user.password_reset_otp_last_sent_at = new Date();
    user.password_reset_verified_at = undefined;
    user.password_reset_token_hash = undefined;
    user.password_reset_token_expires = undefined;
    await user.save();
    await sendPasswordResetEmail({ user, code });

    return res.json({ success: true });
  } catch (err) {
    errorWithTime("PASSWORD FORGOT ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

app.post("/auth/password/verify-code", emailOtpVerifyLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();

    if (!email || !code) return sendError(res, 400, "MISSING_EMAIL_CODE");
    if (!/^\d{6}$/.test(code)) return sendError(res, 400, "INVALID_CODE_FORMAT");

    const user = await User.findOne({ email, deleted_at: { $exists: false } });
    if (!user || !user.password_reset_otp_hash || !user.password_reset_otp_expires) {
      return sendError(res, 400, "NO_ACTIVE_CODE");
    }

    if (new Date(user.password_reset_otp_expires).getTime() <= Date.now()) {
      return sendError(res, 400, "CODE_EXPIRED");
    }

    const attempts = Number(user.password_reset_otp_attempts || 0);
    if (attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
      return sendError(res, 429, "TOO_MANY_ATTEMPTS");
    }

    if (sha256Hex(code) !== user.password_reset_otp_hash) {
      user.password_reset_otp_attempts = attempts + 1;
      await user.save();
      return sendError(res, 400, "INVALID_CODE");
    }

    const resetToken = makeToken();
    user.password_reset_verified_at = new Date();
    user.password_reset_token_hash = sha256Hex(resetToken);
    user.password_reset_token_expires = makeCodeExpiry();
    await user.save();

    return res.json({ success: true, verified: true, resetToken });
  } catch (err) {
    errorWithTime("PASSWORD CODE VERIFY ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

app.post("/auth/password/reset", authRateLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const resetToken = String(req.body?.resetToken || "").trim();
    const password = String(req.body?.password || "");

    if (!email || !resetToken || !password) return sendError(res, 400, "MISSING_FIELDS");
    if (!validatePasswordValue(password)) return sendError(res, 400, "PASSWORD_SHKURT");

    const user = await User.findOne({ email, deleted_at: { $exists: false } });
    if (!user || !user.password_reset_token_hash || !user.password_reset_token_expires) {
      return sendError(res, 400, "NO_ACTIVE_CODE");
    }

    if (new Date(user.password_reset_token_expires).getTime() <= Date.now()) {
      return sendError(res, 400, "CODE_EXPIRED");
    }

    if (sha256Hex(resetToken) !== user.password_reset_token_hash) {
      return sendError(res, 400, "INVALID_CODE");
    }

    if (!user.password_reset_verified_at) {
      return sendError(res, 400, "CODE_NOT_VERIFIED");
    }

    user.password_hash = await bcrypt.hash(password, SALT);
    user.password_reset_otp_hash = undefined;
    user.password_reset_otp_expires = undefined;
    user.password_reset_otp_attempts = 0;
    user.password_reset_otp_last_sent_at = undefined;
    user.password_reset_verified_at = undefined;
    user.password_reset_token_hash = undefined;
    user.password_reset_token_expires = undefined;
    user.session_token = undefined;
    await user.save();
    clearCookie(res, COOKIE_NAMES.userSession);

    return res.json({ success: true });
  } catch (err) {
    errorWithTime("PASSWORD RESET ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

app.post("/auth/logout", async (req, res) => {
  try {
    const sessionToken = getCookieValue(req, COOKIE_NAMES.userSession);
    if (sessionToken) {
      await User.updateOne(
        { session_token: sessionToken },
        { $unset: { session_token: "" } }
      );
    }
  } catch (err) {
    errorWithTime("AUTH LOGOUT ERROR:", err);
  }
  clearCookie(res, COOKIE_NAMES.userSession);
  return res.json({ success: true });
});

/* ================= user/me/id ================= */
app.get("/user/me/:id", requireUserSession, async (req, res) => {
  try {
    const requestedUserId = String(req.params.id || "").trim();
    if (!requestedUserId || String(req.authUser._id) !== requestedUserId) {
      return sendError(res, 403, "FORBIDDEN");
    }

    return res.json({
      success: true,
      user: {
        id: String(req.authUser._id),
        name: req.authUser.name,
        surname: req.authUser.surname,
        address: req.authUser.address,
        avatarUrl: req.authUser.avatarUrl || "",
        email: req.authUser.email,
        credits: req.authUser.credits,
      },
    });
  } catch (err) {
    errorWithTime("USER ME ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});


/* ================= UPDATE USER PROFILE ================= */
app.put("/user/me/:id", requireUserSession, async (req, res) => {
  try {
    const userId = String(req.params.id || "").trim();
    let { name, surname, address } = req.body || {};

    name = String(name || "").trim();
    surname = String(surname || "").trim();
    address = String(address || "").trim();

    if (!userId) {
      return sendError(res, 400, "MISSING_USER_ID");
    }

    if (!isValidObjectId(mongoose, userId)) {
      return sendError(res, 400, "INVALID_USER_ID");
    }

    if (String(req.authUser._id) !== userId) {
      return sendError(res, 403, "FORBIDDEN");
    }

    if (!name || !surname) {
      return sendError(res, 400, "MISSING_FIELDS");
    }

    if (!validateNameLike(name) || !validateNameLike(surname) || (address && !validateAddressLike(address))) {
      return sendError(res, 400, "INVALID_FIELDS");
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          name,
          surname,
          address
        }
      },
      { new: true }
    ).lean();

    if (!updatedUser) {
      return sendError(res, 404, "USER_NOT_FOUND");
    }

    return res.json({
      success: true,
      user: {
        id: String(updatedUser._id),
        name: updatedUser.name,
        surname: updatedUser.surname,
        address: updatedUser.address,
        avatarUrl: updatedUser.avatarUrl || "",
        email: updatedUser.email,
        credits: updatedUser.credits
      }
    });
  } catch (err) {
    errorWithTime("USER UPDATE ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

/* ================= UPDATE USER AVATAR ================= */
app.put("/user/me/:id/avatar", requireUserSession, upload.single("avatar"), async (req, res) => {
  try {
    const userId = String(req.params.id || "").trim();

    if (!userId) {
      return sendError(res, 400, "MISSING_USER_ID");
    }

    if (!isValidObjectId(mongoose, userId)) {
      return sendError(res, 400, "INVALID_USER_ID");
    }

    if (String(req.authUser._id) !== userId) {
      return sendError(res, 403, "FORBIDDEN");
    }

    if (String(req.authUser.role || "") !== "client") {
      return sendError(res, 403, "FORBIDDEN");
    }

    if (!req.file) {
      return sendError(res, 400, "MISSING_FIELDS");
    }

    const avatarUrl = await uploadBufferToCloudinary(req.file.buffer, "easyfix/avatars");
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { avatarUrl } },
      { new: true }
    ).lean();

    if (!updatedUser) {
      return sendError(res, 404, "USER_NOT_FOUND");
    }

    return res.json({
      success: true,
      user: {
        id: String(updatedUser._id),
        name: updatedUser.name,
        surname: updatedUser.surname,
        address: updatedUser.address,
        avatarUrl: updatedUser.avatarUrl || "",
        email: updatedUser.email,
        credits: updatedUser.credits
      }
    });
  } catch (err) {
    errorWithTime("USER AVATAR UPDATE ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

app.delete("/user/me/:id/avatar", requireUserSession, async (req, res) => {
  try {
    const userId = String(req.params.id || "").trim();

    if (!userId) {
      return sendError(res, 400, "MISSING_USER_ID");
    }

    if (!isValidObjectId(mongoose, userId)) {
      return sendError(res, 400, "INVALID_USER_ID");
    }

    if (String(req.authUser._id) !== userId || String(req.authUser.role || "") !== "client") {
      return sendError(res, 403, "FORBIDDEN");
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { avatarUrl: "" } },
      { new: true }
    ).lean();

    if (!updatedUser) {
      return sendError(res, 404, "USER_NOT_FOUND");
    }

    return res.json({
      success: true,
      user: {
        id: String(updatedUser._id),
        name: updatedUser.name,
        surname: updatedUser.surname,
        address: updatedUser.address,
        avatarUrl: "",
        email: updatedUser.email,
        credits: updatedUser.credits
      }
    });
  } catch (err) {
    errorWithTime("USER AVATAR REMOVE ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

/* ================= CHANGE USER PASSWORD ================= */
app.put("/user/password/:id", requireUserSession, async (req, res) => {
  try {
    const userId = String(req.params.id || "").trim();
    let { currentPassword, newPassword } = req.body || {};

    currentPassword = String(currentPassword || "");
    newPassword = String(newPassword || "");

    if (!userId || !currentPassword || !newPassword) {
      return sendError(res, 400, "MISSING_FIELDS");
    }

    if (!isValidObjectId(mongoose, userId)) {
      return sendError(res, 400, "INVALID_USER_ID");
    }

    if (String(req.authUser._id) !== userId) {
      return sendError(res, 403, "FORBIDDEN");
    }

    if (!validatePasswordValue(currentPassword) || !validatePasswordValue(newPassword)) {
      return sendError(res, 400, "PASSWORD_TOO_SHORT");
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 404, "USER_NOT_FOUND");
    }

    const ok = await bcrypt.compare(currentPassword, user.password_hash || "");
    if (!ok) {
      return sendError(res, 400, "INVALID_CURRENT_PASSWORD");
    }

    const samePassword = await bcrypt.compare(newPassword, user.password_hash || "");
    if (samePassword) {
      return sendError(res, 400, "PASSWORD_SAME_AS_OLD");
    }

    const newHash = await bcrypt.hash(newPassword, SALT);

    user.password_hash = newHash;
    await user.save();

    return res.json({
      success: true,
      message: "PASSWORD_UPDATED"
    });
  } catch (err) {
    errorWithTime("USER PASSWORD CHANGE ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

/* ================= BUY CREDITS ================= */
app.post("/credits/buy", requireUserSession, requireRole("client"), async (req, res) => {
  try {
    const { userId, pack } = req.body;

    if (!userId || !pack) {
      return sendError(res, 400, "MISSING_FIELDS");
    }

    if (!isValidObjectId(mongoose, userId)) {
      return sendError(res, 400, "INVALID_USER_ID");
    }

    if (String(req.authUser._id) !== String(userId).trim()) {
      return sendError(res, 403, "FORBIDDEN");
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 404, "USER_NOT_FOUND");
    }

    log("USER BUY INTENT:", {
  userId: String(user._id),
  email: user.email,
  pack: Number(pack)
});

    const variantId = creditsPackToVariant(pack);
    if (!variantId) {
      return sendError(res, 400, "INVALID_CREDIT_PACK");
    }

    const redirectUrl = `${FRONTEND_BASE_URL}/buy-credits.html?success=1`;

    const payload = {
      data: {
        type: "checkouts",
        attributes: {
          product_options: {
            redirect_url: redirectUrl,
          },
          checkout_options: {
            embed: true,
            media: false,
            logo: true,
            desc: false,
            discount: false,
            locale: "en",
            button_color: "#2563eb",
            button_text_color: "#ffffff"
          },
          checkout_data: {
            email: user.email,
            name: `${user.name || ""} ${user.surname || ""}`.trim(),
            custom: {
              userId: String(user._id),
              creditPack: String(pack),
            },
          },
        },
        relationships: {
          store: { data: { type: "stores", id: String(LEMON_STORE_ID) } },
          variant: { data: { type: "variants", id: String(variantId) } },
        },
      },
    };

    const resp = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LEMON_API_KEY}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify(payload),
    });

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      errorWithTime("CREDITS CHECKOUT ERROR:", json);
      return sendError(res, 500, "CHECKOUT_CREATE_FAILED");
    }

    const checkoutUrl = json?.data?.attributes?.url;
    if (!checkoutUrl) {
      return sendError(res, 500, "CHECKOUT_URL_MISSING");
    }

    return res.json({
      success: true,
      checkoutUrl,
    });
  } catch (err) {
    errorWithTime("BUY CREDITS ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

/* ================= CONTACT SYSTEM ================= */
/* ================= CONTACT ================= */
app.post("/contact", contactLimiter, requireUserSession, requireRole("client"), async (req, res) => {
  try {
    const result = await unlockFirmContact({
      body: req.body,
      authUser: req.authUser,
      User,
      Firma,
      ContactUnlock,
      isValidObjectId: (value) => isValidObjectId(mongoose, value)
    });

    if (!result.body.success) {
      return sendError(res, result.status, result.body.error_code);
    }

    return res.status(result.status).json(result.body);
  } catch (err) {
    errorWithTime("CONTACT ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

/* ================= REVIEWS ================= */
app.get("/firms/:id/reviews", async (req, res) => {
  try {
    const firmId = String(req.params.id || "").trim();

    if (!isValidObjectId(mongoose, firmId)) {
      return sendError(res, 400, "INVALID_FIELDS");
    }

    const reviews = await Review.find({ firm_id: firmId })
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    const avg = reviews.length
      ? reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviews.length
      : 0;

    return res.json({
      success: true,
      averageRating: Math.round(avg * 10) / 10,
      count: reviews.length,
      reviews
    });
  } catch (err) {
    errorWithTime("REVIEWS LIST ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

app.post("/firms/:id/reviews", requireUserSession, requireRole("client"), async (req, res) => {
  try {
    const firmId = String(req.params.id || "").trim();
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || "").trim();

    if (!isValidObjectId(mongoose, firmId)) {
      return sendError(res, 400, "INVALID_FIELDS");
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !hasText(comment, 3, 1000)) {
      return sendError(res, 400, "INVALID_FIELDS");
    }

    const firm = await Firma.findById(firmId)
      .select("_id name owner_user_id payment_status deleted_at")
      .lean();

    if (!firm || !isRealFirmRecord(firm) || !isFirmVisibleStatus(firm.payment_status)) {
      return sendError(res, 404, "FIRM_NOT_FOUND");
    }

    const reviewer = await User.findById(req.authUser._id)
      .select("_id name surname avatarUrl role")
      .lean();

    if (!reviewer || reviewer.role !== "client") {
      return sendError(res, 403, "FORBIDDEN");
    }

    const reviewerDisplayName = `${reviewer.name || ""} ${reviewer.surname || ""}`.trim() || "EasyFix client";
    const existingReview = await Review.findOne({
      reviewer_user_id: reviewer._id,
      firm_id: firm._id
    });

    let review;
    let created = false;

    if (existingReview) {
      existingReview.reviewer_display_name = reviewerDisplayName;
      existingReview.reviewer_avatar_url = reviewer.avatarUrl || "";
      existingReview.rating = rating;
      existingReview.comment = comment;
      review = await existingReview.save();
    } else {
      created = true;
      review = await Review.create({
        reviewer_user_id: reviewer._id,
        reviewer_display_name: reviewerDisplayName,
        reviewer_avatar_url: reviewer.avatarUrl || "",
        firm_id: firm._id,
        rating,
        comment
      });

      if (firm.owner_user_id) {
        await Notification.create({
          recipient_user_id: firm.owner_user_id,
          firm_id: firm._id,
          review_id: review._id,
          type: "review",
          title: "You received a new review",
          message: `${reviewerDisplayName} left a ${rating}-star review.`
        });
      }
    }

    return res.status(created ? 201 : 200).json({
      success: true,
      created,
      review
    });
  } catch (err) {
    if (err?.code === 11000) {
      return sendError(res, 409, "DUPLICATE_REVIEW");
    }

    errorWithTime("REVIEW SAVE ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

app.get("/pro/reviews/me", requireUserSession, requireRole("pro"), async (req, res) => {
  try {
    const firm = await Firma.findOne({ owner_user_id: req.authUser._id })
      .select("_id")
      .lean();

    if (!firm) {
      return sendError(res, 404, "FIRM_NOT_FOUND");
    }

    const reviews = await Review.find({ firm_id: firm._id })
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    const avg = reviews.length
      ? reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviews.length
      : 0;

    return res.json({
      success: true,
      averageRating: Math.round(avg * 10) / 10,
      count: reviews.length,
      reviews
    });
  } catch (err) {
    errorWithTime("PRO REVIEWS ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

app.get("/pro/notifications/me", requireUserSession, requireRole("pro"), async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient_user_id: req.authUser._id })
      .select("-__v")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    await Notification.updateMany(
      { recipient_user_id: req.authUser._id, is_read: false },
      { $set: { is_read: true, read_at: new Date() } }
    );

    return res.json({
      success: true,
      notifications
    });
  } catch (err) {
    errorWithTime("PRO NOTIFICATIONS ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

/* ================= OWNER MANAGE ================= */

registerOwnerRoutes({
  app,
  Firma,
  resend,
  sendMail,
  FRONTEND_BASE_URL,
  emailActionLimiter,
  normalizeEmail,
  isValidEmail,
  validateNameLike,
  validateAddressLike,
  normalizePhone,
  normalizeCountry,
  parseCategoriesFromBody,
  applyCategoryPlanLimit,
  makeToken,
  sha256Hex,
  getCookieValue,
  appendOwnerSessionCookie,
  clearCookie,
  COOKIE_NAMES,
  sendError,
  errorWithTime,
  isRealFirmRecord
});

registerPayNowRoutes({
  app,
  emailActionLimiter,
  Firma,
  resend,
  sendMail,
  FRONTEND_BASE_URL,
  PAY_TOKEN_MINUTES,
  makeToken,
  sha256Hex,
  getCookieValue,
  appendPaySessionCookie,
  clearCookie,
  COOKIE_NAMES,
  normalizeEmail,
  isValidEmail,
  isRealFirmRecord,
  planToVariant,
  createLemonCheckout,
  sendError,
  errorWithTime,
  isValidObjectId: (value) => isValidObjectId(mongoose, value),
  isFirmVisibleStatus
});

/* ================= DATA DELETION ================= */
async function sendDeleteConfirmationForFirm({ firm, reason = "" }) {
  const token = makeToken();
  const tokenHash = sha256Hex(token);
  const expires = new Date(Date.now() + DELETE_TOKEN_HOURS * 60 * 60 * 1000);

  await Firma.updateOne(
    { _id: firm._id },
    { $set: { delete_token_hash: tokenHash, delete_token_expires: expires } }
  );

  const encodedToken = encodeURIComponent(token);
  const confirmUrl =
    `${FRONTEND_BASE_URL}/delete-confirm.html?token=${encodedToken}#token=${encodedToken}`;

  await sendMail({
    to: firm.email,
    subject: "EasyFix - Confirm account deletion",
    text: `Per me konfirmu fshirjen e account-it dhe listing-ut, kliko linkun:\n${confirmUrl}\n\n` +
      `Ky link skadon per ${DELETE_TOKEN_HOURS} ore.\n` +
      (reason ? `Arsyeja: ${reason}\n` : ""),
    html: `
      <div style="font-family:Arial;line-height:1.6">
        <h2>EasyFix</h2>
        <p>Per me konfirmu fshirjen e account-it dhe listing-ut, kliko:</p>
        <p><a href="${confirmUrl}">${confirmUrl}</a></p>
        <p style="color:#666">Ky link skadon per ${DELETE_TOKEN_HOURS} ore.</p>
        ${reason ? `<p><b>Arsyeja:</b> ${reason}</p>` : ""}
      </div>
    `,
  });
}

app.post("/delete-request", emailActionLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const reason = String(req.body?.reason || "").trim().slice(0, 500);

    if (!email) return res.status(400).json({ success: false, error: "Missing email" });
    if (!resend) return res.status(500).json({ success: false, error: "Email service not configured" });

    const firm = await Firma.findOne({ email }).select("_id email").lean();

    if (!firm) {
      return res.json({ success: true, message: "If the email exists, we sent a confirmation link." });
    }

    await sendDeleteConfirmationForFirm({ firm, reason });

    return res.json({ success: true, message: "If the email exists, we sent a confirmation link." });
  } catch (err) {
    errorWithTime("DELETE REQUEST ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/pro/account/delete-request", requireUserSession, requireRole("pro"), emailActionLimiter, async (req, res) => {
  try {
    if (!resend) return sendError(res, 500, "EMAIL_SERVICE_NOT_CONFIGURED");

    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    const firm = await Firma.findOne({
      owner_user_id: req.authUser._id,
      $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }]
    }).select("_id email owner_user_id").lean();

    if (!firm) {
      return sendError(res, 404, "FIRM_NOT_FOUND");
    }

    await sendDeleteConfirmationForFirm({ firm, reason });
    return res.json({ success: true });
  } catch (err) {
    errorWithTime("PRO DELETE REQUEST ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

app.post("/delete-confirm", emailActionLimiter, async (req, res) => {
  try {
    const bodyToken = String(req.body?.token || req.body?.delete_token || req.body?.t || "").trim();
    const tokenHash = bodyToken ? sha256Hex(bodyToken) : getCookieValue(req, COOKIE_NAMES.deleteSession);
    if (!tokenHash) return res.status(400).json({ success: false, error: "Missing delete token" });

    const firm = await Firma.findOne({
      delete_token_hash: tokenHash,
      delete_token_expires: { $gt: new Date() },
    }).select("_id email owner_user_id").lean();

    if (!firm) {
      clearCookie(res, COOKIE_NAMES.deleteSession);
      return res.status(400).json({ success: false, error: "Invalid or expired link" });
    }

    const nowD = new Date();

    await Firma.updateOne(
      { _id: firm._id },
      {
        $set: {
          deleted_at: nowD,
          payment_status: "expired",
          expires_at: nowD,
        },
        $unset: { delete_token_hash: "", delete_token_expires: "" },
      }
    );

    if (firm.owner_user_id) {
      const deletedEmail = `deleted-${String(firm.owner_user_id)}@deleted.easyfix.local`;
      await User.updateOne(
        { _id: firm.owner_user_id, role: "pro" },
        {
          $set: {
            name: "Deleted",
            surname: "Account",
            address: "",
            avatarUrl: "",
            email: deletedEmail,
            password_hash: "",
            deleted_at: nowD
          },
          $unset: {
            session_token: "",
            email_otp_hash: "",
            email_otp_expires: ""
          }
        }
      );

      await Notification.deleteMany({ recipient_user_id: firm.owner_user_id });
    }

    clearCookie(res, COOKIE_NAMES.deleteSession);
    return res.json({ success: true });
  } catch (err) {
    errorWithTime("DELETE CONFIRM ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/delete/session", emailActionLimiter, async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ success: false, error: "Missing token" });

    const tokenHash = sha256Hex(token);
    const firm = await Firma.findOne({
      delete_token_hash: tokenHash,
      delete_token_expires: { $gt: new Date() }
    }).select("_id email delete_token_expires").lean();

    if (!firm) {
      clearCookie(res, COOKIE_NAMES.deleteSession);
      return res.status(400).json({ success: false, error: "Invalid or expired link" });
    }

    appendDeleteSessionCookie(res, tokenHash, firm.delete_token_expires);
    return res.json({
      success: true,
      email: firm.email
    });
  } catch (err) {
    errorWithTime("DELETE SESSION ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= EMAIL OTP VERIFY ================= */
app.post("/auth/email/start", emailOtpStartLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return sendError(res, 400, "MISSING_EMAIL");
    if (!resend) return sendError(res, 500, "EMAIL_SERVICE_NOT_CONFIGURED");

    const existing = await Firma.findOne({ email })
      .select("_id email name deleted_at email_verified email_otp_last_sent_at payment_status is_stub")
      .lean();

    // If there is an ACTIVE real firm (not deleted), block OTP start
    if (existing?.name && !existing.deleted_at) {
      return sendError(res, 409, "EMAIL_EXISTS");
    }

    if (existing?.email_otp_last_sent_at && !canResendOtp(existing.email_otp_last_sent_at, EMAIL_OTP_MIN_SECONDS)) {
      return sendError(res, 429, "OTP_COOLDOWN", { retry_after_seconds: EMAIL_OTP_MIN_SECONDS });
    }

    const otp = makeOtp6();
    const otpHash = sha256Hex(otp);
    const expires = new Date(Date.now() + EMAIL_OTP_EXPIRES_MINUTES * 60 * 1000);

    if (!existing) {
      await Firma.create({
  email,
  plan: "free",
  payment_status: "active",
  email_verified: false,
  is_stub: true,
  email_otp_hash: otpHash,
  email_otp_expires: expires,
  email_otp_attempts: 0,
  email_otp_last_sent_at: new Date(),
});
    } else {
      // Keep existing doc (could be deleted old firm) - just refresh OTP
      await Firma.updateOne(
        { _id: existing._id },
        {
          $set: {
            email_verified: false,
            email_verified_at: null,
            // if it has no name, it's a stub (hide from admin)
            is_stub: existing?.name ? false : true,
            email_otp_hash: otpHash,
            email_otp_expires: expires,
            email_otp_attempts: 0,
            email_otp_last_sent_at: new Date(),
          }
        }
      );
    }

    await sendMail({
      to: email,
      subject: "EasyFix - Kodi i verifikimit",
      text: `Kodi yt i verifikimit eshte: ${otp} (skadon per ${EMAIL_OTP_EXPIRES_MINUTES} minuta).`,
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>EasyFix</h2>
          <p>Kodi yt i verifikimit eshte:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:2px">${otp}</p>
          <p style="color:#666">Skadon per ${EMAIL_OTP_EXPIRES_MINUTES} minuta.</p>
        </div>
      `,
    });

    return res.json({ success: true });
  } catch (err) {
    errorWithTime("EMAIL START ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

app.post("/auth/email/verify", emailOtpVerifyLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();

    if (!email || !code) return sendError(res, 400, "MISSING_EMAIL_CODE");
    if (!/^\d{6}$/.test(code)) return sendError(res, 400, "INVALID_CODE_FORMAT");

    const firm = await Firma.findOne({ email })
      .select("_id email name deleted_at email_verified email_otp_hash email_otp_expires email_otp_attempts")
      .lean();

    if (!firm) return sendError(res, 400, "INVALID_CODE");

    // If active real firm exists, block
    if (firm?.name && !firm.deleted_at) return sendError(res, 409, "EMAIL_EXISTS");

    if (!firm.email_otp_hash || !firm.email_otp_expires) {
      return sendError(res, 400, "NO_ACTIVE_CODE");
    }

    if (new Date(firm.email_otp_expires).getTime() <= Date.now()) {
      return sendError(res, 400, "CODE_EXPIRED");
    }

    const attempts = Number(firm.email_otp_attempts || 0);
    if (attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
      return sendError(res, 429, "TOO_MANY_ATTEMPTS");
    }

    const ok = sha256Hex(code) === firm.email_otp_hash;

    if (!ok) {
      await Firma.updateOne({ _id: firm._id }, { $set: { email_otp_attempts: attempts + 1 } });
      return sendError(res, 400, "INVALID_CODE");
    }

    await Firma.updateOne(
      { _id: firm._id },
      {
        $set: { email_verified: true, email_verified_at: new Date() },
        $unset: { email_otp_hash: "", email_otp_expires: "", email_otp_attempts: "", email_otp_last_sent_at: "" },
      }
    );

    return res.json({ success: true, verified: true });
  } catch (err) {
    errorWithTime("EMAIL VERIFY ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  const rs = mongoose.connection.readyState;
  res.json({
    ok: true,
    time: now(),
    dbReadyState: rs,
    resendConfigured: Boolean(resend),
    resendFrom: RESEND_FROM ? RESEND_FROM : null
  });
});

/* ================= REGISTER (multipart) ================= */
/* ================= REGISTER (FREE PRO LISTING) ================= */
app.post(
  "/register",
  requireUserSession,
  requireRole("pro"),
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      let {
        owner_user_id,
        name,
        email,
        phone,
        address,
        city,
        category,
        categories,
        country,
        description
      } = req.body;

      email = normalizeEmail(email);
      const phoneNorm = normalizePhone(phone);
      const countryNorm = normalizeCountry(country);
      const cityNorm = String(city || "").trim();
      const descriptionNorm = String(description || "").trim().slice(0, 1000);

      const freePlan = "free";

      const parsedCats = parseCategoriesFromBody({ category, categories });
      const catsLimited = applyCategoryPlanLimit(parsedCats, freePlan);
      const primaryCategory = catsLimited[0] || null;

      if (!name || !email || !phoneNorm || !cityNorm || !primaryCategory) {
        return sendError(res, 400, "MISSING_FIELDS");
      }

      if (!isValidEmail(email) || !validateNameLike(name) || (address && !validateAddressLike(address)) || !hasText(cityNorm, 2, 80) || !validateDescriptionValue(descriptionNorm)) {
        return sendError(res, 400, "INVALID_FIELDS");
      }

      if (!isValidObjectId(mongoose, owner_user_id)) {
        return sendError(res, 400, "INVALID_OWNER_USER_ID");
      }

      if (!owner_user_id || String(req.authUser._id) !== String(owner_user_id).trim()) {
        return sendError(res, 403, "FORBIDDEN");
      }

      const existing = await Firma.findOne({ email })
        .select("_id name deleted_at email_verified")
        .lean();

      if (!existing || !existing.email_verified) {
        return sendError(res, 403, "EMAIL_NOT_VERIFIED");
      }

      if (existing?.name && !existing.deleted_at) {
        return sendError(res, 409, "EMAIL_EXISTS");
      }

      const addressNorm = String(address || "").trim();
      const geo = await geocodeFirmLocation({
        address: addressNorm,
        city: cityNorm,
        countryIso2: countryNorm
      });

      if (!geo) {
        return sendError(res, 400, "GEO_NOT_FOUND");
      }

      const files = req.files || {};

      let logoUrl = null;
      if (files.logo?.[0]) {
        logoUrl = await uploadBufferToCloudinary(files.logo[0].buffer, "easyfix/logos");
      }

      let photos = [];
      const picked = (files.photos || []).slice(0, planPhotoLimit.free);

      for (const f of picked) {
        const url = await uploadBufferToCloudinary(f.buffer, "easyfix/photos");
        photos.push(url);
      }

      const firma = await Firma.findOneAndUpdate(
        { email },
        {
          $set: {
            is_stub: false,
            name,
            email,
            phone: phoneNorm,
            phone_verified: false,
            phone_verified_at: null,
            address: addressNorm,
            city: cityNorm,
            owner_user_id: owner_user_id ? String(owner_user_id) : null,
            description: descriptionNorm,
            categories: catsLimited,
            category: primaryCategory,
            country: countryNorm,
           

            location: {
              type: "Point",
              coordinates: [geo.lng, geo.lat],
            },

            plan: "free",
            is_boosted: false,
            boost_expires_at: null,
            payment_status: "active",

            logoUrl,
            photos,

            deleted_at: null,

            paid_at: null,
            expires_at: null,
            trial_started_at: null,
            trial_ends_at: null,
            paid_reminder_7d_sent_at: null,
            paid_reminder_1d_sent_at: null,
            paid_expired_email_sent_at: null,
            trial_reminder_7d_sent_at: null,
            trial_reminder_1d_sent_at: null,
            trial_expired_email_sent_at: null,
          }
        },
        { new: true }
      );

      return res.json({
        success: true,
        message: "Regjistrimi u krye me sukses.",
        firmId: String(firma?._id || "")
      });
    } catch (err) {
      errorWithTime("REGISTER ERROR:", err);
      return sendError(res, 500, "SERVER_ERROR");
    }
  }
);


/* ================= PUBLIC ================= */
app.get("/firms", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

    const qCountry = String(req.query.country || "").trim().toUpperCase();

    const notDeleted = {
      $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
    };

    const activeOnly = {
  $and: [
    notDeleted,
    { payment_status: "active" },
    { name: { $exists: true, $nin: [null, ""] } }
  ],
};

    let query = activeOnly;

    if (/^[A-Z]{2}$/.test(qCountry)) {
      if (qCountry === "MK") {
        query = {
          $and: [
            activeOnly,
            {
              $or: [
                { country: "MK" },
                { country: { $exists: false } },
                { country: null },
                { country: "" },
              ],
            },
          ],
        };
      } else {
        query = {
          $and: [activeOnly, { country: qCountry }],
        };
      }
    }

    const firms = await Firma.find(query)
      .select("-__v")
      .sort({ is_boosted: -1, createdAt: -1 })
      .lean();

    const normalized = await appendReviewSummariesToFirms(firms.map(f => {
      const safePhotos = Array.isArray(f.photos) ? f.photos : [];
      const visiblePhotos = f.plan === "premium"
        ? safePhotos.slice(0, planPhotoLimit.premium)
        : safePhotos.slice(0, planPhotoLimit.free);

      return {
        ...f,
        photos: visiblePhotos
      };
    }));

    return res.json(normalized);
  } catch (err) {
    errorWithTime("FIRMS ERROR:", err);
    return res.status(500).send("Server error");
  }
});


/* ================= GET PRO FIRM BY USER ================= */
app.get("/pro/firma/me/:userId", requireUserSession, requireRole("pro"), async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();

    if (!userId) {
      return sendError(res, 400, "MISSING_USER_ID");
    }

    if (String(req.authUser._id) !== userId) {
      return sendError(res, 403, "FORBIDDEN");
    }

    const firm = await Firma.findOne({ owner_user_id: userId })
      .select("-__v")
      .lean();

    if (!firm) {
      return sendError(res, 404, "FIRM_NOT_FOUND");
    }

    return res.json({
      success: true,
      firm
    });
  } catch (err) {
    errorWithTime("GET PRO FIRM ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

/* ================= PRO PREMIUM CHECKOUT ================= */
app.post("/pro/premium/checkout", requireUserSession, requireRole("pro"), async (req, res) => {
  try {
    const { userId, firmId } = req.body || {};

    const safeUserId = String(userId || "").trim();
    const safeFirmId = String(firmId || "").trim();

    if (!safeUserId || !safeFirmId) {
      return sendError(res, 400, "MISSING_FIELDS");
    }

    if (!isValidObjectId(mongoose, safeUserId) || !isValidObjectId(mongoose, safeFirmId)) {
      return sendError(res, 400, "INVALID_FIELDS");
    }

    if (String(req.authUser._id) !== safeUserId) {
      return sendError(res, 403, "FORBIDDEN");
    }

    const user = await User.findById(safeUserId).select("_id email role").lean();
    if (!user) {
      return sendError(res, 404, "USER_NOT_FOUND");
    }

    if (user.role !== "pro") {
      return sendError(res, 403, "ONLY_PRO_CAN_BUY_PREMIUM");
    }

    const firm = await Firma.findById(safeFirmId)
      .select("_id email owner_user_id plan payment_status")
      .lean();

    if (!firm) {
      return sendError(res, 404, "FIRM_NOT_FOUND");
    }

    if (String(firm.owner_user_id || "") !== safeUserId) {
      return sendError(res, 403, "FORBIDDEN");
    }

    const variantId = planToVariant("premium");
    if (!variantId) {
      return sendError(res, 500, "PREMIUM_VARIANT_NOT_CONFIGURED");
    }

    const payload = {
      data: {
        type: "checkouts",
        attributes: {
          product_options: {
            redirect_url: `${FRONTEND_BASE_URL}/pro-dashboard.html?premium=success`
          },
          checkout_options: {
            embed: true,
            media: false,
            logo: true,
            desc: false,
            discount: false,
            locale: "en",
            button_color: "#2563eb",
            button_text_color: "#ffffff"
          },
          checkout_data: {
            email: firm.email || user.email,
            custom: {
              firmId: String(firm._id),
              email: String(firm.email || user.email)
            }
          }
        },
        relationships: {
          store: { data: { type: "stores", id: String(LEMON_STORE_ID) } },
          variant: { data: { type: "variants", id: String(variantId) } }
        }
      }
    };

    const resp = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LEMON_API_KEY}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify(payload),
    });

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      errorWithTime("PRO PREMIUM CHECKOUT ERROR:", json);
      return sendError(res, 500, "CHECKOUT_CREATE_FAILED");
    }

    const checkoutUrl = json?.data?.attributes?.url;
    if (!checkoutUrl) {
      return sendError(res, 500, "CHECKOUT_URL_MISSING");
    }

    return res.json({
      success: true,
      checkoutUrl
    });
  } catch (err) {
    errorWithTime("PRO PREMIUM CHECKOUT SERVER ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});
/* ================= UPDATE PRO FIRM ================= */
app.put("/pro/firma/:id", requireUserSession, requireRole("pro"), async (req, res) => {
  try {
    const firmId = String(req.params.id || "").trim();

    let {
      owner_user_id,
      name,
      phone,
      address,
      city,
      category,
      categories,
      country,
      description
    } = req.body || {};

    if (!firmId) {
      return sendError(res, 400, "MISSING_FIRM_ID");
    }

    owner_user_id = String(owner_user_id || "").trim();
    name = String(name || "").trim();
    address = String(address || "").trim();
    city = String(city || "").trim();
    description = String(description || "").trim().slice(0, 1000);
    country = normalizeCountry(country);

    if (!isValidObjectId(mongoose, firmId) || !isValidObjectId(mongoose, owner_user_id)) {
      return sendError(res, 400, "INVALID_FIELDS");
    }

    if (String(req.authUser._id) !== owner_user_id) {
      return sendError(res, 403, "FORBIDDEN");
    }

    const phoneNorm = normalizePhone(phone);

    const existing = await Firma.findById(firmId).select("_id owner_user_id plan").lean();
    if (!existing) {
      return sendError(res, 404, "FIRM_NOT_FOUND");
    }

    if (!owner_user_id || String(existing.owner_user_id || "") !== owner_user_id) {
      return sendError(res, 403, "FORBIDDEN");
    }

    const parsedCats = parseCategoriesFromBody({ category, categories });
    const effectivePlan = String(existing.plan || "free").toLowerCase();
    const catsLimited = applyCategoryPlanLimit(parsedCats, effectivePlan);
    const primaryCategory = catsLimited[0] || null;

    if (!name || !phoneNorm || !city || !primaryCategory) {
      return sendError(res, 400, "MISSING_FIELDS");
    }

    if (!validateNameLike(name) || (address && !validateAddressLike(address)) || !hasText(city, 2, 80) || !validateDescriptionValue(description)) {
      return sendError(res, 400, "INVALID_FIELDS");
    }

    const geo = await geocodeFirmLocation({
      address,
      city,
      countryIso2: country
    });

    if (!geo) {
      return sendError(res, 400, "GEO_NOT_FOUND");
    }

    const updated = await Firma.findByIdAndUpdate(
      firmId,
      {
        $set: {
          name,
          phone: phoneNorm,
          address,
          city,
          description,
          categories: catsLimited,
          category: primaryCategory,
          country,
          location: {
            type: "Point",
            coordinates: [geo.lng, geo.lat]
          }
        }
      },
      { new: true }
    ).select("-__v").lean();

    return res.json({
      success: true,
      firm: updated
    });
  } catch (err) {
    errorWithTime("UPDATE PRO FIRM ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

/* ================= UPDATE PRO FIRM MEDIA ================= */
app.put(
  "/pro/firma/:id/media",
  requireUserSession,
  requireRole("pro"),
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const firmId = String(req.params.id || "").trim();
      const owner_user_id = String(req.body?.owner_user_id || "").trim();

      if (!firmId) {
        return sendError(res, 400, "MISSING_FIRM_ID");
      }

      if (!isValidObjectId(mongoose, firmId) || !isValidObjectId(mongoose, owner_user_id)) {
        return sendError(res, 400, "INVALID_FIELDS");
      }

      if (String(req.authUser._id) !== owner_user_id) {
        return sendError(res, 403, "FORBIDDEN");
      }

      const firm = await Firma.findById(firmId).select("_id owner_user_id plan photos logoUrl").lean();
      if (!firm) {
        return sendError(res, 404, "FIRM_NOT_FOUND");
      }

      if (!owner_user_id || String(firm.owner_user_id || "") !== owner_user_id) {
        return sendError(res, 403, "FORBIDDEN");
      }

      const files = req.files || {};
      const updateSet = {};

      if (files.logo?.[0]) {
        const logoUrl = await uploadBufferToCloudinary(files.logo[0].buffer, "easyfix/logos");
        updateSet.logoUrl = logoUrl;
      }

      if (files.photos?.length) {
        const maxPhotos = planPhotoLimit[String(firm.plan || "free").toLowerCase()] || 3;
        const picked = files.photos.slice(0, maxPhotos);

        const uploaded = [];
        for (const f of picked) {
          const url = await uploadBufferToCloudinary(f.buffer, "easyfix/photos");
          uploaded.push(url);
        }

        updateSet.photos = uploaded;
      }

      const updated = await Firma.findByIdAndUpdate(
        firmId,
        { $set: updateSet },
        { new: true }
      ).select("-__v").lean();

      return res.json({
        success: true,
        firm: updated
      });
    } catch (err) {
      errorWithTime("UPDATE PRO FIRM MEDIA ERROR:", err);
      return sendError(res, 500, "SERVER_ERROR");
    }
  }
);


/* ================= NEAR ME ================= */
app.get("/firms/near", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

    const qCountry = String(req.query.country || "").trim().toUpperCase();
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    let radiusKm = Number(req.query.radius_km || 25);
    if (!Number.isFinite(radiusKm)) radiusKm = 25;
    radiusKm = Math.max(1, Math.min(radiusKm, 200));
    const radiusM = radiusKm * 1000;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return sendError(res, 400, "MISSING_LAT_LNG");
    }

    const geoClause = {
      location: {
        $nearSphere: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: radiusM,
        },
      },
    };

    const notDeleted = {
      $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
    };

    const activeOnly = {
  $and: [
    notDeleted,
    { payment_status: "active" },
    { name: { $exists: true, $nin: [null, ""] } }
  ],
};

    let query = null;

    if (/^[A-Z]{2}$/.test(qCountry)) {
      if (qCountry === "MK") {
        query = {
          $and: [
            activeOnly,
            geoClause,
            {
              $or: [
                { country: "MK" },
                { country: { $exists: false } },
                { country: null },
                { country: "" },
              ],
            },
          ],
        };
      } else {
        query = { $and: [activeOnly, geoClause, { country: qCountry }] };
      }
    } else {
      query = { $and: [activeOnly, geoClause] };
    }

    const firms = await Firma.find(query)
      .select("-__v")
      .sort({ is_boosted: -1, createdAt: -1 })
      .lean();

    const normalized = await appendReviewSummariesToFirms(firms.map(f => {
      const safePhotos = Array.isArray(f.photos) ? f.photos : [];
      const visiblePhotos = f.plan === "premium"
        ? safePhotos.slice(0, planPhotoLimit.premium)
        : safePhotos.slice(0, planPhotoLimit.free);

      return {
        ...f,
        photos: visiblePhotos
      };
    }));

    return res.json(normalized);
  } catch (err) {
    errorWithTime("FIRMS NEAR ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

app.get("/firms/:id", async (req, res) => {
  try {
    const firmId = String(req.params.id || "").trim();

    if (!isValidObjectId(mongoose, firmId)) {
      return sendError(res, 400, "INVALID_FIELDS");
    }

    const firm = await Firma.findOne({
      $or: [
        { _id: firmId },
        { owner_user_id: firmId }
      ]
    })
      .select("-__v")
      .lean();

    if (!firm || !isRealFirmRecord(firm) || !isFirmVisibleStatus(firm.payment_status)) {
      return sendError(res, 404, "FIRM_NOT_FOUND");
    }

    const safePhotos = Array.isArray(firm.photos) ? firm.photos : [];
    const visiblePhotos = firm.plan === "premium"
      ? safePhotos.slice(0, planPhotoLimit.premium)
      : safePhotos.slice(0, planPhotoLimit.free);

    const reviews = await Review.find({ firm_id: firm._id })
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    const avg = reviews.length
      ? reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviews.length
      : 0;

    const publicFirm = {
      _id: firm._id,
      name: firm.name,
      address: firm.address,
      city: firm.city,
      description: firm.description || "",
      categories: Array.isArray(firm.categories) ? firm.categories : undefined,
      category: firm.category,
      country: firm.country,
      plan: firm.plan || "free",
      payment_status: firm.payment_status,
      logoUrl: firm.logoUrl || "",
      photos: visiblePhotos,
      createdAt: firm.createdAt,
      updatedAt: firm.updatedAt
    };

    return res.json({
      success: true,
      firm: publicFirm,
      reviews,
      averageRating: Math.round(avg * 10) / 10,
      reviewCount: reviews.length
    });
  } catch (err) {
    errorWithTime("PUBLIC FIRM DETAIL ERROR:", err);
    return sendError(res, 500, "SERVER_ERROR");
  }
});

/* ================= TRIAL NOTIFICATIONS ================= */
async function runTrialNotifications() {
  if (!resend) {
    log("[warn] TrialNotifications skipped: Resend not configured");
    return;
  }

  const nowD = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  const w7_from = new Date(nowD.getTime() + (6.5 * dayMs));
  const w7_to = new Date(nowD.getTime() + (7.5 * dayMs));

  const w1_from = new Date(nowD.getTime() + (0.5 * dayMs));
  const w1_to = new Date(nowD.getTime() + (1.5 * dayMs));

  const notSent7 = { $or: [{ trial_reminder_7d_sent_at: { $exists: false } }, { trial_reminder_7d_sent_at: null }] };
  const notSent1 = { $or: [{ trial_reminder_1d_sent_at: { $exists: false } }, { trial_reminder_1d_sent_at: null }] };

  const list7 = await Firma.find({
    payment_status: "trial",
    trial_ends_at: { $gte: w7_from, $lte: w7_to },
    ...notSent7,
  }).select("_id email name trial_ends_at").lean();

  log("[mail] TrialNotifications 7d candidates:", list7.length);

  for (const f of list7) {
    try {
      await sendMail({
        to: f.email,
        subject: "EasyFix - Trial po mbaron (7 dite)",
        text:
          `Trial-i yt po mbaron me ${new Date(f.trial_ends_at).toLocaleString("sq-AL")}. ` +
          `Nese do me vazhdu me u shfaq ne EasyFix, shko te: ${FRONTEND_BASE_URL}/pay.html`,
        html: `
          <div style="font-family:Arial;line-height:1.5">
            <h2>Trial po mbaron</h2>
            <p>Trial-i yt mbaron me <b>${new Date(f.trial_ends_at).toLocaleString("sq-AL")}</b>.</p>
            <p>Nese do me vazhdu me u shfaq ne EasyFix, duhet me pagu.</p>
            <p><a href="${FRONTEND_BASE_URL}/pay.html">Pay now</a></p>
          </div>`,
      });

      await Firma.updateOne(
        { _id: f._id },
        { $set: { trial_reminder_7d_sent_at: new Date() } }
      );
      log("[ok] Sent 7d reminder:", f.email);
    } catch (e) {
      errorWithTime("TRIAL 7D EMAIL ERROR:", f.email, e);
    }
  }

  const list1 = await Firma.find({
    payment_status: "trial",
    trial_ends_at: { $gte: w1_from, $lte: w1_to },
    ...notSent1,
  }).select("_id email name trial_ends_at").lean();

  log("[mail] TrialNotifications 1d candidates:", list1.length);

  for (const f of list1) {
    try {
      await sendMail({
        to: f.email,
        subject: "EasyFix - Trial po mbaron neser",
        text:
          `Trial-i yt mbaron nesër (${new Date(f.trial_ends_at).toLocaleString("sq-AL")}). ` +
          `Nese do me vazhdu me u shfaq, shko te: ${FRONTEND_BASE_URL}/pay.html`,
        html: `
          <div style="font-family:Arial;line-height:1.5">
            <h2>Trial po mbaron neser</h2>
            <p>Mbaron me <b>${new Date(f.trial_ends_at).toLocaleString("sq-AL")}</b>.</p>
            <p><a href="${FRONTEND_BASE_URL}/pay.html">Pay now</a></p>
          </div>`,
      });

      await Firma.updateOne(
        { _id: f._id },
        { $set: { trial_reminder_1d_sent_at: new Date() } }
      );
      log("[ok] Sent 1d reminder:", f.email);
    } catch (e) {
      errorWithTime("TRIAL 1D EMAIL ERROR:", f.email, e);
    }
  }
}

/* ================= PAID NOTIFICATIONS ================= */
async function runPaidNotifications() {
  if (!resend) {
    log("[warn] PaidNotifications skipped: Resend not configured");
    return;
  }

  const nowD = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  const w7_from = new Date(nowD.getTime() + (6.5 * dayMs));
  const w7_to = new Date(nowD.getTime() + (7.5 * dayMs));

  const w1_from = new Date(nowD.getTime() + (0.5 * dayMs));
  const w1_to = new Date(nowD.getTime() + (1.5 * dayMs));

  const notSent7 = { $or: [{ paid_reminder_7d_sent_at: { $exists: false } }, { paid_reminder_7d_sent_at: null }] };
  const notSent1 = { $or: [{ paid_reminder_1d_sent_at: { $exists: false } }, { paid_reminder_1d_sent_at: null }] };

  const list7 = await Firma.find({
    payment_status: "active",
    plan: "premium",
    expires_at: { $gte: w7_from, $lte: w7_to },
    ...notSent7,
  }).select("_id email name expires_at").lean();

  log("[mail] PaidNotifications 7d candidates:", list7.length);

  for (const f of list7) {
    try {
      await sendMail({
        to: f.email,
        subject: "EasyFix - Abonimi po skadon (7 dite)",
        text:
          `Abonimi yt po skadon me ${new Date(f.expires_at).toLocaleString("sq-AL")}. ` +
          `Per me vazhdu me u shfaq ne EasyFix: ${FRONTEND_BASE_URL}/pay.html`,
        html: `
          <div style="font-family:Arial;line-height:1.5">
            <h2>Abonimi po skadon</h2>
            <p>Abonimi yt skadon me <b>${new Date(f.expires_at).toLocaleString("sq-AL")}</b>.</p>
            <p>Per me vazhdu me u shfaq ne EasyFix:</p>
            <p><a href="${FRONTEND_BASE_URL}/pay.html">Pay now</a></p>
          </div>`,
      });

      await Firma.updateOne(
        { _id: f._id },
        { $set: { paid_reminder_7d_sent_at: new Date() } }
      );
      log("[ok] Sent paid 7d reminder:", f.email);
    } catch (e) {
      errorWithTime("PAID 7D EMAIL ERROR:", f.email, e);
    }
  }

  const list1 = await Firma.find({
    payment_status: "active",
    plan: "premium",
    expires_at: { $gte: w1_from, $lte: w1_to },
    ...notSent1,
  }).select("_id email name expires_at").lean();

  log("[mail] PaidNotifications 1d candidates:", list1.length);

  for (const f of list1) {
    try {
      await sendMail({
        to: f.email,
        subject: "EasyFix - Abonimi po skadon neser",
        text:
          `Abonimi yt po skadon nesër (${new Date(f.expires_at).toLocaleString("sq-AL")}). ` +
          `Per me vazhdu me u shfaq ne EasyFix: ${FRONTEND_BASE_URL}/pay.html`,
        html: `
          <div style="font-family:Arial;line-height:1.5">
            <h2>Abonimi po skadon neser</h2>
            <p>Skadon me <b>${new Date(f.expires_at).toLocaleString("sq-AL")}</b>.</p>
            <p><a href="${FRONTEND_BASE_URL}/pay.html">Pay now</a></p>
          </div>`,
      });

      await Firma.updateOne(
        { _id: f._id },
        { $set: { paid_reminder_1d_sent_at: new Date() } }
      );
      log("[ok] Sent paid 1d reminder:", f.email);
    } catch (e) {
      errorWithTime("PAID 1D EMAIL ERROR:", f.email, e);
    }
  }
}

async function runCleanup() {
  return runCleanupMaintenance({
    Firma,
    stubDeleteAfterHours: STUB_DELETE_AFTER_HOURS,
    log
  });
}

/* ================= MONGO + START ================= */
async function connectMongo() {
  if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI");

  await mongoose.connect(process.env.MONGO_URI, {
    autoIndex: true,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  log("[ok] MongoDB Connected");
}

async function start() {
  try {
    await connectMongo();

    await Firma.findOne({}).select("_id").lean();

    try {
      await runCleanup();
      log("[ok] Initial scheduler run completed");
    } catch (e) {
      errorWithTime("Initial scheduler error:", e);
    }

    setInterval(async () => {
      try {
        await runCleanup();
      } catch (e) {
        errorWithTime("Cleanup scheduler error:", e);
      }
    }, CHECK_INTERVAL_MINUTES * 60 * 1000);

    app.listen(PORT, () => log(`[ok] Server running on port ${PORT}`));
  } catch (err) {
    errorWithTime("[fatal] Failed to start server:", err);
    process.exit(1);
  }
}

start();
