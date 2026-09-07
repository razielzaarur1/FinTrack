import os
import asyncio
import logging
from typing import Optional
import httpx
from telegram import Bot

logger = logging.getLogger("notifier.unsealer")


async def poll_vault_sealed(bot: Optional[Bot], allowed_chat_id: Optional[int]) -> None:
    vault_addr = os.getenv("VAULT_ADDR", "http://vault:8200").rstrip("/")
    key1_file = os.getenv("VAULT_UNSEAL_KEY1_FILE", "/run/secrets/vault_unseal_key1")
    _notified = False

    logger.info(f"Starting Vault sealed status polling on {vault_addr} every 15 seconds...")

    while True:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                try:
                    resp = await client.get(f"{vault_addr}/v1/sys/health")
                    data = resp.json() if resp.content else {}
                except httpx.HTTPStatusError as hse:
                    data = hse.response.json() if hse.response.content else {}

                initialized = data.get("initialized", False)
                sealed = data.get("sealed", False)

                if initialized and sealed and not _notified:
                    logger.warning("Vault is initialized and sealed! Attempting auto-unseal with Key 1...")
                    
                    key1 = None
                    if os.path.exists(key1_file):
                        try:
                            with open(key1_file, "r", encoding="utf-8") as f:
                                key1 = f.read().strip()
                        except Exception as e:
                            logger.error(f"Failed to read Key 1 from {key1_file}: {e}")
                    elif os.getenv("VAULT_UNSEAL_KEY_1"):
                        key1 = os.getenv("VAULT_UNSEAL_KEY_1", "").strip()

                    if key1:
                        try:
                            unseal_resp = await client.post(
                                f"{vault_addr}/v1/sys/unseal",
                                json={"key": key1}
                            )
                            unseal_data = unseal_resp.json() if unseal_resp.content else {}
                            is_still_sealed = unseal_data.get("sealed", True)

                            if is_still_sealed:
                                progress = unseal_data.get("progress", 1)
                                threshold = unseal_data.get("t", 2)
                                logger.info(f"Key 1 submitted (progress {progress}/{threshold}). Notifying user for Key 2...")
                                if bot and allowed_chat_id:
                                    await bot.send_message(
                                        chat_id=allowed_chat_id,
                                        text=(
                                            "🚨 *Vault Security Alert*\n\n"
                                            "Vault is currently *SEALED*.\n"
                                            "✅ Key 1 has been applied automatically.\n\n"
                                            "🔑 Please reply with *Key 2* to complete unsealing."
                                        ),
                                        parse_mode="Markdown"
                                    )
                                _notified = True
                            else:
                                logger.info("Vault fully unsealed with Key 1.")
                                if bot and allowed_chat_id:
                                    await bot.send_message(
                                        chat_id=allowed_chat_id,
                                        text="🔓 *Vault Notice*: Vault has been automatically unsealed.",
                                        parse_mode="Markdown"
                                    )
                                _notified = True
                        except Exception as e:
                            logger.error(f"Error submitting Key 1 to Vault: {e}")
                    else:
                        logger.warning("Key 1 not available in secret file or environment. Prompting user...")
                        if bot and allowed_chat_id:
                            await bot.send_message(
                                chat_id=allowed_chat_id,
                                text=(
                                    "🚨 *Vault Security Alert*\n\n"
                                    "Vault is currently *SEALED* and Key 1 was not found.\n\n"
                                    "🔑 Please send your unseal keys to unseal the Vault."
                                ),
                                parse_mode="Markdown"
                            )
                        _notified = True

                elif not sealed:
                    if _notified:
                        logger.info("Vault is unsealed. Resetting notification state.")
                        _notified = False

        except Exception as e:
            logger.debug(f"Vault health poll check encountered an exception: {e}")

        await asyncio.sleep(15)
