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
const DELETE_AFTER_DAYS = Number(process.env.DELETE_AFTER_DAYS || 2);
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 60);

/* ================= CLOUDINARY ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= MULTER ================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadBuffer = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (err, result) => {
        if (err) reject(err);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });

/* ================= MONGO ================= */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("MongoDB error:", err));

/* ================= SCHEMA ================= */
const FirmaSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    phone: String,
    address: String,
    category: String,

    plan: { type: String, default: "basic" },
    payment_status: { type: String, default: "pending" },

    advantages: [String],
    logoUrl: String,
    photos: [String],

    paid_at: Date,
    expires_at: Date,
    deleted_at: Date,
  },
  { timestamps: true }
);

const Firma = mongoose.model("Firma", FirmaSchema);

/* ================= PLAN ADVANTAGES ================= */
const planAdvantages = {
  basic: [
    "Listim bazë",
    "Kontakt bazë",
    "Shfaqje standard",
  ],
  standard: [
    "Të gjitha nga BASIC",
    "Logo e kompanisë",
    "Deri 3 foto",
    "Pozicion më i mirë",
  ],
  premium: [
    "Të gjitha nga STANDARD",
    "Deri 8 foto",
    "Pozicion Top",
    "Promovim i avancuar",
  ],
};

/* ================= WEBHOOK ================= */
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-signature"] || "";
      const hmac = crypto
        .createHmac("sha256", LEMON_SECRET)
        .update(req.body)
        .digest("hex");

      if (signature !== hmac) {
        console.warn("❌ Invalid webhook signature");
        return res.status(400).send("Invalid signature");
      }

      const payload = JSON.parse(req.body.toString());
      const event = payload?.meta?.event_name;

      const email =
        payload?.data?.attributes?.checkout_data?.custom?.email ||
        payload?.data?.attributes?.user_email ||
        payload?.data?.attributes?.customer_email;

      if (!email) return res.sendStatus(200);

      /* 🔑 VARIANT → PLAN (PA DEFAULT BASIC!) */
      const variantId =
        payload?.data?.attributes?.first_order_item?.variant_id ||
        payload?.data?.attributes?.variant_id ||
        null;

      let detectedPlan = null;
      if (variantId == process.env.VARIANT_STANDARD) detectedPlan = "standard";
      if (variantId == process.env.VARIANT_PREMIUM) detectedPlan = "premium";

      /* ✅ UPDATE SAFE (NUK ULET PLANI) */
      if (
        event === "order_paid" ||
        event === "subscription_payment_success"
      ) {
        const update = {
          payment_status: "paid",
          paid_at: new Date(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          deleted_at: null,
        };

        if (detectedPlan) {
          update.plan = detectedPlan;
          update.advantages = planAdvantages[detectedPlan];
        }

        await Firma.findOneAndUpdate(
          { email },
          { $set: update },
          { new: true }
        );

        return res.sendStatus(200);
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error("WEBHOOK ERROR:", err);
      return res.sendStatus(500);
    }
  }
);

/* ================= JSON ================= */
app.use(express.json());

/* ================= REGISTER ================= */
// --- REGISTER endpoint (me logo + foto për standard/premium) ---
app.post(
  "/register",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const { name, email, phone, address, category, plan } = req.body;

      if (!name || !email || !phone || !address || !category || !plan) {
        return res
          .status(400)
          .json({ success: false, error: "Missing fields" });
      }

      const exists = await Firma.findOne({ email });
      if (exists) {
        return res
          .status(409)
          .json({ success: false, error: "Ky email tashmë është i ekzistuar" });
      }

      // Përgatit advantage sipas planit
      const advantages = planAdvantages[plan] || [];

      let logoUrl = "";
      let photos = [];

      // Logo & foto LEJOHEN VETËM për standard/premium
      if (plan === "standard" || plan === "premium") {
        const files = req.files || {};

        // LOGO
        if (files.logo && files.logo[0]) {
          try {
            logoUrl = await uploadBufferToCloudinary(
              files.logo[0].buffer,
              "easyfix/logos"
            );
          } catch (err) {
            console.errorWithTime("Cloudinary logo upload error:", err);
          }
        }

        // FOTOT
        if (files.photos && files.photos.length > 0) {
          // limit fotot sipas planit
          const maxPhotos = plan === "standard" ? 3 : 20;
          const slice = files.photos.slice(0, maxPhotos);

          for (const file of slice) {
            try {
              const url = await uploadBufferToCloudinary(
                file.buffer,
                "easyfix/photos"
              );
              photos.push(url);
            } catch (err) {
              console.errorWithTime("Cloudinary photo upload error:", err);
            }
          }
        }
      }

      const firma = new Firma({
        name,
        email,
        phone,
        address,
        category,
        plan,
        advantages,
        payment_status: "pending", // fillimisht pending
        logoUrl: logoUrl || null,
        photos,
      });

      await firma.save();
      log("🆕 Registered (pending):", email);

      return res.json({
        success: true,
        message: "Regjistrimi u ruajt si pending. Vazhdoni me pagesën.",
        redirectUrl: `/success.html?email=${email}`, // Send the user to the success page
      });
    } catch (err) {
      console.errorWithTime("REGISTER ERROR:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  }
);

/* ================= PUBLIC ================= */
app.get("/firms", async (_, res) => {
  const firms = await Firma.find({ payment_status: "paid" });
  res.json(firms);
});

/* ================= CLEANUP ================= */
setInterval(async () => {
  const now = new Date();

  await Firma.updateMany(
    { payment_status: "paid", expires_at: { $lte: now } },
    { payment_status: "expired" }
  );

  const cutoff = new Date(
    Date.now() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000
  );

  await Firma.deleteMany({
    payment_status: "expired",
    expires_at: { $lte: cutoff },
  });
}, CHECK_INTERVAL_MINUTES * 60 * 1000);

/* ================= START ================= */
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
