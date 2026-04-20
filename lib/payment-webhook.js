import crypto from "crypto";

function createTextResponse(status, text) {
  return { status, text };
}

export async function processPaymentWebhook({
  rawBody,
  signature,
  webhookSecret,
  sha256Hex,
  WebhookReceipt,
  normalizeEmail,
  variantToCredits,
  User,
  Firma,
  log
}) {
  let safeSignature = String(signature || "").trim();

  const hmac = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  if (safeSignature.startsWith("sha256=")) {
    safeSignature = safeSignature.slice(7);
  }

  if (!safeSignature || safeSignature !== hmac) {
    log("Invalid webhook signature", { received: safeSignature, computed: hmac });
    return createTextResponse(400, "Invalid signature");
  }

  const payload = JSON.parse(rawBody.toString());
  const event = payload?.meta?.event_name || payload?.event || "unknown";
  const eventKey = `${event}:${sha256Hex(rawBody.toString())}`;

  try {
    await WebhookReceipt.create({
      event_key: eventKey,
      event_name: event
    });
  } catch (receiptErr) {
    if (receiptErr?.code === 11000) {
      log("Duplicate webhook ignored", { event, eventKey });
      return createTextResponse(200, "Duplicate ignored");
    }
    throw receiptErr;
  }

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

  const userIdRaw =
    payload?.meta?.custom_data?.userId ||
    payload?.data?.attributes?.checkout_data?.custom?.userId ||
    null;

  const creditPackRaw =
    payload?.meta?.custom_data?.creditPack ||
    payload?.data?.attributes?.checkout_data?.custom?.creditPack ||
    null;

  const firmId = firmIdRaw ? String(firmIdRaw) : null;
  const userId = userIdRaw ? String(userIdRaw) : null;
  const creditPack = Number(creditPackRaw || 0);
  const creditAmountFromVariant = variantToCredits(variantId);
  const finalCreditsToAdd = creditAmountFromVariant || creditPack;

  log("Webhook", {
    event,
    email,
    variantId,
    firmId,
    userId,
    finalCreditsToAdd
  });

  if (event === "order_created") {
    if (userId && finalCreditsToAdd > 0) {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { credits: finalCreditsToAdd } },
        { new: true }
      );

      if (!updatedUser) {
        log("Credits webhook but user not found", { userId, finalCreditsToAdd });
      } else {
        log("Credits added", {
          userId: updatedUser._id,
          email: updatedUser.email,
          added: finalCreditsToAdd,
          total: updatedUser.credits
        });
      }

      return createTextResponse(200, "OK");
    }

    if (firmId || email) {
      const premiumEnds = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const update = {
        payment_status: "active",
        plan: "premium",
        is_boosted: true,
        boost_expires_at: premiumEnds,
        paid_at: new Date(),
        expires_at: premiumEnds,
        deleted_at: null
      };

      let updated = null;
      if (firmId) {
        updated = await Firma.findByIdAndUpdate(firmId, { $set: update }, { new: true });
      } else if (email) {
        updated = await Firma.findOneAndUpdate(
          { email },
          { $set: update },
          { upsert: false, new: true }
        );
      }

      if (!updated) {
        log("Premium webhook but firm not found", { firmId, email });
      } else {
        log("Firm upgraded to premium", {
          id: updated._id,
          email: updated.email,
          plan: updated.plan
        });
      }

      return createTextResponse(200, "OK");
    }

    return createTextResponse(200, "No matching target");
  }

  if (event === "subscription_cancelled" || event === "subscription_expired" || event === "order_refunded") {
    const update = {
      payment_status: "active",
      plan: "free",
      is_boosted: false,
      boost_expires_at: null,
      expires_at: null
    };

    if (firmId) {
      await Firma.findByIdAndUpdate(firmId, { $set: update });
    } else if (email) {
      await Firma.findOneAndUpdate({ email }, { $set: update });
    }

    return createTextResponse(200, "OK");
  }

  return createTextResponse(200, "Ignored");
}
