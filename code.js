const BACKEND_URL = "https://easyfix.onrender.com";
function $(s) { return document.querySelector(s); }

// i18n
const I18N = window.EASYFIX_I18N;
const t = I18N ? I18N.t : (k) => k;
const applyTranslations = I18N ? I18N.applyTranslations : () => {};
const setLangButtonsUI = I18N ? I18N.setLangButtonsUI : () => {};
const setLang = I18N ? I18N.setLang : () => {};

function showStatus(msg, type = "info") {
  let box = $("#statusBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "statusBox";
    box.className = "mt-4 p-3 rounded text-white font-semibold";
    $("#registerForm")?.before(box);
  }
  if (!box) return;

  box.textContent = msg;
  box.style.background =
    type === "error" ? "#dc2626" :
    type === "success" ? "#16a34a" :
    "#2563eb";
}

/* ===== NEW: map server error_code -> i18n text ===== */
function apiErrorToText(j) {
  const code = String(j?.error_code || "").trim();

  const map = {
    MISSING_FIELDS: "api_missing_fields",
    INVALID_PLAN: "api_invalid_plan",
    EMAIL_NOT_VERIFIED: "api_email_not_verified",
    EMAIL_EXISTS: "api_email_exists",
    GEO_NOT_FOUND: "api_geo_not_found",
    SERVER_ERROR: "api_server_error",
    MISSING_EMAIL: "api_missing_email",
    EMAIL_SERVICE_NOT_CONFIGURED: "api_email_service_not_configured",
    MISSING_EMAIL_CODE: "api_missing_email_code",
    INVALID_CODE_FORMAT: "api_invalid_code_format",
    INVALID_CODE: "api_invalid_code",
    NO_ACTIVE_CODE: "api_no_active_code",
    CODE_EXPIRED: "api_code_expired",
    TOO_MANY_ATTEMPTS: "api_too_many_attempts",
    OTP_COOLDOWN: "api_otp_cooldown",
    MISSING_LAT_LNG: "api_missing_lat_lng",
  };

  if (code === "OTP_COOLDOWN") {
    const sec = Number(j?.retry_after_seconds || 0) || 45;
    return t("api_otp_cooldown", { sec });
  }

  if (code && map[code]) return t(map[code]);

  // fallback: nëse serveri ende kthen tekst
  if (typeof j?.error === "string" && j.error.trim()) return j.error.trim();

  return t("api_server_error");
}

/* ===================== PHONE (intl-tel-input) ===================== */
let iti = null;

function fetchWithTimeout(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const tmr = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(tmr));
}

async function guessCountryIso2() {
  try {
    const r = await fetchWithTimeout("https://ipapi.co/json/", 4500);
    const j = await r.json().catch(() => ({}));
    const c = String(j?.country_code || "mk").toLowerCase();
    return (c && c.length === 2) ? c : "mk";
  } catch {
    return "mk";
  }
}

async function prefillCityFromIp() {
  try {
    const cityInput = $("#qyteti");
    if (!cityInput) return;

    if (String(cityInput.value || "").trim()) return;

    const r = await fetchWithTimeout("https://ipapi.co/json/", 4500);
    const j = await r.json().catch(() => ({}));
    const city = String(j?.city || "").trim();
    if (city) cityInput.value = city;
  } catch {}
}

function setPhoneHint(text, ok = true) {
  const el = $("#phoneHint");
  if (!el) return;
  el.textContent = text || "";
  el.className = ok ? "text-xs mt-1 text-green-700" : "text-xs mt-1 text-red-700";
}

async function initPhoneInput() {
  const phoneInput = $("#telefoni");
  if (!phoneInput) return false;

  if (typeof window.intlTelInput !== "function") return false;

  iti = window.intlTelInput(phoneInput, {
    initialCountry: "auto",
    separateDialCode: true,
    nationalMode: true,
    autoPlaceholder: "polite",
    formatOnDisplay: true,
    geoIpLookup: async (cb) => {
      const iso2 = await guessCountryIso2();
      cb(iso2);
    }
  });

  phoneInput.addEventListener("countrychange", () => setPhoneHint("", true));
  phoneInput.addEventListener("input", () => {
    if (!iti) return;
    const v = phoneInput.value.trim();
    if (!v) { setPhoneHint("", true); return; }

    const ok = iti.isValidNumber();
    if (ok) {
      const e164 = iti.getNumber();
      setPhoneHint(t("hint_valid_phone", { e164 }), true);
    } else {
      setPhoneHint(t("hint_invalid_phone"), false);
    }
  });

  return true;
}

/* ===================== PLAN UI ===================== */
let selectedPlan = "";

function updateUploadHints() {
  const photosLabel = $("#photosLabel");
  const photosHint = $("#photosHint");
  if (!photosLabel || !photosHint) return;

  if (selectedPlan === "standard") {
    photosLabel.textContent = `${t("service_photos")} (max 3)`;
    photosHint.textContent = t("msg_max_photos", { n: 3, plan: "standard" });
  } else if (selectedPlan === "premium") {
    photosLabel.textContent = `${t("service_photos")} (max 8)`;
    photosHint.textContent = t("msg_max_photos", { n: 8, plan: "premium" });
  } else {
    photosLabel.textContent = t("service_photos");
    photosHint.textContent = "";
  }
}

function wirePlanButtons() {
  document.querySelectorAll(".plan-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".plan-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      selectedPlan = String(btn.dataset.plan || "");
      const hidden = $("#selectedPlan");
      if (hidden) hidden.value = selectedPlan;

      const uploadSection = $("#uploadSection");
      if (uploadSection) {
        if (selectedPlan === "standard" || selectedPlan === "premium") {
          uploadSection.classList.remove("hidden");
        } else {
          uploadSection.classList.add("hidden");
          if ($("#logoUpload")) $("#logoUpload").value = "";
          if ($("#photoUpload")) $("#photoUpload").value = "";
        }
      }

      updateUploadHints();
    });
  });
}

/* ===================== EMAIL OTP (MATCHES YOUR server.js) ===================== */
let emailVerified = false;

function isValidEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function setOtpStatus(msg, type = "info") {
  const el = $("#otpStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className =
    type === "error" ? "text-sm mt-2 text-red-700" :
    type === "success" ? "text-sm mt-2 text-green-700" :
    "text-sm mt-2 text-gray-700";
}

function setOtpUITranslated() {
  const sendBtn = $("#sendOtpBtn");
  const verifyBtn = $("#verifyOtpBtn");
  const codeInput = $("#otpCode");
  const title = $("#otpTitle");
  const hint = $("#otpHint");

  if (title) title.textContent = t("verify_email_title");
  if (hint) hint.textContent = t("verify_email_hint");
  if (sendBtn) sendBtn.textContent = t("send_code_btn");
  if (verifyBtn) verifyBtn.textContent = t("verify_btn");
  if (codeInput) codeInput.placeholder = t("code_placeholder");
}

function resetEmailVerification() {
  emailVerified = false;
  setOtpStatus("", "info");
  const codeInput = $("#otpCode");
  if (codeInput) codeInput.value = "";
}

function showOtpBoxIfNeeded() {
  const email = $("#emaili")?.value?.trim() || "";
  const box = $("#emailOtpBox");
  if (!box) return;

  if (email && isValidEmail(email)) {
    box.classList.remove("hidden");
  } else {
    box.classList.add("hidden");
    resetEmailVerification();
  }
}

function startCooldown(btn, seconds = 45) {
  if (!btn) return;
  btn.disabled = true;
  const original = btn.textContent;
  let left = seconds;
  btn.textContent = `${original} (${left})`;
  const timer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = original;
    } else {
      btn.textContent = `${original} (${left})`;
    }
  }, 1000);
}

function wireEmailOtp() {
  const emailInput = $("#emaili");
  if (!emailInput) return;

  emailInput.addEventListener("input", () => {
    resetEmailVerification();
    showOtpBoxIfNeeded();
  });

  $("#sendOtpBtn")?.addEventListener("click", async () => {
    const email = $("#emaili").value.trim();
    if (!isValidEmail(email)) {
      setOtpStatus(t("msg_email_invalid"), "error");
      return;
    }

    setOtpStatus(t("msg_sending_code"), "info");

    try {
      const r = await fetch(`${BACKEND_URL}/auth/email/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j.success) {
        setOtpStatus(apiErrorToText(j), "error");
        return;
      }

      setOtpStatus(t("msg_code_sent"), "success");
      startCooldown($("#sendOtpBtn"), 45);
    } catch {
      setOtpStatus(t("msg_send_code_fail"), "error");
    }
  });

  $("#verifyOtpBtn")?.addEventListener("click", async () => {
    const email = $("#emaili").value.trim();
    const code = ($("#otpCode")?.value || "").trim();

    if (!isValidEmail(email)) {
      setOtpStatus(t("msg_email_invalid"), "error");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setOtpStatus(t("msg_code_invalid_format"), "error");
      return;
    }

    setOtpStatus(t("msg_verifying_code"), "info");

    try {
      const r = await fetch(`${BACKEND_URL}/auth/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j.success) {
        setOtpStatus(apiErrorToText(j), "error");
        return;
      }

      emailVerified = true;
      setOtpStatus(t("msg_code_verified"), "success");
    } catch {
      setOtpStatus(t("msg_code_invalid"), "error");
    }
  });
}

/* ===================== SUBMIT ===================== */
function wireSubmit() {
  const form = $("#registerForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = $("#emri").value.trim();
    const address = $("#adresa").value.trim();
    const city = $("#qyteti")?.value?.trim() || "";
    const email = $("#emaili").value.trim();
    const category = $("#kategoria").value.trim();

    if (!name || !address || !email || !category) {
      showStatus(t("msg_fill_all"), "error");
      return;
    }

    if (!city) {
      showStatus(t("msg_city_required"), "error");
      return;
    }

    if (!selectedPlan) {
      showStatus(t("msg_choose_plan"), "error");
      return;
    }

    // require email OTP verified
    if (!emailVerified) {
      showStatus(t("msg_email_verify_required"), "error");
      showOtpBoxIfNeeded();
      return;
    }

    const agree = $("#agreePrivacy");
    if (agree && !agree.checked) {
      showStatus(t("msg_must_agree_privacy"), "error");
      return;
    }

    if (!iti) {
      showStatus(t("msg_phone_init_fail"), "error");
      return;
    }

    const rawPhone = $("#telefoni").value.trim();
    if (!rawPhone) {
      showStatus(t("msg_phone_required"), "error");
      return;
    }

    if (!iti.isValidNumber()) {
      showStatus(t("msg_phone_invalid"), "error");
      setPhoneHint(t("hint_invalid_phone"), false);
      return;
    }

    const phoneE164 = iti.getNumber();
    const countryIso2 = (iti.getSelectedCountryData()?.iso2 || "mk").toUpperCase();

    const maxPhotos = selectedPlan === "standard" ? 3 : selectedPlan === "premium" ? 8 : 0;

    const formData = new FormData();
    formData.append("name", name);
    formData.append("email", email);
    formData.append("phone", phoneE164);
    formData.append("country", countryIso2);
    formData.append("address", address);
    formData.append("city", city);
    formData.append("category", category);
    formData.append("plan", selectedPlan);

    if (selectedPlan === "standard" || selectedPlan === "premium") {
      const logoFile = $("#logoUpload").files[0];
      if (logoFile) formData.append("logo", logoFile);

      const photos = Array.from($("#photoUpload").files || []);
      if (photos.length > maxPhotos) {
        showStatus(t("msg_max_photos", { n: maxPhotos, plan: selectedPlan }), "error");
        return;
      }
      photos.forEach(f => formData.append("photos", f));
    }

    showStatus(t("msg_saving"), "info");

    try {
      const res = await fetch(`${BACKEND_URL}/register`, { method: "POST", body: formData });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showStatus(apiErrorToText(data), "error");
        return;
      }

      showStatus(t("msg_to_pay"), "success");

      setTimeout(() => {
        if (data.checkoutUrl) window.location.href = data.checkoutUrl;
        else window.location.href = data.nextUrl || `success.html?email=${encodeURIComponent(email)}`;
      }, 700);

    } catch {
      showStatus(t("msg_comm_error"), "error");
    }
  });
}

/* ===================== MAIN INIT ===================== */
window.addEventListener("DOMContentLoaded", async () => {
  applyTranslations();
  setLangButtonsUI();

  $("#langSQ")?.addEventListener("click", () => { setLang("sq"); applyTranslations(); setLangButtonsUI(); updateUploadHints(); setOtpUITranslated(); });
  $("#langMK")?.addEventListener("click", () => { setLang("mk"); applyTranslations(); setLangButtonsUI(); updateUploadHints(); setOtpUITranslated(); });
  $("#langEN")?.addEventListener("click", () => { setLang("en"); applyTranslations(); setLangButtonsUI(); updateUploadHints(); setOtpUITranslated(); });

  wirePlanButtons();
  $("#planBasic")?.click();

  const okPhone = await initPhoneInput();
  if (!okPhone) showStatus("Phone input failed to initialize. Check console.", "error");

  await prefillCityFromIp();

  wireEmailOtp();
  showOtpBoxIfNeeded();
  setOtpUITranslated();

  wireSubmit();
});
