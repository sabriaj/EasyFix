export function createPaymentVariantHelpers({
  premiumVariant,
  credits1Variant,
  credits5Variant,
  credits10Variant
}) {
  function planToVariant(plan) {
    if (plan === "premium") return premiumVariant;
    return null;
  }

  function creditsPackToVariant(pack) {
    const p = Number(pack);

    if (p === 1) return credits1Variant;
    if (p === 5) return credits5Variant;
    if (p === 10) return credits10Variant;

    return null;
  }

  function variantToCredits(variantId) {
    const v = String(variantId || "");

    if (v === credits1Variant) return 1;
    if (v === credits5Variant) return 5;
    if (v === credits10Variant) return 10;

    return 0;
  }

  return {
    planToVariant,
    creditsPackToVariant,
    variantToCredits
  };
}
