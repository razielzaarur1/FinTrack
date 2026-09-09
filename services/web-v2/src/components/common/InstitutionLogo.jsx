'use client';

import React from 'react';

/**
 * Authentic vector SVG logos for Israeli banks, credit cards, cibus/food cards, and provident/pension funds.
 */
export default function InstitutionLogo({ institution = '', bankCompany = '', size = 36, className = '' }) {
  const comp = (bankCompany || institution || '').toLowerCase().trim();

  // 1. Max (מקס)
  if (comp.includes('max')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="Max"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <rect width="100" height="100" rx="20" fill="url(#maxGrad)" />
          <path 
            d="M20 62L34 38L48 62L62 38L76 62" 
            stroke="#ffffff" 
            strokeWidth="11" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
          <circle cx="78" cy="38" r="6" fill="#38bdf8" />
          <defs>
            <linearGradient id="maxGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0369a1" />
              <stop offset="1" stopColor="#0284c7" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  // 2. Isracard (ישראכרט)
  if (comp.includes('isracard') || comp.includes('ישראכרט')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#ffffff] border border-slate-200 dark:border-slate-700 p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="ישראכרט"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <rect x="18" y="24" width="40" height="40" rx="8" fill="#e11d48" transform="rotate(15 38 44)" />
          <rect x="42" y="36" width="40" height="40" rx="8" fill="#1e3a8a" transform="rotate(15 62 56)" fillOpacity="0.9" />
          <path d="M48 45L58 55" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 3. Cal / Visa Cal (כאל)
  if (comp.includes('cal') || comp.includes('כאל')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-gradient-to-br from-[#e11d48] to-[#ea580c] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="Cal"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <path 
            d="M30 68C22 60 22 40 32 30C42 20 60 22 70 32" 
            stroke="#ffffff" 
            strokeWidth="11" 
            strokeLinecap="round" 
          />
          <circle cx="58" cy="58" r="14" fill="#ffffff" />
          <circle cx="58" cy="58" r="7" fill="#ea580c" />
        </svg>
      </div>
    );
  }

  // 4. Amex / American Express (אמריקן אקספרס)
  if (comp.includes('amex') || comp.includes('american')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#002663] border border-[#006fcf]/40 p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="American Express"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <rect width="100" height="100" rx="20" fill="#006fcf" />
          <path d="M22 70L38 30H50L66 70H54L51 61H37L34 70H22ZM40 52H48L44 40L40 52Z" fill="#ffffff" />
          <path d="M68 45H82V55H68V45Z" fill="#a5f3fc" />
        </svg>
      </div>
    );
  }

  // 5. Bank Hapoalim (בנק הפועלים)
  if (comp.includes('hapoalim') || comp.includes('פועלים')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#dc2626] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="בנק הפועלים"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <rect x="15" y="15" width="70" height="70" rx="10" fill="#dc2626" />
          <path d="M26 74L74 26H56L26 56V74Z" fill="#ffffff" />
          <rect x="58" y="58" width="16" height="16" rx="2" fill="#ffffff" />
        </svg>
      </div>
    );
  }

  // 6. Bank Leumi (בנק לאומי)
  if (comp.includes('leumi') || comp.includes('לאומי')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#1d4ed8] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="בנק לאומי"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="32" stroke="#ffffff" strokeWidth="9" />
          <path d="M35 50H65M50 35V65" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
          <circle cx="50" cy="50" r="6" fill="#60a5fa" />
        </svg>
      </div>
    );
  }

  // 7. Bank Discount (בנק דיסקונט)
  if (comp.includes('discount') || comp.includes('דיסקונט')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#059669] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="בנק דיסקונט"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <rect x="20" y="20" width="60" height="60" rx="12" stroke="#ffffff" strokeWidth="8" />
          <circle cx="50" cy="45" r="11" fill="#ffffff" />
          <path d="M50 54V70M44 64H56" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 8. Mizrahi Tefahot (בנק מזרחי טפחות)
  if (comp.includes('mizrahi') || comp.includes('מזרחי')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#ea580c] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="בנק מזרחי טפחות"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <path 
            d="M25 50C25 35 40 25 55 30C70 35 75 55 65 68C55 80 35 75 30 65" 
            stroke="#ffffff" 
            strokeWidth="9" 
            strokeLinecap="round" 
          />
          <circle cx="48" cy="50" r="7" fill="#ffffff" />
        </svg>
      </div>
    );
  }

  // 9. Mercantile (מרכנתיל)
  if (comp.includes('mercantile') || comp.includes('מרכנתיל')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#0d9488] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="בנק מרכנתיל"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <path d="M22 75V25L50 55L78 25V75" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  // 10. Otsar Hahayal / FIBI / Beinleumi (הבינלאומי / אוצר החייל)
  if (comp.includes('otsar') || comp.includes('fibi') || comp.includes('בינלאומי') || comp.includes('החייל')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#1e3a8a] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="הבינלאומי / אוצר החייל"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <path d="M50 20L75 35V65L50 80L25 65V35L50 20Z" stroke="#ffffff" strokeWidth="7" fill="#1e40af" />
          <path d="M50 35V65M38 52H62" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 11. OneZero (וואן זירו)
  if (comp.includes('onezero') || comp.includes('one') || comp.includes('zero')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#090d16] border border-cyan-500/30 p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="OneZero"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <rect x="25" y="28" width="10" height="44" rx="5" fill="#06b6d4" />
          <circle cx="62" cy="50" r="18" stroke="#06b6d4" strokeWidth="8" />
        </svg>
      </div>
    );
  }

  // 12. Cibus / Pluxee (סיבוס)
  if (comp.includes('cibus') || comp.includes('סיבוס') || comp.includes('pluxee')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-gradient-to-br from-[#059669] via-[#0d9488] to-[#0284c7] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="סיבוס (Pluxee / Cibus)"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          {/* Stylized food card fork / plate & star */}
          <circle cx="50" cy="50" r="32" stroke="#ffffff" strokeWidth="6" strokeDasharray="6 4" />
          <path d="M35 38V54C35 59 40 62 45 62V72M55 72V62C60 62 65 59 65 54V38" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
          <path d="M50 38V62" stroke="#ffffff" strokeWidth="5" />
          <circle cx="50" cy="30" r="4" fill="#facc15" />
        </svg>
      </div>
    );
  }

  // 13. 10bis (תן ביס)
  if (comp.includes('10bis') || comp.includes('תן ביס') || comp.includes('tenbis')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#f97316] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="תן ביס (10bis)"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="36" fill="#ea580c" />
          <text x="50" y="58" fill="#ffffff" fontSize="24" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">10bis</text>
        </svg>
      </div>
    );
  }

  // 14. Altshuler Shaham (אלטשולר שחם)
  if (comp.includes('altshuler') || comp.includes('אלטשולר')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#1e293b] border border-amber-500/40 p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="אלטשולר שחם"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="34" stroke="#f59e0b" strokeWidth="5" />
          <path d="M35 68L50 28L65 68H55L50 52L45 68H35Z" fill="#f59e0b" />
          <circle cx="50" cy="40" r="3" fill="#ffffff" />
        </svg>
      </div>
    );
  }

  // 15. Meitav Dash (מיטב דש)
  if (comp.includes('meitav') || comp.includes('מיטב')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#0369a1] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="מיטב דש"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <path d="M25 65V35L50 55L75 35V65" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="50" cy="72" r="5" fill="#38bdf8" />
        </svg>
      </div>
    );
  }

  // 16. Migdal (מגדל)
  if (comp.includes('migdal') || comp.includes('מגדל')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#065f46] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="מגדל ביטוח ופנסיה"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <path d="M30 75V45L50 22L70 45V75H30Z" stroke="#ffffff" strokeWidth="7" fill="#047857" />
          <rect x="45" y="55" width="10" height="20" fill="#ffffff" />
          <circle cx="50" cy="38" r="4" fill="#a7f3d0" />
        </svg>
      </div>
    );
  }

  // 17. Harel (הראל)
  if (comp.includes('harel') || comp.includes('הראל')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#1e40af] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="הראל ביטוח ופיננסים"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <path d="M50 18L78 30V54C78 68 64 78 50 82C36 78 22 68 22 54V30L50 18Z" fill="#2563eb" stroke="#ffffff" strokeWidth="5" />
          <path d="M38 50L46 58L62 42" stroke="#ef4444" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  // 18. Phoenix (הפניקס)
  if (comp.includes('phoenix') || comp.includes('פניקס')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-gradient-to-br from-[#d97706] to-[#b45309] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="הפניקס"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <path d="M25 60C30 40 45 30 50 25C55 30 70 40 75 60C65 52 58 55 50 68C42 55 35 52 25 60Z" fill="#ffffff" />
          <circle cx="50" cy="32" r="5" fill="#fef08a" />
        </svg>
      </div>
    );
  }

  // 19. Menora (מנורה מבטחים)
  if (comp.includes('menora') || comp.includes('מנורה')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#0284c7] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="מנורה מבטחים"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <path d="M28 35V45C28 58 40 68 50 68C60 68 72 58 72 45V35" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
          <path d="M38 38V48C38 54 44 60 50 60C56 60 62 54 62 48V38" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
          <path d="M50 30V75M38 75H62" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 20. Clal (כלל)
  if (comp.includes('clal') || comp.includes('כלל')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#1d4ed8] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="כלל ביטוח ופנסיה"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="32" stroke="#ffffff" strokeWidth="8" />
          <path d="M60 38C50 32 38 40 38 50C38 60 50 68 62 62" stroke="#60a5fa" strokeWidth="8" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 21. Yelin Lapidot (ילין לפידות)
  if (comp.includes('yelin') || comp.includes('ילין')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#78350f] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="ילין לפידות"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="32" stroke="#fde68a" strokeWidth="5" />
          <path d="M35 34L50 52V70M65 34L50 52" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  // 22. More (מור השקעות)
  if (comp.includes('more') || comp.includes('מור')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#0f766e] p-1 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="מור השקעות"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <path d="M25 68V32L42 52L58 32L75 52V68" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  // 23. General Gemel / Provident (קופת גמל)
  if (comp.includes('gemel') || comp.includes('גמל') || comp.includes('השתלמות') || comp.includes('פנסיה')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-gradient-to-br from-emerald-600 to-teal-700 p-1.5 shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="קופת גמל / השתלמות"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="34" stroke="#ffffff" strokeWidth="6" />
          <path d="M30 65L45 48L58 56L72 35" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M60 35H72V47" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  // 24. Cash Wallet (ארנק מזומנים)
  if (comp.includes('wallet') || comp.includes('ארנק')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-gradient-to-br from-emerald-500 to-teal-600 p-2 text-white shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title="ארנק מזומנים"
      >
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
          <circle cx="17" cy="14" r="1.5" fill="currentColor" />
        </svg>
      </div>
    );
  }

  // Fallback for custom / other accounts
  return (
    <div 
      className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border light:border-light-border font-bold text-xs uppercase shrink-0 ${className}`}
      style={{ width: size, height: size }}
      title={bankCompany || institution || 'Account'}
    >
      {(bankCompany || institution || 'TX').slice(0, 3)}
    </div>
  );
}
