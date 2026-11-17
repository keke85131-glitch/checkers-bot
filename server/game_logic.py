"""
Russian Checkers (Draughts) 8x8 game logic.

Board values:
  0  = empty
  1  = white piece
 -1  = black piece
  2  = white king
 -2  = black king

Rows 0-2 start with black pieces; rows 5-7 start with white pieces.
White moves toward row 0 (decreasing row index).
Black moves toward row 7 (increasing row index).
"""

from __future__ import annotations
from typing import List, Optional, Tuple

Capture = List[Tuple[int, int]]  # list of (row, col) squares captured
Move = Tuple[int, int, int, int, Capture]  # (from_r, from_c, to_r, to_c, captures)


class CheckersGame:
    def __init__(self) -> None:
        self.board: List[List[int]] = self._initial_board()
        self.current_turn: int = 1  # 1 = white moves first
        self.winner: Optional[int] = None

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    @staticmethod
    def _initial_board() -> List[List[int]]:
        board = [[0] * 8 for _ in range(8)]
        # Black pieces on rows 0-2 (dark squares)
        for r in range(3):
            for c in range(8):
                if (r + c) % 2 == 1:
                    board[r][c] = -1
        # White pieces on rows 5-7 (dark squares)
        for r in range(5, 8):
            for c in range(8):
                if (r + c) % 2 == 1:
                    board[r][c] = 1
        return board

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_valid_moves(self, player: int) -> List[Move]:
        """Return all legal moves for *player*.  Captures are mandatory."""
        captures = self._all_captures(player)
        if captures:
            return captures
        return self._all_simple_moves(player)

    def make_move(self, from_r: int, from_c: int, to_r: int, to_c: int) -> bool:
        """Apply a move if it is in the legal move list.  Returns True on success."""
        legal = self.get_valid_moves(self.current_turn)
        matched: Optional[Move] = None
        for m in legal:
            if m[0] == from_r and m[1] == from_c and m[2] == to_r and m[3] == to_c:
                matched = m
                break
        if matched is None:
            return False

        piece = self.board[from_r][from_c]
        self.board[from_r][from_c] = 0
        self.board[to_r][to_c] = piece

        # Remove captured pieces
        for cap_r, cap_c in matched[4]:
            self.board[cap_r][cap_c] = 0

        # Promote to king
        if piece == 1 and to_r == 0:
            self.board[to_r][to_c] = 2
        elif piece == -1 and to_r == 7:
            self.board[to_r][to_c] = -2

        # Switch turn
        self.current_turn = -self.current_turn
        self.winner = self.check_winner()
        return True

    def check_winner(self) -> Optional[int]:
        """Return 1 (white wins), -1 (black wins), or None (game ongoing)."""
        whites = sum(1 for r in self.board for v in r if v > 0)
        blacks = sum(1 for r in self.board for v in r if v < 0)
        if whites == 0:
            return -1
        if blacks == 0:
            return 1
        # Check if current player has any moves
        if not self.get_valid_moves(self.current_turn):
            return -self.current_turn
        return None

    def to_dict(self) -> dict:
        return {
            "board": self.board,
            "current_turn": self.current_turn,
            "winner": self.winner,
        }

    # ------------------------------------------------------------------
    # Move generation helpers
    # ------------------------------------------------------------------

    def _all_simple_moves(self, player: int) -> List[Move]:
        moves: List[Move] = []
        for r in range(8):
            for c in range(8):
                piece = self.board[r][c]
                if not self._owns(player, piece):
                    continue
                if abs(piece) == 2:
                    moves.extend(self._king_simple(r, c))
                else:
                    moves.extend(self._pawn_simple(r, c, player))
        return moves

    def _pawn_simple(self, r: int, c: int, player: int) -> List[Move]:
        moves: List[Move] = []
        # White moves up (decreasing r), black moves down (increasing r)
        directions = [(-1, -1), (-1, 1)] if player == 1 else [(1, -1), (1, 1)]
        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            if 0 <= nr < 8 and 0 <= nc < 8 and self.board[nr][nc] == 0:
                moves.append((r, c, nr, nc, []))
        return moves

    def _king_simple(self, r: int, c: int) -> List[Move]:
        moves: List[Move] = []
        for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
            nr, nc = r + dr, c + dc
            while 0 <= nr < 8 and 0 <= nc < 8 and self.board[nr][nc] == 0:
                moves.append((r, c, nr, nc, []))
                nr += dr
                nc += dc
        return moves

    # ------------------------------------------------------------------
    # Capture generation (recursive, mandatory longest capture in Russian rules)
    # ------------------------------------------------------------------

    def _all_captures(self, player: int) -> List[Move]:
        """Return all capture sequences for *player* (mandatory-capture rule applied)."""
        all_seqs: List[Move] = []
        for r in range(8):
            for c in range(8):
                piece = self.board[r][c]
                if not self._owns(player, piece):
                    continue
                is_king = abs(piece) == 2
                seqs = self._capture_sequences(r, c, player, is_king, [], self.board)
                all_seqs.extend(seqs)
        if not all_seqs:
            return []
        # Russian checkers: must take the maximum number of pieces
        max_caps = max(len(m[4]) for m in all_seqs)
        return [m for m in all_seqs if len(m[4]) == max_caps]

    def _capture_sequences(
        self,
        r: int,
        c: int,
        player: int,
        is_king: bool,
        captured: List[Tuple[int, int]],
        board: List[List[int]],
    ) -> List[Move]:
        """Recursively build all capture chains starting at (r, c)."""
        found: List[Move] = []
        directions = [(-1, -1), (-1, 1), (1, -1), (1, 1)]

        for dr, dc in directions:
            if is_king:
                # King slides until it finds an enemy, then can land on any
                # empty square beyond it.
                enemy_r, enemy_c = None, None
                nr, nc = r + dr, c + dc
                while 0 <= nr < 8 and 0 <= nc < 8:
                    cell = board[nr][nc]
                    if cell == 0:
                        if enemy_r is not None:
                            # Can land here after jumping enemy
                            new_cap = list(captured) + [(enemy_r, enemy_c)]
                            new_board = self._apply_temp(board, r, c, nr, nc, (enemy_r, enemy_c))
                            further = self._capture_sequences(nr, nc, player, True, new_cap, new_board)
                            if further:
                                found.extend(further)
                            else:
                                found.append((r, c, nr, nc, new_cap))  # type: ignore[arg-type]
                        nr += dr
                        nc += dc
                    elif self._is_enemy(player, cell) and (nr, nc) not in captured:
                        if enemy_r is not None:
                            break  # two enemies in a row — can't jump
                        enemy_r, enemy_c = nr, nc
                        nr += dr
                        nc += dc
                    else:
                        break
            else:
                # Pawn: jump over adjacent enemy to the square beyond
                er, ec = r + dr, c + dc
                lr, lc = r + 2 * dr, c + 2 * dc
                if not (0 <= er < 8 and 0 <= ec < 8 and 0 <= lr < 8 and 0 <= lc < 8):
                    continue
                if self._is_enemy(player, board[er][ec]) and (er, ec) not in captured and board[lr][lc] == 0:
                    new_cap = list(captured) + [(er, ec)]
                    new_board = self._apply_temp(board, r, c, lr, lc, (er, ec))
                    # Promote mid-sequence? In Russian rules, a pawn promoted
                    # mid-jump does NOT continue as a king in that same turn.
                    further = self._capture_sequences(lr, lc, player, is_king, new_cap, new_board)
                    if further:
                        found.extend(further)
                    else:
                        found.append((r, c, lr, lc, new_cap))  # type: ignore[arg-type]

        return found

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    @staticmethod
    def _owns(player: int, piece: int) -> bool:
        return piece != 0 and (piece > 0) == (player > 0)

    @staticmethod
    def _is_enemy(player: int, piece: int) -> bool:
        return piece != 0 and (piece > 0) != (player > 0)

    @staticmethod
    def _apply_temp(
        board: List[List[int]],
        from_r: int,
        from_c: int,
        to_r: int,
        to_c: int,
        remove: Tuple[int, int],
    ) -> List[List[int]]:
        """Return a shallow copy of *board* with the move applied (for recursion)."""
        new = [row[:] for row in board]
        new[to_r][to_c] = new[from_r][from_c]
        new[from_r][from_c] = 0
        new[remove[0]][remove[1]] = 0
        return new
