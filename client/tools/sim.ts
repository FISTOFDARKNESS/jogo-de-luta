import { Fighter } from '@shared/game/fighter.js';
import { processAttack, processWallBounce } from '@shared/game/combat.js';
import { GAME_WIDTH, GROUND_Y } from '@shared/game/constants.js';
import { applyAction, buildFeatureVec, ACTIONS } from '../src/ai/aiController.js';
import { sampleAction } from '../src/ai/neuralNet.js';

// Simulador headless de uma rodada, replicando o loop do FightScene:
// fighter.update() (física/estados/timers) + resolução de golpes (processAttack).

export type Pilot = (dt: number, me: Fighter, opp: Fighter) => void;

export interface BattleResult {
  winner: 'left' | 'right' | 'draw';
  leftHealth: number;
  rightHealth: number;
  frames: number;
}

export function checkRoundBounce(defender: any, result: any): void {
  if (!defender || !result || result.wasBlocked || result.wasPerfectBlock || result.wasThrow) return;
  const nearLeft = defender.x < 60;
  const nearRight = defender.x > GAME_WIDTH - 60;
  if (!nearLeft && !nearRight) return;
  const pushedIntoWall = (nearRight && result.knockback > 0) || (nearLeft && result.knockback < 0);
  if (pushedIntoWall) processWallBounce(defender);
}

export function runRound(
  leftPilot: Pilot,
  rightPilot: Pilot,
  opts: { timeLimit?: number; dt?: number } = {}
): BattleResult {
  const dt = opts.dt ?? 1 / 30;
  const startA = GAME_WIDTH * 0.32;
  const startB = GAME_WIDTH * 0.68;
  const useLeft = Math.random() < 0.5;
  const a = new Fighter('a', 'left', useLeft ? startA : startB, GROUND_Y, 'balanced');
  const b = new Fighter('b', 'right', useLeft ? startB : startA, GROUND_Y, 'balanced');

  let winner: BattleResult['winner'] = 'draw';
  let elapsed = 0;

  for (elapsed = 0; elapsed < (opts.timeLimit ?? 90); elapsed += dt) {
    a.update(dt, b.x);
    b.update(dt, a.x);

    if (a.state === 'attacking' && !a.attackDone) {
      const r1 = processAttack(a, b, a.attackType as string);
      if (r1) {
        a.attackDone = true;
        checkRoundBounce(b, r1);
      }
    }
    if (b.state === 'attacking' && !b.attackDone) {
      const r2 = processAttack(b, a, b.attackType as string);
      if (r2) {
        b.attackDone = true;
        checkRoundBounce(a, r2);
      }
    }

    leftPilot(dt, a, b);
    rightPilot(dt, b, a);

    if (a.health <= 0) { winner = 'right'; break; }
    if (b.health <= 0) { winner = 'left'; break; }
  }

  if (winner === 'draw') {
    if (a.health > b.health) winner = 'left';
    else if (b.health > a.health) winner = 'right';
  }

  return { winner, leftHealth: a.health, rightHealth: b.health, frames: Math.round(elapsed / dt) };
}

// ---------------------------------------------------------------------------
// Pilotos: comandam o Fighter como se fossem um jogador.
// ---------------------------------------------------------------------------

export class NeuralPilot {
  name = 'neural';
  private timer: number;

  constructor(private net: Float32Array, private temperature = 1, private interval = 0.09) {
    this.timer = Math.random() * 0.03;
  }

  step(dt: number, me: Fighter, opp: Fighter): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.interval;
    const idx = sampleAction(this.net, buildFeatureVec(me, opp), this.temperature);
    applyAction(me, opp, ACTIONS[idx]);
  }
}

// Mesma lógica do BotFighter do jogo (bots de dificuldade) para treino.
export class ScriptedPilot {
  name = 'scripted';
  private actionTimer = 0;
  private postAttackBlockTimer = 0;
  private currentAction = 'idle';

  constructor(public diff: 'easy' | 'normal' | 'hard' | 'expert' | 'nightmare') {}

  step(dt: number, me: Fighter, opp: Fighter): void {
    const c = SCRIPTS[this.diff];
    if (me.ko || me.hitstunTimer > 0 || me.hitstopTimer > 0) return;

    this.actionTimer -= dt;
    this.postAttackBlockTimer -= dt;
    const distance = Math.abs(me.x - opp.x);

    if (me.wakeUpTimer > 0 && opp.hitstunTimer <= 0 && Math.random() < c.techChance) {
      me.wakeUpAttack();
      return;
    }

    if (this.postAttackBlockTimer > 0) {
      me.startBlock();
      return;
    }

    if (opp.state === 'attacking' && distance < 120) {
      if (Math.random() < c.blockChance) {
        if (Math.random() < c.perfectBlockChance) me.blockStartTime = Date.now();
        me.startBlock();
        return;
      }
    } else {
      me.stopBlock();
    }

    if (this.actionTimer <= 0) {
      this.decide(me, opp, distance, c);
    }
    this.execute(me, opp, dt, c);
  }

  private decide(me: Fighter, opp: Fighter, distance: number, c: any): void {
    this.actionTimer = c.approachDelay + Math.random() * 0.2;

    if (opp.hitstunTimer > 0 && distance < 120) {
      this.currentAction = 'attack';
      this.actionTimer = 0.12;
      return;
    }
    if (!opp.isOnGround && distance > 60 && distance < 230 && Math.random() < c.airKickChance) {
      this.currentAction = 'airKick';
      return;
    }
    if (opp.isBlocking && distance < 70 && Math.random() < c.throwChance) {
      this.currentAction = 'throw';
      return;
    }
    if (distance > 70 && distance < 240 && me.specialCooldown <= 0 && Math.random() < c.specialChance) {
      this.currentAction = 'special';
      return;
    }

    if (distance > 150) {
      this.currentAction = 'approach';
    } else if (distance < 70) {
      const rand = Math.random();
      if (rand < 0.45) this.currentAction = 'attack';
      else if (rand < 0.75) this.currentAction = me.x > 120 && me.x < GAME_WIDTH - 120 ? 'retreat' : 'approach';
      else this.currentAction = 'idle';
    } else {
      const rand = Math.random();
      if (rand < 0.55) this.currentAction = 'attack';
      else if (rand < 0.9) this.currentAction = 'approach';
      else this.currentAction = 'airKick';
    }
  }

  private execute(me: Fighter, opp: Fighter, dt: number, c: any): void {
    const opponentToRight = opp.x > me.x;
    switch (this.currentAction) {
      case 'approach':
        if (opponentToRight) me.moveRight(dt); else me.moveLeft(dt);
        break;
      case 'retreat':
        if (opponentToRight) me.moveLeft(dt); else me.moveRight(dt);
        break;
      case 'attack': {
        me.stopHorizontal();
        if (me.cooldownTimer > 0 || Math.abs(me.x - opp.x) > 95) {
          this.currentAction = 'idle';
          this.actionTimer = 0.15;
          break;
        }
        const attacks = ['lightPunch', 'lightPunch', 'lightKick', 'heavyPunch', 'heavyKick'];
        me.startAttack(attacks[Math.floor(Math.random() * attacks.length)]);
        this.currentAction = 'idle';
        this.actionTimer = 1.0 / c.attackSpeed;
        this.postAttackBlockTimer = c.postBlock;
        break;
      }
      case 'throw':
        me.stopHorizontal();
        me.facing = opp.x > me.x ? 'right' : 'left';
        me.startAttack('throw');
        this.currentAction = 'idle';
        this.actionTimer = 1.0;
        break;
      case 'special':
        me.stopHorizontal();
        me.facing = opp.x > me.x ? 'right' : 'left';
        me.jump();
        me.startAttack('mortal');
        this.currentAction = 'idle';
        this.actionTimer = 1.2;
        this.postAttackBlockTimer = 1.2;
        break;
      case 'airKick':
        me.stopHorizontal();
        me.facing = opp.x > me.x ? 'right' : 'left';
        me.jump();
        me.startAttack('flyingKick');
        this.currentAction = 'idle';
        this.actionTimer = 1.2;
        this.postAttackBlockTimer = 1.0;
        break;
      default:
        me.stopHorizontal();
        break;
    }
  }
}

const SCRIPTS: Record<string, any> = {
  easy: { approachDelay: 0.6, blockChance: 0.2, perfectBlockChance: 0.0, attackSpeed: 1.0, airKickChance: 0.05, specialChance: 0.1, techChance: 0.05, throwChance: 0.15, postBlock: 1.4 },
  normal: { approachDelay: 0.3, blockChance: 0.6, perfectBlockChance: 0.15, attackSpeed: 1.0, airKickChance: 0.15, specialChance: 0.25, techChance: 0.1, throwChance: 0.3, postBlock: 1.1 },
  hard: { approachDelay: 0.15, blockChance: 0.9, perfectBlockChance: 0.35, attackSpeed: 1.2, airKickChance: 0.25, specialChance: 0.4, techChance: 0.2, throwChance: 0.5, postBlock: 0.8 },
  expert: { approachDelay: 0.1, blockChance: 0.95, perfectBlockChance: 0.55, attackSpeed: 1.3, airKickChance: 0.35, specialChance: 0.55, techChance: 0.35, throwChance: 0.65, postBlock: 0.6 },
  nightmare: { approachDelay: 0.05, blockChance: 1.0, perfectBlockChance: 0.85, attackSpeed: 1.5, airKickChance: 0.45, specialChance: 0.7, techChance: 0.5, throwChance: 0.8, postBlock: 0.45 },
};