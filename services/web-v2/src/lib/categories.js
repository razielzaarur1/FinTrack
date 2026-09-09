// Category schema, icons, and color styles matching MoneyApp 1:1

export const CATEGORIES_DATA = {
  incomes: [
    { id: "inc_salary", name: "משכורת", icon: "Wallet", color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10 dark:bg-emerald-500/20", type: "income" },
    { id: "inc_allowance", name: "קצבה או מלגה", icon: "Landmark", color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10 dark:bg-emerald-500/20", type: "income" },
    { id: "inc_property", name: "הכנסה מנכס", icon: "Home", color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10 dark:bg-emerald-500/20", type: "income" },
    { id: "inc_business", name: "הכנסה מעסק", icon: "Briefcase", color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10 dark:bg-emerald-500/20", type: "income" },
    { id: "inc_dividends", name: "דיווידנדים ורווחים", icon: "TrendingUp", color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10 dark:bg-emerald-500/20", type: "income" },
    { id: "inc_misc", name: "הכנסות שונות", icon: "MoreHorizontal", color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10 dark:bg-emerald-500/20", type: "income" }
  ],
  expenses: [
    { 
      id: "exp_household", name: "משק בית", icon: "Home", color: "text-indigo-500 dark:text-indigo-400", bg: "bg-indigo-500/10 dark:bg-indigo-500/20", type: "expense", 
      subs: [
        { id: "hh_telecom", name: "טלפון ואינטרנט", icon: "Tv" }, 
        { id: "hh_mortgage", name: "משכנתא", icon: "Key" }, 
        { id: "hh_rent", name: "דמי שכירות", icon: "Home" }, 
        { id: "hh_taxes", name: "ארנונה", icon: "Landmark" }, 
        { id: "hh_committee", name: "ועד בית", icon: "Users" }, 
        { id: "hh_water", name: "מים", icon: "Droplet" }, 
        { id: "hh_gas", name: "גז והסקה", icon: "Flame" }, 
        { id: "hh_electricity", name: "חשמל", icon: "Zap" }, 
        { id: "hh_insurance", name: "ביטוח דירה", icon: "Shield" }, 
        { id: "hh_maintenance", name: "אחזקת בית", icon: "Hammer" }, 
        { id: "hh_cleaning", name: "ניקיון וכביסה", icon: "Sparkles" }, 
        { id: "hh_gardening", name: "גינון ונוי", icon: "Flower" }, 
        { id: "hh_misc", name: "משק בית - שונות", icon: "MoreHorizontal" }
      ] 
    },
    { 
      id: "exp_shopping", name: "עושים קניות", icon: "ShoppingBag", color: "text-pink-500 dark:text-pink-400", bg: "bg-pink-500/10 dark:bg-pink-500/20", type: "expense", 
      subs: [
        { id: "shop_supermarket", name: "סופר ומכולת", icon: "ShoppingBag" }, 
        { id: "shop_furniture", name: "ריהוט לבית", icon: "Sofa" }, 
        { id: "shop_electronics", name: "אלקטרוניקה", icon: "Monitor" }, 
        { id: "shop_clothing", name: "בגדים והנעלה", icon: "Shirt" }, 
        { id: "shop_jewelry", name: "תכשיטים ושעונים", icon: "Watch" }, 
        { id: "shop_tobacco", name: "טבק ועישון", icon: "Wind" }, 
        { id: "shop_misc", name: "קניות - שונות", icon: "MoreHorizontal" }
      ] 
    },
    { 
      id: "exp_transport", name: "רכב ותחבורה", icon: "Car", color: "text-orange-500 dark:text-orange-400", bg: "bg-orange-500/10 dark:bg-orange-500/20", type: "expense", 
      subs: [
        { id: "trans_fuel", name: "דלק וטעינה", icon: "Fuel" }, 
        { id: "trans_rental", name: "השכרת רכב", icon: "Car" }, 
        { id: "trans_public", name: "תחבורה ציבורית", icon: "Bus" }, 
        { id: "trans_parking", name: "חנייה", icon: "Map" }, 
        { id: "trans_fines", name: "קנסות", icon: "ScrollText" }, 
        { id: "trans_garage", name: "מוסך ואחזקה", icon: "Wrench" }, 
        { id: "trans_tolls", name: "כבישי אגרה", icon: "Route" }, 
        { id: "trans_insurance", name: "ביטוח רכב", icon: "Shield" }, 
        { id: "trans_misc", name: "תחבורה - שונות", icon: "MoreHorizontal" }
      ] 
    },
    { 
      id: "exp_health", name: "בריאות וטיפוח", icon: "Heart", color: "text-rose-500 dark:text-rose-400", bg: "bg-rose-500/10 dark:bg-rose-500/20", type: "expense", 
      subs: [
        { id: "hlth_alternative", name: "רפואה משלימה", icon: "Activity" }, 
        { id: "hlth_services", name: "ייעוץ וטיפול", icon: "Stethoscope" }, 
        { id: "hlth_insurance", name: "ביטוחי בריאות", icon: "HeartPulse" }, 
        { id: "hlth_dental", name: "רפואת שיניים", icon: "Activity" }, 
        { id: "hlth_optical", name: "אופטיקה", icon: "Eye" }, 
        { id: "hlth_pharmacy", name: "בתי מרקחת", icon: "Pill" }, 
        { id: "hlth_beauty", name: "טיפולי יופי", icon: "Scissors" }, 
        { id: "hlth_fitness", name: "כושר", icon: "Dumbbell" }, 
        { id: "hlth_misc", name: "בריאות - שונות", icon: "MoreHorizontal" }
      ] 
    },
    { 
      id: "exp_family", name: "משפחה והשכלה", icon: "Users", color: "text-teal-500 dark:text-teal-400", bg: "bg-teal-500/10 dark:bg-teal-500/20", type: "expense", 
      subs: [
        { id: "fam_school", name: "גן ובית ספר", icon: "Baby" }, 
        { id: "fam_higher_ed", name: "השכלה גבוהה", icon: "GraduationCap" }, 
        { id: "fam_activities", name: "חוגים וקייטנות", icon: "Tent" }, 
        { id: "fam_babysitter", name: "בייביסיטר", icon: "User" }, 
        { id: "fam_toys", name: "משחקים ודמי כיס", icon: "Gamepad2" }, 
        { id: "fam_baby", name: "מוצרים לגיל הרך", icon: "Package" }, 
        { id: "fam_support", name: "תמיכה ומזונות", icon: "HandHeart" }, 
        { id: "fam_pets", name: "חיות מחמד", icon: "Dog" }, 
        { id: "fam_misc", name: "משפחה - שונות", icon: "MoreHorizontal" }
      ] 
    },
    { 
      id: "exp_leisure", name: "פנאי ותרבות", icon: "Ticket", color: "text-purple-500 dark:text-purple-400", bg: "bg-purple-500/10 dark:bg-purple-500/20", type: "expense", 
      subs: [
        { id: "leis_shows", name: "הופעות וקולנוע", icon: "Ticket" }, 
        { id: "leis_gifts", name: "מתנות ואירועים", icon: "Gift" }, 
        { id: "leis_music", name: "מוזיקה וקריאה", icon: "Music" }, 
        { id: "leis_workshops", name: "סדנאות", icon: "BookOpen" }, 
        { id: "leis_hobbies", name: "תחביבים וספורט", icon: "Bike" }, 
        { id: "leis_sports", name: "אירועי ספורט", icon: "Trophy" }, 
        { id: "leis_misc", name: "פנאי - שונות", icon: "MoreHorizontal" }
      ] 
    },
    { 
      id: "exp_dining", name: "אוכלים בחוץ", icon: "Utensils", color: "text-amber-500 dark:text-amber-400", bg: "bg-amber-500/10 dark:bg-amber-500/20", type: "expense", 
      subs: [
        { id: "dine_fastfood", name: "מזון מהיר ומשלוחים", icon: "Pizza" }, 
        { id: "dine_restaurants", name: "מסעדות ופאבים", icon: "Coffee" }, 
        { id: "dine_misc", name: "אוכלים בחוץ - שונות", icon: "Utensils" }
      ] 
    },
    { 
      id: "exp_travel", name: "חופשות וטיולים", icon: "Plane", color: "text-sky-500 dark:text-sky-400", bg: "bg-sky-500/10 dark:bg-sky-500/20", type: "expense", 
      subs: [
        { id: "trvl_flights", name: "טיסות", icon: "Plane" }, 
        { id: "trvl_attractions", name: "אטרקציות", icon: "Map" }, 
        { id: "trvl_accommodation", name: "לינה", icon: "Bed" }, 
        { id: "trvl_misc", name: "חופשות - שונות", icon: "MoreHorizontal" }
      ] 
    },
    { 
      id: "exp_business", name: "שירותים עיסקיים", icon: "Briefcase", color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-500/10 dark:bg-slate-500/20", type: "expense", 
      subs: [
        { id: "biz_delivery", name: "דואר ומשלוחים", icon: "Mail" }, 
        { id: "biz_legal", name: "הנה\"ח ומשפטי", icon: "FileText" }, 
        { id: "biz_marketing", name: "שיווק ופרסום", icon: "Printer" }, 
        { id: "biz_consulting", name: "ייעוץ והשתלמויות", icon: "Lightbulb" }, 
        { id: "biz_misc", name: "עסקי - שונות", icon: "MoreHorizontal" }
      ] 
    },
    { 
      id: "exp_financial", name: "שירותים פיננסיים", icon: "Landmark", color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10 dark:bg-cyan-500/20", type: "expense", 
      subs: [
        { id: "fin_loans", name: "פירעון הלוואה", icon: "Percent" }, 
        { id: "fin_fees", name: "עמלות", icon: "TrendingDown" }, 
        { id: "fin_interest", name: "תשלומי ריביות", icon: "TrendingDown" }, 
        { id: "fin_misc", name: "פיננסי - שונות", icon: "MoreHorizontal" }
      ] 
    },
    { 
      id: "exp_misc", name: "שונות", icon: "MoreHorizontal", color: "text-gray-500 dark:text-gray-400", bg: "bg-gray-500/10 dark:bg-gray-500/20", type: "expense", 
      subs: [
        { id: "misc_taxes", name: "מיסים ורשויות", icon: "Landmark" }, 
        { id: "misc_religion", name: "דת ותרומות", icon: "HandHeart" }, 
        { id: "misc_gambling", name: "הימורים", icon: "Trophy" }, 
        { id: "misc_uncategorized", name: "ללא סיווג", icon: "MoreHorizontal" }, 
        { id: "misc_other", name: "שונות", icon: "MoreHorizontal" }
      ] 
    }
  ]
};

const DEFAULT_CATEGORY = { 
  id: "misc_uncategorized", 
  name: "ללא סיווג", 
  icon: "Tag", 
  color: "text-slate-500 dark:text-slate-400", 
  bg: "bg-slate-500/10 dark:bg-slate-500/20", 
  type: "expense" 
};

/**
 * Returns main and sub category details matching by ID or Hebrew name.
 */
export function getCategoryDetails(term) {
  if (!term || typeof term !== 'string') {
    return { mainCat: DEFAULT_CATEGORY, subCat: DEFAULT_CATEGORY };
  }

  const clean = term.trim().toLowerCase();

  // 1. Check Incomes
  for (const inc of CATEGORIES_DATA.incomes) {
    if (inc.id.toLowerCase() === clean || inc.name.toLowerCase() === clean) {
      return { mainCat: inc, subCat: inc };
    }
  }

  // 2. Check Expenses & Subcategories
  for (const exp of CATEGORIES_DATA.expenses) {
    if (exp.id.toLowerCase() === clean || exp.name.toLowerCase() === clean) {
      return { mainCat: exp, subCat: exp };
    }

    if (exp.subs) {
      for (const sub of exp.subs) {
        if (sub.id.toLowerCase() === clean || sub.name.toLowerCase() === clean) {
          return { mainCat: exp, subCat: sub };
        }
      }
    }
  }

  // 3. Fallback fuzzy check on common terms
  if (clean.includes('סופר') || clean.includes('מכולת') || clean.includes('קניות')) {
    const shop = CATEGORIES_DATA.expenses.find(e => e.id === 'exp_shopping');
    return { mainCat: shop, subCat: shop?.subs?.[0] || shop };
  }
  if (clean.includes('מסעד') || clean.includes('אוכל') || clean.includes('קפה')) {
    const dine = CATEGORIES_DATA.expenses.find(e => e.id === 'exp_dining');
    return { mainCat: dine, subCat: dine?.subs?.[0] || dine };
  }
  if (clean.includes('דלק') || clean.includes('רכב') || clean.includes('תחבור')) {
    const trans = CATEGORIES_DATA.expenses.find(e => e.id === 'exp_transport');
    return { mainCat: trans, subCat: trans?.subs?.[0] || trans };
  }
  if (clean.includes('משכורת') || clean.includes('שכר')) {
    const salary = CATEGORIES_DATA.incomes.find(i => i.id === 'inc_salary');
    return { mainCat: salary, subCat: salary };
  }

  return { mainCat: DEFAULT_CATEGORY, subCat: DEFAULT_CATEGORY };
}
