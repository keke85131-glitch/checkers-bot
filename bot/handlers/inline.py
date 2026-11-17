from aiogram import Router
from aiogram.types import (
    InlineQuery,
    InlineQueryResultArticle,
    InputTextMessageContent,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    InlineQueryResultsButton,
    WebAppInfo,
)
import uuid

from bot.config import FRONTEND_URL

router = Router()


@router.inline_query()
async def inline_checkers(query: InlineQuery):
    """
    Inline-режим: пользователь пишет @gameddd_bot в любом чате.
    Формирует изолированную игровую комнату с карточкой статуса.
    """
    room_id = uuid.uuid4().hex[:6].upper()
    user_name = query.from_user.first_name
    if query.from_user.username:
        user_name += f" (@{query.from_user.username})"

    # Нативная ссылка Telegram Mini App
    app_url = f"https://t.me/gameddd_bot/app?startapp={room_id}"

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎮 Войти в комнату",
                    url=app_url,
                )
            ]
        ]
    )

    message_text = (
        f"♟️ <b>Изолированная комната #{room_id}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"Статус: 🟡 <b>Ожидание соперника</b>\n"
        f"Участники: <b>[ 👤 1 / 2 👥 ]</b>\n\n"
        f"⚪ <b>Белые:</b> {user_name} <i>(в игре)</i>\n"
        f"⚫ <b>Чёрные:</b> <i>[ свободно — жми кнопку ]</i>\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"Нажми кнопку ниже, чтобы открыть Mini App!"
    )

    result = InlineQueryResultArticle(
        id=room_id,
        title=f"♟️ Создать комнату #{room_id} [ 👤 1 / 2 👥 ]",
        description="Отправить приглашение сыграть в шашки в этот чат",
        thumbnail_url="https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/265f.png",
        input_message_content=InputTextMessageContent(
            message_text=message_text,
            parse_mode="HTML",
        ),
        reply_markup=keyboard,
    )

    # Кнопка над результатами поиска
    button = InlineQueryResultsButton(
        text="🎮 Быстрая игра в шашки",
        web_app=WebAppInfo(url=f"{FRONTEND_URL}?room={room_id}"),
    )

    await query.answer(
        results=[result],
        cache_time=0,
        is_personal=True,
        button=button,
    )
