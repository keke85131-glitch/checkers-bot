"""
Room manager for Checkers Mini App.

Provides a singleton RoomManager that creates and tracks game rooms.
Each Room holds the game state, connected players and a turn timer.
"""

from __future__ import annotations

import asyncio
import random
import string
from dataclasses import dataclass, field
from typing import Dict, Optional

from server.game_logic import CheckersGame


def _random_id(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


@dataclass
class PlayerInfo:
    player_id: str
    color: int  # 1 or -1
    websocket: object  # fastapi WebSocket


@dataclass
class Room:
    room_id: str
    game: CheckersGame = field(default_factory=CheckersGame)
    # key = player_id, value = PlayerInfo
    players: Dict[str, PlayerInfo] = field(default_factory=dict)
    current_turn: int = 1  # mirrors game.current_turn for quick access
    timer_task: Optional[asyncio.Task] = field(default=None, compare=False)
    timer_seconds: int = 60

    @property
    def is_full(self) -> bool:
        return len(self.players) >= 2

    @property
    def players_count(self) -> int:
        return len(self.players)

    def color_for(self, player_id: str) -> Optional[int]:
        info = self.players.get(player_id)
        return info.color if info else None


class RoomManager:
    """Singleton room manager."""

    _instance: Optional["RoomManager"] = None

    def __new__(cls) -> "RoomManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._rooms: Dict[str, Room] = {}
        return cls._instance

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_room(self) -> str:
        """Create a new room and return its 8-character ID."""
        while True:
            room_id = _random_id(8)
            if room_id not in self._rooms:
                break
        self._rooms[room_id] = Room(room_id=room_id)
        return room_id

    def join_room(self, room_id: str, player_id: str, websocket: object) -> Optional[int]:
        """
        Add *player_id* to the room.

        Returns the player's color (1 = white, -1 = black) or None if the
        room is full or does not exist.
        """
        room = self._rooms.get(room_id)
        if room is None:
            return None

        # Already in the room (reconnect)
        if player_id in room.players:
            room.players[player_id].websocket = websocket
            return room.players[player_id].color

        if room.is_full:
            return None

        # First player gets white (1), second gets black (-1)
        color = 1 if not room.players else -1
        room.players[player_id] = PlayerInfo(player_id=player_id, color=color, websocket=websocket)
        return color

    def get_room(self, room_id: str) -> Optional[Room]:
        return self._rooms.get(room_id)

    def remove_player(self, room_id: str, player_id: str) -> None:
        room = self._rooms.get(room_id)
        if room and player_id in room.players:
            del room.players[player_id]

    def delete_room(self, room_id: str) -> None:
        self._rooms.pop(room_id, None)
