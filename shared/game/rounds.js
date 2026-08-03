export const RoundState = {
  WAITING: 'waiting',
  COUNTDOWN: 'countdown',
  FIGHTING: 'fighting',
  ROUND_ENDED: 'roundEnded',
  MATCH_ENDED: 'matchEnded',
};

export class RoundManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = RoundState.WAITING;
    this.roundNumber = 1;
    this.maxRounds = 5;
    this.roundTime = 180;
    this.timer = this.roundTime;
    this.scores = { p1: 0, p2: 0 };
    this.countdownValue = 3;
    this.winner = null;
    this.matchWinner = null;
    this.isLastRound = false;
  }

  startRound() {
    this.state = RoundState.COUNTDOWN;
    this.countdownValue = 3;
    this.timer = this.roundTime;
    this.isLastRound = this.roundNumber === this.maxRounds && this.scores.p1 === 2 && this.scores.p2 === 2;
  }

  update(dt) {
    switch (this.state) {
      case RoundState.COUNTDOWN:
        this.countdownValue -= dt;
        if (this.countdownValue <= 0) {
          this.state = RoundState.FIGHTING;
        }
        break;

      case RoundState.FIGHTING:
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = 0;
          this.state = RoundState.ROUND_ENDED;
        }
        break;

      case RoundState.ROUND_ENDED:
        break;

      case RoundState.MATCH_ENDED:
        break;

      default:
        break;
    }
  }

  endRound(winner) {
    if (winner) {
      this.scores[winner]++;
    }
    this.state = RoundState.ROUND_ENDED;
    this.winner = winner;
  }

  nextRound() {
    if (this.scores.p1 >= 3 || this.scores.p2 >= 3) {
      this.state = RoundState.MATCH_ENDED;
      this.matchWinner = this.scores.p1 >= 3 ? 'p1' : 'p2';
      return false;
    }

    this.roundNumber++;
    this.startRound();
    return true;
  }

  getRoundResult(p1Health, p2Health) {
    if (p1Health <= 0 && p2Health <= 0) {
      return 'double_ko';
    }
    if (p1Health <= 0) {
      return 'p2';
    }
    if (p2Health <= 0) {
      return 'p1';
    }
    if (this.timer <= 0) {
      if (p1Health > p2Health) return 'p1';
      if (p2Health > p1Health) return 'p2';
      return 'double_ko';
    }
    return null;
  }

  getMatchResult() {
    if (this.scores.p1 >= 3) return 'p1';
    if (this.scores.p2 >= 3) return 'p2';
    return null;
  }
}