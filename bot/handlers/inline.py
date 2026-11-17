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
    """
    room_id = uuid.uuid4().hex[:6].upper()
    user_name = query.from_user.first_name
    if query.from_user.username:
        user_name += f" (@{query.from_user.username})"

    app_url = f"https://t.me/gameddd_bot/app?startapp={room_id}"

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Войти в игру",
                    url=app_url,
                )
            ]
        ]
    )

    message_text = (
        f"<b>Шашки • Комната #{room_id}</b>\n\n"
        f"Белые: {user_name}\n"
        f"Чёрные: [ Ожидание игрока ]\n\n"
        f"Нажмите кнопку ниже, чтобы присоединиться к партии."
    )

    result = InlineQueryResultArticle(
        id=room_id,
        title=f"Создать партию #{room_id}",
        description=f"Пригласить в шашки ({user_name})",
        thumbnail_url="https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/265f.png",
        input_message_content=InputTextMessageContent(
            message_text=message_text,
            parse_mode="HTML",
        ),
        reply_markup=keyboard,
    )

    button = InlineQueryResultsButton(
        text="Открыть шашки",
        web_app=WebAppInfo(url=f"{FRONTEND_URL}?room={room_id}"),
    )

    await query.answer(
        results=[result],
        cache_time=0,
        is_personal=True,
        button=button,
    )
