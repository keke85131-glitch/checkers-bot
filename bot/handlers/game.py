from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

from bot.config import FRONTEND_URL

router = Router()

START_TEXT = """
👋 Привет! Я бот для игры в шашки через Telegram.

🎮 <b>Как сыграть:</b>
1. Перейди в любой групповой чат или личную переписку с другом.
2. Напечатай <code>@{username}</code> (упомяни меня) прямо в поле ввода сообщения.
3. Выбери вариант <b>«Шашки — создать партию»</b> из появившегося меню.
4. Отправь сообщение — друг нажмёт кнопку и попадёт в ту же комнату.

♟️ <b>Правила русских шашек:</b>
• Доска 8×8, у каждого по 12 шашек.
• Шашки ходят по диагонали вперёд на одну клетку.
• Бить обязательно — если можно взять шашку, нужно взять.
• При достижении последнего ряда шашка превращается в дамку.
• Дамка ходит по диагонали на любое расстояние.
• Побеждает тот, кто съест все шашки противника или лишит его ходов.
• На каждый ход даётся 60 секунд — не успел, засчитывается поражение.

/help — показать правила ещё раз
""".strip()

HELP_TEXT = """
📖 <b>Помощь</b>

<b>Inline-режим (основной способ играть):</b>
Введи <code>@{username}</code> в любом чате → выбери «Шашки — создать партию» → отправь другу.

<b>Правила шашек:</b>
♟ Шашки ходят вперёд по диагонали.
💥 Взятие обязательно при наличии возможности.
👑 Дамка — ходит на любое расстояние по диагонали.
⏱ Таймер 60 сек на каждый ход.
🏆 Победа — уничтожить все шашки соперника или лишить его ходов.

<b>Возникли проблемы?</b>
Убедись, что у меня включён inline-режим: в @BotFather → /setinline.
""".strip()


@router.message(Command("start"))
async def cmd_start(message: Message):
    bot_info = await message.bot.get_me()
    text = START_TEXT.format(username=bot_info.username)
    await message.answer(text, parse_mode="HTML")


@router.message(Command("help"))
async def cmd_help(message: Message):
    bot_info = await message.bot.get_me()
    text = HELP_TEXT.format(username=bot_info.username)
    await message.answer(text, parse_mode="HTML")
