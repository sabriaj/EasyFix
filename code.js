const API_URL = "https://easyfix-dev-1.onrender.com";

let emailVerified = false;


function getSelectedRegisterCategories() {
  return Array.from(document.querySelectorAll(".reg-category:checked"))
    .map(el => el.value);
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
      setOtpInfo(data.error_code || "Gabim gjatë dërgimit të OTP.", "error");
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
      setOtpInfo(data.error_code || "OTP i pavlefshëm.", "error");
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

async function submitRegister(e) {
  e.preventDefault();

  const ownerName = document.getElementById("ownerName").value.trim();
  const ownerSurname = document.getElementById("ownerSurname").value.trim();
  const ownerAddress = document.getElementById("ownerAddress").value.trim();

  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  const businessName = document.getElementById("businessName").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const city = document.getElementById("city").value.trim();
  const businessAddress = document.getElementById("businessAddress").value.trim();
  const categories = getSelectedRegisterCategories();
  const description = document.getElementById("description").value.trim();

  const logoFile = document.getElementById("logo").files[0] || null;
  const photoFiles = Array.from(document.getElementById("photos").files || []);

  if (!ownerName || !ownerSurname || !ownerAddress || !email || !password || !confirmPassword) {
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

  if (!businessName || !phone || !city || !businessAddress || categories.length === 0) {
    showStatus("Plotëso të gjitha fushat e listing-ut dhe zgjidh të paktën një kategori.");
    return;
  }

  if (photoFiles.length > 3) {
    showStatus("Mund të ngarkosh maksimumi 3 foto falas.");
    return;
  }

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.innerText = "Duke krijuar account-in...";

  try {
    showStatus("Duke krijuar pro account...", "info");

    const proSignupRes = await fetch(`${API_URL}/pro/signup`, {
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

    if (!proSignupRes.ok || !proSignupData.success) {
      showStatus(proSignupData.error_code || "Gabim gjatë krijimit të pro account.");
      return;
    }

    const proUser = proSignupData.user;

    showStatus("Duke krijuar listing-un...", "info");

    const formData = new FormData();
    formData.append("owner_user_id", proUser.id);
    formData.append("name", businessName);
    formData.append("email", email);
    formData.append("phone", phone);
    formData.append("address", businessAddress);
    formData.append("city", city);
    formData.append("country", "MK");
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

    const registerRes = await fetch(`${API_URL}/register`, {
      method: "POST",
      body: formData
    });

    const registerData = await registerRes.json();

    if (!registerRes.ok || !registerData.success) {
      showStatus(registerData.error_code || "Gabim gjatë krijimit të listing-ut.");
      return;
    }

    localStorage.setItem("easyfix_user", JSON.stringify({
      id: proUser.id,
      name: proUser.name,
      surname: proUser.surname,
      address: proUser.address,
      email: proUser.email,
      role: proUser.role,
      credits: proUser.credits
    }));

    showStatus("Account dhe listing u krijuan me sukses.", "success");

    setTimeout(() => {
      window.location.href = "/pro-dashboard.html";
    }, 900);
  } catch (err) {
    console.error(err);
    showStatus("Gabim serveri.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Krijo account dhe listing";
  }
}

document.getElementById("sendOtpBtn").addEventListener("click", sendOtp);
document.getElementById("verifyOtpBtn").addEventListener("click", verifyOtp);
document.getElementById("registerForm").addEventListener("submit", submitRegister);