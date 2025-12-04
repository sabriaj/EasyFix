import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";



dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());              // rëndësishme për body JSON

// për webhook (lemon) përdor raw body vetëm për /webhook
app.use("/webhook", express.raw({ type: "*/*" }));

// MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// ===== MODELS =====
const firmaSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  address: String,
  phone: String,
  category: String,
  plan: String,
  advantages: Array,
  paid_at: Date,
  expires_at: Date,
  created_at: { type: Date, default: Date.now }
});
const Firma = mongoose.model("Firma", firmaSchema);

const messageSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  date: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", messageSchema);

// advantages
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


app.use("/webhook", express.raw({ type: "*/*" }));
 

// ======= WEBHOOK LEMON SQUEEZY =======

app.post("/webhook", async (req, res) => {
  try {
    const rawBody = req.body.toString();

    // Parse JSON payload
    const payload = JSON.parse(rawBody);
    const event = payload?.meta?.event_name;
    const email = payload?.data?.attributes?.user_email;

    if (!email) {
      console.log("Webhook without email");
      return res.status(400).send("No email found");
    }

    console.log("Webhook Event:", event, "for:", email);


    // ========================
    //      VARIANT → PLAN
    // ========================
    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id;

    let plan = null;

    if (variantId === 1104148) plan = "basic";
    if (variantId === 1104129) plan = "standard";
    if (variantId === 1104151) plan = "premium";


    // ========================
    //     PLAN ADVANTAGES
    // ========================
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


    // ========================
    //  1) ORDER PAID → ADD TO DB
    // ========================
    if (event === "order_paid") {
      if (!plan) {
        console.log("Unknown variant:", variantId);
        return res.status(200).send("Unknown plan, but OK");
      }

      const advantages = planAdvantages[plan] || [];

      // ruaje ose update nese ekziston
      await Firma.findOneAndUpdate(
        { email },
        {
          email,
          plan,
          advantages,
          paid_at: new Date(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
        },
        { upsert: true, new: true }
      );

      console.log("📌 USER ADDED / UPDATED:", email, "-", plan);
      return res.status(200).send("Order paid processed");
    }


    // ========================
    // 2) CANCEL / EXPIRE / REFUND → DELETE FROM DB
    // ========================
    if (
      event === "subscription_cancelled" ||
      event === "subscription_expired" ||
      event === "order_refunded"
    ) {
      await Firma.deleteOne({ email });

      console.log("❌ USER REMOVED:", email, "-", event);
      return res.status(200).send("Subscription removed");
    }


    // ========================
    // 3) OTHER EVENTS
    // ========================
    res.status(200).send("Webhook received");
    
  } catch (err) {
    console.error("❗ WEBHOOK ERROR:", err);
    res.status(500).send("Webhook error");
  }
});


// REGISTER COMPANY
app.post("/api/firmat", async (req, res) => {
  try {
    const { emriBiznesit, email, telefoni, passwordi, plani } = req.body;

    // 1. Kontrollo nëse email ekziston
    const ekziston = await Firma.findOne({ email });

    if (ekziston) {
      return res.status(400).json({
        success: false,
        message: "Ky email tashmë është i regjistruar."
      });
    }

    // 2. Krijo firmën e re
    const firma = new Firma({
      emriBiznesit,
      email,
      telefoni,
      passwordi,
      plani
    });

    await firma.save();

    return res.json({
      success: true,
      message: "Regjistrimi u krye me sukses!",
      firma
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Gabim serveri." });
  }
});


app.post("/register", async (req, res) => {
  try {
    const { name, email, address, phone, category, plan } = req.body;

    if (!name || !email || !address || !phone || !category || !plan) {
      return res.status(400).json({
        success: false,
        error: "Plotësoni të gjitha fushat."
      });
    }

    // kontrollo nëse email ekziston
    const exists = await Firma.findOne({ email });
    if (exists) {
      return res.status(409).json({
        success: false,
        error: "Ky email është përdorur tashmë në një llogari tjetër."
      });
    }

    const advantages = planAdvantages[plan] || [];

    const firma = new Firma({
      name,
      email,
      address,
      phone,
      category,
      plan,
      advantages
    });

    await firma.save();

    return res.json({
      success: true,
      message: "Firma u regjistrua me sukses. Vazhdo tek pagesa."
    });
  } catch (err) {
    console.error("/register error:", err);
    return res.status(500).json({
      success: false,
      error: "Gabim në server."
    });
  }
});


// ===== CONTACT (mbetet si më parë) =====
app.post("/contact", async (req, res) => {
  try {
    const msg = new Message(req.body);
    await msg.save();
    res.json({ success: true, message: "Message saved!" });
  } catch (err) {
    console.error("/contact error:", err);
    res.json({ success: false, error: err.message });
  }
});

app.get("/firms", async (req, res) => {
  const firms = await Firma.find();
  res.json(firms);
});



// ===== START =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

