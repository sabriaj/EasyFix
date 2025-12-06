import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());

// ❗ MOS E PËRDOR express.json() KËTU
// sepse prish webhook-un


// =====================
//  CONNECT MONGODB
// =====================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ MongoDB Error:", err));


// =====================
//  FIRMA MODEL
// =====================
const firmaSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  address: String,
  category: String,
  plan: String,
  advantages: Array,

  payment_status: { type: String, default: "pending" },
  paid_at: Date,
  expires_at: Date,

  created_at: { type: Date, default: Date.now }
});

const Firma = mongoose.model("Firma", firmaSchema);


// =====================
//  PLAN BENEFITS
// =====================
const planAdvantages = {
  basic: ["Publikim i firmës", "Kontakt bazë", "Shfaqje standard"],
  standard: [
    "Gjithë Basic +",
    "Prioritet në listë",
    "Logo e kompanisë",
    "3 foto"
  ],
  premium: [
    "Gjithë Standard +",
    "Vlerësime klientësh",
    "Promovim javor",
    "Top 3 pozicione"
  ]
};



// =======================================================
//  REGJISTRIMI — ME express.json()
// =======================================================

app.post("/register", express.json(), async (req, res) => {
  try {
    const { name, email, phone, address, category, plan } = req.body;

    if (!name || !email || !phone || !address || !category || !plan) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    const exists = await Firma.findOne({ email });

    if (exists) {
      return res.status(409).json({ success: false, error: "Email exists" });
    }

    await Firma.create({
      name, email, phone, address, category, plan,
      payment_status: "pending"
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});




// =======================================================
//      WEBHOOK — RAW BODY (I PASTËR)
// =======================================================

app.post("/webhook", express.raw({ type: "*/*" }), async (req, res) => {

  // --- VERIFY SIGNATURE ---
  try {
    const signature = req.headers["x-signature"];
    const secret = process.env.LEMON_WEBHOOK_SECRET;

    const computed = crypto
      .createHmac("sha256", secret)
      .update(req.body) // Buffer — TANI 100% OK
      .digest("hex");

    if (computed !== signature) {
      console.log("❌ Invalid webhook signature");
      return res.status(400).send("Invalid signature");
    }
  } catch (err) {
    console.log("Verification error:", err);
    return res.status(400).send("Invalid signature");
  }

  // --- PROCESS WEBHOOK ---
  try {
    const payload = JSON.parse(req.body.toString());
    const event = payload?.meta?.event_name;
    const email = payload?.data?.attributes?.user_email;

    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id;

    let plan = null;
    if (variantId === 1104148) plan = "basic";
    if (variantId === 1104129) plan = "standard";
    if (variantId === 1104151) plan = "premium";

    // ====== PAID ======
    if (event === "order_paid") {
      await Firma.findOneAndUpdate(
        { email },
        {
          payment_status: "paid",
          paid_at: new Date(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          plan,
          advantages: planAdvantages[plan]
        }
      );

      console.log("✅ PAID → Aktivizuar:", email);
      return res.status(200).send("OK");
    }

    // ====== CANCEL / EXPIRE ======
    if (
      event === "subscription_cancelled" ||
      event === "subscription_expired" ||
      event === "order_refunded"
    ) {
      await Firma.deleteOne({ email });
      console.log("🗑️ Firma u fshi:", email);
      return res.status(200).send("Deleted");
    }

    res.status(200).send("OK");

  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    res.status(500).send("Webhook error");
  }
});



// =======================================================
//  LISTA E FIRMAVE TË AKTIVE
// =======================================================

app.get("/firms", async (req, res) => {
  const firms = await Firma.find({ payment_status: "paid" });
  res.json(firms);
});


// =======================================================
//      AUTO DELETE NGA MONGO NË SKADIM
// =======================================================

setInterval(async () => {
  const now = new Date();
  const expired = await Firma.deleteMany({
    payment_status: "paid",
    expires_at: { $lte: now }
  });

  if (expired.deletedCount > 0) {
    console.log("🗑️ FSHIRJE AUTOMATIKE:", expired.deletedCount, "firma");
  }
}, 1000 * 60 * 60); // çdo 1 orë



// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
