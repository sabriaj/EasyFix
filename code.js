const BACKEND_URL = "https://easyfix.onrender.com";

// Countries & Cities API (dinamik – për listë pa mungesa)
const COUNTRIES_API = "https://countriesnow.space/api/v0.1/countries/iso";
const CITIES_API = "https://countriesnow.space/api/v0.1/countries/cities";

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

/* ================= Country/City ================= */
const countrySelect = $("#countrySelect");
const citySelect = $("#citySelect");
const photoLimitLabel = $("#photoLimitLabel");

// map: ISO2 -> CountryName
let countries = []; // [{ name, Iso2 }]

function setCityOptions(list, preferred = "") {
  citySelect.innerHTML = "";
  if (!Array.isArray(list) || list.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nuk u gjetën qytete (provoni përsëri).";
    citySelect.appendChild(opt);
    return;
  }

  list.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    citySelect.appendChild(opt);
  });

  if (preferred && list.includes(preferred)) {
    citySelect.value = preferred;
  } else {
    citySelect.value = list[0];
  }
}

async function fetchCountries() {
  const resp = await fetch(COUNTRIES_API);
  const json = await resp.json();
  if (!json || json.error || !Array.isArray(json.data)) {
    throw new Error("Countries API failed");
  }
  return json.data; // zakonisht [{name, Iso2, Iso3}]
}

async function fetchCities(countryName) {
  const resp = await fetch(CITIES_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ country: countryName })
  });
  const json = await resp.json();
  if (!json || json.error) throw new Error("Cities API failed");
  return json.data || [];
}

function getSelectedCountryName() {
  const code = (countrySelect.value || "").toUpperCase();
  const item = countries.find(x => String(x.Iso2 || "").toUpperCase() === code);
  return item?.name || countrySelect.options[countrySelect.selectedIndex]?.textContent || "North Macedonia";
}

async function initCountryCity() {
  try {
    // Fill countries
    countries = await fetchCountries();

    // sort alphabetically by name
    countries.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    countrySelect.innerHTML = "";
    countries.forEach((c) => {
      const iso2 = String(c.Iso2 || "").toUpperCase();
      const name = String(c.name || "").trim();
      if (!iso2 || !name) return;

      const opt = document.createElement("option");
      opt.value = iso2;
      opt.textContent = name;
      countrySelect.appendChild(opt);
    });

    // Default MK
    const hasMK = Array.from(countrySelect.options).some(o => o.value === "MK");
    countrySelect.value = hasMK ? "MK" : (countrySelect.options[0]?.value || "MK");

    // Load cities for default
    const countryName = getSelectedCountryName();
    const cityList = await fetchCities(countryName);

    // Prefer Skopje for MK
    const preferredCity = (countrySelect.value === "MK") ? "Skopje" : "";
    setCityOptions(cityList, preferredCity);

  } catch (e) {
    console.error("Country/City init error:", e);

    // Hard fallback (minimum) – që mos me u blloku regjistrimi
    countrySelect.innerHTML = `<option value="MK" selected>North Macedonia</option>`;
    setCityOptions(["Skopje", "Tetovo", "Kumanovo", "Bitola", "Prilep", "Gostivar", "Struga", "Ohrid"], "Skopje");
  }
}

countrySelect?.addEventListener("change", async () => {
  try {
    citySelect.innerHTML = `<option value="">Duke ngarkuar...</option>`;
    const countryName = getSelectedCountryName();
    const cityList = await fetchCities(countryName);
    const preferredCity = (countrySelect.value === "MK") ? "Skopje" : "";
    setCityOptions(cityList, preferredCity);
  } catch (e) {
    console.error("Cities fetch error:", e);
    setCityOptions(["Capital", "Other"], "Capital");
  }
});

/* ================= Plan UI ================= */
function updatePhotoLimitLabel() {
  const maxPhotos = selectedPlan === "standard" ? 3 : selectedPlan === "premium" ? 8 : 0;
  if (photoLimitLabel) photoLimitLabel.textContent = `max ${maxPhotos}`;
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

    updatePhotoLimitLabel();
  });
});

/* ================= Submit ================= */
const form = $("#registerForm");
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("#emri").value.trim();
  const address = $("#adresa").value.trim();
  const phone = $("#telefoni").value.trim();
  const email = $("#emaili").value.trim();
  const category = $("#kategoria").value.trim();

  const country = (countrySelect.value || "").trim().toUpperCase();
  const countryName = getSelectedCountryName().trim();
  const city = (citySelect.value || "").trim();

  if (!name || !address || !phone || !email || !category) {
    showStatus("Ju lutem plotësoni të gjitha fushat.", "error");
    return;
  }

  if (!country || !city) {
    showStatus("Ju lutem zgjidhni shtetin dhe qytetin.", "error");
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

  // NEW: country & city
  formData.append("country", country);
  formData.append("countryName", countryName);
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

/* ================= Init ================= */
updatePhotoLimitLabel();
initCountryCity();
