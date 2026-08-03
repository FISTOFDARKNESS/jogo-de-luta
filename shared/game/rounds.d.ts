export enum RoundState {
  WAITING = 'waiting',
  COUNTDOWN = 'countdown',
  FIGHTING = 'fighting',
  ROUND_ENDED = 'roundEnded',
  MATCH_ENDED = 'matchEnded',
}

export class RoundManager {
  state: string;
  roundNumber: number;
  maxRounds: number;
  roundTime: number;
  timer: number;
  scores: { p1: number; p2: number };
  countdownValue: number;
  winner: string | null;
  matchWinner: string | null;
  isLastRound: boolean;

  constructor();
  reset(): void;
  startRound(): void;
  update(dt: number): void;
  endRound(winner: string | null): void;
  nextRound(): boolean;
  getRoundResult(p1Health: number, p2Health: number): string | null;
  getMatchResult(): string | null;
}
