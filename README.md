# 🛡️ מערכת מאובטחת לניהול כלכלי וסריקת חשבונות בנק (Self-Hosted)

מערכת אישית מאובטחת לניהול כלכלי אוטומטי, מבוססת Docker Compose, המיועדת להרצה בשרת ביתי / Ubuntu Server ומנוהלת דרך **Portainer**.
המערכת מושכת נתונים באופן עצמאי ממוסדות פיננסיים ישראליים באמצעות `israeli-bank-scrapers`, מצפינה את כל הפרטים הרגישים ב-**HashiCorp Vault Transit Engine**, ומדווחת דרך **Telegram Bot**.

---

## 🔒 תכונות אבטחה מרכזיות (Defense in Depth)

- **Least-Privilege Envelope Encryption**: סיסמאות ופרטי גישה לחשבונות בנק מוצפנים ונשמרים במסד הנתונים כ-Ciphertext (`vault:v1:...`). אף שירות אינו מחזיק במפתח פענוח קבוע.
- **סקרייפר מבודד ברמת Kernel (`worker-net: internal: true`)**: לסקרייפר אין Gateway ישיר לאינטרנט. כל תעבורת הרשת החיצונית מנותבת בלעדית דרך **Egress Proxy (Squid)** המאפשר גישה רק לכתובות HTTPS רשמיות של מוסדות פיננסיים בישראל.
- **גישה חיצונית מאובטחת דרך Tailscale VPN**: הגישה ל-Nginx ול-API מוגנת ברמת Tailscale שכבר מותקן על השרת, ללא צורך בפתיחת פורטים בראוטר הביתי.
- **2-of-2 Shamir Vault Unsealing**: אתחול מפתח ה-Vault מפוצל לשני חלקים – מפתח 1 נשמר מוצפן בשרת ומוחל אוטומטית בעלייה, ומפתח 2 נשלח ישירות ע"י המשתמש דרך ה-Telegram Bot.
- **חסימת Keyring ו-Sandboxing**: פרופיל Seccomp מותאם אישית לדפדפן Chromium החוסם קריאות מערכת רגישות כגון `keyctl`.

---

## 🚀 הוראות פריסה והפעלה (Portainer & GitHub Ready)

### 1. הכנת השרת (Host Setup)
התחבר לשרת ה-Ubuntu שלך והרץ את סקריפט האתחול:
```bash
sudo bash scripts/init/01-host-setup.sh
```
*הסקריפט יתקין כלי עזר (`jq`, `curl`, `openssl`), יבטל את ה-Swap (למניעת זליגת זיכרון של סיסמאות לדיסק), יקשיח את ה-Kernel, וינפיק תעודת TLS מ-Tailscale ישירות עבור Nginx.*

### 2. הגדרת משתני סביבה ב-Portainer (בטוח ל-GitHub!)
כל הסיסמאות והמפתחות הראשוניים מוגדרים כ-**Environment Variables** ב-Portainer, כך שניתן לדחוף את כל קבצי הפרויקט ל-GitHub בצורה פומבית או פרטית ללא חשש מזליגת סודות:

העתק את המשתנים מקובץ `.env.example` והדבק אותם בממשק ה-Portainer תחת **Stacks -> Add Stack -> Environment variables**:

| שם המשתנה | תיאור | דוגמה |
|---|---|---|
| `DB_PASSWORD` | סיסמת הניהול של PostgreSQL | `MyStr0ngDbAdm1nPass!` |
| `API_DB_PASSWORD` | סיסמת המשתמש של ה-API Gateway | `ApiPassw0rd_9942` |
| `SCRAPER_DB_PASSWORD` | סיסמת המשתמש של ה-Scraper Worker | `ScraperPassw0rd_1123` |
| `TELEGRAM_BOT_TOKEN` | טוקן הבוט מ-@BotFather | `1234567890:ABCdef...` |
| `TELEGRAM_CHAT_ID` | ה-Chat ID האישי שלך בטלגרם | `123456789` |
| `JWT_SECRET` | מפתח חתימה לטוקנים | `random_64_character_hex_string` |

### 3. העלאת ה-Stack ב-Portainer
1. ב-Portainer, נווט אל **Stacks** -> **Add Stack**.
2. בחר **Web editor** והדבק את תוכן `docker-compose.yml` (או חבר ישירות ל-Repository שלך ב-GitHub דרך אפשרות **Repository**).
3. ודא שמשתני הסביבה מוגדרים ולחץ **Deploy the stack**.

### 4. אתחול ה-Vault (חד-פעמי)
לאחר שה-Stack עלה, הרץ בשרת:
```bash
bash scripts/init/02-vault-init.sh
```
> ⚠️ **חשוב:** שמור במקום בטוח (מנהל סיסמאות) את **Unseal Key 2** ואת ה-**Root Token** שיוצגו פעם אחת בלבד על גבי המסך.

### 5. החלת סכמת מסד הנתונים (חד-פעמי)
הרץ את הסקריפט האוטומטי שמגדיר את הטבלאות, משתמש ברירת המחדל, וההרשאות:
```bash
bash scripts/init/03-postgres-init.sh
```

---

## 🕒 לוח זמני סריקות אוטומטי (Ofelia Scheduler)

המערכת מתוזמנת לבצע סריקה 3 פעמים ביום:
- **08:00 בבוקר**
- **14:00 בצהריים**
- **20:00 בערב**

במידה והבנק דורש קוד אימות חד-פעמי (OTP), שירות ה-Notifier ישלח מיד הודעה לטלגרם שלך, וימתין למענה עם הקוד עד 180 שניות.

---

## 💾 גיבויים
לביצוע גיבוי ידני או תזמון ב-Cron:
```bash
bash scripts/ops/backup.sh
```
הגיבויים נשמרים מקומית תחת `/opt/finapp/backups/` וקובצי גיבוי מעל 30 יום נמחקים אוטומטית.
