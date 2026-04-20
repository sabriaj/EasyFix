export function registerPayNowRoutes({
  app,
  emailActionLimiter,
  Firma,
  resend,
  sendMail,
  FRONTEND_BASE_URL,
  PAY_TOKEN_MINUTES,
  makeToken,
  sha256Hex,
  getCookieValue = () => "",
  appendPaySessionCookie = () => {},
  clearCookie = () => {},
  COOKIE_NAMES = { paySession: "easyfix_pay_session" },
  normalizeEmail,
  isValidEmail,
  isRealFirmRecord,
  planToVariant,
  createLemonCheckout,
  sendError,
  errorWithTime,
  isValidObjectId,
  isFirmVisibleStatus
}) {
  app.post("/pay-now/request", emailActionLimiter, async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!email) return sendError(res, 400, "MISSING_EMAIL");
      if (!isValidEmail(email)) return sendError(res, 400, "INVALID_EMAIL");

      const firm = await Firma.findOne({ email }).select("_id email name deleted_at").lean();

      if (!firm || !isRealFirmRecord(firm)) {
        return res.json({ success: true, message: "If the email exists, we sent a link." });
      }
      if (!resend) return sendError(res, 500, "EMAIL_SERVICE_NOT_CONFIGURED");

      const token = makeToken();
      const tokenHash = sha256Hex(token);
      const expires = new Date(Date.now() + PAY_TOKEN_MINUTES * 60 * 1000);

      await Firma.updateOne(
        { _id: firm._id },
        { $set: { pay_token_hash: tokenHash, pay_token_expires: expires } }
      );

      const payUrl = `${FRONTEND_BASE_URL}/pay.html?token=${encodeURIComponent(token)}`;

      await sendMail({
        to: email,
        subject: "EasyFix - Pay now link",
        text: `Per me vazhdu me u shfaq ne EasyFix, perdor kete link: ${payUrl}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5">
            <h2>EasyFix - Pay now</h2>
            <p>Per me vazhdu me u shfaq ne EasyFix, kliko linkun:</p>
            <p><a href="${payUrl}">${payUrl}</a></p>
            <p style="color:#666">Ky link skadon per ${PAY_TOKEN_MINUTES} minuta.</p>
          </div>
        `
      });

      return res.json({ success: true, message: "If the email exists, we sent a link." });
    } catch (err) {
      errorWithTime("PAY-NOW REQUEST ERROR:", err);
      return sendError(res, 500, "SERVER_ERROR");
    }
  });

  app.post("/pay-now/session", async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      if (!token) return sendError(res, 400, "MISSING_TOKEN");

      const tokenHash = sha256Hex(token);
      const firm = await Firma.findOne({
        pay_token_hash: tokenHash,
        pay_token_expires: { $gt: new Date() },
        deleted_at: null
      }).select("_id email name pay_token_expires deleted_at").lean();

      if (!firm || !isRealFirmRecord(firm)) {
        clearCookie(res, COOKIE_NAMES.paySession);
        return sendError(res, 400, "INVALID_OR_EXPIRED_LINK");
      }

      appendPaySessionCookie(res, tokenHash, firm.pay_token_expires);
      return res.json({
        success: true,
        firm: {
          _id: firm._id,
          email: firm.email,
          name: firm.name
        }
      });
    } catch (err) {
      errorWithTime("PAY-NOW SESSION ERROR:", err);
      return sendError(res, 500, "SERVER_ERROR");
    }
  });

  app.get("/pay-now/checkout", async (req, res) => {
    try {
      const tokenHash = getCookieValue(req, COOKIE_NAMES.paySession);
      const plan = String(req.query.plan || "").trim().toLowerCase();

      if (!tokenHash) return sendError(res, 400, "MISSING_PAY_SESSION");
      if (plan !== "premium") return sendError(res, 400, "INVALID_PLAN");

      const firm = await Firma.findOne({
        pay_token_hash: tokenHash,
        pay_token_expires: { $gt: new Date() },
        deleted_at: null
      }).select("_id email name deleted_at").lean();

      if (!firm || !isRealFirmRecord(firm)) {
        clearCookie(res, COOKIE_NAMES.paySession);
        return sendError(res, 400, "INVALID_OR_EXPIRED_LINK");
      }

      const variantId = planToVariant(plan);
      if (!variantId) return sendError(res, 500, "PREMIUM_VARIANT_NOT_CONFIGURED");

      const checkoutUrl = await createLemonCheckout({
        variantId,
        email: firm.email,
        firmId: String(firm._id)
      });

      return res.json({ success: true, checkoutUrl });
    } catch (err) {
      errorWithTime("PAY-NOW CHECKOUT ERROR:", err);
      return sendError(res, 500, "SERVER_ERROR");
    }
  });

  app.get("/check-status", async (req, res) => {
    try {
      const email = normalizeEmail(req.query?.email);
      const firmId = String(req.query?.firmId || "").trim();

      if (!email && !firmId) {
        return sendError(res, 400, "MISSING_LOOKUP");
      }

      const query = {};
      if (firmId && isValidObjectId(firmId)) {
        query._id = firmId;
      } else if (email && isValidEmail(email)) {
        query.email = email;
      } else {
        return sendError(res, 400, "INVALID_LOOKUP");
      }

      const firma = await Firma.findOne(query)
        .select("_id email name country plan payment_status expires_at boost_expires_at deleted_at")
        .lean();

      if (!firma || !isRealFirmRecord(firma)) {
        return sendError(res, 404, "FIRM_NOT_FOUND");
      }

      return res.json({
        success: true,
        firma: {
          ...firma,
          is_visible: isFirmVisibleStatus(firma.payment_status)
        }
      });
    } catch (err) {
      errorWithTime("CHECK-STATUS ERROR:", err);
      return sendError(res, 500, "SERVER_ERROR");
    }
  });
}
