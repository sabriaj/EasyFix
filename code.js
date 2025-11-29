// ------------------------------
// CONFIG: Backend endpoint
// ------------------------------
const BACKEND_URL = "http://localhost:5000/contact"; // Change to your deployed server URL later

const CHECKOUT_URLS = {
  basic:   "https://easyfixx.lemonsqueezy.com/buy/d78e48d9-9c54-4ee3-8aed-d4a63ecbd31a?logo=0",
  standard:"https://easyfixx.lemonsqueezy.com/buy/544a4069-7897-4cb0-a8e4-62e0aeb54b4b?logo=0",
  premium: "https://easyfixx.lemonsqueezy.com/buy/700a3989-d2c8-4f8a-be82-57157c75b585?logo=0"
};

// ------------------------------
// UTILITY
// ------------------------------
function $(selector) { return document.querySelector(selector); }

function showStatus(msg, type = "info") {
  const statusEl = $("#status");
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = "status";
  if (type === "error") statusEl.classList.add("error");
  if (type === "success") statusEl.classList.add("success");
  if (type === "loading") statusEl.classList.add("loading");
}

// ------------------------------
// PLAN BUTTON LOGIC
// ------------------------------
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

// ------------------------------
// FORM SUBMIT: save to Node backend + redirect
// ------------------------------
const form = $("#registerForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Get form values
    const emri = $("#emri")?.value.trim() || "";
    const adresa = $("#adresa")?.value.trim() || "";
    const telefoni = $("#telefoni")?.value.trim() || "";
    const emaili = $("#emaili")?.value.trim() || "";
    const kategoria = $("#kategoria")?.value.trim() || "";

    // Validation
    if (!emri || !adresa || !telefoni || !emaili || !kategoria) {
      showStatus("Ju lutem plotësoni të gjitha fushat e nevojshme.", "error");
      return;
    }
    if (!selectedPlan) {
      showStatus("Ju lutem zgjidhni një plan abonimi.", "error");
      return;
    }

    // Prepare payload
    const payload = {
      name: emri,
      email: emaili,
      message: `Address: ${adresa}, Phone: ${telefoni}, Category: ${kategoria}, Plan: ${selectedPlan}`
    };

    try {
      showStatus("Po ruajmë regjistrimin...", "loading");

      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        showStatus("Regjistrimi u ruajt!", "success");

        // Redirect to checkout
        const checkoutUrl = CHECKOUT_URLS[selectedPlan] || CHECKOUT_URLS.standard;
        setTimeout(() => window.location.href = checkoutUrl, 1000);
      } else {
        showStatus("Gabim: " + (data.error || "Ndodhi një problem"), "error");
      }

    } catch (err) {
      showStatus("Gabim në ruajtje: " + err.message, "error");
    }
  });
}



