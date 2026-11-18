"""
Room manager for Checkers Mini App.
Tracks game rooms and connected players.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Dict, Optional
import uuid

from server.game_logic import CheckersGame


@dataclass
class PlayerInfo:
    player_id: str
    player_name: str
    color: int  # 1 (White) or -1 (Black)
    websocket: Optional[object] = None  # fastapi WebSocket
    online: bool = True
    ready: bool = False


@dataclass
class Room:
    room_id: str
    game: CheckersGame = field(default_factory=CheckersGame)
    players: Dict[str, PlayerInfo] = field(default_factory=dict)
    current_turn: int = 1
    timer_task: Optional[asyncio.Task] = field(default=None, compare=False)
    countdown_task: Optional[asyncio.Task] = field(default=None, compare=False)
    timer_seconds: int = 60
    inline_message_id: Optional[str] = None
    creator_name: Optional[str] = None
    game_started: bool = False
    counting_down: bool = False
    game_started: bool = False

    @property
    def is_full(self) -> bool:
        return len(self.players) >= 2

    @property
    def is_ready_to_play(self) -> bool:
        return len(self.players) >= 2 and all(p.online and p.ready for p in self.players.values())

    @property
    def ready_count(self) -> int:
        return sum(1 for p in self.players.values() if p.online and p.ready)

    @property
    def players_count(self) -> int:
        return len(self.players)

    @property
    def white_player(self) -> Optional[PlayerInfo]:
        return next((p for p in self.players.values() if p.color == 1), None)

    @property
    def black_player(self) -> Optional[PlayerInfo]:
        return next((p for p in self.players.values() if p.color == -1), None)

    def color_for(self, player_id: str) -> Optional[int]:
        info = self.players.get(player_id)
        return info.color if info else None

    def set_player_ready(self, player_id: str, ready: bool) -> bool:
        if player_id in self.players:
            self.players[player_id].ready = ready
            return True
        return False

    def reset_readiness(self) -> None:
        for p in self.players.values():
            p.ready = False


class RoomManager:
    _instance: Optional["RoomManager"] = None

    def __new__(cls) -> "RoomManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._rooms: Dict[str, Room] = {}
        return cls._instance

    def create_room(self) -> str:
        room_id = uuid.uuid4().hex[:6].upper()
        self.get_or_create_room(room_id)
        return room_id

    def get_or_create_room(self, room_id: str) -> Room:
        clean_id = room_id.upper().strip()
        if clean_id not in self._rooms:
            self._rooms[clean_id] = Room(room_id=clean_id)
        return self._rooms[clean_id]

    def join_room(self, room_id: str, player_id: str, player_name: str, websocket: object) -> Optional[int]:
        room = self.get_or_create_room(room_id)

        # Reconnection: player is already in this room
        if player_id in room.players:
            p = room.players[player_id]
            p.websocket = websocket
            p.player_name = player_name
            p.online = True
            return p.color

        if room.is_full:
            return None

        # Assign the color that is currently free (prefer White=1 first)
        used_colors = {p.color for p in room.players.values()}
        color = 1 if 1 not in used_colors else -1
        room.players[player_id] = PlayerInfo(
            player_id=player_id,
            player_name=player_name,
            color=color,
            websocket=websocket,
            online=True
        )
        return color

    def get_room(self, room_id: str) -> Optional[Room]:
        return self._rooms.get(room_id.upper().strip())

    def remove_player(self, room_id: str, player_id: str) -> None:
        room = self.get_room(room_id)
        if room and player_id in room.players:
            del room.players[player_id]

    def delete_room(self, room_id: str) -> None:
        self._rooms.pop(room_id.upper().strip(), None)
