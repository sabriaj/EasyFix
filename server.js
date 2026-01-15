// server.js (MODIFIED - 4 months free trial + reminder emails + pay-now flow + delete after 180 days)
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

/**
 * normalizePhone:
 * - Preferon E.164 (+...).
 * - Pranon vetëm + dhe numra.
 * - Fallback MK local (8/9 shifra) -> +389...
 */
function normalizePhone(raw) {
  let p = String(raw || "").trim();
  p = p.replace(/[^\d+]/g, "");

  if (p.startsWith("00")) p = "+" + p.slice(2);

  // E.164
  if (p.startsWith("+")) {
    if (p.length < 9 || p.length > 16) return null;
    return p;
  }

  // fallback MK local (vetëm nëse vjen pa +)
  const digits = p.replace(/[^\d]/g, "");
  if (digits.length === 8) return "+389" + digits;
  if (digits.length === 9 && digits.startsWith("0")) return "+389" + digits.slice(1);

  return null;
}

/* ================= GEO (NEW) ================= */
function fetchWithTimeout(url, timeoutMs = 8000, options = {}) {
  const controller = new AbortController();
  const tmr = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(tmr));
}

async function geocodeNominatim({ address, city, countryIso2 }) {
  const q = [address, city].filter(Boolean).join(", ").trim();
  if (!q) return null;

  const cc = String(countryIso2 || "").toLowerCase(); // e.g. mk
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&countrycodes=${encodeURIComponent(cc)}&q=${encodeURIComponent(q)}`;

  try {
    const resp = await fetchWithTimeout(url, 9000, {
      headers: {
        // Nominatim kërkon UA/Referer të arsyeshëm
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
    // === OWNER SELF-SERVICE TOKENS (magic links) ===
    owner_token_hash: String,
    owner_token_expires: Date,

    delete_token_hash: String,
    delete_token_expires: Date,

    // === TRIAL ===
    trial_started_at: Date,
    trial_ends_at: Date,
    trial_reminder_7d_sent_at: Date,
    trial_reminder_1d_sent_at: Date,
    trial_expired_email_sent_at: Date,

    // === PAY NOW (magic link) ===
    pay_token_hash: String,
    pay_token_expires: Date,

    name: String,
    email: { type: String, unique: true, required: true },
    phone: String, // E.164 +...
    phone_verified: { type: Boolean, default: false },
    phone_verified_at: Date,

    address: String,
    city: String, // ✅ NEW
    category: String,

    // Country for international use (ISO2)
    country: { type: String, default: DEFAULT_COUNTRY, index: true },

    // ✅ NEW: Geo location (GeoJSON)
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
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

// ✅ Index për /firms dhe admin filters
firmaSchema.index({ payment_status: 1, country: 1, plan: 1, createdAt: -1 });

// ✅ NEW: 2dsphere index për near me
firmaSchema.index({ location: "2dsphere", payment_status: 1, country: 1 });

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
    const allow = ["name", "phone", "address", "city", "category", "plan", "country", "payment_status", "expires_at"];
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

/* ================= PAY NOW (MAGIC LINK) ================= */
app.post("/pay-now/request", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ success: false, error: "Missing email" });

    const firm = await Firma.findOne({ email }).select("_id email").lean();

    // privacy: always return success
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
  if (!resend) return;

  const nowD = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  // windows with buffer
  const w7_from = new Date(nowD.getTime() + (6.5 * dayMs));
  const w7_to = new Date(nowD.getTime() + (7.5 * dayMs));

  const w1_from = new Date(nowD.getTime() + (0.5 * dayMs));
  const w1_to = new Date(nowD.getTime() + (1.5 * dayMs));

  const list7 = await Firma.find({
    payment_status: "trial",
    trial_ends_at: { $gte: w7_from, $lte: w7_to },
    trial_reminder_7d_sent_at: { $exists: false },
  }).select("_id email name trial_ends_at").lean();

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
    } catch (e) {
      errorWithTime("TRIAL 7D EMAIL ERROR:", e);
    }
  }

  const list1 = await Firma.find({
    payment_status: "trial",
    trial_ends_at: { $gte: w1_from, $lte: w1_to },
    trial_reminder_1d_sent_at: { $exists: false },
  }).select("_id email name trial_ends_at").lean();

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
    } catch (e) {
      errorWithTime("TRIAL 1D EMAIL ERROR:", e);
    }
  }
}

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  const rs = mongoose.connection.readyState;
  res.json({ ok: true, time: now(), dbReadyState: rs });
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

      const exists = await Firma.findOne({ email }).lean();
      if (exists) {
        return res.status(409).json({ success: false, error: "Ky email tashmë ekziston" });
      }

      // ✅ NEW: geocode address+city -> location
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

      // ✅ 4 months trial
      const nowD = new Date();
      const trialEnds = new Date(nowD);
      trialEnds.setMonth(trialEnds.getMonth() + 4);

      const firma = await Firma.create({
        name,
        email,
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
      });

      createdId = firma._id;

      // ✅ Redirect to success (no payment during trial)
      const successUrl = `${FRONTEND_SUCCESS_URL}?email=${encodeURIComponent(email)}&trial=1`;

      return res.json({
        success: true,
        message: "Regjistrimi u ruajt. Trial-i u aktivizua.",
        checkoutUrl: successUrl,
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
// ✅ /firms?country=MK -> kthen vetëm firmat e atij shteti
app.get("/firms", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const qCountry = String(req.query.country || "").trim().toUpperCase();
    const nowD = new Date();

    const base = {
      $or: [
        { payment_status: "paid" },
        { payment_status: "trial", trial_ends_at: { $gt: nowD } },
      ],
    };

    if (/^[A-Z]{2}$/.test(qCountry)) {
      if (qCountry === "MK") {
        const firms = await Firma.find({
          ...base,
          $or: [
            { country: "MK" },
            { country: { $exists: false } },
            { country: null },
            { country: "" },
          ],
        })
          .select("-__v")
          .sort({ createdAt: -1 })
          .lean();

        return res.json(firms);
      }

      const firms = await Firma.find({ ...base, country: qCountry })
        .select("-__v")
        .sort({ createdAt: -1 })
        .lean();

      return res.json(firms);
    }

    const firms = await Firma.find(base)
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(firms);
  } catch (err) {
    errorWithTime("FIRMS ERROR:", err);
    return res.status(500).send("Server error");
  }
});

/* ================= NEAR ME (NEW) ================= */
// GET /firms/near?country=MK&lat=41.99&lng=21.43&radius_km=25
app.get("/firms/near", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const qCountry = String(req.query.country || "").trim().toUpperCase();
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    let radiusKm = Number(req.query.radius_km || 25);
    if (!Number.isFinite(radiusKm)) radiusKm = 25;

    // hard bounds (anti-abuse)
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
    const basePaid = {
      $or: [
        { payment_status: "paid" },
        { payment_status: "trial", trial_ends_at: { $gt: nowD } },
      ],
    };

    // country filter + legacy MK support
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

  // 1) Expire trials that ended + send email once
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
      } catch (e) {
        errorWithTime("TRIAL EXPIRED EMAIL ERROR:", e);
      }
    }
  }

  // 2) Expire paid subscriptions that ended
  await Firma.updateMany(
    { payment_status: "paid", expires_at: { $lte: nowDate } },
    { $set: { payment_status: "expired" } }
  );

  // 3) Delete expired after DELETE_AFTER_DAYS
  const cutoff = new Date(Date.now() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  await Firma.deleteMany({ payment_status: "expired", expires_at: { $lte: cutoff } });
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

    setInterval(async () => {
      try {
        await runTrialNotifications();
        await runCleanup();
      } catch (e) {
        errorWithTime("Scheduler error:", e);
      }
    }, CHECK_INTERVAL_MINUTES * 60 * 1000);

    app.listen(PORT, () => log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    errorWithTime("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();
