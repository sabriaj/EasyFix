/* EasyFix i18n (SQ / MK / EN) - ORIGJINALI + SHTESAT E VOGLA */
(function () {
  const DICT = {
    sq: {
      // --- ORIGJINALI (PA NDRYSHIME) ---
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
      call: "Thirr", // Ndryshim i vogel per butonin e ri
      sms: "SMS",
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
      phone_help: "Zgjidh shtetin (flamuri), pastaj shkruaj numrin. Prefiksi (+389, +49, +1…) vendoset vet.",
      activate_trial_btn: "Aktivizo 4 muaj falas",
      privacy_agree_html: 'Pajtohem me <a href="privacy.html" class="text-blue-700 underline font-semibold">Privacy Policy</a>.',

      // FREE TRIAL
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

      // plans
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

      // categories (Shtuar keywords per search smart)
      cat_electrician: "Elektricist / Rryma",
      cat_plumber: "Hidraulik / Ujësjellës",
      cat_mason: "Murator",
      cat_cleaning: "Pastrim profesional",
      cat_ac: "Klimë",
      cat_gardener: "Kopshtar",
      cat_parquet: "Salltim i parketit",
      cat_gypsum: "Punime me gips",
      cat_facade: "Punime fasade",
      cat_painter: "Bojaxhi / Moler",
      cat_heating_cooling: "Instalime ngrohje/Ftohje",
      cat_doors_windows: "Dyer/Dritare",
      cat_tiler: "Pllaka / Keramikë",
      cat_handyman: "Mjeshtër i Përgjithshëm / Hausmajstor", // E RE

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
      msg_too_many_requests: "Shumë kërkesa. Provo prap pak ma vonë.",
      msg_too_many_attempts: "Shumë tentativa. Kërko një kod të ri.",
      msg_categories_required: "Ju lutem zgjidhni të paktën 1 kategori.",
      msg_max_categories: "Mund të zgjidhni maksimum {n} kategori për planin {plan}.",
      categories_limit_hint: "Maksimum {n} kategori për planin {plan}.",
      msg_reg_ok: "Regjistrimi u ruajt me sukses.",

      // API errors
      api_missing_fields: "Ju lutem plotësoni të gjitha fushat.",
      api_invalid_plan: "Plani nuk është valid.",
      api_email_not_verified: "Email-i nuk është i verifikuar.",
      api_email_exists: "Ky email tashmë ekziston.",
      api_geo_not_found: "Nuk u gjet lokacioni për këtë adresë/qytet.",
      api_server_error: "Gabim në server. Provo prap.",
      api_missing_email: "Ju lutem shkruani email-in.",
      api_email_service_not_configured: "Shërbimi i email-it nuk është i konfiguruar.",
      api_missing_email_code: "Ju lutem shkruani email-in dhe kodin.",
      api_invalid_code_format: "Kodi duhet me qenë 6 shifra.",
      api_invalid_code: "Kodi i gabuar ose i skaduar.",
      api_no_active_code: "Nuk ka kod aktiv. Kërko një kod të ri.",
      api_code_expired: "Kodi ka skaduar. Kërko një kod të ri.",
      api_too_many_attempts: "Shumë tentativa. Kërko një kod të ri.",
      api_otp_cooldown: "Provo prap pas {sec} sekondash.",
      api_missing_lat_lng: "Mungon lokacioni (lat/lng).",

      // verify pages
      verify_sent_title: "Verifikimi i Email-it",
      verify_sent_desc: "Të dërguam një link verifikimi në email.",
      verify_sent_tip: "Nëse nuk e gjen, kontrollo edhe Spam/Junk.",
      resend_btn: "Dërgo përsëri linkun",
      verifying_title: "Duke verifikuar…",
      verifying_desc: "Po e konfirmojmë verifikimin e email-it.",
      verified_ok_title: "U verifikua me sukses",
      verified_ok_desc: "Email-i u verifikua. Tash po të dërgojmë te konfirmimi.",
      verify_failed_title: "Verifikimi dështoi",
      verify_failed_desc: "Linku është i pavlefshëm ose ka skaduar.",

      // contact
      contact_title: "Kontakto EasyFix",
      name_label: "Emri",
      email_label: "Emaili",
      message_label: "Mesazhi",
      send: "Dërgo",
      msg_placeholder: "Shkruani mesazhin tuaj...",
      sent_ok: "Mesazhi u dërgua me sukses!",
      sent_err: "Gabim gjatë dërgimit: {err}",

      // --- SHTESAT E REJA (VETEM PER INDEX PAGE) ---
      hero_sub: "Zgjidhje të shpejta, profesionistë të verifikuar.",
      sticky_are_you_pro: "Je Mjeshtër?",
      sticky_free_reg: "Regjistrimi falas",
      sticky_btn: "Regjistrohu",
      near_me_error: "Gabim lokacioni",
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
      call: "Повикај",
      sms: "SMS",
      close: "Затвори",
      prev: "Назад",
      next: "Напред",
      modal_help: "Esc за затворање",
      not_set: "Не е внесено",
      photos: "фотографии",
      retry: "Пробај повторно",

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
      hero_sub: "Брзи решенија, проверени професионалци.", // E RE
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
      near_me_error: "Грешка", // E RE
      no_results: "Нема резултати за критериумите на пребарување.",
      load_fail_title: "Не успеавме да ги вчитаме фирмите",
      load_fail_hint: "Провери интернет или пробај повторно.",

      reg_title: "Регистрација на фирма",
      choose_plan: "Избери план",
      upload_title: "Прикачи лого и фотографии",
      company_logo: "Лого на компанија",
      service_photos: "Фотографии од услуги",
      company_name: "Име на фирма",
      phone_with_country: "Телефон (со држава)",
      phone_help: "Избери држава (знаме), потоа внеси број.",
      activate_trial_btn: "Активирај 4 месеци бесплатно",
      privacy_agree_html: 'Се согласувам со <a href="privacy.html" class="text-blue-700 underline font-semibold">Privacy Policy</a>.',

      trial_banner_title: "4 месеци БЕСПЛАТНО — без плаќање денес",
      trial_banner_desc: "Регистрирај се денес и прикажувај се 4 месеци бесплатно.",
      trial_card_1_title: "Денес",
      trial_card_1_value: "0€",
      trial_card_2_title: "Пробен период",
      trial_card_2_value: "4 месеци бесплатно",
      trial_card_3_title: "По пробниот период",
      trial_card_3_value: "Месечен план (опционално)",
      trial_micro_note: "Избери план сега за позиција/фотографии, но активирањето е бесплатно 4 месеци.",
      trial_note_strong: "Без плаќање денес.",
      trial_note_rest: "Цените важат само по 4-те бесплатни месеци.",

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

      // Categories (Shtuar versionet latine per search)
      cat_electrician: "Електричар / Elektricar",
      cat_plumber: "Водоводџија / Vodovodzija",
      cat_mason: "Ѕидар / Zidar",
      cat_cleaning: "Професионално чистење / Cistenje",
      cat_ac: "Клима / Klima",
      cat_gardener: "Градинар / Gradinar",
      cat_parquet: "Брусење паркет / Parket",
      cat_gypsum: "Гипс работи / Gips",
      cat_facade: "Фасада работи / Fasada",
      cat_painter: "Молер / Moler",
      cat_heating_cooling: "Инсталации греење/ладење",
      cat_doors_windows: "Врати/прозорци",
      cat_tiler: "Плочки / Керамика",
      cat_handyman: "Хаусмајстор / Hausmajstor", // E RE

      msg_fill_all: "Ве молиме пополнете ги сите полиња.",
      msg_choose_plan: "Ве молиме изберете план.",
      msg_phone_init_fail: "Телефонското поле не се иницијализира.",
      msg_phone_required: "Ве молиме внесете телефонски број.",
      msg_phone_invalid: "Телефонскиот број не е валиден.",
      msg_saving: "Се зачувува регистрацијата...",
      msg_email_exists: "Овој е-пошта веќе е регистриран.",
      msg_reg_error: "Грешка при регистрација.",
      msg_comm_error: "Грешка при комуникација со серверот.",
      msg_max_photos: "Може да прикачите максимум {n} фотографии.",
      hint_valid_phone: "Бројот изгледа валиден: {e164}",
      hint_invalid_phone: "Невалиден телефонски број.",
      msg_city_required: "Ве молиме внесете град.",
      msg_must_agree_privacy: "Мора да се согласите со Privacy Policy.",
      msg_check_email_verify: "Проверете го email-от и кликнете го линкот.",
      msg_too_many_requests: "Премногу барања.",
      msg_too_many_attempts: "Премногу обиди.",
      msg_categories_required: "Ве молиме изберете најмалку 1 категорија.",
      msg_max_categories: "Може да изберете максимум {n} категории.",
      categories_limit_hint: "Максимум {n} категории за планот {plan}.",
      msg_reg_ok: "Регистрацијата е успешно зачувана.",

      api_missing_fields: "Ве молиме пополнете ги сите полиња.",
      api_invalid_plan: "Невалиден план.",
      api_email_not_verified: "Е-поштата не е верификувана.",
      api_email_exists: "Оваа е-пошта веќе постои.",
      api_geo_not_found: "Не успеавме да најдеме локација.",
      api_server_error: "Серверска грешка.",
      api_missing_email: "Внесете е-пошта.",
      api_email_service_not_configured: "Email сервисот не е конфигуриран.",
      api_missing_email_code: "Внесете е-пошта и код.",
      api_invalid_code_format: "Кодот мора да биде 6 цифри.",
      api_invalid_code: "Погрешен или истечен код.",
      api_no_active_code: "Нема активен код.",
      api_code_expired: "Кодот истече.",
      api_too_many_attempts: "Премногу обиди.",
      api_otp_cooldown: "Пробај повторно по {sec} секунди.",
      api_missing_lat_lng: "Недостасува локација.",

      verify_sent_title: "Верификација на email",
      verify_sent_desc: "Ви испративме линк за верификација.",
      verify_sent_tip: "Ако не го гледате, проверете Spam/Junk.",
      resend_btn: "Испрати повторно линк",
      verifying_title: "Се верифицира…",
      verifying_desc: "Ја потврдуваме верификацијата на email-от.",
      verified_ok_title: "Успешно верифицирано",
      verified_ok_desc: "Email-от е верифициран.",
      verify_failed_title: "Верификацијата не успеа",
      verify_failed_desc: "Линкот е неважечки или истечен.",

      contact_title: "Контакт со EasyFix",
      name_label: "Име",
      email_label: "Е-пошта",
      message_label: "Порака",
      send: "Испрати",
      msg_placeholder: "Напишете ја вашата порака...",
      sent_ok: "Пораката е успешно испратена!",
      sent_err: "Грешка при испраќање: {err}",

      // SHTESAT PER INDEX
      sticky_are_you_pro: "Сте мајстор?",
      sticky_free_reg: "Бесплатна регистрација",
      sticky_btn: "Регистрирај се",
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
      call: "Call",
      sms: "SMS",
      close: "Close",
      prev: "Prev",
      next: "Next",
      modal_help: "Esc to close",

      verify_email_title: "Verify Email",
      verify_email_hint: "You must verify your email before registration.",
      send_code_btn: "Send code",
      code_placeholder: "6-digit code",
      verify_btn: "Verify",
      msg_email_invalid: "Invalid email.",
      msg_sending_code: "Sending code…",
      msg_code_sent: "Code sent.",
      msg_send_code_fail: "Could not send code.",
      msg_code_invalid_format: "Code must be 6 digits.",
      msg_verifying_code: "Verifying code…",
      msg_code_invalid: "Wrong or expired code.",
      msg_code_verified: "Email verified successfully.",
      msg_email_verify_required: "You must verify your email.",

      hero: "Find the professional you need, fast",
      hero_sub: "Fast solutions, verified professionals.", // E RE
      search_placeholder: "Search for a business or service...",
      all_categories: "All categories",
      near_me: "Near me",
      near_me_off: "Turn off",
      near_me_active: "Active: within {km} km",
      near_me_title: "Near me",
      near_me_fetching: "Finding businesses near you…",
      near_me_on_title: "Near me enabled",
      near_me_on_desc: "Showing businesses within {km} km.",
      near_me_denied_title: "Location permission denied",
      near_me_denied_desc: "Enable Location in your browser.",
      near_me_unsupported_title: "Location not supported",
      near_me_unsupported_desc: "Browser does not support geolocation.",
      near_me_error_title: "Near me error",
      near_me_error_desc: "Could not load results.",
      near_me_error: "Location error", // E RE
      no_results: "No businesses found.",
      photos: "photos",
      retry: "Try again",
      load_fail_title: "Could not load businesses",
      load_fail_hint: "Check your internet connection.",
      not_set: "Not set",

      reg_title: "Business Registration",
      choose_plan: "Choose a Plan",
      upload_title: "Upload Logo and Photos",
      company_logo: "Company Logo",
      service_photos: "Service Photos",
      company_name: "Business Name",
      phone_with_country: "Phone (with country)",
      phone_help: "Select your country, then enter your number.",
      activate_trial_btn: "Activate 4 months free",
      privacy_agree_html: 'I agree to the <a href="privacy.html" class="text-blue-700 underline font-semibold">Privacy Policy</a>.',

      trial_banner_title: "4 months FREE — no payment today",
      trial_banner_desc: "Register today and get listed for 4 months free.",
      trial_card_1_title: "Today",
      trial_card_1_value: "€0",
      trial_card_2_title: "Trial",
      trial_card_2_value: "4 months free",
      trial_card_3_title: "After trial",
      trial_card_3_value: "Monthly plan (optional)",
      trial_micro_note: "Choose a plan now for ranking/photos.",
      trial_note_strong: "No payment today.",
      trial_note_rest: "Prices apply only after the 4-month free trial.",

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
      cat_tiler: "Tiles / Ceramics",
      cat_handyman: "Handyman", // E RE

      msg_fill_all: "Please fill in all fields.",
      msg_choose_plan: "Please select a plan.",
      msg_phone_init_fail: "Phone input was not initialized.",
      msg_phone_required: "Please enter your phone number.",
      msg_phone_invalid: "Invalid phone number.",
      msg_saving: "Saving your registration...",
      msg_email_exists: "This email is already registered.",
      msg_reg_error: "Registration error.",
      msg_comm_error: "Communication error.",
      msg_max_photos: "You can upload up to {n} photos.",
      hint_valid_phone: "Looks valid: {e164}",
      hint_invalid_phone: "Invalid phone number.",
      msg_city_required: "Please enter the city.",
      msg_must_agree_privacy: "You must agree to the Privacy Policy.",
      msg_check_email_verify: "Check your email.",
      msg_too_many_requests: "Too many requests.",
      msg_too_many_attempts: "Too many attempts.",
      msg_categories_required: "Please select at least 1 category.",
      msg_max_categories: "You can select up to {n} categories.",
      categories_limit_hint: "Up to {n} categories.",
      msg_reg_ok: "Registration saved successfully.",

      api_missing_fields: "Please fill in all fields.",
      api_invalid_plan: "Invalid plan.",
      api_email_not_verified: "Email is not verified.",
      api_email_exists: "This email already exists.",
      api_geo_not_found: "Location not found.",
      api_server_error: "Server error.",
      api_missing_email: "Please enter the email.",
      api_email_service_not_configured: "Email service is not configured.",
      api_missing_email_code: "Please enter email and code.",
      api_invalid_code_format: "Code must be 6 digits.",
      api_invalid_code: "Wrong or expired code.",
      api_no_active_code: "No active code.",
      api_code_expired: "Code expired.",
      api_too_many_attempts: "Too many attempts.",
      api_otp_cooldown: "Try again in {sec} seconds.",
      api_missing_lat_lng: "Missing location.",

      verify_sent_title: "Email Verification",
      verify_sent_desc: "We sent you a verification link.",
      verify_sent_tip: "Check Spam/Junk.",
      resend_btn: "Resend verification link",
      verifying_title: "Verifying…",
      verifying_desc: "We are confirming your email.",
      verified_ok_title: "Verified successfully",
      verified_ok_desc: "Email verified.",
      verify_failed_title: "Verification failed",
      verify_failed_desc: "Link invalid or expired.",

      contact_title: "Contact EasyFix",
      name_label: "Name",
      email_label: "Email",
      message_label: "Message",
      send: "Send",
      msg_placeholder: "Write your message...",
      sent_ok: "Message sent successfully!",
      sent_err: "Error sending message: {err}",

      // SHTESAT PER INDEX
      sticky_are_you_pro: "Are you a Pro?",
      sticky_free_reg: "Free Registration",
      sticky_btn: "Join Now",
    },
  };

  // --- HELPER FUNCTIONS (PA PREKUR) ---
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
      if (key.endsWith("_html")) {
        el.innerHTML = t(key);
      } else {
        el.textContent = t(key);
      }
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

  // --- LOGJIKA E KATEGORIVE ---
  // (Këtu shtova funksionin e ri checkCategoryMatch për kërkimin smart)
  
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
      handyman: "cat_handyman"
  };

  const legacyToKey = {
    "elektricist": "electrician", "hidraulik": "plumber", "murator": "mason",
    "pastrim profesional": "cleaning", "pastrim profesjonal": "cleaning",
    "klimë": "ac", "klime": "ac", "kopshtar": "gardener",
    "salltim i parketit": "parquet", "punime me gips": "gypsum", "punime fasade": "facade",
    "bojaxhi": "painter", "instalime ngrohje/ftohje": "heating_cooling",
    "dyer/dritare": "doors_windows", "pllaka": "tiler", "pllaka / keramike": "tiler",
    "plocki": "tiler", "плочки": "tiler", "tiles": "tiler",
    "mjeshter i pergjithshem": "handyman", "mjeshtër i përgjithshëm": "handyman",
    "handyman": "handyman", "hausmajstor": "handyman", "хаусмајстор": "handyman"
  };

  function normalizeCategoryKey(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (keyMap[v]) return v;
    return legacyToKey[v] || v;
  }

  // Rregullim që emri në buton të dalë i pastër (jo "Hidraulik / Plumber")
  function categoryLabel(catKeyOrRaw) {
    const k = String(catKeyOrRaw || "").trim().toLowerCase();
    if (keyMap[k]) {
        // Merr tekstin e përkthyer dhe e ndan te "/"
        return t(keyMap[k]).split(" / ")[0].trim();
    }
    return k;
  }

  // Funksioni i ri për kërkimin smart
  function checkCategoryMatch(shortKey, searchTerm) {
      const lowTerm = searchTerm.toLowerCase();
      const mapKey = keyMap[shortKey.toLowerCase()];
      if (!mapKey) return false;

      // Kontrollo të gjitha gjuhët
      const sqVal = (DICT.sq[mapKey] || "").toLowerCase();
      const mkVal = (DICT.mk[mapKey] || "").toLowerCase();
      const enVal = (DICT.en[mapKey] || "").toLowerCase();

      return sqVal.includes(lowTerm) || mkVal.includes(lowTerm) || enVal.includes(lowTerm);
  }

  function setLangButtonsUI() { return; }

  window.EASYFIX_I18N = {
    getLang, setLang, t, applyTranslations,
    normalizeCategoryKey, categoryLabel, checkCategoryMatch,
    setLangButtonsUI
  };

  setLang(getLang());
})();