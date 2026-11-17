"""
FastAPI backend for Telegram Checkers Mini App.

Endpoints:
  POST /api/room/create          → {"room_id": "XXXXXXXX"}
  GET  /api/room/{room_id}       → {"status": "waiting"|"playing", "players_count": n}
  WS   /ws/{room_id}/{player_id} ↔ game messages

WebSocket message types (server → client):
  {type: "game_state", board, current_turn, valid_moves, winner,
         your_color, timer_seconds}
  {type: "timeout", loser}
  {type: "error",   message}

WebSocket message types (client → server):
  {type: "move", from_r, from_c, to_r, to_c}
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import json
import logging
import os
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
if os.path.exists(env_path):
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
    except Exception:
        pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from server.game_logic import CheckersGame
from server.room_manager import Room, RoomManager

FRONTEND_URL = os.getenv("FRONTEND_URL", "*")
TURN_TIMEOUT = 60  # seconds


@asynccontextmanager
async def lifespan(app: FastAPI):
    bot_task = None
    bot = None
    bot_token = os.getenv("BOT_TOKEN")
    if bot_token:
        try:
            from aiogram import Bot, Dispatcher
            from aiogram.client.default import DefaultBotProperties
            from aiogram.enums import ParseMode
            from bot.handlers import inline, game

            bot = Bot(token=bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
            dp = Dispatcher()
            dp.include_router(game.router)
            dp.include_router(inline.router)
            bot_task = asyncio.create_task(
                dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
            )
            logger.info("Telegram Bot polling started in background!")
        except Exception as e:
            logger.error("Failed to start Telegram Bot polling: %s", e)
    yield
    if bot_task:
        bot_task.cancel()
    if bot:
        await bot.session.close()


app = FastAPI(title="Checkers Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

room_manager = RoomManager()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize_moves(moves: List) -> List[Dict]:
    """Convert Move tuples to JSON-friendly dicts."""
    result = []
    for m in moves:
        result.append(
            {
                "from_r": m[0],
                "from_c": m[1],
                "to_r": m[2],
                "to_c": m[3],
                "captures": [{"r": cr, "c": cc} for cr, cc in m[4]],
            }
        )
    return result


async def _build_game_state(room: Room, your_color: int) -> Dict[str, Any]:
    game = room.game
    valid_moves = game.get_valid_moves(game.current_turn) if game.winner is None else []
    return {
        "type": "game_state",
        "room_id": room.room_id,
        "board": game.board,
        "current_turn": game.current_turn,
        "valid_moves": _serialize_moves(valid_moves),
        "winner": game.winner,
        "your_color": your_color,
        "timer_seconds": room.timer_seconds,
        "players": [
            {
                "id": p.player_id,
                "name": p.player_name,
                "color": p.color,
                "online": True,
            }
            for p in room.players.values()
        ],
        "is_full": room.is_full,
    }


async def _broadcast(room: Room, message: Dict[str, Any], exclude_player: Optional[str] = None) -> None:
    """Send *message* to all connected players in the room."""
    dead: List[str] = []
    for pid, info in room.players.items():
        if pid == exclude_player:
            continue
        try:
            await info.websocket.send_text(json.dumps(message))
        except Exception:
            dead.append(pid)
    for pid in dead:
        room_manager.remove_player(room.room_id, pid)


async def _send_state_to_all(room: Room) -> None:
    """Send personalised game_state to each connected player."""
    for pid, info in list(room.players.items()):
        state = await _build_game_state(room, info.color)
        try:
            await info.websocket.send_text(json.dumps(state))
        except Exception:
            room_manager.remove_player(room.room_id, pid)


# ---------------------------------------------------------------------------
# Turn timer
# ---------------------------------------------------------------------------


async def _run_timer(room: Room) -> None:
    """Count down the turn timer; declare a loser on timeout."""
    room.timer_seconds = TURN_TIMEOUT
    try:
        while room.timer_seconds > 0:
            await asyncio.sleep(1)
            room.timer_seconds -= 1
            # Broadcast current timer every second so clients stay in sync
            await _broadcast(
                room,
                {
                    "type": "timer_tick",
                    "timer_seconds": room.timer_seconds,
                    "current_turn": room.game.current_turn,
                },
            )
        # Time is up — current player loses
        loser = room.game.current_turn
        room.game.winner = -loser
        await _broadcast(room, {"type": "timeout", "loser": loser})
        await _send_state_to_all(room)

    except asyncio.CancelledError:
        pass  # Timer was cancelled because a move was made


def _reset_timer(room: Room) -> None:
    """Cancel any running timer and start a fresh one."""
    if room.timer_task and not room.timer_task.done():
        room.timer_task.cancel()
    room.timer_seconds = TURN_TIMEOUT
    room.timer_task = asyncio.create_task(_run_timer(room))


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------


@app.post("/api/room/create")
async def create_room():
    room_id = room_manager.create_room()
    logger.info("Room created: %s", room_id)
    return {"room_id": room_id}


@app.get("/api/room/{room_id}")
async def get_room(room_id: str):
    room = room_manager.get_room(room_id)
    if room is None:
        return {"status": "not_found", "players_count": 0}
    status = "playing" if room.is_full else "waiting"
    return {"status": status, "players_count": room.players_count}


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------


@app.websocket("/ws/{room_id}/{player_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    player_id: str,
    name: Optional[str] = None,
):
    await websocket.accept()

    display_name = name or f"Игрок {player_id[-4:]}"
    room = room_manager.get_or_create_room(room_id)

    color = room_manager.join_room(room_id, player_id, display_name, websocket)
    if color is None:
        await websocket.send_text(json.dumps({"type": "error", "message": "Комната уже заполнена"}))
        await websocket.close()
        return

    logger.info("Player %s (%s) joined room %s as color %d", player_id, display_name, room_id, color)

    # Broadcast updated room state to all players in this room
    await _send_state_to_all(room)

    # If both players are now connected, start the timer
    if room.is_full and (room.timer_task is None or room.timer_task.done()):
        _reset_timer(room)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            if data.get("type") == "move":
                await _handle_move(room, player_id, color, data, websocket)
            else:
                await websocket.send_text(
                    json.dumps({"type": "error", "message": f"Unknown message type: {data.get('type')}"})
                )

    except WebSocketDisconnect:
        logger.info("Player %s disconnected from room %s", player_id, room_id)
        room_manager.remove_player(room_id, player_id)
        if room.players:
            await _send_state_to_all(room)


async def _handle_move(
    room: Room,
    player_id: str,
    color: int,
    data: Dict[str, Any],
    websocket: WebSocket,
) -> None:
    game = room.game

    # Validate it is this player's turn
    if game.current_turn != color:
        await websocket.send_text(json.dumps({"type": "error", "message": "Not your turn"}))
        return

    # Parse move coordinates
    try:
        from_r = int(data["from_r"])
        from_c = int(data["from_c"])
        to_r = int(data["to_r"])
        to_c = int(data["to_c"])
    except (KeyError, ValueError):
        await websocket.send_text(json.dumps({"type": "error", "message": "Invalid move data"}))
        return

    success = game.make_move(from_r, from_c, to_r, to_c)
    if not success:
        await websocket.send_text(json.dumps({"type": "error", "message": "Illegal move"}))
        return

    # Move accepted — reset timer and broadcast new state
    if game.winner is None:
        _reset_timer(room)
    else:
        # Game over: cancel timer
        if room.timer_task and not room.timer_task.done():
            room.timer_task.cancel()

    await _send_state_to_all(room)


# Mount static files for Mini App frontend
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

