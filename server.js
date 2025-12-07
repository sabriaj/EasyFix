import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());

// *** RAW BODY VETËM PËR WEBHOOK ***
app.use("/webhook", express.raw({ type: "*/*" }));

// PER KRKESA NORMALE
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

// =============================
//      REGISTER
// =============================
app.post("/register", async (req, res) => {
  try {
    const exists = await Firma.findOne({ email: req.body.email });
    if (exists) return res.status(409).json({ success: false, error: "Email exists" });

    await Firma.create({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      category: req.body.category,
      plan: req.body.plan,
      payment_status: "pending",
      advantages: planAdvantages[req.body.plan]
    });

    res.json({ success: true });
  } catch (err) {
    console.log("REGISTER ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// =============================
//      VERIFY SIGNATURE
// =============================
function verifyLemon(req) {
  try {
    const signature = req.headers["x-signature"];
    const secret = process.env.LEMON_WEBHOOK_SECRET;

    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(req.body); // Buffer
    const digest = hmac.digest("hex");

    return signature === digest;
  } catch (err) {
    console.log("Verification error:", err);
    return false;
  }
}

// =============================
//      WEBHOOK
// =============================
app.post("/webhook", async (req, res) => {
  try {
    if (!verifyLemon(req)) {
      console.log("❌ Invalid signature");
      return res.status(400).send("Invalid");
    }

    const payload = JSON.parse(req.body.toString());
    const event = payload?.meta?.event_name;
    
    console.log("📩 Webhook email:", email);


   let email = null;

// 1. user_email (kur useri ka account në Lemon)
if (payload?.data?.attributes?.user_email)
  email = payload.data.attributes.user_email;

// 2. customer_email (zakonisht te subscription events)
if (!email && payload?.data?.attributes?.customer_email)
  email = payload.data.attributes.customer_email;

// 3. checkout_data.custom.email (kjo është ajo që ti ia dërgon nga forma)
if (!email && payload?.data?.attributes?.checkout_data?.custom?.email)
  email = payload.data.attributes.checkout_data.custom.email;

// 4. fallback — kur Lemon dërgon buyer info
if (!email && payload?.data?.attributes?.billing?.email)
  email = payload.data.attributes.billing.email;

// 5. log nëse prapë nuk u gjet
if (!email) {
  console.log("⚠️ EMAIL NOT FOUND IN WEBHOOK PAYLOAD:", payload.data.attributes);
  return res.status(200).send("NO EMAIL");
}


    if (!email) {
      console.log("⚠ No email in webhook payload");
      return res.status(200).send("OK");
    }

    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id;

    let plan = "basic";

    if (variantId == process.env.VARIANT_BASIC) plan = "basic";
    if (variantId == process.env.VARIANT_STANDARD) plan = "standard";
    if (variantId == process.env.VARIANT_PREMIUM) plan = "premium";

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

      console.log("✅ Firma aktivizuar:", email);
      return res.send("OK");
    }

    if (
      event === "subscription_cancelled" ||
      event === "subscription_expired" ||
      event === "order_refunded"
    ) {
      await Firma.deleteOne({ email });
      console.log("🗑 Firma u fshi:", email);
      return res.send("Deleted");
    }

    res.send("OK");

  } catch (err) {
    console.log("WEBHOOK ERROR:", err);
    res.status(500).send("Webhook error");
  }
});

app.listen(5000, () => console.log("Server running"));
