export function isRealFirmRecord(firm) {
  return Boolean(String(firm?.name || "").trim()) && !firm?.deleted_at;
}

export function isFirmVisibleStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "active" || normalized === "paid" || normalized === "trial";
}

export function buildContactPayload(firm) {
  const phone = firm?.phone || "";
  const email = firm?.email || "";

  return {
    phone,
    email,
    callLink: phone ? `tel:${phone}` : "",
    smsLink: phone ? `sms:${phone}` : "",
    mailLink: email ? `mailto:${email}` : ""
  };
}

function response(status, body) {
  return { status, body };
}

export async function unlockFirmContact({
  body,
  authUser,
  User,
  Firma,
  ContactUnlock,
  isValidObjectId
}) {
  const { userId, firmId } = body || {};

  const safeUserId = String(userId || "").trim();
  const safeFirmId = String(firmId || "").trim();

  if (!safeUserId || !safeFirmId) {
    return response(400, { success: false, error_code: "MISSING_FIELDS" });
  }

  if (!isValidObjectId(safeUserId) || !isValidObjectId(safeFirmId)) {
    return response(400, { success: false, error_code: "INVALID_FIELDS" });
  }

  if (String(authUser?._id || "") !== safeUserId) {
    return response(403, { success: false, error_code: "FORBIDDEN" });
  }

  const user = await User.findById(safeUserId);
  if (!user) {
    return response(404, { success: false, error_code: "USER_NOT_FOUND" });
  }

  const firm = await Firma.findById(safeFirmId).lean();
  if (!firm || !isRealFirmRecord(firm) || !isFirmVisibleStatus(firm.payment_status)) {
    return response(404, { success: false, error_code: "FIRM_NOT_FOUND" });
  }

  const existingUnlock = await ContactUnlock.findOne({
    user_id: user._id,
    firm_id: firm._id
  }).lean();

  if (existingUnlock) {
    return response(200, {
      success: true,
      alreadyUnlocked: true,
      credits: user.credits,
      contact: buildContactPayload(firm)
    });
  }

  if ((user.credits || 0) < 1) {
    return response(400, { success: false, error_code: "NO_CREDITS" });
  }

  const updatedUser = await User.findOneAndUpdate(
    { _id: user._id, credits: { $gte: 1 } },
    { $inc: { credits: -1 } },
    { new: true }
  );

  if (!updatedUser) {
    return response(400, { success: false, error_code: "NO_CREDITS" });
  }

  try {
    await ContactUnlock.create({
      user_id: user._id,
      firm_id: firm._id
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;

    const latestUser = await User.findById(safeUserId).lean();
    const latestFirm = await Firma.findById(safeFirmId).lean();

    if (!latestFirm || !isRealFirmRecord(latestFirm) || !isFirmVisibleStatus(latestFirm.payment_status)) {
      return response(404, { success: false, error_code: "FIRM_NOT_FOUND" });
    }

    return response(200, {
      success: true,
      alreadyUnlocked: true,
      credits: latestUser?.credits || 0,
      contact: buildContactPayload(latestFirm)
    });
  }

  return response(200, {
    success: true,
    alreadyUnlocked: false,
    credits: updatedUser.credits,
    contact: buildContactPayload(firm)
  });
}
