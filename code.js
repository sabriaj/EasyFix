const API_URL = window.EASYFIX_CONFIG.API_URL;
const { goToPage } = window.EASYFIX_CONFIG;
const { setUser, apiFetch, apiAuthFetch, translateApiError } = window.EASYFIX_AUTH;

let emailVerified = false;
const REGISTER_CATEGORY_LIMIT = 2;

function tr(key, vars = {}) {
  return window.EASYFIX_I18N?.t ? window.EASYFIX_I18N.t(key, vars) : key;
}

function getRegisterPlanLabel() {
  return tr("plan_basic_title");
}

function setRegisterCategoriesStatus(message = "", isError = false) {
  const el = document.getElementById("registerCategoriesStatus");
  if (!el) return;

  if (!message) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }

  el.className = isError
    ? "text-xs font-semibold mt-2 text-red-600"
    : "text-xs font-semibold mt-2 text-gray-500";
  el.classList.remove("hidden");
  el.textContent = message;
}


function getSelectedRegisterCategories() {
  return Array.from(document.querySelectorAll(".reg-category:checked"))
    .map(el => el.value);
}

function enforceRegisterCategoryLimit(changedEl) {
  const checked = Array.from(document.querySelectorAll(".reg-category:checked"));

  if (checked.length <= REGISTER_CATEGORY_LIMIT) {
    setRegisterCategoriesStatus(tr("categories_limit_hint", {
      n: REGISTER_CATEGORY_LIMIT,
      plan: getRegisterPlanLabel()
    }));
    return true;
  }

  if (changedEl) {
    changedEl.checked = false;
  } else {
    checked.slice(REGISTER_CATEGORY_LIMIT).forEach(el => {
      el.checked = false;
    });
  }

  setRegisterCategoriesStatus(tr("msg_max_categories", {
    n: REGISTER_CATEGORY_LIMIT,
    plan: getRegisterPlanLabel()
  }), true);
  return false;
}

function showStatus(message, type = "error") {
  const box = document.getElementById("statusBox");
  box.classList.remove("hidden");

  if (type === "success") {
    box.className = "mb-6 rounded-2xl px-4 py-3 text-sm font-semibold bg-green-100 text-green-700";
  } else if (type === "info") {
    box.className = "mb-6 rounded-2xl px-4 py-3 text-sm font-semibold bg-blue-100 text-blue-700";
  } else {
    box.className = "mb-6 rounded-2xl px-4 py-3 text-sm font-semibold bg-red-100 text-red-700";
  }

  box.textContent = message;
}

function setOtpInfo(message, type = "normal") {
  const el = document.getElementById("otpInfo");
  if (!el) return;

  if (type === "success") {
    el.className = "text-sm text-green-600 mt-3 font-semibold";
  } else if (type === "error") {
    el.className = "text-sm text-red-600 mt-3 font-semibold";
  } else {
    el.className = "text-sm text-gray-500 mt-3";
  }

  el.textContent = message || "";
}

async function sendOtp() {
  const email = document.getElementById("email").value.trim().toLowerCase();

  if (!email) {
    setOtpInfo("Shkruaj email-in fillimisht.", "error");
    return;
  }

  const btn = document.getElementById("sendOtpBtn");
  btn.disabled = true;
  btn.innerText = "Duke dërguar...";

  try {
    const res = await fetch(`${API_URL}/auth/email/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!res.ok) {
      setOtpInfo(translateApiError(data.error_code, "api_server_error"), "error");
      return;
    }

    emailVerified = false;
    setOtpInfo("Kodi u dërgua në email. Kontrollo inbox-in.", "success");
  } catch (err) {
    console.error(err);
    setOtpInfo("Gabim serveri gjatë dërgimit të OTP.", "error");
  } finally {
    btn.disabled = false;
    btn.innerText = "Dërgo kodin";
  }
}

async function verifyOtp() {
  const email = document.getElementById("email").value.trim().toLowerCase();
  const code = document.getElementById("otpCode").value.trim();

  if (!email || !code) {
    setOtpInfo("Shkruaj email-in dhe kodin OTP.", "error");
    return;
  }

  const btn = document.getElementById("verifyOtpBtn");
  btn.disabled = true;
  btn.innerText = "Duke verifikuar...";

  try {
    const res = await fetch(`${API_URL}/auth/email/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, code })
    });

    const data = await res.json();

    if (!res.ok) {
      emailVerified = false;
      setOtpInfo(translateApiError(data.error_code, "api_invalid_code"), "error");
      return;
    }

    emailVerified = true;
    setOtpInfo("Email u verifikua me sukses.", "success");
  } catch (err) {
    console.error(err);
    emailVerified = false;
    setOtpInfo("Gabim serveri gjatë verifikimit.", "error");
  } finally {
    btn.disabled = false;
    btn.innerText = "Verifiko email-in";
  }
}

function getPhoneCodeOption() {
  const select = document.getElementById("phoneCode");
  return select.options[select.selectedIndex];
}

function getPhoneConfig() {
  const option = getPhoneCodeOption();
  return {
    dialCode: option.value,
    maxDigits: Number(option.dataset.max || 9),
  };
}

function updatePhoneUi() {
  const phoneInput = document.getElementById("phone");
  const phoneHelp = document.getElementById("phoneHelp");
  const cfg = getPhoneConfig();

  phoneInput.maxLength = cfg.maxDigits;
  phoneInput.placeholder = tr("phone_label");

  if (phoneHelp) {
    phoneHelp.textContent = tr("phone_hint", {
      dialCode: cfg.dialCode,
      maxDigits: cfg.maxDigits
    });
  }
}

function sanitizePhoneInput() {
  const phoneInput = document.getElementById("phone");
  const cfg = getPhoneConfig();

  let value = String(phoneInput.value || "");
  value = value.replace(/\D/g, "");
  value = value.slice(0, cfg.maxDigits);

  phoneInput.value = value;
}

function buildFullPhone() {
  const cfg = getPhoneConfig();
  const localPhone = document.getElementById("phone").value.trim();
  return `${cfg.dialCode}${localPhone}`;
}

async function submitRegister(e) {
  e.preventDefault();

  const ownerName = document.getElementById("ownerName").value.trim();
  const ownerSurname = document.getElementById("ownerSurname").value.trim();
  const ownerAddress = document.getElementById("ownerAddress").value.trim();

  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  const businessName = document.getElementById("businessName").value.trim();
  const localPhone = document.getElementById("phone").value.trim();
  const selectedCountry = document.getElementById("operatingCountry").value;
  const phoneCfg = getPhoneConfig();
  const city = document.getElementById("city").value.trim();
  const businessAddress = document.getElementById("businessAddress").value.trim();
  const categories = getSelectedRegisterCategories();
  const description = document.getElementById("description").value.trim();

  const logoFile = document.getElementById("logo").files[0] || null;
  const photoFiles = Array.from(document.getElementById("photos").files || []);

  if (!ownerName || !ownerSurname || !email || !password || !confirmPassword) {
    showStatus("Plotëso të gjitha fushat e account-it.");
    return;
  }

  if (password.length < 6) {
    showStatus("Password duhet me pas të paktën 6 karaktere.");
    return;
  }

  if (password !== confirmPassword) {
    showStatus("Password nuk përputhen.");
    return;
  }

  if (!emailVerified) {
    showStatus("Verifiko email-in para regjistrimit.");
    return;
  }

  if (!businessName || !localPhone || !city || categories.length === 0) {
  showStatus("Plotëso të gjitha fushat e listing-ut dhe zgjidh të paktën një kategori.");
  return;
}

if (categories.length > REGISTER_CATEGORY_LIMIT) {
  showStatus(tr("msg_max_categories", {
    n: REGISTER_CATEGORY_LIMIT,
    plan: getRegisterPlanLabel()
  }));
  return;
}

if (!/^\d+$/.test(localPhone)) {
  showStatus("Numri i telefonit duhet të përmbajë vetëm numra.");
  return;
}

if (localPhone.length !== phoneCfg.maxDigits) {
  showStatus(`Numri i telefonit duhet të ketë saktësisht ${phoneCfg.maxDigits} shifra për shtetin e zgjedhur.`);
  return;
}

const phone = buildFullPhone();

  if (photoFiles.length > 3) {
    showStatus("Mund të ngarkosh maksimumi 3 foto falas.");
    return;
  }

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.innerText = "Duke krijuar account-in...";
  let proUser = null;
  let reusedProUser = false;

  try {
    showStatus("Duke krijuar pro account...", "info");

    const proSignupRes = await apiAuthFetch(`${API_URL}/pro/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: ownerName,
        surname: ownerSurname,
        address: ownerAddress,
        email,
        password
      })
    });

    const proSignupData = await proSignupRes.json();
    reusedProUser = !!proSignupData.reused;

    if (!proSignupRes.ok || !proSignupData.success) {
      showStatus(translateApiError(proSignupData.error_code, "api_server_error"));
      return;
    }

    proUser = proSignupData.user;
    const proSessionToken = String(proSignupData.sessionToken || "").trim();

    showStatus("Duke krijuar listing-un...", "info");

    const formData = new FormData();
    formData.append("owner_user_id", proUser.id);
    formData.append("name", businessName);
    formData.append("email", email);
    formData.append("phone", phone);
    formData.append("address", businessAddress);
    formData.append("city", city);
    formData.append("country", selectedCountry);
    formData.append("description", description);

    categories.forEach(cat => {
      formData.append("categories", cat);
    });

    if (logoFile) {
      formData.append("logo", logoFile);
    }

    for (const file of photoFiles) {
      formData.append("photos", file);
    }

    const registerHeaders = {};
    if (proSessionToken) {
      registerHeaders.Authorization = `Bearer ${proSessionToken}`;
    }

    const registerRes = await apiFetch(`${API_URL}/register`, {
      method: "POST",
      headers: registerHeaders,
      body: formData
    });

    const registerData = await registerRes.json();

    if (!registerRes.ok || !registerData.success) {
      try {
        if (!reusedProUser && proUser?.id) {
          await apiFetch(`${API_URL}/pro/rollback-signup`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              userId: proUser.id,
              email
            })
          });
        }
      } catch (rollbackErr) {
        console.error("ROLLBACK ERROR:", rollbackErr);
      }
      showStatus(translateApiError(registerData.error_code, "api_server_error"));
      return;
    }

    setUser({
      id: proUser.id || proUser._id,
      name: proUser.name,
      surname: proUser.surname,
      address: proUser.address,
      email: proUser.email,
      role: proUser.role,
      credits: proUser.credits,
      sessionToken: proSignupData.sessionToken
    });

    showStatus("Account dhe listing u krijuan me sukses.", "success");

    setTimeout(() => {
      goToPage("pro-dashboard.html");
    }, 900);
  } catch (err) {
    console.error(err);
    try {
      if (!reusedProUser && proUser?.id && email) {
        await apiFetch(`${API_URL}/pro/rollback-signup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            userId: proUser.id,
            email
          })
        });
      }
    } catch (rollbackErr) {
      console.error("ROLLBACK ERROR:", rollbackErr);
    }
    showStatus("Gabim serveri.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Krijo account dhe listing";
  }
}

const phoneCodeSelectEl = document.getElementById("phoneCode");
const phoneInputEl = document.getElementById("phone");

if (phoneCodeSelectEl && phoneInputEl) {
  phoneCodeSelectEl.addEventListener("change", () => {
    sanitizePhoneInput();
    updatePhoneUi();
  });

  phoneInputEl.addEventListener("input", sanitizePhoneInput);

  updatePhoneUi();
}

window.addEventListener("easyfix:languagechange", updatePhoneUi);

document.getElementById("sendOtpBtn").addEventListener("click", sendOtp);
document.getElementById("verifyOtpBtn").addEventListener("click", verifyOtp);
document.getElementById("registerForm").addEventListener("submit", submitRegister);
document.querySelectorAll(".reg-category").forEach(el => {
  el.addEventListener("change", () => enforceRegisterCategoryLimit(el));
});
setRegisterCategoriesStatus(tr("categories_limit_hint", {
  n: REGISTER_CATEGORY_LIMIT,
  plan: getRegisterPlanLabel()
}));


