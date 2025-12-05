import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Raw body për verifikimin e Lemon webhook
app.use("/webhook", express.raw({ type: "*/*" }));

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
// 1) REGJISTRIMI — user regjistrohet si “pending”
// =======================================================
app.post("/register", async (req, res) => {
  try {
    const { name, email, phone, address, category, plan } = req.body;

    if (!name || !email || !phone || !address || !category || !plan) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    // Check if email exists
    const exists = await Firmat.findOne({ email });

    if (exists) {
      // IMPORTANT
      return res.status(409).json({ success: false, error: "Email exists" });
    }

    // Save new firm
    await Firmat.create({
      name, email, phone, address, category, plan,
      paymentStatus: "pending"
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});



// =======================================================
// 2) WEBHOOK LEMON SQUEEZY — VERIFIKIM + UPDATE MONGO
// =======================================================

// Verifikim i nënshkrimit
function verifyLemon(req) {
  try {
    const signature = req.headers["x-signature"];
    const secret = process.env.LEMON_WEBHOOK_SECRET;

    const computed = crypto
      .createHmac("sha256", secret)
      .update(req.body)
      .digest("hex");

    return computed === signature;
  } catch (err) {
    return false;
  }
}

app.post("/webhook", async (req, res) => {
  try {
    if (!verifyLemon(req)) {
      console.log("❌ Webhook signature invalid");
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(req.body);
    const event = payload?.meta?.event_name;
    const email = payload?.data?.attributes?.user_email;

    console.log("📩 Webhook:", event, "->", email);

    // variant -> plan
    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id;

    let plan = null;
    if (variantId === 1104148) plan = "basic";
    if (variantId === 1104129) plan = "standard";
    if (variantId === 1104151) plan = "premium";

    // =============================
    //    1) PAGESA U KRY → Aktivizo
    // =============================
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

    // =============================
    //    2) ANULIM → Fshi firmën
    // =============================
    if (
      event === "subscription_cancelled" ||
      event === "subscription_expired" ||
      event === "order_refunded"
    ) {
      await Firma.deleteOne({ email });
      console.log("🗑️ Firma u fshi (anulim):", email);
      return res.status(200).send("Deleted");
    }

    res.status(200).send("OK");

  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    res.status(500).send("Webhook error");
  }
});


// =======================================================
//  LISTA E FIRMAVE VETËM TË AKTIVUARA
// =======================================================
app.get("/firms", async (req, res) => {
  const firms = await Firma.find({ payment_status: "paid" });
  res.json(firms);
});


// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
