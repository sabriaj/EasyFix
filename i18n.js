/* EasyFix i18n (SQ / MK / EN) */
(function () {
  const DICT = {
    sq: {
      // common
      appName: "EasyFix",
      nav_register: "Regjistro Firmën",
      nav_contact: "Kontakt",
      back: "Kthehu mbrapa",
      home: "Faqja Kryesore",
      footer: "© 2025 EasyFix.services - Ndihma për çdo shtëpi",
      country: "Shteti",
      address: "Adresa",
      phone: "Telefoni",
      email: "Email",
      category: "Kategoria",
      call: "📞 Thirr",
      sms: "✉️ SMS",
      close: "Mbyll",
      prev: "Prev",
      next: "Next",
      modal_help: "Esc për me mbyll, shigjeta ← → për Next/Prev",

      // index
      hero: "Gjej mjeshtrin që të duhet me shpejtësi",
      search_placeholder: "Kërko firmë ose shërbim...",
      all_categories: "Të gjitha kategoritë",
      no_results: "Nuk u gjetën firma për kriteret e kërkimit.",
      load_fail_title: "Nuk po mundemi me i ngarku firmat për momentin.",
      load_fail_hint: "Provo prap pas pak sekondash.",
      retry: "Provo prap",
      photos: "foto",
      not_set: "Nuk është vendosur",

      // register
      reg_title: "Regjistrimi i Firmës",
      choose_plan: "Zgjidh Planin",
      upload_title: "Ngarko Logo dhe Foto",
      company_logo: "Logo e Kompanisë",
      service_photos: "Foto të Shërbimeve",
      company_name: "Emri i Firmës",
      phone_with_country: "Telefoni (me shtet)",
      phone_help:
        "Zgjidh shtetin (flamuri), pastaj shkruaj numrin. Prefiksi (+389, +49, +1…) vendoset vet.",
      continue_pay: "Vazhdo te Pagesa",

      plan_basic_title: "Basic – 15€/muaj",
      plan_basic_l1: "• Listim bazë në EasyFix",
      plan_basic_l2: "• Të dhënat e kontaktit",
      plan_basic_l3: "• Shfaqje standard në kategori",

      plan_standard_title: "Standard – 20€/muaj",
      plan_standard_l1: "• Gjithë Basic +",
      plan_standard_l2: "• Logo e kompanisë",
      plan_standard_l3: "• Deri në 3 foto të shërbimeve",
      plan_standard_l4: "• Pozicion më i mirë në listë",

      plan_premium_title: "Premium – 30€/muaj",
      plan_premium_l1: "• Gjithë Standard +",
      plan_premium_l2: "• Brandim më i fortë",
      plan_premium_l3: "• Pozicion Top",
      plan_premium_l4: "• Deri 8 foto",

      // categories (keys)
      cat_electrician: "Elektricist",
      cat_plumber: "Hidraulik",
      cat_mason: "Murator",
      cat_cleaning: "Pastrim profesional",
      cat_ac: "Klimë",
      cat_gardener: "Kopshtar",
      cat_parquet: "Salltim i parketit",
      cat_gypsum: "Punime me gips",
      cat_facade: "Punime fasade",
      cat_painter: "Bojaxhi",
      cat_heating_cooling: "Instalime ngrohje/Ftohje",
      cat_doors_windows: "Dyer/Dritare",

      // code.js messages
      msg_fill_all: "Ju lutem plotësoni të gjitha fushat.",
      msg_choose_plan: "Ju lutem zgjidhni një plan.",
      msg_phone_init_fail: "Phone input nuk u inicializua. Provo refresh faqen.",
      msg_phone_required: "Ju lutem shkruani numrin e telefonit.",
      msg_phone_invalid: "Numri i telefonit nuk është valid për shtetin e zgjedhur.",
      msg_saving: "Duke ruajtur regjistrimin...",
      msg_to_pay: "Po ju dërgojmë te pagesa...",
      msg_email_exists: "Ky email tashmë është i regjistruar.",
      msg_reg_error: "Gabim në regjistrim.",
      msg_comm_error: "Gabim gjatë komunikimit me serverin.",
      msg_max_photos: "Mund të ngarkoni maksimum {n} foto për planin {plan}.",
      hint_valid_phone: "Numri duket valid: {e164}",
      hint_invalid_phone: "Numër telefoni jo valid për këtë shtet.",

      // success
      thanks: "Faleminderit!",
      verifying_sub: "Po verifikojmë pagesën dhe aktivizimin e firmës suaj…",
      status_verifying: "Duke verifikuar…",
      hint_activation:
        "Nëse sapo e kryet pagesën, zakonisht aktivizimi vjen brenda pak sekondash.",
      email_line: "Email i regjistrimit: {email}",
      go_firm: "Shko te firma jote",
      refresh_status: "Rifresko statusin",
      missing_email_sub: "Mungon email në link. Ju lutem kthehuni te faqja kryesore.",
      missing_email_status: "Gabim: email mungon",
      missing_email_err: "Nuk u gjet parametri ?email=... në URL.",
      back_home_btn: "Kthehu te faqja kryesore",
      active_paid: "Aktive (paid)",
      activated_ok: "Firma juaj është aktivizuar me sukses.",
      in_process: "Ende në proces: {status}",
      not_confirmed:
        "Nuk u konfirmua automatikisht (provoni përsëri).",
      try_refresh:
        "Nëse pagesa u krye, provoni butonin “Rifresko statusin”.",

      // contact
      contact_title: "Kontakto EasyFix",
      name_label: "Emri",
      email_label: "Emaili",
      message_label: "Mesazhi",
      send: "Dërgo",
      msg_placeholder: "Shkruani mesazhin tuaj...",
      sent_ok: "Mesazhi u dërgua me sukses!",
      sent_err: "Gabim gjatë dërgimit: {err}",
    },

    mk: {
      appName: "EasyFix",
      nav_register: "Регистрирај фирма",
      nav_contact: "Контакт",
      back: "Назад",
      home: "Почетна",
      footer: "© 2025 EasyFix.services - Помош за секој дом",
      country: "Држава",
      address: "Адреса",
      phone: "Телефон",
      email: "Е-пошта",
      category: "Категорија",
      call: "📞 Повикај",
      sms: "✉️ SMS",
      close: "Затвори",
      prev: "Назад",
      next: "Напред",
      modal_help: "Esc за затворање, стрелки ← → за Next/Prev",

      hero: "Најди мајстор брзо и лесно",
      search_placeholder: "Пребарај фирма или услуга...",
      all_categories: "Сите категории",
      no_results: "Нема резултати за избраните филтри.",
      load_fail_title: "Во моментов не можеме да ги вчитаме фирмите.",
      load_fail_hint: "Пробај повторно по неколку секунди.",
      retry: "Пробај повторно",
      photos: "фотографии",
      not_set: "Не е поставено",

      reg_title: "Регистрација на фирма",
      choose_plan: "Избери план",
      upload_title: "Прикачи лого и фотографии",
      company_logo: "Лого на компанија",
      service_photos: "Фотографии од услуги",
      company_name: "Име на фирма",
      phone_with_country: "Телефон (со држава)",
      phone_help:
        "Избери држава (знаме), потоа внеси број. Префиксот (+389, +49, +1…) се додава автоматски.",
      continue_pay: "Продолжи кон плаќање",

      plan_basic_title: "Basic – 15€/месец",
      plan_basic_l1: "• Основно листање на EasyFix",
      plan_basic_l2: "• Контакт податоци",
      plan_basic_l3: "• Стандардно прикажување",

      plan_standard_title: "Standard – 20€/месец",
      plan_standard_l1: "• Сè од Basic +",
      plan_standard_l2: "• Лого на компанија",
      plan_standard_l3: "• До 3 фотографии",
      plan_standard_l4: "• Подобра позиција во листа",

      plan_premium_title: "Premium – 30€/месец",
      plan_premium_l1: "• Сè од Standard +",
      plan_premium_l2: "• Посилен брендинг",
      plan_premium_l3: "• Топ позиција",
      plan_premium_l4: "• До 8 фотографии",

      cat_electrician: "Електричар",
      cat_plumber: "Водоводџија",
      cat_mason: "Ѕидар",
      cat_cleaning: "Професионално чистење",
      cat_ac: "Клима",
      cat_gardener: "Градинар",
      cat_parquet: "Брусење паркет",
      cat_gypsum: "Гипс работи",
      cat_facade: "Фасада работи",
      cat_painter: "Молер",
      cat_heating_cooling: "Инсталации греење/ладење",
      cat_doors_windows: "Врати/прозорци",

      msg_fill_all: "Ве молиме пополнете ги сите полиња.",
      msg_choose_plan: "Ве молиме изберете план.",
      msg_phone_init_fail: "Телефонското поле не се иницијализира. Освежи ја страницата.",
      msg_phone_required: "Ве молиме внесете телефонски број.",
      msg_phone_invalid: "Телефонскиот број не е валиден за избраната држава.",
      msg_saving: "Се зачувува регистрацијата...",
      msg_to_pay: "Ве пренасочуваме кон плаќање...",
      msg_email_exists: "Овој е-пошта веќе е регистриран.",
      msg_reg_error: "Грешка при регистрација.",
      msg_comm_error: "Грешка при комуникација со серверот.",
      msg_max_photos: "Може да прикачите максимум {n} фотографии за планот {plan}.",
      hint_valid_phone: "Бројот изгледа валиден: {e164}",
      hint_invalid_phone: "Невалиден телефонски број за оваа држава.",

      thanks: "Ви благодариме!",
      verifying_sub: "Ја проверуваме уплатата и активирањето…",
      status_verifying: "Проверка…",
      hint_activation: "Ако штотуку плативте, активирањето обично е за неколку секунди.",
      email_line: "Е-пошта за регистрација: {email}",
      go_firm: "Оди до твојата фирма",
      refresh_status: "Освежи статус",
      missing_email_sub: "Недостасува е-пошта во линкот. Вратете се на почетна.",
      missing_email_status: "Грешка: недостасува е-пошта",
      missing_email_err: "Не е најден параметарот ?email=... во URL.",
      back_home_btn: "Врати се на почетна",
      active_paid: "Активна (paid)",
      activated_ok: "Фирмата е успешно активирана.",
      in_process: "Сè уште во процес: {status}",
      not_confirmed: "Не е потврдено автоматски (обидете се повторно).",
      try_refresh: "Ако уплатата е завршена, пробајте “Освежи статус”.",

      contact_title: "Контакт со EasyFix",
      name_label: "Име",
      email_label: "Е-пошта",
      message_label: "Порака",
      send: "Испрати",
      msg_placeholder: "Напишете ја вашата порака...",
      sent_ok: "Пораката е успешно испратена!",
      sent_err: "Грешка при испраќање: {err}",
    },

    en: {
      appName: "EasyFix",
      nav_register: "Register a Business",
      nav_contact: "Contact",
      back: "Back",
      home: "Home",
      footer: "© 2025 EasyFix.services - Help for every home",
      country: "Country",
      address: "Address",
      phone: "Phone",
      email: "Email",
      category: "Category",
      call: "📞 Call",
      sms: "✉️ SMS",
      close: "Close",
      prev: "Prev",
      next: "Next",
      modal_help: "Esc to close, arrows ← → for Next/Prev",

      hero: "Find the right professional quickly",
      search_placeholder: "Search for a company or service...",
      all_categories: "All categories",
      no_results: "No businesses found for the selected filters.",
      load_fail_title: "We can’t load businesses right now.",
      load_fail_hint: "Please try again in a few seconds.",
      retry: "Try again",
      photos: "photos",
      not_set: "Not set",

      reg_title: "Business Registration",
      choose_plan: "Choose a Plan",
      upload_title: "Upload Logo and Photos",
      company_logo: "Company Logo",
      service_photos: "Service Photos",
      company_name: "Business Name",
      phone_with_country: "Phone (with country)",
      phone_help:
        "Select your country (flag), then enter your number. The prefix (+389, +49, +1…) is added automatically.",
      continue_pay: "Continue to Payment",

      plan_basic_title: "Basic – €15/month",
      plan_basic_l1: "• Basic listing on EasyFix",
      plan_basic_l2: "• Contact details",
      plan_basic_l3: "• Standard placement in category",

      plan_standard_title: "Standard – €20/month",
      plan_standard_l1: "• Everything in Basic +",
      plan_standard_l2: "• Company logo",
      plan_standard_l3: "• Up to 3 photos",
      plan_standard_l4: "• Better position in list",

      plan_premium_title: "Premium – €30/month",
      plan_premium_l1: "• Everything in Standard +",
      plan_premium_l2: "• Stronger branding",
      plan_premium_l3: "• Top position",
      plan_premium_l4: "• Up to 8 photos",

      cat_electrician: "Electrician",
      cat_plumber: "Plumber",
      cat_mason: "Mason",
      cat_cleaning: "Professional cleaning",
      cat_ac: "Air conditioning",
      cat_gardener: "Gardener",
      cat_parquet: "Parquet sanding",
      cat_gypsum: "Gypsum works",
      cat_facade: "Facade works",
      cat_painter: "Painter",
      cat_heating_cooling: "Heating/Cooling installation",
      cat_doors_windows: "Doors/Windows",

      msg_fill_all: "Please fill in all fields.",
      msg_choose_plan: "Please select a plan.",
      msg_phone_init_fail: "Phone input was not initialized. Please refresh the page.",
      msg_phone_required: "Please enter your phone number.",
      msg_phone_invalid: "The phone number is not valid for the selected country.",
      msg_saving: "Saving your registration...",
      msg_to_pay: "Redirecting you to payment...",
      msg_email_exists: "This email is already registered.",
      msg_reg_error: "Registration error.",
      msg_comm_error: "Communication error with the server.",
      msg_max_photos: "You can upload up to {n} photos for the {plan} plan.",
      hint_valid_phone: "Looks valid: {e164}",
      hint_invalid_phone: "Invalid phone number for this country.",

      thanks: "Thank you!",
      verifying_sub: "We are verifying your payment and activation…",
      status_verifying: "Verifying…",
      hint_activation: "If you just paid, activation usually completes within a few seconds.",
      email_line: "Registration email: {email}",
      go_firm: "Go to your business",
      refresh_status: "Refresh status",
      missing_email_sub: "Missing email in the link. Please go back to the home page.",
      missing_email_status: "Error: missing email",
      missing_email_err: "The parameter ?email=... was not found in the URL.",
      back_home_btn: "Back to home",
      active_paid: "Active (paid)",
      activated_ok: "Your business has been activated successfully.",
      in_process: "Still in process: {status}",
      not_confirmed: "Not confirmed automatically (please try again).",
      try_refresh: "If payment is completed, try “Refresh status”.",

      contact_title: "Contact EasyFix",
      name_label: "Name",
      email_label: "Email",
      message_label: "Message",
      send: "Send",
      msg_placeholder: "Write your message...",
      sent_ok: "Message sent successfully!",
      sent_err: "Error sending message: {err}",
    },
  };

  function detectDefaultLang() {
    const saved = localStorage.getItem("easyfix_lang");
    if (saved === "sq" || saved === "mk" || saved === "en") return saved;

    const nav = (navigator.language || "").toLowerCase();
    if (nav.startsWith("mk")) return "mk";
    if (nav.startsWith("en")) return "en";
    return "sq";
  }

  function getLang() {
    const l = localStorage.getItem("easyfix_lang");
    if (l === "sq" || l === "mk" || l === "en") return l;
    const d = detectDefaultLang();
    localStorage.setItem("easyfix_lang", d);
    return d;
  }

  function setLang(lang) {
    const l = (lang === "mk" || lang === "en") ? lang : "sq";
    localStorage.setItem("easyfix_lang", l);
    document.documentElement.setAttribute("lang", l);
  }

  function t(key, vars) {
    const lang = getLang();
    const str =
      (DICT[lang] && DICT[lang][key]) ||
      (DICT.sq && DICT.sq[key]) ||
      key;

    if (!vars) return str;

    return String(str).replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] !== undefined ? String(vars[k]) : `{${k}}`
    );
  }

  function applyTranslations(root = document) {
    // textContent
    root.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      el.textContent = t(key);
    });

    // placeholder
    root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (!key) return;
      el.setAttribute("placeholder", t(key));
    });

    // title attribute
    root.querySelectorAll("[data-i18n-title]").forEach(el => {
      const key = el.getAttribute("data-i18n-title");
      if (!key) return;
      el.setAttribute("title", t(key));
    });
  }

  // ===== categories (keys + legacy fallback) =====
  const legacyToKey = {
    "elektricist": "electrician",
    "hidraulik": "plumber",
    "murator": "mason",
    "pastrim profesional": "cleaning",
    "pastrim profesjonal": "cleaning",
    "klimë": "ac",
    "klime": "ac",
    "kopshtar": "gardener",
    "salltim i parketit": "parquet",
    "punime me gips": "gypsum",
    "punime fasade": "facade",
    "bojaxhi": "painter",
    "instalime ngrohje/ftohje": "heating_cooling",
    "dyer/dritare": "doors_windows",
  };

  function normalizeCategoryKey(raw) {
    const v = String(raw || "").trim();
    const low = v.toLowerCase();
    // if already a key we use internally
    if (
      ["electrician","plumber","mason","cleaning","ac","gardener","parquet","gypsum","facade","painter","heating_cooling","doors_windows"]
        .includes(low)
    ) return low;

    return legacyToKey[low] || v; // fallback: keep original
  }

  function categoryLabel(catKeyOrRaw) {
    const k = String(catKeyOrRaw || "").trim();
    const low = k.toLowerCase();
    const keyMap = {
      electrician: "cat_electrician",
      plumber: "cat_plumber",
      mason: "cat_mason",
      cleaning: "cat_cleaning",
      ac: "cat_ac",
      gardener: "cat_gardener",
      parquet: "cat_parquet",
      gypsum: "cat_gypsum",
      facade: "cat_facade",
      painter: "cat_painter",
      heating_cooling: "cat_heating_cooling",
      doors_windows: "cat_doors_windows",
    };
    if (keyMap[low]) return t(keyMap[low]);
    return k; // legacy raw
  }

  function setLangButtonsUI() {
    const lang = getLang();
    const sq = document.getElementById("langSQ");
    const mk = document.getElementById("langMK");
    const en = document.getElementById("langEN");

    function setBtn(btn, active) {
      if (!btn) return;
      btn.className =
        "text-xs font-bold px-2 py-1 rounded " +
        (active ? "bg-white/30" : "bg-white/15 hover:bg-white/25");
    }

    setBtn(sq, lang === "sq");
    setBtn(mk, lang === "mk");
    setBtn(en, lang === "en");
  }

  window.EASYFIX_I18N = {
    getLang, setLang, t, applyTranslations,
    normalizeCategoryKey, categoryLabel,
    setLangButtonsUI
  };

  // initial
  setLang(getLang());
})();
