import os
import logging
from typing import Optional
import httpx
from telegram import Update
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
    await update.message.reply_text("🤖 Notifier Service is online and listening for OTPs and Vault unseal keys.")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat or not update.message or not update.message.text:
        return

    allowed_chat_id: Optional[int] = context.bot_data.get("allowed_chat_id")
    if allowed_chat_id is not None and update.effective_chat.id != allowed_chat_id:
        logger.warning(f"Ignored message from unauthorized chat_id={update.effective_chat.id}")
        await update.message.reply_text("⛔ Unauthorized.")
        return

    text = update.message.text.strip()

    # 1. If an OTP is pending, resolve it
    if resolve_pending_otp(text):
        logger.info("Pending OTP request successfully resolved via Telegram message.")
        await update.message.reply_text(f"✅ OTP received: `{text}`", parse_mode="Markdown")
        return

    # 2. Otherwise treat text as Vault unseal key (Key 2 or manual unseal key)
    vault_addr = os.getenv("VAULT_ADDR", "http://vault:8200").rstrip("/")
    logger.info(f"Submitting provided text as unseal key to Vault at {vault_addr}...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{vault_addr}/v1/sys/unseal", json={"key": text})
            if resp.status_code == 200:
                data = resp.json()
                if not data.get("sealed", True):
                    logger.info("Vault unsealed successfully!")
                    await update.message.reply_text("🔓 *Success*: Vault is now unsealed!", parse_mode="Markdown")
                else:
                    progress = data.get("progress", 0)
                    threshold = data.get("t", 2)
                    await update.message.reply_text(
                        f"🔑 Key accepted. Vault unseal progress: *{progress}/{threshold}*",
                        parse_mode="Markdown"
                    )
            else:
                logger.warning(f"Vault unseal returned status {resp.status_code}: {resp.text}")
                await update.message.reply_text(f"⚠️ Vault returned error ({resp.status_code}): {resp.text}")
    except Exception as e:
        logger.error(f"Error submitting unseal key to Vault: {e}")
        await update.message.reply_text(f"❌ Failed to reach Vault: {e}")


def setup_handlers(bot_app: Application, allowed_chat_id: Optional[int]) -> None:
    bot_app.bot_data["allowed_chat_id"] = allowed_chat_id
    bot_app.add_handler(CommandHandler("start", handle_start))
    bot_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info(f"Telegram handlers configured with allowed_chat_id={allowed_chat_id}")
