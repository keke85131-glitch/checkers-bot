from aiogram import Router
from aiogram.types import (
    InlineQuery,
    InlineQueryResultArticle,
    InputTextMessageContent,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)
import aiohttp
import uuid

from bot.config import BACKEND_URL, FRONTEND_URL

router = Router()


@router.inline_query()
async def inline_checkers(query: InlineQuery):
    """
    Inline-режим: пользователь пишет @BotName в любом чате.
    Создаём комнату на backend, возвращаем кнопку Web App.
    """
    player_id = str(query.from_user.id)
    room_id: str | None = None

    # Попытка создать комнату напрямую в памяти (если бот и сервер запущены вместе)
    try:
        from server.room_manager import RoomManager
        room_id = RoomManager().create_room()
    except Exception:
        room_id = None

    # Если не вышло — пробуем через HTTP API
    if not room_id:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{BACKEND_URL}/api/room/create",
                    json={"creator_id": player_id},
                    timeout=aiohttp.ClientTimeout(total=3),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        room_id = data.get("room_id")
        except Exception:
            room_id = None

    if not room_id:
        # Fallback: генерируем id локально
        room_id = uuid.uuid4().hex[:8].upper()

    # Не передаём pid в URL, чтобы второй игрок получил свой уникальный ID в Mini App
    game_url = f"{FRONTEND_URL}?room={room_id}"

    # Кнопка, которая откроет Web App
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎮 Играть в шашки",
                    web_app=WebAppInfo(url=game_url),
                )
            ]
        ]
    )

    result = InlineQueryResultArticle(
        id=room_id,
        title="Шашки — создать партию",
        description="Пригласи друга сыграть в шашки прямо в Telegram",
        thumbnail_url="https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/265f.png",
        input_message_content=InputTextMessageContent(
            message_text=(
                f"♟️ <b>Игра в шашки</b>\n"
                f"Комната: <code>{room_id}</code>\n"
                f"Нажми кнопку ниже, чтобы присоединиться!"
            ),
            parse_mode="HTML",
        ),
        reply_markup=keyboard,
    )

    await query.answer(
        results=[result],
        cache_time=0,
        is_personal=True,
    )
