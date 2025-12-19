const BACKEND_URL = "https://easyfix.onrender.com";

const $ = (s) => document.querySelector(s);

const loginBox = $("#loginBox");
const adminApp = $("#adminApp");

const loginBtn = $("#loginBtn");
const logoutBtn = $("#logoutBtn");
const adminKeyInput = $("#adminKeyInput");
const loginMsg = $("#loginMsg");

const refreshBtn = $("#refreshBtn");
const appMsg = $("#appMsg");
const firmsTbody = $("#firmsTbody");

const searchInput = $("#searchInput");
const statusSelect = $("#statusSelect");
const planSelect = $("#planSelect");
const countryInput = $("#countryInput");

const statTotal = $("#statTotal");
const statPending = $("#statPending");
const statPaid = $("#statPaid");
const statExpired = $("#statExpired");

function setMsg(el, text, ok = true) {
  el.textContent = text || "";
  el.style.color = ok ? "#374151" : "#dc2626";
}

function getToken() {
  return localStorage.getItem("easyfix_admin_token") || "";
}

function setToken(t) {
  localStorage.setItem("easyfix_admin_token", t);
}

function clearToken() {
  localStorage.removeItem("easyfix_admin_token");
}

async function api(path, opts = {}) {
  const token = getToken();
  const headers = opts.headers ? { ...opts.headers } : {};
  headers["Authorization"] = `Bearer ${token}`;

  // JSON body support
  if (opts.json) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.json);
    delete opts.json;
  }

  const res = await fetch(`${BACKEND_URL}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || `HTTP ${res.status}`;
    throw new Error(err);
  }
  return data;
}

function fmtDate(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "-";
    return dt.toISOString().slice(0, 10);
  } catch {
    return "-";
  }
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function badge(text, cls) {
  return `<span class="px-2 py-1 rounded-full text-xs font-bold ${cls}">${esc(text)}</span>`;
}

function planBadge(p) {
  p = String(p || "").toLowerCase();
  if (p === "premium") return badge("premium", "bg-yellow-100 text-yellow-800");
  if (p === "standard") return badge("standard", "bg-blue-100 text-blue-800");
  return badge("basic", "bg-gray-100 text-gray-800");
}

function statusBadge(s) {
  s = String(s || "").toLowerCase();
  if (s === "paid") return badge("paid", "bg-green-100 text-green-800");
  if (s === "expired") return badge("expired", "bg-red-100 text-red-800");
  return badge("pending", "bg-orange-100 text-orange-800");
}

function renderRows(firms) {
  firmsTbody.innerHTML = "";

  if (!firms || !firms.length) {
    firmsTbody.innerHTML = `<tr><td class="p-4 text-gray-500" colspan="8">S’ka rezultate.</td></tr>`;
    return;
  }

  for (const f of firms) {
    const id = f._id;
    const tr = document.createElement("tr");
    tr.className = "border-t";

    tr.innerHTML = `
      <td class="p-3 font-semibold">${esc(f.name)}</td>
      <td class="p-3">${esc(f.email)}</td>
      <td class="p-3">${esc(f.phone || "-")}</td>
      <td class="p-3">${planBadge(f.plan)}</td>
      <td class="p-3">${statusBadge(f.payment_status)}</td>
      <td class="p-3">${esc(f.country || "-")}</td>
      <td class="p-3">${fmtDate(f.createdAt)}</td>
      <td class="p-3">
        <div class="flex flex-wrap gap-2">
          <button data-act="markPaid" data-id="${esc(id)}"
            class="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold">Mark Paid</button>

          <button data-act="expire" data-id="${esc(id)}"
            class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold">Expire</button>

          <button data-act="delete" data-id="${esc(id)}"
            class="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-black text-white font-semibold">Delete</button>
        </div>
      </td>
    `;

    firmsTbody.appendChild(tr);
  }

  // bind actions
  firmsTbody.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", onActionClick);
  });
}

async function loadStats() {
  try {
    const r = await api("/admin/stats");
    const s = r.stats || {};
    statTotal.textContent = s.total ?? "-";
    statPending.textContent = s.pending ?? "-";
    statPaid.textContent = s.paid ?? "-";
    statExpired.textContent = s.expired ?? "-";
  } catch (e) {
    // mos e ndal app-in veç pse stats s’punon
  }
}

async function loadFirms() {
  const search = (searchInput.value || "").trim();
  const status = statusSelect.value || "all";
  const plan = planSelect.value || "all";
  const country = (countryInput.value || "").trim().toUpperCase() || "all";

  const qs = new URLSearchParams();
  qs.set("status", status);
  qs.set("plan", plan);
  qs.set("country", country);
  if (search) qs.set("search", search);

  setMsg(appMsg, "Duke i marrë të dhënat...", true);

  const r = await api(`/admin/firms?${qs.toString()}`);
  renderRows(r.firms || []);
  setMsg(appMsg, `U ngarkuan ${(r.firms || []).length} firma.`, true);

  loadStats();
}

async function onActionClick(e) {
  const btn = e.currentTarget;
  const act = btn.getAttribute("data-act");
  const id = btn.getAttribute("data-id");

  try {
    if (act === "delete") {
      const ok = confirm("A je i sigurt që do me e fshi këtë firmë?");
      if (!ok) return;
      await api(`/admin/firms/${encodeURIComponent(id)}`, { method: "DELETE" });
      setMsg(appMsg, "U fshi me sukses.", true);
      await loadFirms();
      return;
    }

    if (act === "expire") {
      await api(`/admin/firms/${encodeURIComponent(id)}/expire`, { method: "POST" });
      setMsg(appMsg, "U vendos expired.", true);
      await loadFirms();
      return;
    }

    if (act === "markPaid") {
      const days = prompt("Sa ditë me vlejt abonimi? (default 30)", "30");
      const n = Number(days || 30);
      await api(`/admin/firms/${encodeURIComponent(id)}/mark-paid`, { method: "POST", json: { days: n } });
      setMsg(appMsg, "U vendos paid.", true);
      await loadFirms();
      return;
    }
  } catch (err) {
    setMsg(appMsg, `Gabim: ${err.message}`, false);
  }
}

function showApp() {
  loginBox.classList.add("hidden");
  adminApp.classList.remove("hidden");
}

function showLogin() {
  adminApp.classList.add("hidden");
  loginBox.classList.remove("hidden");
}

async function tryBoot() {
  const token = getToken();
  if (!token) {
    showLogin();
    return;
  }

  // test auth
  try {
    showApp();
    await loadFirms();
    await loadStats();
  } catch (e) {
    clearToken();
    showLogin();
    setMsg(loginMsg, "Token gabim ose ADMIN_KEY s’është saktë.", false);
  }
}

loginBtn.addEventListener("click", async () => {
  const key = (adminKeyInput.value || "").trim();
  if (!key) {
    setMsg(loginMsg, "Shkruaje ADMIN_KEY.", false);
    return;
  }
  setToken(key);
  setMsg(loginMsg, "Duke provu...", true);
  await tryBoot();
});

logoutBtn.addEventListener("click", () => {
  clearToken();
  showLogin();
  setMsg(loginMsg, "U ç’kyçe.", true);
});

refreshBtn.addEventListener("click", () => loadFirms());

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadFirms();
});

statusSelect.addEventListener("change", () => loadFirms());
planSelect.addEventListener("change", () => loadFirms());
countryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadFirms();
});

window.addEventListener("DOMContentLoaded", tryBoot);
