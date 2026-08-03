import { GAME_WIDTH } from '@shared/game/constants.js';
import { FighterSide, FighterState } from '@shared/game/fighter.js';
import { BotDifficulty, DifficultyConfig, DIFFICULTY_CONFIGS } from '../scenes/DifficultySelectScene.js';

export class BotFighter {
  private fighter: any;
  private opponent: any;
  private difficulty: BotDifficulty;
  private config: DifficultyConfig;
  private actionTimer: number = 0;
  private currentAction: string = 'idle';
  private postAttackBlockTimer: number = 0;
  private shouldBlock: boolean = false;

  constructor(fighter: any, opponent: any, difficulty: BotDifficulty = 'normal', config?: DifficultyConfig) {
    this.fighter = fighter;
    this.opponent = opponent;
    this.difficulty = difficulty;
    this.config = config ?? DIFFICULTY_CONFIGS[difficulty];
  }

  update(dt: number): void {
    if (this.fighter.ko || this.fighter.hitstunTimer > 0 || this.fighter.hitstopTimer > 0) return;

    this.actionTimer -= dt;
    this.postAttackBlockTimer -= dt;
    const distance = Math.abs(this.fighter.x - this.opponent.x);

    // Quick rise: levanta cedo de knockdowns nas dificuldades altas
    if (this.fighter.wakeUpTimer > 0 && this.opponent.hitstunTimer <= 0) {
      if (Math.random() < this.techChance()) {
        this.fighter.wakeUpAttack();
      }
      return;
    }

    if (this.postAttackBlockTimer > 0) {
      this.fighter.startBlock();
      return;
    }

    this.shouldBlock = false;

    if (this.opponent.state === FighterState.ATTACKING && distance < 120) {
      if (Math.random() < this.config.blockChance) {
        this.shouldBlock = true;
        if (Math.random() < this.config.perfectBlockChance) {
          this.fighter.blockStartTime = Date.now();
        }
        this.fighter.startBlock();
        return;
      }
    } else {
      this.fighter.stopBlock();
    }

    if (this.actionTimer <= 0) {
      this.decideNextAction(distance);
    }

    this.executeAction(dt);
  }

  private techChance(): number {
    switch (this.difficulty) {
      case 'nightmare': return 0.5;
      case 'expert': return 0.35;
      case 'hard': return 0.2;
      case 'normal': return 0.1;
      default: return 0.05;
    }
  }

  private postAttackBlockDuration(): number {
    switch (this.difficulty) {
      case 'nightmare': return 0.45;
      case 'expert': return 0.6;
      case 'hard': return 0.8;
      case 'normal': return 1.1;
      default: return 1.4;
    }
  }

  private decideNextAction(distance: number): void {
    this.actionTimer = this.config.approachDelay + Math.random() * 0.2;

    // Aproveitar combo: oponente em hitstun e no alcance -> seguir atacando
    if (this.opponent.hitstunTimer > 0 && distance < 120) {
      this.currentAction = 'attack';
      this.actionTimer = 0.12;
      return;
    }

    // Anti-ar: oponente pulando em distância média → voadora é ótima resposta
    const opponentAirborne = !this.opponent.isOnGround;
    if (opponentAirborne && distance > 60 && distance < 230 && Math.random() < this.config.airKickChance) {
      this.currentAction = 'airKick';
      return;
    }

    // Agarrão: oponente bloqueando por muito tempo em alcance curto
    if (this.opponent.isBlocking && distance < 70 && Math.random() < this.throwChance()) {
      this.currentAction = 'throw';
      return;
    }

    // Especial (mortal): usa quando o cooldown de 10s acabou
    if (distance > 70 && distance < 240 && this.fighter.specialCooldown <= 0 && Math.random() < this.config.specialChance) {
      this.currentAction = 'special';
      return;
    }

    if (distance > 150) {
      this.currentAction = 'approach';
    } else if (distance < 70) {
      const rand = Math.random();
      if (rand < 0.45) {
        this.currentAction = 'attack';
      } else if (rand < 0.75) {
        this.currentAction = this.canRetreat() ? 'retreat' : 'approach';
      } else {
        this.currentAction = 'idle';
      }
    } else {
      const rand = Math.random();
      if (rand < 0.55) {
        this.currentAction = 'attack';
      } else if (rand < 0.8 - this.config.airKickChance * 0.6) {
        this.currentAction = 'approach';
      } else {
        this.currentAction = 'airKick';
      }
    }
  }

  private throwChance(): number {
    switch (this.difficulty) {
      case 'nightmare': return 0.8;
      case 'expert': return 0.65;
      case 'hard': return 0.5;
      case 'normal': return 0.3;
      default: return 0.15;
    }
  }

  private canRetreat(): boolean {
    return this.fighter.x > 120 && this.fighter.x < GAME_WIDTH - 120;
  }

  private executeAction(dt: number): void {
    const isToRightOfOpponent = this.fighter.x > this.opponent.x;

    switch (this.currentAction) {
      case 'approach':
        if (isToRightOfOpponent) {
          this.fighter.moveLeft(dt);
        } else {
          this.fighter.moveRight(dt);
        }
        break;

      case 'retreat':
        if (isToRightOfOpponent) {
          this.fighter.moveRight(dt);
        } else {
          this.fighter.moveLeft(dt);
        }
        break;

      case 'attack':
        this.fighter.stopHorizontal();
        const attackDelay = 1.0 / this.config.attackSpeed;
        const attacks = ['lightPunch', 'lightPunch', 'lightKick', 'heavyPunch', 'heavyKick'];
        const chosenAttack = attacks[Math.floor(Math.random() * attacks.length)];
        // Não desperdiça ataque em cooldown nem fora do alcance
        if (this.fighter.cooldownTimer > 0 || Math.abs(this.fighter.x - this.opponent.x) > 95) {
          this.currentAction = 'idle';
          this.actionTimer = 0.15;
          break;
        }
        this.fighter.startAttack(chosenAttack);
        this.currentAction = 'idle';
        this.actionTimer = attackDelay;
        this.postAttackBlockTimer = this.postAttackBlockDuration();
        break;

      case 'throw':
        this.fighter.stopHorizontal();
        this.fighter.startAttack('throw');
        this.currentAction = 'idle';
        this.actionTimer = 1.0;
        break;

      case 'special':
        this.fighter.stopHorizontal();
        this.fighter.facing = this.fighter.x > this.opponent.x ? FighterSide.LEFT : FighterSide.RIGHT;
        this.fighter.jump();
        this.fighter.startAttack('mortal');
        this.currentAction = 'idle';
        this.actionTimer = 1.2;
        this.postAttackBlockTimer = 1.2;
        break;

      case 'airKick':
        this.fighter.stopHorizontal();
        // Vira para o oponente para nunca deslizar para trás
        this.fighter.facing = this.fighter.x > this.opponent.x ? FighterSide.LEFT : FighterSide.RIGHT;
        this.fighter.jump();
        this.fighter.startAttack('flyingKick');
        this.currentAction = 'idle';
        this.actionTimer = 1.2;
        this.postAttackBlockTimer = 1.0;
        break;

      case 'idle':
      default:
        this.fighter.stopHorizontal();
        break;
    }
  }
}
