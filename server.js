import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { Country, State, City } from "country-state-city";

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

const DEFAULT_COUNTRY = String(process.env.DEFAULT_COUNTRY || "MK").toUpperCase();

/* ================= LOG HELPERS ================= */
function now() { return new Date().toISOString(); }
function log(...args) { console.log(now(), ...args); }
function errorWithTime(...args) { console.error(now(), ...args); }

/* ================= NORMALIZERS ================= */
function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}
function normalizeCountry(c) {
  return String(c || "").trim().toUpperCase();
}
function normalizeCity(c) {
  return String(c || "").trim();
}

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

    country: { type: String, default: DEFAULT_COUNTRY }, // MK, DE, ...
    city: { type: String, default: "Skopje" },

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

/* ================= COUNTRY/CITY CACHE ================= */
const COUNTRIES_CACHE = (Country.getAllCountries() || [])
  .map(c => ({ code: c.isoCode, name: c.name }))
  .filter(x => x.code && x.name)
  .sort((a, b) => a.name.localeCompare(b.name));

const CITY_LIST_CACHE = new Map(); // countryCode -> [cityName...]
const CITY_SET_CACHE = new Map();  // countryCode -> Set(cityName)

function getCountryName(code) {
  const c = Country.getCountryByCode(code);
  return c?.name || code;
}

function computeCitiesForCountry(countryCode) {
  const code = normalizeCountry(countryCode);
  if (!code) return ["N/A"];

  if (CITY_LIST_CACHE.has(code)) return CITY_LIST_CACHE.get(code);

  const states = State.getStatesOfCountry(code) || [];
  let allCities = [];

  // If has states -> collect cities by state
  if (states.length > 0) {
    for (const st of states) {
      const cs = City.getCitiesOfState(code, st.isoCode) || [];
      allCities.push(...cs);
    }
  } else {
    // Fallback (some versions have getCitiesOfCountry)
    try {
      if (typeof City.getCitiesOfCountry === "function") {
        allCities = City.getCitiesOfCountry(code) || [];
      }
    } catch {}
  }

  const names = [...new Set((allCities || []).map(x => x?.name).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  const finalList = names.length ? names : ["N/A"];
  CITY_LIST_CACHE.set(code, finalList);
  CITY_SET_CACHE.set(code, new Set(finalList));
  return finalList;
}

/* ================= CREATE CHECKOUT (LEMON API) ================= */
async function createLemonCheckout({ variantId, email }) {
  if (!LEMON_API_KEY) throw new Error("Missing LEMON_API_KEY");
  if (!LEMON_STORE_ID) throw new Error("Missing LEMON_STORE_ID");
  if (!variantId) throw new Error("Missing variantId");

  const redirectUrl = `${FRONTEND_SUCCESS_URL}?email=${encodeURIComponent(email)}`;

  // Correct Lemon JSON:API format (relationships store/variant)
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

    // Mark paid ONLY when actually paid
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

    // cancel/refund -> expired
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

/* ================= META: COUNTRIES/CITIES ================= */
app.get("/meta/countries", (req, res) => {
  return res.json({
    success: true,
    defaultCountry: DEFAULT_COUNTRY,
    countries: COUNTRIES_CACHE,
  });
});

app.get("/meta/cities", (req, res) => {
  const country = normalizeCountry(req.query.country) || DEFAULT_COUNTRY;

  // validate country code
  const c = Country.getCountryByCode(country);
  if (!c) {
    return res.status(400).json({ success: false, error: "Invalid country" });
  }

  const cities = computeCitiesForCountry(country);
  return res.json({
    success: true,
    country,
    countryName: c.name,
    cities,
  });
});

/* ================= HEALTH ================= */
app.get("/health", (req, res) => res.json({ ok: true, time: now() }));

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
      let { name, email, phone, address, category, plan, country, city } = req.body;

      email = normalizeEmail(email);
      country = normalizeCountry(country) || DEFAULT_COUNTRY;
      city = normalizeCity(city);

      if (!name || !email || !phone || !address || !category || !plan || !country || !city) {
        return res.status(400).json({ success: false, error: "Missing fields" });
      }
      if (!["basic", "standard", "premium"].includes(plan)) {
        return res.status(400).json({ success: false, error: "Invalid plan" });
      }

      // validate country
      const cObj = Country.getCountryByCode(country);
      if (!cObj) return res.status(400).json({ success: false, error: "Invalid country" });

      // validate city must be from list (select only)
      const cityList = computeCitiesForCountry(country);
      const citySet = CITY_SET_CACHE.get(country) || new Set(cityList);
      if (!citySet.has(city)) {
        return res.status(400).json({
          success: false,
          error: `Invalid city for ${getCountryName(country)}. Zgjidh qytetin nga lista.`,
        });
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
        country,
        city,
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

/* ================= PUBLIC: FIRMS BY COUNTRY ================= */
app.get("/firms", async (req, res) => {
  try {
    const requested = normalizeCountry(req.query.country);
    const country = requested || DEFAULT_COUNTRY;

    const base = { payment_status: "paid" };

    // MK site: also include old docs without country (treated as MK)
    let query;
    if (country === DEFAULT_COUNTRY) {
      query = {
        ...base,
        $or: [
          { country },
          { country: { $exists: false } },
          { country: null },
          { country: "" },
        ],
      };
    } else {
      query = { ...base, country };
    }

    const firms = await Firma.find(query).select("-__v");
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
