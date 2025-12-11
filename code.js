const BACKEND_URL = "https://easyfix.onrender.com";

const CHECKOUT_URLS = {
  basic: "https://easyfixx.lemonsqueezy.com/buy/d78e48d9-9c54-4ee3-8aed-d4a63ecbd31a?logo=0",
  standard: "https://easyfixx.lemonsqueezy.com/buy/544a4069-7897-4cb0-a8e4-62e0aeb54b4b?logo=0",
  premium: "https://easyfixx.lemonsqueezy.com/buy/700a3989-d2c8-4f8a-be82-57157c75b585?logo=0"
};

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

let selectedPlan = "";

// PLAN SELECTION
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
  });
});

// SUBMIT FORM
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

  // FORM-DATA (PËR MULTER)
  const formData = new FormData();
  formData.append("name", name);
  formData.append("email", email);
  formData.append("phone", phone);
  formData.append("address", address);
  formData.append("category", category);
  formData.append("plan", selectedPlan);

  // Logo
  const logoFile = $("#logoUpload").files[0];
  if ((selectedPlan === "standard" || selectedPlan === "premium") && logoFile) {
    formData.append("logo", logoFile);
  }

  // Photos
  const photos = $("#photoUpload").files;
  if (selectedPlan !== "basic") {
    for (let i = 0; i < photos.length; i++) {
      formData.append("photos", photos[i]);
    }
  }

  showStatus("Duke ruajtur regjistrimin...", "loading");

  try {
    const res = await fetch(`${BACKEND_URL}/register`, {
      method: "POST",
      body: formData // JO JSON
    });

    if (res.status === 409) {
      showStatus("Ky email tashmë është i regjistruar.", "error");
      return;
    }

    const data = await res.json();

    if (!data.success) {
      showStatus("Gabim në regjistrim.", "error");
      return;
    }

    showStatus("Regjistrimi u krye me sukses.", "success");

    const checkoutUrl =
      CHECKOUT_URLS[selectedPlan] +
      `&checkout[email]=${encodeURIComponent(email)}` +
      `&checkout[custom][email]=${encodeURIComponent(email)}`;

    setTimeout(() => {
      window.location.href = checkoutUrl;
    }, 1000);

  } catch (err) {
    console.error(err);
    showStatus("Gabim gjatë komunikimit me serverin.", "error");
  }
});
