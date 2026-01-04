import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { Resend } from "resend";


dotenv.config();

const app = express();
app.use(cors());





/* ================= resend email ================= */
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const RESEND_FROM = String(process.env.RESEND_FROM || "").trim(); // p.sh. EasyFix <no-reply@easyfix.services>
const RESEND_REPLY_TO = String(process.env.RESEND_REPLY_TO || "").trim();
const FRONTEND_BASE_URL = String(process.env.FRONTEND_BASE_URL || "http://easyfix.services").replace(/\/+$/, "");

const resend = (RESEND_API_KEY && RESEND_FROM) ? new Resend(RESEND_API_KEY) : null;

async function sendMail({ to, subject, html, text }) {
  if (!resend) throw new Error("Resend not configured (missing RESEND_API_KEY or RESEND_FROM)");
  await resend.emails.send({
    from: RESEND_FROM,
    to,
    subject,
    html,
    text,
    ...(RESEND_REPLY_TO ? { replyTo: RESEND_REPLY_TO } : {}),
  });
}




/* ================= CONFIG ================= */
const PORT = process.env.PORT || 5000;

const LEMON_WEBHOOK_SECRET = process.env.LEMON_WEBHOOK_SECRET || "";
const LEMON_API_KEY = process.env.LEMON_API_KEY || "";
const LEMON_STORE_ID = String(process.env.LEMON_STORE_ID || "");

const VARIANT_BASIC = String(process.env.VARIANT_BASIC || "");
const VARIANT_STANDARD = String(process.env.VARIANT_STANDARD || "");
const VARIANT_PREMIUM = String(process.env.VARIANT_PREMIUM || "");

const FRONTEND_SUCCESS_URL =
  process.env.FRONTEND_SUCCESS_URL ||
  "https://sabriaj.github.io/EasyFix/success.html";

const DELETE_AFTER_DAYS = Number(process.env.DELETE_AFTER_DAYS || 2);
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 60);

const DEFAULT_COUNTRY = String(process.env.DEFAULT_COUNTRY || "MK").toUpperCase();

/* ================= LOG HELPERS ================= */
function now() { return new Date().toISOString(); }
function log(...args) { console.log(now(), ...args); }
function errorWithTime(...args) { console.error(now(), ...args); }

/* ================= CLOUDINARY ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= MULTER ================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB/file
});

function uploadBufferToCloudinary(buffer, folder = "easyfix") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) return reject(err);
      resolve(result.secure_url);
    });
    stream.end(buffer);
  });
}

/* ================= HELPERS ================= */
function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

  function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex"); // 64 chars
}

function cloudinaryPublicIdFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");

    // find "upload"
    const idx = parts.findIndex(p => p === "upload");
    if (idx === -1) return null;

    // everything after upload/ (skip version v123)
    let rest = parts.slice(idx + 1).join("/");
    rest = rest.replace(/^v\d+\//, ""); // remove v123/

    // remove extension
    rest = rest.replace(/\.[a-zA-Z0-9]+$/, "");

    return rest || null; // includes folder path
  } catch {
    return null;
  }
}

async function deleteCloudinaryByUrl(url) {
  const pid = cloudinaryPublicIdFromUrl(url);
  if (!pid) return;
  try {
    await cloudinary.uploader.destroy(pid, { resource_type: "image" });
  } catch (e) {
    // mos e ndal deletion komplet nëse cloudinary failon
    errorWithTime("Cloudinary delete failed:", pid, e?.message || e);
  }
}


function normalizeCountry(raw) {
  const c = String(raw || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c;
  return DEFAULT_COUNTRY;
}

/**
 * normalizePhone:
 * - Preferon E.164 (+...).
 * - Pranon vetëm + dhe numra.
 * - Fallback MK local (8/9 shifra) -> +389...
 */
function normalizePhone(raw) {
  let p = String(raw || "").trim();
  p = p.replace(/[^\d+]/g, "");

  if (p.startsWith("00")) p = "+" + p.slice(2);

  // E.164
  if (p.startsWith("+")) {
    if (p.length < 9 || p.length > 16) return null;
    return p;
  }

  // fallback MK local (vetëm nëse vjen pa +)
  const digits = p.replace(/[^\d]/g, "");
  if (digits.length === 8) return "+389" + digits;
  if (digits.length === 9 && digits.startsWith("0")) return "+389" + digits.slice(1);

  return null;
}

/* ================= SCHEMA ================= */
const firmaSchema = new mongoose.Schema(
  {

        // === OWNER SELF-SERVICE TOKENS (magic links) ===
    owner_token_hash: String,
    owner_token_expires: Date,

    delete_token_hash: String,
    delete_token_expires: Date,

    name: String,
    email: { type: String, unique: true, required: true },
    phone: String, // E.164 +...
    phone_verified: { type: Boolean, default: false },
    phone_verified_at: Date,

    address: String,
    category: String,

    // Country for international use (ISO2)
    country: { type: String, default: DEFAULT_COUNTRY, index: true },

    plan: { type: String, default: "basic" },
    payment_status: { type: String, default: "pending", index: true },

    logoUrl: String,
    photos: [String],

    paid_at: Date,
    expires_at: Date,
    deleted_at: Date,
  },
  { timestamps: true }
);

// ✅ Index për /firms dhe admin filters
firmaSchema.index({ payment_status: 1, country: 1, plan: 1, createdAt: -1 });

const Firma = mongoose.model("Firma", firmaSchema);

/* ================= PLAN RULES ================= */
const planPhotoLimit = { basic: 0, standard: 3, premium: 8 };

function detectPlanFromVariant(variantId) {
  const v = String(variantId || "");
  if (v && v === VARIANT_BASIC) return "basic";
  if (v && v === VARIANT_STANDARD) return "standard";
  if (v && v === VARIANT_PREMIUM) return "premium";
  return null;
}

function planToVariant(plan) {
  if (plan === "premium") return VARIANT_PREMIUM;
  if (plan === "standard") return VARIANT_STANDARD;
  return VARIANT_BASIC;
}

/* ================= ADMIN AUTH ================= */
const ADMIN_KEY = String(process.env.ADMIN_KEY || "").trim();

function requireAdmin(req, res, next) {
  try {
    if (!ADMIN_KEY) {
      return res.status(500).json({ success: false, error: "ADMIN_KEY is not configured on server" });
    }
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || token !== ADMIN_KEY) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    next();
  } catch {
    return res.status(500).json({ success: false, error: "Admin auth error" });
  }
}

/* ================= ADMIN: LIST FIRMS ================= */
app.get("/admin/firms", requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "all").toLowerCase();
    const plan = String(req.query.plan || "all").toLowerCase();
    const country = String(req.query.country || "all").toUpperCase();
    const search = String(req.query.search || "").trim().toLowerCase();

    const q = {};
    if (status !== "all") q.payment_status = status;
    if (plan !== "all") q.plan = plan;
    if (country !== "ALL") q.country = country;

    let firms = await Firma.find(q).select("-__v").sort({ createdAt: -1 }).lean();

    if (search) {
      firms = firms.filter(f => {
        const hay = [
          f.name, f.email, f.phone, f.category, f.address,
          f.country
        ].map(x => String(x || "").toLowerCase()).join(" | ");
        return hay.includes(search);
      });
    }

    return res.json({ success: true, firms });
  } catch (err) {
    errorWithTime("ADMIN FIRMS ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= ADMIN: UPDATE FIRM ================= */
app.put("/admin/firms/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ success: false, error: "Missing id" });

    const patch = {};
    const allow = ["name", "phone", "address", "category", "plan", "country", "payment_status", "expires_at"];
    for (const k of allow) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }

    if (patch.phone !== undefined) {
      const phoneNorm = normalizePhone(patch.phone);
      if (!phoneNorm) return res.status(400).json({ success: false, error: "Invalid phone" });
      patch.phone = phoneNorm;
    }

    if (patch.plan !== undefined) {
      const p = String(patch.plan || "").toLowerCase();
      if (!["basic", "standard", "premium"].includes(p)) {
        return res.status(400).json({ success: false, error: "Invalid plan" });
      }
      patch.plan = p;
    }

    if (patch.payment_status !== undefined) {
      const s = String(patch.payment_status || "").toLowerCase();
      if (!["pending", "paid", "expired"].includes(s)) {
        return res.status(400).json({ success: false, error: "Invalid payment_status" });
      }
      patch.payment_status = s;
    }

    if (patch.country !== undefined) {
      patch.country = normalizeCountry(patch.country);
    }

    const updated = await Firma.findByIdAndUpdate(id, { $set: patch }, { new: true }).select("-__v").lean();
    if (!updated) return res.status(404).json({ success: false, error: "Not found" });

    return res.json({ success: true, firm: updated });
  } catch (err) {
    errorWithTime("ADMIN UPDATE ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= ADMIN: MARK PAID ================= */
app.post("/admin/firms/:id/mark-paid", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ success: false, error: "Missing id" });

    const days = Number(req.body?.days || 30);
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const updated = await Firma.findByIdAndUpdate(
      id,
      { $set: { payment_status: "paid", paid_at: new Date(), expires_at: expires, deleted_at: null } },
      { new: true }
    ).select("-__v").lean();

    if (!updated) return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, firm: updated });
  } catch (err) {
    errorWithTime("ADMIN MARK PAID ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= ADMIN: EXPIRE ================= */
app.post("/admin/firms/:id/expire", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const updated = await Firma.findByIdAndUpdate(
      id,
      { $set: { payment_status: "expired", expires_at: new Date() } },
      { new: true }
    ).select("-__v").lean();

    if (!updated) return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, firm: updated });
  } catch (err) {
    errorWithTime("ADMIN EXPIRE ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= ADMIN: DELETE ================= */
app.delete("/admin/firms/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const r = await Firma.deleteOne({ _id: id });
    return res.json({ success: true, deleted: r.deletedCount === 1 });
  } catch (err) {
    errorWithTime("ADMIN DELETE ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= ADMIN: STATS ================= */
app.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    const [pending, paid, expired, total] = await Promise.all([
      Firma.countDocuments({ payment_status: "pending" }),
      Firma.countDocuments({ payment_status: "paid" }),
      Firma.countDocuments({ payment_status: "expired" }),
      Firma.countDocuments({}),
    ]);

    return res.json({ success: true, stats: { total, pending, paid, expired } });
  } catch (err) {
    errorWithTime("ADMIN STATS ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= CREATE CHECKOUT (LEMON API) ================= */
async function createLemonCheckout({ variantId, email, firmId }) {
  if (!LEMON_API_KEY) throw new Error("Missing LEMON_API_KEY");
  if (!LEMON_STORE_ID) throw new Error("Missing LEMON_STORE_ID");
  if (!variantId) throw new Error("Missing variantId");

  const redirectUrl =
    `${FRONTEND_SUCCESS_URL}?email=${encodeURIComponent(email)}&firmId=${encodeURIComponent(String(firmId || ""))}`;

  const payload = {
    data: {
      type: "checkouts",
      attributes: {
        product_options: { redirect_url: redirectUrl },
        checkout_data: {
          email,
          custom: { email, firmId: String(firmId || "") },
        },
      },
      relationships: {
        store: { data: { type: "stores", id: String(LEMON_STORE_ID) } },
        variant: { data: { type: "variants", id: String(variantId) } },
      },
    },
  };

  const resp = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LEMON_API_KEY}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify(payload),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Lemon API error: ${resp.status} ${JSON.stringify(json)}`);

  const url = json?.data?.attributes?.url;
  if (!url) throw new Error("Checkout URL missing from Lemon response");
  return url;
}

/* ================= WEBHOOK (RAW BODY) ================= */
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    let signature = req.headers["x-signature"] || req.headers["x-signature-256"] || "";
    signature = String(signature || "").trim();

    const hmac = crypto
      .createHmac("sha256", LEMON_WEBHOOK_SECRET)
      .update(req.body)
      .digest("hex");

    if (signature.startsWith("sha256=")) signature = signature.slice(7);

    if (!signature || signature !== hmac) {
      log("❌ Invalid signature", { received: signature, computed: hmac });
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(req.body.toString());
    const event = payload?.meta?.event_name || payload?.event || "unknown";

    const emailRaw =
      payload?.data?.attributes?.checkout_data?.custom?.email ||
      payload?.data?.attributes?.checkout_data?.email ||
      payload?.data?.attributes?.user_email ||
      payload?.data?.attributes?.customer_email ||
      null;

    const email = normalizeEmail(emailRaw);

    const variantId =
      payload?.data?.attributes?.first_order_item?.variant_id ||
      payload?.data?.attributes?.variant_id ||
      payload?.data?.attributes?.subscription?.variant_id ||
      null;

    const firmIdRaw =
      payload?.meta?.custom_data?.firmId ||
      payload?.data?.attributes?.checkout_data?.custom?.firmId ||
      payload?.data?.attributes?.checkout_data?.custom?.firm_id ||
      null;

    const firmId = firmIdRaw ? String(firmIdRaw) : null;
    const detectedPlan = detectPlanFromVariant(variantId);

    log("🔔 Webhook", { event, email, variantId, detectedPlan, firmId });

    if (!email && !firmId) return res.status(200).send("No identifier");

    if (event === "order_paid" || event === "subscription_payment_success") {
      const update = {
        payment_status: "paid",
        paid_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        deleted_at: null,
      };
      if (detectedPlan) update.plan = detectedPlan;

      let updated = null;
      if (firmId) {
        updated = await Firma.findByIdAndUpdate(firmId, { $set: update }, { new: true });
      } else if (email) {
        updated = await Firma.findOneAndUpdate({ email }, { $set: update }, { upsert: false, new: true });
      }

      if (!updated) log("⚠️ Paid webhook but firm not found", { firmId, email });
      else log("✅ Marked paid:", { id: updated._id, email: updated.email, plan: updated.plan });

      return res.status(200).send("OK");
    }

    if (event === "subscription_cancelled" || event === "subscription_expired" || event === "order_refunded") {
      if (firmId) {
        await Firma.findByIdAndUpdate(firmId, { $set: { payment_status: "expired", expires_at: new Date() } });
      } else if (email) {
        await Firma.findOneAndUpdate({ email }, { $set: { payment_status: "expired", expires_at: new Date() } });
      }
      return res.status(200).send("OK");
    }

    return res.status(200).send("Ignored");
  } catch (err) {
    errorWithTime("WEBHOOK ERROR:", err);
    return res.status(500).send("Webhook error");
  }
});

/* ================= JSON (AFTER WEBHOOK) ================= */
app.use(express.json());


app.post("/delete-request", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const reason = String(req.body?.reason || "").slice(0, 500);

    if (!email) {
      return res.status(400).json({ success: false, error: "Missing email" });
    }

    // Mos e zbulo nëse ekziston ose jo (anti-abuse)
    const firm = await Firma.findOne({ email });

    if (!firm) {
      return res.json({ success: true, message: "If this email exists, we sent a confirmation link." });
    }

    const token = makeToken();
    const tokenHash = sha256Hex(token);
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 orë

    await Firma.updateOne(
      { _id: firm._id },
      { $set: { delete_token_hash: tokenHash, delete_token_expires: expires } }
    );

    const confirmUrl = `${FRONTEND_BASE_URL}/delete-confirm.html?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

    const subject = "EasyFix – Confirm data deletion";
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Confirm deletion request</h2>
        <p>We received a request to delete the EasyFix business listing for:</p>
        <p><b>${email}</b></p>
        ${reason ? `<p><b>Reason:</b> ${reason.replace(/</g,"&lt;")}</p>` : ""}
        <p>This link expires in 1 hour.</p>
        <p><a href="${confirmUrl}" style="display:inline-block;padding:10px 14px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Confirm deletion</a></p>
        <p>If you did not request this, ignore this email.</p>
      </div>
    `;
    const text = `Confirm deletion: ${confirmUrl}\nEmail: ${email}\nExpires: 1 hour`;

    await sendMail({ to: email, subject, html, text });

    return res.json({ success: true, message: "Confirmation link sent to email." });
  } catch (err) {
    errorWithTime("DELETE-REQUEST ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});



app.post("/delete-confirm", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const token = String(req.body?.token || "").trim();

    if (!email || !token) {
      return res.status(400).json({ success: false, error: "Missing email/token" });
    }

    const tokenHash = sha256Hex(token);

    const firm = await Firma.findOne({
      email,
      delete_token_hash: tokenHash,
      delete_token_expires: { $gt: new Date() },
    });

    if (!firm) {
      return res.status(400).json({ success: false, error: "Invalid or expired token" });
    }

    // fshi media në cloudinary (best-effort)
    const urls = [];
    if (firm.logoUrl) urls.push(firm.logoUrl);
    if (Array.isArray(firm.photos)) urls.push(...firm.photos);

    for (const u of urls) {
      await deleteCloudinaryByUrl(u);
    }

    // fshi firmën
    await Firma.deleteOne({ _id: firm._id });

    return res.json({ success: true, message: "Deleted." });
  } catch (err) {
    errorWithTime("DELETE-CONFIRM ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});


app.post("/owner/request-link", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ success: false, error: "Missing email" });

    const firm = await Firma.findOne({ email });
    if (!firm) {
      return res.json({ success: true, message: "If this email exists, we sent a link." });
    }

    const token = makeToken();
    const tokenHash = sha256Hex(token);
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 orë

    await Firma.updateOne(
      { _id: firm._id },
      { $set: { owner_token_hash: tokenHash, owner_token_expires: expires } }
    );

    const manageUrl = `${FRONTEND_BASE_URL}/manage.html?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

    await sendMail({
      to: email,
      subject: "EasyFix – Manage your business listing",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Manage your listing</h2>
        <p>Open this link to update your business info. Expires in 1 hour.</p>
        <p><a href="${manageUrl}" style="display:inline-block;padding:10px 14px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Open manage page</a></p>
      </div>`,
      text: `Manage link: ${manageUrl}`,
    });

    return res.json({ success: true, message: "Manage link sent." });
  } catch (err) {
    errorWithTime("OWNER REQUEST LINK ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});



app.get("/owner/me", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    const token = String(req.query.token || "").trim();
    if (!email || !token) return res.status(400).json({ success: false, error: "Missing email/token" });

    const tokenHash = sha256Hex(token);

    const firm = await Firma.findOne({
      email,
      owner_token_hash: tokenHash,
      owner_token_expires: { $gt: new Date() },
    }).select("-__v").lean();

    if (!firm) return res.status(400).json({ success: false, error: "Invalid or expired token" });

    return res.json({ success: true, firm });
  } catch (err) {
    errorWithTime("OWNER ME ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});


app.put("/owner/update", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const token = String(req.body?.token || "").trim();
    if (!email || !token) return res.status(400).json({ success: false, error: "Missing email/token" });

    const tokenHash = sha256Hex(token);

    const firm = await Firma.findOne({
      email,
      owner_token_hash: tokenHash,
      owner_token_expires: { $gt: new Date() },
    });

    if (!firm) return res.status(400).json({ success: false, error: "Invalid or expired token" });

    // allow vetëm këto (text-only për tani)
const patch = {};
const allow = ["name", "phone", "address", "category", "country"];
for (const k of allow) {
  if (req.body?.[k] !== undefined) patch[k] = String(req.body[k]).trim();
}

if (patch.phone !== undefined) {
  const phoneNorm = normalizePhone(patch.phone);
  if (!phoneNorm) return res.status(400).json({ success: false, error: "Invalid phone" });
  patch.phone = phoneNorm;
}

if (patch.country !== undefined) {
  patch.country = normalizeCountry(patch.country);
}


    // update
    const updated = await Firma.findByIdAndUpdate(
      firm._id,
      { $set: patch },
      { new: true }
    ).select("-__v").lean();

    return res.json({ success: true, firm: updated });
  } catch (err) {
    errorWithTime("OWNER UPDATE ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});


/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  const rs = mongoose.connection.readyState; // 0=disc,1=conn,2=conning,3=disconning
  res.json({ ok: true, time: now(), dbReadyState: rs });
});

/* ================= REGISTER (multipart) ================= */
app.post(
  "/register",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  async (req, res) => {
    let createdId = null;
    try {
      let { name, email, phone, address, category, plan, country } = req.body;

      email = normalizeEmail(email);
      const phoneNorm = normalizePhone(phone);
      const countryNorm = normalizeCountry(country);

      if (!name || !email || !phoneNorm || !address || !category || !plan) {
        return res.status(400).json({ success: false, error: "Missing fields" });
      }
      if (!["basic", "standard", "premium"].includes(plan)) {
        return res.status(400).json({ success: false, error: "Invalid plan" });
      }

      const exists = await Firma.findOne({ email }).lean();
      if (exists) {
        return res.status(409).json({ success: false, error: "Ky email tashmë ekziston" });
      }

      let logoUrl = null;
      let photos = [];

      if (plan === "standard" || plan === "premium") {
        const files = req.files || {};
        if (files.logo?.[0]) {
          logoUrl = await uploadBufferToCloudinary(files.logo[0].buffer, "easyfix/logos");
        }

        const maxPhotos = planPhotoLimit[plan] || 0;
        const picked = (files.photos || []).slice(0, maxPhotos);

        for (const f of picked) {
          const url = await uploadBufferToCloudinary(f.buffer, "easyfix/photos");
          photos.push(url);
        }
      }

      if (plan === "basic") {
        logoUrl = null;
        photos = [];
      }

      const firma = await Firma.create({
        name,
        email,
        phone: phoneNorm,
        phone_verified: false,
        phone_verified_at: null,
        address,
        category,
        country: countryNorm,
        plan,
        payment_status: "pending",
        logoUrl,
        photos,
      });

      createdId = firma._id;

      const variantId = planToVariant(plan);
      const checkoutUrl = await createLemonCheckout({
        variantId,
        email,
        firmId: String(firma._id),
      });

      return res.json({
        success: true,
        message: "Regjistrimi u ruajt. Vazhdoni me pagesën.",
        checkoutUrl,
      });
    } catch (err) {
      errorWithTime("REGISTER ERROR:", err);

      if (createdId) {
        try { await Firma.deleteOne({ _id: createdId }); } catch {}
      }

      return res.status(500).json({ success: false, error: "Server error" });
    }
  }
);

/* ================= PUBLIC ================= */
// ✅ /firms?country=MK -> kthen vetëm firmat e atij shteti
app.get("/firms", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const qCountry = String(req.query.country || "").trim().toUpperCase();
    const base = { payment_status: "paid" };

    // nëse kërkohet country:
    if (/^[A-Z]{2}$/.test(qCountry)) {
      // për MK, përfshi edhe firmat e vjetra pa field country (i trajtojmë si MK)
      if (qCountry === "MK") {
        const firms = await Firma.find({
          ...base,
          $or: [
            { country: "MK" },
            { country: { $exists: false } },
            { country: null },
            { country: "" },
          ],
        })
          .select("-__v")
          .sort({ createdAt: -1 })
          .lean();

        return res.json(firms);
      }

      const firms = await Firma.find({ ...base, country: qCountry })
        .select("-__v")
        .sort({ createdAt: -1 })
        .lean();

      return res.json(firms);
    }

    // default: krejt paid (nëse s’ka country param)
    const firms = await Firma.find(base)
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(firms);
  } catch (err) {
    errorWithTime("FIRMS ERROR:", err);
    return res.status(500).send("Server error");
  }
});

app.get("/check-status", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    if (!email) return res.status(400).json({ success: false, error: "Missing email" });

    const f = await Firma.findOne({ email }).select("-__v").lean();
    if (!f) return res.status(404).json({ success: false, error: "Not found" });

    return res.json({ success: true, firma: f });
  } catch (err) {
    errorWithTime("CHECK-STATUS ERROR:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================= CLEANUP ================= */
async function runCleanup() {
  const nowDate = new Date();

  await Firma.updateMany(
    { payment_status: "paid", expires_at: { $lte: nowDate } },
    { $set: { payment_status: "expired" } }
  );

  const cutoff = new Date(Date.now() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  await Firma.deleteMany({ payment_status: "expired", expires_at: { $lte: cutoff } });
}

/* ================= MONGO + START ================= */
async function connectMongo() {
  if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI");

  await mongoose.connect(process.env.MONGO_URI, {
    autoIndex: true,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  log("✅ MongoDB Connected");
}

async function start() {
  try {
    await connectMongo();

    // warmup query (e zvogëlon “lag” në request-in e parë)
    await Firma.findOne({}).select("_id").lean();

    // start cleanup vetëm pasi DB u lidh
    setInterval(async () => {
      try { await runCleanup(); }
      catch (e) { errorWithTime("Cleanup error:", e); }
    }, CHECK_INTERVAL_MINUTES * 60 * 1000);

    app.listen(PORT, () => log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    errorWithTime("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();
