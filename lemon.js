// lemon.js
window.EASYFIX_LEMON = (() => {
  function ensureLoaded() {
    return new Promise((resolve, reject) => {
      if (window.LemonSqueezy && window.LemonSqueezy.Url) {
        resolve(window.LemonSqueezy);
        return;
      }

      const existing = document.querySelector('script[data-lemon-js="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.LemonSqueezy));
        existing.addEventListener("error", () => reject(new Error("Lemon.js failed to load")));
        return;
      }

      const script = document.createElement("script");
      script.src = "https://app.lemonsqueezy.com/js/lemon.js";
      script.defer = true;
      script.dataset.lemonJs = "true";

      script.onload = () => {
        if (typeof window.createLemonSqueezy === "function") {
          window.createLemonSqueezy();
        }
        resolve(window.LemonSqueezy);
      };

      script.onerror = () => reject(new Error("Lemon.js failed to load"));
      document.head.appendChild(script);
    });
  }

  async function openCheckout(checkoutUrl) {
    if (!checkoutUrl) throw new Error("Missing checkout URL");

    await ensureLoaded();

    if (!window.LemonSqueezy || !window.LemonSqueezy.Url) {
      throw new Error("LemonSqueezy not available");
    }

    window.LemonSqueezy.Url.Open(checkoutUrl);
  }

  return {
    ensureLoaded,
    openCheckout
  };
})();