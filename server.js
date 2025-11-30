import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Lemon Squeezy webhook kërkon RAW body për endpoint-in /webhook
app.use("/webhook", express.raw({ type: "*/*" }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

const firmaSchema = new mongoose.Schema({
  email: String,
  plan: String,
  advantages: Array,
  paid_at: Date,
  expires_at: Date
});
const Firma = mongoose.model("Firma", firmaSchema);

const messageSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  date: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", messageSchema);

const planAdvantages = {
  basic: [
    "1 kategori",
    "Listim bazik",
    "Support me email"
  ],
  standard: [
    "3 kategori",
    "Listim i zgjeruar",
    "Support me email + telefon"
  ],
  premium: [
    "∞ kategori",
    "Listim premium",
    "Prioritet në kërkime",
    "Support 24/7"
  ]
};

// Webhook i Lemon Squeezy
app.post("/webhook", async (req, res) => {
  const signature = req.headers["x-signature"];
  const secret = process.env.LEMON_WEBHOOK_SECRET;

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("hex");

  if (signature !== hmac) {
    console.log("❌ Invalid signature");
    return res.status(400).send("Invalid signature");
  }

  const payload = JSON.parse(req.body);
  const event = payload.meta.event_name;

  if (event === "order_created") {
    const email = payload.data.attributes.user_email;
    const variantId = payload.data.attributes.first_order_item.variant_id;

    let plan = null;
    if (variantId === 1104148) plan = "basic";
    if (variantId === 1104129) plan = "standard";
    if (variantId === 1104151) plan = "premium";

    if (!plan) {
      console.log("Variant ID not recognized");
      return res.status(400).send("Unknown variant");
    }

    const advantages = planAdvantages[plan];

    await Firma.findOneAndUpdate(
      { email },
      {
        email,
        plan,
        advantages,
        paid_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 ditë
      },
      { upsert: true }
    );

    console.log("💰 Payment received:", email, plan);
  }

  res.status(200).send("Webhook OK");
});

// Endpoint për regjistrimin e firmës nga forma frontend
app.post("/register", async (req, res) => {
  try {
    const { name, email, phone, address, category, plan } = req.body;

    if (!name || !email || !phone || !address || !category || !plan) {
      return res.status(400).json({ success: false, error: "Të dhënat nuk janë plotësuar si duhet." });
    }

    // Kontrollo nëse email ekziston
    const existingFirma = await Firma.findOne({ email });
    if (existingFirma) {
      return res.status(409).json({ success: false, error: "Email-i është regjistruar tashmë." });
    }

    const advantages = planAdvantages[plan] || [];

    const firma = new Firma({
      email,
      plan,
      advantages,
      paid_at: null,
      expires_at: null
    });

    await firma.save();

    res.json({ success: true, message: "Firma u regjistrua me sukses." });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint për kontakt
app.post("/contact", async (req, res) => {
  try {
    const msg = new Message(req.body);
    await msg.save();
    res.json({ success: true, message: "Message saved!" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
