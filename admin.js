const BACKEND_URL = "https://easyfix-dev-1.onrender.com";

const $ = (s) => document.querySelector(s);

const loginBox = $("#loginBox");
const adminApp = $("#adminApp");

const loginBtn = $("#loginBtn");
const logoutBtn = $("#logoutBtn");
const adminKeyInput = $("#adminKeyInput");
const loginMsg = $("#loginMsg");

const refreshBtn = $("#refreshBtn");
const migrateBtn = $("#migrateBtn");
const appMsg = $("#appMsg");
const firmsTbody = $("#firmsTbody");

const searchInput = $("#searchInput");
const statusSelect = $("#statusSelect");
const planSelect = $("#planSelect");
const countryInput = $("#countryInput");

const statTotal = $("#statTotal");
const statActive = $("#statActive");
const statPremium = $("#statPremium");
const statFree = $("#statFree");

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

  if (opts.json) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.json);
    delete opts.json;
  }

  const res = await fetch(`${BACKEND_URL}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = data?.error || data?.error_code || `HTTP ${res.status}`;
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
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function badge(text, cls) {
  return `<span class="px-2 py-1 rounded-full text-xs font-bold ${cls}">${esc(text)}</span>`;
}

function planBadge(p) {
  p = String(p || "").toLowerCase();
  if (p === "premium") return badge("premium", "bg-yellow-100 text-yellow-800");
  return badge("free", "bg-gray-100 text-gray-800");
}

function statusBadge(s) {
  s = String(s || "").toLowerCase();
  if (s === "active") return badge("active", "bg-green-100 text-green-800");
  if (s === "expired") return badge("expired", "bg-red-100 text-red-800");
  return badge(s || "unknown", "bg-gray-100 text-gray-800");
}

function renderRows(firms) {
  firmsTbody.innerHTML = "";

  if (!firms || !firms.length) {
    firmsTbody.innerHTML = `
      <tr>
        <td class="p-4 text-gray-500" colspan="8">S’ka rezultate.</td>
      </tr>
    `;
    return;
  }

  for (const f of firms) {
    const id = f._id;

    const tr = document.createElement("tr");
    tr.className = "border-t align-top";

    tr.innerHTML = `
      <td class="p-4">
        <div class="font-bold text-gray-900">${esc(f.name)}</div>
        <div class="text-xs text-gray-500 mt-1">${esc(f.category || (Array.isArray(f.categories) ? f.categories.join(", ") : "-"))}</div>
      </td>

      <td class="p-4">${esc(f.email)}</td>
      <td class="p-4">${esc(f.phone || "-")}</td>
      <td class="p-4">${planBadge(f.plan)}</td>
      <td class="p-4">${statusBadge(f.payment_status)}</td>
      <td class="p-4">${esc(f.country || "-")}</td>
      <td class="p-4">${fmtDate(f.createdAt)}</td>

      <td class="p-4">
        <div class="flex flex-wrap gap-2">
          <button
            data-act="markPaid"
            data-id="${esc(id)}"
            class="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"
          >
            Set Premium
          </button>

          <button
            data-act="expire"
            data-id="${esc(id)}"
            class="px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold"
          >
            Set Free
          </button>

          <button
            data-act="delete"
            data-id="${esc(id)}"
            class="px-3 py-2 rounded-lg bg-gray-900 hover:bg-black text-white font-semibold"
          >
            Delete
          </button>
        </div>
      </td>
    `;

    firmsTbody.appendChild(tr);
  }

  firmsTbody.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", onActionClick);
  });
}

async function loadStats() {
  try {
    const r = await api("/admin/stats");
    const s = r.stats || {};

    statTotal.textContent = s.total ?? "-";
    statActive.textContent = s.active ?? "-";
    statPremium.textContent = s.premium ?? "-";
    statFree.textContent = s.free ?? "-";
  } catch (e) {
    console.error("Stats error:", e);
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

  await loadStats();
}

async function onActionClick(e) {
  const btn = e.currentTarget;
  const act = btn.getAttribute("data-act");
  const id = btn.getAttribute("data-id");

  try {
    if (act === "delete") {
      const ok = confirm("A je i sigurt që do me e fshi këtë firmë?");
      if (!ok) return;

      await api(`/admin/firms/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });

      setMsg(appMsg, "Firma u fshi me sukses.", true);
      await loadFirms();
      return;
    }

    if (act === "expire") {
      await api(`/admin/firms/${encodeURIComponent(id)}/expire`, {
        method: "POST"
      });

      setMsg(appMsg, "Firma u kthye në free.", true);
      await loadFirms();
      return;
    }

    if (act === "markPaid") {
      const days = prompt("Sa ditë me vlejt premium? (default 30)", "30");
      const n = Number(days || 30);

      await api(`/admin/firms/${encodeURIComponent(id)}/mark-paid`, {
        method: "POST",
        json: { days: n }
      });

      setMsg(appMsg, "Firma u vendos premium.", true);
      await loadFirms();
      return;
    }
  } catch (err) {
    setMsg(appMsg, `Gabim: ${err.message}`, false);
  }
}

async function migrateLegacyFirms() {
  try {
    setMsg(appMsg, "Duke migruar firmat e vjetra...", true);

    const r = await api("/admin/migrate-legacy-firms", {
      method: "POST"
    });

    setMsg(appMsg, `Migrimi u krye. U përditësuan ${r.updatedCount ?? 0} firma.`, true);
    await loadFirms();
  } catch (err) {
    setMsg(appMsg, `Gabim gjatë migrimit: ${err.message}`, false);
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
migrateBtn.addEventListener("click", () => migrateLegacyFirms());

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadFirms();
});

statusSelect.addEventListener("change", () => loadFirms());
planSelect.addEventListener("change", () => loadFirms());

countryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadFirms();
});

window.addEventListener("DOMContentLoaded", tryBoot);