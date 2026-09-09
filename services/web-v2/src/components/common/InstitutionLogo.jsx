'use client';

import React from 'react';

/**
 * Authentic vector SVG logos for Israeli banks and credit card companies.
 */
export default function InstitutionLogo({ bankCompany = '', size = 36, className = '' }) {
  const comp = (bankCompany || '').toLowerCase().trim();

  // 1. Max (מקס)
  if (comp.includes('max')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-1 ${className}`}
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
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#ffffff] border border-slate-200 dark:border-slate-700 p-1 ${className}`}
        style={{ width: size, height: size }}
        title="ישראכרט"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Left Red Diamond / Square */}
          <rect x="18" y="24" width="40" height="40" rx="8" fill="#e11d48" transform="rotate(15 38 44)" />
          {/* Right Navy Blue Diamond / Square with overlap */}
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
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-gradient-to-br from-[#e11d48] to-[#ea580c] p-1 ${className}`}
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

  // 4. Bank Hapoalim (בנק הפועלים)
  if (comp.includes('hapoalim') || comp.includes('פועלים')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#dc2626] p-1 ${className}`}
        style={{ width: size, height: size }}
        title="בנק הפועלים"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          {/* Red square with white stylized geometric cut */}
          <rect x="15" y="15" width="70" height="70" rx="10" fill="#dc2626" />
          <path d="M26 74L74 26H56L26 56V74Z" fill="#ffffff" />
          <rect x="58" y="58" width="16" height="16" rx="2" fill="#ffffff" />
        </svg>
      </div>
    );
  }

  // 5. Bank Leumi (בנק לאומי)
  if (comp.includes('leumi') || comp.includes('לאומי')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#1d4ed8] p-1 ${className}`}
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

  // 6. Bank Discount (בנק דיסקונט)
  if (comp.includes('discount') || comp.includes('דיסקונט')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#059669] p-1 ${className}`}
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

  // 7. Mizrahi Tefahot (בנק מזרחי טפחות)
  if (comp.includes('mizrahi') || comp.includes('מזרחי')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#ea580c] p-1 ${className}`}
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

  // 8. Mercantile (מרכנתיל)
  if (comp.includes('mercantile') || comp.includes('מרכנתיל')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#0d9488] p-1 ${className}`}
        style={{ width: size, height: size }}
        title="בנק מרכנתיל"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <path d="M22 75V25L50 55L78 25V75" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  // 9. Otsar Hahayal / FIBI (הבינלאומי / אוצר החייל)
  if (comp.includes('otsar') || comp.includes('fibi') || comp.includes('בינלאומי') || comp.includes('החייל')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#1e3a8a] p-1 ${className}`}
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

  // 10. OneZero (וואן זירו)
  if (comp.includes('onezero') || comp.includes('one') || comp.includes('zero')) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-[#090d16] border border-cyan-500/30 p-1 ${className}`}
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

  // Fallback for custom / other accounts
  return (
    <div 
      className={`inline-flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border light:border-light-border font-bold text-xs uppercase ${className}`}
      style={{ width: size, height: size }}
      title={bankCompany || 'Account'}
    >
      {(bankCompany || 'TX').slice(0, 3)}
    </div>
  );
}
