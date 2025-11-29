// ====== CONFIG: Zëvendëso me URL-të e tua ======
const SAVE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby7qKZTOmhH8B7O_XdFH1E71lL1vPqqQmUmThL7guHAeY9m6e9hIAG6G7iQ8nsReHYh/exec"; // POST për të ruajtur regjistrimin (pre-checkout)
const FINALIZE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbymgufe0Gcwg75ifqYfrkLIAnRvoVKkWJ_Kbhm9DE2esQlXV4wrZaHZt_Dzxv1aRus/exec"; // (opsionale) finalize after redirect
// Checkout URLs (ke dërguar këto — i kam vendosur si janë)
const CHECKOUT_URLS = {
  basic:   "https://easyfixx.lemonsqueezy.com/buy/d78e48d9-9c54-4ee3-8aed-d4a63ecbd31a?logo=0",
  standard:"https://easyfixx.lemonsqueezy.com/buy/544a4069-7897-4cb0-a8e4-62e0aeb54b4b?logo=0",
  premium: "https://easyfixx.lemonsqueezy.com/buy/700a3989-d2c8-4f8a-be82-57157c75b585?logo=0"
};
// =================================================



document.querySelectorAll(".plan-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".plan-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    selectedPlan = btn.dataset.plan;
    document.getElementById("selectedPlan").value = selectedPlan;
  });
});

// utility
function $(sel) { return document.querySelector(sel); }
function showStatus(msg, type = "info") {
  // try to find #status in page
  const statusEl = document.getElementById("status");
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = "status";
  if (type === "error") statusEl.classList.add("error");
  if (type === "success") statusEl.classList.add("success");
  if (type === "loading") statusEl.classList.add("loading");
}

// ------------------------------
// Plan buttons logic
// ------------------------------
let selectedPlan = "";
document.querySelectorAll(".plan-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".plan-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedPlan = btn.dataset.plan; // expects "basic", "standard", "premium"
    const hidden = document.getElementById("selectedPlan");
    if (hidden) hidden.value = selectedPlan;
  });
});

// ------------------------------
// FORM SUBMIT: save pre-checkout => redirect to LemonSqueezy
// ------------------------------
const form = document.getElementById("registerForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Basic validation
    const emri = (document.getElementById("emri") || {}).value || "";
    const adresa = (document.getElementById("adresa") || {}).value || "";
    const telefoni = (document.getElementById("telefoni") || {}).value || "";
    const emaili = (document.getElementById("emaili") || {}).value || "";
    const kategoria = (document.getElementById("kategoria") || {}).value || "";

    if (!emri || !adresa || !telefoni || !emaili || !kategoria) {
      showStatus("Ju lutem plotësoni të gjitha fushat e nevojshme.", "error");
      return;
    }
    if (!selectedPlan) {
      showStatus("Ju lutem zgjidhni një plan abonimi.", "error");
      return;
    }

    // prepare payload for save endpoint (pre-checkout)
    const payload = {
      emri,
      adresa,
      telefoni,
      emaili,
      kategoria,
      plan: selectedPlan,
      statusi: "pending", // pending until checkout+webhook confirm
      data_regjistrimit: new Date().toISOString(),
      data_skadances: "",
      created_at: new Date().toISOString(),
      payment_id: "",
      customer_id: ""
    };

    // save locally (in case of redirect back)
    try {
      localStorage.setItem("easyfix_pending_registration", JSON.stringify(payload));
    } catch (err) {
      console.warn("localStorage error:", err);
    }

    // send to your Apps Script "save" endpoint (so we have a record even if webhook delays)
    try {
      showStatus("Po ruajmë regjistrimin dhe po hapim pagesën...", "loading");
      const res = await fetch(SAVE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_precheckout", data: payload })
      });
      // attempt to parse response (not strictly required)
      try { await res.json(); } catch(e){ /* ignore parse */ }
    } catch (err) {
      console.warn("Could not call SAVE_SCRIPT_URL:", err);
      // proceed anyway — we still redirect to checkout
    }

    // redirect to correct Lemon Squeezy checkout
    const checkoutUrl = CHECKOUT_URLS[selectedPlan] || CHECKOUT_URLS.standard;
    // open in same tab (user expects)
    window.location.href = checkoutUrl;
  });
}


// ------------------------------
// OPTIONAL: After checkout (success redirect) - finalize record
// ------------------------------
// Note: Lemon Squeezy will also send a webhook to your Apps Script webhook endpoint.
// This function is OPTIONAL: if you configure Lemon to redirect with query args (order_id, customer_id),
// this will pick those up, combine with localStorage pending data, and call FINALIZE_SCRIPT_URL.
// If you prefer to rely only on Webhook, you can ignore this function.
async function processPostCheckout() {
  try {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order_id") || params.get("orderId") || params.get("order");
    const customerId = params.get("customer_id") || params.get("customerId") || params.get("customer");
    if (!orderId && !customerId) return; // nothing to do

    const pending = JSON.parse(localStorage.getItem("easyfix_pending_registration") || "null");
    if (!pending) return;

    pending.payment_id = orderId || "";
    pending.customer_id = customerId || "";
    pending.statusi = "active";

    // estimate expiry: if plan is monthly -> +30 days, if annual -> +365 days
    const reg = new Date();
    let exp = new Date(reg);
    if (pending.plan && /vit|year|annual|annually/i.test(pending.plan)) {
      exp.setFullYear(exp.getFullYear() + 1);
    } else {
      exp.setDate(exp.getDate() + 30);
    }
    pending.data_regjistrimit = reg.toISOString();
    pending.data_skadances = exp.toISOString();

    // send finalize request to your Apps Script finalize endpoint
    try {
      await fetch(FINALIZE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize_after_redirect", data: pending })
      });
    } catch (err) {
      console.warn("Could not call FINALIZE_SCRIPT_URL:", err);
    }

    // cleanup localStorage
    localStorage.removeItem("easyfix_pending_registration");

    // show success UI if present
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent = "Pagesa u regjistrua. Profili do të aktivizohet së shpejti.";
      statusEl.classList.add("success");
    }

  } catch (err) {
    console.error("processPostCheckout error:", err);
  }
}

// auto-run on pages that have query params (e.g. success redirect)
if (typeof window !== "undefined" && window.location.search) {
  // give the page a second to load then run
  setTimeout(processPostCheckout, 700);
}





