import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());

// --- CONFIG ---
const PORT = process.env.PORT || 5000;
const LEMON_SECRET = process.env.LEMON_WEBHOOK_SECRET || "";
const ADMIN_KEY = process.env.ADMIN_KEY || ""; // për endpoint-et admin
const DELETE_AFTER_DAYS = Number(process.env.DELETE_AFTER_DAYS || 2); // fshi pas 2 ditësh
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 60); // sa shpesh kontrollohen skadimet

// --- HELPERS LOGGING ---
function now() { return new Date().toISOString(); }
function log(...args) { console.log(now(), ...args); }
console.errorWithTime = (...args) => console.error(now(), ...args);

// --- MONGO CONNECT ---
mongoose
  .connect(process.env.MONGO_URI, { autoIndex: true })
  .then(() => log("MongoDB Connected"))
  .catch(err => console.errorWithTime("MongoDB Error:", err));

// --- SCHEMAS / MODELS ---
const firmaSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  phone: String,
  address: String,
  category: String,
  plan: String,
  payment_status: { type: String, default: "pending" }, // pending, paid, expired
  advantages: [String],
  paid_at: Date,
  expires_at: Date,
  created_at: { type: Date, default: Date.now },
  deleted_at: Date
}, { timestamps: true });

const Firma = mongoose.model("Firma", firmaSchema);

// --- plan advantages (REAL, siç i kërkove) ---
const planAdvantages = {
  basic: [
    "Publikim i firmës në platformë",
    "Kontakt bazë (telefon + email)",
    "Shfaqje standarde në kategori",
    "1 kategori shërbimi",
    "Support bazik me email",
    "Pa logo / pa galeri fotosh"
  ],
  standard: [
    "Të gjitha nga BASIC",
    "Logo e kompanisë në profil",
    "Deri në 3 foto të shërbimeve",
    "Prioritet në listë mbi planin Basic",
    "Profil më i detajuar i firmës"
  ],
  premium: [
    "Të gjitha nga STANDARD",
    "Deri në 10 foto në galeri",
    "Vlerësime dhe komente nga klientët",
    "Promovim javor në seksionin e rekomanduar",
    "Pozicionim në TOP 3 sipas lokacionit"
  ]
};

// --- WEBHOOK (raw body vetëm këtu) ---
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    // 1) VERIFIKIMI I NËNSHKRIMIT (HMAC)
    try {
      const signature = req.headers["x-signature"] || req.headers["x-signature-256"] || "";
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

    // 2) PARSIMI I JSON
    let payload;
    try {
      payload = JSON.parse(req.body.toString());
    } catch (parseErr) {
      console.errorWithTime("Failed to parse webhook JSON:", parseErr);
      return res.status(400).send("Bad JSON");
    }

    const event = payload?.meta?.event_name || payload?.event || "unknown_event";

    // 3) EMAIL – PËRPIQU TË MARRËSH GJITHMONË custom.email TË FORMËS
    const email =
      payload?.data?.attributes?.checkout_data?.custom?.email || // NGA FRONTEND (REGISTER FORM)
      payload?.data?.attributes?.user_email ||
      payload?.data?.attributes?.customer_email ||
      null;

    log("🔔 Webhook event:", event, "email:", email);

    if (!email) {
      log("⚠️ Webhook had no email - ignoring");
      return res.status(200).send("No email");
    }

    // 4) GJETJA E PLANIT NGA VARIANTI (NËSE DON, MUND TË LIDHISH ME ENV)
    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id ||
      payload?.data?.attributes?.subscription?.variant_id ||
      null;

    let plan = "basic";
    if (variantId == process.env.VARIANT_STANDARD) plan = "standard";
    if (variantId == process.env.VARIANT_PREMIUM) plan = "premium";

    const adv = planAdvantages[plan] || [];

    // 5) NGJARJE QË AKTIVIZOJNË ABONIMIN
    if (
      event === "order_paid" ||
      event === "subscription_payment_success" ||
      event === "order_created"
    ) {
      await Firma.findOneAndUpdate(
        { email },
        {
          plan,
          advantages: adv,
          payment_status: "paid",
          paid_at: new Date(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 ditë
          deleted_at: null
        },
        { upsert: true, new: true }
      );
      log("✅ Marked paid:", email, "plan:", plan);
      return res.status(200).send("OK");
    }

    // 6) subscription_updated – p.sh. ndryshim plani
    if (event === "subscription_updated") {
      await Firma.findOneAndUpdate(
        { email },
        { plan, advantages: adv, deleted_at: null },
        { new: true }
      );
      log("🔄 Subscription updated for:", email, "set plan:", plan);
      return res.status(200).send("OK");
    }

    // 7) NGJARJE ANULIMI/REFUND/EXPIRY
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
          deleted_at: null
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
});

// --- JSON parser për rutat e tjera ---
app.use(express.json());

// --- REGISTER (ruhet si pending, me advantaget sipas planit) ---
app.post("/register", async (req, res) => {
  try {
    const { name, email, phone, address, category, plan } = req.body;

    if (!name || !email || !phone || !address || !category || !plan) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    const exists = await Firma.findOne({ email });
    if (exists) {
      return res.status(409).json({ success: false, error: "Ky email tashmë ekziston" });
    }

    const firma = new Firma({
      name,
      email,
      phone,
      address,
      category,
      plan,
      advantages: planAdvantages[plan] || [],
      payment_status: "pending"
    });

    await firma.save();
    log("🆕 Registered (pending):", email);

    return res.json({
      success: true,
      message: "Regjistrimi u ruajt si pending. Vazhdoni me pagesën."
    });
  } catch (err) {
    console.errorWithTime("REGISTER ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// --- FIRMS (vetëm ata me payment_status = paid) ---
app.get("/firms", async (req, res) => {
  try {
    // Mund t’i renditësh sipas planit (premium -> standard -> basic)
    const firms = await Firma.find({ payment_status: "paid" })
      .select("-__v")
      .sort({
        plan: 1,              // mund të ndryshosh logjikën e sorting
        created_at: -1
      });

    return res.json(firms);
  } catch (err) {
    console.errorWithTime("FIRMS ERROR:", err);
    return res.status(500).send("Server error");
  }
});

// --- CHECK STATUS (p.sh. për debug nga fronti) ---
app.get("/check-status", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ success: false, error: "Missing email" });

    const f = await Firma.findOne({ email }).select("-__v");
    if (!f) return res.status(404).json({ success: false, error: "Not found" });

    return res.json({ success: true, firma: f });
  } catch (err) {
    console.errorWithTime("CHECK-STATUS ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// --- ADMIN KEY MIDDLEWARE ---
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.admin_key;
  if (!key || key !== ADMIN_KEY) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }
  next();
}

// --- EXTEND SUBSCRIPTION (admin) ---
app.post("/extend-subscription", requireAdmin, async (req, res) => {
  try {
    const { email, days } = req.body;
    if (!email || !days) {
      return res.status(400).json({ success: false, error: "Missing email or days" });
    }

    const firma = await Firma.findOne({ email });
    if (!firma) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    const base =
      firma.expires_at && firma.expires_at > new Date()
        ? firma.expires_at.getTime()
        : Date.now();

    const newExpire = new Date(base + days * 24 * 60 * 60 * 1000);

    firma.expires_at = newExpire;
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

// --- ADMIN CLEANUP MANUAL ---
app.post("/admin/cleanup", requireAdmin, async (req, res) => {
  try {
    const deleted = await runCleanupJobs();
    return res.json({ success: true, deleted });
  } catch (err) {
    console.errorWithTime("CLEANUP ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// --- CLEANUP JOBS ---
async function runCleanupJobs() {
  const nowDate = new Date();

  // 1) Marko expired ku expires_at < tani dhe payment_status = paid
  const markRes = await Firma.updateMany(
    { payment_status: "paid", expires_at: { $lte: nowDate } },
    { $set: { payment_status: "expired" } }
  );

  // 2) Fshi ato që janë expired për më shumë se DELETE_AFTER_DAYS
  const cutoff = new Date(Date.now() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const toDelete = await Firma.find({
    payment_status: "expired",
    expires_at: { $lte: cutoff }
  }).select("email");

  if (toDelete.length > 0) {
    const emails = toDelete.map(f => f.email);
    await Firma.deleteMany({ email: { $in: emails } });
    log("🗑️ Deleted expired firms (grace passed):", emails);
  }

  return { markedExpired: markRes.modifiedCount, deletedCount: toDelete.length };
}

// Scheduled cleanup
setInterval(async () => {
  try {
    log("⏱ Running scheduled cleanup jobs...");
    await runCleanupJobs();
  } catch (e) {
    console.errorWithTime("Scheduled cleanup error:", e);
  }
}, CHECK_INTERVAL_MINUTES * 60 * 1000);

// start server
app.listen(PORT, () => log(`🚀 Server running on port ${PORT}`));
