/**
 * Safe keyword matching shared by the classifiers and statistics.
 *
 * Short keywords ("cal", "max", "מקס", "כאל", "ויזה", "be", "ev", "מים", "hot"...) must match a whole
 * word - otherwise "Medical", "Local", "Maxim" or "MAX STOCK purchase" are mistaken for credit-card
 * billing rows and silently disappear from the statistics. Hebrew prefixes (ב/ל/ה/מ/ש/ו/כ) are
 * tolerated. Longer keywords keep plain substring matching. `text` must already be lower-case.
 */
const regexCache = new Map();
const HEBREW_PREFIXES = '[בלהמשוכ]{0,2}';
const WORD_EDGE = '[^\\u0590-\\u05FFa-z0-9]';

export function termMatches(text, term) {
  const t = String(term || '').toLowerCase().trim();
  if (!t || typeof text !== 'string') return false;
  const isHebrew = /[\u0590-\u05FF]/.test(t);
  const needsBoundary = isHebrew ? t.length <= 4 : t.length <= 5;
  if (!needsBoundary) return text.includes(t);

  let re = regexCache.get(t);
  if (!re) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`(^|${WORD_EDGE})${isHebrew ? HEBREW_PREFIXES : ''}${escaped}(?=$|${WORD_EDGE})`, 'i');
    regexCache.set(t, re);
  }
  return re.test(text);
}
