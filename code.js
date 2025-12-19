const BACKEND_URL = "https://easyfix.onrender.com";

function $(s) { return document.querySelector(s); }

function showStatus(msg, type = "info") {
  let box = $("#statusBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "statusBox";
    box.className = "mt-4 p-3 rounded text-white";
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

async function detectUserCountryIso2() {
  try {
    const r = await fetch("https://ipapi.co/json/");
    const j = await r.json();
    const code = (j?.country_code || "MK").toLowerCase();
    return /^[a-z]{2}$/.test(code) ? code : "mk";
  } catch {
    return "mk";
  }
}

async function initPhoneInput() {
  const phoneInput = $("#telefoni");
  if (!phoneInput || !window.intlTelInput) return;

  const iso2 = await detectUserCountryIso2();

  iti = window.intlTelInput(phoneInput, {
    initialCountry: iso2 || "mk",
    separateDialCode: true,
    nationalMode: true,
    autoPlaceholder: "aggressive",
    formatOnDisplay: true,
    utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@19.5.6/build/js/utils.js",
  });
}

/* ===================== SUBMIT ===================== */
const form = $("#registerForm");
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("#emri").value.trim();
  const address = $("#adresa").value.trim();
  const email = $("#emaili").value.trim();
  const category = $("#kategoria").value;

  if (!name || !address || !email || !category) {
    showStatus("Ju lutem plotësoni të gjitha fushat.", "error");
    return;
  }

  if (!selectedPlan) {
    showStatus("Ju lutem zgjidhni një plan.", "error");
    return;
  }

  if (!iti) {
    showStatus("Telefon: nuk u inicializua sistemi i shteteve. Rifresko faqen.", "error");
    return;
  }

  // ✅ validim real i numrit
  if (!iti.isValidNumber()) {
    showStatus("Numri i telefonit nuk është valid. Zgjidh shtetin dhe shkruaj numrin saktë.", "error");
    return;
  }

  const phoneE164 = iti.getNumber(); // +49..., +389...
  const countryIso2 = (iti.getSelectedCountryData()?.iso2 || "mk").toUpperCase();

  const maxPhotos = selectedPlan === "standard" ? 3 : selectedPlan === "premium" ? 8 : 0;

  const formData = new FormData();
  formData.append("name", name);
  formData.append("email", email);
  formData.append("phone", phoneE164);
  formData.append("address", address);
  formData.append("category", category);
  formData.append("plan", selectedPlan);

  // ✅ kjo përdoret për filtrimin në index
  formData.append("country", countryIso2);

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

  showStatus("Duke ruajtur regjistrimin...", "loading");

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
window.addEventListener("DOMContentLoaded", async () => {
  const basicBtn = $("#planBasic");
  if (basicBtn) basicBtn.click();
  await initPhoneInput();
});
