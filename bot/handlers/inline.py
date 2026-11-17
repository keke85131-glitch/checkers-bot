import html
import uuid

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

from bot.config import FRONTEND_URL

router = Router()


@router.inline_query()
async def inline_checkers(query: InlineQuery):
    """
    Inline-режим: пользователь пишет @gameddd_bot в любом чате (ЛС или группа).
    Отправляет карточку партии с чистым текстом без лишних эмодзи и кнопкой [ Войти в игру ].
    """
    q = query.query.strip().upper()
    if q and len(q) <= 12 and q.isalnum():
        room_id = q
    else:
        room_id = uuid.uuid4().hex[:6].upper()

    user_name = query.from_user.first_name or "Игрок"
    if query.from_user.username:
        user_name += f" (@{query.from_user.username})"
    safe_user_name = html.escape(user_name)

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
        f"Белые: {safe_user_name}\n"
        f"Чёрные: [ Ожидание игрока ]\n\n"
        f"Нажмите кнопку ниже, чтобы присоединиться к партии."
    )

    result = InlineQueryResultArticle(
        id=room_id,
        title=f"Создать партию #{room_id}",
        description=f"Пригласить в шашки ({user_name})",
        input_message_content=InputTextMessageContent(
            message_text=message_text,
            parse_mode="HTML",
        ),
        reply_markup=keyboard,
    )

    frontend_base = FRONTEND_URL.rstrip("/")
    button = InlineQueryResultsButton(
        text="Открыть шашки",
        web_app=WebAppInfo(url=f"{frontend_base}/?room={room_id}"),
    )

    await query.answer(
        results=[result],
        cache_time=0,
        is_personal=True,
        button=button,
    )
