/**
 * Baidoa Bedrock ICT Campus - Multilingual (i18n) & Translation System
 * Supports: English (en), Somali (so), Arabic (ar - with RTL layout)
 */

const BedrockI18n = (function () {
    const STORAGE_KEY = 'bedrock_lang';

    // Dictionary of translations
    const translations = {
        en: {
            // Navigation & General UI
            "nav_dashboard": "Dashboard",
            "nav_user_management": "User Management",
            "nav_student_records": "Student Records",
            "nav_attendance": "Attendance",
            "nav_teacher_management": "Teacher Management",
            "nav_class_management": "Class Management",
            "nav_gallery": "Gallery",
            "nav_fee_management": "Fee Management",
            "nav_results_approval": "Results Approval",
            "nav_clearance": "Clearance",
            "nav_exam_schedule": "Exam Schedule",
            "nav_timetable": "Timetable",
            "nav_admissions": "Manage Admissions",
            "nav_events": "Event Calendar",
            "nav_communication": "Communication Center",
            "nav_library": "Library Management",
            "nav_report": "Report Generation",
            "nav_security": "Security & Permissions",
            "nav_content": "Content Management",
            "nav_manage_results": "Manage Results",
            "nav_recycle_bin": "Recycle Bin",
            "nav_logout": "Logout",
            "welcome": "Welcome",
            "admin_panel": "Admin Panel",
            "student_portal": "Student Portal",
            "teacher_portal": "Teacher Portal",
            "parent_portal": "Parent Portal",
            
            // Language names
            "lang_english": "English",
            "lang_somali": "Somali (Soomaali)",
            "lang_arabic": "Arabic (العربية)",

            // Common Actions
            "action_save": "Save",
            "action_cancel": "Cancel",
            "action_delete": "Delete",
            "action_edit": "Edit",
            "action_send": "Send Message",
            "action_search": "Search...",
            "action_filter": "Filter",
            "action_print": "Print",
            "action_view": "View Details",
            "action_compose": "Compose",
            "action_close": "Close",

            // Announcements & Messages
            "announcements": "Announcements & News",
            "announcement_title": "Announcement Title",
            "announcement_message": "Announcement Message",
            "broadcast_to": "Target Audience",
            "audience_all": "All (Students, Teachers & Parents)",
            "audience_students": "Students Only",
            "audience_teachers": "Teachers Only",
            "audience_parents": "Parents Only",
            "important_notice": "IMPORTANT NOTICE",
            "category_news": "General News & Announcements",
            "category_exam_free": "Exam Free / Holiday Notice",
            "category_fee_payment": "Monthly Tuition Payment Notice",
            "category_low_attendance": "Low Attendance Alert Notice",

            // Messages & Templates
            "msg_exam_free_title": "Exam Free Day Announcement",
            "msg_exam_free_body": "Dear Students and Teachers, please note that today is an exam-free day at school. All classes will proceed according to regular schedule.",
            "msg_fee_payment_title": "Monthly School Fee Payment Reminder",
            "msg_fee_payment_body": "Dear Parents and Students, this is a friendly reminder that monthly school fees are due. Please process your payment to avoid access delays.",
            "msg_low_attendance_title": "Low Attendance Alert Warning",
            "msg_low_attendance_body": "Dear Parent, your child has recorded low attendance recently. Please contact school administration to discuss.",

            // Dashboards
            "student_dashboard_title": "Student Dashboard",
            "teacher_dashboard_title": "Teacher Dashboard",
            "parent_dashboard_title": "Parent Dashboard",
            "overall_gpa": "Overall GPA",
            "attendance_rate": "Attendance Rate",
            "fees_status": "Fee Status",
            "exam_results": "Exam Results",
            "paid": "Paid",
            "pending": "Pending",
            "unpaid": "Unpaid",
            "present": "Present",
            "absent": "Absent",
            "leave": "On Leave"
        },
        so: {
            // Navigation & General UI
            "nav_dashboard": "Dashboard-ka",
            "nav_user_management": "Maareynta Isticmaalayaasha",
            "nav_student_records": "Diiwaanka Ardayda",
            "nav_attendance": "Imaanshaha & Qorista",
            "nav_teacher_management": "Maareynta Barayaasha",
            "nav_class_management": "Maareynta Fasalada",
            "nav_gallery": "Sawirada & Sawir-gacmeedka",
            "nav_fee_management": "Maareynta Lacagaha",
            "nav_results_approval": "Ansixinta Natiijooyinka",
            "nav_clearance": "Waraaqda Nadiifinta (Clearance)",
            "nav_exam_schedule": "Jadwalka Imtixaanaadka",
            "nav_timetable": "Jadwalka Casharada",
            "nav_admissions": "Maareynta Qaabilada",
            "nav_events": "Taqwiimka Dhacdooyinka",
            "nav_communication": "Xarunta Isgaarsiinta",
            "nav_library": "Maareynta Maktabada",
            "nav_report": "Warbixinaha & Tirokoobka",
            "nav_security": "Amniga & Fasaxyada",
            "nav_content": "Maareynta Mawduucyada",
            "nav_manage_results": "Maareynta Natiijooyinka",
            "nav_recycle_bin": "Khaanada Dib-u-soo-celinta",
            "nav_logout": "Kabax nidaamka",
            "welcome": "Ku soo dhawoaw",
            "admin_panel": "Barta Maamulka",
            "student_portal": "Barta Ardayga",
            "teacher_portal": "Barta Baraha",
            "parent_portal": "Barta Waalidka",
            
            // Language names
            "lang_english": "Ingiriisi (English)",
            "lang_somali": "Soomaali",
            "lang_arabic": "Carabi (العربية)",

            // Common Actions
            "action_save": "Kaydi",
            "action_cancel": "Kanoqon",
            "action_delete": "Tirtir",
            "action_edit": "Wax ka beddel",
            "action_send": "Dir Farriinta",
            "action_search": "Raadi...",
            "action_filter": "Xallijin",
            "action_print": "Daabac",
            "action_view": "Eeg Faahfaahinta",
            "action_compose": "Qor Farriin",
            "action_close": "Xir",

            // Announcements & Messages
            "announcements": "Ogeysiisyada & Warka",
            "announcement_title": "Cinwaanka Ogeysiiska",
            "announcement_message": "Farriinta Ogeysiiska",
            "broadcast_to": "Dadka Loo Dirayo",
            "audience_all": "Dhammaan (Ardayda, Barayaasha & Waalidiinta)",
            "audience_students": "Ardayda Dhexdooda",
            "audience_teachers": "Barayaasha Dhexdooda",
            "audience_parents": "Waalidiinta Dhexdooda",
            "important_notice": "OGEYSIIS MUHIIM AH",
            "category_news": "Warka Cusub & Ogeysiisyada General-ka",
            "category_exam_free": "Fasax Imtixaan / Imtixaan La'aan",
            "category_fee_payment": "Ogeysiiska Bixinta Lacagta Bishan",
            "category_low_attendance": "Digniinta Imaanshada Yaraanta",

            // Messages & Templates
            "msg_exam_free_title": "Ogeysiis: Maanta Imtixaan Ma Jiro / Fasax Imtixaan",
            "msg_exam_free_body": "Ardayda iyo Barayaasha sharafta leh, fadlan ogaada in maanta ay tahay maalin imtixaan la'aan ah oo dugsiga ah. Casharada waxay ku soconayaan jadwalka caadiga ah.",
            "msg_fee_payment_title": "Kumbasaanka Bixinta Lacagta Dugsiga ee Bishan",
            "msg_fee_payment_body": "Waalidiinta iyo Ardayda qadarinta leh, kani waa reminder ku saabsan bixinta lacagta bisha ee dugsiga. Fadlan bixiya lacagta si looga baaqsado dib-u-dhac.",
            "msg_low_attendance_title": "Digniin: Imaanshada Ardayga oo Hooseysa",
            "msg_low_attendance_body": "Waalidka sharafta leh, ilmahaaga waxaa lagu arkay in imaanshihiisa skoolka uu hooseeyo. Fadlan kala soo xiriir maamulka skoolka.",

            // Dashboards
            "student_dashboard_title": "Barta Ardayga (Student Dashboard)",
            "teacher_dashboard_title": "Barta Baraha (Teacher Dashboard)",
            "parent_dashboard_title": "Barta Waalidka (Parent Dashboard)",
            "overall_gpa": "Derejada Guud (GPA)",
            "attendance_rate": "Boqolkiiba Imaanshada",
            "fees_status": "Xaalada Lacagta",
            "exam_results": "Natiijooyinka Imtixaanka",
            "paid": "Waa La Bixiyay",
            "pending": "Waa In La Bixiyo",
            "unpaid": "La Ma Bixin",
            "present": "Wuu Joogaa",
            "absent": "Wuu Maqan Yahay",
            "leave": "Fasax Buu Ku Jiraa"
        },
        ar: {
            // Navigation & General UI
            "nav_dashboard": "لوحة التحكم",
            "nav_user_management": "إدارة المستخدمين",
            "nav_student_records": "سجلات الطلاب",
            "nav_attendance": "الحضور والغياب",
            "nav_teacher_management": "إدارة المعلمين",
            "nav_class_management": "إدارة الفصول",
            "nav_gallery": "معرض الصور",
            "nav_fee_management": "إدارة الرسوم الدراسية",
            "nav_results_approval": "اعتماد النتائج",
            "nav_clearance": "إخلاء الطرف",
            "nav_exam_schedule": "جدول الامتحانات",
            "nav_timetable": "الجدول الدراسي",
            "nav_admissions": "إدارة القبول والتسجيل",
            "nav_events": "تقويم الفعاليات",
            "nav_communication": "مركز الاتصالات",
            "nav_library": "إدارة المكتبة",
            "nav_report": "إنشاء التقارير",
            "nav_security": "الأمان والصلاحيات",
            "nav_content": "إدارة المحتوى",
            "nav_manage_results": "إدارة النتائج",
            "nav_recycle_bin": "سلة المهملات",
            "nav_logout": "تسجيل الخروج",
            "welcome": "مرحباً بك",
            "admin_panel": "لوحة الإدارة",
            "student_portal": "بوابة الطالب",
            "teacher_portal": "بوابة المعلم",
            "parent_portal": "بوابة ولي الأمر",

            // Language names
            "lang_english": "الإنجليزية (English)",
            "lang_somali": "الصومالية (Soomaali)",
            "lang_arabic": "العربية",

            // Common Actions
            "action_save": "حفظ",
            "action_cancel": "إلغاء",
            "action_delete": "حذف",
            "action_edit": "تعديل",
            "action_send": "إرسال الرسالة",
            "action_search": "بحث...",
            "action_filter": "تصفية",
            "action_print": "طباعة",
            "action_view": "عرض التفاصيل",
            "action_compose": "إنشاء رسالة",
            "action_close": "إغلاق",

            // Announcements & Messages
            "announcements": "الإعلانات والأخبار",
            "announcement_title": "عنوان الإعلان",
            "announcement_message": "نص الإعلان",
            "broadcast_to": "الجمهور المستهدف",
            "audience_all": "الجميع (الطلاب، المعلمون، وأولياء الأمور)",
            "audience_students": "الطلاب فقط",
            "audience_teachers": "المعلمون فقط",
            "audience_parents": "أولياء الأمور فقط",
            "important_notice": "تنبيه هام",
            "category_news": "الأخبار العامة والإعلانات",
            "category_exam_free": "إشعار يوم خالي من الامتحانات",
            "category_fee_payment": "إشعار دفع الرسوم الشهري",
            "category_low_attendance": "تنبيه انخفاض نسبة الحضور",

            // Messages & Templates
            "msg_exam_free_title": "إعلان: يوم خالي من الامتحانات",
            "msg_exam_free_body": "أعزائي الطلاب والمعلمين، يرجى العلم أن اليوم هو يوم خالي من الامتحانات بالكلية. تستمر الحصص حسب الجدول الاعتيادي.",
            "msg_fee_payment_title": "تذكير بدفع الرسوم الدراسية الشهرية",
            "msg_fee_payment_body": "أعزائي أولياء الأمور والطلاب، نود تذكيركم بموعد دفع الرسوم الشهرية. يرجى السداد لتجنب تأخير الخدمات.",
            "msg_low_attendance_title": "تنبيه: انخفاض نسبة حضور الطالب",
            "msg_low_attendance_body": "عزيزي ولي الأمر، تم تسجيل نسبة حضور منخفضة لنجلكم مؤخراً. يرجى التواصل مع إدارة المدرسة.",

            // Dashboards
            "student_dashboard_title": "لوحة الطالب",
            "teacher_dashboard_title": "لوحة المعلم",
            "parent_dashboard_title": "لوحة ولي الأمر",
            "overall_gpa": "المعدل التراكمي",
            "attendance_rate": "نسبة الحضور",
            "fees_status": "حالة الرسوم",
            "exam_results": "نتائج الامتحانات",
            "paid": "مدفوع",
            "pending": "معلق",
            "unpaid": "غير مدفوع",
            "present": "حاضر",
            "absent": "غائب",
            "leave": "إجازة"
        }
    };

    function getCurrentLanguage() {
        return localStorage.getItem(STORAGE_KEY) || 'en';
    }

    function setLanguage(lang) {
        if (!translations[lang]) lang = 'en';
        localStorage.setItem(STORAGE_KEY, lang);
        document.documentElement.setAttribute('lang', lang);
        
        // Handle RTL layout for Arabic
        if (lang === 'ar') {
            document.documentElement.setAttribute('dir', 'rtl');
            document.body.classList.add('rtl-mode');
        } else {
            document.documentElement.setAttribute('dir', 'ltr');
            document.body.classList.remove('rtl-mode');
        }

        applyTranslations(lang);
        updateLanguageSelectorUI(lang);

        // Dispatch global custom event for page scripts to respond
        window.dispatchEvent(new CustomEvent('bedrock_lang_changed', { detail: { lang: lang } }));
    }

    function getText(key, lang) {
        const targetLang = lang || getCurrentLanguage();
        if (translations[targetLang] && translations[targetLang][key]) {
            return translations[targetLang][key];
        }
        if (translations['en'][key]) {
            return translations['en'][key];
        }
        return key;
    }

    function applyTranslations(lang) {
        const curLang = lang || getCurrentLanguage();
        const dict = translations[curLang] || translations['en'];

        // Translate elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    if (el.hasAttribute('placeholder')) el.placeholder = dict[key];
                } else {
                    el.textContent = dict[key];
                }
            }
        });

        // Translate specific navigation links automatically by text matching if data-i18n not yet set
        document.querySelectorAll('.sidebar-nav a span, .td-nav-btn, .nav-link').forEach(span => {
            const txt = span.textContent.trim();
            for (const [k, v] of Object.entries(translations['en'])) {
                if (txt.toLowerCase() === v.toLowerCase() && dict[k]) {
                    span.textContent = dict[k];
                    span.setAttribute('data-i18n', k);
                    break;
                }
            }
        });
    }

    function updateLanguageSelectorUI(lang) {
        const curLang = lang || getCurrentLanguage();
        document.querySelectorAll('.bedrock-lang-select').forEach(sel => {
            sel.value = curLang;
        });
        document.querySelectorAll('.bedrock-lang-label').forEach(lbl => {
            if (curLang === 'so') lbl.textContent = '🇸🇴 Soomaali';
            else if (curLang === 'ar') lbl.textContent = '🇸🇦 العربية';
            else lbl.textContent = '🇬🇧 English';
        });
    }

    function injectLanguageSelector() {
        // Find top navbar or header controls
        const topNav = document.querySelector('.top-navbar, .dash-header, .td-header-right, .navbar');
        if (!topNav || document.getElementById('bedrock-lang-widget')) return;

        const widget = document.createElement('div');
        widget.id = 'bedrock-lang-widget';
        widget.className = 'd-inline-flex align-items-center me-2';
        widget.style.cssText = 'z-index:1050; margin-left: 8px; margin-right: 8px;';

        widget.innerHTML = `
            <div class="dropdown">
                <button class="btn btn-sm btn-outline-light text-nowrap dropdown-toggle d-flex align-items-center gap-1" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="border-radius:20px; font-size:0.75rem; font-weight:600; padding:4px 10px; background:rgba(255,255,255,0.15); border-color:rgba(255,255,255,0.3);">
                    <i class="fas fa-globe"></i>
                    <span class="bedrock-lang-label">${getCurrentLanguage() === 'so' ? '🇸🇴 Soomaali' : getCurrentLanguage() === 'ar' ? '🇸🇦 العربية' : '🇬🇧 English'}</span>
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm" style="font-size:0.82rem;">
                    <li><a class="dropdown-item d-flex align-items-center gap-2 ${getCurrentLanguage() === 'en' ? 'active' : ''}" href="#" onclick="BedrockI18n.setLanguage('en'); return false;">🇬🇧 English</a></li>
                    <li><a class="dropdown-item d-flex align-items-center gap-2 ${getCurrentLanguage() === 'so' ? 'active' : ''}" href="#" onclick="BedrockI18n.setLanguage('so'); return false;">🇸🇴 Soomaali</a></li>
                    <li><a class="dropdown-item d-flex align-items-center gap-2 ${getCurrentLanguage() === 'ar' ? 'active' : ''}" href="#" onclick="BedrockI18n.setLanguage('ar'); return false;">🇸🇦 العربية</a></li>
                </ul>
            </div>
        `;

        // Insert before theme toggle or logout
        const themeToggle = topNav.querySelector('.theme-toggle, #logout-btn, #logout-link');
        if (themeToggle) {
            topNav.insertBefore(widget, themeToggle);
        } else {
            topNav.appendChild(widget);
        }
    }

    // Auto Init on DOM Load
    document.addEventListener('DOMContentLoaded', () => {
        injectLanguageSelector();
        setLanguage(getCurrentLanguage());
    });

    return {
        getLang: getCurrentLanguage,
        setLanguage: setLanguage,
        t: getText,
        apply: applyTranslations,
        translations: translations
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BedrockI18n;
}
