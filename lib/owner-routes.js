export function registerOwnerRoutes({
  app,
  Firma,
  resend,
  sendMail,
  FRONTEND_BASE_URL,
  emailActionLimiter,
  normalizeEmail,
  isValidEmail,
  validateNameLike,
  validateAddressLike,
  normalizePhone,
  normalizeCountry,
  parseCategoriesFromBody,
  applyCategoryPlanLimit,
  makeToken,
  sha256Hex,
  getCookieValue = () => "",
  appendOwnerSessionCookie = () => {},
  clearCookie = () => {},
  COOKIE_NAMES = { ownerSession: "easyfix_owner_session" },
  sendError,
  errorWithTime,
  isRealFirmRecord
}) {
  async function findOwnerManagedFirmByHash(tokenHash) {
    if (!tokenHash) return null;
    return Firma.findOne({
      owner_token_hash: tokenHash,
      owner_token_expires: { $gt: new Date() },
      deleted_at: null
    }).select("-__v").lean();
  }

  async function findOwnerManagedFirm(email, token) {
    const normalizedEmail = normalizeEmail(email);
    const safeToken = String(token || "").trim();

    if (!normalizedEmail || !safeToken) return null;
    if (!isValidEmail(normalizedEmail)) return null;

    const firm = await findOwnerManagedFirmByHash(sha256Hex(safeToken));
    if (!firm) return null;
    if (normalizeEmail(firm.email) !== normalizedEmail) return null;
    return firm;
  }

  app.post("/owner/session", async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      if (!token) {
        return sendError(res, 400, "MISSING_TOKEN");
      }

      const tokenHash = sha256Hex(token);
      const firm = await findOwnerManagedFirmByHash(tokenHash);
      if (!firm || !isRealFirmRecord(firm)) {
        clearCookie(res, COOKIE_NAMES.ownerSession);
        return sendError(res, 400, "INVALID_OR_EXPIRED_LINK");
      }

      appendOwnerSessionCookie(res, tokenHash, firm.owner_token_expires);
      return res.json({
        success: true,
        firm: {
          _id: firm._id,
          email: firm.email,
          name: firm.name
        }
      });
    } catch (err) {
      errorWithTime("OWNER SESSION ERROR:", err);
      return sendError(res, 500, "SERVER_ERROR");
    }
  });

  app.get("/owner/me", async (req, res) => {
    try {
      const tokenHash = getCookieValue(req, COOKIE_NAMES.ownerSession);
      if (!tokenHash) return sendError(res, 400, "MISSING_OWNER_SESSION");

      const firm = await findOwnerManagedFirmByHash(tokenHash);
      if (!firm || !isRealFirmRecord(firm)) {
        clearCookie(res, COOKIE_NAMES.ownerSession);
        return sendError(res, 400, "INVALID_OR_EXPIRED_LINK");
      }

      return res.json({ success: true, firm });
    } catch (err) {
      errorWithTime("OWNER ME ERROR:", err);
      return sendError(res, 500, "SERVER_ERROR");
    }
  });

  app.post("/owner/request-link", emailActionLimiter, async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);

      if (!email) {
        return sendError(res, 400, "MISSING_EMAIL");
      }

      if (!isValidEmail(email)) {
        return sendError(res, 400, "INVALID_EMAIL");
      }

      const firm = await Firma.findOne({ email }).select("_id email name deleted_at").lean();

      if (!firm || !isRealFirmRecord(firm)) {
        return res.json({ success: true });
      }

      if (!resend) {
        return sendError(res, 500, "EMAIL_SERVICE_NOT_CONFIGURED");
      }

      const token = makeToken();
      const tokenHash = sha256Hex(token);
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await Firma.updateOne(
        { _id: firm._id },
        {
          $set: {
            owner_token_hash: tokenHash,
            owner_token_expires: expires
          }
        }
      );

      const link = `${FRONTEND_BASE_URL}/manage.html?token=${encodeURIComponent(token)}`;

      await sendMail({
        to: email,
        subject: "EasyFix - Manage your listing",
        text: `Per me menaxhu profilin tend perdor kete link: ${link}`,
        html: `
          <div style="font-family:Arial">
            <h2>EasyFix</h2>
            <p>Kliko linkun per me menaxhu profilin tend:</p>
            <p><a href="${link}">${link}</a></p>
            <p>Linku skadon per 1 ore.</p>
          </div>
        `
      });

      return res.json({ success: true });
    } catch (err) {
      errorWithTime("OWNER REQUEST LINK ERROR:", err);
      return sendError(res, 500, "SERVER_ERROR");
    }
  });

  app.put("/owner/update", async (req, res) => {
    try {
      const tokenHash = getCookieValue(req, COOKIE_NAMES.ownerSession);
      if (!tokenHash) return sendError(res, 400, "MISSING_OWNER_SESSION");

      const firm = await findOwnerManagedFirmByHash(tokenHash);
      if (!firm || !isRealFirmRecord(firm)) {
        clearCookie(res, COOKIE_NAMES.ownerSession);
        return sendError(res, 400, "INVALID_OR_EXPIRED_LINK");
      }

      const patch = {};

      if (req.body?.name !== undefined) {
        const name = String(req.body.name || "").trim();
        if (!validateNameLike(name)) return sendError(res, 400, "INVALID_NAME");
        patch.name = name;
      }

      if (req.body?.phone !== undefined) {
        const phone = normalizePhone(req.body.phone);
        if (!phone) return sendError(res, 400, "INVALID_PHONE");
        patch.phone = phone;
      }

      if (req.body?.address !== undefined) {
        const address = String(req.body.address || "").trim();
        if (!validateAddressLike(address)) return sendError(res, 400, "INVALID_ADDRESS");
        patch.address = address;
      }

      if (req.body?.country !== undefined) {
        patch.country = normalizeCountry(req.body.country);
      }

      if (req.body?.category !== undefined || req.body?.categories !== undefined) {
        const parsedCategories = parseCategoriesFromBody({
          category: req.body?.category,
          categories: req.body?.categories
        });

        if (!parsedCategories.length) return sendError(res, 400, "INVALID_CATEGORY");

        const limitedCategories = applyCategoryPlanLimit(parsedCategories, firm.plan);
        patch.categories = limitedCategories;
        patch.category = limitedCategories[0];
      }

      if (!Object.keys(patch).length) {
        return sendError(res, 400, "NO_UPDATES");
      }

      const updated = await Firma.findByIdAndUpdate(
        firm._id,
        { $set: patch },
        { new: true }
      ).select("-__v").lean();

      return res.json({ success: true, firm: updated });
    } catch (err) {
      errorWithTime("OWNER UPDATE ERROR:", err);
      return sendError(res, 500, "SERVER_ERROR");
    }
  });
}
