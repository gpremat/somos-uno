const socket = io();
let currentScreen = 'home';
let myPlayerIndex = null;
let isCreator = false;
let cards = [];
let canPlay = true;
let lastPlayTime = 0;
let myPower = null;
let myPowerUsed = false;

const ROUETTE_ANGLES = {
  angel: 1740,
  reloj: 1620,
  vision: 1500,
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
  myPower = null;
  myPowerUsed = false;
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

// Start roulette phase (from lobby, creator only)
function startRoulette() {
  socket.emit('start_roulette');
}

// Spin roulette
function spinRoulette() {
  document.getElementById('btn-spin').disabled = true;
  document.getElementById('btn-spin').textContent = 'Girando...';
  socket.emit('roulette_spin');
}

// Begin game after roulette (creator only)
function beginGame() {
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

// Use a power
function usePower(power) {
  if (myPowerUsed) return;
  socket.emit('use_power', { power });
}

// ====== SOCKET EVENTS ======

socket.on('connect', () => {
  hideLoading();
});

socket.on('disconnect', () => {
  if (currentScreen === 'game' || currentScreen === 'lobby' || currentScreen === 'roulette') {
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
  document.getElementById('player-slot-0').classList.add('connected');
  document.getElementById('player-status-0').textContent = 'Conectado';
  document.getElementById('player-slot-1').classList.remove('connected');
  document.getElementById('player-status-1').textContent = 'Esperando...';
  document.getElementById('btn-start-roulette').style.display = 'none';
  document.getElementById('lobby-waiting').style.display = 'block';
}

// Lobby update
socket.on('lobby_update', (data) => {
  const playerCount = data.players.length;
  if (playerCount === 2) {
    document.getElementById('player-slot-1').classList.add('connected');
    document.getElementById('player-status-1').textContent = 'Conectado';
    if (isCreator) {
      document.getElementById('btn-start-roulette').style.display = 'block';
      document.getElementById('lobby-waiting').style.display = 'none';
    } else {
      document.getElementById('btn-start-roulette').style.display = 'none';
      document.getElementById('lobby-waiting').style.display = 'block';
      document.getElementById('lobby-waiting').textContent = 'Esperando al anfitrión...';
    }
  }
  document.getElementById('lobby-difficulty').innerHTML =
    `<span class="diff-badge">${data.difficulty.label} · ${data.difficulty.cards} cartas · ${data.difficulty.time}s</span>`;
});

// Roulette phase
socket.on('roulette_phase', () => {
  showScreen('roulette');
  document.getElementById('btn-spin').disabled = false;
  document.getElementById('btn-spin').textContent = 'GIRAR RULETA';
  document.getElementById('my-power-result').style.display = 'none';
  document.getElementById('btn-begin-game').style.display = 'none';
  document.getElementById('pps-status-0').textContent = '⏳ Girando...';
  document.getElementById('pps-status-1').textContent = '⏳ Girando...';
  document.getElementById('player-power-0').classList.remove('done');
  document.getElementById('player-power-1').classList.remove('done');

  const wheel = document.getElementById('wheel');
  wheel.style.transform = 'rotate(0deg)';
  myPower = null;
  myPowerUsed = false;
});

// Roulette result
socket.on('roulette_result', (data) => {
  const { playerIndex, power, powerData, bothComplete, powers } = data;

  // Animate wheel if it's our result
  if (playerIndex === myPlayerIndex) {
    const wheel = document.getElementById('wheel');
    const angle = ROUETTE_ANGLES[power];
    wheel.style.transform = `rotate(${angle}deg)`;

    setTimeout(() => {
      document.getElementById('my-power-icon').textContent = powerData.icon;
      document.getElementById('my-power-name').textContent = powerData.label;
      document.getElementById('my-power-result').style.display = 'flex';
      document.getElementById('my-power-result').style.borderColor = powerData.color;
      myPower = power;
    }, 3200);
  }

  // Update status
  const slot = document.getElementById(`player-power-${playerIndex}`);
  const status = document.getElementById(`pps-status-${playerIndex}`);
  slot.classList.add('done');
  status.textContent = `${powerData.icon} ${powerData.label}`;

  if (bothComplete) {
    if (isCreator) {
      document.getElementById('btn-begin-game').style.display = 'block';
    } else {
      document.getElementById('btn-begin-game').style.display = 'none';
    }
  }
});

// Game start
socket.on('game_start', (data) => {
  cards = data.cards;
  myPlayerIndex = data.playerIndex;
  myPower = data.powers[myPlayerIndex];
  myPowerUsed = false;
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

  // Show powers bar
  renderPowersBar(data.powers);

  const startTime = data.startTime;
  const duration = data.duration;
  startLocalTimer(startTime, duration);
}

function renderPowersBar(powers) {
  const bar = document.getElementById('game-powers-bar');
  bar.innerHTML = '';
  const myPowerLabel = powers[myPlayerIndex];
  if (!myPowerLabel) return;

  const icons = { angel: '😇', reloj: '⌛', vision: '👁️' };
  const labels = { angel: 'Ángel Guardián', reloj: 'Reloj de Arena', vision: 'Visión Infinita' };

  // My power button
  const myBtn = document.createElement('button');
  myBtn.className = 'btn-power';
  myBtn.id = 'btn-use-power';
  myBtn.innerHTML = `${icons[myPowerLabel]} ${labels[myPowerLabel]}`;

  if (myPowerLabel === 'angel') {
    myBtn.disabled = true;
    myBtn.title = 'Se activa automáticamente';
  } else {
    myBtn.addEventListener('click', () => {
      usePower(myPowerLabel);
      myBtn.disabled = true;
      myBtn.classList.add('used');
    });
  }
  bar.appendChild(myBtn);

  // Opponent power (just display)
  const oppIdx = myPlayerIndex === 0 ? 1 : 0;
  const oppPower = powers[oppIdx];
  if (oppPower) {
    const oppLabel = document.createElement('span');
    oppLabel.className = 'btn-power';
    oppLabel.style.cursor = 'default';
    oppLabel.innerHTML = `${icons[oppPower]} ${labels[oppPower]} (oponente)`;
    bar.appendChild(oppLabel);
  }
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
socket.on('timer_update', () => {});

// Card played
socket.on('card_played', (data) => {
  const { card, playerIndex, playedCount, totalCards } = data;

  if (playerIndex === myPlayerIndex) {
    const hand = document.getElementById('card-hand');
    const cardEl = hand.querySelector(`[data-value="${card}"]`);
    if (cardEl) {
      cardEl.classList.add('playing');
      setTimeout(() => cardEl.remove(), 400);
    }
  }

  const playedContainer = document.getElementById('played-cards');
  const playedEl = document.createElement('div');
  playedEl.className = 'played-card' + (playerIndex !== myPlayerIndex ? ' opponent' : '');
  playedEl.textContent = card;
  playedContainer.appendChild(playedEl);
  playedContainer.scrollLeft = playedContainer.scrollWidth;

  setTimeout(() => {
    canPlay = true;
  }, 500);
});

// Angel saved
socket.on('angel_saved', (data) => {
  const notif = document.getElementById('angel-notification');
  notif.style.display = 'block';
  setTimeout(() => {
    notif.style.display = 'none';
  }, 2000);

  myPowerUsed = true;
  document.getElementById('btn-use-power').classList.add('used');
  document.getElementById('btn-use-power').textContent = '😇 Ángel Guardián (usado)';

  setTimeout(() => {
    canPlay = true;
  }, 1000);
});

// Reloj used
socket.on('reloj_used', (data) => {
  const notif = document.createElement('div');
  notif.className = 'reloj-notification';
  notif.textContent = '⌛ +10 segundos';
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 2000);

  if (data.playerIndex === myPlayerIndex) {
    myPowerUsed = true;
  }
});

// Vision reveal
socket.on('vision_reveal', (data) => {
  const overlay = document.getElementById('vision-overlay');
  overlay.style.display = 'flex';

  const renderVisionHand = (containerId, cardsList) => {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    cardsList.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'vision-card';
      el.style.animationDelay = `${i * 0.05}s`;
      el.textContent = c;
      container.appendChild(el);
    });
  };

  renderVisionHand('vision-cards-0', data.player0Cards);
  renderVisionHand('vision-cards-1', data.player1Cards);

  // Show which player activated it
  const label = document.querySelector('.vision-title');
  const activator = data.playerIndex === myPlayerIndex ? 'Tú' : 'Tu compañero';
  label.innerHTML = `👁️ ${activator} activó Visión Infinita`;

  if (data.playerIndex === myPlayerIndex) {
    myPowerUsed = true;
  }
});

// Vision hide
socket.on('vision_hide', () => {
  document.getElementById('vision-overlay').style.display = 'none';
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

  const container = document.getElementById('victory-cards');
  container.innerHTML = '';
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
  if (currentScreen === 'lobby' || currentScreen === 'game' || currentScreen === 'roulette') {
    showScreen('home');
    cards = [];
    myPlayerIndex = null;
    isCreator = false;
    myPower = null;
    myPowerUsed = false;
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
