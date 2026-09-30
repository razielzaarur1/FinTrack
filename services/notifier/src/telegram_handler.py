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
        "• 💳 <b>תנועות חדשות:</b> עדכון מיידי עם כפתור לעריכה פנימית\n"
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
                    text="🌐 פתח את FinTrack",
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


async def process_ingest_response(status_msg, resp_data: dict) -> None:
    if not resp_data.get("success"):
        err = resp_data.get("error") or resp_data.get("message") or "שגיאה בעיבוד הקבלה"
        await status_msg.edit_text(f"❌ שגיאה בקליטת הקבלה: {html.escape(str(err))}")
        return

    matched = bool(resp_data.get("matched"))
    tma_receipt_url = resp_data.get("tmaReceiptUrl")

    if matched:
        msg = (
            "🧾 <b>קבלה נקלטה ונמצאה תנועה תואמת במערכת!</b>\n"
            "הקבלה קושרה בהצלחה לתנועה הקיימת."
        )
        reply_markup = None
        if tma_receipt_url and tma_receipt_url.startswith("https://"):
            reply_markup = InlineKeyboardMarkup([[
                InlineKeyboardButton(
                    text="🖼️ פתח מגירת קבלה",
                    web_app=WebAppInfo(url=tma_receipt_url)
                )
            ]])
        await status_msg.edit_text(msg, parse_mode="HTML", reply_markup=reply_markup)
    else:
        msg = (
            "🧾 <b>הקבלה נקלטה ונשמרה בהצלחה!</b>\n\n"
            "טרם נמצאה תנועה תואמת במערכת. ברגע שתיקלט תנועה בנקאית תואמת, היא תשויך אליה אוטומטית."
        )
        await status_msg.edit_text(msg, parse_mode="HTML")


async def post_to_gateway_receipts(client: httpx.AsyncClient, api_url: str, **kwargs) -> httpx.Response:
    endpoints = [
        f"{api_url}/api/transactions/receipts/ingest-telegram",
        f"{api_url}/api/receipts/ingest-telegram",
        f"{api_url}/api/v2/transactions/receipts/ingest-telegram",
    ]
    last_resp = None
    for url in endpoints:
        try:
            resp = await client.post(url, **kwargs)
            if resp.status_code != 404:
                return resp
            last_resp = resp
        except Exception as e:
            logger.debug(f"Attempt failed for {url}: {e}")
    return last_resp


async def handle_receipt_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat or not update.message or not update.message.photo:
        return

    allowed_chat_id: Optional[int] = context.bot_data.get("allowed_chat_id")
    if allowed_chat_id is not None and update.effective_chat.id != allowed_chat_id:
        logger.warning(f"Ignored photo from unauthorized chat_id={update.effective_chat.id}")
        await update.message.reply_text("⛔ גישה אינה מורשית.")
        return

    status_msg = await update.message.reply_text("⏳ קולט ומנתח את הקבלה...")
    api_url = os.getenv("INTERNAL_API_URL", "http://api-gateway:3000").rstrip("/")

    try:
        photo = update.message.photo[-1]
        file_obj = await photo.get_file()
        file_bytes = await file_obj.download_as_bytearray()

        async with httpx.AsyncClient(timeout=60.0) as client:
            files = {"file": ("telegram_receipt.jpg", bytes(file_bytes), "image/jpeg")}
            resp = await post_to_gateway_receipts(client, api_url, files=files)
            if resp and resp.status_code in (200, 201):
                await process_ingest_response(status_msg, resp.json())
            else:
                err_text = resp.text[:300] if resp else "לא התקבלה תשובה מהשרת"
                status_code = resp.status_code if resp else 500
                await status_msg.edit_text(f"❌ שגיאה בקליטת הקבלה ({status_code}): {html.escape(err_text)}")
    except Exception as e:
        logger.error(f"Error ingesting photo receipt: {e}", exc_info=True)
        await status_msg.edit_text(f"❌ שגיאה בקליטת הקבלה: {html.escape(str(e))}")


async def handle_receipt_document(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat or not update.message or not update.message.document:
        return

    allowed_chat_id: Optional[int] = context.bot_data.get("allowed_chat_id")
    if allowed_chat_id is not None and update.effective_chat.id != allowed_chat_id:
        logger.warning(f"Ignored document from unauthorized chat_id={update.effective_chat.id}")
        await update.message.reply_text("⛔ גישה אינה מורשית.")
        return

    doc = update.message.document
    mime = (doc.mime_type or "").lower()
    if not (mime.startswith("image/") or mime == "application/pdf" or (doc.file_name and doc.file_name.lower().endswith(('.pdf', '.png', '.jpg', '.jpeg')))):
        await update.message.reply_text("⚠️ ניתן לשלוח קבצים מסוג תמונה (JPG, PNG) או מסמך PDF בלבד.")
        return

    status_msg = await update.message.reply_text("⏳ קולט ומנתח את המסמך...")
    api_url = os.getenv("INTERNAL_API_URL", "http://api-gateway:3000").rstrip("/")

    try:
        file_obj = await doc.get_file()
        file_bytes = await file_obj.download_as_bytearray()
        fname = doc.file_name or "telegram_receipt.pdf"
        file_mime = doc.mime_type or "application/octet-stream"

        async with httpx.AsyncClient(timeout=60.0) as client:
            files = {"file": (fname, bytes(file_bytes), file_mime)}
            resp = await post_to_gateway_receipts(client, api_url, files=files)
            if resp and resp.status_code in (200, 201):
                await process_ingest_response(status_msg, resp.json())
            else:
                err_text = resp.text[:300] if resp else "לא התקבלה תשובה מהשרת"
                status_code = resp.status_code if resp else 500
                await status_msg.edit_text(f"❌ שגיאה בקליטת המסמך ({status_code}): {html.escape(err_text)}")
    except Exception as e:
        logger.error(f"Error ingesting document receipt: {e}", exc_info=True)
        await status_msg.edit_text(f"❌ שגיאה בקליטת המסמך: {html.escape(str(e))}")


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

    # 2. Check if user sent a digital receipt URL
    if text.startswith("http://") or text.startswith("https://"):
        status_msg = await update.message.reply_text("⏳ קולט ומנתח את החשבונית הדיגיטלית...")
        api_url = os.getenv("INTERNAL_API_URL", "http://api-gateway:3000").rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await post_to_gateway_receipts(client, api_url, json={"url": text})
                if resp and resp.status_code in (200, 201):
                    await process_ingest_response(status_msg, resp.json())
                else:
                    err_text = resp.text[:300] if resp else "לא התקבלה תשובה מהשרת"
                    status_code = resp.status_code if resp else 500
                    await status_msg.edit_text(f"❌ שגיאה בניתוח הקישור ({status_code}): {html.escape(err_text)}")
        except Exception as e:
            logger.error(f"Error ingesting URL receipt: {e}", exc_info=True)
            await status_msg.edit_text(f"❌ שגיאה בקליטת הקישור: {html.escape(str(e))}")
        return

    # Informative response if user typed regular text
    await update.message.reply_text(
        "💬 ההודעה התקבלה. ניתן לשלוח קבלות (תמונה/PDF), קישורים לחשבוניות דיגיטליות, או קודי OTP לסריקה.\nלרשימת פקודות: /help",
        parse_mode="HTML"
    )


def setup_handlers(bot_app: Application, allowed_chat_id: Optional[int], tma_base_url: Optional[str] = None) -> None:
    bot_app.bot_data["allowed_chat_id"] = allowed_chat_id
    bot_app.bot_data["tma_base_url"] = tma_base_url
    bot_app.add_handler(CommandHandler("start", handle_start))
    bot_app.add_handler(CommandHandler("status", handle_status))
    bot_app.add_handler(CommandHandler("sync", handle_sync))
    bot_app.add_handler(CommandHandler("help", handle_help))
    bot_app.add_handler(MessageHandler(filters.PHOTO, handle_receipt_photo))
    bot_app.add_handler(MessageHandler(filters.Document.ALL, handle_receipt_document))
    bot_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info(f"Telegram handlers configured with allowed_chat_id={allowed_chat_id}, tma_base_url={tma_base_url}")

