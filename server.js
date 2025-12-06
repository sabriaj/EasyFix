import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// raw body për webhook
app.use("/webhook", express.raw({ type: "*/*" }));

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

// verify signature
function verifyLemon(req) {
  const signature = req.headers["x-signature"];
  const secret = process.env.LEMON_WEBHOOK_SECRET;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(req.body);

  return hmac.digest("hex") === signature;
}

app.post("/webhook", async (req, res) => {
  try {
    if (!verifyLemon(req)) {
      console.log("Invalid signature");
      return res.status(400).send("Invalid");
    }

    const payload = JSON.parse(req.body);

    const event = payload?.meta?.event_name;

    // MERR EMAILIN NGA TE GJITHA MUNDËSITË
    const email =
      payload?.data?.attributes?.user_email ||
      payload?.data?.attributes?.checkout_data?.custom?.email ||
      payload?.data?.attributes?.customer_email;

    if (!email) {
      console.log("No email in payload");
      return res.status(200).send("OK");
    }

    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id;

    let plan = "basic"; // default

    if (variantId == process.env.VARIANT_BASIC) plan = "basic";
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

      console.log("Firma aktivizuar:", email);
      return res.send("OK");
    }

    if (
      event === "subscription_cancelled" ||
      event === "subscription_expired" ||
      event === "order_refunded"
    ) {
      await Firma.deleteOne({ email });
      return res.send("Deleted");
    }

    res.send("OK");

  } catch (err) {
    console.log("WEBHOOK ERROR:", err);
    res.status(500).send("Webhook error");
  }
});

app.listen(5000, () => console.log("Server running"));
