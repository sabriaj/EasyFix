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

// --- CONFIG ---
const PORT = process.env.PORT || 5000;
const LEMON_SECRET = process.env.LEMON_WEBHOOK_SECRET || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const DELETE_AFTER_DAYS = Number(process.env.DELETE_AFTER_DAYS || 2);
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 60);

// --- CLOUDINARY CONFIG ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- MULTER (për logo/foto) ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // max 5MB per file
  },
});

// helper për të upload-uar buffer në Cloudinary
function uploadBufferToCloudinary(buffer, folder = "easyfix") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// --- LOG HELPERS ---
function now() {
  return new Date().toISOString();
}
function log(...args) {
  console.log(now(), ...args);
}
console.errorWithTime = (...args) => console.error(now(), ...args);

// --- MONGO CONNECT ---
mongoose
  .connect(process.env.MONGO_URI, { autoIndex: true })
  .then(() => log("MongoDB Connected"))
  .catch((err) => console.errorWithTime("MongoDB Error:", err));

// --- SCHEMA / MODEL ---
const firmaSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, required: true },
    phone: String,
    address: String,
    category: String,
    plan: String, // basic, standard, premium

    payment_status: { type: String, default: "pending" }, // pending, paid, expired

    // avantazhet sipas planit
    advantages: [String],

    // logo + fotot (Cloudinary URLs)
    logoUrl: String,
    photos: [String],

    paid_at: Date,
    expires_at: Date,
    created_at: { type: Date, default: Date.now },
    deleted_at: Date,
  },
  { timestamps: true }
);

const Firma = mongoose.model("Firma", firmaSchema);

// --- PLAN ADVANTAGES REALISTIKE ---
const planAdvantages = {
  basic: [
    "Listim bazë në EasyFix",
    "Të dhënat e kontaktit (telefon + email)",
    "Shfaqje standard në kategori",
  ],
  standard: [
    "Të gjitha nga BASIC",
    "Logo e kompanisë",
    "Derivon deri në 3 foto të shërbimeve",
    "Pozicion më i mirë në lista",
  ],
  premium: [
    "Të gjitha nga STANDARD",
    "Mundësi për shumë foto (portfolio)",
    "Pozicion Top në rezultatet sipas lokacionit",
    "Branding më i theksuar dhe besueshmëri më e madhe",
  ],
};

// --- WEBHOOK (RAW BODY) ---
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      // 1) VERIFIKIMI I NËNSHKRIMIT
      try {
        const signature =
          req.headers["x-signature"] || req.headers["x-signature-256"] || "";
        const hmac = crypto
          .createHmac("sha256", LEMON_SECRET)
          .update(req.body)
          .digest("hex");

        if (!signature || hmac !== signature) {
          log("❌ Invalid signature (received:", signature, "computed:", hmac, ")");
          return res.status(400).send("Invalid signature");
        }
      } catch (verErr) {
        console.errorWithTime("Verification error:", verErr);
        return res.status(400).send("Invalid signature");
      }

      // 2) PARSIMI I PAYLOAD
      let payload;
      try {
        payload = JSON.parse(req.body.toString());
      } catch (parseErr) {
        console.errorWithTime("Failed to parse webhook JSON:", parseErr);
        return res.status(400).send("Bad JSON");
      }

      const event = payload?.meta?.event_name || payload?.event || "unknown_event";

      // Marrja e email-it: prioritet custom.checkout_data.email që ne ia dërgojmë
      const email =
        payload?.data?.attributes?.checkout_data?.custom?.email ||
        payload?.data?.attributes?.user_email ||
        payload?.data?.attributes?.customer_email ||
        null;

      log("🔔 Webhook event:", event, "email:", email);

      if (!email) {
        log("⚠️ Webhook had no email - ignoring");
        return res.status(200).send("No email");
      }

      // 3) MARRIM PLANIN NGA VARIANT ID (nga Lemon)
      const variantId =
        payload?.data?.attributes?.first_order_item?.variant_id ||
        payload?.data?.attributes?.variant_id ||
        payload?.data?.attributes?.subscription?.variant_id ||
        null;

      let plan = "basic";
      if (variantId == process.env.VARIANT_STANDARD) plan = "standard";
      if (variantId == process.env.VARIANT_PREMIUM) plan = "premium";

      // 4) HANDLE EVENTS
      if (
        event === "order_paid" ||
        event === "subscription_payment_success" ||
        event === "order_created"
      ) {
        const adv = planAdvantages[plan] || [];
        await Firma.findOneAndUpdate(
          { email },
          {
            plan,
            advantages: adv,
            payment_status: "paid",
            paid_at: new Date(),
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            deleted_at: null,
          },
          { upsert: true, new: true }
        );
        log("✅ Marked paid:", email, "plan:", plan);
        return res.status(200).send("OK");
      }

      if (event === "subscription_updated") {
        const adv = planAdvantages[plan] || [];
        await Firma.findOneAndUpdate(
          { email },
          { plan, advantages: adv, deleted_at: null },
          { new: true }
        );
        log("🔄 Subscription updated for:", email, "set plan:", plan);
        return res.status(200).send("OK");
      }

      if (
        event === "subscription_cancelled" ||
        event === "subscription_expired" ||
        event === "order_refunded"
      ) {
        await Firma.findOneAndUpdate(
          { email },
          {
            payment_status: "expired",
            expires_at: new Date(),
            deleted_at: null,
          },
          { new: true }
        );
        log("⚠️ Subscription cancelled/expired/refunded for:", email);
        return res.status(200).send("OK");
      }

      log("ℹ️ Unhandled webhook event:", event);
      return res.status(200).send("Ignored");
    } catch (err) {
      console.errorWithTime("WEBHOOK ERROR:", err);
      return res.status(500).send("Webhook error");
    }
  }
);

// --- JSON BODY PËR RUTAT E TJERA ---
app.use(express.json());

// --- REGISTER (me logo + foto për standard/premium) ---
app.post(
  "/register",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const { name, email, phone, address, category, plan } = req.body;

      if (!name || !email || !phone || !address || !category || !plan) {
        return res
          .status(400)
          .json({ success: false, error: "Missing fields" });
      }

      const exists = await Firma.findOne({ email });
      if (exists) {
        return res
          .status(409)
          .json({ success: false, error: "Ky email tashmë ekziston" });
      }

      // Përgatit advantage sipas planit
      const advantages = planAdvantages[plan] || [];

      let logoUrl = "";
      let photos = [];

      // Logo & foto LEJOHEN VETËM për standard/premium
      if (plan === "standard" || plan === "premium") {
        const files = req.files || {};

        // LOGO
        if (files.logo && files.logo[0]) {
          try {
            logoUrl = await uploadBufferToCloudinary(
              files.logo[0].buffer,
              "easyfix/logos"
            );
          } catch (err) {
            console.errorWithTime("Cloudinary logo upload error:", err);
          }
        }

        // FOTOT
        if (files.photos && files.photos.length > 0) {
          // limit fotot sipas planit
          const maxPhotos = plan === "standard" ? 3 : 20;
          const slice = files.photos.slice(0, maxPhotos);

          for (const file of slice) {
            try {
              const url = await uploadBufferToCloudinary(
                file.buffer,
                "easyfix/photos"
              );
              photos.push(url);
            } catch (err) {
              console.errorWithTime("Cloudinary photo upload error:", err);
            }
          }
        }
      }

      const firma = new Firma({
        name,
        email,
        phone,
        address,
        category,
        plan,
        advantages,
        payment_status: "pending",
        logoUrl: logoUrl || null,
        photos,
      });

      await firma.save();
      log("🆕 Registered (pending):", email);

      return res.json({
        success: true,
        message: "Regjistrimi u ruajt si pending. Vazhdoni me pagesën.",
      });
    } catch (err) {
      console.errorWithTime("REGISTER ERROR:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  }
);

// --- PUBLIC: FIRMAT AKTIVE (VETËM PAID) ---
app.get("/firms", async (req, res) => {
  try {
    const firms = await Firma.find({ payment_status: "paid" }).select("-__v");
    return res.json(firms);
  } catch (err) {
    console.errorWithTime("FIRMS ERROR:", err);
    return res.status(500).send("Server error");
  }
});

// --- CHECK STATUS ---
app.get("/check-status", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email)
      return res
        .status(400)
        .json({ success: false, error: "Missing email" });

    const f = await Firma.findOne({ email }).select("-__v");
    if (!f)
      return res
        .status(404)
        .json({ success: false, error: "Not found" });

    return res.json({ success: true, firma: f });
  } catch (err) {
    console.errorWithTime("CHECK-STATUS ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// --- ADMIN MIDDLEWARE ---
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.admin_key;
  if (!key || key !== ADMIN_KEY)
    return res.status(403).json({ success: false, error: "Forbidden" });
  next();
}

// --- EXTEND SUBSCRIPTION (admin) ---
app.post("/extend-subscription", requireAdmin, async (req, res) => {
  try {
    const { email, days } = req.body;
    if (!email || !days)
      return res
        .status(400)
        .json({ success: false, error: "Missing email or days" });

    const firma = await Firma.findOne({ email });
    if (!firma)
      return res.status(404).json({ success: false, error: "Not found" });

    const addMs = days * 24 * 60 * 60 * 1000;
    const base =
      firma.expires_at && firma.expires_at > new Date()
        ? firma.expires_at.getTime()
        : Date.now();

    firma.expires_at = new Date(base + addMs);
    firma.payment_status = "paid";
    firma.deleted_at = null;
    await firma.save();

    log("🔁 Extended subscription for:", email, "by", days, "days");
    return res.json({ success: true, firma });
  } catch (err) {
    console.errorWithTime("EXTEND ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// --- CLEANUP JOBS (expire + delete) ---
async function runCleanupJobs() {
  const nowDate = new Date();

  const markRes = await Firma.updateMany(
    { payment_status: "paid", expires_at: { $lte: nowDate } },
    { $set: { payment_status: "expired" } }
  );

  const cutoff = new Date(
    Date.now() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000
  );
  const toDelete = await Firma.find({
    payment_status: "expired",
    expires_at: { $lte: cutoff },
  }).select("email");

  if (toDelete.length > 0) {
    const emails = toDelete.map((f) => f.email);
    await Firma.deleteMany({ email: { $in: emails } });
    log("🗑️ Deleted expired firms (grace passed):", emails);
  }

  return { markedExpired: markRes.modifiedCount, deletedCount: toDelete.length };
}

app.post("/admin/cleanup", requireAdmin, async (req, res) => {
  try {
    const deleted = await runCleanupJobs();
    return res.json({ success: true, deleted });
  } catch (err) {
    console.errorWithTime("CLEANUP ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// SCHEDULED CLEANUP
setInterval(async () => {
  try {
    log("⏱ Running scheduled cleanup jobs...");
    await runCleanupJobs();
  } catch (e) {
    console.errorWithTime("Scheduled cleanup error:", e);
  }
}, CHECK_INTERVAL_MINUTES * 60 * 1000);

// START
app.listen(PORT, () => log(`🚀 Server running on port ${PORT}`));
