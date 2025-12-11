// URL i backend për regjistrim
const BACKEND_URL = "https://easyfix.onrender.com";

const CHECKOUT_URLS = {
  basic:   "https://easyfixx.lemonsqueezy.com/buy/d78e48d9-9c54-4ee3-8aed-d4a63ecbd31a?logo=0",
  standard:"https://easyfixx.lemonsqueezy.com/buy/544a4069-7897-4cb0-a8e4-62e0aeb54b4b?logo=0",
  premium: "https://easyfixx.lemonsqueezy.com/buy/700a3989-d2c8-4f8a-be82-57157c75b585?logo=0"
};

const PLAN_DETAILS = {
  basic: {
    title: "Basic – 15€/muaj",
    advantages: [
      "Listim bazë në EasyFix",
      "Shfaqje standard në kategorinë përkatëse",
      "Telefoni dhe emaili i firmës të dukshëm për klientët"
    ]
  },
  standard: {
    title: "Standard – 20€/muaj",
    advantages: [
      "Të gjitha avantazhet e planit BASIC",
      "Logo e kompanisë shfaqet në kartelën e firmës",
      "Deri në 3 foto të shërbimeve më të mira",
      "Pozicion më i mirë në rezultatet e kërkimit"
    ]
  },
  premium: {
    title: "Premium – 30€/muaj",
    advantages: [
      "Të gjitha avantazhet e planit STANDARD",
      "Mundësi për shumë foto (portfolio e plotë)",
      "Pozicion Top sipas lokacionit në listime",
      "Brandim i fortë dhe besueshmëri më e madhe te klientët"
    ]
  }
};

function $(s) {
  return document.querySelector(s);
}

function showStatus(msg, type = "info") {
  const el = $("#status");
  if (!el) return;

  el.textContent = msg;
  el.className = "status";
  if (type === "error") el.classList.add("error");
  if (type === "success") el.classList.add("success");
  if (type === "loading") el.classList.add("loading");
  el.classList.remove("hidden");
}

let selectedPlan = "";

// PLAN BUTTONS + panel avantazhesh
const planButtons = document.querySelectorAll(".plan-btn");
const planTitleEl = $("#planTitle");
const planAdvantagesEl = $("#planAdvantages");

planButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    planButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedPlan = btn.dataset.plan;

    const hidden = $("#selectedPlan");
    if (hidden) hidden.value = selectedPlan;

    // përditëso panelin e avantazheve
    const details = PLAN_DETAILS[selectedPlan];
    if (details && planTitleEl && planAdvantagesEl) {
      planTitleEl.textContent = details.title;
      planAdvantagesEl.innerHTML = "";
      details.advantages.forEach((adv) => {
        const li = document.createElement("li");
        li.textContent = "• " + adv;
        planAdvantagesEl.appendChild(li);
      });
    }
  });
});

const form = $("#registerForm");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const emri      = $("#emri")?.value.trim() || "";
    const adresa    = $("#adresa")?.value.trim() || "";
    const telefoni  = $("#telefoni")?.value.trim() || "";
    const emaili    = $("#emaili")?.value.trim() || "";
    const kategoria = $("#kategoria")?.value.trim() || "";

    const logoInput   = $("#logo");
    const photosInput = $("#photos");

    if (!emri || !adresa || !telefoni || !emaili || !kategoria) {
      showStatus("Ju lutem plotësoni të gjitha fushat e formularit.", "error");
      return;
    }
    if (!selectedPlan) {
      showStatus("Ju lutem zgjidhni një plan abonimi.", "error");
      return;
    }

    // Ndërto FormData për të dërguar të dhënat + file-t
    const formData = new FormData();
    formData.append("name", emri);
    formData.append("address", adresa);
    formData.append("phone", telefoni);
    formData.append("email", emaili);
    formData.append("category", kategoria);
    formData.append("plan", selectedPlan);

    // Logo + foto VETËM për standard/premium
    if (selectedPlan === "standard" || selectedPlan === "premium") {
      if (logoInput && logoInput.files[0]) {
        formData.append("logo", logoInput.files[0]);
      }

      if (photosInput && photosInput.files && photosInput.files.length > 0) {
        const maxPhotos = selectedPlan === "standard" ? 3 : 20;
        const count = Math.min(photosInput.files.length, maxPhotos);
        for (let i = 0; i < count; i++) {
          formData.append("photos", photosInput.files[i]);
        }
      }
    }

    try {
      showStatus("Po ruajmë regjistrimin...", "loading");

      const res = await fetch(`${BACKEND_URL}/register`, {
        method: "POST",
        body: formData
      });

      if (res.status === 409) {
        showStatus("Ky email tashmë është i regjistruar!", "error");
        return;
      }

      if (!res.ok) {
        showStatus(`Gabim nga serveri (${res.status}).`, "error");
        return;
      }

      let data = {};
      try {
        data = await res.json();
      } catch {
        showStatus("Serveri ktheu përgjigje të pavlefshme. (Jo JSON)", "error");
        return;
      }

      if (data.success) {
        showStatus("Regjistrimi u krye me sukses! Po kaloni te pagesa...", "success");

        // URL e checkout-it + e detyrojmë Lemon të përdorë TË NJËJTIN EMAIL
        const base = CHECKOUT_URLS[selectedPlan] || CHECKOUT_URLS.standard;
        const checkoutUrl =
          base +
          `&checkout[email]=${encodeURIComponent(emaili)}` +
          `&checkout[custom][email]=${encodeURIComponent(emaili)}`;

        setTimeout(() => {
          window.location.href = checkoutUrl;
        }, 1000);
      } else {
        showStatus(data.error || "Gabim në regjistrim.", "error");
      }
    } catch (err) {
      console.error("Gabim gjatë kërkesës:", err);
      showStatus(
        "Problem me rrjetin ose serverin. Provoni përsëriteni më vonë.",
        "error"
      );
    }
  });
}
