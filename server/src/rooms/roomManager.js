export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(hostId, maxPlayers = 2) {
    const id = this.generateId();
    const room = {
      id,
      hostId,
      players: [{ id: hostId, ready: false }],
      maxPlayers,
      state: 'waiting',
      createdAt: Date.now(),
    };
    this.rooms.set(id, room);
    return room;
  }

  joinRoom(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'waiting') return null;
    if (room.players.length >= room.maxPlayers) return null;
    if (room.players.find((p) => p.id === playerId)) return null;
    room.players.push({ id: playerId, ready: false });
    return room;
  }

  leaveRoom(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return null;
    }
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0].id;
    }
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  setReady(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.ready = true;
    return room;
  }

  startGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.players.length < 2) return null;
    room.state = 'playing';
    return room;
  }

  generateId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}

export const roomManager = new RoomManager();
