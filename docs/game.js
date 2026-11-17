/* =================================================================
   Telegram Checkers — Minimalist Realtime Game
   Bulletproof Room Discovery & Instant Realtime WebSocket Sync
   ================================================================= */

// ---------- Telegram Mini App Init ----------
const tg = window.Telegram?.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
  } catch (e) {}
}

function haptic(type = 'light') {
  try {
    if (tg?.HapticFeedback) {
      if (type === 'success' || type === 'error') {
        tg.HapticFeedback.notificationOccurred(type);
      } else {
        tg.HapticFeedback.impactOccurred(type);
      }
    }
  } catch (e) {}
}

// ---------- User Identity ----------
const tgUser = tg?.initDataUnsafe?.user;
const MY_ID = tgUser?.id ? String(tgUser.id) : ('u_' + Math.random().toString(36).substring(2, 8));
const MY_NAME = tgUser 
  ? (tgUser.first_name + (tgUser.username ? ` (@${tgUser.username})` : ''))
  : ('Игрок ' + MY_ID.slice(-4));

// ---------- Bulletproof Room ID Extraction ----------
function resolveRoomId() {
  // 1. From Telegram WebApp SDK
  if (tg?.initDataUnsafe?.start_param) {
    return tg.initDataUnsafe.start_param.toUpperCase();
  }

  // 2. From search query (?startapp=... or ?tgWebAppStartParam=... or ?room=...)
  const sParams = new URLSearchParams(window.location.search);
  const fromSearch = sParams.get('startapp') || sParams.get('tgWebAppStartParam') || sParams.get('room');
  if (fromSearch) return fromSearch.toUpperCase();

  // 3. From URL hash (#tgWebAppStartParam=... or #startapp=...)
  if (window.location.hash) {
    const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const hParams = new URLSearchParams(rawHash);
    const fromHash = hParams.get('tgWebAppStartParam') || hParams.get('startapp') || hParams.get('room');
    if (fromHash) return fromHash.toUpperCase();
  }

  // 4. Default: generate room ID
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const ROOM_ID = resolveRoomId();

// ---------- DOM Elements ----------
const $screenLobby    = document.getElementById('screen-lobby');
const $screenGame     = document.getElementById('screen-game');
const $screenGameOver = document.getElementById('screen-gameover');
const $roomTag        = document.getElementById('room-tag');
const $nameP1         = document.getElementById('name-p1');
const $nameP2         = document.getElementById('name-p2');
const $statusP1       = document.getElementById('status-p1');
const $statusP2       = document.getElementById('status-p2');
const $btnShare       = document.getElementById('btn-share');
const $btnPlayBot     = document.getElementById('btn-play-bot');
const $btnRestart     = document.getElementById('btn-restart');
const $board          = document.getElementById('board');
const $timer          = document.getElementById('timer');
const $myName         = document.getElementById('my-name');
const $oppName        = document.getElementById('opp-name');
const $myCount        = document.getElementById('my-count');
const $oppCount       = document.getElementById('opp-count');
const $myMarker       = document.getElementById('my-marker');
const $oppMarker      = document.getElementById('opp-marker');
const $turnInfo       = document.getElementById('turn-info');
const $resultTitle    = document.getElementById('result-title');
const $resultDesc     = document.getElementById('result-desc');

// Initialize DOM with immediate values (never show "Загрузка..." or "#...")
if ($roomTag) $roomTag.textContent = `#${ROOM_ID}`;
if ($nameP1) $nameP1.textContent = MY_NAME;
if ($statusP1) {
  $statusP1.textContent = 'Подключён';
  $statusP1.className = 'status-pill online';
}
if ($nameP2) $nameP2.textContent = 'Ожидание игрока...';
if ($statusP2) {
  $statusP2.textContent = 'Не в сети';
  $statusP2.className = 'status-pill offline';
}

// =================================================================
// Russian Checkers Logic Engine
// =================================================================

class RussianCheckers {
  constructor() {
    this.board = this.createBoard();
    this.currentTurn = 1; // 1 = White, -1 = Black
    this.winner = null;
  }

  createBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(0));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) b[r][c] = -1; // Black
      }
    }
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) b[r][c] = 1; // White
      }
    }
    return b;
  }

  getValidMoves(player) {
    const captures = this.allCaptures(player);
    if (captures.length > 0) return captures;
    return this.allSimpleMoves(player);
  }

  allSimpleMoves(player) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (!this.owns(player, piece)) continue;

        if (Math.abs(piece) === 2) {
          for (const [dr, dc] of [[-1,-1], [-1,1], [1,-1], [1,1]]) {
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && this.board[nr][nc] === 0) {
              moves.push({ fr: r, fc: c, tr: nr, tc: nc, cap: [] });
              nr += dr;
              nc += dc;
            }
          }
        } else {
          const dirs = player === 1 ? [[-1,-1], [-1,1]] : [[1,-1], [1,1]];
          for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && this.board[nr][nc] === 0) {
              moves.push({ fr: r, fc: c, tr: nr, tc: nc, cap: [] });
            }
          }
        }
      }
    }
    return moves;
  }

  allCaptures(player) {
    const all = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (!this.owns(player, piece)) continue;
        const isKing = Math.abs(piece) === 2;
        const seqs = this.captureSequences(r, c, player, isKing, [], this.clone(this.board));
        all.push(...seqs);
      }
    }
    if (all.length === 0) return [];
    const maxLen = Math.max(...all.map(m => m.cap.length));
    return all.filter(m => m.cap.length === maxLen);
  }

  captureSequences(r, c, player, isKing, captured, board) {
    const found = [];
    const dirs = [[-1,-1], [-1,1], [1,-1], [1,1]];

    for (const [dr, dc] of dirs) {
      if (isKing) {
        let enemyR = null, enemyC = null;
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const cell = board[nr][nc];
          if (cell === 0) {
            if (enemyR !== null) {
              const newCap = [...captured, [enemyR, enemyC]];
              const tempBoard = this.applyTemp(board, r, c, nr, nc, [enemyR, enemyC]);
              const further = this.captureSequences(nr, nc, player, true, newCap, tempBoard);
              if (further.length > 0) found.push(...further);
              else found.push({ fr: r, fc: c, tr: nr, tc: nc, cap: newCap });
            }
            nr += dr;
            nc += dc;
          } else if (this.isEnemy(player, cell) && !captured.some(([cr, cc]) => cr === nr && cc === nc)) {
            if (enemyR !== null) break;
            enemyR = nr;
            enemyC = nc;
            nr += dr;
            nc += dc;
          } else {
            break;
          }
        }
      } else {
        const midR = r + dr, midC = c + dc;
        const landR = r + 2 * dr, landC = c + 2 * dc;
        if (landR >= 0 && landR < 8 && landC >= 0 && landC < 8) {
          const midCell = board[midR][midC];
          if (this.isEnemy(player, midCell) && board[landR][landC] === 0 &&
              !captured.some(([cr, cc]) => cr === midR && cc === midC)) {
            const newCap = [...captured, [midR, midC]];
            const tempBoard = this.applyTemp(board, r, c, landR, landC, [midR, midC]);
            const crowned = (player === 1 && landR === 0) || (player === -1 && landR === 7);
            const further = this.captureSequences(landR, landC, player, isKing || crowned, newCap, tempBoard);
            if (further.length > 0) found.push(...further);
            else found.push({ fr: r, fc: c, tr: landR, tc: landC, cap: newCap });
          }
        }
      }
    }
    return found;
  }

  applyTemp(board, fr, fc, tr, tc, cap) {
    const copy = this.clone(board);
    const piece = copy[fr][fc];
    copy[fr][fc] = 0;
    copy[tr][tc] = piece;
    if (cap) copy[cap[0]][cap[1]] = 0;
    return copy;
  }

  clone(b) {
    return b.map(row => [...row]);
  }

  owns(player, piece) {
    return (player === 1 && piece > 0) || (player === -1 && piece < 0);
  }

  isEnemy(player, piece) {
    return (player === 1 && piece < 0) || (player === -1 && piece > 0);
  }

  makeMove(fr, fc, tr, tc) {
    const legal = this.getValidMoves(this.currentTurn);
    const m = legal.find(mv => mv.fr === fr && mv.fc === fc && mv.tr === tr && mv.tc === tc);
    if (!m) return false;

    let piece = this.board[fr][fc];
    this.board[fr][fc] = 0;
    this.board[tr][tc] = piece;

    for (const [cr, cc] of m.cap) {
      this.board[cr][cc] = 0;
    }

    if (piece === 1 && tr === 0) this.board[tr][tc] = 2;
    if (piece === -1 && tr === 7) this.board[tr][tc] = -2;

    this.currentTurn = -this.currentTurn;
    this.winner = this.checkWinner();
    return true;
  }

  checkWinner() {
    let whites = 0, blacks = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c] > 0) whites++;
        if (this.board[r][c] < 0) blacks++;
      }
    }
    if (whites === 0) return -1;
    if (blacks === 0) return 1;

    const moves = this.getValidMoves(this.currentTurn);
    if (moves.length === 0) return -this.currentTurn;

    return null;
  }
}

// =================================================================
// Realtime WebSocket Sync Engine
// =================================================================

const game = new RussianCheckers();

const state = {
  myColor: 1, // 1 = White, -1 = Black
  opponentName: 'Соперник',
  selectedCell: null,
  validMoves: [],
  isBotMode: false,
  timerSeconds: 60,
  timerInterval: null,
  gameStarted: false,
  playersMap: {} // { [id]: { name, lastSeen, isHost } }
};

const TOPIC = `checkers_${ROOM_ID.toLowerCase()}`;
const WS_URL = `wss://ntfy.sh/${TOPIC}/ws`;
const POST_URL = `https://ntfy.sh/${TOPIC}`;

let ws = null;

function broadcast(payload) {
  fetch(POST_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  }).catch(() => {});
}

function connectRealtime() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    // Send immediate presence
    broadcast({
      event: 'presence',
      senderId: MY_ID,
      senderName: MY_NAME,
      time: Date.now()
    });
  };

  ws.onmessage = (evt) => {
    try {
      const msgObj = JSON.parse(evt.data);
      if (msgObj.event !== 'message' || !msgObj.message) return;
      const data = JSON.parse(msgObj.message);
      handleMessage(data);
    } catch (e) {}
  };

  ws.onclose = () => {
    setTimeout(connectRealtime, 2000);
  };
}

// Heartbeat every 2 seconds
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    broadcast({
      event: 'presence',
      senderId: MY_ID,
      senderName: MY_NAME,
      time: Date.now()
    });
  }
  reapOffline();
}, 2000);

function handleMessage(data) {
  if (!data || !data.senderId) return;

  if (data.event === 'presence') {
    state.playersMap[data.senderId] = {
      name: data.senderName,
      lastSeen: Date.now()
    };
    renderLobby();
  } else if (data.event === 'move') {
    if (data.senderId !== MY_ID) {
      game.board = data.board;
      game.currentTurn = data.turn;
      game.winner = data.winner;
      haptic('medium');
      updateGameView();
      resetTimer();

      if (game.winner !== null) {
        handleGameOver(game.winner);
      }
    }
  }
}

function reapOffline() {
  const now = Date.now();
  let changed = false;
  for (const id in state.playersMap) {
    if (id !== MY_ID && (now - state.playersMap[id].lastSeen > 7000)) {
      delete state.playersMap[id];
      changed = true;
    }
  }
  if (changed) renderLobby();
}

function renderLobby() {
  // Always include self
  state.playersMap[MY_ID] = {
    name: MY_NAME,
    lastSeen: Date.now()
  };

  const ids = Object.keys(state.playersMap).sort();
  const p1Id = ids[0];
  const p2Id = ids[1] || null;

  // Player 1 (White)
  const p1 = state.playersMap[p1Id];
  $nameP1.textContent = p1.name;
  $statusP1.textContent = 'Подключён';
  $statusP1.className = 'status-pill online';

  // Player 2 (Black)
  if (p2Id) {
    const p2 = state.playersMap[p2Id];
    $nameP2.textContent = p2.name;
    $statusP2.textContent = 'Подключён';
    $statusP2.className = 'status-pill online';

    state.myColor = (MY_ID === p1Id) ? 1 : -1;
    state.opponentName = (MY_ID === p1Id) ? p2.name : p1.name;

    // Both players connected -> Auto launch game!
    if (!state.gameStarted) {
      state.gameStarted = true;
      haptic('success');
      setTimeout(launchGame, 600);
    }
  } else {
    $nameP2.textContent = 'Ожидание игрока...';
    $statusP2.textContent = 'Не в сети';
    $statusP2.className = 'status-pill offline';
    state.myColor = 1;
  }
}

// =================================================================
// Game Loop & UI
// =================================================================

function launchGame() {
  $screenLobby.classList.add('hidden');
  $screenGameOver.classList.add('hidden');
  $screenGame.classList.remove('hidden');

  $myName.textContent = MY_NAME;
  $oppName.textContent = state.opponentName;

  if (state.myColor === 1) {
    $myMarker.className = 'player-marker white';
    $oppMarker.className = 'player-marker black';
  } else {
    $myMarker.className = 'player-marker black';
    $oppMarker.className = 'player-marker white';
  }

  updateGameView();
  resetTimer();
}

function updateGameView() {
  const isMyTurn = game.currentTurn === state.myColor;
  $turnInfo.textContent = isMyTurn ? 'Твой ход' : 'Ход соперника';
  $turnInfo.className = isMyTurn ? 'turn-indicator active' : 'turn-indicator';

  let w = 0, b = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (game.board[r][c] > 0) w++;
      if (game.board[r][c] < 0) b++;
    }
  }

  $myCount.textContent = state.myColor === 1 ? w : b;
  $oppCount.textContent = state.myColor === 1 ? b : w;

  state.validMoves = game.getValidMoves(game.currentTurn);
  renderBoard();
}

function renderBoard() {
  $board.innerHTML = '';
  const flip = state.myColor === -1;

  for (let vr = 0; vr < 8; vr++) {
    for (let vc = 0; vc < 8; vc++) {
      const r = flip ? 7 - vr : vr;
      const c = flip ? 7 - vc : vc;
      const isDark = (r + c) % 2 === 1;

      const $cell = document.createElement('div');
      $cell.className = `cell ${isDark ? 'cell-dark' : 'cell-light'}`;
      $cell.dataset.r = r;
      $cell.dataset.c = c;

      if (state.selectedCell && state.selectedCell.r === r && state.selectedCell.c === c) {
        $cell.classList.add('selected');
      }

      if (state.selectedCell) {
        const canMove = state.validMoves.some(
          m => m.fr === state.selectedCell.r && m.fc === state.selectedCell.c &&
               m.tr === r && m.tc === c
        );
        if (canMove) $cell.classList.add('possible-move');
      }

      const val = game.board[r][c];
      if (val !== 0) {
        const $piece = document.createElement('div');
        $piece.className = `piece ${val > 0 ? 'piece-white' : 'piece-black'}`;
        if (Math.abs(val) === 2) $piece.classList.add('king');
        $cell.appendChild($piece);
      }

      $cell.addEventListener('click', () => handleCellClick(r, c));
      $board.appendChild($cell);
    }
  }
}

function handleCellClick(r, c) {
  if (game.winner !== null) return;
  if (!state.isBotMode && game.currentTurn !== state.myColor) return;

  const piece = game.board[r][c];

  if (game.owns(game.currentTurn, piece)) {
    const hasMove = state.validMoves.some(m => m.fr === r && m.fc === c);
    if (hasMove) {
      state.selectedCell = { r, c };
      haptic('light');
      renderBoard();
    }
    return;
  }

  if (state.selectedCell) {
    const fr = state.selectedCell.r, fc = state.selectedCell.c;
    const isLegal = state.validMoves.some(
      m => m.fr === fr && m.fc === fc && m.tr === r && m.tc === c
    );

    if (isLegal) {
      const moved = game.makeMove(fr, fc, r, c);
      if (moved) {
        haptic('medium');
        state.selectedCell = null;
        updateGameView();
        resetTimer();

        if (!state.isBotMode) {
          broadcast({
            event: 'move',
            senderId: MY_ID,
            fr, fc, r, c,
            board: game.board,
            turn: game.currentTurn,
            winner: game.winner
          });
        }

        if (game.winner !== null) {
          handleGameOver(game.winner);
          return;
        }

        if (state.isBotMode && game.currentTurn === -1) {
          setTimeout(botMove, 400);
        }
      }
    }
  }
}

function botMove() {
  if (game.winner !== null) return;
  const moves = game.getValidMoves(-1);
  if (moves.length === 0) {
    game.winner = 1;
    handleGameOver(1);
    return;
  }
  const choice = moves[Math.floor(Math.random() * moves.length)];
  game.makeMove(choice.fr, choice.fc, choice.tr, choice.tc);
  haptic('light');
  updateGameView();
  resetTimer();

  if (game.winner !== null) {
    handleGameOver(game.winner);
  }
}

function resetTimer() {
  clearInterval(state.timerInterval);
  state.timerSeconds = 60;
  $timer.textContent = state.timerSeconds;
  $timer.classList.remove('urgent');

  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    $timer.textContent = state.timerSeconds;
    if (state.timerSeconds <= 10) {
      $timer.classList.add('urgent');
    }
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerInterval);
      const winner = -game.currentTurn;
      game.winner = winner;
      handleGameOver(winner, true);
    }
  }, 1000);
}

function handleGameOver(winner, timeout = false) {
  clearInterval(state.timerInterval);
  const won = winner === state.myColor;
  haptic(won ? 'success' : 'error');

  $resultTitle.textContent = won ? 'Победа' : 'Поражение';
  $resultDesc.textContent = timeout ? 'Время на ход истекло' : 'Игра завершена';

  $screenGame.classList.add('hidden');
  $screenGameOver.classList.remove('hidden');
}

// ---------- Button Handlers ----------
if ($btnShare) {
  $btnShare.addEventListener('click', () => {
    haptic('light');
    const link = `https://t.me/gameddd_bot/app?startapp=${ROOM_ID}`;
    const text = `Сыграем в шашки в комнате #${ROOM_ID}?`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  });
}

if ($btnPlayBot) {
  $btnPlayBot.addEventListener('click', () => {
    haptic('medium');
    state.isBotMode = true;
    state.myColor = 1;
    state.opponentName = 'Бот';
    launchGame();
  });
}

if ($btnRestart) {
  $btnRestart.addEventListener('click', () => {
    location.reload();
  });
}

// Start connection & populate UI
connectRealtime();
renderLobby();
