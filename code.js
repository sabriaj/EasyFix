// URL e backend-it
const BACKEND_URL = "https://easyfix.onrender.com";

const CHECKOUT_URLS = {
  basic: "https://easyfixx.lemonsqueezy.com/buy/d78e48d9-9c54-4ee3-8aed-d4a63ecbd31a?logo=0",
  standard: "https://easyfixx.lemonsqueezy.com/buy/544a4069-7897-4cb0-a8e4-62e0aeb54b4b?logo=0",
  premium: "https://easyfixx.lemonsqueezy.com/buy/700a3989-d2c8-4f8a-be82-57157c75b585?logo=0"
};

function $(s) {
  return document.querySelector(s);
}

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
    type === "error"
      ? "#dc2626"
      : type === "success"
      ? "#16a34a"
      : "#2563eb";
}

let selectedPlan = "";

// Shfaq / fsheh upload seksionin
document.querySelectorAll(".plan-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".plan-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    selectedPlan = btn.dataset.plan;
    $("#selectedPlan").value = selectedPlan;

    // Shfaq upload vetëm për standard + premium
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

// FORM SUBMIT
const form = $("#registerForm");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const emri = $("#emri").value.trim();
    const adresa = $("#adresa").value.trim();
    const telefoni = $("#telefoni").value.trim();
    const emaili = $("#emaili").value.trim();
    const kategoria = $("#kategoria").value.trim();

    if (!emri || !adresa || !telefoni || !emaili || !kategoria) {
      showStatus("Ju lutem plotësoni të gjitha fushat.", "error");
      return;
    }

    if (!selectedPlan) {
      showStatus("Ju lutem zgjidhni një plan.", "error");
      return;
    }

    // VALIDIMI I LOGOS (max 3MB)
    const logoInput = $("#logoUpload");
    let logoFile = null;

    if ((selectedPlan === "standard" || selectedPlan === "premium") && logoInput.files.length > 0) {
      logoFile = logoInput.files[0];
      if (logoFile.size > 3 * 1024 * 1024) {
        showStatus("Logo duhet të jetë ≤ 3MB.", "error");
        return;
      }
    }

    // VALIDIMI I FOTOVE (max 3 foto, secila max 3MB)
    const photosInput = $("#photoUpload");
    let photoFiles = [];

    if (selectedPlan !== "basic" && photosInput.files.length > 0) {
      if (photosInput.files.length > 3) {
        showStatus("Mund të ngarkoni maksimum 3 foto.", "error");
        return;
      }

      for (let f of photosInput.files) {
        if (f.size > 3 * 1024 * 1024) {
          showStatus("Secila foto duhet të jetë ≤ 3MB.", "error");
          return;
        }
        photoFiles.push(f);
      }
    }

    // Ruaj regjistrimin bazë
    const payload = {
      name: emri,
      email: emaili,
      phone: telefoni,
      address: adresa,
      category: kategoria,
      plan: selectedPlan
    };

    showStatus("Duke ruajtur regjistrimin...", "loading");

    try {
      const res = await fetch(`${BACKEND_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.status === 409) {
        showStatus("Ky email tashmë është i përdorur!", "error");
        return;
      }

      if (!res.ok) {
        showStatus("Gabim nga serveri. Provo përsëri.", "error");
        return;
      }

      const data = await res.json();

      if (!data.success) {
        showStatus("Gabim në regjistrim.", "error");
        return;
      }

      showStatus("Regjistrimi u ruajt me sukses!", "success");

      // GJENERO LINK-un e checkout-it me email
      const base = CHECKOUT_URLS[selectedPlan] || CHECKOUT_URLS.standard;

      const checkoutUrl =
        base +
        `&checkout[email]=${encodeURIComponent(emaili)}` +
        `&checkout[custom][email]=${encodeURIComponent(emaili)}`;

      setTimeout(() => {
        window.location.href = checkoutUrl;
      }, 1000);

    } catch (err) {
      console.error(err);
      showStatus("Gabim në komunikimin me serverin.", "error");
    }
  });
}
