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

/* ===================== PHONE OTP ===================== */
const sendOtpBtn = $("#sendOtpBtn");
const verifyOtpBtn = $("#verifyOtpBtn");
const otpCode = $("#otpCode");
const otpStatus = $("#otpStatus");
const phoneInput = $("#telefoni");

let phoneVerifyToken = "";
let verifiedPhone = "";

function setOtpStatus(text, ok = false) {
  otpStatus.textContent = text;
  otpStatus.style.color = ok ? "#16a34a" : "#374151";
}

function resetVerification() {
  phoneVerifyToken = "";
  verifiedPhone = "";
  setOtpStatus("Numri nuk është verifikuar ende.", false);
}

phoneInput.addEventListener("input", () => {
  // nëse user e ndryshon numrin, e prishim token-in
  resetVerification();
});

sendOtpBtn.addEventListener("click", async () => {
  const phone = phoneInput.value.trim();
  if (!phone) {
    setOtpStatus("Shkruaje numrin e telefonit.", false);
    return;
  }

  setOtpStatus("Duke dërgu kodin...", false);

  try {
    const res = await fetch(`${BACKEND_URL}/auth/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      setOtpStatus(data?.error || "Gabim gjatë dërgimit të kodit.", false);
      return;
    }

    setOtpStatus("Kodi u dërgua. Shkruaje kodin 6-shifror.", true);

    // vetëm nëse e ke OTP_DEBUG=1 në server
    if (data.dev_code) {
      setOtpStatus(`Kodi (DEV): ${data.dev_code} — vendose në fushë.`, true);
    }
  } catch (e) {
    console.error(e);
    setOtpStatus("Gabim në komunikim me serverin.", false);
  }
});

verifyOtpBtn.addEventListener("click", async () => {
  const phone = phoneInput.value.trim();
  const code = otpCode.value.trim();

  if (!phone) {
    setOtpStatus("Shkruaje numrin e telefonit.", false);
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    setOtpStatus("Kodi duhet me qenë 6 shifra.", false);
    return;
  }

  setOtpStatus("Duke verifiku...", false);

  try {
    const res = await fetch(`${BACKEND_URL}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      setOtpStatus(data?.error || "Verifikimi dështoi.", false);
      return;
    }

    phoneVerifyToken = data.phone_verify_token;
    verifiedPhone = data.phone;

    setOtpStatus("Numri u verifikua me sukses ✅", true);

    // opcional: blloko ndryshimin e telefonit pas verifikimit
    // phoneInput.disabled = true;
    // sendOtpBtn.disabled = true;
    // verifyOtpBtn.disabled = true;

  } catch (e) {
    console.error(e);
    setOtpStatus("Gabim në komunikim me serverin.", false);
  }
});

/* ===================== SUBMIT ===================== */
const form = $("#registerForm");
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("#emri").value.trim();
  const address = $("#adresa").value.trim();
  const phone = $("#telefoni").value.trim();
  const email = $("#emaili").value.trim();
  const category = $("#kategoria").value.trim();

  if (!name || !address || !phone || !email || !category) {
    showStatus("Ju lutem plotësoni të gjitha fushat.", "error");
    return;
  }

  if (!selectedPlan) {
    showStatus("Ju lutem zgjidhni një plan.", "error");
    return;
  }

  if (!phoneVerifyToken) {
    showStatus("Duhet me verifiku numrin (SMS) para regjistrimit.", "error");
    return;
  }

  // photo limits
  const maxPhotos = selectedPlan === "standard" ? 3 : selectedPlan === "premium" ? 8 : 0;

  const formData = new FormData();
  formData.append("name", name);
  formData.append("email", email);
  formData.append("phone", phone);
  formData.append("address", address);
  formData.append("category", category);
  formData.append("plan", selectedPlan);

  // token për verifikim
  formData.append("phone_verify_token", phoneVerifyToken);

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

    const data = await res.json();

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

// default plan basic
window.addEventListener("DOMContentLoaded", () => {
  const basicBtn = $("#planBasic");
  if (basicBtn) basicBtn.click();
  resetVerification();
});
