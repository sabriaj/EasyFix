const BACKEND_URL = "https://easyfix.onrender.com";
const DEFAULT_COUNTRY = "MK";

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

/* ============ Plan selection + uploads ============ */
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
  });
});

/* ============ Countries + cities (select only) ============ */
const countrySel = $("#country");
const citySel = $("#city");

async function loadCountries() {
  try {
    const res = await fetch(`${BACKEND_URL}/meta/countries`);
    const data = await res.json();

    const countries = data?.countries || [];
    countrySel.innerHTML = countries
      .map(c => `<option value="${c.code}">${c.name} (${c.code})</option>`)
      .join("");

    // default MK
    const hasMK = countries.some(c => c.code === DEFAULT_COUNTRY);
    countrySel.value = hasMK ? DEFAULT_COUNTRY : (countries[0]?.code || DEFAULT_COUNTRY);

    await loadCities(countrySel.value);
  } catch (e) {
    console.error(e);
    countrySel.innerHTML = `<option value="${DEFAULT_COUNTRY}">North Macedonia (MK)</option>`;
    countrySel.value = DEFAULT_COUNTRY;
    await loadCities(DEFAULT_COUNTRY);
  }
}

async function loadCities(countryCode) {
  try {
    citySel.innerHTML = `<option value="">Po ngarkohet...</option>`;
    const res = await fetch(`${BACKEND_URL}/meta/cities?country=${encodeURIComponent(countryCode)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      citySel.innerHTML = `<option value="N/A">N/A</option>`;
      citySel.value = "N/A";
      return;
    }

    const cities = data?.cities || ["N/A"];
    citySel.innerHTML = cities.map(name => `<option value="${name}">${name}</option>`).join("");

    // default for MK -> Skopje if exists
    if (countryCode === "MK" && cities.includes("Skopje")) {
      citySel.value = "Skopje";
    } else {
      citySel.value = cities[0] || "N/A";
    }
  } catch (e) {
    console.error(e);
    citySel.innerHTML = `<option value="N/A">N/A</option>`;
    citySel.value = "N/A";
  }
}

countrySel.addEventListener("change", () => loadCities(countrySel.value));

document.addEventListener("DOMContentLoaded", () => {
  loadCountries();
});

/* ============ Submit ============ */
const form = $("#registerForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("#emri").value.trim();
  const address = $("#adresa").value.trim();
  const phone = $("#telefoni").value.trim();
  const email = $("#emaili").value.trim();
  const category = $("#kategoria").value.trim();

  const country = (countrySel?.value || "").trim();
  const city = (citySel?.value || "").trim();

  if (!name || !address || !phone || !email || !category) {
    showStatus("Ju lutem plotësoni të gjitha fushat.", "error");
    return;
  }

  if (!country || !city) {
    showStatus("Ju lutem zgjidhni shtetin dhe qytetin nga lista.", "error");
    return;
  }

  if (!selectedPlan) {
    showStatus("Ju lutem zgjidhni një plan.", "error");
    return;
  }

  const maxPhotos = selectedPlan === "standard" ? 3 : selectedPlan === "premium" ? 8 : 0;

  const formData = new FormData();
  formData.append("name", name);
  formData.append("email", email);
  formData.append("phone", phone);
  formData.append("address", address);
  formData.append("category", category);
  formData.append("plan", selectedPlan);
  formData.append("country", country);
  formData.append("city", city);

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

    const data = await res.json().catch(() => ({}));

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
