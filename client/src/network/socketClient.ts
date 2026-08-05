import { io, Socket } from 'socket.io-client';

const IS_PRODUCTION = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const SERVER_URL = IS_PRODUCTION ? window.location.origin : 'http://localhost:3002';

let socket: Socket | null = null;

export interface OnlineInputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  lp: boolean;
  hp: boolean;
  lk: boolean;
  hk: boolean;
  blk: boolean;
  exL: boolean;
  exH: boolean;
  air: boolean;
  tech: boolean;
  rev: boolean;
  wake: boolean;
  thr: boolean;
}

export function connectSocket(): Socket {
  if (socket && socket.connected) {
    return socket;
  }

  socket = io(SERVER_URL, {
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('[Socket] Conectado ao servidor:', socket?.id);
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Desconectado do servidor');
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function sendPing(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error('Socket não conectado'));
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('Timeout ao esperar resposta pong'));
    }, 5000);

    socket!.once('pong', (data: { timestamp: number }) => {
      clearTimeout(timeout);
      resolve(data.timestamp);
    });

    socket!.emit('ping');
  });
}

export function createRoom(): void {
  socket?.emit('room:create');
}

export function joinRoom(roomId: string): void {
  socket?.emit('room:join', { roomId });
}

export function readyUp(): void {
  socket?.emit('room:ready');
}

export function startRoom(): void {
  socket?.emit('room:start');
}

export function leaveRoom(): void {
  socket?.emit('room:leave');
}

export function sendGameInput(input: OnlineInputState): void {
  socket?.emit('game:input', input);
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}