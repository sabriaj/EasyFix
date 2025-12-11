// URL i backend për regjistrim
const BACKEND_URL = "https://easyfix.onrender.com";

// URL-të e Lemon Squeezy për çdo plan
const CHECKOUT_URLS = {
  basic:   "https://easyfixx.lemonsqueezy.com/buy/d78e48d9-9c54-4ee3-8aed-d4a63ecbd31a?logo=0",
  standard:"https://easyfixx.lemonsqueezy.com/buy/544a4069-7897-4cb0-a8e4-62e0aeb54b4b?logo=0",
  premium: "https://easyfixx.lemonsqueezy.com/buy/700a3989-d2c8-4f8a-be82-57157c75b585?logo=0"
};

// Advantaget në frontend – identike me backend
const PLAN_DETAILS = {
  basic: {
    title: "Plani Basic – 15€/muaj",
    perks: [
      "Publikim i firmës në platformë",
      "Kontakt bazë (telefon + email)",
      "Shfaqje standarde në kategori",
      "1 kategori shërbimi",
      "Support bazik me email",
      "Pa logo / pa galeri fotosh"
    ]
  },
  standard: {
    title: "Plani Standard – 20€/muaj",
    perks: [
      "Të gjitha nga BASIC",
      "Logo e kompanisë në profil",
      "Deri në 3 foto të shërbimeve",
      "Prioritet në listë mbi Basic",
      "Profil më i detajuar i firmës"
    ]
  },
  premium: {
    title: "Plani Premium – 30€/muaj",
    perks: [
      "Të gjitha nga STANDARD",
      "Deri në 10 foto në galeri",
      "Vlerësime dhe komente nga klientët",
      "Promovim javor në seksionin e rekomanduar",
      "Pozicionim në TOP 3 sipas lokacionit"
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
}

function renderPlanDetails(planKey) {
  const box = $("#planDetails");
  const titleEl = $("#planDetailsTitle");
  const listEl = $("#planDetailsList");

  if (!box || !titleEl || !listEl) return;

  const details = PLAN_DETAILS[planKey];
  if (!details) {
    box.classList.add("hidden");
    return;
  }

  titleEl.textContent = details.title;
  listEl.innerHTML = "";
  details.perks.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p;
    listEl.appendChild(li);
  });

  box.classList.remove("hidden");
}

let selectedPlan = "";

// HANDLE PLAN BUTTONS
document.querySelectorAll(".plan-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".plan-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedPlan = btn.dataset.plan;

    const hidden = $("#selectedPlan");
    if (hidden) hidden.value = selectedPlan;

    // Shfaq advantaget e planit të zgjedhur
    renderPlanDetails(selectedPlan);
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

    if (!emri || !adresa || !telefoni || !emaili || !kategoria) {
      showStatus("Ju lutem plotësoni të gjitha fushat e formularit.", "error");
      return;
    }
    if (!selectedPlan) {
      showStatus("Ju lutem zgjidhni një plan abonimi.", "error");
      return;
    }

    const payload = {
      name: emri,
      email: emaili,
      phone: telefoni,
      address: adresa,
      category: kategoria,
      plan: selectedPlan
    };

    try {
      showStatus("Po ruajmë regjistrimin...", "loading");

      const res = await fetch(`${BACKEND_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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
        showStatus("Regjistrimi u krye me sukses! Po ju dërgojmë te pagesa...", "success");

        const base = CHECKOUT_URLS[selectedPlan] || CHECKOUT_URLS.standard;

        // Ky email përdoret në webhook si checkout_data.custom.email
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
      showStatus("Problem me rrjetin ose serverin. Provoni përsëriteni më vonë.", "error");
    }
  });
}
