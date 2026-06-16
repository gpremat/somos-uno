const socket = io();
let currentScreen = 'home';
let myPlayerIndex = null;
let isCreator = false;
let cards = [];
let canPlay = true;
let lastPlayTime = 0;
let teamPower = null;
let powerUsed = false;
let roomMaxPlayers = 2;
let roomPlayers = [];

const ROULETTE_ANGLES = {
  angel: 1740,
  reloj: 1620,
  vision: 1500,
};

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
  teamPower = null;
  powerUsed = false;
  roomMaxPlayers = 2;
}

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

  const changeDiffOptions = document.getElementById('change-difficulty-options');
  if (changeDiffOptions) {
    changeDiffOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('.diff-btn');
      if (!btn) return;
      changeDiffOptions.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  }

  const playerOptions = document.getElementById('players-options');
  if (playerOptions) {
    playerOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('.player-count-btn');
      if (!btn) return;
      playerOptions.querySelectorAll('.player-count-btn').forEach(b => b.classList.remove('selected'));
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

function createRoom() {
  const diffSelected = document.querySelector('.diff-btn.selected');
  if (!diffSelected) return;
  const difficulty = diffSelected.dataset.difficulty;
  const playersSelected = document.querySelector('.player-count-btn.selected');
  const maxPlayers = playersSelected ? parseInt(playersSelected.dataset.players) : 2;
  showLoading('Creando sala...');
  socket.emit('create_room', { difficulty, maxPlayers });
}

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

function leaveRoom() {
  socket.emit('leave_room');
  goHome();
}

function startRoulette() {
  socket.emit('start_roulette');
}

function spinRoulette() {
  document.getElementById('btn-spin').disabled = true;
  document.getElementById('btn-spin').textContent = '🎲 Girando...';
  socket.emit('roulette_spin');
}

function beginGame() {
  socket.emit('start_game');
}

function playCard(card) {
  if (!canPlay) return;
  const now = Date.now();
  if (now - lastPlayTime < 500) return;
  lastPlayTime = now;
  canPlay = false;
  socket.emit('play_card', { card });
}

function usePower() {
  if (powerUsed || !teamPower) return;
  if (teamPower === 'angel') return;
  socket.emit('use_power', { power: teamPower });
}

function requestRematch() {
  socket.emit('request_rematch');
}

function showChangeSettings() {
  const currentDiff = document.querySelector('#lobby-difficulty .diff-badge');
  const options = document.querySelectorAll('#change-difficulty-options .diff-btn');
  options.forEach(b => b.classList.remove('selected'));
  showScreen('change-settings');
}

function cancelChangeSettings() {
  if (currentScreen === 'change-settings') {
    showScreen('victory');
    document.getElementById('btn-change-diff-v').style.display = isCreator ? 'inline-flex' : 'none';
    document.getElementById('btn-play-again').style.display = isCreator ? 'inline-flex' : 'none';
    document.getElementById('victory-waiting').style.display = isCreator ? 'none' : 'block';
  }
}

function applySettings() {
  const selected = document.querySelector('#change-difficulty-options .diff-btn.selected');
  if (!selected) return;
  socket.emit('change_settings', { difficulty: selected.dataset.difficulty });
}

function renderLobbyPlayers(data) {
  const container = document.getElementById('lobby-players');
  container.innerHTML = '';
  const count = data.maxPlayers || roomMaxPlayers;

  for (let i = 0; i < count; i++) {
    const isConnected = i < data.players.length;
    if (i > 0) {
      const divider = document.createElement('div');
      divider.className = 'player-divider';
      const plus = document.createElement('div');
      plus.className = 'vs-text';
      plus.textContent = '+';
      divider.appendChild(plus);
      container.appendChild(divider);
    }
    const slot = document.createElement('div');
    slot.className = 'player-slot' + (isConnected ? ' connected' : '');
    slot.id = 'player-slot-' + i;

    const indicator = document.createElement('div');
    indicator.className = 'player-indicator';

    const dot = document.createElement('div');
    dot.className = 'player-dot' + (isConnected ? '' : ' waiting');
    indicator.appendChild(dot);

    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = 'Jugador ' + (i + 1);
    indicator.appendChild(name);

    slot.appendChild(indicator);

    const status = document.createElement('span');
    status.className = 'player-status';
    status.id = 'player-status-' + i;
    if (isConnected) {
      status.textContent = 'Conectado';
    } else {
      status.textContent = 'Esperando...';
    }
    slot.appendChild(status);

    if (i === 0) {
      const hostTag = document.createElement('span');
      hostTag.className = 'host-tag';
      hostTag.textContent = '👑 Anfitrión';
      slot.appendChild(hostTag);
    }

    container.appendChild(slot);
  }
}

function updateLobby(code, mode) {
  showScreen('lobby');
  document.getElementById('room-code-display').textContent = code;
}

socket.on('room_created', (data) => {
  hideLoading();
  isCreator = true;
  myPlayerIndex = 0;
  roomMaxPlayers = data.maxPlayers || 2;
  updateLobby(data.code, 'create');
});

socket.on('room_joined', (data) => {
  hideLoading();
  myPlayerIndex = data.playerIndex;
  isCreator = false;
  updateLobby(data.code, 'join');
});

socket.on('lobby_update', (data) => {
  roomPlayers = data.players;
  roomMaxPlayers = data.maxPlayers;

  if (currentScreen === 'lobby' || currentScreen === 'victory' || currentScreen === 'defeat' || currentScreen === 'change-settings') {
    renderLobbyPlayers(data);
  }

  if (currentScreen === 'victory' || currentScreen === 'defeat' || currentScreen === 'change-settings') {
    showScreen('lobby');
  }

  document.getElementById('lobby-difficulty').innerHTML =
    `<span class="diff-badge">${data.difficulty.label} · ${data.difficulty.cards} cartas · ${data.difficulty.time}s</span>`;

  const connected = data.players.length;
  const max = data.maxPlayers;

  if (isCreator) {
    if (connected >= 2 && connected <= max && currentScreen === 'lobby') {
      document.getElementById('btn-start-roulette').style.display = 'block';
      document.getElementById('lobby-waiting').style.display = 'none';
    } else {
      document.getElementById('btn-start-roulette').style.display = 'none';
      document.getElementById('lobby-waiting').style.display = 'block';
      document.getElementById('lobby-waiting').textContent = `Esperando jugadores... (${connected}/${max})`;
    }
  } else {
    document.getElementById('btn-start-roulette').style.display = 'none';
    document.getElementById('lobby-waiting').style.display = 'block';
    if (connected >= 2) {
      document.getElementById('lobby-waiting').textContent = 'Esperando al anfitrión...';
    } else {
      document.getElementById('lobby-waiting').textContent = `Esperando jugadores... (${connected}/${max})`;
    }
  }
});

socket.on('roulette_phase', () => {
  showScreen('roulette');
  document.getElementById('btn-spin').disabled = false;
  document.getElementById('btn-spin').textContent = '🎲 GIRAR RULETA';
  document.getElementById('team-power-result').style.display = 'none';
  document.getElementById('btn-begin-game').style.display = 'none';
  document.getElementById('tps-status').textContent = '⏳ Girando...';
  document.getElementById('team-power-display').classList.remove('done');

  const wheel = document.getElementById('wheel');
  wheel.style.transform = 'rotate(0deg)';
  teamPower = null;
  powerUsed = false;
});

socket.on('roulette_result', (data) => {
  const { power, powerData } = data;

  const wheel = document.getElementById('wheel');
  const angle = ROULETTE_ANGLES[power];
  wheel.style.transform = `rotate(${angle}deg)`;

  setTimeout(() => {
    document.getElementById('team-power-icon').textContent = powerData.icon;
    document.getElementById('team-power-name').textContent = powerData.label;
    document.getElementById('team-power-result').style.display = 'flex';
    document.getElementById('team-power-result').style.borderColor = powerData.color;
    teamPower = power;
  }, 3200);

  document.getElementById('tps-status').textContent = `${powerData.icon} ${powerData.label}`;
  document.getElementById('team-power-display').classList.add('done');

  if (isCreator) {
    document.getElementById('btn-begin-game').style.display = 'block';
  }
});

socket.on('game_start', (data) => {
  cards = data.cards;
  myPlayerIndex = data.playerIndex;
  teamPower = data.teamPower;
  powerUsed = false;
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

  document.getElementById('player-badge-0').textContent = 'Tú';
  const numPlayers = data.numPlayers || 2;
  document.getElementById('player-badge-1').textContent = `${numPlayers} jugadores`;

  renderTeamPowerBar();

  const startTime = data.startTime;
  const duration = data.duration;
  startLocalTimer(startTime, duration);
}

function renderTeamPowerBar() {
  const bar = document.getElementById('game-powers-bar');
  bar.innerHTML = '';
  if (!teamPower) return;

  const icons = { angel: '😇', reloj: '⌛', vision: '👁️' };
  const labels = { angel: 'Ángel Guardián', reloj: 'Reloj de Arena', vision: 'Visión Infinita' };
  const colors = { angel: '#39ff14', reloj: '#00d4ff', vision: '#ffe600' };

  const btn = document.createElement('button');
  btn.className = 'btn-power';
  btn.id = 'btn-use-power';
  btn.style.borderColor = colors[teamPower];
  btn.innerHTML = `${icons[teamPower]} ${labels[teamPower]} del equipo`;

  if (teamPower === 'angel') {
    btn.disabled = true;
    btn.title = 'Se activa automáticamente al equivocarse';
  } else {
    btn.addEventListener('click', () => {
      usePower();
      btn.disabled = true;
      btn.classList.add('used');
    });
  }
  bar.appendChild(btn);
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

socket.on('timer_update', () => {});

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

socket.on('angel_saved', () => {
  const notif = document.getElementById('angel-notification');
  notif.style.display = 'block';
  setTimeout(() => {
    notif.style.display = 'none';
  }, 2000);

  powerUsed = true;
  const btn = document.getElementById('btn-use-power');
  if (btn) {
    btn.classList.add('used');
    btn.textContent = '😇 Ángel Guardián (usado)';
  }

  setTimeout(() => {
    canPlay = true;
  }, 1000);
});

socket.on('reloj_used', () => {
  const notif = document.createElement('div');
  notif.className = 'reloj-notification';
  notif.textContent = '⌛ +10 segundos para el equipo';
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 2000);

  powerUsed = true;
  const btn = document.getElementById('btn-use-power');
  if (btn) {
    btn.classList.add('used');
    btn.textContent = '⌛ Reloj de Arena (usado)';
  }
});

socket.on('vision_reveal', (data) => {
  const overlay = document.getElementById('vision-overlay');
  overlay.style.display = 'flex';

  const container = document.getElementById('vision-cards-container');
  container.innerHTML = '';

  const numPlayers = data.numPlayers || data.playerCards.length;
  for (let p = 0; p < numPlayers; p++) {
    const hand = document.createElement('div');
    hand.className = 'vision-hand';

    const label = document.createElement('p');
    label.className = 'vision-hand-label';
    label.textContent = p === myPlayerIndex ? 'Tus cartas' : `Jugador ${p + 1}`;
    hand.appendChild(label);

    const cardsDiv = document.createElement('div');
    cardsDiv.className = 'vision-cards';
    (data.playerCards[p] || []).forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'vision-card';
      el.style.animationDelay = `${i * 0.05}s`;
      el.textContent = c;
      cardsDiv.appendChild(el);
    });
    hand.appendChild(cardsDiv);
    container.appendChild(hand);
  }

  document.querySelector('.vision-title').innerHTML = '👁️ Visión Infinita activada';

  powerUsed = true;
  const btn = document.getElementById('btn-use-power');
  if (btn) {
    btn.classList.add('used');
    btn.textContent = '👁️ Visión Infinita (usada)';
  }
});

socket.on('vision_hide', () => {
  document.getElementById('vision-overlay').style.display = 'none';
});

socket.on('game_victory', (data) => {
  showScreen('victory');
  document.getElementById('victory-difficulty').textContent = data.difficulty.label;
  const remaining = Math.ceil(data.timeRemaining);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  document.getElementById('victory-time').textContent =
    `Tiempo restante: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  document.getElementById('btn-play-again').style.display = isCreator ? 'inline-flex' : 'none';
  document.getElementById('btn-change-diff-v').style.display = isCreator ? 'inline-flex' : 'none';
  document.getElementById('victory-waiting').style.display = isCreator ? 'none' : 'block';
});

socket.on('game_defeat', (data) => {
  showScreen('defeat');
  const reasonEl = document.getElementById('defeat-reason');
  if (data.reason === 'time') {
    reasonEl.innerHTML = '⏱ Se acabó el tiempo';
  } else if (data.reason === 'player_left') {
    reasonEl.innerHTML = '🚪 Un jugador abandonó la partida';
  } else {
    reasonEl.innerHTML = `Carta incorrecta: <strong>${data.card}</strong> (se esperaba <strong>${data.expected}</strong>)`;
  }

  document.getElementById('btn-retry').style.display = isCreator ? 'inline-flex' : 'none';
  document.getElementById('btn-change-diff-d').style.display = isCreator ? 'inline-flex' : 'none';
  document.getElementById('defeat-waiting').style.display = isCreator ? 'none' : 'block';
});

socket.on('player_left', () => {
  if (currentScreen === 'game') {
    goHome();
  }
});

socket.on('error', (data) => {
  hideLoading();
  if (currentScreen === 'join-room') {
    document.getElementById('join-error').textContent = data.message;
  } else {
    alert(data.message);
  }
});

window.addEventListener('beforeunload', () => {
  socket.emit('leave_room');
});
