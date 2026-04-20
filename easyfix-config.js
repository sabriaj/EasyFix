(function initEasyFixConfig() {
  const pathname = String(window.location.pathname || "/");
  const host = String(window.location.hostname || "").toLowerCase();
  const configuredBasePath = String(window.localStorage.getItem("easyfix_base_path_override") || "").trim();
  const configuredApiUrl = String(window.localStorage.getItem("easyfix_api_url_override") || "").trim();
  const defaultApiUrl = "https://easyfix.onrender.com";
  const apiUrl = configuredApiUrl || defaultApiUrl;
  let basePath = "";

  if (configuredBasePath) {
    basePath = configuredBasePath;
  } else {
    const parts = pathname.split("/").filter(Boolean);
    const lastPart = parts[parts.length - 1] || "";
    const looksLikeFile = /\.[a-z0-9]+$/i.test(lastPart);
    const isLocalStaticHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]";

    // Local static testing should always resolve page links from the site root.
    // Otherwise clean URLs like /auth or /buy-credits get treated as directories
    // and navigation becomes /auth/login.html or /buy-credits/auth.html.
    if (isLocalStaticHost) {
      basePath = "";
    } else if (host.endsWith("github.io") && parts.length > 0) {
      basePath = `/${parts[0]}`;
    } else if (looksLikeFile && parts.length > 1) {
      basePath = `/${parts.slice(0, -1).join("/")}`;
    } else if (!looksLikeFile && parts.length > 0) {
      basePath = `/${parts.join("/")}`;
    }
  }

  basePath = basePath.replace(/\/+$/, "");

  function pagePath(page = "") {
    const cleanPage = String(page || "").replace(/^\/+/, "");
    if (!cleanPage) {
      return basePath || "/";
    }
    return `${basePath}/${cleanPage}`.replace(/\/+/g, "/");
  }

  function goToPage(page = "") {
    window.location.href = pagePath(page);
  }

  window.EASYFIX_CONFIG = Object.freeze({
    API_URL: apiUrl.replace(/\/+$/, ""),
    BASE_PATH: basePath,
    pagePath,
    goToPage
  });
})();
