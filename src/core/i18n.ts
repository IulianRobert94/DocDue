/**
 * DocDue — Internationalization (i18n)
 *
 * Toate textele aplicației în română și engleză.
 * Funcția t() traduce o cheie în limba curentă cu suport pentru interpolări.
 * translateSubtype() traduce subtipurile de documente (RCA, ITP, etc.).
 *
 * PORTAT 1:1 din v10 — nu se modifică logica.
 */

import type { LanguageCode } from "./constants";

// ─── Translation Dictionary ─────────────────────────────

const TRANSLATIONS: Record<string, Record<string, string>> = {
  ro: {
    // Navigation
    nav_home: "Acasă", nav_alerts: "Alerte", nav_search: "Caută", nav_settings: "Setări",
    nav_add: "Adaugă document", nav_label: "Navigare",

    // Status
    status_expired: "EXPIRAT", status_warning: "SCADENT", status_ok: "OK",
    status_expired_plural: "Expirate", status_warning_plural: "Scadente", status_ok_plural: "În regulă",

    // Categories
    cat_vehicule: "Vehicule", cat_personal: "Persoane", cat_casa: "Casă",
    cat_financiar: "Financiar",

    // Category card
    doc_singular: "document", doc_plural: "documente",

    // Recurrence
    rec_none: "Fără recurență", rec_weekly: "Săptămânal",
    rec_monthly: "Lunar", rec_annual: "Anual",
    rec_none_short: "Fără", rec_weekly_short: "Săpt.", rec_monthly_short: "Lunar", rec_annual_short: "Anual",

    // Sort
    sort_urgency: "Urgență", sort_date: "Dată", sort_date_asc: "Dată ↑", sort_date_desc: "Dată ↓",
    sort_amount: "Sumă", sort_name: "A → Z", sort_label: "Sortare",

    // Days remaining
    days_overdue_plural: "{n} zile întârziere", days_overdue_singular: "1 zi întârziere",
    days_today: "Astăzi!", days_tomorrow: "Mâine", days_future: "în {n} zile",

    // Home screen
    home_needs_attention: "Necesită atenție", home_see_all: "Vezi toate",
    home_welcome: "Bun venit!", home_welcome_sub: "Adaugă primul document apăsând butonul + din bara de jos",
    home_30days: "30 zile",
    month_short_1: "Ian", month_short_2: "Feb", month_short_3: "Mar", month_short_4: "Apr",
    month_short_5: "Mai", month_short_6: "Iun", month_short_7: "Iul", month_short_8: "Aug",
    month_short_9: "Sep", month_short_10: "Oct", month_short_11: "Nov", month_short_12: "Dec",

    // Alerts screen
    alerts_title: "Alerte", alerts_needs_attention: "{n} necesită atenție",
    alerts_none_title: "Nicio alertă",

    // Search screen
    search_title: "Caută", search_placeholder: "Document, vehicul, tip, notă...",
    search_no_results: "Niciun rezultat pentru \"{q}\"", search_count: "Caută în {n} documente",
    search_no_filter_results: "Niciun document pentru filtrele selectate",
    search_all: "Toate",

    // Category screen

    // Document detail
    detail_due: "Scadență", detail_amount: "Sumă", detail_recurrence: "Recurență",
    detail_type: "Tip", detail_notes: "Note",
    detail_pay_next: "Plătit — Următoarea scadență", detail_resolved: "Rezolvat",
    detail_edit: "Editează", detail_delete: "Șterge",

    // Document form
    form_add_title: "Document nou", form_edit_title: "Editează",
    form_category: "Categorie", form_type: "Tip", form_title: "Titlu",
    form_asset: "Asociat cu", form_due: "Scadență", form_amount: "Sumă",
    form_recurrence: "Recurență", form_notes: "Note",
    form_type_select: "Selectează...", form_title_placeholder: "ex: RCA — Dacia Duster",
    form_asset_placeholder: "vehicul / adresă / persoană", form_notes_placeholder: "Opțional...",
    form_custom_type_placeholder: "Introdu tipul documentului",
    form_search_type: "Caută tip...",
    form_save: "Salvează", form_done: "Gata",

    // Validation
    val_title_required: "Titlul este obligatoriu",
    val_date_required: "Data scadenței este obligatorie",
    val_date_invalid: "Data nu este validă",
    val_amount_positive: "Suma trebuie să fie un număr pozitiv",

    // Confirm dialogs
    confirm_discard_title: "Renunți la modificări?",
    confirm_discard_msg: "Datele introduse nu au fost salvate și vor fi pierdute.",
    confirm_discard_btn: "Renunță",
    confirm_delete_title: "Șterge document",
    confirm_delete_msg: "Sigur vrei să ștergi \"{title}\"? Acțiunea este ireversibilă.",
    confirm_cancel: "Anulează",
    confirm_delete_btn: "Șterge",
    confirm_paid_title: "Marchează ca plătit?",
    confirm_paid_msg: "Data scadenței va fi actualizată la următoarea perioadă.",
    confirm_paid_btn: "Plătit",
    confirm_resolved_title: "Marchează ca rezolvat?",
    confirm_resolved_msg: "Documentul va fi șters definitiv.",
    confirm_resolved_btn: "Rezolvat",
    confirm_reset_title: "Resetare date",
    confirm_reset_msg: "Datele curente vor fi înlocuite cu datele demonstrative. Continui?",
    confirm_reset_btn: "Resetează",
    confirm_clear_title: "Șterge tot",
    confirm_clear_msg: "Toate documentele vor fi șterse permanent. Această acțiune este ireversibilă!",
    confirm_clear_btn: "Șterge tot",

    // Toasts
    toast_added: "Document adăugat ✓", toast_updated: "Document actualizat ✓",
    toast_deleted: "Document șters", toast_paid_next: "Plătit ✓ Următoarea scadență generată",
    toast_resolved: "Marcat ca rezolvat ✓", toast_demo_restored: "Date demo restaurate",
    toast_all_cleared: "Toate datele au fost șterse",
    toast_save_error: "⚠ Eroare la salvarea datelor ({key})",
    save_error_title: "Eroare la salvare",
    save_error_msg: "Modificările nu au putut fi salvate. Verifică spațiul disponibil pe dispozitiv.",

    // Settings
    settings_title: "Setări",
    settings_general: "General", settings_appearance: "Aspect",
    settings_alerts: "Alerte", settings_data: "Date", settings_about: "Despre",
    settings_total_docs: "Total documente", settings_version: "Versiune",
    settings_theme: "Temă", settings_currency: "Monedă", settings_language: "Limbă",
    settings_warning_threshold: "Prag avertizare", settings_warning_desc: "Câte zile înainte devine galben",
    settings_reminders: "Remindere", settings_reminders_desc: "Notificări la câte zile înainte",
    settings_export_excel: "Exportă Excel (.xlsx)",
    settings_import_excel: "Importă din Excel (.xlsx)",
    settings_export_success: "Backup exportat cu succes!",
    settings_export_error: "Eroare la exportul datelor",
    settings_import_success: "Import reușit! {n} documente adăugate.",
    settings_import_error: "Eroare la importul fișierului",
    settings_import_no_data: "Fișierul nu conține date valide",
    settings_import_confirm_title: "Importă documente",
    settings_import_confirm_msg: "S-au găsit {n} documente în fișier. Vor fi adăugate la documentele existente. Continui?",
    settings_import_confirm_btn: "Importă",
    settings_reset_demo: "Resetare date demo", settings_reset_demo_desc: "Reîncarcă datele demonstrative",
    settings_clear_all: "Șterge toate datele", settings_clear_all_desc: "Pornește de la zero, ireversibil",
    settings_about_text: "Gestionează documente, facturi și expirări. De la o mașină personală la o flotă de transport.",
    settings_days_suffix: "zile",
    settings_per_category: "Pe categorie",
    settings_all_categories: "Toate categoriile",
    settings_default: "implicit",
    settings_use_global: "Global",

    // Close / Back buttons
    btn_close: "Închide",
    btn_back: "Înapoi",

    // Alert titles
    alert_success: "Succes",
    alert_error: "Eroare",
    alert_notice: "Atenție",

    // Missing keys
    alerts_empty: "Nicio alertă! Toate documentele sunt în regulă.",
    no_documents: "Niciun document în această categorie",
    doc_not_found: "Document negăsit",

    // Privacy
    settings_privacy: "Politica de confidențialitate",
    settings_privacy_footer: "DocDue nu colectează date personale. Toate datele rămân pe dispozitivul tău.",

    // IAP & Premium
    premium_subscribe: "Cumpără Pro",
    iap_restore_ok: "Achiziția a fost restaurată cu succes!",
    iap_restore_none: "Nu s-au găsit achiziții anterioare.",
    purchase_error: "Achiziția a eșuat. Încearcă din nou.",
    plan_monthly: "Lunar",
    plan_annual: "Anual",
    plan_lifetime: "Pe viață",
    plan_month: "lună",
    plan_best_value: "Cea mai bună ofertă",

    // Share
    share_app: "Recomandă DocDue",
    share_app_message: "Folosesc DocDue pentru a urmări scadențele documentelor. Nu mai ratez niciun termen! Descarcă și tu:",

    // Congrats
    congrats_paid: "Felicitări!",

    // Weekly notification
    notif_weekly_title: "Rezumatul săptămânii",
    notif_weekly_body: "Săptămâna aceasta: {weekCount} documente scadente, {urgentCount} urgente. Scor: {score}/100.",

    // Accessibility hints
    a11y_search_btn: "Deschide căutarea",
    a11y_see_all_alerts: "Vezi toate alertele",
    a11y_close_modal: "Închide",
    a11y_go_back: "Înapoi",
    a11y_add_document: "Adaugă document nou",
    a11y_save_document: "Salvează documentul",
    a11y_cancel: "Anulează",
    a11y_delete_document: "Șterge documentul",
    a11y_edit_document: "Editează documentul",
    a11y_mark_paid: "Marchează ca plătit",
    a11y_sort_by: "Sortare după {label}",
    a11y_select_category: "Selectează categoria {name}",
    a11y_select_type: "Selectează tipul {name}",
    a11y_select_recurrence: "Selectează recurența {name}",
    a11y_open_document: "Deschide documentul {title}",
    a11y_open_category: "Deschide categoria {name}",
    a11y_theme_toggle: "Comutare temă întunecată",

    // Biometric
    biometric_lock: "Blocare biometrică",
    biometric_desc: "Folosește Face ID sau amprenta",
    biometric_unlock: "Deblochează DocDue",
    biometric_retry: "Încearcă din nou",
    biometric_failed: "Autentificare eșuată",
    biometric_not_available: "Biometria nu e disponibilă pe acest dispozitiv",
    biometric_section: "Securitate",
    biometric_locked_out: "Prea multe încercări. Încearcă din nou în 30 de secunde.",
    biometric_use_passcode: "Folosește parola",
    biometric_locked_out_dynamic: "Prea multe încercări. Încearcă în {time}.",

    // Attachments
    attachments: "Atașamente",
    add_photo: "Adaugă poză",
    add_file: "Adaugă fișier",
    remove_attachment: "Șterge",
    attachment_limit: "Maxim 5 atașamente",
    from_camera: "Din cameră",
    from_gallery: "Din galerie",
    open_file: "Deschide fișier",
    attachment_error: "Eroare la adăugarea fișierului",

    // Backup & Restore
    backup_section: "Backup și restaurare",
    backup_create: "Creează backup",
    backup_restore: "Restaurare din backup",
    backup_last: "Ultimul backup",
    backup_include_attachments: "Include atașamente",
    backup_include_desc: "Fișier mai mare",
    backup_success: "Backup creat cu succes",
    attachments_skipped: "atașamente nu au putut fi incluse",
    backup_error: "Eroare la crearea backup-ului",
    sharing_unavailable: "Partajarea nu este disponibilă pe acest dispozitiv.",
    all_docs_exist: "Toate documentele există deja.",
    duplicates_skipped: "duplicate omise",
    restore_replace: "Înlocuiește tot",
    restore_merge: "Îmbină cu existente",
    restore_confirm: "Sigur vrei să restaurezi?",
    restore_success: "Restaurare completă",
    restore_error: "Eroare la restaurare",
    restore_invalid: "Fișier de backup invalid",
    restore_choose: "Cum vrei să restaurezi?",

    // Notifications
    notif_reminder_title: "{days} zile rămase",
    notif_reminder_body: "\"{title}\" expiră pe {date}",
    notif_due_today_title: "Expiră astăzi!",
    notif_due_today_body: "\"{title}\" expiră azi ({date})",
    notif_permission_title: "Activează notificările",
    notif_permission_denied: "Notificările sunt dezactivate. Le poți activa din Setări → Notificări.",
    settings_notifications: "Notificări",
    settings_notifications_desc: "Primește remindere înainte de expirare",
    settings_notifications_enable: "Activează notificările",
    settings_reminder_days: "Zile de avertizare",
    settings_reminder_days_desc: "Cu câte zile înainte să primești notificarea",

    photo_permission: "Permite accesul la galerie din Setări pentru a adăuga fotografii.",
    val_category_invalid: "Categorie invalidă",

    // Calendar
    cal_add: "Adaugă în calendar",
    cal_added: "Eveniment adăugat în calendar",
    cal_error: "Eroare la adăugarea în calendar",
    cal_permission_denied: "Accesul la calendar a fost refuzat. Activează-l din Setări.",

    // Analytics
    analytics_title: "Analiză cheltuieli",
    analytics_30days: "Următoarele 30 zile",
    analytics_total: "Total de plătit",
    analytics_by_category: "Pe categorii",
    analytics_by_month: "Pe luni",
    analytics_no_data: "Nicio cheltuială de afișat",
    analytics_total_paid: "Total plătit",
    analytics_avg_monthly: "Cost mediu lunar",
    analytics_based_on: "Bazat pe {n} luni de date",

    // Sharing
    share_document: "Trimite",
    share_summary: "📄 {title}\n📅 Scadență: {due}\n💰 Sumă: {amount}\n🔄 Recurență: {recurrence}\n📂 Categorie: {category}\n📝 Tip: {type}",

    // Premium
    premium_title: "DocDue Pro",
    premium_subtitle: "Deblocați toate funcțiile",
    premium_feature_unlimited: "Documente nelimitate",
    premium_feature_analytics: "Analiză cheltuieli",
    premium_feature_backup: "Backup și restaurare",
    premium_feature_widgets: "Widget-uri home screen",
    premium_feature_export: "Export Excel și import",
    settings_contact_support: "Contactează suportul",
    premium_upgrade: "Upgrade la Pro",
    premium_restore: "Restaurare achiziție",
    premium_limit_title: "Limită atinsă",
    premium_limit_msg: "Versiunea gratuită permite maxim {n} documente. Cumpără Pro (plată unică) pentru documente nelimitate.",
    premium_active: "Pro activ",
    premium_section: "DocDue Pro",
    premium_free_count: "{n} din {max} documente",
    premium_required: "Funcție Pro",

    // Payment history
    payment_history: "Istoric plăți",
    total_paid: "Total plătit",
    paid_on: "Plătit pe {date}",
    payment_count: "{n} plăți",


    // Notification actions
    notif_action_renewed: "Reînnoit ✓",
    notif_action_tomorrow: "Mâine",

    // Demo banner
    demo_banner_text: "Acestea sunt documente demonstrative. Adaugă-le pe ale tale!",
    demo_banner_dismiss: "Șterge exemplele",

    // Health Score
    health_score: "Scor sănătate",
    health_critical: "Necesită atenție urgentă",
    health_attention: "Câteva documente necesită atenție",
    health_good: "Toate documentele sunt în regulă",
    health_hint_expired: "{n} expirate",
    health_hint_warning: "{n} scadente",

    // Morning Digest
    notif_digest_title: "Rezumat dimineața",
    notif_digest_body_zero: "Scor sănătate: {score}/100. Totul e în regulă!",
    notif_digest_body_one: "{n} document necesită atenție. Scor: {score}/100",
    notif_digest_body_plural: "{n} documente necesită atenție. Scor: {score}/100",

    // Smart notification templates
    notif_smart_rca: "Asigurarea costă mai mult dacă depășești termenul!",
    notif_smart_itp: "Fără ITP valid nu poți circula legal.",
    notif_smart_tax: "Evită penalitățile — plătește la timp.",
    notif_smart_utility: "Evită deconectarea — plătește factura.",
    notif_smart_contract: "Verifică dacă vrei să reînnoiești.",
    notif_smart_generic: "Nu uita de scadență!",

    // Countdown
    countdown_today: "Astăzi",
    countdown_tomorrow: "Mâine",
    countdown_days: "{n} zile",

    // Review prompt
    review_enjoying: "Îți place DocDue?",
    review_rate: "Lasă un review",

    // ErrorBoundary
    error_title: "Ceva nu a funcționat",
    error_subtitle: "A apărut o eroare neașteptată",
    error_retry: "Încearcă din nou",

    // ImageViewer
    a11y_close_image: "Închide previzualizarea",
    a11y_image_preview: "Previzualizare atașament",

    // HealthScoreArc
    a11y_health_score: "Scor sănătate: {score} din 100",

    // Premium early access
    premium_early_access_note: "Toate funcțiile sunt gratuite în perioada de early access.",
    premium_unlock_free: "Activează gratuit",

    // Purchase terms
    premium_terms: "Achiziție unică — fără abonament, fără plăți recurente.",
    premium_terms_of_use: "Termenii de utilizare",
    premium_privacy_link: "Politica de confidențialitate",

    // Import limit
    import_too_large: "Fișierul conține prea multe înregistrări (max {max}).",

    // Form date placeholder
    form_date_placeholder: "ZZ.LL.AAAA",

    // Smart defaults
    smart_default_applied: "Recurență setată automat ✓",

    // Quick Actions
    quick_action_add: "Document nou",
    quick_action_alerts: "Alerte",
    quick_action_search: "Caută",

    // Privacy sections
    privacy_last_updated: "Ultima actualizare: Februarie 2026",
    privacy_data_collected_title: "Date colectate",
    privacy_data_collected_body: "DocDue NU colectează, transmite sau stochează date personale pe servere externe. Toate documentele și preferințele sunt stocate exclusiv pe dispozitivul tău, folosind AsyncStorage.",
    privacy_permissions_title: "Permisiuni",
    privacy_permissions_body: "Aplicația solicită acces la cameră și galeria foto doar pentru a atașa documente. Face ID / amprentă se folosește doar pentru deblocarea aplicației. Nu se solicită acces la locație sau contacte. Nu se fac cereri de rețea către servere terțe.",
    privacy_storage_title: "Stocare locală",
    privacy_storage_body: "Toate documentele, atașamentele și preferințele sunt stocate exclusiv pe dispozitivul tău. Backup-urile pot fi create manual și salvate unde dorești (iCloud Drive, Google Drive, email etc.).",
    privacy_sharing_title: "Partajare date",
    privacy_sharing_body: "Nu partajăm, vindem sau transmitem date către terți. Nu există analytics, tracking sau reclame în aplicație.",
    privacy_deletion_title: "Ștergerea datelor",
    privacy_deletion_body: "Poți șterge toate datele oricând din Setări → Șterge tot. Dezinstalarea aplicației elimină automat toate datele stocate.",
    privacy_contact_title: "Contact",
    privacy_contact_body: "Pentru întrebări legate de confidențialitate, contactează-ne la: andreiiulianrobert@gmail.com",

    // Onboarding slides
    onboarding_slide1_title: "Toate documentele\nîntr-un singur loc",
    onboarding_slide1_desc: "RCA, ITP, facturi, contracte, abonamente.\nNu mai uita niciodată o dată de expirare.",
    onboarding_slide2_title: "Alerte vizuale\nși organizare inteligentă",
    onboarding_slide2_desc: "Coduri de culori pentru urgență.\nCategorizare automată și sortare flexibilă.",
    onboarding_slide3_title: "Nu rata nicio scadență",
    onboarding_slide3_desc: "Primești notificări înainte de expirare.\nRezumat zilnic cu scorul tău de sănătate.",
    onboarding_slide4_title: "100% privat",
    onboarding_slide4_desc: "Datele rămân pe telefonul tău.\nFără servere, fără tracking, fără reclame.",
    onboarding_skip: "Omite",
    onboarding_next: "Continuă",
    onboarding_start: "Începe",
    a11y_onboarding_dot: "Pagina {n} din {total}",
  },
  en: {
    nav_home: "Home", nav_alerts: "Alerts", nav_search: "Search", nav_settings: "Settings",
    nav_add: "Add document", nav_label: "Navigation",

    status_expired: "EXPIRED", status_warning: "DUE SOON", status_ok: "OK",
    status_expired_plural: "Expired", status_warning_plural: "Due soon", status_ok_plural: "On track",

    cat_vehicule: "Vehicles", cat_personal: "People", cat_casa: "Home",
    cat_financiar: "Financial",

    doc_singular: "document", doc_plural: "documents",

    rec_none: "No recurrence", rec_weekly: "Weekly",
    rec_monthly: "Monthly", rec_annual: "Annual",
    rec_none_short: "None", rec_weekly_short: "Wkly", rec_monthly_short: "Mthly", rec_annual_short: "Yearly",

    sort_urgency: "Urgency", sort_date: "Date", sort_date_asc: "Date ↑", sort_date_desc: "Date ↓",
    sort_amount: "Amount", sort_name: "A → Z", sort_label: "Sort",

    days_overdue_plural: "{n} days overdue", days_overdue_singular: "1 day overdue",
    days_today: "Today!", days_tomorrow: "Tomorrow", days_future: "in {n} days",

    home_needs_attention: "Needs attention", home_see_all: "See all",
    home_welcome: "Welcome!", home_welcome_sub: "Add your first document by tapping the + button below",
    home_30days: "30 days",
    month_short_1: "Jan", month_short_2: "Feb", month_short_3: "Mar", month_short_4: "Apr",
    month_short_5: "May", month_short_6: "Jun", month_short_7: "Jul", month_short_8: "Aug",
    month_short_9: "Sep", month_short_10: "Oct", month_short_11: "Nov", month_short_12: "Dec",

    alerts_title: "Alerts", alerts_needs_attention: "{n} need attention",
    alerts_none_title: "No alerts",

    search_title: "Search", search_placeholder: "Document, vehicle, type, note...",
    search_no_results: "No results for \"{q}\"", search_count: "Search across {n} documents",
    search_no_filter_results: "No documents match the selected filters",
    search_all: "All",


    detail_due: "Due date", detail_amount: "Amount", detail_recurrence: "Recurrence",
    detail_type: "Type", detail_notes: "Notes",
    detail_pay_next: "Paid — Generate next due", detail_resolved: "Resolved",
    detail_edit: "Edit", detail_delete: "Delete",

    form_add_title: "New document", form_edit_title: "Edit",
    form_category: "Category", form_type: "Type", form_title: "Title",
    form_asset: "Associated with", form_due: "Due date", form_amount: "Amount",
    form_recurrence: "Recurrence", form_notes: "Notes",
    form_type_select: "Select...", form_title_placeholder: "e.g.: Car Insurance — Dacia Duster",
    form_asset_placeholder: "vehicle / address / person", form_notes_placeholder: "Optional...",
    form_custom_type_placeholder: "Enter document type",
    form_search_type: "Search type...",
    form_save: "Save", form_done: "Done",

    val_title_required: "Title is required",
    val_date_required: "Due date is required",
    val_date_invalid: "Date is not valid",
    val_amount_positive: "Amount must be a positive number",

    confirm_discard_title: "Discard changes?",
    confirm_discard_msg: "Your unsaved data will be lost.",
    confirm_discard_btn: "Discard",
    confirm_delete_title: "Delete document",
    confirm_delete_msg: "Are you sure you want to delete \"{title}\"? This cannot be undone.",
    confirm_cancel: "Cancel",
    confirm_delete_btn: "Delete",
    confirm_paid_title: "Mark as paid?",
    confirm_paid_msg: "The due date will be moved to the next period.",
    confirm_paid_btn: "Paid",
    confirm_resolved_title: "Mark as resolved?",
    confirm_resolved_msg: "This document will be permanently removed.",
    confirm_resolved_btn: "Resolved",
    confirm_reset_title: "Reset data",
    confirm_reset_msg: "Current data will be replaced with demo data. Continue?",
    confirm_reset_btn: "Reset",
    confirm_clear_title: "Delete all",
    confirm_clear_msg: "All documents will be permanently deleted. This cannot be undone!",
    confirm_clear_btn: "Delete all",

    toast_added: "Document added ✓", toast_updated: "Document updated ✓",
    toast_deleted: "Document deleted", toast_paid_next: "Paid ✓ Next due date generated",
    toast_resolved: "Marked as resolved ✓", toast_demo_restored: "Demo data restored",
    toast_all_cleared: "All data has been deleted",
    toast_save_error: "⚠ Error saving data ({key})",
    save_error_title: "Save Error",
    save_error_msg: "Your changes could not be saved. Please check available space on your device.",

    settings_title: "Settings",
    settings_general: "General", settings_appearance: "Appearance",
    settings_alerts: "Alerts", settings_data: "Data", settings_about: "About",
    settings_total_docs: "Total documents", settings_version: "Version",
    settings_theme: "Theme", settings_currency: "Currency", settings_language: "Language",
    settings_warning_threshold: "Warning threshold", settings_warning_desc: "Days before status turns yellow",
    settings_reminders: "Reminders", settings_reminders_desc: "Notify this many days before",
    settings_export_excel: "Export Excel (.xlsx)",
    settings_import_excel: "Import from Excel (.xlsx)",
    settings_import_success: "Import successful! {n} documents added.",
    settings_import_error: "Error importing file",
    settings_import_no_data: "File contains no valid data",
    settings_import_confirm_title: "Import documents",
    settings_import_confirm_msg: "{n} documents found in file. They will be added to your existing documents. Continue?",
    settings_import_confirm_btn: "Import",
    settings_export_success: "Backup exported successfully!",
    settings_export_error: "Error exporting data",
    settings_reset_demo: "Reset demo data", settings_reset_demo_desc: "Reload demo documents",
    settings_clear_all: "Delete all data", settings_clear_all_desc: "Start fresh, irreversible",
    settings_about_text: "Manage documents, invoices, and expiration dates. From a personal car to a transport fleet.",
    settings_days_suffix: "days",
    settings_per_category: "Per category",
    settings_all_categories: "All categories",
    settings_default: "default",
    settings_use_global: "Global",

    btn_close: "Close",
    btn_back: "Back",
    alert_success: "Success",
    alert_error: "Error",
    alert_notice: "Notice",
    alerts_empty: "No alerts! All documents are up to date.",
    no_documents: "No documents in this category",
    doc_not_found: "Document not found",

    // Privacy
    settings_privacy: "Privacy Policy",
    settings_privacy_footer: "DocDue does not collect personal data. All data stays on your device.",

    // IAP & Premium
    premium_subscribe: "Get Pro",
    iap_restore_ok: "Purchase restored successfully!",
    iap_restore_none: "No previous purchases found.",
    purchase_error: "Purchase failed. Please try again.",
    plan_monthly: "Monthly",
    plan_annual: "Annual",
    plan_lifetime: "Lifetime",
    plan_month: "month",
    plan_best_value: "Best Value",

    // Share
    share_app: "Share DocDue",
    share_app_message: "I use DocDue to track my document deadlines. Never miss an expiry date again! Download here:",

    // Congrats
    congrats_paid: "Well done!",

    // Weekly notification
    notif_weekly_title: "Your Weekly Summary",
    notif_weekly_body: "This week: {weekCount} documents due, {urgentCount} urgent. Health score: {score}/100.",

    // Accessibility hints
    a11y_search_btn: "Open search",
    a11y_see_all_alerts: "See all alerts",
    a11y_close_modal: "Close",
    a11y_go_back: "Go back",
    a11y_add_document: "Add new document",
    a11y_save_document: "Save document",
    a11y_cancel: "Cancel",
    a11y_delete_document: "Delete document",
    a11y_edit_document: "Edit document",
    a11y_mark_paid: "Mark as paid",
    a11y_sort_by: "Sort by {label}",
    a11y_select_category: "Select category {name}",
    a11y_select_type: "Select type {name}",
    a11y_select_recurrence: "Select recurrence {name}",
    a11y_open_document: "Open document {title}",
    a11y_open_category: "Open category {name}",
    a11y_theme_toggle: "Toggle dark theme",

    // Biometric
    biometric_lock: "Biometric Lock",
    biometric_desc: "Use Face ID or fingerprint",
    biometric_unlock: "Unlock DocDue",
    biometric_retry: "Try Again",
    biometric_failed: "Authentication failed",
    biometric_not_available: "Biometrics not available on this device",
    biometric_section: "Security",
    biometric_locked_out: "Too many attempts. Try again in 30 seconds.",
    biometric_use_passcode: "Use Passcode",
    biometric_locked_out_dynamic: "Too many attempts. Try again in {time}.",

    // Attachments
    attachments: "Attachments",
    add_photo: "Add Photo",
    add_file: "Add File",
    remove_attachment: "Remove",
    attachment_limit: "Maximum 5 attachments",
    from_camera: "From Camera",
    from_gallery: "From Gallery",
    open_file: "Open File",
    attachment_error: "Error adding file",

    // Backup & Restore
    backup_section: "Backup & Restore",
    backup_create: "Create Backup",
    backup_restore: "Restore from Backup",
    backup_last: "Last backup",
    backup_include_attachments: "Include attachments",
    backup_include_desc: "Larger file size",
    backup_success: "Backup created successfully",
    attachments_skipped: "attachments could not be included",
    backup_error: "Error creating backup",
    sharing_unavailable: "Sharing is not available on this device.",
    all_docs_exist: "All documents already exist.",
    duplicates_skipped: "duplicates skipped",
    restore_replace: "Replace all",
    restore_merge: "Merge with existing",
    restore_confirm: "Confirm restore?",
    restore_success: "Restore complete",
    restore_error: "Error restoring data",
    restore_invalid: "Invalid backup file",
    restore_choose: "How do you want to restore?",

    // Notifications
    notif_reminder_title: "{days} days remaining",
    notif_reminder_body: "\"{title}\" is due on {date}",
    notif_due_today_title: "Due today!",
    notif_due_today_body: "\"{title}\" is due today ({date})",
    notif_permission_title: "Enable notifications",
    notif_permission_denied: "Notifications are disabled. You can enable them in Settings → Notifications.",
    settings_notifications: "Notifications",
    settings_notifications_desc: "Get reminders before documents expire",
    settings_notifications_enable: "Enable notifications",
    settings_reminder_days: "Reminder days",
    settings_reminder_days_desc: "How many days before the due date to notify you",

    photo_permission: "Please allow photo library access in Settings to add photos.",
    val_category_invalid: "Invalid category",

    // Calendar
    cal_add: "Add to Calendar",
    cal_added: "Event added to calendar",
    cal_error: "Error adding to calendar",
    cal_permission_denied: "Calendar access was denied. Enable it in Settings.",

    // Analytics
    analytics_title: "Spending Analytics",
    analytics_30days: "Next 30 days",
    analytics_total: "Total due",
    analytics_by_category: "By category",
    analytics_by_month: "By month",
    analytics_no_data: "No spending data to display",
    analytics_total_paid: "Total paid",
    analytics_avg_monthly: "Avg. monthly cost",
    analytics_based_on: "Based on {n} months of data",

    // Sharing
    share_document: "Share",
    share_summary: "📄 {title}\n📅 Due: {due}\n💰 Amount: {amount}\n🔄 Recurrence: {recurrence}\n📂 Category: {category}\n📝 Type: {type}",

    // Premium
    premium_title: "DocDue Pro",
    premium_subtitle: "Unlock all features",
    premium_feature_unlimited: "Unlimited documents",
    premium_feature_analytics: "Spending analytics",
    premium_feature_backup: "Backup & restore",
    premium_feature_widgets: "Home screen widgets",
    premium_feature_export: "Excel export & import",
    settings_contact_support: "Contact support",
    premium_upgrade: "Upgrade to Pro",
    premium_restore: "Restore purchase",
    premium_limit_title: "Limit reached",
    premium_limit_msg: "The free version allows up to {n} documents. Get Pro (one-time purchase) for unlimited documents.",
    premium_active: "Pro active",
    premium_section: "DocDue Pro",
    premium_free_count: "{n} of {max} documents",
    premium_required: "Pro feature",

    // Payment history
    payment_history: "Payment history",
    total_paid: "Total paid",
    paid_on: "Paid on {date}",
    payment_count: "{n} payments",


    // Notification actions
    notif_action_renewed: "Renewed ✓",
    notif_action_tomorrow: "Tomorrow",

    // Demo banner
    demo_banner_text: "These are demo documents. Add your own!",
    demo_banner_dismiss: "Remove examples",

    // Health Score
    health_score: "Health Score",
    health_critical: "Needs urgent attention",
    health_attention: "Some documents need attention",
    health_good: "All documents are on track",
    health_hint_expired: "{n} expired",
    health_hint_warning: "{n} due soon",

    // Morning Digest
    notif_digest_title: "Morning Summary",
    notif_digest_body_zero: "Health score: {score}/100. Everything's good!",
    notif_digest_body_one: "{n} document needs attention. Score: {score}/100",
    notif_digest_body_plural: "{n} documents need attention. Score: {score}/100",

    // Smart notification templates
    notif_smart_rca: "Insurance costs more if you miss the deadline!",
    notif_smart_itp: "You can't drive legally without a valid inspection.",
    notif_smart_tax: "Avoid penalties — pay on time.",
    notif_smart_utility: "Avoid disconnection — pay your bill.",
    notif_smart_contract: "Check if you want to renew.",
    notif_smart_generic: "Don't forget the deadline!",

    // Countdown
    countdown_today: "Today",
    countdown_tomorrow: "Tomorrow",
    countdown_days: "{n} days",

    // Review prompt
    review_enjoying: "Enjoying DocDue?",
    review_rate: "Leave a review",

    // ErrorBoundary
    error_title: "Something went wrong",
    error_subtitle: "An unexpected error occurred",
    error_retry: "Try Again",

    // ImageViewer
    a11y_close_image: "Close preview",
    a11y_image_preview: "Attachment preview",

    // HealthScoreArc
    a11y_health_score: "Health score: {score} out of 100",

    // Premium early access
    premium_early_access_note: "All features are free during early access.",
    premium_unlock_free: "Unlock for free",

    // Purchase terms
    premium_terms: "One-time purchase — no subscription, no recurring charges.",
    premium_terms_of_use: "Terms of Use",
    premium_privacy_link: "Privacy Policy",

    // Import limit
    import_too_large: "File contains too many records (max {max}).",

    // Form date placeholder
    form_date_placeholder: "YYYY-MM-DD",

    // Smart defaults
    smart_default_applied: "Recurrence auto-set ✓",

    // Quick Actions
    quick_action_add: "New Document",
    quick_action_alerts: "Alerts",
    quick_action_search: "Search",

    // Privacy sections
    privacy_last_updated: "Last updated: February 2026",
    privacy_data_collected_title: "Data collected",
    privacy_data_collected_body: "DocDue does NOT collect, transmit, or store personal data on external servers. All documents and preferences are stored exclusively on your device using AsyncStorage.",
    privacy_permissions_title: "Permissions",
    privacy_permissions_body: "The app requests access to camera and photo library only to attach documents. Face ID / fingerprint is used only for app unlock. No access to location or contacts is requested. No network requests are made to third-party servers.",
    privacy_storage_title: "Local storage",
    privacy_storage_body: "All documents, attachments, and preferences are stored exclusively on your device. Backups can be created manually and saved wherever you choose (iCloud Drive, Google Drive, email, etc.).",
    privacy_sharing_title: "Data sharing",
    privacy_sharing_body: "We do not share, sell, or transmit data to third parties. There are no analytics, tracking, or ads in the app.",
    privacy_deletion_title: "Data deletion",
    privacy_deletion_body: "You can delete all data at any time from Settings → Clear all. Uninstalling the app automatically removes all stored data.",
    privacy_contact_title: "Contact",
    privacy_contact_body: "For privacy-related questions, contact us at: andreiiulianrobert@gmail.com",

    // Onboarding slides
    onboarding_slide1_title: "All your documents\nin one place",
    onboarding_slide1_desc: "Insurance, inspections, bills, contracts.\nNever forget an expiration date again.",
    onboarding_slide2_title: "Visual alerts\n& smart organization",
    onboarding_slide2_desc: "Color-coded urgency at a glance.\nAutomatic categorization and flexible sorting.",
    onboarding_slide3_title: "Never miss a deadline",
    onboarding_slide3_desc: "Get notified before expiration.\nDaily digest with your health score.",
    onboarding_slide4_title: "100% private",
    onboarding_slide4_desc: "Data stays on your phone.\nNo servers, no tracking, no ads.",
    onboarding_skip: "Skip",
    onboarding_next: "Continue",
    onboarding_start: "Get started",
    a11y_onboarding_dot: "Page {n} of {total}",
  },
};

// ─── Subtype Translations ───────────────────────────────

/**
 * Traducerile subtipurilor de documente.
 * În română, subtipurile se afișează exact cum sunt stocate (RCA, ITP, Rovignetă, etc.)
 * În engleză, avem traduceri specifice.
 */
const SUBTYPE_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    // Vehicule
    "Rovignetă": "Road vignette", "Impozit auto": "Vehicle tax", "Revizie service": "Service check",
    "Tahograf calibrare": "Tachograph calibration", "Licență transport": "Transport license",
    "Copie conformă": "Certified copy", "Verificare ADR": "ADR inspection",
    "Asigurare CMR": "CMR cargo insurance", "Carte verde": "Green card",
    // Locuință
    "Curent electric": "Electricity", "Gaz": "Gas", "Apă": "Water", "Telefon fix": "Landline",
    "Gunoi": "Waste collection", "Întreținere": "Maintenance fee", "Asigurare PAD": "PAD insurance",
    "Asigurare facultativă": "Optional insurance", "Contract chirie": "Rental contract",
    "Impozit locuință": "Property tax", "Revizie centrală": "Heating inspection",
    "Verificare gaze": "Gas inspection",
    // Personal
    "Permis conducere": "Driver's license", "Carte de identitate": "National ID",
    "Pașaport": "Passport", "Atestat profesional": "Professional certificate",
    "Card tahograf": "Tachograph card", "Fișă medicală": "Medical record",
    "Certificat ADR": "ADR certificate", "Asigurare viață": "Life insurance",
    "Asigurare sănătate": "Health insurance",
    "Aviz psihologic": "Psychological evaluation",
    "Contract de muncă": "Employment contract",
    // Firmă
    "Certificat înregistrare": "Registration certificate",
    "Certificat competență": "Competence certificate", "Autorizație": "Authorization",
    "Asigurare profesională": "Professional insurance", "Contract client": "Client contract",
    "Contract furnizor": "Supplier contract",
    // Abonamente
    "Telefonie mobilă": "Mobile phone", "Streaming video": "Video streaming",
    "Streaming muzică": "Music streaming", "Domeniu web": "Web domain",
    "Licență software": "Software license",
    // Financiar
    "Rată credit": "Loan payment", "Rată leasing": "Leasing payment",
    "Impozit ANAF": "Tax office", "Amendă": "Fine", "Impozit venit": "Income tax",
    "CAS/CASS": "Social insurance contributions",
    "Declarație unică": "Annual tax declaration",
    "Altele": "Other",
  },
};

// ─── Translation Functions ──────────────────────────────

/**
 * Traduce o cheie în limba curentă.
 *
 * Suportă interpolări: t("ro", "key", { n: 5, title: "RCA" })
 * Lanț de fallback: limba cerută → română → cheia brută.
 */
export function t(lang: LanguageCode, key: string, params?: Record<string, string | number>): string {
  let str = TRANSLATIONS[lang]?.[key] || TRANSLATIONS.ro[key] || key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      str = str.replaceAll("{" + k + "}", String(v));
    });
  }
  return str;
}

/**
 * Traduce un subtip de document pentru afișare.
 * În română returnează textul exact (RCA, ITP, Rovignetă).
 * În engleză caută traducerea; dacă nu există, returnează textul original.
 */
export function translateSubtype(subtype: string, lang: LanguageCode): string {
  if (lang === "ro" || !SUBTYPE_TRANSLATIONS[lang]) return subtype;
  return SUBTYPE_TRANSLATIONS[lang][subtype] || subtype;
}
