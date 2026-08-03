export interface GameState {
  frame: number;
  players: Array<{
    id: string;
    x: number;
    y: number;
    health: number;
    state: string;
    facing: string;
  }>;
  timestamp: number;
}

export class GameStateSync {
  private stateHistory: Map<number, GameState> = new Map();
  private currentFrame: number = 0;
  private rollbackFrames: number = 2;

  saveState(state: GameState): void {
    this.stateHistory.set(state.frame, state);
    this.currentFrame = state.frame;

    // Keep only last 10 frames
    for (const [key] of this.stateHistory) {
      if (key < state.frame - 10) {
        this.stateHistory.delete(key);
      }
    }
  }

  getState(frame: number): GameState | undefined {
    return this.stateHistory.get(frame);
  }

  getLatestState(): GameState | undefined {
    return this.stateHistory.get(this.currentFrame);
  }

  rollback(targetFrame: number): GameState | undefined {
    for (let f = targetFrame; f >= targetFrame - this.rollbackFrames; f--) {
      const state = this.stateHistory.get(f);
      if (state) return state;
    }
    return undefined;
  }

  incrementFrame(): number {
    this.currentFrame++;
    return this.currentFrame;
  }

  getRollbackFrames(): number {
    return this.rollbackFrames;
  }
}

export const gameStateSync = new GameStateSync();
