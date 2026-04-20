export function registerAdminRoutes({
  app,
  adminRouteLimiter,
  requireAdmin,
  Firma,
  sendMail,
  normalizeEmail,
  runCleanup,
  errorWithTime,
  normalizePhone,
  normalizeCountry,
  parseCategoriesFromBody,
  applyCategoryPlanLimit
}) {
  const notDeleted = {
    $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }]
  };

  app.get("/admin/stats", adminRouteLimiter, requireAdmin, async (req, res) => {
    try {
      const base = {
        ...notDeleted,
        name: { $exists: true, $nin: [null, ""] }
      };
      const total = await Firma.countDocuments(base);
      const active = await Firma.countDocuments({ ...base, payment_status: "active" });
      const premium = await Firma.countDocuments({ ...base, plan: "premium" });
      const free = await Firma.countDocuments({ ...base, plan: "free" });

      return res.json({
        success: true,
        stats: { total, active, premium, free }
      });
    } catch (err) {
      errorWithTime("ADMIN STATS ERROR:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  app.delete("/admin/firms/:id", adminRouteLimiter, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ success: false, error: "Missing id" });

      const deleted = await Firma.findByIdAndUpdate(
        id,
        {
          $set: {
            deleted_at: new Date(),
            payment_status: "expired",
            plan: "free",
            is_boosted: false,
            boost_expires_at: null,
            expires_at: null
          }
        },
        { new: true }
      ).lean();
      if (!deleted) return res.status(404).json({ success: false, error: "Not found" });

      return res.json({ success: true });
    } catch (err) {
      errorWithTime("ADMIN DELETE ERROR:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  app.post("/admin/firms/:id/restore", adminRouteLimiter, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ success: false, error: "Missing id" });

      const restored = await Firma.findByIdAndUpdate(
        id,
        {
          $set: {
            deleted_at: null,
            payment_status: "active",
            plan: "free",
            is_boosted: false,
            boost_expires_at: null,
            paid_at: null,
            expires_at: null
          }
        },
        { new: true }
      ).lean();

      if (!restored) return res.status(404).json({ success: false, error: "Not found" });

      return res.json({ success: true, firm: restored });
    } catch (err) {
      errorWithTime("ADMIN RESTORE ERROR:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  app.post("/admin/firms/:id/expire", adminRouteLimiter, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ success: false, error: "Missing id" });

      const nowD = new Date();
      const updated = await Firma.findByIdAndUpdate(
        id,
        {
          $set: {
            payment_status: "expired",
            plan: "free",
            is_boosted: false,
            boost_expires_at: null,
            expires_at: nowD
          }
        },
        { new: true }
      ).lean();

      if (!updated) return res.status(404).json({ success: false, error: "Not found" });

      return res.json({ success: true, firm: updated });
    } catch (err) {
      errorWithTime("ADMIN EXPIRE ERROR:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  app.post("/admin/firms/:id/mark-paid", adminRouteLimiter, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ success: false, error: "Missing id" });

      const daysRaw = req.body?.days;
      let days = Number(daysRaw);
      if (!Number.isFinite(days) || days <= 0) days = 30;
      days = Math.min(3650, Math.max(1, Math.floor(days)));

      const nowD = new Date();
      const expires = new Date(nowD.getTime() + days * 24 * 60 * 60 * 1000);

      const updated = await Firma.findByIdAndUpdate(
        id,
        {
          $set: {
            payment_status: "active",
            plan: "premium",
            is_boosted: true,
            boost_expires_at: expires,
            paid_at: nowD,
            expires_at: expires,
            deleted_at: null
          }
        },
        { new: true }
      ).lean();

      if (!updated) return res.status(404).json({ success: false, error: "Not found" });

      return res.json({ success: true, firm: updated });
    } catch (err) {
      errorWithTime("ADMIN MARK-PAID ERROR:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  app.post("/admin/test-email", adminRouteLimiter, requireAdmin, async (req, res) => {
    try {
      const to = normalizeEmail(req.body?.to);
      if (!to) return res.status(400).json({ success: false, error: "Missing to" });
      await sendMail({
        to,
        subject: "EasyFix - Test Email",
        text: "Ky ështё test email nga EasyFix (Resend).",
        html: "<p>Ky ështё <b>test email</b> nga EasyFix (Resend).</p>"
      });
      return res.json({ success: true });
    } catch (err) {
      errorWithTime("ADMIN TEST EMAIL ERROR:", err);
      return res.status(500).json({ success: false, error: String(err?.message || err) });
    }
  });

  app.post("/admin/run-scheduler", adminRouteLimiter, requireAdmin, async (req, res) => {
    try {
      await runCleanup();
      return res.json({ success: true });
    } catch (err) {
      errorWithTime("ADMIN RUN SCHEDULER ERROR:", err);
      return res.status(500).json({ success: false, error: String(err?.message || err) });
    }
  });

  app.post("/admin/migrate-legacy-firms", adminRouteLimiter, requireAdmin, async (req, res) => {
    try {
      const firms = await Firma.find({
        name: { $exists: true, $nin: [null, ""] },
        is_stub: { $ne: true }
      }).select("_id plan payment_status is_boosted boost_expires_at name").lean();

      let updatedCount = 0;

      for (const firm of firms) {
        const oldPlan = String(firm.plan || "").toLowerCase();
        const oldStatus = String(firm.payment_status || "").toLowerCase();
        const update = {};

        if (["pending", "paid", "trial", "active", ""].includes(oldStatus)) {
          update.payment_status = "active";
        } else if (oldStatus === "expired") {
          update.payment_status = "expired";
        }

        if (oldPlan === "premium") {
          update.plan = "premium";
          update.is_boosted = oldStatus !== "expired";
          if (oldStatus === "expired") {
            update.boost_expires_at = null;
          }
        } else {
          update.plan = "free";
          update.is_boosted = false;
          update.boost_expires_at = null;
        }

        if (Object.keys(update).length > 0) {
          await Firma.updateOne({ _id: firm._id }, { $set: update });
          updatedCount++;
        }
      }

      return res.json({ success: true, updatedCount });
    } catch (err) {
      errorWithTime("ADMIN MIGRATE LEGACY FIRMS ERROR:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  app.get("/admin/firms", adminRouteLimiter, requireAdmin, async (req, res) => {
    try {
      const status = String(req.query.status || "all").toLowerCase();
      const plan = String(req.query.plan || "all").toLowerCase();
      const country = String(req.query.country || "all").toUpperCase();
      const search = String(req.query.search || "").trim().toLowerCase();
      const includeStubs = String(req.query.include_stubs || "") === "1";
      const includeDeleted = String(req.query.include_deleted || "") === "1";

      const q = includeDeleted ? {} : { ...notDeleted };
      if (status !== "all") q.payment_status = status;
      if (plan !== "all") q.plan = plan;
      if (country !== "ALL") q.country = country;

      let firms = await Firma.find(q).select("-__v").sort({ createdAt: -1 }).lean();

      if (!includeStubs) {
        firms = firms.filter((f) => String(f?.name || "").trim().length > 0);
      }

      if (search) {
        firms = firms.filter((f) => {
          const hay = [
            f.name,
            f.email,
            f.phone,
            f.category,
            Array.isArray(f.categories) ? f.categories.join(",") : "",
            f.address,
            f.city,
            f.country
          ].map((x) => String(x || "").toLowerCase()).join(" | ");
          return hay.includes(search);
        });
      }

      return res.json({ success: true, firms });
    } catch (err) {
      errorWithTime("ADMIN FIRMS ERROR:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  app.put("/admin/firms/:id", adminRouteLimiter, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ success: false, error: "Missing id" });

      const patch = {};
      const allow = ["name", "phone", "address", "city", "category", "categories", "plan", "country", "payment_status", "expires_at", "trial_ends_at"];
      for (const key of allow) {
        if (req.body?.[key] !== undefined) patch[key] = req.body[key];
      }

      if (patch.phone !== undefined) {
        const phoneNorm = normalizePhone(patch.phone);
        if (!phoneNorm) return res.status(400).json({ success: false, error: "Invalid phone" });
        patch.phone = phoneNorm;
      }

      if (patch.plan !== undefined) {
        const plan = String(patch.plan || "").toLowerCase();
        if (!["free", "premium"].includes(plan)) {
          return res.status(400).json({ success: false, error: "Invalid plan" });
        }
        patch.plan = plan;
      }

      if (patch.payment_status !== undefined) {
        const status = String(patch.payment_status || "").toLowerCase();
        if (!["active", "expired"].includes(status)) {
          return res.status(400).json({ success: false, error: "Invalid payment_status" });
        }
        patch.payment_status = status;
      }

      if (patch.country !== undefined) {
        patch.country = normalizeCountry(patch.country);
      }

      if (patch.plan === "free") {
        patch.is_boosted = false;
        patch.boost_expires_at = null;
      } else if (patch.plan === "premium" && patch.payment_status !== "expired") {
        patch.is_boosted = true;
      }

      if (patch.payment_status === "expired") {
        patch.plan = "free";
        patch.is_boosted = false;
        patch.boost_expires_at = null;
      }

      if (patch.categories !== undefined || patch.category !== undefined) {
        let effectivePlan = patch.plan;
        if (!effectivePlan) {
          const existing = await Firma.findById(id).select("plan").lean();
          effectivePlan = String(existing?.plan || "free").toLowerCase();
        }

        const parsed = parseCategoriesFromBody({
          categories: patch.categories,
          category: patch.category
        });

        const limited = applyCategoryPlanLimit(parsed, effectivePlan);
        patch.categories = limited.length ? limited : undefined;
        patch.category = limited[0] || (patch.category ? String(patch.category) : null);
      }

      const updated = await Firma.findByIdAndUpdate(id, { $set: patch }, { new: true }).select("-__v").lean();
      if (!updated) return res.status(404).json({ success: false, error: "Not found" });

      return res.json({ success: true, firm: updated });
    } catch (err) {
      errorWithTime("ADMIN UPDATE ERROR:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });
}
