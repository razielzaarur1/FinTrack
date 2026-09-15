import os
import asyncio
import logging
import html
from contextlib import asynccontextmanager
from typing import Optional, Any, Dict
import httpx
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, Application

from src.otp_server import otp_router, set_bot_context
from src.telegram_handler import setup_handlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("notifier.main")

INTERNAL_API_URL = os.getenv("INTERNAL_API_URL", "http://api-gateway:3000").rstrip("/")

bot_app: Optional[Application] = None
allowed_chat_id: Optional[int] = None
current_token: Optional[str] = None
tma_base_url: Optional[str] = None
bot_lock = asyncio.Lock()


class TelegramConfigPayload(BaseModel):
    botToken: Optional[str] = None
    chatId: Optional[Any] = None
    tmaBaseUrl: Optional[str] = None


class TestNotifyPayload(BaseModel):
    chatId: Optional[Any] = None
    message: Optional[str] = None


class TransactionNotifyPayload(BaseModel):
    transaction: Dict[str, Any]
    account: Optional[Dict[str, Any]] = None
    tmaUrl: Optional[str] = None
    isAnomaly: Optional[bool] = False
    anomalyReason: Optional[str] = None


class BudgetNotifyPayload(BaseModel):
    category: str
    monthlyLimit: float
    currentSpent: float
    excessAmount: float
    percent: float
    tmaUrl: Optional[str] = None


async def stop_current_bot() -> None:
    global bot_app
    if bot_app:
        try:
            logger.info("Stopping current Telegram Bot application...")
            if bot_app.updater and bot_app.updater.running:
                await bot_app.updater.stop()
            await bot_app.stop()
            await bot_app.shutdown()
            logger.info("Current Telegram Bot shut down cleanly.")
        except Exception as e:
            logger.warning(f"Error while stopping bot app: {e}")
        finally:
            bot_app = None
            set_bot_context(None, None)


async def configure_bot(token: Optional[str], chat_id_val: Optional[Any], tma_url_val: Optional[str] = None) -> Dict[str, Any]:
    global bot_app, allowed_chat_id, current_token, tma_base_url

    async with bot_lock:
        parsed_token = (token or "").strip()
        parsed_chat_id: Optional[int] = None
        if chat_id_val is not None and str(chat_id_val).strip():
            try:
                parsed_chat_id = int(str(chat_id_val).strip())
            except (ValueError, TypeError):
                parsed_chat_id = None

        parsed_tma_url = (tma_url_val or "").strip() or None

        allowed_chat_id = parsed_chat_id
        tma_base_url = parsed_tma_url

        # If token is empty, shut down bot
        if not parsed_token:
            await stop_current_bot()
            current_token = None
            logger.info("Telegram Bot token cleared; bot disabled.")
            return {
                "configured": False,
                "active": False,
                "message": "Bot token cleared; bot disabled."
            }

        # If token hasn't changed and bot is running, simply update chat ID and TMA url
        if bot_app and current_token == parsed_token:
            setup_handlers(bot_app, allowed_chat_id, tma_base_url)
            set_bot_context(bot_app.bot, allowed_chat_id)
            logger.info(f"Updated existing bot config: chat_id={allowed_chat_id}, tma_url={tma_base_url}")
            bot_me = await bot_app.bot.get_me()
            return {
                "configured": True,
                "active": True,
                "botUsername": bot_me.username,
                "chatId": allowed_chat_id,
                "tmaBaseUrl": tma_base_url
            }

        # New token: Stop previous bot and build fresh instance
        await stop_current_bot()

        builder = ApplicationBuilder().token(parsed_token)
        proxy_url = os.getenv("HTTPS_PROXY") or os.getenv("https_proxy")
        if proxy_url:
            builder = builder.proxy(proxy_url).get_updates_proxy(proxy_url)

        new_app = builder.build()
        setup_handlers(new_app, allowed_chat_id, tma_base_url)
        set_bot_context(new_app.bot, allowed_chat_id)

        await new_app.initialize()
        await new_app.start()
        if new_app.updater:
            await new_app.updater.start_polling()

        bot_app = new_app
        current_token = parsed_token

        bot_me = await bot_app.bot.get_me()
        logger.info(f"Telegram Bot @{bot_me.username} initialized and polling started successfully.")

        return {
            "configured": True,
            "active": True,
            "botUsername": bot_me.username,
            "chatId": allowed_chat_id,
            "tmaBaseUrl": tma_base_url
        }


async def fetch_config_from_api_gateway():
    logger.info(f"Attempting to load Telegram config from API Gateway: {INTERNAL_API_URL}...")
    for attempt in range(1, 6):
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(f"{INTERNAL_API_URL}/internal/notifier-config")
                if resp.status_code == 200:
                    data = resp.json()
                    bot_tok = data.get("telegramBotToken")
                    chat_id = data.get("telegramChatId")
                    tma_url = data.get("tmaBaseUrl")
                    if bot_tok:
                        logger.info("Found saved Telegram Bot Token from API Gateway, initializing bot...")
                        await configure_bot(bot_tok, chat_id, tma_url)
                    else:
                        logger.info("No Telegram Bot Token configured in system settings yet.")
                    return
        except Exception as e:
            logger.debug(f"Attempt {attempt}/5 connecting to API Gateway: {e}")
        await asyncio.sleep(2)
    logger.info("API Gateway not ready during startup; will wait for dynamic config via /api/telegram/config.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load settings from API Gateway
    init_task = asyncio.create_task(fetch_config_from_api_gateway())
    yield
    # Shutdown
    init_task.cancel()
    await stop_current_bot()


app = FastAPI(
    title="Notifier Service",
    description="Microservice for Telegram alerts, dynamic bot management, OTP collection and TMA integration",
    version="2.0.0",
    lifespan=lifespan
)

app.include_router(otp_router)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "bot_configured": bot_app is not None,
        "chat_id_configured": allowed_chat_id is not None
    }


@app.get("/api/telegram/status")
async def get_telegram_status():
    if not bot_app:
        return {
            "configured": False,
            "active": False,
            "botUsername": None,
            "chatId": allowed_chat_id,
            "tmaBaseUrl": tma_base_url
        }
    try:
        me = await bot_app.bot.get_me()
        return {
            "configured": True,
            "active": bot_app.updater.running if bot_app.updater else True,
            "botUsername": me.username,
            "chatId": allowed_chat_id,
            "tmaBaseUrl": tma_base_url
        }
    except Exception as e:
        return {
            "configured": True,
            "active": False,
            "error": str(e),
            "chatId": allowed_chat_id,
            "tmaBaseUrl": tma_base_url
        }


@app.post("/api/telegram/config")
async def set_telegram_config(payload: TelegramConfigPayload):
    try:
        result = await configure_bot(payload.botToken, payload.chatId, payload.tmaBaseUrl)
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"Failed to configure telegram bot: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"שגיאה בהגדרת בוט הטלגרם: {str(e)}"
        )


@app.post("/api/notify/test")
async def send_test_message(payload: TestNotifyPayload):
    target_chat = payload.chatId if payload.chatId is not None else allowed_chat_id
    if not bot_app:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="בוט הטלגרם אינו מוגדר או אינו פעיל. אנא הזן טוקן ושמור תחילה."
        )
    if not target_chat:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="לא הוגדר Chat ID לשליחת הודעת הבדיקה."
        )

    text = payload.message or (
        "🎉 <b>בדיקת חיבור FinTrack הצליחה!</b>\n\n"
        "הבוט מוגדר כראוי ומחובר למערכת שלך.\n"
        "מעתה תקבל כאן התראות על תנועות חדשות עם אפשרות עריכה, זיהוי חריגות, קודי OTP וחריגות תקציב."
    )

    try:
        await bot_app.bot.send_message(
            chat_id=int(str(target_chat).strip()),
            text=text,
            parse_mode="HTML"
        )
        return {"success": True, "message": "הודעת הבדיקה נשלחה בהצלחה לטלגרם"}
    except Exception as e:
        logger.error(f"Failed to send test message: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"שגיאה בשליחת הודעה לטלגרם: {str(e)}"
        )


@app.post("/api/notify/transaction")
async def notify_transaction(payload: TransactionNotifyPayload):
    if not bot_app or allowed_chat_id is None:
        return {"success": False, "skipped": True, "reason": "Bot or Chat ID not configured"}

    tx = payload.transaction
    acc = payload.account or {}

    raw_amount = float(tx.get("amount") or 0.0)
    abs_amount = abs(raw_amount)
    is_income = raw_amount > 0 and str(tx.get("category", "")).strip() in (
        'משכורת', 'הכנסה', 'הכנסות', 'זיכוי', 'העברה', 'השקעות', 'Salary', 'Income', 'Refund'
    )
    symbol = "+" if is_income else "-"
    color_emoji = "🟢" if is_income else "🔻"

    merchant = html.escape(str(tx.get("merchantName") or tx.get("merchant_name") or tx.get("description") or "ללא שם"))
    category = html.escape(str(tx.get("category") or "ללא קטגוריה"))
    tx_date = html.escape(str(tx.get("date") or ""))
    acc_name = html.escape(str(acc.get("displayName") or acc.get("display_name") or acc.get("bankCompany") or "חשבון"))

    if payload.isAnomaly:
        header = "🚨 <b>התראה על תנועה חריגה!</b>"
        reason = html.escape(payload.anomalyReason or "תנועה גדולה שאינה תואמת את דפוסי העבר ההיסטוריים")
        msg = (
            f"{header}\n\n"
            f"⚠️ <b>סיבת הזיהוי:</b> {reason}\n\n"
            f"🏬 <b>בית עסק:</b> {merchant}\n"
            f"💰 <b>סכום:</b> {color_emoji} ₪{abs_amount:,.2f} ({symbol})\n"
            f"🏷️ <b>קטגוריה:</b> {category}\n"
            f"📅 <b>תאריך:</b> {tx_date}\n"
            f"🏦 <b>חשבון:</b> {acc_name}"
        )
    else:
        header = "💳 <b>תנועה חדשה זוהתה!</b>"
        msg = (
            f"{header}\n\n"
            f"🏬 <b>בית עסק:</b> {merchant}\n"
            f"💰 <b>סכום:</b> {color_emoji} ₪{abs_amount:,.2f} ({symbol})\n"
            f"🏷️ <b>קטגוריה:</b> {category}\n"
            f"📅 <b>תאריך:</b> {tx_date}\n"
            f"🏦 <b>חשבון:</b> {acc_name}"
        )

    reply_markup = None
    if payload.tmaUrl and payload.tmaUrl.startswith("https://"):
        try:
            keyboard = [[
                InlineKeyboardButton(
                    text="✏️ צפה וערוך תנועה (TMA)",
                    web_app=WebAppInfo(url=payload.tmaUrl)
                )
            ]]
            reply_markup = InlineKeyboardMarkup(keyboard)
        except Exception as e:
            logger.warning(f"Could not build TMA button: {e}")

    try:
        await bot_app.bot.send_message(
            chat_id=allowed_chat_id,
            text=msg,
            parse_mode="HTML",
            reply_markup=reply_markup
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to send transaction notification: {e}")
        return {"success": False, "error": str(e)}


@app.post("/api/notify/budget")
async def notify_budget(payload: BudgetNotifyPayload):
    if not bot_app or allowed_chat_id is None:
        return {"success": False, "skipped": True, "reason": "Bot or Chat ID not configured"}

    cat = html.escape(payload.category)
    limit = payload.monthlyLimit
    spent = payload.currentSpent
    excess = payload.excessAmount
    pct = payload.percent

    msg = (
        "⚠️ <b>התרעת חריגה מתקציב חודשי!</b>\n\n"
        f"🏷️ <b>קטגוריה:</b> {cat}\n"
        f"🎯 <b>תקציב חודשי:</b> ₪{limit:,.2f}\n"
        f"💸 <b>סך הוצאות החודש:</b> ₪{spent:,.2f}\n"
        f"📈 <b>חריגה:</b> ₪{excess:,.2f} ({pct:.0f}%)"
    )

    reply_markup = None
    if payload.tmaUrl and payload.tmaUrl.startswith("https://"):
        try:
            keyboard = [[
                InlineKeyboardButton(
                    text="🎯 פתח תקציבים ב-FinTrack",
                    web_app=WebAppInfo(url=payload.tmaUrl)
                )
            ]]
            reply_markup = InlineKeyboardMarkup(keyboard)
        except Exception as e:
            logger.warning(f"Could not build TMA budget button: {e}")

    try:
        await bot_app.bot.send_message(
            chat_id=allowed_chat_id,
            text=msg,
            parse_mode="HTML",
            reply_markup=reply_markup
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to send budget notification: {e}")
        return {"success": False, "error": str(e)}
