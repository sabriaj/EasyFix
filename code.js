const BACKEND_URL = "https://easyfix.onrender.com";

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

/* ===================== COUNTRY/CITY UI ===================== */
const countrySearch = $("#countrySearch");
const countrySelect = $("#countrySelect");
const citySelect = $("#citySelect");

let countriesAll = [];

function iso2ToFlagEmoji(iso2) {
  const code = String(iso2 || "").toUpperCase();
  if (code.length !== 2) return "🏳️";
  const A = 0x1F1E6;
  const base = "A".charCodeAt(0);
  return String.fromCodePoint(A + (code.charCodeAt(0) - base), A + (code.charCodeAt(1) - base));
}

async function detectUserCountryCode() {
  try {
    const r = await fetch("https://ipapi.co/json/");
    const j = await r.json();
    const code = (j?.country_code || "MK").toUpperCase();
    return code || "MK";
  } catch {
    return "MK";
  }
}

// Countries list (ISO2)
async function fetchCountries() {
  const r = await fetch("https://countriesnow.space/api/v0.1/countries/iso");
  const j = await r.json();
  if (!j || !j.data) return [];
  // data: [{ name, Iso2, Iso3 }]
  return j.data.map(x => ({ name: x.name, Iso2: x.Iso2 }));
}

// Cities for a country name
async function fetchCities(countryName) {
  const r = await fetch("https://countriesnow.space/api/v0.1/countries/cities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ country: countryName })
  });
  const j = await r.json();
  if (!j || !j.data) return [];
  return j.data;
}

function getSelectedCountryName() {
  const iso2 = String(countrySelect.value || "").toUpperCase();
  const found = countriesAll.find(c => String(c.Iso2 || "").toUpperCase() === iso2);
  return found?.name || "North Macedonia";
}

function renderCountryOptions(filterText = "") {
  const q = String(filterText || "").trim().toLowerCase();

  const view = !q
    ? [...countriesAll]
    : countriesAll.filter(c => {
        const name = String(c.name || "").toLowerCase();
        const iso2 = String(c.Iso2 || "").toLowerCase();
        return name.includes(q) || iso2.includes(q);
      });

  const current = String(countrySelect.value || "").toUpperCase();

  countrySelect.innerHTML = "";
  view.forEach(c => {
    const iso2 = String(c.Iso2 || "").toUpperCase();
    const name = String(c.name || "").trim();
    if (!iso2 || !name) return;

    const opt = document.createElement("option");
    opt.value = iso2;
    opt.textContent = `${iso2ToFlagEmoji(iso2)} ${name}`;
    countrySelect.appendChild(opt);
  });

  const hasCurrent = Array.from(countrySelect.options).some(o => o.value === current);
  if (hasCurrent) countrySelect.value = current;
  else countrySelect.value = countrySelect.options[0]?.value || "MK";
}

function setCityOptions(cities, preferred = "") {
  const list = Array.isArray(cities) ? cities : [];
  const pref = String(preferred || "").trim();

  citySelect.innerHTML = "";
  if (!list.length) {
    citySelect.innerHTML = `<option value="">Nuk u gjetën qytete</option>`;
    return;
  }

  list.forEach(ct => {
    const c = String(ct || "").trim();
    if (!c) return;
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    citySelect.appendChild(opt);
  });

  if (pref) {
    const exists = Array.from(citySelect.options).some(o => o.value === pref);
    if (exists) citySelect.value = pref;
  }
}

async function initCountryCity() {
  try {
    countriesAll = await fetchCountries();

    // ensure MK always exists
    const hasMK = countriesAll.some(x => String(x.Iso2 || "").toUpperCase() === "MK");
    if (!hasMK) countriesAll.unshift({ name: "North Macedonia", Iso2: "MK" });

    // sort but keep MK on top
    const mk = countriesAll.find(x => String(x.Iso2 || "").toUpperCase() === "MK");
    const rest = countriesAll
      .filter(x => String(x.Iso2 || "").toUpperCase() !== "MK")
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    countriesAll = mk ? [mk, ...rest] : rest;

    const detected = await detectUserCountryCode();

    renderCountryOptions("");
    const existsDetected = countriesAll.some(x => String(x.Iso2 || "").toUpperCase() === detected);
    countrySelect.value = existsDetected ? detected : "MK";

    const countryName = getSelectedCountryName();
    const cityList = await fetchCities(countryName);
    const preferredCity = (countrySelect.value === "MK") ? "Skopje" : "";
    setCityOptions(cityList, preferredCity);

  } catch (e) {
    console.error("Country/City init error:", e);
    countriesAll = [{ name: "North Macedonia", Iso2: "MK" }];
    renderCountryOptions("");
    setCityOptions(["Skopje", "Tetovo", "Kumanovo", "Bitola", "Prilep", "Gostivar", "Struga", "Ohrid"], "Skopje");
  }
}

countrySearch?.addEventListener("input", () => {
  renderCountryOptions(countrySearch.value);
});

countrySelect?.addEventListener("change", async () => {
  try {
    citySelect.innerHTML = `<option value="">Duke ngarkuar...</option>`;
    const countryName = getSelectedCountryName();
    const cityList = await fetchCities(countryName);
    setCityOptions(cityList, "");
  } catch (e) {
    console.error(e);
    citySelect.innerHTML = `<option value="">Gabim gjatë ngarkimit</option>`;
  }
});

/* ===================== PLAN UI ===================== */
let selectedPlan = "";

const photosLabel = $("#photosLabel");
const photosHint = $("#photosHint");

function updateUploadHints() {
  if (!photosLabel || !photosHint) return;
  if (selectedPlan === "standard") {
    photosLabel.textContent = "Foto të Shërbimeve (max 3)";
    photosHint.textContent = "Maksimum 3 foto për Standard.";
  } else if (selectedPlan === "premium") {
    photosLabel.textContent = "Foto të Shërbimeve (max 8)";
    photosHint.textContent = "Maksimum 8 foto për Premium.";
  } else {
    photosLabel.textContent = "Foto të Shërbimeve";
    photosHint.textContent = "";
  }
}

// plan selection + show/hide uploads
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

    updateUploadHints();
  });
});

// default plan = basic (më e lehtë për user)
window.addEventListener("DOMContentLoaded", async () => {
  await initCountryCity();

  const basicBtn = $("#planBasic");
  if (basicBtn) basicBtn.click();
});

/* ===================== SUBMIT ===================== */
const form = $("#registerForm");
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("#emri").value.trim();
  const address = $("#adresa").value.trim();
  const phone = $("#telefoni").value.trim();
  const email = $("#emaili").value.trim();
  const category = $("#kategoria").value.trim();

  const country = String(countrySelect?.value || "MK").toUpperCase();
  const city = String(citySelect?.value || "").trim();

  if (!name || !address || !phone || !email || !category || !country || !city) {
    showStatus("Ju lutem plotësoni të gjitha fushat (përfshi shtetin & qytetin).", "error");
    return;
  }

  if (!selectedPlan) {
    showStatus("Ju lutem zgjidhni një plan.", "error");
    return;
  }

  // photo limits
  const maxPhotos = selectedPlan === "standard" ? 3 : selectedPlan === "premium" ? 8 : 0;

  // build multipart
  const formData = new FormData();
  formData.append("name", name);
  formData.append("email", email);
  formData.append("phone", phone);
  formData.append("address", address);
  formData.append("category", category);
  formData.append("plan", selectedPlan);

  // NEW: country + city
  formData.append("country", country);
  formData.append("city", city);

  // logo + photos only for standard/premium
  if (selectedPlan === "standard" || selectedPlan === "premium") {
    const logoFile = $("#logoUpload").files[0];
    if (logoFile) formData.append("logo", logoFile);

    const photos = Array.from($("#photoUpload").files || []);
    if (photos.length > maxPhotos) {
      showStatus(`Mund të ngarkoni maksimum ${maxPhotos} foto për planin ${selectedPlan}.`, "error");
      return;
    }
    photos.forEach(f => formData.append("photos", f));
  }

  showStatus("Duke ruajtur regjistrimin...", "loading");

  try {
    const res = await fetch(`${BACKEND_URL}/register`, {
      method: "POST",
      body: formData
    });

    if (res.status === 409) {
      showStatus("Ky email tashmë është i regjistruar.", "error");
      return;
    }

    const data = await res.json();

    if (!res.ok || !data.success) {
      showStatus(data?.error || "Gabim në regjistrim.", "error");
      return;
    }

    showStatus("Po ju dërgojmë te pagesa...", "success");

    setTimeout(() => {
      window.location.href = data.checkoutUrl;
    }, 700);

  } catch (err) {
    console.error(err);
    showStatus("Gabim gjatë komunikimit me serverin.", "error");
  }
});
