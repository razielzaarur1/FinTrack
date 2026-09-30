'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Check,
  Tag,
  Sparkles,
} from 'lucide-react';
import { getIconSvgMarkup, normalizeCategorySvg } from '../../lib/svg-normalizer';

// Curated library of icons categorized with Hebrew and English keywords
export const ICON_CATALOG = [
  // ── תרומות וקהילה (Donations & Community) ──────────────────────────
  { name: 'HeartHandshake', labelHe: 'תרומה ולחיצת יד', category: 'donations', keywords: 'תרומה צדקה עזרה חסד מעשר donation charity help volunteer handshake' },
  { name: 'HandHeart', labelHe: 'לב ביד / חסד', category: 'donations', keywords: 'תרומה צדקה לב חסד נתינה מעשר charity donation gift give love' },
  { name: 'Heart', labelHe: 'לב', category: 'donations', keywords: 'לב אהבה תרומה בריאות רגש heart love donation' },
  { name: 'Gift', labelHe: 'מתנה', category: 'donations', keywords: 'מתנה הפתעה יום הולדת חג gift present birthday holiday' },
  { name: 'Users', labelHe: 'קהילה / קבוצה', category: 'donations', keywords: 'קהילה אנשים צוות קבוצה חברה community team users group' },
  { name: 'HelpingHand', labelHe: 'יד מושטת לעזרה', category: 'donations', keywords: 'עזרה סיוע חסד תמיכה help support aid' },
  { name: 'Ribbon', labelHe: 'סרט מודעות / עיטור', category: 'donations', keywords: 'סרט מודעות תרומה עמותה ribbon awareness cause' },
  { name: 'Award', labelHe: 'הוקרה ופרס', category: 'donations', keywords: 'פרס תעודה הוקרה כבוד award prize medal honor' },

  // ── פיננסים ותשלומים (Finance & Payments) ─────────────────────────
  { name: 'Wallet', labelHe: 'ארנק', category: 'finance', keywords: 'ארנק כסף מזומן תשלום wallet money cash pay' },
  { name: 'CreditCard', labelHe: 'כרטיס אשראי', category: 'finance', keywords: 'אשראי כרטיס תשלום ויזה מאסטרקארד credit card payment' },
  { name: 'Banknote', labelHe: 'שטר כסף', category: 'finance', keywords: 'שטר מזומן כסף תשלום banknote cash bill money' },
  { name: 'DollarSign', labelHe: 'מטבע / דולר', category: 'finance', keywords: 'מטבע דולר כסף סכום dollar currency money' },
  { name: 'Coins', labelHe: 'מטבעות / דמי כיס', category: 'finance', keywords: 'מטבעות כסף קטן דמי כיס חיסכון coins change savings' },
  { name: 'Receipt', labelHe: 'קבלה / חשבונית', category: 'finance', keywords: 'קבלה חשבונית תשלום מס receipt invoice bill tax' },
  { name: 'PiggyBank', labelHe: 'קופת חיסכון', category: 'finance', keywords: 'חיסכון קופה השקעה עתיד piggy bank savings invest' },
  { name: 'Landmark', labelHe: 'בנק / מוסד', category: 'finance', keywords: 'בנק מוסד ממשלה הלוואה משכנתא bank government loan institution' },
  { name: 'TrendingUp', labelHe: 'צמיחה / רווחים', category: 'finance', keywords: 'רווח השקעה עלייה מניות growth profit invest stocks' },
  { name: 'TrendingDown', labelHe: 'ירידה / הפסד', category: 'finance', keywords: 'ירידה הוצאה הפסד loss down expense' },
  { name: 'Percent', labelHe: 'אחוזים / ריבית', category: 'finance', keywords: 'אחוז ריבית הנחה עמלה percent interest discount fee' },
  { name: 'Scale', labelHe: 'מאזניים / משפטי', category: 'finance', keywords: 'מאזניים משפט צדק איזון law balance legal justice' },

  // ── בית ודיור (Home & Living) ────────────────────────────────────
  { name: 'Home', labelHe: 'בית / שכר דירה', category: 'home', keywords: 'בית דירה שכר דירה משכנתא ועד בית home house rent apartment' },
  { name: 'Building', labelHe: 'בניין / נדל״ן', category: 'home', keywords: 'בניין עיר נדלן משרד building office real estate' },
  { name: 'Building2', labelHe: 'מגדל מגורים', category: 'home', keywords: 'מגדל בניין דירות tower apartment building' },
  { name: 'Key', labelHe: 'מפתח / כניסה', category: 'home', keywords: 'מפתח כניסה דירה בית key lock access' },
  { name: 'Bed', labelHe: 'מיטה / ריהוט', category: 'home', keywords: 'מיטה שינה חדר שינה ריהוט bed sleep furniture' },
  { name: 'Sofa', labelHe: 'ספה / סלון', category: 'home', keywords: 'ספה סלון ריהוט אירוח sofa couch living room' },
  { name: 'Bath', labelHe: 'מקלחת / היגיינה', category: 'home', keywords: 'מקלחת אמבטיה היגיינה ניקיון bath shower hygiene' },
  { name: 'Wrench', labelHe: 'כלי עבודה / תחזוקה', category: 'home', keywords: 'תיקונים תחזוקה אינסטלטור שיפוץ wrench repair plumbing tools' },
  { name: 'Hammer', labelHe: 'פטיש / שיפוצים', category: 'home', keywords: 'שיפוץ בניה פטיש עבודה hammer construct renovate' },
  { name: 'Zap', labelHe: 'חשמל / אנרגיה', category: 'home', keywords: 'חשמל חברת חשמל אנרגיה אור electricity power energy electric' },
  { name: 'Droplet', labelHe: 'מים / תאגיד מים', category: 'home', keywords: 'מים חשבון מים ברז water bill utility' },
  { name: 'Flame', labelHe: 'גז / חימום', category: 'home', keywords: 'גז חשבון גז חימום בישול gas bill heat cook' },
  { name: 'Wifi', labelHe: 'אינטרנט / תקשורת', category: 'home', keywords: 'אינטרנט וייפיי סיבים תקשורת wifi internet broadband' },
  { name: 'Lightbulb', labelHe: 'תאורה / רעיון', category: 'home', keywords: 'תאורה נורה רעיון חשמל lamp lightbulb idea' },

  // ── תחבורה ורכב (Transport & Vehicles) ──────────────────────────
  { name: 'Car', labelHe: 'רכב / נסיעות', category: 'transport', keywords: 'רכב אוטו מכונית נסיעה ביטוח car vehicle auto drive' },
  { name: 'Fuel', labelHe: 'דלק / תחנת דלק', category: 'transport', keywords: 'דלק סולר בנזין תדלוק fuel gas petrol station' },
  { name: 'Bus', labelHe: 'אוטובוס / תחב״צ', category: 'transport', keywords: 'אוטובוס תחבורה ציבורית רב קו bus public transport' },
  { name: 'Train', labelHe: 'רכבת', category: 'transport', keywords: 'רכבת ישראל תחבורה נסיעה train transit' },
  { name: 'Plane', labelHe: 'טיסות / חו״ל', category: 'transport', keywords: 'טיסה טיסות חו״ל חופשה נופש plane flight airport travel' },
  { name: 'Bike', labelHe: 'אופניים / קורקינט', category: 'transport', keywords: 'אופניים קורקינט רכיבה ספורט bike bicycle scooter' },
  { name: 'ParkingSquare', labelHe: 'חניה', category: 'transport', keywords: 'חניה פנגו סלופארק חניון parking pango cellopark' },
  { name: 'Navigation', labelHe: 'ניווט / כביש אגרה', category: 'transport', keywords: 'ניווט דרך כביש 6 מנהרות toll road navigation' },

  // ── אוכל וקניות (Food & Shopping) ──────────────────────────────
  { name: 'ShoppingCart', labelHe: 'סופרמרקט / קניות', category: 'food', keywords: 'סופר סופרמרקט מכולת קניות עגלה groceries supermarket food cart' },
  { name: 'ShoppingBag', labelHe: 'שופינג / קניון', category: 'food', keywords: 'שופינג קניות בגדים קניון shopping bag mall clothes' },
  { name: 'Utensils', labelHe: 'מסעדות / אוכל', category: 'food', keywords: 'מסעדה אוכל ארוחה סכו״ם restaurant dining food eat' },
  { name: 'Coffee', labelHe: 'קפה / בתי קפה', category: 'food', keywords: 'קפה בית קפה מאפה בוקר coffee cafe breakfast' },
  { name: 'Pizza', labelHe: 'פיצה / פאסט פוד', category: 'food', keywords: 'פיצה מזון מהיר משלוח takeaway pizza fast food' },
  { name: 'Apple', labelHe: 'פירות וירקות / בריא', category: 'food', keywords: 'פירות ירקות בריאות תזונה fruit vegetables healthy' },
  { name: 'Cake', labelHe: 'עוגות / ימי הולדת', category: 'food', keywords: 'עוגה יום הולדת ממתקים קינוח cake dessert birthday' },
  { name: 'Wine', labelHe: 'יין / אלכוהול / בילוי', category: 'food', keywords: 'יין אלכוהול בר פאב בילוי wine alcohol drink bar' },
  { name: 'Beer', labelHe: 'בירה / יציאות', category: 'food', keywords: 'בירה בר פאב אלכוהול beer pub drinks' },
  { name: 'Store', labelHe: 'חנות / בית עסק', category: 'food', keywords: 'חנות קיוסק עסק קניה store retail shop' },
  { name: 'Package', labelHe: 'משלוחים / חבילות', category: 'food', keywords: 'משלוח חבילה דואר אמזון עליאקספרס delivery package mail order' },
  { name: 'Shirt', labelHe: 'הלבשה / ביגוד', category: 'food', keywords: 'בגדים ביגוד אופנה חולצה נעליים clothes fashion shirt shoes' },

  // ── בריאות וספורט (Health & Fitness) ─────────────────────────────
  { name: 'HeartPulse', labelHe: 'רפואה / בריאות', category: 'health', keywords: 'בריאות קופת חולים רופא ביטוח רפואי health doctor medical pulse' },
  { name: 'Stethoscope', labelHe: 'רופא / קליניקה', category: 'health', keywords: 'רופא מרפאה בדיקה בית חולים doctor clinic medical hospital' },
  { name: 'Pill', labelHe: 'תרופות / בית מרקחת', category: 'health', keywords: 'תרופות בית מרקחת סופר פארם גלולה pharmacy medicine pill' },
  { name: 'Dumbbell', labelHe: 'חדר כושר / אימון', category: 'health', keywords: 'כושר משקולות אימון ספורט gym fitness workout exercise dumbbell' },
  { name: 'Activity', labelHe: 'פעילות ספורטיבית', category: 'health', keywords: 'ספורט פעילות ריצה כושר activity sports run' },
  { name: 'Trophy', labelHe: 'הישגים וספורט', category: 'health', keywords: 'גביע ספורט תחרות הישג trophy win sports prize' },
  { name: 'Smile', labelHe: 'רווחה / טיפולים', category: 'health', keywords: 'פסיכולוג טיפול נפש חיוך רווחה wellness therapy smile' },

  // ── חינוך ומשפחה (Education & Family) ───────────────────────────
  { name: 'GraduationCap', labelHe: 'לימודים / תואר', category: 'education', keywords: 'לימודים תואר אוניברסיטה מכללה קורס education degree university college' },
  { name: 'BookOpen', labelHe: 'ספרים / קורסים', category: 'education', keywords: 'ספר קריאה קורס לימוד ידע book read course learn' },
  { name: 'School', labelHe: 'בית ספר / מוסד לימוד', category: 'education', keywords: 'בית ספר גן כיתה מורה school kindergarten class' },
  { name: 'Baby', labelHe: 'תינוק / ילדים', category: 'education', keywords: 'תינוק פעוט ילדים חיתולים מעון baby child toddler daycare' },
  { name: 'Dog', labelHe: 'חיות מחמד / כלב', category: 'education', keywords: 'חיות מחמד כלב וטרינר מזון חיות pet dog vet animal' },
  { name: 'Cat', labelHe: 'חתול / חיות מחמד', category: 'education', keywords: 'חתול חיות מחמד וטרינר cat pet animal' },
  { name: 'Palette', labelHe: 'אמנות / יצירה / חוגים', category: 'education', keywords: 'חוג אמנות יצירה ציור art hobby craft' },
  { name: 'Music', labelHe: 'מוזיקה / שיעורי נגינה', category: 'education', keywords: 'מוזיקה נגינה כלי נגינה הופעה music instrument song' },

  // ── עבודה ועסקים (Work & Business) ──────────────────────────────
  { name: 'Briefcase', labelHe: 'עבודה / קריירה', category: 'work', keywords: 'עבודה עסק משכורת קריירה תיק work job business salary career' },
  { name: 'Laptop', labelHe: 'מחשב / הייטק', category: 'work', keywords: 'מחשב הייטק תוכנה עבודה מרחוק laptop computer tech software' },
  { name: 'Monitor', labelHe: 'מסך / ציוד משרדי', category: 'work', keywords: 'מסך משרד ציוד מחשוב monitor office desk' },
  { name: 'Phone', labelHe: 'טלפון / סלולר', category: 'work', keywords: 'סלולר טלפון חשבון סלולרי שיחות mobile phone cellular call' },
  { name: 'Mail', labelHe: 'דואר / הודעות', category: 'work', keywords: 'דואר מייל אימייל מכתב mail email letter message' },
  { name: 'FileText', labelHe: 'מסמכים / חוזים', category: 'work', keywords: 'חוזה מסמך טופס רואה חשבון contract document form tax' },

  // ── פנאי ובידור (Leisure & Tech) ─────────────────────────────────
  { name: 'Film', labelHe: 'קולנוע / סטרימינג', category: 'leisure', keywords: 'קולנוע סרט נטפליקס סדרות טלוויזיה cinema movie netflix stream film' },
  { name: 'Gamepad2', labelHe: 'משחקים / גיימינג', category: 'leisure', keywords: 'משחק גיימינג פלייסטיישן אקסבוקס gaming games play console' },
  { name: 'Ticket', labelHe: 'כרטיסים / הופעות', category: 'leisure', keywords: 'הופעה כרטיס תיאטרון מופע הצגה ticket concert show event' },
  { name: 'Tent', labelHe: 'קמפינג / טיולים', category: 'leisure', keywords: 'קמפינג טיול טבע לינת שטח tent camp hike outdoor' },
  { name: 'Sun', labelHe: 'חופשה / קיץ / נופש', category: 'leisure', keywords: 'חופש קיץ שמש ים נופש sun summer holiday beach vacation' },
  { name: 'Headphones', labelHe: 'אוזניות / ספוטיפיי', category: 'leisure', keywords: 'אוזניות מוזיקה ספוטיפיי פודקאסט headphones music spotify podcast' },

  // ── כללי ומערכת (General) ─────────────────────────────────────────
  { name: 'Sparkles', labelHe: 'מיוחד / מועדף', category: 'general', keywords: 'מיוחד כוכבים יופי ניצוץ sparkles special magic' },
  { name: 'ShieldCheck', labelHe: 'ביטוח / הגנה', category: 'general', keywords: 'ביטוח הגנה אבטחה בטיחות insurance security shield safe' },
  { name: 'Lock', labelHe: 'מנעול / סודי', category: 'general', keywords: 'מנעול נעילה אבטחה סוד lock secure private' },
  { name: 'Tag', labelHe: 'תגית כללית', category: 'general', keywords: 'תגית כללי שונות סיווג tag label other' },
];

export const ICON_CATEGORIES = [
  { id: 'all', labelHe: 'הכל' },
  { id: 'donations', labelHe: 'תרומות וקהילה' },
  { id: 'finance', labelHe: 'פיננסים ותשלומים' },
  { id: 'home', labelHe: 'בית ודיור' },
  { id: 'transport', labelHe: 'רכב ותחבורה' },
  { id: 'food', labelHe: 'אוכל וקניות' },
  { id: 'health', labelHe: 'בריאות וספורט' },
  { id: 'education', labelHe: 'חינוך ומשפחה' },
  { id: 'work', labelHe: 'עבודה ועסקים' },
  { id: 'leisure', labelHe: 'פנאי ובידור' },
  { id: 'general', labelHe: 'כללי ושונות' },
];

export default function IconPickerModal({
  isOpen,
  onClose,
  onSelectIcon,
  activeColor = '#6366f1',
  currentSvg = '',
}) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedIconName, setSelectedIconName] = useState(null);

  // Filter icons by search query and category tab
  const filteredIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ICON_CATALOG.filter((item) => {
      // Category filter
      if (activeTab !== 'all' && item.category !== activeTab) {
        return false;
      }
      // Search filter
      if (!q) return true;
      const matchName = item.name.toLowerCase().includes(q);
      const matchLabel = item.labelHe.toLowerCase().includes(q);
      const matchKeywords = item.keywords.toLowerCase().includes(q);
      return matchName || matchLabel || matchKeywords;
    });
  }, [search, activeTab]);

  if (!isOpen) return null;

  const handleChoose = (icon) => {
    setSelectedIconName(icon.name);
    const rawSvg = getIconSvgMarkup(icon.name);
    const normalized = normalizeCategorySvg(rawSvg);
    onSelectIcon({
      iconName: icon.name,
      labelHe: icon.labelHe,
      svg: normalized,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150" dir="rtl">
      <div className="w-full max-w-2xl bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border rounded-2xl p-5 shadow-2xl space-y-4 max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-dark-border/50 light:border-light-border/50">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center p-1.5 shadow-2xs"
              style={{ backgroundColor: `${activeColor}20`, color: activeColor }}
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-dark-text light:text-light-text">
                גלריית אייקונים לקטגוריה
              </h3>
              <p className="text-xs text-dark-text-muted light:text-light-text-muted">
                בחר אייקון תקני מתוך המבחר הרחב. הקווים מעוצבים בעובי אחיד של 2px בהתאמה מושלמת למערכת.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-dark-text-muted light:text-light-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חפש אייקון בעברית או באנגלית... (למשל: תרומה, רכב, דלק, אוכל, ספורט, כושר, חשמל, בית)"
            className="w-full pr-9 pl-8 py-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:border-brand-primary focus:outline-none transition-all"
            autoFocus
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-text-muted hover:text-dark-text p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-dark-border">
          {ICON_CATEGORIES.map((tab) => {
            const count = tab.id === 'all'
              ? ICON_CATALOG.length
              : ICON_CATALOG.filter((i) => i.category === tab.id).length;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-brand-primary text-white shadow-xs'
                    : 'bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                <span>{tab.labelHe}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20' : 'bg-black/10 dark:bg-white/10'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Icon Grid (Scrollable) */}
        <div className="flex-1 overflow-y-auto min-h-[280px] max-h-[380px] pr-1">
          {filteredIcons.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-dark-text-muted light:text-light-text-muted space-y-2">
              <Search className="w-8 h-8 opacity-30" />
              <p className="text-sm font-semibold">לא נמצאו אייקונים תואמים לחיפוש "{search}"</p>
              <p className="text-xs">נסה מילת חיפוש כללית יותר או בחר קטגוריה אחרת</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {filteredIcons.map((icon) => {
                const svgMarkup = normalizeCategorySvg(getIconSvgMarkup(icon.name));
                return (
                  <button
                    key={icon.name}
                    type="button"
                    onClick={() => handleChoose(icon)}
                    className="p-3 rounded-xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated hover:border-brand-primary/60 transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer text-center relative"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center p-2 transition-transform group-hover:scale-110 shadow-2xs"
                      style={{ backgroundColor: `${activeColor}18`, color: activeColor }}
                      dangerouslySetInnerHTML={{ __html: svgMarkup }}
                    />
                    <div className="w-full">
                      <span className="text-xs font-semibold text-dark-text light:text-light-text block truncate" title={icon.labelHe}>
                        {icon.labelHe}
                      </span>
                      <span className="text-[10px] text-dark-text-muted light:text-light-text-muted block truncate font-mono opacity-60">
                        {icon.name}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-dark-border/50 light:border-light-border/50 flex items-center justify-between text-xs text-dark-text-muted light:text-light-text-muted">
          <span>
            נמצאו {filteredIcons.length} אייקונים זמינים
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text hover:bg-dark-surface-elevated transition-colors cursor-pointer"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
