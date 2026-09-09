/**
 * Generates a comprehensive Design System Prompt & SVG Specification file
 * for FinTrack category and subcategory icons.
 */
export function generateDesignSystemPrompt() {
  return `# FinTrack Design System: Category Icon & SVG Specification Guide

ברוך הבא למפרט העיצוב הרשמי של FinTrack.
מסמך זה משמש כמדריך טכני ופרומפט מובנה (Prompt) להעתקה עבור מחוללי בינה מלאכותית (Claude, ChatGPT, Midjourney, v0) ליצירת אייקוני SVG תואמים ב-100% למערכת.

---

## 1. הנחיות עיצוב וטכנולוגיה (SVG Technical Specs)

כל אייקון במערכת FinTrack מעוצב בהשראת שפת העיצוב המינימליסטית של Lucide Icons ומוצג בתוך תגית סקווירקל (Squircle w-10 h-10 rounded-xl) עם רקע מעומעם בעל שקיפות של 10%-20% וצבע אייקון זוהר.

### כללי ה-SVG:
1. **ViewBox:** חובה להשתמש ב-\`viewBox="0 0 24 24"\`.
2. **קווים ומילוי:**
   - \`fill="none"\` (ללא מילוי משטחים אטומים, אלא אם מדובר בנקודת הדגשה קטנה).
   - \`stroke="currentColor"\` (המאפשר לשלוט בצבע האייקון דינמית דרך Tailwind CSS).
   - \`stroke-width="2"\` (עובי קו אחיד של 2 פיקסלים).
   - \`stroke-linecap="round"\` (סיומת קווים מעוגלת).
   - \`stroke-linejoin="round"\` (חיבורי קווים מעוגלים).
3. **מידות:** האייקון מותאם לתצוגה ב-20x20 או 24x24 פיקסלים.
4. **עצמאות קוד:** הקוד חייב להיות SVG נקי, ללא תגיות \`<script>\`, ללא מאזיני אירועים, וללא תלויות חיצוניות.

---

## 2. פלטת הצבעים המערכתית (Color Palettes)

* **הכנסות (משכורת, קצבה, השקעות):**
  - טקסט/אייקון: \`#10b981\` (Emerald-500) | רקע: \`rgba(16, 185, 129, 0.1)\`
* **משק בית וחשבונות:**
  - טקסט/אייקון: \`#6366f1\` (Indigo-500) | רקע: \`rgba(99, 102, 241, 0.1)\`
* **קניות וצרכנות:**
  - טקסט/אייקון: \`#ec4899\` (Pink-500) | רקע: \`rgba(236, 72, 153, 0.1)\`
* **רכב ותחבורה:**
  - טקסט/אייקון: \`#f97316\` (Orange-500) | רקע: \`rgba(249, 115, 22, 0.1)\`
* **בריאות וטיפוח:**
  - טקסט/אייקון: \`#f43f5e\` (Rose-500) | רקע: \`rgba(244, 63, 94, 0.1)\`
* **משפחה וחינוך:**
  - טקסט/אייקון: \`#14b8a6\` (Teal-500) | רקע: \`rgba(20, 184, 166, 0.1)\`
* **פנאי ותרבות:**
  - טקסט/אייקון: \`#a855f7\` (Purple-500) | רקע: \`rgba(168, 85, 247, 0.1)\`
* **אוכלים בחוץ ומסעדות:**
  - טקסט/אייקון: \`#f59e0b\` (Amber-500) | רקע: \`rgba(245, 158, 11, 0.1)\`
* **חופשות וטיולים:**
  - טקסט/אייקון: \`#0ea5e9\` (Sky-500) | רקע: \`rgba(14, 165, 233, 0.1)\`
* **שירותים פיננסיים:**
  - טקסט/אייקון: \`#06b6d4\` (Cyan-500) | רקע: \`rgba(6, 182, 212, 0.1)\`
* **שונות:**
  - טקסט/אייקון: \`#64748b\` (Slate-500) | רקע: \`rgba(100, 116, 139, 0.1)\`

---

## 3. פרומפט מוכן להעתקה ל-AI (Copy-Paste Prompt for AI Models)

העתק את הפסקה הבאה ל-ChatGPT, Claude או כל כלי AI אחר:

\`\`\`text
You are an expert SVG icon designer following the Lucide and Feather design system.
Create a minimalist, clean, single-color line-art SVG icon for a finance category named: [שם הקטגוריה או תת-הקטגוריה].

Technical Constraints:
1. Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">...</svg>
2. No inline fills. Everything must be drawn using stroke with stroke-width="2".
3. Use simple geometric primitives (path, circle, rect, line).
4. Do NOT wrap the output in markdown codeblocks if possible, or provide ONLY the raw <svg>...</svg> code.
5. Ensure the design is balanced, recognizable at 20x20 pixels, and centered within the 24x24 grid.
\`\`\`

---

## 4. דוגמאות SVG נקיות לשימוש מיידי

### דוגמה 1: ארנק מזומנים (Cash Wallet)
\`\`\`xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
  <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
  <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
</svg>
\`\`\`

### דוגמה 2: קניות סופרמרקט (Shopping Cart)
\`\`\`xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="8" cy="21" r="1" />
  <circle cx="19" cy="21" r="1" />
  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
</svg>
\`\`\`

### דוגמה 3: דלק ותחבורה (Fuel)
\`\`\`xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="3" x2="15" y1="22" y2="22" />
  <line x1="4" x2="14" y1="9" y2="9" />
  <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
  <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
</svg>
\`\`\`

### דוגמה 4: שכר דירה / בית (Home)
\`\`\`xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  <polyline points="9 22 9 12 15 12 15 22" />
</svg>
\`\`\`

---

## 5. כיצד להעלות את ה-SVG למערכת
1. היכנס להגדרות -> לשונית **קטגוריות**.
2. לחץ על **הוסף קטגוריה** או **ערוך** קטגוריה קיימת.
3. בחר באפשרות **העלאת SVG מותאם אישית**.
4. הדבק את קוד ה-SVG או בחר קובץ \`.svg\` מהמחשב.
5. שמור – והאייקון יוצג מיד בכל חלקי המערכת!
`;
}
