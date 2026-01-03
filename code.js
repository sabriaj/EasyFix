const BACKEND_URL = "https://easyfix.onrender.com";

function $(s) { return document.querySelector(s); }

// i18n (NEW)
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
    $("#registerForm").before(box);
  }

  box.textContent = msg;
  box.style.background =
    type === "error" ? "#dc2626" :
    type === "success" ? "#16a34a" :
    "#2563eb";
}

/* ===================== PLAN UI ===================== */
let selectedPlan = "";
const photosLabel = $("#photosLabel");
const photosHint = $("#photosHint");

function updateUploadHints() {
  if (!photosLabel || !photosHint) return;

  // keep your logic, only i18n texts:
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

document.querySelectorAll(".plan-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".plan-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    selectedPlan = btn.dataset.plan;
    $("#selectedPlan").value = selectedPlan;

    const uploadSection = $("#uploadSection");
    if (selectedPlan === "standard" || selectedPlan === "premium") {
      uploadSection.classList.remove("hidden");
    } else {
      uploadSection.classList.add("hidden");
      $("#logoUpload").value = "";
      $("#photoUpload").value = "";
    }

    updateUploadHints();
  });
});

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

function setPhoneHint(text, ok = true) {
  const el = $("#phoneHint");
  if (!el) return;
  el.textContent = text || "";
  el.className = ok
    ? "text-xs mt-1 text-green-700"
    : "text-xs mt-1 text-red-700";
}

function initPhoneInput() {
  const phoneInput = $("#telefoni");
  if (!phoneInput || typeof window.intlTelInput !== "function") return;

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

  phoneInput.addEventListener("countrychange", () => {
    setPhoneHint("", true);
  });

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
}

/* ===================== SUBMIT ===================== */
const form = $("#registerForm");
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("#emri").value.trim();
  const address = $("#adresa").value.trim();
  const email = $("#emaili").value.trim();
  const category = $("#kategoria").value.trim(); // now this is a KEY

  if (!name || !address || !email || !category) {
    showStatus(t("msg_fill_all"), "error");
    return;
  }

  if (!selectedPlan) {
    showStatus(t("msg_choose_plan"), "error");
    return;
  }

  const phoneInput = $("#telefoni");
  if (!iti || !phoneInput) {
    showStatus(t("msg_phone_init_fail"), "error");
    return;
  }

  const rawPhone = phoneInput.value.trim();
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
    const res = await fetch(`${BACKEND_URL}/register`, {
      method: "POST",
      body: formData
    });

    if (res.status === 409) {
      showStatus(t("msg_email_exists"), "error");
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      showStatus(data?.error || t("msg_reg_error"), "error");
      return;
    }

    showStatus(t("msg_to_pay"), "success");

    setTimeout(() => {
      window.location.href = data.checkoutUrl;
    }, 700);

  } catch (err) {
    console.error(err);
    showStatus(t("msg_comm_error"), "error");
  }
});

// default plan basic + init phone + i18n init
window.addEventListener("DOMContentLoaded", () => {
  // i18n (NEW)
  applyTranslations();
  setLangButtonsUI();

  document.getElementById("langSQ")?.addEventListener("click", () => { setLang("sq"); applyTranslations(); setLangButtonsUI(); updateUploadHints(); });
  document.getElementById("langMK")?.addEventListener("click", () => { setLang("mk"); applyTranslations(); setLangButtonsUI(); updateUploadHints(); });
  document.getElementById("langEN")?.addEventListener("click", () => { setLang("en"); applyTranslations(); setLangButtonsUI(); updateUploadHints(); });

  const basicBtn = $("#planBasic");
  if (basicBtn) basicBtn.click();
  initPhoneInput();
});
