// URL i backend për regjistrim
const BACKEND_URL = "https://easyfix.onrender.com";

const CHECKOUT_URLS = {
  basic:   "https://easyfixx.lemonsqueezy.com/buy/d78e48d9-9c54-4ee3-8aed-d4a63ecbd31a?logo=0",
  standard:"https://easyfixx.lemonsqueezy.com/buy/544a4069-7897-4cb0-a8e4-62e0aeb54b4b?logo=0",
  premium: "https://easyfixx.lemonsqueezy.com/buy/700a3989-d2c8-4f8a-be82-57157c75b585?logo=0"
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

let selectedPlan = "";

document.querySelectorAll(".plan-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".plan-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedPlan = btn.dataset.plan;

    const hidden = $("#selectedPlan");
    if (hidden) hidden.value = selectedPlan;
  });
});

const form = $("#registerForm");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const emri     = $("#emri")?.value.trim() || "";
    const adresa   = $("#adresa")?.value.trim() || "";
    const telefoni = $("#telefoni")?.value.trim() || "";
    const emaili   = $("#emaili")?.value.trim() || "";
    const kategoria= $("#kategoria")?.value.trim() || "";

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

      // Konflikt emaili (email ekziston)
      if (res.status === 409) {
        showStatus("Ky email tashmë është i regjistruar!", "error");
        return;
      }

      // Gabime të tjera HTTP
      if (!res.ok) {
        showStatus(`Gabim nga serveri (${res.status}).`, "error");
        return;
      }

      // Provo të lexosh JSON-in
      let data = {};
      try {
        data = await res.json();
      } catch {
        showStatus("Serveri ktheu përgjigje të pavlefshme. (Jo JSON)", "error");
        return;
      }

      // Nëse backend kthen sukses
      if (data.success) {
        showStatus("Regjistrimi u krye me sukses!", "success");

        const checkoutUrl = CHECKOUT_URLS[selectedPlan] || CHECKOUT_URLS.standard;

        setTimeout(() => {
          window.location.href = checkoutUrl;
        }, 1000);

      } else {
        showStatus(data.error || "Gabim në regjistrim.", "error");
      }

    } catch (err) {
      console.error("Gabim gjatë kërkesës:", err);
      showStatus("Problem me rrjetin ose serverin. Provoni përsëri më vonë.", "error");
    }

  });
}
