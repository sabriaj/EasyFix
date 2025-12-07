import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());

// 1️⃣ RAW BODY VETËM PËR WEBHOOK — VENDOS PARA express.json()
app.post("/webhook", express.raw({ type: "application/json" }));

// 2️⃣ KJO PËR TË GJITHA RUTAT NORMALE
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("MongoDB Error:", err));

const firmaSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  address: String,
  category: String,
  plan: String,
  payment_status: { type: String, default: "pending" },
  advantages: Array,
  paid_at: Date,
  expires_at: Date,
  created_at: { type: Date, default: Date.now }
});

const Firma = mongoose.model("Firma", firmaSchema);

const planAdvantages = {
  basic: ["Publikim i firmës", "Kontakt bazë", "Shfaqje standard"],
  standard: ["Gjithë Basic +", "Prioritet në listë", "Logo e kompanisë", "3 foto"],
  premium: ["Gjithë Standard +", "Vlerësime klientësh", "Promovim javor", "Top 3 pozicione"]
};

app.post("/register", async (req, res) => {
  try {
    const exists = await Firma.findOne({ email: req.body.email });
    if (exists) return res.status(409).json({ success: false, error: "Email exists" });

    await Firma.create(req.body);

    res.json({ success: true });
  } catch (err) {
    console.log("REGISTER ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// 3️⃣ VERIFY SIGNATURE
function verifyLemon(req) {
  try {
    const signature = req.headers["x-signature"];
    const secret = process.env.LEMON_WEBHOOK_SECRET;

    const hmac = crypto.createHmac("sha256", secret)
      .update(req.body) // req.body = Buffer
      .digest("hex");

    return signature === hmac;
  } catch (err) {
    console.log("Verification error:", err);
    return false;
  }
}

// 4️⃣ WEBHOOK
app.post("/webhook", async (req, res) => {
  try {
    if (!verifyLemon(req)) {
      console.log("❌ Invalid Signature");
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(req.body.toString());
    const event = payload?.meta?.event_name;

    const email =
      payload?.data?.attributes?.user_email ||
      payload?.data?.attributes?.checkout_data?.custom?.email ||
      payload?.data?.attributes?.customer_email ||
      null;

    if (!email) return res.status(200).send("OK");

    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id;

    let plan = "basic";
    if (variantId == process.env.VARIANT_STANDARD) plan = "standard";
    if (variantId == process.env.VARIANT_PREMIUM) plan = "premium";

    if (event === "order_paid") {
      await Firma.findOneAndUpdate(
        { email },
        {
          plan,
          advantages: planAdvantages[plan],
          payment_status: "paid",
          paid_at: new Date(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      );
      console.log("✅ Firma aktivizuar:", email);
    }

    res.send("OK");

  } catch (err) {
    console.log("WEBHOOK ERROR:", err);
    res.status(500).send("Webhook error");
  }
});

app.listen(5000, () => console.log("🚀 Server running on port 5000"));
