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
const ADMIN_KEY = process.env.ADMIN_KEY || ""; // përdoret për endpoint-et admin
const DELETE_AFTER_DAYS = Number(process.env.DELETE_AFTER_DAYS || 2); // fshi pas 2 ditësh
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 60); // sa shpesh kontrollohen skadimet

// --- MONGO CONNECT ---
mongoose.connect(process.env.MONGO_URI, { autoIndex: true })
  .then(() => log("MongoDB Connected"))
  .catch(err => console.errorWithTime("MongoDB Error:", err));

// --- HELPERS LOGGING ---
function now() { return new Date().toISOString(); }
function log(...args) { console.log(now(), ...args); }
console.errorWithTime = (...args) => console.error(now(), ...args);

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

// --- plan advantages (mund t'i zgjerosh) ---
const planAdvantages = {
  basic: ["Publikim i firmës", "Kontakt bazë", "Shfaqje standard"],
  standard: ["Gjithë Basic +", "Prioritet në listë", "Logo e kompanisë", "3 foto"],
  premium: ["Gjithë Standard +", "Vlerësime klientësh", "Promovim javor", "Top 3 pozicione"]
};

// --- MIDDLEWARES ---
// Raw body ONLY for /webhook route (must be defined when adding route)
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  // This handler defined below (ke gjithçka brenda)
  try {
    // VERIFY HMAC
    try {
      const signature = req.headers["x-signature"] || req.headers["x-signature-256"] || "";
      const hmac = crypto.createHmac("sha256", LEMON_SECRET).update(req.body).digest("hex");
      if (!signature || hmac !== signature) {
        log("❌ Invalid signature (received:", signature, "computed:", hmac, ")");
        return res.status(400).send("Invalid signature");
      }
    } catch (verErr) {
      console.errorWithTime("Verification error:", verErr);
      return res.status(400).send("Invalid signature");
    }

    // PARSE
    let payload;
    try {
      payload = JSON.parse(req.body.toString());
    } catch (parseErr) {
      console.errorWithTime("Failed to parse webhook JSON:", parseErr);
      return res.status(400).send("Bad JSON");
    }

    const event = payload?.meta?.event_name || payload?.event || "unknown_event";
    // try several paths for email (Lemon can vary)
    const email =
      payload?.data?.attributes?.checkout_data?.custom?.email ||
      payload?.data?.attributes?.user_email ||
      payload?.data?.attributes?.customer_email ||
      null;

    log("🔔 Webhook event:", event, "email:", email);

    if (!email) {
      // no email → log and return OK (don't error Render)
      log("⚠️ Webhook had no email - ignoring");
      return res.status(200).send("No email");
    }

    // identify plan via variant id (use env VARIANT_* or numbers)
    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id ||
      payload?.data?.attributes?.subscription?.variant_id ||
      null;

    let plan = "basic";
    if (variantId == process.env.VARIANT_STANDARD) plan = "standard";
    if (variantId == process.env.VARIANT_PREMIUM) plan = "premium";

    // HANDLE EVENTS
    // order_paid or subscription_payment_success => set paid
    if (event === "order_paid" || event === "subscription_payment_success" || event === "order_created") {
      const adv = planAdvantages[plan] || [];
      await Firma.findOneAndUpdate(
        { email },
        {
          plan,
          advantages: adv,
          payment_status: "paid",
          paid_at: new Date(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          deleted_at: null
        },
        { upsert: true, new: true }
      );
      log("✅ Marked paid:", email, "plan:", plan);
      return res.status(200).send("OK");
    }

    // subscription_updated - handle possible changes (price/variant/next_payment etc.)
    if (event === "subscription_updated") {
      // example: change plan if variant changed
      const adv = planAdvantages[plan] || [];
      await Firma.findOneAndUpdate(
        { email },
        { plan, advantages: adv, deleted_at: null },
        { new: true }
      );
      log("🔄 Subscription updated for:", email, "set plan:", plan);
      return res.status(200).send("OK");
    }

    // subscription cancelled/expired/refunded -> mark expired or delete
    if (event === "subscription_cancelled" || event === "subscription_expired" || event === "order_refunded") {
      // mark expired and set expires_at to now so cleanup job will delete after grace period
      await Firma.findOneAndUpdate(
        { email },
        { payment_status: "expired", expires_at: new Date(), deleted_at: null },
        { new: true }
      );
      log("⚠️ Subscription cancelled/expired/refunded for:", email);
      return res.status(200).send("OK");
    }

    // default
    log("ℹ️ Unhandled webhook event:", event);
    return res.status(200).send("Ignored");
  } catch (err) {
    console.errorWithTime("WEBHOOK ERROR:", err);
    return res.status(500).send("Webhook error");
  }
});

// AFTER webhook raw route, enable json parser for normal routes
app.use(express.json());

// --- REGISTER endpoint (user registers -> saved as pending) ---
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
      name, email, phone, address, category, plan,
      advantages: planAdvantages[plan] || [],
      payment_status: "pending"
    });

    await firma.save();
    log("🆕 Registered (pending):", email);
    return res.json({ success: true, message: "Regjistrimi u ruajt si pending. Vazhdoni me pagesën." });
  } catch (err) {
    console.errorWithTime("REGISTER ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// --- PUBLIC: get active firms (only paid) ---
app.get("/firms", async (req, res) => {
  try {
    const firms = await Firma.find({ payment_status: "paid" }).select("-__v");
    return res.json(firms);
  } catch (err) {
    console.errorWithTime("FIRMS ERROR:", err);
    return res.status(500).send("Server error");
  }
});

// --- CHECK STATUS endpoint (public) ---
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
  if (!key || key !== ADMIN_KEY) return res.status(403).json({ success: false, error: "Forbidden" });
  next();
}

// --- EXTEND SUBSCRIPTION (admin only) ---
app.post("/extend-subscription", requireAdmin, async (req, res) => {
  try {
    const { email, days } = req.body;
    if (!email || !days) return res.status(400).json({ success: false, error: "Missing email or days" });
    const firma = await Firma.findOne({ email });
    if (!firma) return res.status(404).json({ success: false, error: "Not found" });
    const newExpire = new Date((firma.expires_at && firma.expires_at > new Date()) ? firma.expires_at.getTime() + days*24*60*60*1000 : Date.now() + days*24*60*60*1000);
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

// --- Admin cleanup manual endpoint (runs cleanup immediately) ---
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
// 1) Mark firms expired when expires_at < now and payment_status is paid
// 2) Delete firms where payment_status is expired AND (now - expires_at) > DELETE_AFTER_DAYS

async function runCleanupJobs() {
  const nowDate = new Date();
  // 1) mark expired where expires_at < now and still 'paid'
  const markRes = await Firma.updateMany(
    { payment_status: "paid", expires_at: { $lte: nowDate } },
    { $set: { payment_status: "expired" } }
  );

  // 2) delete where expired for more than DELETE_AFTER_DAYS
  const cutoff = new Date(Date.now() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const toDelete = await Firma.find({ payment_status: "expired", expires_at: { $lte: cutoff } }).select("email");
  if (toDelete.length > 0) {
    const emails = toDelete.map(f => f.email);
    await Firma.deleteMany({ email: { $in: emails } });
    log("🗑️ Deleted expired firms (grace passed):", emails);
  }

  return { markedExpired: markRes.modifiedCount, deletedCount: toDelete.length };
}

// Schedule cleanup: run every CHECK_INTERVAL_MINUTES
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
