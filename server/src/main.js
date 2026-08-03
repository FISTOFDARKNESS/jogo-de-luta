import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import { roomManager } from './rooms/roomManager.js';

const app = express();
const httpServer = createServer(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');
const clientDist = process.env.CLIENT_DIST_DIR || join(repoRoot, 'client', 'dist');
const indexHtml = join(clientDist, 'index.html');
const distExists = fs.existsSync(indexHtml);

if (distExists) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(indexHtml));
} else {
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>jogo-de-luta</title></head><body><h1>Build em andamento — recarregue.</h1></body></html>';
  app.get('*', (_req, res) => res.status(200).type('html').send(html));
}

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3002;

function roomPayload(room) {
  return {
    roomId: room.id,
    hostId: room.hostId,
    state: room.state,
    players: room.players.map((p) => ({ id: p.id, ready: p.ready })),
  };
}

function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  socket.data.roomId = null;
  if (!roomId) return;
  const room = roomManager.leaveRoom(roomId, socket.id);
  socket.leave(roomId);
  if (!room) {
    io.to(roomId).emit('room:closed');
  } else {
    io.to(roomId).emit('room:update', roomPayload(room));
    io.to(roomId).emit('opponent_left');
  }
}

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);
  socket.data.roomId = null;

  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  socket.on('room:create', () => {
    const room = roomManager.createRoom(socket.id, 2);
    socket.data.roomId = room.id;
    socket.join(room.id);
    socket.emit('room:created', { isHost: true, ...roomPayload(room) });
    console.log(`Sala criada ${room.id} por ${socket.id}`);
  });

  socket.on('room:join', (data) => {
    const roomId = data && data.roomId ? String(data.roomId).trim().toUpperCase() : '';
    if (!roomId) {
      socket.emit('room:error', { message: 'Código de sala inválido' });
      return;
    }
    const room = roomManager.joinRoom(roomId, socket.id);
    if (!room) {
      socket.emit('room:error', { message: 'Sala não encontrada, cheia ou em jogo' });
      return;
    }
    socket.data.roomId = room.id;
    socket.join(room.id);
    socket.emit('room:joined', { isHost: false, ...roomPayload(room) });
    io.to(room.id).emit('room:update', roomPayload(room));
    console.log(`${socket.id} entrou na sala ${room.id}`);
  });

  socket.on('room:ready', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.setReady(roomId, socket.id);
    if (room) {
      io.to(roomId).emit('room:update', roomPayload(room));
    }
  });

  socket.on('room:start', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    const started = roomManager.startGame(roomId);
    if (started) {
      io.to(roomId).emit('room:started', roomPayload(started));
      console.log(`Sala ${roomId} começou`);
    }
  });

  socket.on('room:leave', () => {
    leaveRoom(socket);
  });

  // Encaminha os inputs do jogador para o oponente da mesma sala
  socket.on('game:input', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('game:input', { from: socket.id, input: data });
  });

  socket.on('disconnect', () => {
    leaveRoom(socket);
    console.log(`Desconectado: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
