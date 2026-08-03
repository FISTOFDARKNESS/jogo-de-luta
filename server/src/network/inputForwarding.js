import { Socket } from 'socket.io';
import { gameStateSync } from './gameStateSync.js';

export function handleInputForwarding(socket: Socket, data: any): void {
  const { frame, inputs } = data;

  // Validate input frame
  if (frame < gameStateSync.getLatestState()?.frame - 5) {
    return; // Too old, ignore
  }

  // Store input for this frame
  gameStateSync.saveState({
    frame,
    players: [], // Will be populated by game logic
    timestamp: Date.now(),
  });
}
