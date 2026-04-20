export async function runCleanup({
  Firma,
  stubDeleteAfterHours,
  log
}) {
  const nowDate = new Date();

  const stubCutoff = new Date(Date.now() - stubDeleteAfterHours * 60 * 60 * 1000);

  const stubsDel = await Firma.deleteMany({
    createdAt: { $lte: stubCutoff },
    is_stub: true,
    $and: [
      { $or: [{ name: { $exists: false } }, { name: null }, { name: "" }] },
      { $or: [{ email_verified: { $exists: false } }, { email_verified: false }] }
    ]
  });

  if (stubsDel?.deletedCount) {
    log("[cleanup] Deleted OTP stubs:", stubsDel.deletedCount);
  }

  const expiredBoosts = await Firma.find({
    plan: "premium",
    is_boosted: true,
    boost_expires_at: { $lte: nowDate }
  }).select("_id email").lean();

  if (expiredBoosts.length) {
    await Firma.updateMany(
      {
        plan: "premium",
        is_boosted: true,
        boost_expires_at: { $lte: nowDate }
      },
      {
        $set: {
          plan: "free",
          is_boosted: false,
          boost_expires_at: null,
          payment_status: "active"
        }
      }
    );

    log("[cleanup] Downgraded expired premium firms to free:", expiredBoosts.length);
  }
}
