// server.js (FINAL - 4 months free trial + reminder emails + paid reminder/expired emails + pay-now flow + delete after 180 days + EMAIL OTP VERIFY + GEO FIX + DATA DELETION FIX)
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { Resend } from "resend";

dotenv.config();

const app = express();

/* ================= CORS ================= */
app.use(cors());

/* ================= resend email ================= */
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const RESEND_FROM = String(process.env.RESEND_FROM || "").trim();
const RESEND_REPLY_TO = String(process.env.RESEND_REPLY_TO || "").trim();
const FRONTEND_BASE_URL = String(process.env.FRONTEND_BASE_URL || "https://easyfix.services").replace(/\/+$/, "");

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

const VARIANT_BASIC = String(process.env.VARIANT_BASIC || "");
const VARIANT_STANDARD = String(process.env.VARIANT_STANDARD || "");
const VARIANT_PREMIUM = String(process.env.VARIANT_PREMIUM || "");

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

/* ===== DATA DELETION CONFIG (NEW) ===== */
const DELETE_TOKEN_HOURS = Number(process.env.DELETE_TOKEN_HOURS || 24);

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
function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

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
  return String(Math.floor(100000 + Math.random() * 900000));
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

/* ================= SCHEMA ================= */
const firmaSchema = new mongoose.Schema(
  {
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
    category: String,

    country: { type: String, default: DEFAULT_COUNTRY, index: true },

    // IMPORTANT FIX:
    // - NO default "Point"
    // - location should NOT exist on stub documents
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: undefined,
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: undefined,
      },
    },

    plan: { type: String, default: "basic" },
    payment_status: { type: String, default: "pending", index: true },

    logoUrl: String,
    photos: [String],

    paid_at: Date,
    expires_at: Date,
    deleted_at: Date,
  },
  { timestamps: true }
);

// Index për /firms dhe admin filters
firmaSchema.index({ payment_status: 1, country: 1, plan: 1, createdAt: -1 });

// Partial 2dsphere index - only index docs that have valid coordinates
firmaSchema.index(
  { location: "2dsphere", payment_status: 1, country: 1 },
  { partialFilterExpression: { "location.coordinates": { $type: "array" } } }
);

const Firma = mongoose.model("Firma", firmaSchema);

/* ================= PLAN RULES ================= */
const planPhotoLimit = { basic: 0, standard: 3, premium: 8 };

function detectPlanFromVariant(variantId) {
  const v = String(variantId || "");
  if (v && v === VARIANT_BASIC) return "basic";
  if (v && v === VARIANT_STANDARD) return "standard";
  if (v && v === VARIANT_PREMIUM) return "premium";
  return null;
}

function planToVariant(plan) {
  if (plan === "premium") return VARIANT_PREMIUM;
  if (plan === "standard") return VARIANT_STANDARD;
  return VARIANT_BASIC;
}

/* ================= ADMIN AUTH ================= */
const ADMIN_KEY = String(process.env.ADMIN_KEY || "").trim();

function requireAdmin(req, res, next) {
  try {
    if (!ADMIN_KEY) {
      return res.status(500).json({ success: false, error: "ADMIN_KEY is not configured on server" });
    }
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || token !== ADMIN_KEY) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    next();
  } catch {
    return res.status(500).json({ success: false, error: "Admin auth error" });
  }
}

/* ================= ADMIN: STATS ================= */
app.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    const total = await Firma.countDocuments({});
    const pending = await Firma.countDocuments({ payment_status: "pending" });
    const paid = await Firma.countDocuments({ payment_status: "paid" });
    const expired = await Firma.countDocuments({ payment_status: "expired" });
    const trial = await Firma.countDocuments({ payment_status: "trial" });

    return res.json({
      success: true,
      stats: { total, pending, paid, expired, trial },
    });
  } catch (err) {
    errorWithTime("ADMIN STATS ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= ADMIN: DELETE FIRM ================= */
app.delete("/admin/firms/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ success: false, error: "Missing id" });

    const deleted = await Firma.findByIdAndDelete(id).lean();
    if (!deleted) return res.status(404).json({ success: false, error: "Not found" });

    return res.json({ success: true });
  } catch (err) {
    errorWithTime("ADMIN DELETE ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= ADMIN: EXPIRE ================= */
app.post("/admin/firms/:id/expire", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ success: false, error: "Missing id" });

    const nowD = new Date();

    const updated = await Firma.findByIdAndUpdate(
      id,
      { $set: { payment_status: "expired", expires_at: nowD } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ success: false, error: "Not found" });

    return res.json({ success: true, firm: updated });
  } catch (err) {
    errorWithTime("ADMIN EXPIRE ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= ADMIN: MARK PAID ================= */
app.post("/admin/firms/:id/mark-paid", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ success: false, error: "Missing id" });

    const daysRaw = req.body?.days;
    let days = Number(daysRaw);
    if (!Number.isFinite(days) || days <= 0) days = 30;
    days = Math.min(3650, Math.max(1, Math.floor(days)));

    const nowD = new Date();
    const expires = new Date(nowD.getTime() + days * 24 * 60 * 60 * 1000);

    const updated = await Firma.findByIdAndUpdate(
      id,
      {
        $set: {
          payment_status: "paid",
          paid_at: nowD,
          expires_at: expires,
          deleted_at: null,

          paid_reminder_7d_sent_at: null,
          paid_reminder_1d_sent_at: null,
          paid_expired_email_sent_at: null,
        },
      },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ success: false, error: "Not found" });

    return res.json({ success: true, firm: updated });
  } catch (err) {
    errorWithTime("ADMIN MARK-PAID ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= ADMIN: TEST EMAIL ================= */
app.post("/admin/test-email", requireAdmin, async (req, res) => {
  try {
    const to = normalizeEmail(req.body?.to);
    if (!to) return res.status(400).json({ success: false, error: "Missing to" });
    await sendMail({
      to,
      subject: "EasyFix - Test Email",
      text: "Ky është test email nga EasyFix (Resend).",
      html: "<p>Ky është <b>test email</b> nga EasyFix (Resend).</p>",
    });
    return res.json({ success: true });
  } catch (err) {
    errorWithTime("ADMIN TEST EMAIL ERROR:", err);
    return res.status(500).json({ success: false, error: String(err?.message || err) });
  }
});

/* ================= ADMIN: RUN SCHEDULER NOW ================= */
app.post("/admin/run-scheduler", requireAdmin, async (req, res) => {
  try {
    await runTrialNotifications();
    await runPaidNotifications();
    await runCleanup();
    return res.json({ success: true });
  } catch (err) {
    errorWithTime("ADMIN RUN SCHEDULER ERROR:", err);
    return res.status(500).json({ success: false, error: String(err?.message || err) });
  }
});

/* ================= ADMIN: LIST FIRMS ================= */
app.get("/admin/firms", requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "all").toLowerCase();
    const plan = String(req.query.plan || "all").toLowerCase();
    const country = String(req.query.country || "all").toUpperCase();
    const search = String(req.query.search || "").trim().toLowerCase();

    const q = {};
    if (status !== "all") q.payment_status = status;
    if (plan !== "all") q.plan = plan;
    if (country !== "ALL") q.country = country;

    let firms = await Firma.find(q).select("-__v").sort({ createdAt: -1 }).lean();

    if (search) {
      firms = firms.filter(f => {
        const hay = [
          f.name, f.email, f.phone, f.category, f.address, f.city,
          f.country
        ].map(x => String(x || "").toLowerCase()).join(" | ");
        return hay.includes(search);
      });
    }

    return res.json({ success: true, firms });
  } catch (err) {
    errorWithTime("ADMIN FIRMS ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= ADMIN: UPDATE FIRM ================= */
app.put("/admin/firms/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ success: false, error: "Missing id" });

    const patch = {};
    const allow = ["name", "phone", "address", "city", "category", "plan", "country", "payment_status", "expires_at", "trial_ends_at"];
    for (const k of allow) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }

    if (patch.phone !== undefined) {
      const phoneNorm = normalizePhone(patch.phone);
      if (!phoneNorm) return res.status(400).json({ success: false, error: "Invalid phone" });
      patch.phone = phoneNorm;
    }

    if (patch.plan !== undefined) {
      const p = String(patch.plan || "").toLowerCase();
      if (!["basic", "standard", "premium"].includes(p)) {
        return res.status(400).json({ success: false, error: "Invalid plan" });
      }
      patch.plan = p;
    }

    if (patch.payment_status !== undefined) {
      const s = String(patch.payment_status || "").toLowerCase();
      if (!["pending", "paid", "expired", "trial"].includes(s)) {
        return res.status(400).json({ success: false, error: "Invalid payment_status" });
      }
      patch.payment_status = s;
    }

    if (patch.country !== undefined) {
      patch.country = normalizeCountry(patch.country);
    }

    const updated = await Firma.findByIdAndUpdate(id, { $set: patch }, { new: true }).select("-__v").lean();
    if (!updated) return res.status(404).json({ success: false, error: "Not found" });

    return res.json({ success: true, firm: updated });
  } catch (err) {
    errorWithTime("ADMIN UPDATE ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
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
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    let signature = req.headers["x-signature"] || req.headers["x-signature-256"] || "";
    signature = String(signature || "").trim();

    const hmac = crypto
      .createHmac("sha256", LEMON_WEBHOOK_SECRET)
      .update(req.body)
      .digest("hex");

    if (signature.startsWith("sha256=")) signature = signature.slice(7);

    if (!signature || signature !== hmac) {
      log("❌ Invalid signature", { received: signature, computed: hmac });
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(req.body.toString());
    const event = payload?.meta?.event_name || payload?.event || "unknown";

    const emailRaw =
      payload?.data?.attributes?.checkout_data?.custom?.email ||
      payload?.data?.attributes?.checkout_data?.email ||
      payload?.data?.attributes?.user_email ||
      payload?.data?.attributes?.customer_email ||
      null;

    const email = normalizeEmail(emailRaw);

    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id ||
      payload?.data?.attributes?.subscription?.variant_id ||
      null;

    const firmIdRaw =
      payload?.meta?.custom_data?.firmId ||
      payload?.data?.attributes?.checkout_data?.custom?.firmId ||
      payload?.data?.attributes?.checkout_data?.custom?.firm_id ||
      null;

    const firmId = firmIdRaw ? String(firmIdRaw) : null;
    const detectedPlan = detectPlanFromVariant(variantId);

    log("🔔 Webhook", { event, email, variantId, detectedPlan, firmId });

    if (!email && !firmId) return res.status(200).send("No identifier");

    if (event === "order_paid" || event === "subscription_payment_success") {
      const update = {
        payment_status: "paid",
        paid_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        deleted_at: null,
        paid_reminder_7d_sent_at: null,
        paid_reminder_1d_sent_at: null,
        paid_expired_email_sent_at: null,
      };
      if (detectedPlan) update.plan = detectedPlan;

      let updated = null;
      if (firmId) {
        updated = await Firma.findByIdAndUpdate(firmId, { $set: update }, { new: true });
      } else if (email) {
        updated = await Firma.findOneAndUpdate({ email }, { $set: update }, { upsert: false, new: true });
      }

      if (!updated) log("⚠️ Paid webhook but firm not found", { firmId, email });
      else log("✅ Marked paid:", { id: updated._id, email: updated.email, plan: updated.plan });

      return res.status(200).send("OK");
    }

    if (event === "subscription_cancelled" || event === "subscription_expired" || event === "order_refunded") {
      if (firmId) {
        await Firma.findByIdAndUpdate(firmId, { $set: { payment_status: "expired", expires_at: new Date() } });
      } else if (email) {
        await Firma.findOneAndUpdate({ email }, { $set: { payment_status: "expired", expires_at: new Date() } });
      }
      return res.status(200).send("OK");
    }

    return res.status(200).send("Ignored");
  } catch (err) {
    errorWithTime("WEBHOOK ERROR:", err);
    return res.status(500).send("Webhook error");
  }
});

/* ================= JSON (AFTER WEBHOOK) ================= */
app.use(express.json());

/* ================= DATA DELETION (FIX) ================= */
// POST /delete-request { email, reason? }
app.post("/delete-request", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const reason = String(req.body?.reason || "").trim().slice(0, 500);

    if (!email) return res.status(400).json({ success: false, error: "Missing email" });
    if (!resend) return res.status(500).json({ success: false, error: "Email service not configured" });

    const firm = await Firma.findOne({ email }).select("_id email").lean();

    // privacy: always success even if not found
    if (!firm) {
      return res.json({ success: true, message: "If the email exists, we sent a confirmation link." });
    }

    const token = makeToken();
    const tokenHash = sha256Hex(token);
    const expires = new Date(Date.now() + DELETE_TOKEN_HOURS * 60 * 60 * 1000);

    await Firma.updateOne(
      { _id: firm._id },
      { $set: { delete_token_hash: tokenHash, delete_token_expires: expires } }
    );

    // IMPORTANT: your delete-confirm.html expects email+token in URL
    const confirmUrl =
      `${FRONTEND_BASE_URL}/delete-confirm.html?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

    await sendMail({
      to: email,
      subject: "EasyFix - Confirm data deletion",
      text:
        `Për me konfirmu fshirjen e listing-ut, kliko linkun:\n${confirmUrl}\n\n` +
        `Ky link skadon për ${DELETE_TOKEN_HOURS} orë.\n` +
        (reason ? `Arsyeja: ${reason}\n` : ""),
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>EasyFix</h2>
          <p>Për me konfirmu fshirjen e listing-ut, kliko:</p>
          <p><a href="${confirmUrl}">${confirmUrl}</a></p>
          <p style="color:#666">Ky link skadon për ${DELETE_TOKEN_HOURS} orë.</p>
          ${reason ? `<p><b>Arsyeja:</b> ${reason}</p>` : ""}
        </div>
      `,
    });

    return res.json({ success: true, message: "If the email exists, we sent a confirmation link." });
  } catch (err) {
    errorWithTime("DELETE REQUEST ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// POST /delete-confirm { email, token }
app.post("/delete-confirm", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const token = String(req.body?.token || "").trim();

    if (!email || !token) return res.status(400).json({ success: false, error: "Missing email/token" });

    const tokenHash = sha256Hex(token);

    const firm = await Firma.findOne({
      email,
      delete_token_hash: tokenHash,
      delete_token_expires: { $gt: new Date() },
    }).select("_id").lean();

    if (!firm) return res.status(400).json({ success: false, error: "Invalid or expired link" });

    const nowD = new Date();

    // soft delete
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

    return res.json({ success: true });
  } catch (err) {
    errorWithTime("DELETE CONFIRM ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= EMAIL OTP VERIFY ================= */
app.post("/auth/email/start", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ success: false, error: "Missing email" });
    if (!resend) return res.status(500).json({ success: false, error: "Email service not configured" });

    const existing = await Firma.findOne({ email })
      .select("_id email name email_verified email_otp_last_sent_at payment_status")
      .lean();

    if (existing?.name) {
      return res.status(409).json({ success: false, error: "Ky email tashmë ekziston" });
    }

    if (existing?.email_otp_last_sent_at && !canResendOtp(existing.email_otp_last_sent_at, EMAIL_OTP_MIN_SECONDS)) {
      return res.status(429).json({ success: false, error: `Try again in ${EMAIL_OTP_MIN_SECONDS} seconds` });
    }

    const otp = makeOtp6();
    const otpHash = sha256Hex(otp);
    const expires = new Date(Date.now() + EMAIL_OTP_EXPIRES_MINUTES * 60 * 1000);

    if (!existing) {
      await Firma.create({
        email,
        plan: "basic",
        payment_status: "pending",
        email_verified: false,
        email_otp_hash: otpHash,
        email_otp_expires: expires,
        email_otp_attempts: 0,
        email_otp_last_sent_at: new Date(),
      });
    } else {
      await Firma.updateOne(
        { _id: existing._id },
        {
          $set: {
            email_verified: false,
            email_verified_at: null,
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
      text: `Kodi yt i verifikimit është: ${otp} (skadon për ${EMAIL_OTP_EXPIRES_MINUTES} minuta).`,
      html: `
        <div style="font-family:Arial;line-height:1.6">
          <h2>EasyFix</h2>
          <p>Kodi yt i verifikimit është:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:2px">${otp}</p>
          <p style="color:#666">Skadon për ${EMAIL_OTP_EXPIRES_MINUTES} minuta.</p>
        </div>
      `,
    });

    return res.json({ success: true });
  } catch (err) {
    errorWithTime("EMAIL START ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/auth/email/verify", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();

    if (!email || !code) return res.status(400).json({ success: false, error: "Missing email/code" });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ success: false, error: "Invalid code" });

    const firm = await Firma.findOne({ email })
      .select("_id email name email_verified email_otp_hash email_otp_expires email_otp_attempts")
      .lean();

    if (!firm) return res.status(400).json({ success: false, error: "Invalid code" });
    if (firm?.name) return res.status(409).json({ success: false, error: "Ky email tashmë ekziston" });

    if (!firm.email_otp_hash || !firm.email_otp_expires) {
      return res.status(400).json({ success: false, error: "No active code" });
    }

    if (new Date(firm.email_otp_expires).getTime() <= Date.now()) {
      return res.status(400).json({ success: false, error: "Code expired" });
    }

    const attempts = Number(firm.email_otp_attempts || 0);
    if (attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ success: false, error: "Too many attempts. Request a new code." });
    }

    const ok = sha256Hex(code) === firm.email_otp_hash;

    if (!ok) {
      await Firma.updateOne({ _id: firm._id }, { $set: { email_otp_attempts: attempts + 1 } });
      return res.status(400).json({ success: false, error: "Invalid code" });
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
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= PAY NOW (MAGIC LINK) ================= */
app.post("/pay-now/request", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ success: false, error: "Missing email" });

    const firm = await Firma.findOne({ email }).select("_id email").lean();

    if (!firm) return res.json({ success: true, message: "If the email exists, we sent a link." });
    if (!resend) return res.status(500).json({ success: false, error: "Email service not configured" });

    const token = makeToken();
    const tokenHash = sha256Hex(token);
    const expires = new Date(Date.now() + PAY_TOKEN_MINUTES * 60 * 1000);

    await Firma.updateOne(
      { _id: firm._id },
      { $set: { pay_token_hash: tokenHash, pay_token_expires: expires } }
    );

    const payUrl = `${FRONTEND_BASE_URL}/pay.html?token=${encodeURIComponent(token)}`;

    await sendMail({
      to: email,
      subject: "EasyFix - Pay now link",
      text: `Për me vazhdu me u shfaq në EasyFix, përdor këtë link: ${payUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5">
          <h2>EasyFix - Pay now</h2>
          <p>Për me vazhdu me u shfaq në EasyFix, kliko linkun:</p>
          <p><a href="${payUrl}">${payUrl}</a></p>
          <p style="color:#666">Ky link skadon për ${PAY_TOKEN_MINUTES} minuta.</p>
        </div>
      `,
    });

    return res.json({ success: true, message: "If the email exists, we sent a link." });
  } catch (err) {
    errorWithTime("PAY-NOW REQUEST ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

app.get("/pay-now/checkout", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    const plan = String(req.query.plan || "").trim().toLowerCase();

    if (!token) return res.status(400).json({ success: false, error: "Missing token" });
    if (!["basic", "standard", "premium"].includes(plan)) {
      return res.status(400).json({ success: false, error: "Invalid plan" });
    }

    const tokenHash = sha256Hex(token);

    const firm = await Firma.findOne({
      pay_token_hash: tokenHash,
      pay_token_expires: { $gt: new Date() },
    }).lean();

    if (!firm) return res.status(400).json({ success: false, error: "Invalid or expired link" });

    await Firma.updateOne(
      { _id: firm._id },
      {
        $set: { payment_status: "pending", plan },
        $unset: { pay_token_hash: "", pay_token_expires: "" },
      }
    );

    const variantId = planToVariant(plan);
    const checkoutUrl = await createLemonCheckout({
      variantId,
      email: firm.email,
      firmId: String(firm._id),
    });

    return res.json({ success: true, checkoutUrl });
  } catch (err) {
    errorWithTime("PAY-NOW CHECKOUT ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= TRIAL NOTIFICATIONS ================= */
async function runTrialNotifications() {
  if (!resend) {
    log("⚠️ TrialNotifications skipped: Resend not configured");
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

  log("📨 TrialNotifications 7d candidates:", list7.length);

  for (const f of list7) {
    try {
      await sendMail({
        to: f.email,
        subject: "EasyFix - Trial po mbaron (7 ditë)",
        text:
          `Trial-i yt po mbaron më ${new Date(f.trial_ends_at).toLocaleString("sq-AL")}. ` +
          `Nëse do me vazhdu me u shfaq në EasyFix, shko te: ${FRONTEND_BASE_URL}/pay.html`,
        html: `
          <div style="font-family:Arial;line-height:1.5">
            <h2>Trial po mbaron</h2>
            <p>Trial-i yt mbaron më <b>${new Date(f.trial_ends_at).toLocaleString("sq-AL")}</b>.</p>
            <p>Nëse do me vazhdu me u shfaq në EasyFix, duhet me pagu.</p>
            <p><a href="${FRONTEND_BASE_URL}/pay.html">Pay now</a></p>
          </div>`,
      });

      await Firma.updateOne(
        { _id: f._id },
        { $set: { trial_reminder_7d_sent_at: new Date() } }
      );
      log("✅ Sent 7d reminder:", f.email);
    } catch (e) {
      errorWithTime("TRIAL 7D EMAIL ERROR:", f.email, e);
    }
  }

  const list1 = await Firma.find({
    payment_status: "trial",
    trial_ends_at: { $gte: w1_from, $lte: w1_to },
    ...notSent1,
  }).select("_id email name trial_ends_at").lean();

  log("📨 TrialNotifications 1d candidates:", list1.length);

  for (const f of list1) {
    try {
      await sendMail({
        to: f.email,
        subject: "EasyFix - Trial po mbaron nesër",
        text:
          `Trial-i yt mbaron nesër (${new Date(f.trial_ends_at).toLocaleString("sq-AL")}). ` +
          `Nëse do me vazhdu me u shfaq, shko te: ${FRONTEND_BASE_URL}/pay.html`,
        html: `
          <div style="font-family:Arial;line-height:1.5">
            <h2>Trial po mbaron nesër</h2>
            <p>Mbaron më <b>${new Date(f.trial_ends_at).toLocaleString("sq-AL")}</b>.</p>
            <p><a href="${FRONTEND_BASE_URL}/pay.html">Pay now</a></p>
          </div>`,
      });

      await Firma.updateOne(
        { _id: f._id },
        { $set: { trial_reminder_1d_sent_at: new Date() } }
      );
      log("✅ Sent 1d reminder:", f.email);
    } catch (e) {
      errorWithTime("TRIAL 1D EMAIL ERROR:", f.email, e);
    }
  }
}

/* ================= PAID NOTIFICATIONS ================= */
async function runPaidNotifications() {
  if (!resend) {
    log("⚠️ PaidNotifications skipped: Resend not configured");
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
    payment_status: "paid",
    expires_at: { $gte: w7_from, $lte: w7_to },
    ...notSent7,
  }).select("_id email name expires_at").lean();

  log("📨 PaidNotifications 7d candidates:", list7.length);

  for (const f of list7) {
    try {
      await sendMail({
        to: f.email,
        subject: "EasyFix - Abonimi po skadon (7 ditë)",
        text:
          `Abonimi yt po skadon më ${new Date(f.expires_at).toLocaleString("sq-AL")}. ` +
          `Për me vazhdu me u shfaq në EasyFix: ${FRONTEND_BASE_URL}/pay.html`,
        html: `
          <div style="font-family:Arial;line-height:1.5">
            <h2>Abonimi po skadon</h2>
            <p>Abonimi yt skadon më <b>${new Date(f.expires_at).toLocaleString("sq-AL")}</b>.</p>
            <p>Për me vazhdu me u shfaq në EasyFix:</p>
            <p><a href="${FRONTEND_BASE_URL}/pay.html">Pay now</a></p>
          </div>`,
      });

      await Firma.updateOne(
        { _id: f._id },
        { $set: { paid_reminder_7d_sent_at: new Date() } }
      );
      log("✅ Sent paid 7d reminder:", f.email);
    } catch (e) {
      errorWithTime("PAID 7D EMAIL ERROR:", f.email, e);
    }
  }

  const list1 = await Firma.find({
    payment_status: "paid",
    expires_at: { $gte: w1_from, $lte: w1_to },
    ...notSent1,
  }).select("_id email name expires_at").lean();

  log("📨 PaidNotifications 1d candidates:", list1.length);

  for (const f of list1) {
    try {
      await sendMail({
        to: f.email,
        subject: "EasyFix - Abonimi po skadon nesër",
        text:
          `Abonimi yt po skadon nesër (${new Date(f.expires_at).toLocaleString("sq-AL")}). ` +
          `Për me vazhdu me u shfaq në EasyFix: ${FRONTEND_BASE_URL}/pay.html`,
        html: `
          <div style="font-family:Arial;line-height:1.5">
            <h2>Abonimi po skadon nesër</h2>
            <p>Skadon më <b>${new Date(f.expires_at).toLocaleString("sq-AL")}</b>.</p>
            <p><a href="${FRONTEND_BASE_URL}/pay.html">Pay now</a></p>
          </div>`,
      });

      await Firma.updateOne(
        { _id: f._id },
        { $set: { paid_reminder_1d_sent_at: new Date() } }
      );
      log("✅ Sent paid 1d reminder:", f.email);
    } catch (e) {
      errorWithTime("PAID 1D EMAIL ERROR:", f.email, e);
    }
  }
}

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
app.post(
  "/register",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      let { name, email, phone, address, city, category, plan, country } = req.body;

      email = normalizeEmail(email);
      const phoneNorm = normalizePhone(phone);
      const countryNorm = normalizeCountry(country);
      const cityNorm = String(city || "").trim();

      if (!name || !email || !phoneNorm || !address || !cityNorm || !category || !plan) {
        return res.status(400).json({ success: false, error: "Missing fields" });
      }
      if (!["basic", "standard", "premium"].includes(plan)) {
        return res.status(400).json({ success: false, error: "Invalid plan" });
      }

      const stub = await Firma.findOne({ email })
        .select("_id name email_verified")
        .lean();

      if (!stub) {
        return res.status(403).json({ success: false, error: "Email not verified" });
      }
      if (stub?.name) {
        return res.status(409).json({ success: false, error: "Ky email tashmë ekziston" });
      }
      if (!stub.email_verified) {
        return res.status(403).json({ success: false, error: "Email not verified" });
      }

      const geo = await geocodeNominatim({
        address: String(address || "").trim(),
        city: cityNorm,
        countryIso2: countryNorm
      });

      if (!geo) {
        return res.status(400).json({
          success: false,
          error: "Nuk u gjet lokacioni për këtë adresë/qytet. Ju lutem shkruani adresë më të saktë."
        });
      }

      let logoUrl = null;
      let photos = [];

      if (plan === "standard" || plan === "premium") {
        const files = req.files || {};
        if (files.logo?.[0]) {
          logoUrl = await uploadBufferToCloudinary(files.logo[0].buffer, "easyfix/logos");
        }

        const maxPhotos = planPhotoLimit[plan] || 0;
        const picked = (files.photos || []).slice(0, maxPhotos);

        for (const f of picked) {
          const url = await uploadBufferToCloudinary(f.buffer, "easyfix/photos");
          photos.push(url);
        }
      }

      if (plan === "basic") {
        logoUrl = null;
        photos = [];
      }

      const nowD = new Date();
      const trialEnds = new Date(nowD);
      trialEnds.setMonth(trialEnds.getMonth() + 4);

      const firma = await Firma.findOneAndUpdate(
        { email },
        {
          $set: {
            name,
            phone: phoneNorm,
            phone_verified: false,
            phone_verified_at: null,
            address,
            city: cityNorm,
            category,
            country: countryNorm,

            location: {
              type: "Point",
              coordinates: [geo.lng, geo.lat],
            },

            plan,
            payment_status: "trial",
            trial_started_at: nowD,
            trial_ends_at: trialEnds,
            expires_at: trialEnds,
            deleted_at: null,

            logoUrl,
            photos,

            trial_reminder_7d_sent_at: null,
            trial_reminder_1d_sent_at: null,
            trial_expired_email_sent_at: null,
          }
        },
        { new: true }
      );

      const successUrl = `${FRONTEND_SUCCESS_URL}?email=${encodeURIComponent(email)}&trial=1`;

      return res.json({
        success: true,
        message: "Regjistrimi u ruajt. Trial-i u aktivizua.",
        checkoutUrl: successUrl,
        firmId: String(firma?._id || ""),
      });
    } catch (err) {
      errorWithTime("REGISTER ERROR:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  }
);

/* ================= PUBLIC ================= */
app.get("/firms", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const qCountry = String(req.query.country || "").trim().toUpperCase();
    const nowD = new Date();

    const notDeleted = {
      $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
    };

    const paidOrActiveTrial = {
      $and: [
        notDeleted,
        {
          $or: [
            { payment_status: "paid" },
            { payment_status: "trial", trial_ends_at: { $gt: nowD } },
          ],
        }
      ],
    };

    if (/^[A-Z]{2}$/.test(qCountry)) {
      if (qCountry === "MK") {
        const firms = await Firma.find({
          $and: [
            paidOrActiveTrial,
            {
              $or: [
                { country: "MK" },
                { country: { $exists: false } },
                { country: null },
                { country: "" },
              ],
            },
          ],
        })
          .select("-__v")
          .sort({ createdAt: -1 })
          .lean();

        return res.json(firms);
      }

      const firms = await Firma.find({
        $and: [paidOrActiveTrial, { country: qCountry }],
      })
        .select("-__v")
        .sort({ createdAt: -1 })
        .lean();

      return res.json(firms);
    }

    const firms = await Firma.find(paidOrActiveTrial)
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(firms);
  } catch (err) {
    errorWithTime("FIRMS ERROR:", err);
    return res.status(500).send("Server error");
  }
});

/* ================= NEAR ME ================= */
app.get("/firms/near", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const qCountry = String(req.query.country || "").trim().toUpperCase();
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    let radiusKm = Number(req.query.radius_km || 25);
    if (!Number.isFinite(radiusKm)) radiusKm = 25;
    radiusKm = Math.max(1, Math.min(radiusKm, 200));
    const radiusM = radiusKm * 1000;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, error: "Missing lat/lng" });
    }

    const geoClause = {
      location: {
        $nearSphere: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: radiusM,
        },
      },
    };

    const nowD = new Date();

    const notDeleted = {
      $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
    };

    const basePaid = {
      $and: [
        notDeleted,
        {
          $or: [
            { payment_status: "paid" },
            { payment_status: "trial", trial_ends_at: { $gt: nowD } },
          ],
        }
      ],
    };

    let query = null;

    if (/^[A-Z]{2}$/.test(qCountry)) {
      if (qCountry === "MK") {
        query = {
          $and: [
            basePaid,
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
        query = { $and: [basePaid, geoClause, { country: qCountry }] };
      }
    } else {
      query = { $and: [basePaid, geoClause] };
    }

    const firms = await Firma.find(query)
      .select("-__v")
      .lean();

    return res.json(firms);
  } catch (err) {
    errorWithTime("FIRMS NEAR ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

app.get("/check-status", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    if (!email) return res.status(400).json({ success: false, error: "Missing email" });

    const f = await Firma.findOne({ email }).select("-__v").lean();
    if (!f) return res.status(404).json({ success: false, error: "Not found" });

    return res.json({ success: true, firma: f });
  } catch (err) {
    errorWithTime("CHECK-STATUS ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= CLEANUP ================= */
async function runCleanup() {
  const nowDate = new Date();

  const expiredTrials = await Firma.find({
    payment_status: "trial",
    trial_ends_at: { $lte: nowDate },
  }).select("_id email trial_expired_email_sent_at").lean();

  await Firma.updateMany(
    { payment_status: "trial", trial_ends_at: { $lte: nowDate } },
    { $set: { payment_status: "expired", expires_at: nowDate } }
  );

  if (resend) {
    for (const f of expiredTrials) {
      if (f.trial_expired_email_sent_at) continue;
      try {
        await sendMail({
          to: f.email,
          subject: "EasyFix - Trial mbaroi, lista u çaktivizua",
          text: `Trial-i yt mbaroi dhe lista u çaktivizua. Për me vazhdu me u shfaq: ${FRONTEND_BASE_URL}/pay.html`,
          html: `
            <div style="font-family:Arial;line-height:1.5">
              <h2>Lista u çaktivizua</h2>
              <p>Trial-i yt mbaroi dhe lista u çaktivizua.</p>
              <p>Për me u shfaq prap: <a href="${FRONTEND_BASE_URL}/pay.html">Pay now</a></p>
            </div>`,
        });

        await Firma.updateOne(
          { _id: f._id },
          { $set: { trial_expired_email_sent_at: new Date() } }
        );
        log("✅ Sent trial-expired email:", f.email);
      } catch (e) {
        errorWithTime("TRIAL EXPIRED EMAIL ERROR:", f.email, e);
      }
    }
  }

  const paidExpiredList = await Firma.find({
    payment_status: "paid",
    expires_at: { $lte: nowDate },
  }).select("_id email paid_expired_email_sent_at expires_at").lean();

  await Firma.updateMany(
    { payment_status: "paid", expires_at: { $lte: nowDate } },
    { $set: { payment_status: "expired" } }
  );

  if (resend) {
    for (const f of paidExpiredList) {
      if (f.paid_expired_email_sent_at) continue;
      try {
        await sendMail({
          to: f.email,
          subject: "EasyFix - Abonimi skadoi, lista u çaktivizua",
          text: `Abonimi yt skadoi dhe lista u çaktivizua. Për me vazhdu me u shfaq: ${FRONTEND_BASE_URL}/pay.html`,
          html: `
            <div style="font-family:Arial;line-height:1.5">
              <h2>Lista u çaktivizua</h2>
              <p>Abonimi yt skadoi dhe lista u çaktivizua.</p>
              <p>Për me u shfaq prap: <a href="${FRONTEND_BASE_URL}/pay.html">Pay now</a></p>
            </div>`,
        });

        await Firma.updateOne(
          { _id: f._id },
          { $set: { paid_expired_email_sent_at: new Date() } }
        );
        log("✅ Sent paid-expired email:", f.email);
      } catch (e) {
        errorWithTime("PAID EXPIRED EMAIL ERROR:", f.email, e);
      }
    }
  }

  // Delete expired after DELETE_AFTER_DAYS
  const cutoff = new Date(Date.now() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const del = await Firma.deleteMany({ payment_status: "expired", expires_at: { $lte: cutoff } });
  if (del?.deletedCount) log("🗑️ Deleted expired firms:", del.deletedCount);
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

  log("✅ MongoDB Connected");
}

async function start() {
  try {
    await connectMongo();

    await Firma.findOne({}).select("_id").lean();

    try {
      await runTrialNotifications();
      await runPaidNotifications();
      await runCleanup();
      log("✅ Initial scheduler run completed");
    } catch (e) {
      errorWithTime("Initial scheduler error:", e);
    }

    setInterval(async () => {
      try { await runTrialNotifications(); } catch (e) { errorWithTime("TrialNotifications scheduler error:", e); }
      try { await runPaidNotifications(); } catch (e) { errorWithTime("PaidNotifications scheduler error:", e); }
      try { await runCleanup(); } catch (e) { errorWithTime("Cleanup scheduler error:", e); }
    }, CHECK_INTERVAL_MINUTES * 60 * 1000);

    app.listen(PORT, () => log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    errorWithTime("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();
