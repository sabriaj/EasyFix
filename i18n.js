/* EasyFix i18n (SQ / MK / EN) */
(function () {
  const DICT = {
    sq: {
      appName: "EasyFix",
      nav_register: "Regjistro Firmën",
      nav_contact: "Kontakt",
      back: "Kthehu mbrapa",
      home: "Faqja Kryesore",
      footer: "© 2025 EasyFix.services - Ndihma për çdo shtëpi",
      country: "Shteti",
      address: "Adresa",
      city: "Qyteti",
      city_placeholder: "p.sh. Shkup",
      phone: "Telefoni",
      email: "Email",
      category: "Kategoria",
      call: "📞 Thirr",
      sms: "✉️ SMS",
      close: "Mbyll",
      prev: "Prev",
      next: "Next",
      modal_help: "Esc për me mbyll, shigjeta ← → për Next/Prev",

      verify_email_title: "Verifiko Emailin",
      verify_email_hint: "Duhet me verifiku emailin para regjistrimit.",
      send_code_btn: "Dërgo kodin",
      code_placeholder: "Kodi 6-shifror",
      verify_btn: "Verifiko",
      msg_email_invalid: "Email jo valid.",
      msg_sending_code: "Duke dërgu kodin…",
      msg_code_sent: "Kodi u dërgua. Kontrollo email-in.",
      msg_send_code_fail: "S’u arrit me dërgu kodin. Provo prap.",
      msg_code_invalid_format: "Kodi duhet me qenë 6 shifra.",
      msg_verifying_code: "Duke verifiku kodin…",
      msg_code_invalid: "Kodi i gabuar ose i skaduar.",
      msg_code_verified: "Email u verifikua me sukses.",
      msg_email_verify_required: "Duhet me verifiku emailin me kod para regjistrimit.",

      hero: "Gjej mjeshtrin që të duhet me shpejtësi",
      search_placeholder: "Kërko firmë ose shërbim...",
      all_categories: "Të gjitha kategoritë",
      near_me: "Afër meje",
      near_me_off: "Fike Afër meje",
      near_me_active: "Aktive: brenda {km} km",
      near_me_title: "Afër meje",
      near_me_fetching: "Po kërkoj firmat afër teje…",
      near_me_on_title: "Afër meje u aktivizua",
      near_me_on_desc: "Po shfaqen firmat brenda {km} km.",
      near_me_denied_title: "Leja për lokacion u refuzua",
      near_me_denied_desc: "Lejo Location në browser dhe provo prap.",
      near_me_unsupported_title: "Lokacioni s’mbështetet",
      near_me_unsupported_desc: "Ky shfletues nuk e mbështet geolocation.",
      near_me_error_title: "Gabim te Afër meje",
      near_me_error_desc: "S’u arrit me marrë rezultatet. Provo prap.",
      no_results: "Nuk u gjetën firma për kriteret e kërkimit.",
      photos: "foto",
      retry: "Provo prap",
      load_fail_title: "S’u arrit me i ngarku firmat",
      load_fail_hint: "Kontrollo internetin ose provo prap.",
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
      activate_trial_btn: "Aktivizo 4 muaj falas",
      privacy_agree_html:
        'Pajtohem me <a href="privacy.html" class="text-blue-700 underline font-semibold">Privacy Policy</a>.',

      // FREE TRIAL (NEW)
      trial_banner_title: "4 muaj FALAS — pa pagesë sot",
      trial_banner_desc: "Regjistrohu sot dhe shfaq listing-un për 4 muaj falas. Pagesa fillon vetëm pas mbarimit të trial-it.",
      trial_card_1_title: "Sot",
      trial_card_1_value: "0€",
      trial_card_2_title: "Trial",
      trial_card_2_value: "4 muaj falas",
      trial_card_3_title: "Pas trial",
      trial_card_3_value: "Plan mujor (opsional)",
      trial_micro_note: "Zgjedh planin tani për renditje/foto, por aktivizimi është falas për 4 muaj.",
      trial_note_strong: "S’ka pagesë sot.",
      trial_note_rest: "Çmimet vlejnë vetëm pas 4 muajve falas.",

      // plans (UPDATED TITLES)
      plan_basic_title: "Basic – 15€/muaj (pas 4 muaj falas)",
      plan_basic_l1: "• Listim bazë në EasyFix",
      plan_basic_l2: "• Të dhënat e kontaktit",
      plan_basic_l3: "• Shfaqje standard në kategori",

      plan_standard_title: "Standard – 20€/muaj (pas 4 muaj falas)",
      plan_standard_l1: "• Gjithë Basic +",
      plan_standard_l2: "• Logo e kompanisë",
      plan_standard_l3: "• Deri në 3 foto të shërbimeve",
      plan_standard_l4: "• Pozicion më i mirë në listë",

      plan_premium_title: "Premium – 30€/muaj (pas 4 muaj falas)",
      plan_premium_l1: "• Gjithë Standard +",
      plan_premium_l2: "• Brandim më i fortë",
      plan_premium_l3: "• Pozicion Top",
      plan_premium_l4: "• Deri 8 foto",

      // categories
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
      cat_tiler: "Pllaka / Keramikë",

      // code.js messages
      msg_fill_all: "Ju lutem plotësoni të gjitha fushat.",
      msg_choose_plan: "Ju lutem zgjidhni një plan.",
      msg_phone_init_fail: "Phone input nuk u inicializua. Provo refresh faqen.",
      msg_phone_required: "Ju lutem shkruani numrin e telefonit.",
      msg_phone_invalid: "Numri i telefonit nuk është valid për shtetin e zgjedhur.",
      msg_saving: "Duke ruajtur regjistrimin...",
      msg_email_exists: "Ky email tashmë është i regjistruar.",
      msg_reg_error: "Gabim në regjistrim.",
      msg_comm_error: "Gabim gjatë komunikimit me serverin.",
      msg_max_photos: "Mund të ngarkoni maksimum {n} foto për planin {plan}.",
      hint_valid_phone: "Numri duket valid: {e164}",
      hint_invalid_phone: "Numër telefoni jo valid për këtë shtet.",
      msg_city_required: "Ju lutem shkruani qytetin.",
      msg_must_agree_privacy: "Duhet të pajtoheni me Privacy Policy.",
      msg_check_email_verify: "Kontrollo email-in dhe kliko linkun për verifikim.",

      // verify pages
      verify_sent_title: "Verifikimi i Email-it",
      verify_sent_desc: "Të dërguam një link verifikimi në email. Hape email-in dhe kliko “Verifiko Email-in”.",
      verify_sent_tip: "Nëse nuk e gjen, kontrollo edhe Spam/Junk.",
      resend_btn: "Dërgo përsëri linkun",
      verifying_title: "Duke verifikuar…",
      verifying_desc: "Po e konfirmojmë verifikimin e email-it.",
      verified_ok_title: "U verifikua me sukses",
      verified_ok_desc: "Email-i u verifikua. Tash po të dërgojmë te konfirmimi.",
      verify_failed_title: "Verifikimi dështoi",
      verify_failed_desc: "Linku është i pavlefshëm ose ka skaduar. Provo me “Dërgo përsëri linkun”.",

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
      city: "Град",
      city_placeholder: "пр. Скопје",
      phone: "Телефон",
      email: "Е-пошта",
      category: "Категорија",
      call: "📞 Повикај",
      sms: "✉️ SMS",
      close: "Затвори",
      prev: "Назад",
      next: "Напред",
      modal_help: "Esc за затворање, стрелки ← → за Next/Prev",

      verify_email_title: "Верификувај е-пошта",
      verify_email_hint: "Мора да ја верификуваш е-поштата пред регистрација.",
      send_code_btn: "Испрати код",
      code_placeholder: "6-цифрен код",
      verify_btn: "Верификувај",
      msg_email_invalid: "Невалидна е-пошта.",
      msg_sending_code: "Се испраќа код…",
      msg_code_sent: "Кодот е испратен. Провери е-пошта.",
      msg_send_code_fail: "Не успеавме да испратиме код. Пробај повторно.",
      msg_code_invalid_format: "Кодот мора да биде 6 цифри.",
      msg_verifying_code: "Се верификува код…",
      msg_code_invalid: "Погрешен или истечен код.",
      msg_code_verified: "Е-поштата е успешно верифицирана.",
      msg_email_verify_required: "Мора да ја верификуваш е-поштата со код пред регистрација.",

      hero: "Најди мајстор што ти треба брзо",
      search_placeholder: "Пребарај фирма или услуга...",
      all_categories: "Сите категории",
      near_me: "Близу мене",
      near_me_off: "Исклучи „Близу мене“",
      near_me_active: "Активно: во радиус {km} km",
      near_me_title: "Близу мене",
      near_me_fetching: "Пребарувам фирми близу тебе…",
      near_me_on_title: "„Близу мене“ е вклучено",
      near_me_on_desc: "Се прикажуваат фирми во радиус {km} km.",
      near_me_denied_title: "Одбиена дозвола за локација",
      near_me_denied_desc: "Дозволи Location во прелистувачот и пробај повторно.",
      near_me_unsupported_title: "Локацијата не е поддржана",
      near_me_unsupported_desc: "Овој прелистувач не поддржува геолокација.",
      near_me_error_title: "Грешка во „Близу мене“",
      near_me_error_desc: "Не успеавме да ги добиеме резултатите. Пробај повторно.",
      no_results: "Нема резултати за критериумите на пребарување.",
      photos: "фотографии",
      retry: "Пробај повторно",
      load_fail_title: "Не успеавме да ги вчитаме фирмите",
      load_fail_hint: "Провери интернет или пробај повторно.",
      not_set: "Не е внесено",

      reg_title: "Регистрација на фирма",
      choose_plan: "Избери план",
      upload_title: "Прикачи лого и фотографии",
      company_logo: "Лого на компанија",
      service_photos: "Фотографии од услуги",
      company_name: "Име на фирма",
      phone_with_country: "Телефон (со држава)",
      phone_help:
        "Избери држава (знаме), потоа внеси број. Префиксот (+389, +49, +1…) се додава автоматски.",
      activate_trial_btn: "Активирај 4 месеци бесплатно",
      privacy_agree_html:
        'Се согласувам со <a href="privacy.html" class="text-blue-700 underline font-semibold">Privacy Policy</a>.',

      // FREE TRIAL (NEW)
      trial_banner_title: "4 месеци БЕСПЛАТНО — без плаќање денес",
      trial_banner_desc: "Регистрирај се денес и прикажувај се 4 месеци бесплатно. Плаќањето започнува дури по истекот на пробниот период.",
      trial_card_1_title: "Денес",
      trial_card_1_value: "0€",
      trial_card_2_title: "Пробен период",
      trial_card_2_value: "4 месеци бесплатно",
      trial_card_3_title: "По пробниот период",
      trial_card_3_value: "Месечен план (опционално)",
      trial_micro_note: "Избери план сега за позиција/фотографии, но активирањето е бесплатно 4 месеци.",
      trial_note_strong: "Без плаќање денес.",
      trial_note_rest: "Цените важат само по 4-те бесплатни месеци.",

      // plans (UPDATED TITLES)
      plan_basic_title: "Basic – 15€/месец (по 4 месеци бесплатно)",
      plan_basic_l1: "• Основно листање на EasyFix",
      plan_basic_l2: "• Контакт податоци",
      plan_basic_l3: "• Стандардно прикажување",

      plan_standard_title: "Standard – 20€/месец (по 4 месеци бесплатно)",
      plan_standard_l1: "• Сè од Basic +",
      plan_standard_l2: "• Лого на компанијата",
      plan_standard_l3: "• До 3 фотографии",
      plan_standard_l4: "• Подобра позиција во листа",

      plan_premium_title: "Premium – 30€/месец (по 4 месеци бесплатно)",
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
      cat_tiler: "Плочки / Керамика",

      msg_fill_all: "Ве молиме пополнете ги сите полиња.",
      msg_choose_plan: "Ве молиме изберете план.",
      msg_phone_init_fail: "Телефонското поле не се иницијализира. Освежи ја страницата.",
      msg_phone_required: "Ве молиме внесете телефонски број.",
      msg_phone_invalid: "Телефонскиот број не е валиден за избраната држава.",
      msg_saving: "Се зачувува регистрацијата...",
      msg_email_exists: "Овој е-пошта веќе е регистриран.",
      msg_reg_error: "Грешка при регистрација.",
      msg_comm_error: "Грешка при комуникација со серверот.",
      msg_max_photos: "Може да прикачите максимум {n} фотографии за планот {plan}.",
      hint_valid_phone: "Бројот изгледа валиден: {e164}",
      hint_invalid_phone: "Невалиден телефонски број за оваа држава.",
      msg_city_required: "Ве молиме внесете град.",
      msg_must_agree_privacy: "Мора да се согласите со Privacy Policy.",
      msg_check_email_verify: "Проверете го email-от и кликнете го линкот за верификација.",

      verify_sent_title: "Верификација на email",
      verify_sent_desc: "Ви испративме линк за верификација. Отворете го email-от и кликнете “Verify”.",
      verify_sent_tip: "Ако не го гледате, проверете Spam/Junk.",
      resend_btn: "Испрати повторно линк",
      verifying_title: "Се верифицира…",
      verifying_desc: "Ја потврдуваме верификацијата на email-от.",
      verified_ok_title: "Успешно верифицирано",
      verified_ok_desc: "Email-от е верифициран. Ве пренасочуваме кон потврда.",
      verify_failed_title: "Верификацијата не успеа",
      verify_failed_desc: "Линкот е неважечки или истечен. Пробајте “Испрати повторно линк”.",

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
      city: "City",
      city_placeholder: "e.g. Skopje",
      phone: "Phone",
      email: "Email",
      category: "Category",
      call: "📞 Call",
      sms: "✉️ SMS",
      close: "Close",
      prev: "Prev",
      next: "Next",
      modal_help: "Esc to close, arrows ← → for Next/Prev",

      verify_email_title: "Verify Email",
      verify_email_hint: "You must verify your email before registration.",
      send_code_btn: "Send code",
      code_placeholder: "6-digit code",
      verify_btn: "Verify",
      msg_email_invalid: "Invalid email.",
      msg_sending_code: "Sending code…",
      msg_code_sent: "Code sent. Check your email.",
      msg_send_code_fail: "Could not send code. Try again.",
      msg_code_invalid_format: "Code must be 6 digits.",
      msg_verifying_code: "Verifying code…",
      msg_code_invalid: "Wrong or expired code.",
      msg_code_verified: "Email verified successfully.",
      msg_email_verify_required: "You must verify your email with the code before registering.",

      hero: "Find the professional you need, fast",
      search_placeholder: "Search for a business or service...",
      all_categories: "All categories",
      near_me: "Near me",
      near_me_off: "Turn off Near me",
      near_me_active: "Active: within {km} km",
      near_me_title: "Near me",
      near_me_fetching: "Finding businesses near you…",
      near_me_on_title: "Near me enabled",
      near_me_on_desc: "Showing businesses within {km} km.",
      near_me_denied_title: "Location permission denied",
      near_me_denied_desc: "Enable Location in your browser and try again.",
      near_me_unsupported_title: "Location not supported",
      near_me_unsupported_desc: "This browser does not support geolocation.",
      near_me_error_title: "Near me error",
      near_me_error_desc: "Could not load results. Please try again.",
      no_results: "No businesses found for your search criteria.",
      photos: "photos",
      retry: "Try again",
      load_fail_title: "Could not load businesses",
      load_fail_hint: "Check your internet connection and try again.",
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
      activate_trial_btn: "Activate 4 months free",
      privacy_agree_html:
        'I agree to the <a href="privacy.html" class="text-blue-700 underline font-semibold">Privacy Policy</a>.',

      // FREE TRIAL (NEW)
      trial_banner_title: "4 months FREE — no payment today",
      trial_banner_desc: "Register today and get listed for 4 months free. Payments start only after the trial ends.",
      trial_card_1_title: "Today",
      trial_card_1_value: "€0",
      trial_card_2_title: "Trial",
      trial_card_2_value: "4 months free",
      trial_card_3_title: "After trial",
      trial_card_3_value: "Monthly plan (optional)",
      trial_micro_note: "Choose a plan now for ranking/photos, but activation is free for 4 months.",
      trial_note_strong: "No payment today.",
      trial_note_rest: "Prices apply only after the 4-month free trial.",

      // plans (UPDATED TITLES)
      plan_basic_title: "Basic – €15/month (after 4 months free)",
      plan_basic_l1: "• Basic listing on EasyFix",
      plan_basic_l2: "• Contact details",
      plan_basic_l3: "• Standard placement in category",

      plan_standard_title: "Standard – €20/month (after 4 months free)",
      plan_standard_l1: "• Everything in Basic +",
      plan_standard_l2: "• Company logo",
      plan_standard_l3: "• Up to 3 photos",
      plan_standard_l4: "• Better position in list",

      plan_premium_title: "Premium – €30/month (after 4 months free)",
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
      cat_tiler: "Tiles / Ceramics",

      msg_fill_all: "Please fill in all fields.",
      msg_choose_plan: "Please select a plan.",
      msg_phone_init_fail: "Phone input was not initialized. Please refresh the page.",
      msg_phone_required: "Please enter your phone number.",
      msg_phone_invalid: "The phone number is not valid for the selected country.",
      msg_saving: "Saving your registration...",
      msg_email_exists: "This email is already registered.",
      msg_reg_error: "Registration error.",
      msg_comm_error: "Communication error with the server.",
      msg_max_photos: "You can upload up to {n} photos for the {plan} plan.",
      hint_valid_phone: "Looks valid: {e164}",
      hint_invalid_phone: "Invalid phone number for this country.",
      msg_city_required: "Please enter the city.",
      msg_must_agree_privacy: "You must agree to the Privacy Policy.",
      msg_check_email_verify: "Check your email and click the verification link.",

      verify_sent_title: "Email Verification",
      verify_sent_desc: "We sent you a verification link. Open your email and click “Verify Email”.",
      verify_sent_tip: "If you don’t see it, check Spam/Junk.",
      resend_btn: "Resend verification link",
      verifying_title: "Verifying…",
      verifying_desc: "We are confirming your email verification.",
      verified_ok_title: "Verified successfully",
      verified_ok_desc: "Email verified. Redirecting you to confirmation.",
      verify_failed_title: "Verification failed",
      verify_failed_desc: "The link is invalid or expired. Try “Resend verification link”.",

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
    root.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      el.textContent = t(key);
    });

    root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (!key) return;
      el.setAttribute("placeholder", t(key));
    });

    root.querySelectorAll("[data-i18n-title]").forEach(el => {
      const key = el.getAttribute("data-i18n-title");
      if (!key) return;
      el.setAttribute("title", t(key));
    });
  }

  // categories helper (unchanged)
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
    "pllaka": "tiler",
    "pllaka / keramike": "tiler",
    "pllaka / keramikë": "tiler",
    "keramike": "tiler",
    "keramikë": "tiler",
    "plocki": "tiler",
    "плочки": "tiler",
    "керамика": "tiler",
    "tiles": "tiler",
    "ceramic": "tiler",
    "ceramics": "tiler",
  };

  function normalizeCategoryKey(raw) {
    const v = String(raw || "").trim();
    const low = v.toLowerCase();
    if (
      ["electrician","plumber","mason","cleaning","ac","gardener","parquet","gypsum","facade","painter","heating_cooling","doors_windows","tiler"]
        .includes(low)
    ) return low;

    return legacyToKey[low] || v;
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
      tiler: "cat_tiler",
    };
    if (keyMap[low]) return t(keyMap[low]);
    return k;
  }

  function setLangButtonsUI() { return; }

  window.EASYFIX_I18N = {
    getLang, setLang, t, applyTranslations,
    normalizeCategoryKey, categoryLabel,
    setLangButtonsUI
  };

  setLang(getLang());
})();
