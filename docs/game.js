/* =================================================================
   Telegram Checkers Mini App — game.js
   Vanilla JS, no frameworks.
   ================================================================= */

// ---------- Config ----------
const BACKEND_WS = '__BACKEND_WS__'; // replaced at deploy time, e.g. wss://your-app.onrender.com

// ---------- Telegram Mini App ----------
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.setHeaderColor('#1c1c1e');
  tg.setBackgroundColor('#1c1c1e');
}

// ---------- URL params & Player info ----------
const params   = new URLSearchParams(location.search);
const ROOM_ID  = params.get('room') || 'test';
const tgUser   = tg?.initDataUnsafe?.user;
const PLAYER_ID = tgUser?.id 
  ? String(tgUser.id) 
  : (params.get('pid') || 'p_' + Math.random().toString(36).substring(2, 9));
const PLAYER_NAME = tgUser?.first_name || 'Игрок';

// ---------- DOM refs ----------
const $board       = document.getElementById('board');
const $turnInfo    = document.getElementById('turn-info');
const $timer       = document.getElementById('timer');
const $myPieces    = document.getElementById('my-pieces');
const $oppPieces   = document.getElementById('opp-pieces');
const $resultEmoji = document.getElementById('result-emoji');
const $resultText  = document.getElementById('result-text');
const $btnNewGame  = document.getElementById('btn-new-game');
const $roomId      = document.querySelector('.room-id');

// ---------- Game state ----------
const state = {
  board:         [],       // 8×8 matrix; 0=empty, 1=white, -1=black, 2=white king, -2=black king
  currentTurn:   1,        // whose turn: 1 or -1
  myColor:       null,     // 1 or -1 assigned by server
  selectedCell:  null,     // { r, c } or null
  validMoves:    [],       // [{from_r,from_c,to_r,to_c,captures}] from server
  timerSeconds:  60,
  timerInterval: null,
  ws:            null,
  winner:        null,
  connected:     false,
  reconnectDelay: 1500,
};

// ================================================================
//  WebSocket
// ================================================================

function connectWS() {
  if ($roomId) $roomId.textContent = `Комната: ${ROOM_ID}`;
  showScreen('waiting');

  const url = buildWsUrl();
  const ws = new WebSocket(url);
  state.ws = ws;

  ws.addEventListener('open', () => {
    state.connected = true;
    state.reconnectDelay = 1500;
    console.log('[WS] connected');
  });

  ws.addEventListener('message', (evt) => {
    let data;
    try { data = JSON.parse(evt.data); } catch { return; }
    handleMessage(data);
  });

  ws.addEventListener('close', () => {
    state.connected = false;
    console.warn('[WS] closed — reconnecting in', state.reconnectDelay, 'ms');
    setTimeout(() => {
      state.reconnectDelay = Math.min(state.reconnectDelay * 2, 15000);
      connectWS();
    }, state.reconnectDelay);
  });

  ws.addEventListener('error', (e) => {
    console.error('[WS] error', e);
  });
}

function buildWsUrl() {
  // If BACKEND_WS is still the placeholder, derive from current location (dev mode)
  if (BACKEND_WS === '__BACKEND_WS__') {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws/${ROOM_ID}/${PLAYER_ID}`;
  }
  return `${BACKEND_WS}/ws/${ROOM_ID}/${PLAYER_ID}`;
}

function handleMessage(data) {
  switch (data.type) {
    case 'game_state':
      applyGameState(data);
      break;
    case 'timeout':
      handleTimeout(data);
      break;
    case 'error':
      console.warn('[Server error]', data.message);
      break;
    default:
      console.log('[WS] unknown message type:', data.type);
  }
}

function applyGameState(data) {
  state.board       = data.board;
  state.currentTurn = data.current_turn;
  state.validMoves  = data.valid_moves || [];
  state.winner      = data.winner;
  state.myColor     = data.your_color;

  // Reset selection on new state
  state.selectedCell = null;

  if (state.winner !== null && state.winner !== undefined) {
    stopTimer();
    showGameOver(state.winner);
    return;
  }

  showScreen('game');
  renderBoard();
  updateStatusBar();
  startTimer(data.timer_seconds ?? state.timerSeconds);
}

function handleTimeout(data) {
  stopTimer();
  const loser = data.loser; // 1 or -1
  const winner = -loser;
  showGameOver(winner);
}

function sendMove(fr, fc, tr, tc) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ws.send(JSON.stringify({ type: 'move', from_r: fr, from_c: fc, to_r: tr, to_c: tc }));
}

// ================================================================
//  Rendering
// ================================================================

function renderBoard() {
  $board.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      $board.appendChild(renderCell(r, c));
    }
  }
}

function renderCell(r, c) {
  const isLight = (r + c) % 2 === 0;
  const cell = document.createElement('div');
  cell.className = `cell ${isLight ? 'cell-light' : 'cell-dark'}`;
  cell.dataset.r = r;
  cell.dataset.c = c;

  // Possible-move highlight
  if (isPossibleTarget(r, c)) {
    cell.classList.add('possible-move');
  }

  // Piece
  const val = (state.board[r] ?? [])[c];
  if (val !== 0 && val !== undefined) {
    const piece = document.createElement('div');
    const isWhite = val > 0;
    const isKing  = Math.abs(val) === 2;
    piece.className = `piece ${isWhite ? 'piece-white' : 'piece-black'}${isKing ? ' king' : ''}`;
    if (state.selectedCell?.r === r && state.selectedCell?.c === c) {
      piece.classList.add('selected');
    }
    cell.appendChild(piece);
  }

  cell.addEventListener('click', () => handleCellClick(r, c));
  return cell;
}

function isPossibleTarget(r, c) {
  if (!state.selectedCell) return false;
  return getMovesFrom(state.selectedCell.r, state.selectedCell.c)
    .some(m => m.to_r === r && m.to_c === c);
}

function updateStatusBar() {
  const myTurn = state.currentTurn === state.myColor;
  $turnInfo.textContent = myTurn ? '🟢 Ваш ход' : '⏳ Ход противника';

  const myCount  = countPieces(state.myColor);
  const oppCount = countPieces(-state.myColor);
  $myPieces.textContent  = `Мои: ${myCount}`;
  $oppPieces.textContent = `Противник: ${oppCount}`;
}

function countPieces(color) {
  let n = 0;
  for (const row of state.board) {
    for (const v of row) {
      if (color === 1  && v > 0) n++;
      if (color === -1 && v < 0) n++;
    }
  }
  return n;
}

function showScreen(name) {
  ['waiting', 'game', 'gameover'].forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('hidden', s !== name);
  });
}

function showGameOver(winner) {
  showScreen('gameover');
  const iWon = winner === state.myColor;
  $resultEmoji.textContent = iWon ? '🏆' : '😞';
  $resultText.textContent  = iWon ? 'Вы победили!' : 'Вы проиграли';
}

// ================================================================
//  Interaction
// ================================================================

function handleCellClick(r, c) {
  // Only act on our turn
  if (state.currentTurn !== state.myColor) return;
  if (state.winner !== null && state.winner !== undefined) return;

  const val = (state.board[r] ?? [])[c];
  const isMine = state.myColor === 1 ? val > 0 : val < 0;

  // If a piece is already selected:
  if (state.selectedCell) {
    // Click on a possible-move target
    const moves = getMovesFrom(state.selectedCell.r, state.selectedCell.c);
    const target = moves.find(m => m.to_r === r && m.to_c === c);
    if (target) {
      sendMove(state.selectedCell.r, state.selectedCell.c, r, c);
      state.selectedCell = null;
      renderBoard();
      return;
    }
    // Click on another own piece — reselect
    if (isMine) {
      state.selectedCell = { r, c };
      renderBoard();
      return;
    }
    // Deselect
    state.selectedCell = null;
    renderBoard();
    return;
  }

  // Select own piece that has moves
  if (isMine && getMovesFrom(r, c).length > 0) {
    state.selectedCell = { r, c };
    renderBoard();
  }
}

function getMovesFrom(r, c) {
  return state.validMoves.filter(m => m.from_r === r && m.from_c === c);
}

// ================================================================
//  Timer
// ================================================================

function startTimer(seconds) {
  stopTimer();
  state.timerSeconds = seconds ?? 60;
  updateTimerDisplay();

  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    if (state.timerSeconds < 0) state.timerSeconds = 0;
    updateTimerDisplay();
    if (state.timerSeconds <= 0) stopTimer();
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateTimerDisplay() {
  $timer.textContent = state.timerSeconds;
  $timer.classList.toggle('urgent', state.timerSeconds < 10);
}

// ================================================================
//  New game button
// ================================================================

$btnNewGame.addEventListener('click', () => {
  // Navigate back to Telegram inline flow — close the Mini App
  if (tg) {
    tg.close();
  } else {
    location.reload();
  }
});

// ================================================================
//  Bootstrap
// ================================================================

connectWS();
