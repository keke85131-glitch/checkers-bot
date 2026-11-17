import logging
from typing import Optional

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from bot.config import BOT_TOKEN

logger = logging.getLogger(__name__)

_bot_instance: Optional[Bot] = None


def get_bot() -> Optional[Bot]:
    global _bot_instance
    if _bot_instance is None and BOT_TOKEN:
        _bot_instance = Bot(
            token=BOT_TOKEN,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
    return _bot_instance


def set_bot(bot: Bot) -> None:
    global _bot_instance
    _bot_instance = bot
