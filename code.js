const BACKEND_URL = "https://easyfix.onrender.com";

function $(s) { return document.querySelector(s); }

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
  if (selectedPlan === "standard") {
    photosLabel.textContent = "Foto të Shërbimeve (max 3)";
    photosHint.textContent = "Maksimum 3 foto për Standard.";
  } else if (selectedPlan === "premium") {
    photosLabel.textContent = "Foto të Shërbimeve (max 8)";
    photosHint.textContent = "Maksimum 8 foto për Premium.";
  } else {
    photosLabel.textContent = "Foto të Shërbimeve";
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
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(t));
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
    // utilsScript: (utils.js e ke të ngarkum me <script defer ...>)
    geoIpLookup: async (cb) => {
      const iso2 = await guessCountryIso2();
      cb(iso2);
    }
  });

  // kur ndrron shtetin
  phoneInput.addEventListener("countrychange", () => {
    setPhoneHint("", true);
  });

  // validim live (opsional, s’e bllokon typing)
  phoneInput.addEventListener("input", () => {
    if (!iti) return;
    const v = phoneInput.value.trim();
    if (!v) { setPhoneHint("", true); return; }

    // në utils të ngarkume, ky validim është i saktë
    const ok = iti.isValidNumber();
    if (ok) {
      const e164 = iti.getNumber(); // +...
      setPhoneHint(`Numri duket valid: ${e164}`, true);
    } else {
      setPhoneHint("Numër telefoni jo valid për këtë shtet.", false);
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
  const category = $("#kategoria").value.trim();

  if (!name || !address || !email || !category) {
    showStatus("Ju lutem plotësoni të gjitha fushat.", "error");
    return;
  }

  if (!selectedPlan) {
    showStatus("Ju lutem zgjidhni një plan.", "error");
    return;
  }

  // PHONE VALIDATION
  const phoneInput = $("#telefoni");
  if (!iti || !phoneInput) {
    showStatus("Phone input nuk u inicializua. Provo refresh faqen.", "error");
    return;
  }

  const rawPhone = phoneInput.value.trim();
  if (!rawPhone) {
    showStatus("Ju lutem shkruani numrin e telefonit.", "error");
    return;
  }

  // ky është validim real sipas shtetit
  if (!iti.isValidNumber()) {
    showStatus("Numri i telefonit nuk është valid për shtetin e zgjedhur.", "error");
    setPhoneHint("Numër telefoni jo valid për këtë shtet.", false);
    return;
  }

  // E.164 (p.sh. +3897xxxxxxx) — kjo shkon te backend
  const phoneE164 = iti.getNumber();

  // ISO2 nga iti (p.sh. mk, de, us) -> uppercase (MK, DE, US)
  const countryIso2 = (iti.getSelectedCountryData()?.iso2 || "mk").toUpperCase();

  // photo limits
  const maxPhotos = selectedPlan === "standard" ? 3 : selectedPlan === "premium" ? 8 : 0;

  const formData = new FormData();
  formData.append("name", name);
  formData.append("email", email);
  formData.append("phone", phoneE164);     // ✅ E.164
  formData.append("country", countryIso2); // ✅ ISO2
  formData.append("address", address);
  formData.append("category", category);
  formData.append("plan", selectedPlan);

  if (selectedPlan === "standard" || selectedPlan === "premium") {
    const logoFile = $("#logoUpload").files[0];
    if (logoFile) formData.append("logo", logoFile);

    const photos = Array.from($("#photoUpload").files || []);
    if (photos.length > maxPhotos) {
      showStatus(`Mund të ngarkoni maksimum ${maxPhotos} foto për planin ${selectedPlan}.`, "error");
      return;
    }
    photos.forEach(f => formData.append("photos", f));
  }

  showStatus("Duke ruajtur regjistrimin...", "info");

  try {
    const res = await fetch(`${BACKEND_URL}/register`, {
      method: "POST",
      body: formData
    });

    if (res.status === 409) {
      showStatus("Ky email tashmë është i regjistruar.", "error");
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      showStatus(data?.error || "Gabim në regjistrim.", "error");
      return;
    }

    showStatus("Po ju dërgojmë te pagesa...", "success");

    setTimeout(() => {
      window.location.href = data.checkoutUrl;
    }, 700);

  } catch (err) {
    console.error(err);
    showStatus("Gabim gjatë komunikimit me serverin.", "error");
  }
});

// default plan basic + init phone
window.addEventListener("DOMContentLoaded", () => {
  const basicBtn = $("#planBasic");
  if (basicBtn) basicBtn.click();
  initPhoneInput();
});
