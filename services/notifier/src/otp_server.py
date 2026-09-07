import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from telegram import Bot

logger = logging.getLogger("notifier.otp_server")

class OTPRequest(BaseModel):
    bank: str
    phoneHint: str = ""
    accountId: Optional[str] = None
    prompt: Optional[str] = None
    timeoutSeconds: Optional[int] = 180

_current_bot: Optional[Bot] = None
_allowed_chat_id: Optional[int] = None
_pending_otp_future: Optional[asyncio.Future] = None


def set_bot_context(bot: Optional[Bot], allowed_chat_id: Optional[int]) -> None:
    global _current_bot, _allowed_chat_id
    _current_bot = bot
    _allowed_chat_id = allowed_chat_id


def get_pending_otp_future() -> Optional[asyncio.Future]:
    global _pending_otp_future
    return _pending_otp_future


def set_pending_otp_future(fut: Optional[asyncio.Future]) -> None:
    global _pending_otp_future
    _pending_otp_future = fut


def resolve_pending_otp(code: str) -> bool:
    global _pending_otp_future
    if _pending_otp_future is not None and not _pending_otp_future.done():
        _pending_otp_future.set_result(code)
        _pending_otp_future = None
        return True
    return False


otp_router = APIRouter()


@otp_router.post("/api/otp-request")
async def request_otp(payload: OTPRequest):
    global _current_bot, _allowed_chat_id, _pending_otp_future

    if not _current_bot or _allowed_chat_id is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram bot or allowed chat ID is not configured"
        )

    # If there is already a pending OTP request, cancel the old one
    if _pending_otp_future is not None and not _pending_otp_future.done():
        _pending_otp_future.cancel()

    loop = asyncio.get_running_loop()
    future = loop.create_future()
    set_pending_otp_future(future)

    msg_text = f"🔐 *OTP Verification Code Required*\n\n🏦 *Bank:* {payload.bank}"
    if payload.phoneHint:
        msg_text += f"\n📱 *Phone:* {payload.phoneHint}"
    msg_text += "\n\n💬 Please reply to this message with the OTP code you received."

    try:
        await _current_bot.send_message(
            chat_id=_allowed_chat_id,
            text=msg_text,
            parse_mode="Markdown"
        )
    except Exception as e:
        set_pending_otp_future(None)
        logger.error(f"Failed to send Telegram OTP prompt: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send Telegram message: {str(e)}"
        )

    try:
        otp_code = await asyncio.wait_for(future, timeout=180.0)
        return {"otp": otp_code, "status": "success"}
    except asyncio.TimeoutError:
        set_pending_otp_future(None)
        logger.warning(f"OTP request timed out for bank {payload.bank}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="OTP request timed out after 180 seconds"
        )
