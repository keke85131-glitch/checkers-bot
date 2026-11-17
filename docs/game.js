/* =================================================================
   Telegram Checkers Mini App — game.js
   Dynamic Room Card [ 👤 1/2 ] -> [ 👥 2/2 ], PeerJS P2P & Rules Engine
   ================================================================= */

// ---------- Telegram Mini App Init ----------
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#18181a');
    tg.setBackgroundColor('#18181a');
  } catch (e) {}
}

const tgUser = tg?.initDataUnsafe?.user;
const MY_NAME = tgUser ? (tgUser.first_name + (tgUser.username ? ` (@${tgUser.username})` : '')) : 'Я';

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

// ---------- URL & Room Parameters ----------
const urlParams = new URLSearchParams(location.search);
const startParam = tg?.initDataUnsafe?.start_param;
let ROOM_ID = startParam || urlParams.get('room') || '';
const isJoiner = Boolean(ROOM_ID);

if (!ROOM_ID) {
  ROOM_ID = Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ---------- DOM Elements ----------
const $screenWaiting   = document.getElementById('screen-waiting');
const $screenGame      = document.getElementById('screen-game');
const $screenGameOver  = document.getElementById('screen-gameover');
const $board           = document.getElementById('board');
const $turnInfo        = document.getElementById('turn-info');
const $timer           = document.getElementById('timer');
const $myPieces        = document.getElementById('my-pieces');
const $oppPieces       = document.getElementById('opp-pieces');
const $myName          = document.getElementById('my-name');
const $oppName         = document.getElementById('opp-name');
const $myAvatar        = document.getElementById('my-avatar');
const $oppAvatar       = document.getElementById('opp-avatar');
const $resultEmoji     = document.getElementById('result-emoji');
const $resultText      = document.getElementById('result-text');
const $resultSubtext   = document.getElementById('result-subtext');
const $btnNewGame      = document.getElementById('btn-new-game');
const $roomIdBadge     = document.querySelector('.room-id-badge');
const $roomStatusBadge = document.getElementById('room-status-badge');
const $roomCounter     = document.getElementById('room-counter');
const $whitePlayerName = document.getElementById('white-player-name');
const $blackPlayerName = document.getElementById('black-player-name');
const $slotBlack       = document.getElementById('slot-black');
const $blackStatusDot  = document.getElementById('black-status-dot');
const $btnShare        = document.getElementById('btn-share');
const $btnCopy         = document.getElementById('btn-copy');
const $btnPlayBot      = document.getElementById('btn-play-bot');

if ($roomIdBadge) $roomIdBadge.textContent = `#${ROOM_ID}`;
if ($whitePlayerName) $whitePlayerName.textContent = MY_NAME;
if ($myName) $myName.textContent = MY_NAME;

// =================================================================
// Russian Checkers Game Engine
// =================================================================

class RussianCheckers {
  constructor() {
    this.board = this.createInitialBoard();
    this.currentTurn = 1; // 1 = White, -1 = Black
    this.winner = null;
  }

  createInitialBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(0));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) b[r][c] = -1;
      }
    }
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) b[r][c] = 1;
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
              moves.push({ from_r: r, from_c: c, to_r: nr, to_c: nc, captures: [] });
              nr += dr;
              nc += dc;
            }
          }
        } else {
          const dirs = player === 1 ? [[-1,-1], [-1,1]] : [[1,-1], [1,1]];
          for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && this.board[nr][nc] === 0) {
              moves.push({ from_r: r, from_c: c, to_r: nr, to_c: nc, captures: [] });
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
        const seqs = this.captureSequences(r, c, player, isKing, [], this.cloneBoard(this.board));
        all.push(...seqs);
      }
    }
    if (all.length === 0) return [];
    const maxLen = Math.max(...all.map(m => m.captures.length));
    return all.filter(m => m.captures.length === maxLen);
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
              else found.push({ from_r: r, from_c: c, to_r: nr, to_c: nc, captures: newCap });
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
            else found.push({ from_r: r, from_c: c, to_r: landR, to_c: landC, captures: newCap });
          }
        }
      }
    }
    return found;
  }

  applyTemp(board, fr, fc, tr, tc, cap) {
    const copy = this.cloneBoard(board);
    const piece = copy[fr][fc];
    copy[fr][fc] = 0;
    copy[tr][tc] = piece;
    if (cap) copy[cap[0]][cap[1]] = 0;
    return copy;
  }

  cloneBoard(b) {
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
    const m = legal.find(mv => mv.from_r === fr && mv.from_c === fc && mv.to_r === tr && mv.to_c === tc);
    if (!m) return false;

    let piece = this.board[fr][fc];
    this.board[fr][fc] = 0;
    this.board[tr][tc] = piece;

    for (const [cr, cc] of m.captures) {
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
// State & Multiplayer
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
  peer: null,
  conn: null
};

function showScreen(name) {
  $screenWaiting.classList.toggle('hidden', name !== 'waiting');
  $screenGame.classList.toggle('hidden', name !== 'game');
  $screenGameOver.classList.toggle('hidden', name !== 'gameover');
}

function updateStatus() {
  const isMyTurn = game.currentTurn === state.myColor;
  $turnInfo.textContent = isMyTurn ? 'Твой ход' : 'Ход соперника';
  $turnInfo.style.background = isMyTurn ? 'rgba(48,209,88,0.2)' : 'rgba(36,129,204,0.2)';
  $turnInfo.style.color = isMyTurn ? 'var(--green)' : 'var(--accent)';

  let w = 0, b = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (game.board[r][c] > 0) w++;
      if (game.board[r][c] < 0) b++;
    }
  }

  if (state.myColor === 1) {
    $myPieces.textContent = `Шашек: ${w}`;
    $oppPieces.textContent = `Шашек: ${b}`;
    $myAvatar.textContent = '⚪';
    $oppAvatar.textContent = '⚫';
  } else {
    $myPieces.textContent = `Шашек: ${b}`;
    $oppPieces.textContent = `Шашек: ${w}`;
    $myAvatar.textContent = '⚫';
    $oppAvatar.textContent = '⚪';
  }

  $myName.textContent = MY_NAME;
  $oppName.textContent = state.opponentName;

  state.validMoves = game.getValidMoves(game.currentTurn);
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
          m => m.from_r === state.selectedCell.r && m.from_c === state.selectedCell.c &&
               m.to_r === r && m.to_c === c
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
    const hasMove = state.validMoves.some(m => m.from_r === r && m.from_c === c);
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
      m => m.from_r === fr && m.from_c === fc && m.to_r === r && m.to_c === c
    );

    if (isLegal) {
      const moved = game.makeMove(fr, fc, r, c);
      if (moved) {
        haptic('medium');
        state.selectedCell = null;
        updateStatus();
        renderBoard();
        resetTimer();

        if (state.conn && state.conn.open) {
          state.conn.send({
            type: 'move',
            fr, fc, r, c,
            board: game.board,
            currentTurn: game.currentTurn,
            winner: game.winner
          });
        }

        if (game.winner !== null) {
          handleGameOver(game.winner);
          return;
        }

        if (state.isBotMode && game.currentTurn === -1) {
          setTimeout(makeBotMove, 400);
        }
      }
    }
  }
}

function makeBotMove() {
  if (game.winner !== null) return;
  const moves = game.getValidMoves(-1);
  if (moves.length === 0) {
    game.winner = 1;
    handleGameOver(1);
    return;
  }
  const choice = moves[Math.floor(Math.random() * moves.length)];
  game.makeMove(choice.from_r, choice.from_c, choice.to_r, choice.to_c);
  haptic('light');
  updateStatus();
  renderBoard();
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

  $resultEmoji.textContent = won ? '🏆' : '💀';
  $resultText.textContent = won ? 'Победа!' : 'Поражение';
  $resultSubtext.textContent = timeout ? 'Время на ход истекло' : 'Все шашки соперника съедены или заблокированы';

  showScreen('gameover');
}

// =================================================================
// Dynamic Room Card & PeerJS P2P Connection
// =================================================================

function updateWaitingRoomCard(connected, oppName) {
  if (connected) {
    if ($roomStatusBadge) {
      $roomStatusBadge.textContent = '🟢 В игре';
      $roomStatusBadge.className = 'badge-ready';
    }
    if ($blackPlayerName) $blackPlayerName.textContent = oppName;
    if ($slotBlack) $slotBlack.className = 'player-slot active';
    if ($blackStatusDot) $blackStatusDot.className = 'slot-status-dot online';
    if ($roomCounter) $roomCounter.innerHTML = 'Участники: <b>[ 👥 2 / 2 ]</b>';
  } else {
    if ($roomStatusBadge) {
      $roomStatusBadge.textContent = '🟡 Ожидание';
      $roomStatusBadge.className = 'badge-waiting';
    }
    if ($slotBlack) $slotBlack.className = 'player-slot empty';
    if ($blackStatusDot) $blackStatusDot.className = 'slot-status-dot';
    if ($roomCounter) $roomCounter.innerHTML = 'Участники: <b>[ 👤 1 / 2 👥 ]</b>';
  }
}

function initP2P() {
  const hostPeerId = `checkers_host_${ROOM_ID.toLowerCase()}`;

  if (isJoiner && urlParams.get('join') === '1') {
    state.peer = new Peer();
    state.peer.on('open', () => {
      const conn = state.peer.connect(hostPeerId, { reliable: true });
      setupConnection(conn, false);
    });
    state.peer.on('error', () => {
      becomeHost(hostPeerId);
    });
  } else {
    becomeHost(hostPeerId);
  }
}

function becomeHost(hostId) {
  state.myColor = 1; // Host = White
  updateWaitingRoomCard(false);

  state.peer = new Peer(hostId);

  state.peer.on('open', () => {
    console.log('Host registered room:', hostId);
  });

  state.peer.on('connection', (conn) => {
    setupConnection(conn, true);
  });

  state.peer.on('error', (err) => {
    // If room already hosted, join as player 2
    state.peer.destroy();
    state.peer = new Peer();
    state.peer.on('open', () => {
      const conn = state.peer.connect(hostId, { reliable: true });
      setupConnection(conn, false);
    });
  });
}

function setupConnection(conn, isHost) {
  state.conn = conn;

  conn.on('open', () => {
    haptic('success');

    if (!isHost) {
      // Guest sends their name to host
      conn.send({
        type: 'join',
        name: MY_NAME
      });
    }
  });

  conn.on('data', (data) => {
    if (data.type === 'join') {
      // Host received guest join
      state.opponentName = data.name || 'Игрок 2';
      updateWaitingRoomCard(true, state.opponentName);

      // Send welcome back to guest
      conn.send({
        type: 'welcome',
        hostName: MY_NAME,
        board: game.board,
        currentTurn: game.currentTurn
      });

      // Launch after brief visual update
      setTimeout(startGame, 900);
    } else if (data.type === 'welcome') {
      // Guest received welcome
      state.myColor = -1; // Guest plays Black
      state.opponentName = data.hostName || 'Игрок 1';
      game.board = data.board;
      game.currentTurn = data.currentTurn;

      if ($whitePlayerName) $whitePlayerName.textContent = state.opponentName;
      if ($blackPlayerName) $blackPlayerName.textContent = MY_NAME;
      updateWaitingRoomCard(true, MY_NAME);

      setTimeout(startGame, 900);
    } else if (data.type === 'move') {
      game.board = data.board;
      game.currentTurn = data.currentTurn;
      game.winner = data.winner;
      haptic('medium');
      updateStatus();
      renderBoard();
      resetTimer();

      if (game.winner !== null) {
        handleGameOver(game.winner);
      }
    }
  });

  conn.on('close', () => {
    if (game.winner === null) {
      alert('Соперник вышел из комнаты');
      location.reload();
    }
  });
}

function startGame() {
  showScreen('game');
  updateStatus();
  renderBoard();
  resetTimer();
}

// ---------- Share & Links ----------
function getInviteLink() {
  return `https://t.me/gameddd_bot/app?startapp=${ROOM_ID}`;
}

if ($btnShare) {
  $btnShare.addEventListener('click', () => {
    haptic('light');
    const link = getInviteLink();
    const text = `Сыграем в шашки в комнате #${ROOM_ID}? ♟️`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  });
}

if ($btnCopy) {
  $btnCopy.addEventListener('click', () => {
    haptic('light');
    const link = getInviteLink();
    navigator.clipboard.writeText(link).then(() => {
      $btnCopy.textContent = '✅ Ссылка скопирована!';
      setTimeout(() => { $btnCopy.textContent = '📋 Скопировать ссылку на комнату'; }, 2000);
    }).catch(() => {
      prompt('Скопируй ссылку:', link);
    });
  });
}

if ($btnPlayBot) {
  $btnPlayBot.addEventListener('click', () => {
    haptic('medium');
    state.isBotMode = true;
    state.myColor = 1;
    state.opponentName = '🤖 Робот';
    startGame();
  });
}

if ($btnNewGame) {
  $btnNewGame.addEventListener('click', () => {
    location.reload();
  });
}

// Run P2P room connection
initP2P();
