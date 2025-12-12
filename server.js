import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
app.use(cors());

/* ================= CONFIG ================= */
const PORT = process.env.PORT || 5000;
const LEMON_SECRET = process.env.LEMON_WEBHOOK_SECRET;
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const DELETE_AFTER_DAYS = Number(process.env.DELETE_AFTER_DAYS || 2);
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 60);

/* ================= CLOUDINARY ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= MULTER ================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadBufferToCloudinary = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    );
    stream.end(buffer);
  });

/* ================= LOG ================= */
const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ================= MONGO ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => log("MongoDB Connected"))
  .catch(e => console.error(e));

/* ================= SCHEMA ================= */
const firmaSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  address: String,
  category: String,

  plan: { type: String, enum: ["basic", "standard", "premium"] },
  payment_status: { type: String, default: "pending" },

  advantages: [String],
  logoUrl: String,
  photos: [String],

  paid_at: Date,
  expires_at: Date,
  deleted_at: Date
}, { timestamps: true });

const Firma = mongoose.model("Firma", firmaSchema);

/* ================= PLAN ADVANTAGES ================= */
const planAdvantages = {
  basic: [
    "Listim bazë",
    "Kontakt publik",
    "Shfaqje standard"
  ],
  standard: [
    "Të gjitha nga BASIC",
    "Logo kompanie",
    "Deri 3 foto",
    "Pozicion më i mirë"
  ],
  premium: [
    "Të gjitha nga STANDARD",
    "Shumë foto",
    "Pozicion TOP",
    "Branding i avancuar"
  ]
};

/* ================= WEBHOOK ================= */
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    /* VERIFY SIGNATURE */
    const sig = req.headers["x-signature"] || "";
    const hash = crypto.createHmac("sha256", LEMON_SECRET).update(req.body).digest("hex");
    if (sig !== hash) return res.status(400).send("Invalid signature");

    const payload = JSON.parse(req.body.toString());
    const event = payload?.meta?.event_name;

    const email =
      payload?.data?.attributes?.checkout_data?.custom?.email ||
      payload?.data?.attributes?.customer_email;

    if (!email) return res.send("No email");

    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id ||
      payload?.data?.attributes?.subscription?.variant_id ||
      null;

    /* 🔴 FIX KRYESOR – MOS DEFAULT BASIC */
    let detectedPlan = null;
    if (variantId == process.env.VARIANT_STANDARD) detectedPlan = "standard";
    if (variantId == process.env.VARIANT_PREMIUM)  detectedPlan = "premium";

    if (
      event === "order_paid" ||
      event === "subscription_payment_success"
    ) {
      const update = {
        payment_status: "paid",
        paid_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        deleted_at: null
      };

      // ⚠️ vetëm nëse webhook e DI planin
      if (detectedPlan) {
        update.plan = detectedPlan;
        update.advantages = planAdvantages[detectedPlan];
      }

      await Firma.findOneAndUpdate(
        { email },
        { $set: update },
        { new: true }
      );

      log("PAID:", email, detectedPlan || "(plan kept)");
    }

    return res.send("OK");
  } catch (e) {
    console.error(e);
    res.status(500).send("Webhook error");
  }
});

/* ================= JSON ================= */
app.use(express.json());

/* ================= REGISTER ================= */
app.post("/register",
  upload.fields([{ name: "logo", maxCount: 1 }, { name: "photos", maxCount: 10 }]),
  async (req, res) => {
    try {
      const { name, email, phone, address, category, plan } = req.body;
      if (!name || !email || !plan) return res.status(400).json({ success:false });

      if (await Firma.findOne({ email }))
        return res.status(409).json({ success:false });

      let logoUrl = null;
      let photos = [];

      if (plan !== "basic") {
        if (req.files?.logo)
          logoUrl = await uploadBufferToCloudinary(req.files.logo[0].buffer, "easyfix/logos");

        if (req.files?.photos) {
          const max = plan === "standard" ? 3 : 8;
          for (const f of req.files.photos.slice(0, max))
            photos.push(await uploadBufferToCloudinary(f.buffer, "easyfix/photos"));
        }
      }

      await new Firma({
        name, email, phone, address, category,
        plan,
        payment_status: "pending",
        advantages: planAdvantages[plan],
        logoUrl,
        photos
      }).save();

      res.json({ success:true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success:false });
    }
  }
);

/* ================= FIRMS ================= */
app.get("/firms", async (req, res) => {
  const firms = await Firma.find({ payment_status: "paid" }).select("-__v");
  res.json(firms);
});

/* ================= CLEANUP ================= */
setInterval(async () => {
  const now = new Date();
  await Firma.updateMany(
    { payment_status: "paid", expires_at: { $lte: now } },
    { payment_status: "expired" }
  );

  const cutoff = new Date(Date.now() - DELETE_AFTER_DAYS * 86400000);
  await Firma.deleteMany({ payment_status: "expired", expires_at: { $lte: cutoff } });
}, CHECK_INTERVAL_MINUTES * 60000);

/* ================= START ================= */
app.listen(PORT, () => log(`Server running on ${PORT}`));
