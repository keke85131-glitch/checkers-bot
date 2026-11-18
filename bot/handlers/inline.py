import html
import logging
import os
from typing import Optional
import uuid

from aiogram import Bot, Router
from aiogram.types import (
    ChosenInlineResult,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQuery,
    InlineQueryResultArticle,
    InputTextMessageContent,
)

from bot.instance import get_bot
from server.room_manager import RoomManager

logger = logging.getLogger(__name__)

router = Router()
room_manager = RoomManager()

# Кастомные анимированные эмодзи Telegram
EMOJI_WHITE_CHECKER = '<tg-emoji emoji-id="5470071975978251466">⚪</tg-emoji>'
EMOJI_BLACK_CHECKER = '<tg-emoji emoji-id="5469981541146862363">⚫</tg-emoji>'
EMOJI_GREEN_ONLINE  = '<tg-emoji emoji-id="5469988022252514573">🟢</tg-emoji>'
EMOJI_GRAY_OFFLINE  = '<tg-emoji emoji-id="5469817348842107485">🔘</tg-emoji>'
EMOJI_TROPHY        = '<tg-emoji emoji-id="5467724445638504471">🏆</tg-emoji>'


def get_app_url(room_id: str) -> str:
    host_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "tunnel_host.txt")
    host_prefix = "2baca35c7adc9c"
    if os.path.exists(host_file):
        try:
            with open(host_file, "r", encoding="utf-8") as f:
                c = f.read().strip()
                if c:
                    host_prefix = c.split(".")[0]
        except Exception:
            pass
    return f"https://t.me/gameddd_bot/app?startapp={room_id}_{host_prefix}"


async def update_room_message(room_id: str, bot: Optional[Bot] = None) -> bool:
    """
    Динамически обновляет карточку партии в чате Telegram через editMessageText по inline_message_id.
    Поддерживает статусы:
    - Ожидание второго игрока
    - Ожидание готовности (1/2)
    - Оба готовы! Запуск...
    - Партия идёт • Ход Белых/Чёрных
    - Ожидание возвращения игрока...
    - Завершение партии (Победитель)
    """
    if bot is None:
        bot = get_bot()
    if not bot:
        logger.warning("No bot instance available to update message for room %s", room_id)
        return False

    room = room_manager.get_room(room_id)
    if not room or not room.inline_message_id:
        logger.debug("Room %s has no inline_message_id yet", room_id)
        return False

    clean_room_id = room.room_id.upper()
    app_url = get_app_url(clean_room_id)

    p1 = room.white_player
    p2 = room.black_player

    p1_name = html.escape(p1.player_name) if p1 else html.escape(room.creator_name or "Белые")
    p2_name = html.escape(p2.player_name) if p2 else "Ожидание соперника..."

    p1_online = p1 is not None and p1.online
    p2_online = p2 is not None and p2.online

    # Индикаторы и подписи для каждого игрока
    if p1_online:
        ind_p1 = EMOJI_GREEN_ONLINE
        st_p1 = "Готов" if p1.ready else "В игре"
    elif p1 is not None:
        ind_p1 = EMOJI_GRAY_OFFLINE
        st_p1 = "Отошёл"
    else:
        ind_p1 = EMOJI_GRAY_OFFLINE
        st_p1 = "Не в игре"

    if p2_online:
        ind_p2 = EMOJI_GREEN_ONLINE
        st_p2 = "Готов" if p2.ready else "В игре"
    elif p2 is not None:
        ind_p2 = EMOJI_GRAY_OFFLINE
        st_p2 = "Отошёл"
    else:
        ind_p2 = None
        st_p2 = "Ожидание соперника..."

    p1_line = f"┌ {EMOJI_WHITE_CHECKER} <b>Белые:</b> {p1_name} • {ind_p1} <i>{st_p1}</i>"
    if ind_p2:
        p2_line = f"└ {EMOJI_BLACK_CHECKER} <b>Чёрные:</b> {p2_name} • {ind_p2} <i>{st_p2}</i>"
    else:
        p2_line = f"└ {EMOJI_BLACK_CHECKER} <b>Чёрные:</b> <i>{st_p2}</i>"

    game = room.game

    # 1. Завершение партии: победа / поражение / таймаут
    if game.winner is not None:
        if game.winner == 1:
            winner_name = f"{p1_name} (Белые)"
        elif game.winner == -1:
            winner_name = f"{p2_name} (Чёрные)"
        else:
            winner_name = "Ничья"
        status_text = f"{EMOJI_TROPHY} <b>Победитель:</b> {winner_name}"
        button_text = "🔄 Новая игра"

    # 2. Если игра уже началась (активная партия)
    elif room.game_started:
        if not p1_online or not p2_online:
            status_text = "<b>Статус:</b> Ожидание возвращения игрока..."
            button_text = "🎮 Вернуться в игру"
        else:
            turn_color = "Белых" if game.current_turn == 1 else "Чёрных"
            status_text = f"<b>Статус:</b> Партия идёт • Ход {turn_color}"
            button_text = "🎮 Открыть партию"

    # 3. Оба игрока онлайн и готовы, либо идёт обратный отсчет
    elif room.is_full and p1_online and p2_online and (
        (getattr(room, "countdown_task", None) and not room.countdown_task.done())
        or (p1.ready and p2.ready)
    ):
        status_text = "<b>Статус:</b> Оба готовы! Запуск..."
        button_text = "🎮 Открыть партию"

    # 4. Оба игрока подключены, ожидание нажатия «Готов»
    elif room.is_full and p1_online and p2_online:
        ready_count = (1 if p1.ready else 0) + (1 if p2.ready else 0)
        status_text = f"<b>Статус:</b> Ожидание готовности игроков ({ready_count}/2)"
        button_text = "🎮 Войти в игру"

    # 5. Если оба зарегистрированы, но кто-то отошёл/свернул
    elif room.is_full and (not p1_online or not p2_online):
        status_text = "<b>Статус:</b> Ожидание возвращения игрока..."
        button_text = "🎮 Вернуться в игру"

    # 6. Только один игрок реально в сети (зашёл в игру)
    elif p1_online or p2_online:
        status_text = "<b>Статус:</b> Создатель в игре • Ожидание соперника"
        button_text = "🎮 Войти в игру"

    # 7. Никто ещё не зашёл в игру (партия создана, сообщение только что отправлено)
    else:
        status_text = "<b>Статус:</b> Партия создана • Ожидание игроков"
        button_text = "🎮 Войти в игру"

    text = (
        f"<b>Шашки 8×8 • Комната #{clean_room_id}</b>\n\n"
        f"{p1_line}\n"
        f"{p2_line}\n\n"
        f"{status_text}"
    )

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=button_text,
                    url=app_url,
                )
            ]
        ]
    )

    try:
        await bot.edit_message_text(
            inline_message_id=room.inline_message_id,
            text=text,
            parse_mode="HTML",
            reply_markup=keyboard,
        )
        logger.info("Updated inline message for room %s (status: %s)", clean_room_id, button_text)
        return True
    except Exception as e:
        err_msg = str(e).lower()
        if "message is not modified" in err_msg:
            return True
        logger.warning("Failed to edit inline message for room %s: %s", clean_room_id, e)
        return False


@router.inline_query()
async def inline_checkers(query: InlineQuery):
    """
    Inline-режим: пользователь пишет @gameddd_bot в любом чате (ЛС или группа).
    Возвращает РОВНО ОДНУ понятную плашку:
    - Title: 🎮 Создать партию в шашки
    - Description: Игра на двоих 8×8 в реальном времени
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

    room = room_manager.get_or_create_room(room_id)
    if not room.creator_name:
        room.creator_name = user_name

    app_url = get_app_url(room_id)

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎮 Войти в игру",
                    url=app_url,
                )
            ]
        ]
    )

    message_text = (
        f"<b>Шашки 8×8 • Комната #{room_id}</b>\n\n"
        f"┌ {EMOJI_WHITE_CHECKER} <b>Белые:</b> {safe_user_name} • {EMOJI_GRAY_OFFLINE} <i>Не в игре</i>\n"
        f"└ {EMOJI_BLACK_CHECKER} <b>Чёрные:</b> <i>Ожидание соперника...</i>\n\n"
        f"<b>Статус:</b> Партия создана • Ожидание игроков"
    )

    result = InlineQueryResultArticle(
        id=room_id,
        title="🎮 Создать партию в шашки",
        description="Игра на двоих 8×8 в реальном времени",
        input_message_content=InputTextMessageContent(
            message_text=message_text,
            parse_mode="HTML",
        ),
        reply_markup=keyboard,
    )

    await query.answer(
        results=[result],
        cache_time=0,
        is_personal=True,
    )


@router.chosen_inline_result()
async def on_chosen_inline_result(chosen: ChosenInlineResult, bot: Bot):
    """
    Вызывается при отправке пользователем карточки партии в чат.
    Telegram передаёт chosen.inline_message_id, привязываем его к комнате.
    """
    room_id = chosen.result_id.upper().strip()
    inline_msg_id = chosen.inline_message_id
    logger.info("Chosen inline result for room %s, inline_message_id: %s", room_id, inline_msg_id)

    if not inline_msg_id:
        return

    room = room_manager.get_or_create_room(room_id)
    room.inline_message_id = inline_msg_id

    user_name = chosen.from_user.first_name or "Игрок"
    if chosen.from_user.username:
        user_name += f" (@{chosen.from_user.username})"

    if not room.creator_name:
        room.creator_name = user_name

    await update_room_message(room_id, bot=bot)
