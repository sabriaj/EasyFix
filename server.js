import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
app.use(cors());

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
  "https://sabriaj.github.io/EasyFix/success.html";

const DELETE_AFTER_DAYS = Number(process.env.DELETE_AFTER_DAYS || 2);
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 60);

/* ===== PHONE VERIFICATION CONFIG ===== */
const REQUIRE_PHONE_VERIFICATION =
  String(process.env.REQUIRE_PHONE_VERIFICATION || "1") === "1";

const OTP_SECRET = process.env.OTP_SECRET || process.env.ADMIN_KEY || "dev_otp_secret";
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 5);
const OTP_TOKEN_TTL_MINUTES = Number(process.env.OTP_TOKEN_TTL_MINUTES || 30);
const OTP_DEBUG = String(process.env.OTP_DEBUG || "0") === "1";

// Twilio SMS (Messaging API)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || "";

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB/file
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

/**
 * normalizePhone:
 * - lejon + dhe numra
 * - "00..." -> "+..."
 * - MK local:
 *    071234567 -> +38971234567  (hiq 0)
 *    71234567  -> +38971234567
 */
function normalizePhone(raw) {
  let p = String(raw || "").trim();
  p = p.replace(/[^\d+]/g, "");

  if (p.startsWith("00")) p = "+" + p.slice(2);

  if (!p.startsWith("+")) {
    // vetëm numra (local)
    const digits = p.replace(/[^\d]/g, "");
    if (digits.length === 8) {
      return "+389" + digits;
    }
    if (digits.length === 9 && digits.startsWith("0")) {
      return "+389" + digits.slice(1);
    }
    return null;
  }

  if (p.length < 9 || p.length > 16) return null;
  return p;
}

function safeEq(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

/* ================= MONGO ================= */
mongoose
  .connect(process.env.MONGO_URI, { autoIndex: true })
  .then(() => log("✅ MongoDB Connected"))
  .catch((err) => errorWithTime("MongoDB Error:", err));

/* ================= SCHEMA ================= */
const firmaSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, required: true },
    phone: String, // E.164 +389...
    phone_verified: { type: Boolean, default: false },
    phone_verified_at: Date,

    address: String,
    category: String,

    plan: { type: String, default: "basic" },
    payment_status: { type: String, default: "pending" },

    logoUrl: String,
    photos: [String],

    paid_at: Date,
    expires_at: Date,
    deleted_at: Date,
  },
  { timestamps: true }
);

const Firma = mongoose.model("Firma", firmaSchema);

/* OTP collection (TTL) */
const phoneOtpSchema = new mongoose.Schema(
  {
    phone: { type: String, index: true },
    code_hash: String,
    token: String,
    verified: { type: Boolean, default: false },
    used: { type: Boolean, default: false },
    expires_at: { type: Date, index: true }, // TTL
  },
  { timestamps: true }
);

phoneOtpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
const PhoneOTP = mongoose.model("PhoneOTP", phoneOtpSchema);

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

/* ================= CREATE CHECKOUT (LEMON API) ================= */
async function createLemonCheckout({ variantId, email }) {
  if (!LEMON_API_KEY) throw new Error("Missing LEMON_API_KEY");
  if (!LEMON_STORE_ID) throw new Error("Missing LEMON_STORE_ID");
  if (!variantId) throw new Error("Missing variantId");

  const redirectUrl = `${FRONTEND_SUCCESS_URL}?email=${encodeURIComponent(email)}`;

  const payload = {
    data: {
      type: "checkouts",
      attributes: {
        product_options: { redirect_url: redirectUrl },
        checkout_data: { email, custom: { email } },
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
    throw new Error(`Lemon API error: ${resp.status} ${JSON.stringify(json)}`);
  }

  const url = json?.data?.attributes?.url;
  if (!url) throw new Error("Checkout URL missing from Lemon response");
  return url;
}

/* ================= WEBHOOK (RAW BODY) ================= */
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    let signature =
      req.headers["x-signature"] ||
      req.headers["x-signature-256"] ||
      "";

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

    const detectedPlan = detectPlanFromVariant(variantId);

    log("🔔 Webhook", { event, email, variantId, detectedPlan });

    if (!email) return res.status(200).send("No email");

    if (event === "order_paid" || event === "subscription_payment_success") {
      const update = {
        payment_status: "paid",
        paid_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        deleted_at: null,
      };

      if (detectedPlan) update.plan = detectedPlan;

      const updated = await Firma.findOneAndUpdate(
        { email },
        { $set: update },
        { upsert: false, new: true }
      );

      if (!updated) log("⚠️ Paid webhook but firm not found for email:", email);
      else log("✅ Marked paid:", { email, plan: updated.plan });

      return res.status(200).send("OK");
    }

    if (event === "subscription_cancelled" || event === "subscription_expired" || event === "order_refunded") {
      await Firma.findOneAndUpdate(
        { email },
        { $set: { payment_status: "expired", expires_at: new Date() } },
        { new: true }
      );
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

/* ================= HEALTH ================= */
app.get("/health", (req, res) => res.json({ ok: true, time: now() }));

/* ================= PHONE OTP (SMS) ================= */
// limiter i thjeshtë (in-memory)
const lastOtpSentAt = new Map(); // phone -> ms

async function sendSmsTwilio({ to, body }) {
  // Nëse s'ke Twilio, mos e lejo "success" pa SMS — veç nëse OTP_DEBUG=1
  const twilioReady = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER;

  if (!twilioReady) {
    if (!OTP_DEBUG) {
      throw new Error("Twilio is not configured (missing TWILIO_* env vars).");
    }
    log("📩 OTP DEBUG (no SMS). To:", to, "Message:", body);
    return { ok: true, dev: true };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");

  const form = new URLSearchParams();
  form.append("To", to);
  form.append("From", TWILIO_FROM_NUMBER);
  form.append("Body", body);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`Twilio error: ${resp.status} ${text}`);
  return { ok: true };
}

app.post("/auth/send-otp", async (req, res) => {
  try {
    const phoneNorm = normalizePhone(req.body?.phone);
    if (!phoneNorm) {
      return res.status(400).json({
        success: false,
        error: "Numër telefoni jo valid. Përdor format + (p.sh. +3897xxxxxxx) ose 07xxxxxxx.",
      });
    }

    const nowMs = Date.now();
    const last = lastOtpSentAt.get(phoneNorm) || 0;
    if (nowMs - last < 60_000) {
      return res.status(429).json({ success: false, error: "Prit 60 sekonda para se me kërku kodin prap." });
    }
    lastOtpSentAt.set(phoneNorm, nowMs);

    await PhoneOTP.deleteMany({ phone: phoneNorm });

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const codeHash = crypto
      .createHmac("sha256", OTP_SECRET)
      .update(`${phoneNorm}|${code}`)
      .digest("hex");

    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await PhoneOTP.create({
      phone: phoneNorm,
      code_hash: codeHash,
      verified: false,
      used: false,
      expires_at: expiresAt,
    });

    const msg = `EasyFix: Kodi i verifikimit është ${code}. Vlen ${OTP_TTL_MINUTES} min.`;

    await sendSmsTwilio({ to: phoneNorm, body: msg });

    return res.json({
      success: true,
      message: "Kodi u dërgua.",
      ...(OTP_DEBUG ? { dev_code: code } : {}),
      phone: phoneNorm,
    });
  } catch (err) {
    errorWithTime("SEND-OTP ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error (send-otp)" });
  }
});

app.post("/auth/verify-otp", async (req, res) => {
  try {
    const phoneNorm = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || "").trim();

    if (!phoneNorm || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, error: "Të dhëna jo valide." });
    }

    const doc = await PhoneOTP.findOne({ phone: phoneNorm }).sort({ createdAt: -1 });
    if (!doc) return res.status(400).json({ success: false, error: "Kodi s’u gjet. Kërko kod të ri." });

    if (doc.expires_at && doc.expires_at.getTime() < Date.now()) {
      return res.status(400).json({ success: false, error: "Kodi ka skadu. Kërko kod të ri." });
    }

    const hash = crypto
      .createHmac("sha256", OTP_SECRET)
      .update(`${phoneNorm}|${code}`)
      .digest("hex");

    if (!safeEq(hash, doc.code_hash)) {
      return res.status(400).json({ success: false, error: "Kodi gabim." });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + OTP_TOKEN_TTL_MINUTES * 60 * 1000);

    doc.verified = true;
    doc.token = token;
    doc.used = false;
    doc.expires_at = tokenExpiresAt; // zgjat TTL për token
    await doc.save();

    return res.json({ success: true, phone_verify_token: token, phone: phoneNorm });
  } catch (err) {
    errorWithTime("VERIFY-OTP ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error (verify-otp)" });
  }
});

/* ================= REGISTER (multipart) ================= */
app.post(
  "/register",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  async (req, res) => {
    let createdId = null;
    try {
      let { name, email, phone, address, category, plan, phone_verify_token } = req.body;

      email = normalizeEmail(email);
      const phoneNorm = normalizePhone(phone);

      if (!name || !email || !phoneNorm || !address || !category || !plan) {
        return res.status(400).json({ success: false, error: "Missing fields" });
      }
      if (!["basic", "standard", "premium"].includes(plan)) {
        return res.status(400).json({ success: false, error: "Invalid plan" });
      }

      if (REQUIRE_PHONE_VERIFICATION) {
        if (!phone_verify_token) {
          return res.status(400).json({
            success: false,
            error: "Verifiko numrin e telefonit (kodi SMS) para regjistrimit.",
          });
        }

        // konsumim atomik (mos lejo reuse)
        const tok = await PhoneOTP.findOneAndUpdate(
          {
            phone: phoneNorm,
            token: String(phone_verify_token),
            verified: true,
            used: false,
            expires_at: { $gt: new Date() },
          },
          { $set: { used: true } },
          { new: true }
        );

        if (!tok) {
          return res.status(400).json({
            success: false,
            error: "Verifikimi i telefonit s’është valid ose ka skadu. Provo prap.",
          });
        }
      }

      const exists = await Firma.findOne({ email });
      if (exists) {
        return res.status(409).json({ success: false, error: "Ky email tashmë ekziston" });
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

      const firma = await Firma.create({
        name,
        email,
        phone: phoneNorm,
        phone_verified: REQUIRE_PHONE_VERIFICATION ? true : false,
        phone_verified_at: REQUIRE_PHONE_VERIFICATION ? new Date() : null,
        address,
        category,
        plan,
        payment_status: "pending",
        logoUrl,
        photos,
      });

      createdId = firma._id;

      const variantId = planToVariant(plan);
      const checkoutUrl = await createLemonCheckout({ variantId, email });

      return res.json({
        success: true,
        message: "Regjistrimi u ruajt. Vazhdoni me pagesën.",
        checkoutUrl,
      });
    } catch (err) {
      errorWithTime("REGISTER ERROR:", err);

      if (createdId) {
        try { await Firma.deleteOne({ _id: createdId }); } catch {}
      }

      return res.status(500).json({ success: false, error: "Server error" });
    }
  }
);

/* ================= PUBLIC ================= */
app.get("/firms", async (req, res) => {
  try {
    const firms = await Firma.find({ payment_status: "paid" }).select("-__v");
    res.json(firms);
  } catch (err) {
    errorWithTime("FIRMS ERROR:", err);
    res.status(500).send("Server error");
  }
});

app.get("/check-status", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    if (!email) return res.status(400).json({ success: false, error: "Missing email" });

    const f = await Firma.findOne({ email }).select("-__v");
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

  await Firma.updateMany(
    { payment_status: "paid", expires_at: { $lte: nowDate } },
    { $set: { payment_status: "expired" } }
  );

  const cutoff = new Date(Date.now() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  await Firma.deleteMany({ payment_status: "expired", expires_at: { $lte: cutoff } });
}

setInterval(async () => {
  try { await runCleanup(); }
  catch (e) { errorWithTime("Cleanup error:", e); }
}, CHECK_INTERVAL_MINUTES * 60 * 1000);

/* ================= START ================= */
app.listen(PORT, () => log(`🚀 Server running on port ${PORT}`));
