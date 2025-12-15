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

/* ================= NORMALIZERS ================= */
function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

function normalizePlace(s) {
  const v = String(s || "").trim().toLowerCase();
  if (!v) return "";
  // hiq diakritikat kur është e mundur
  try {
    return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  } catch {
    return v.replace(/\s+/g, " ");
  }
}

// alias për qytete (ALB/MK/EN) – sa për me shmang “Shkup vs Skopje” etj.
const cityAlias = {
  "shkup": "skopje",
  "skopje": "skopje",

  "tetove": "tetovo",
  "tetov": "tetovo",
  "tetovo": "tetovo",

  "kercove": "kicevo",
  "kercova": "kicevo",
  "kicevo": "kicevo",

  "strumice": "strumica",
  "strumica": "strumica",

  "kumanove": "kumanovo",
  "kumanovo": "kumanovo",

  "ohri": "ohrid",
  "ohrid": "ohrid",

  "prilep": "prilep",
  "gostivar": "gostivar",
  "debar": "debar",
  "dibra": "debar",
  "stip": "stip",
  "stipp": "stip",
  "bitola": "bitola",
  "manastir": "bitola",
};

function cityKey(city) {
  const n = normalizePlace(city);
  return cityAlias[n] || n;
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

    phone: String,
    address: String,
    category: String,

    // LOCATION (NEW)
    city: String,
    zone: String,
    city_key: String,
    zone_key: String,

    plan: { type: String, default: "basic" }, // basic, standard, premium
    payment_status: { type: String, default: "pending" }, // pending, paid, expired

    logoUrl: String,
    photos: [String],

    paid_at: Date,
    expires_at: Date,
    deleted_at: Date,
  },
  { timestamps: true }
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
        checkout_data: {
          email,
          custom: { email },
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

      if (!updated) {
        log("⚠️ Paid webhook but firm not found for email:", email);
      } else {
        log("✅ Marked paid:", { email, plan: updated.plan });
      }

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

/* ================= GEO: REVERSE =================
   Nominatim (OSM) reverse -> kthen city/zone
*/
const geoCache = new Map(); // key -> { expires, data }
function geoCacheGet(key) {
  const v = geoCache.get(key);
  if (!v) return null;
  if (Date.now() > v.expires) { geoCache.delete(key); return null; }
  return v.data;
}
function geoCacheSet(key, data, ttlMs = 60 * 60 * 1000) {
  geoCache.set(key, { data, expires: Date.now() + ttlMs });
}

app.get("/geo/reverse", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, error: "Missing/invalid lat/lng" });
    }

    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const cached = geoCacheGet(key);
    if (cached) return res.json({ success: true, ...cached });

    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "EasyFix/1.0 (https://easyfix.mk)",
        "Accept-Language": "sq,en;q=0.8",
      },
    });

    if (!resp.ok) {
      return res.status(502).json({ success: false, error: "Reverse geocode failed" });
    }

    const json = await resp.json();
    const a = json?.address || {};

    const city =
      a.city ||
      a.town ||
      a.village ||
      a.municipality ||
      a.county ||
      "";

    const zone =
      a.suburb ||
      a.neighbourhood ||
      a.city_district ||
      a.quarter ||
      a.hamlet ||
      "";

    const out = { city, zone };
    geoCacheSet(key, out);
    return res.json({ success: true, ...out });
  } catch (e) {
    errorWithTime("GEO REVERSE ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
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
      let { name, email, phone, address, category, plan, city, zone } = req.body;

      email = normalizeEmail(email);

      if (!name || !email || !phone || !address || !category || !plan) {
        return res.status(400).json({ success: false, error: "Missing fields" });
      }
      if (!["basic", "standard", "premium"].includes(plan)) {
        return res.status(400).json({ success: false, error: "Invalid plan" });
      }

      // LOCATION: city është e detyrueshme për “afër meje”
      city = String(city || "").trim();
      zone = String(zone || "").trim();
      if (!city) {
        return res.status(400).json({ success: false, error: "Qyteti është i detyrueshëm." });
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
        phone,
        address,
        category,
        plan,
        payment_status: "pending",
        logoUrl,
        photos,

        city,
        zone,
        city_key: cityKey(city),
        zone_key: normalizePlace(zone),
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

      // nëse u kriju firma por checkout dështoi, fshije
      if (createdId) {
        try { await Firma.deleteOne({ _id: createdId }); } catch {}
      }

      return res.status(500).json({ success: false, error: "Server error" });
    }
  }
);

/* ================= PUBLIC: FIRMS (filters) ================= */
app.get("/firms", async (req, res) => {
  try {
    const qCity = String(req.query.city || "").trim();
    const qZone = String(req.query.zone || "").trim();

    const filter = { payment_status: "paid" };

    if (qCity) filter.city_key = cityKey(qCity);
    if (qZone) filter.zone_key = normalizePlace(qZone);

    const firms = await Firma.find(filter).select("-__v");
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
