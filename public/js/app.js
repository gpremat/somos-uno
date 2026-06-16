const socket = io();
let currentScreen = 'home';
let myPlayerIndex = null;
let isCreator = false;
let cards = [];
let canPlay = true;
let lastPlayTime = 0;

const DIFFICULTIES = {
  easy: 'Fácil',
  medium: 'Medio',
  hard: 'Difícil',
  impossible: '¡Imposible!',
  somosuno: 'Somos Uno',
};

// Screen navigation
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById('screen-' + screenId);
  if (screen) screen.classList.add('active');
  currentScreen = screenId;
}

function showLoading(text) {
  const overlay = document.getElementById('loading-overlay');
  overlay.style.display = 'flex';
  document.getElementById('loading-text').textContent = text || 'Cargando...';
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

function goHome() {
  showScreen('home');
  cards = [];
  myPlayerIndex = null;
  isCreator = false;
  canPlay = true;
}

// Difficulty selector
document.addEventListener('DOMContentLoaded', () => {
  const diffOptions = document.getElementById('difficulty-options');
  if (diffOptions) {
    diffOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('.diff-btn');
      if (!btn) return;
      diffOptions.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  }

  document.getElementById('room-code-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
  });

  document.getElementById('room-code-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
});

// Create room
function createRoom() {
  const selected = document.querySelector('.diff-btn.selected');
  if (!selected) return;
  const difficulty = selected.dataset.difficulty;
  showLoading('Creando sala...');
  socket.emit('create_room', { difficulty });
}

// Join room
function joinRoom() {
  const code = document.getElementById('room-code-input').value.trim();
  if (!code || code.length < 4) {
    document.getElementById('join-error').textContent = 'Ingresa un código válido';
    return;
  }
  document.getElementById('join-error').textContent = '';
  showLoading('Uniéndose a la sala...');
  socket.emit('join_room', { code });
}

// Leave room
function leaveRoom() {
  socket.emit('leave_room');
  goHome();
}

// Start game
function startGame() {
  socket.emit('start_game');
}

// Play a card
function playCard(card) {
  if (!canPlay) return;
  const now = Date.now();
  if (now - lastPlayTime < 500) return;
  lastPlayTime = now;
  canPlay = false;
  socket.emit('play_card', { card });
}

// ====== SOCKET EVENTS ======

socket.on('connect', () => {
  hideLoading();
});

socket.on('disconnect', () => {
  if (currentScreen === 'game' || currentScreen === 'lobby') {
    showLoading('Reconectando...');
  }
});

socket.on('connect_error', () => {
  hideLoading();
  if (currentScreen === 'home') return;
  document.getElementById('join-error').textContent = 'Error de conexión con el servidor';
});

// Room created
socket.on('room_created', (data) => {
  hideLoading();
  isCreator = true;
  myPlayerIndex = 0;
  updateLobby(data.code, 'create');
});

// Room joined
socket.on('room_joined', (data) => {
  hideLoading();
  myPlayerIndex = 1;
  isCreator = false;
  updateLobby(data.code, 'join');
});

function updateLobby(code, mode) {
  showScreen('lobby');
  document.getElementById('room-code-display').textContent = code;
  // Reset: Jugador 1 is connected, Jugador 2 waiting
  document.getElementById('player-slot-0').classList.add('connected');
  document.getElementById('player-status-0').textContent = 'Conectado';
  document.getElementById('player-slot-1').classList.remove('connected');
  document.getElementById('player-status-1').textContent = 'Esperando...';
  document.getElementById('btn-start-game').style.display = 'none';
  document.getElementById('lobby-waiting').style.display = 'block';
}

// Lobby update
socket.on('lobby_update', (data) => {
  const playerCount = data.players.length;
  if (playerCount === 2) {
    document.getElementById('player-slot-1').classList.add('connected');
    document.getElementById('player-status-1').textContent = 'Conectado';
    if (isCreator) {
      document.getElementById('btn-start-game').style.display = 'block';
      document.getElementById('lobby-waiting').style.display = 'none';
    } else {
      document.getElementById('btn-start-game').style.display = 'none';
      document.getElementById('lobby-waiting').style.display = 'block';
      document.getElementById('lobby-waiting').textContent = 'Esperando al anfitrión...';
    }
  }
  document.getElementById('lobby-difficulty').innerHTML =
    `<span class="diff-badge">${data.difficulty.label} · ${data.difficulty.cards} cartas · ${data.difficulty.time}s</span>`;
});

// Game start
socket.on('game_start', (data) => {
  cards = data.cards;
  myPlayerIndex = data.playerIndex;
  showScreen('game');
  renderGame(data);
});

function renderGame(data) {
  const cardsArr = data.cards;
  const hand = document.getElementById('card-hand');
  hand.innerHTML = '';
  canPlay = true;

  cardsArr.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'card card-enter';
    el.style.animationDelay = `${i * 0.08}s`;
    el.textContent = card;
    el.dataset.value = card;
    el.addEventListener('click', () => playCard(card));
    hand.appendChild(el);
  });

  document.getElementById('played-cards').innerHTML = '';

  const diff = data.difficulty;
  document.getElementById('lobby-difficulty').innerHTML =
    `<span class="diff-badge">${diff.label} · ${diff.cards} cartas · ${diff.time}s</span>`;

  const p0 = document.getElementById('player-badge-0');
  const p1 = document.getElementById('player-badge-1');
  p0.textContent = 'Jugador 1';
  p1.textContent = 'Jugador 2';

  // Timer: compute locally based on startTime
  const startTime = data.startTime;
  const duration = data.duration;
  startLocalTimer(startTime, duration);
}

let timerAnimFrame = null;

function startLocalTimer(startTime, duration) {
  if (timerAnimFrame) cancelAnimationFrame(timerAnimFrame);

  function tick() {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, duration - elapsed);
    const seconds = remaining / 1000;

    updateTimerDisplay(seconds, duration / 1000);

    if (remaining > 0) {
      timerAnimFrame = requestAnimationFrame(tick);
    }
  }
  tick();
}

function updateTimerDisplay(seconds, total) {
  const pct = Math.max(0, (seconds / total) * 100);
  const fill = document.getElementById('timer-bar-fill');
  const text = document.getElementById('timer-text');
  const container = document.getElementById('timer-container');

  fill.style.width = pct + '%';
  const secs = Math.ceil(seconds);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  text.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  if (seconds <= 5) {
    container.classList.add('urgent');
  } else {
    container.classList.remove('urgent');
  }
}

// Timer update from server (sync)
socket.on('timer_update', (data) => {
  // The local timer is the primary display, but this syncs it
  // We use the local timer approach instead
});

// Card played
socket.on('card_played', (data) => {
  const { card, playerIndex, playedCount, totalCards } = data;

  // Remove card from hand if it was ours
  if (playerIndex === myPlayerIndex) {
    const hand = document.getElementById('card-hand');
    const cardEl = hand.querySelector(`[data-value="${card}"]`);
    if (cardEl) {
      cardEl.classList.add('playing');
      setTimeout(() => cardEl.remove(), 400);
    }
  }

  // Add to played area
  const playedContainer = document.getElementById('played-cards');
  const playedEl = document.createElement('div');
  playedEl.className = 'played-card' + (playerIndex !== myPlayerIndex ? ' opponent' : '');
  playedEl.textContent = card;
  playedContainer.appendChild(playedEl);
  playedContainer.scrollLeft = playedContainer.scrollWidth;

  // Re-enable card clicks after delay
  setTimeout(() => {
    canPlay = true;
  }, 500);
});

// Game victory
socket.on('game_victory', (data) => {
  showScreen('victory');
  document.getElementById('victory-difficulty').textContent = data.difficulty.label;
  const remaining = Math.ceil(data.timeRemaining);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  document.getElementById('victory-time').textContent =
    `Tiempo restante: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  // Show played cards in order
  const container = document.getElementById('victory-cards');
  container.innerHTML = '';
  // We'll show the cards from the played area
  const playedCards = document.querySelectorAll('.played-card');
  playedCards.forEach(el => {
    const div = document.createElement('div');
    div.className = 'result-card';
    div.textContent = el.textContent;
    container.appendChild(div);
  });
});

// Game defeat
socket.on('game_defeat', (data) => {
  showScreen('defeat');
  const reasonEl = document.getElementById('defeat-reason');
  if (data.reason === 'time') {
    reasonEl.innerHTML = '⏱ Se acabó el tiempo';
  } else {
    reasonEl.innerHTML = `Carta incorrecta: <strong>${data.card}</strong> (se esperaba <strong>${data.expected}</strong>)`;
  }
});

// Player left
socket.on('player_left', () => {
  if (currentScreen === 'lobby' || currentScreen === 'game') {
    showScreen('home');
    cards = [];
    myPlayerIndex = null;
    isCreator = false;
  }
});

// Error
socket.on('error', (data) => {
  hideLoading();
  if (currentScreen === 'join-room') {
    document.getElementById('join-error').textContent = data.message;
  } else {
    alert(data.message);
  }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  socket.emit('leave_room');
});
