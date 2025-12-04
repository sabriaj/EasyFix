import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Raw body për LemonSqueezy webhook
app.use("/webhook", express.raw({ type: "*/*" }));

// CONNECT MONGO
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("MongoDB Error:", err));


// ===============================
//        FIRMA MODEL
// ===============================
const firmaSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  address: String,
  category: String,
  plan: String,
  advantages: Array,

  payment_status: { type: String, default: "pending" }, // pending, paid
  paid_at: Date,
  expires_at: Date,

  created_at: { type: Date, default: Date.now }
});

const Firma = mongoose.model("Firma", firmaSchema);


// ===============================
//        PLAN AVANTAGES
// ===============================
const planAdvantages = {
  basic: [
    "Publikim i firmës",
    "Kontakt bazë",
    "Shfaqje standard"
  ],
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
//         1) REGJISTRIMI – PA PAGESË NUK AKTIVOHET
// =======================================================
app.post("/register", async (req, res) => {
  try {
    const { name, email, phone, address, category, plan } = req.body;

    // Kontrollo email
    const exists = await Firma.findOne({ email });
    if (exists) {
      return res.status(409).json({ success: false, error: "Ky email tashmë ekziston!" });
    }

    // Ruaje si pending
    const firma = new Firma({
      name,
      email,
      phone,
      address,
      category,
      plan,
      advantages: planAdvantages[plan],
      payment_status: "pending"
    });

    await firma.save();

    return res.json({
      success: true,
      message: "Regjistrimi u ruajt si 'pending'. Vazhdoni me pagesën."
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ success: false, error: "Gabim serveri" });
  }
});


// =======================================================
//       2) WEBHOOK – LEMON SQUEEZY PAYMENT EVENTS
// =======================================================
app.post("/webhook", async (req, res) => {
  try {
    const raw = req.body.toString();
    const payload = JSON.parse(raw);

    const event = payload?.meta?.event_name;
    const email = payload?.data?.attributes?.user_email;

    if (!email) return res.status(200).send("No email");

    console.log("Webhook:", event, " -> ", email);

    // =============================
    //   MAP Variant -> PLAN
    // =============================
    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id;

    let plan = null;

    if (variantId === 1104148) plan = "basic";
    if (variantId === 1104129) plan = "standard";
    if (variantId === 1104151) plan = "premium";

    // =============================
    //   1) PAID → Aktivizo
    // =============================
    if (event === "order_paid") {
      await Firma.findOneAndUpdate(
        { email },
        {
          plan,
          advantages: planAdvantages[plan],
          payment_status: "paid",
          paid_at: new Date(),
          expires_at: new Date(Date.now() + 30*24*60*60*1000)
        },
        { new: true }
      );

      console.log("PAID → Aktivizuar:", email);
      return res.status(200).send("OK");
    }

    // =============================
    //   2) Anulim / Expire → Fshi
    // =============================
    if (
      event === "subscription_cancelled" ||
      event === "subscription_expired" ||
      event === "order_refunded"
    ) {
      await Firma.deleteOne({ email });
      console.log("DELETED (canceled):", email);
      return res.status(200).send("Deleted");
    }

    res.status(200).send("OK");

  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    res.status(500).send("Webhook error");
  }
});


// ===== LISTA E FIRMAVE =====
app.get("/firms", async (req, res) => {
  const firms = await Firma.find({ payment_status: "paid" });
  res.json(firms);
});


// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
