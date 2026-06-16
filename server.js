const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

const DIFFICULTIES = {
  easy: { cards: 3, time: 40, label: 'Fácil', key: 'easy' },
  medium: { cards: 4, time: 30, label: 'Medio', key: 'medium' },
  hard: { cards: 5, time: 20, label: 'Difícil', key: 'hard' },
  impossible: { cards: 6, time: 15, label: '¡Imposible!', key: 'impossible' },
  somosuno: { cards: 7, time: 10, label: 'Somos Uno', key: 'somosuno' },
};

const POWER_TYPES = {
  angel: { label: 'Ángel Guardián', icon: '😇', color: '#39ff14', weight: 40 },
  reloj: { label: 'Reloj de Arena', icon: '⌛', color: '#00d4ff', weight: 40 },
  vision: { label: 'Visión Infinita', icon: '👁️', color: '#ffe600', weight: 20 },
};

function weightedRandom() {
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (const [key, p] of Object.entries(POWER_TYPES)) {
    cumulative += p.weight;
    if (rand < cumulative) return key;
  }
  return 'angel';
}

function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateCards(total) {
  const cards = Array.from({ length: 100 }, (_, i) => i + 1);
  shuffle(cards);
  return cards.slice(0, total);
}

function emitLobbyUpdate(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  io.to(roomCode).emit('lobby_update', {
    players: room.players.map(p => ({ id: p.id })),
    creator: room.creator,
    difficulty: DIFFICULTIES[room.difficulty],
    difficultyKey: room.difficulty,
  });
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerIndex = null;

  socket.on('create_room', ({ difficulty }) => {
    if (!DIFFICULTIES[difficulty]) {
      socket.emit('error', { message: 'Dificultad inválida' });
      return;
    }
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      code: roomCode,
      players: [{ id: socket.id }],
      difficulty,
      creator: socket.id,
      gameState: null,
      timer: null,
      teamPower: null,
      teamPowerConfirmed: false,
    };
    currentRoom = roomCode;
    playerIndex = 0;
    socket.join(roomCode);
    socket.emit('room_created', { code: roomCode, difficulty });
    emitLobbyUpdate(roomCode);
  });

  socket.on('join_room', ({ code }) => {
    const roomCode = code.toUpperCase();
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', { message: 'Sala no encontrada' });
    if (room.players.length >= 2) return socket.emit('error', { message: 'Sala llena' });
    if (room.gameState) return socket.emit('error', { message: 'La partida ya comenzó' });

    room.players.push({ id: socket.id });
    currentRoom = roomCode;
    playerIndex = 1;
    socket.join(roomCode);
    socket.emit('room_joined', { code: roomCode, difficulty: room.difficulty });
    emitLobbyUpdate(roomCode);
  });

  socket.on('start_roulette', () => {
    const room = rooms[currentRoom];
    if (!room) return;
    if (socket.id !== room.creator) return;
    if (room.players.length < 2) return;
    if (room.gameState) return;

    room.teamPower = null;
    room.teamPowerConfirmed = false;

    io.to(currentRoom).emit('roulette_phase');
  });

  socket.on('roulette_spin', () => {
    const room = rooms[currentRoom];
    if (!room) return;
    if (room.teamPowerConfirmed) return;

    const power = weightedRandom();
    room.teamPower = power;
    room.teamPowerConfirmed = true;

    io.to(currentRoom).emit('roulette_result', {
      power,
      powerData: POWER_TYPES[power],
    });
  });

  socket.on('start_game', () => {
    const room = rooms[currentRoom];
    if (!room) return;
    if (socket.id !== room.creator) return socket.emit('error', { message: 'Solo el creador puede iniciar' });
    if (room.players.length < 2) return socket.emit('error', { message: 'Se necesitan 2 jugadores' });
    if (room.gameState) return;

    const diff = DIFFICULTIES[room.difficulty];
    const allCards = generateCards(diff.cards * 2);
    const half = diff.cards;
    const p1Cards = allCards.slice(0, half).sort((a, b) => a - b);
    const p2Cards = allCards.slice(half).sort((a, b) => a - b);
    const sortedAll = [...p1Cards, ...p2Cards].sort((a, b) => a - b);

    room.gameState = {
      p1Cards,
      p2Cards,
      sortedAll,
      nextIndex: 0,
      playedCards: [],
      startTime: Date.now(),
      timeBonus: 0,
      powerUsed: false,
    };

    io.to(room.players[0].id).emit('game_start', {
      cards: p1Cards,
      playerIndex: 0,
      difficulty: diff,
      startTime: room.gameState.startTime,
      duration: diff.time * 1000,
      teamPower: room.teamPower,
    });
    io.to(room.players[1].id).emit('game_start', {
      cards: p2Cards,
      playerIndex: 1,
      difficulty: diff,
      startTime: room.gameState.startTime,
      duration: diff.time * 1000,
      teamPower: room.teamPower,
    });

    const timerInterval = setInterval(() => {
      if (!rooms[currentRoom] || !rooms[currentRoom].gameState) {
        clearInterval(timerInterval);
        return;
      }
      const elapsed = (Date.now() - room.gameState.startTime) / 1000;
      const remaining = Math.max(0, diff.time + room.gameState.timeBonus - elapsed);
      room.gameState.timeRemaining = remaining;
      io.to(currentRoom).emit('timer_update', { timeRemaining: remaining, totalTime: diff.time + room.gameState.timeBonus });

      if (remaining <= 0) {
        clearInterval(timerInterval);
        io.to(currentRoom).emit('game_defeat', { reason: 'time' });
        setTimeout(() => delete rooms[currentRoom], 2000);
      }
    }, 200);
    room.timer = timerInterval;
  });

  socket.on('play_card', ({ card }) => {
    const room = rooms[currentRoom];
    if (!room || !room.gameState) return;
    const state = room.gameState;
    if (state.nextIndex >= state.sortedAll.length) return;

    const expected = state.sortedAll[state.nextIndex];
    if (card === expected) {
      state.nextIndex++;
      state.playedCards.push({ card, by: playerIndex });
      io.to(currentRoom).emit('card_played', {
        card,
        playerIndex,
        playedCount: state.nextIndex,
        totalCards: state.sortedAll.length,
      });
      if (state.nextIndex >= state.sortedAll.length) {
        clearInterval(room.timer);
        const elapsed = (Date.now() - state.startTime) / 1000;
        const diff = DIFFICULTIES[room.difficulty];
        io.to(currentRoom).emit('game_victory', {
          timeRemaining: Math.max(0, diff.time + state.timeBonus - elapsed),
          difficulty: diff,
        });
        setTimeout(() => delete rooms[currentRoom], 2000);
      }
    } else {
      if (room.teamPower === 'angel' && !state.powerUsed) {
        state.powerUsed = true;
        io.to(currentRoom).emit('angel_saved');
      } else {
        clearInterval(room.timer);
        io.to(currentRoom).emit('game_defeat', { reason: 'wrong_card', card, expected });
        setTimeout(() => delete rooms[currentRoom], 2000);
      }
    }
  });

  socket.on('use_power', ({ power }) => {
    const room = rooms[currentRoom];
    if (!room || !room.gameState) return;
    const state = room.gameState;
    if (state.powerUsed) return;
    if (room.teamPower !== power) return;

    state.powerUsed = true;

    if (power === 'reloj') {
      state.timeBonus += 10;
      io.to(currentRoom).emit('reloj_used');
    } else if (power === 'vision') {
      io.to(currentRoom).emit('vision_reveal', {
        player0Cards: state.p1Cards,
        player1Cards: state.p2Cards,
      });
      setTimeout(() => {
        io.to(currentRoom).emit('vision_hide');
      }, 1000);
    }
  });

  function leaveCurrentRoom() {
    if (currentRoom && rooms[currentRoom]) {
      const room = rooms[currentRoom];
      if (room.timer) clearInterval(room.timer);
      io.to(currentRoom).emit('player_left');
      delete rooms[currentRoom];
    }
    currentRoom = null;
    playerIndex = null;
  }

  socket.on('leave_room', leaveCurrentRoom);
  socket.on('disconnect', leaveCurrentRoom);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Somos Uno corriendo en http://localhost:${PORT}`);
});
