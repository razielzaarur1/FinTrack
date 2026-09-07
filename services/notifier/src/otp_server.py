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

class OTPSubmit(BaseModel):
    code: Optional[str] = None
    otp: Optional[str] = None

_current_bot: Optional[Bot] = None
_allowed_chat_id: Optional[int] = None
_pending_otp_future: Optional[asyncio.Future] = None
_pending_otp_info: Optional[dict] = None


def set_bot_context(bot: Optional[Bot], allowed_chat_id: Optional[int]) -> None:
    global _current_bot, _allowed_chat_id
    _current_bot = bot
    _allowed_chat_id = allowed_chat_id


def get_pending_otp_future() -> Optional[asyncio.Future]:
    global _pending_otp_future
    return _pending_otp_future


def set_pending_otp_future(fut: Optional[asyncio.Future], info: Optional[dict] = None) -> None:
    global _pending_otp_future, _pending_otp_info
    _pending_otp_future = fut
    _pending_otp_info = info


def resolve_pending_otp(code: str) -> bool:
    global _pending_otp_future, _pending_otp_info
    if _pending_otp_future is not None and not _pending_otp_future.done():
        _pending_otp_future.set_result(code)
        _pending_otp_future = None
        _pending_otp_info = None
        return True
    return False


otp_router = APIRouter()


@otp_router.get("/api/otp/pending")
@otp_router.get("/api/otp-pending")
async def get_pending_otp():
    global _pending_otp_future, _pending_otp_info
    is_pending = _pending_otp_future is not None and not _pending_otp_future.done()
    if is_pending and _pending_otp_info:
        return {"pending": True, **_pending_otp_info}
    return {"pending": False}


@otp_router.post("/api/otp")
@otp_router.post("/api/otp-submit")
async def submit_otp(payload: OTPSubmit):
    code = (payload.code or payload.otp or "").strip()
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP code is required"
        )
    if resolve_pending_otp(code):
        return {"status": "success", "message": "OTP resolved successfully"}
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="No pending OTP request found or request expired"
    )


@otp_router.post("/api/otp-request")
async def request_otp(payload: OTPRequest):
    global _current_bot, _allowed_chat_id, _pending_otp_future, _pending_otp_info

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
    info = {
        "bank": payload.bank,
        "phoneHint": payload.phoneHint,
        "accountId": payload.accountId,
        "prompt": payload.prompt,
    }
    set_pending_otp_future(future, info)

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
        set_pending_otp_future(None, None)
        logger.error(f"Failed to send Telegram OTP prompt: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send Telegram message: {str(e)}"
        )

    try:
        otp_code = await asyncio.wait_for(future, timeout=float(payload.timeoutSeconds or 180))
        return {"otp": otp_code, "status": "success"}
    except asyncio.TimeoutError:
        set_pending_otp_future(None, None)
        logger.warning(f"OTP request timed out for bank {payload.bank}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"OTP request timed out after {payload.timeoutSeconds or 180} seconds"
        )
    except asyncio.CancelledError:
        set_pending_otp_future(None, None)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="OTP request was replaced or cancelled"
        )
