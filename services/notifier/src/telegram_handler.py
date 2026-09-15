import os
import logging
import html
from typing import Optional
import httpx
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

from src.otp_server import resolve_pending_otp

logger = logging.getLogger("notifier.telegram_handler")


async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat or not update.message:
        return

    allowed_chat_id: Optional[int] = context.bot_data.get("allowed_chat_id")
    if allowed_chat_id is not None and update.effective_chat.id != allowed_chat_id:
        logger.warning(f"Ignored /start from unauthorized chat_id={update.effective_chat.id}")
        await update.message.reply_text("⛔ גישה אינה מורשית עבור מזהה צ'אט זה.")
        return

    tma_url: Optional[str] = context.bot_data.get("tma_base_url")

    welcome_text = (
        "👋 <b>שלום! אני הבוט האישי שלך ב-FinTrack.</b>\n\n"
        "המערכת מחוברת ומוכנה. אשלח לך עדכונים שוטפים:\n"
        "• 💳 <b>תנועות חדשות:</b> עדכון מיידי עם כפתור לעריכה פנימית (TMA)\n"
        "• 🚨 <b>זיהוי חריגות:</b> התראה על תנועות חדשות/חריגות מכל ההיסטוריה\n"
        "• ⚠️ <b>חריגות תקציב:</b> התראה כשנחצה תקציב חודשי בקטגוריה\n"
        "• 🔐 <b>סנכרון בנקים:</b> קליטה מהירה של קודי OTP בהודעה חוזרת\n\n"
        "<b>פקודות זמינות:</b>\n"
        "/status - תמונת מצב יתרות וחשבונות\n"
        "/sync - הפעלת סריקת חשבונות מיידית\n"
        "/help - רשימת פקודות ועזרה"
    )

    reply_markup = None
    if tma_url and tma_url.startswith("https://"):
        try:
            keyboard = [[
                InlineKeyboardButton(
                    text="🌐 פתח את FinTrack (TMA)",
                    web_app=WebAppInfo(url=tma_url.rstrip("/"))
                )
            ]]
            reply_markup = InlineKeyboardMarkup(keyboard)
        except Exception as e:
            logger.warning(f"Could not attach TMA button to /start: {e}")

    await update.message.reply_text(
        welcome_text,
        parse_mode="HTML",
        reply_markup=reply_markup
    )


async def handle_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat or not update.message:
        return

    allowed_chat_id: Optional[int] = context.bot_data.get("allowed_chat_id")
    if allowed_chat_id is not None and update.effective_chat.id != allowed_chat_id:
        await update.message.reply_text("⛔ גישה אינה מורשית.")
        return

    api_url = os.getenv("INTERNAL_API_URL", "http://api-gateway:3000").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{api_url}/api/dashboard")
            if resp.status_code == 200:
                data = resp.json()
                total_balance = data.get("totalBalance", 0)
                monthly_expenses = data.get("monthlyExpenses", 0)
                monthly_income = data.get("monthlyIncome", 0)
                accounts_count = len(data.get("accounts", []))
                last_scraped = data.get("lastScrapedAt") or "טרם בוצע"

                msg = (
                    "📊 <b>תמונת מצב פיננסית - FinTrack</b>\n\n"
                    f"🏦 <b>חשבונות פעילים:</b> {accounts_count}\n"
                    f"💰 <b>יתרה כוללת:</b> ₪{total_balance:,.2f}\n"
                    f"🔻 <b>הוצאות החודש:</b> ₪{monthly_expenses:,.2f}\n"
                    f"🔺 <b>הכנסות החודש:</b> ₪{monthly_income:,.2f}\n"
                    f"🕒 <b>סריקה אחרונה:</b> {last_scraped}"
                )
                await update.message.reply_text(msg, parse_mode="HTML")
            else:
                await update.message.reply_text("⚠️ שרת המערכת החזיר שגיאה בטעינת הנתונים.")
    except Exception as e:
        logger.error(f"Error fetching dashboard in /status: {e}")
        await update.message.reply_text(f"❌ לא ניתן להתחבר לשער המערכת: {e}")


async def handle_sync(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat or not update.message:
        return

    allowed_chat_id: Optional[int] = context.bot_data.get("allowed_chat_id")
    if allowed_chat_id is not None and update.effective_chat.id != allowed_chat_id:
        await update.message.reply_text("⛔ גישה אינה מורשית.")
        return

    api_url = os.getenv("INTERNAL_API_URL", "http://api-gateway:3000").rstrip("/")
    await update.message.reply_text("⏳ מפעיל סריקת חשבונות בנק וכרטיסי אשראי ברקע...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{api_url}/api/scraper/trigger", json={})
            if resp.status_code in (200, 202):
                await update.message.reply_text("✅ סריקת החשבונות הופעלה בהצלחה! אם יידרש קוד אימות (OTP), אשלח לך הודעה כאן.")
            else:
                await update.message.reply_text(f"⚠️ שגיאה בהפעלת הסריקה ({resp.status_code}): {resp.text}")
    except Exception as e:
        logger.error(f"Error triggering scrape from /sync: {e}")
        await update.message.reply_text(f"❌ שגיאה בהתקשרות לסורק: {e}")


async def handle_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat or not update.message:
        return

    help_text = (
        "ℹ️ <b>פקודות בוט FinTrack:</b>\n\n"
        "/start - הודעת פתיחה וקישור לאפליקציה\n"
        "/status - הצגת יתרה כוללת, הוצאות/הכנסות וחשבונות\n"
        "/sync - הפעלת סריקת חשבונות בנק ואשראי\n"
        "/help - הצגת עזרה זו\n\n"
        "💬 <b>קודי OTP:</b> כאשר סריקת בנק דורשת קוד אימות במסרון, הבוט ישלח הודעה וכל מה שצריך לעשות הוא להשיב עם הקוד שקיבלת."
    )
    await update.message.reply_text(help_text, parse_mode="HTML")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat or not update.message or not update.message.text:
        return

    allowed_chat_id: Optional[int] = context.bot_data.get("allowed_chat_id")
    if allowed_chat_id is not None and update.effective_chat.id != allowed_chat_id:
        logger.warning(f"Ignored message from unauthorized chat_id={update.effective_chat.id}")
        await update.message.reply_text("⛔ גישה אינה מורשית.")
        return

    text = update.message.text.strip()

    # 1. If an OTP is pending, resolve it immediately
    if resolve_pending_otp(text):
        logger.info("Pending OTP request successfully resolved via Telegram message.")
        await update.message.reply_text(f"✅ קוד האימות (OTP) התקבל ונשלח לסורק: <code>{html.escape(text)}</code>", parse_mode="HTML")
        return

    # Informative response if user typed regular text
    await update.message.reply_text(
        "💬 ההודעה התקבלה. אם נדרש קוד אימות (OTP) לסריקה פעילה, הוא ייקלט אוטומטית.\nלרשימת פקודות: /help",
        parse_mode="HTML"
    )


def setup_handlers(bot_app: Application, allowed_chat_id: Optional[int], tma_base_url: Optional[str] = None) -> None:
    bot_app.bot_data["allowed_chat_id"] = allowed_chat_id
    bot_app.bot_data["tma_base_url"] = tma_base_url
    bot_app.add_handler(CommandHandler("start", handle_start))
    bot_app.add_handler(CommandHandler("status", handle_status))
    bot_app.add_handler(CommandHandler("sync", handle_sync))
    bot_app.add_handler(CommandHandler("help", handle_help))
    bot_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info(f"Telegram handlers configured with allowed_chat_id={allowed_chat_id}, tma_base_url={tma_base_url}")
