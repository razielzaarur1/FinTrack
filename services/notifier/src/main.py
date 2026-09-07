import os
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI
from telegram.ext import ApplicationBuilder, Application

from src.otp_server import otp_router, set_bot_context
from src.unsealer import poll_vault_sealed
from src.telegram_handler import setup_handlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("notifier.main")


def read_secret(file_env_name: str, default_file_path: str, fallback_env_name: str) -> str:
    file_path = os.getenv(file_env_name, default_file_path)
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                val = f.read().strip()
                if val:
                    return val
        except Exception as e:
            logger.warning(f"Could not read secret from {file_path}: {e}")
    return os.getenv(fallback_env_name, "").strip()


BOT_TOKEN = read_secret(
    "TELEGRAM_BOT_TOKEN_FILE",
    "/run/secrets/telegram_token",
    "TELEGRAM_BOT_TOKEN"
)

raw_chat_id = read_secret(
    "TELEGRAM_ALLOWED_CHAT_ID_FILE",
    "/run/secrets/telegram_chat_id",
    "TELEGRAM_ALLOWED_CHAT_ID"
)
ALLOWED_CHAT_ID: Optional[int] = int(raw_chat_id) if raw_chat_id else None


def build_telegram_app(token: str) -> Optional[Application]:
    if not token:
        return None
    builder = ApplicationBuilder().token(token)
    proxy_url = os.getenv("HTTPS_PROXY") or os.getenv("https_proxy")
    if proxy_url:
        logger.info(f"Configuring Telegram proxy: {proxy_url}")
        builder = builder.proxy(proxy_url).get_updates_proxy(proxy_url)
    return builder.build()


bot_app: Optional[Application] = build_telegram_app(BOT_TOKEN)


@asynccontextmanager
async def lifespan(app: FastAPI):
    vault_task: Optional[asyncio.Task] = None

    if bot_app:
        setup_handlers(bot_app, ALLOWED_CHAT_ID)
        set_bot_context(bot_app.bot, ALLOWED_CHAT_ID)

        await bot_app.initialize()
        await bot_app.start()
        if bot_app.updater:
            await bot_app.updater.start_polling()
        logger.info("Telegram Bot application initialized and polling started.")

        if ALLOWED_CHAT_ID is not None:
            vault_task = asyncio.create_task(poll_vault_sealed(bot_app.bot, ALLOWED_CHAT_ID))
            logger.info(f"Vault seal polling task spawned for chat_id={ALLOWED_CHAT_ID}.")
        else:
            logger.warning("TELEGRAM_ALLOWED_CHAT_ID is not configured; Vault polling notification skipped.")
    else:
        logger.warning("TELEGRAM_BOT_TOKEN is missing or empty; Telegram bot functionality is disabled.")

    yield

    if vault_task:
        vault_task.cancel()
        try:
            await vault_task
        except asyncio.CancelledError:
            pass

    if bot_app:
        if bot_app.updater and bot_app.updater.running:
            await bot_app.updater.stop()
        await bot_app.stop()
        await bot_app.shutdown()
        logger.info("Telegram Bot application shut down cleanly.")


app = FastAPI(
    title="Notifier Service",
    description="Microservice for Telegram alerts, Vault unsealing, and 2FA OTP collection",
    version="1.0.0",
    lifespan=lifespan
)

app.include_router(otp_router)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "bot_configured": bot_app is not None,
        "chat_id_configured": ALLOWED_CHAT_ID is not None
    }
