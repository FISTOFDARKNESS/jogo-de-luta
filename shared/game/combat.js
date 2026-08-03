import { FighterState, AttackType } from './types';
import { GAME_WIDTH } from './constants';

export { AttackType };

export const MoveData = {
  // cooldown (s): trava global após o golpe terminar. Leves são baixos
  // para permitir combos de ligação; pesados são altos para punir whiff.
  lightPunch: { damage: 5, startup: 3, active: 2, recovery: 6, type: 'high', throw: false, cooldown: 0.1 },
  heavyPunch: { damage: 12, startup: 8, active: 3, recovery: 14, type: 'high', throw: false, cooldown: 0.28 },
  lightKick: { damage: 6, startup: 4, active: 3, recovery: 8, type: 'low', throw: false, cooldown: 0.12 },
  heavyKick: { damage: 15, startup: 10, active: 4, recovery: 18, type: 'low', throw: false, cooldown: 0.32 },
  throw: { damage: 20, startup: 5, active: 2, recovery: 10, type: 'throw', throw: true, cooldown: 0.4 },
  exLightPunch: { damage: 10, startup: 4, active: 3, recovery: 8, type: 'high', throw: false, cooldown: 0.16 },
  exHeavyPunch: { damage: 22, startup: 10, active: 4, recovery: 16, type: 'high', throw: false, cooldown: 0.3 },
  flyingKick: { damage: 14, startup: 5, active: 9, recovery: 16, type: 'high', throw: false, cooldown: 0.3 },
  mortal: { damage: 30, startup: 6, active: 14, recovery: 16, type: 'high', throw: false, cooldown: 0.6 },
  airPunch: { damage: 6, startup: 4, active: 5, recovery: 12, type: 'high', throw: false, cooldown: 0.14 },
  airHeavyPunch: { damage: 10, startup: 6, active: 6, recovery: 14, type: 'high', throw: false, cooldown: 0.2 },
};

export const CHIP_DAMAGE_RATIO = 0.15;

export const PERFECT_BLOCK_WINDOW_MS = 120;

export const HITSTOP_FRAMES = 4;
export const HITSTOP_TIME = HITSTOP_FRAMES / 60;

export const CORNER_THRESHOLD = 100;
export const WALL_BOUNCE_KNOCKBACK = 200;
export const SUPER_METER_GAIN = 15;
export const EX_SUPER_COST = 25;

export function createHitbox(fighter) {
  if (fighter.state !== FighterState.ATTACKING) {
    return null;
  }
  const isThrow = MoveData[fighter.attackType]?.throw;
  const range = isThrow ? 24 : 45;
  const width = isThrow ? 30 : 50;
  // Caixa única ao redor do lutador: cobre tanto a frente quanto atrás dele.
  const frontReach = range + width;
  const backReach = isThrow ? 30 : 60;
  return {
    x: fighter.x - backReach,
    y: fighter.y - 25,
    width: frontReach + backReach,
    height: 35,
  };
}

export function createHurtbox(fighter) {
  return {
    x: fighter.x - 17,
    y: fighter.y - 40,
    width: 34,
    height: 40,
  };
}

export function checkCollision(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function processAttack(attacker, defender, attackType) {
  const move = MoveData[attackType];
  if (!move) return null;

  const hitbox = createHitbox(attacker);
  const hurtbox = createHurtbox(defender);

  if (!hitbox || !hurtbox) return null;

  const hit = checkCollision(hitbox, hurtbox);
  if (!hit) return null;

  // Dano escala com o poder de ataque do ATACANTE (não do defensor)
  let damage = Math.round(move.damage * (attacker.attackPower || 1));
  let hitstunFrames = move.active + move.recovery;
  let knockback = attacker.facing === 'right' ? 150 : -150;
  let wasPerfectBlock = false;
  let guardBroke = false;
  const isThrow = move.throw;
  const wasBlocking = defender.isBlocking;

  if (isThrow) {
    // Agarrão ignora bloqueio: conecta sempre em alcance curto e lança o oponente.
    // Não pode ser bloqueado (por isso quebra a defesa) e reseta combos.
    defender.takeDamage(damage);
    defender.hitstunTimer = 0.9;
    defender.vx = knockback * 2.2;
    defender.vy = -320;
    defender.isOnGround = false;
    defender.isAirborne = true;
    defender.fallDamage = Math.round(damage * 0.35);
    if (defender.ko) {
      defender.vy = -430;
      defender.vx = knockback * 2.8;
    }
    defender.state = FighterState.HITSTUN;
    attacker.hitstopTimer = HITSTOP_TIME;
    defender.hitstopTimer = HITSTOP_TIME;
    attacker.superMeter = Math.min(attacker.MAX_SUPER_METER, attacker.superMeter + SUPER_METER_GAIN);
    attacker.comboCount = 0;
    return {
      damage,
      hitstunFrames: 54,
      knockback,
      wasBlocked: false,
      wasPerfectBlock: false,
      wasThrow: true,
      comboCount: 0,
    };
  }

  if (defender.isBlocking) {
    const now = Date.now();
    const blockDuration = defender.blockStartTime ? (now - defender.blockStartTime) : 9999;
    if (blockDuration <= PERFECT_BLOCK_WINDOW_MS) {
      wasPerfectBlock = true;
      damage = 0;
      knockback = 0;
      hitstunFrames = 0;
      attacker.hitstunTimer = 0.3;
      attacker.state = FighterState.HITSTUN;
      // Perfect block: postura sobe na hora E regenera 4x mais rápido por 3s
      defender.posture = Math.min(defender.maxPosture, defender.posture + 20);
      defender.postureBoostTimer = 3;
      defender.superMeter = Math.min(defender.MAX_SUPER_METER, defender.superMeter + 10);
    } else {
      // Postura desgasta ao bloquear; zerou -> guard break: o golpe conecta com dano cheio
      const postureLoss = attackType === 'mortal' ? 45 : Math.max(3, Math.round(move.damage * 0.7));
      defender.posture = Math.max(0, defender.posture - postureLoss);
      if (defender.posture <= 0 && !defender.guardBroken) {
        guardBroke = true;
        defender.guardBroken = true;
        defender.guardBreakTimer = 1.5;
        defender.isBlocking = false;
        defender.state = FighterState.HITSTUN;
        defender.hitstunTimer = Math.max(defender.hitstunTimer, 1.0);
      } else {
        // Bloqueio normal: só chip + blockstun. Nada de hit real nem combo.
        damage = Math.round(damage * CHIP_DAMAGE_RATIO);
        knockback = knockback * 0.3;
        hitstunFrames = Math.round(hitstunFrames * 0.2);

        // Blockstun: enquanto dura, o defensor não pode agir (nem largar e revidar)
        defender.blockstunTimer = Math.max(0.12, ((move.active + move.recovery) / 60) * 0.4 + (move.damage >= 12 ? 0.05 : 0));

        defender.takeDamage(damage);
        // Golpe bloqueado não continua combo
        attacker.comboCount = 0;
      }
    }
  }

  // Golpe conecta de verdade: só quando não foi bloqueado (nem perfeito, nem normal).
  // Guard break entra aqui com dano cheio (a guarda estilhaçou).
  if (!wasPerfectBlock && !defender.isBlocking) {
    // Wiring do contador de combo: hit conecta enquanto o defensor
    // ainda está em hitstun -> combo continua (escala de dano decai).
    if (defender.hitstunTimer > 0) {
      attacker.comboCount += 1;
    } else {
      attacker.comboCount = 1;
    }

    const comboScale = attacker.comboCount > 1 ? Math.max(0.5, 1 - (attacker.comboCount - 1) * 0.1) : 1;
    damage = Math.round(damage * comboScale);
    hitstunFrames = Math.round(hitstunFrames * comboScale);
    knockback = Math.round(knockback * comboScale);

    // Dano de canto: quem está NA PAREDE (defensor) recebe knockback maior
    if (defender.x < CORNER_THRESHOLD || defender.x > GAME_WIDTH - CORNER_THRESHOLD) {
      knockback = Math.round(knockback * 1.5);
    }

    defender.takeDamage(damage);
    // Guard break já aplicou stun longo; não sobrescrever por um menor
    defender.hitstunTimer = guardBroke
      ? Math.max(defender.hitstunTimer, hitstunFrames / 60)
      : hitstunFrames / 60;
    defender.vx = knockback;
    if (defender.ko) {
      defender.vy = -430;
      defender.vx = knockback * 2.4;
    }
    defender.state = FighterState.HITSTUN;

    attacker.hitstopTimer = HITSTOP_TIME;
    defender.hitstopTimer = HITSTOP_TIME;
    attacker.superMeter = Math.min(attacker.MAX_SUPER_METER, attacker.superMeter + SUPER_METER_GAIN);
    // Quem apanha também gera meter (reversais/EX ficam acessíveis)
    defender.superMeter = Math.min(defender.MAX_SUPER_METER, defender.superMeter + 8);

    // Ground bounce on heavy kick
    if (attackType === "heavyKick" && !defender.isOnGround) {
      defender.vy = -200;
      defender.state = FighterState.HITSTUN;
      defender.hitstunTimer = 0.5;
    }
  }

  // Voadora/mortal: acertou de verdade -> inimigo voa para trás e cai no chão,
  // levando dano do golpe E dano de queda. Bloqueado -> só chip + empurrão.
  if ((attackType === 'flyingKick' || attackType === 'mortal') && !wasPerfectBlock && !defender.isBlocking) {
    const isMortal = attackType === 'mortal';
    defender.vy = isMortal ? -600 : -460;
    defender.vx = knockback * (isMortal ? 3 : 2.5);
    defender.hitstunTimer = isMortal ? 1.2 : 1.3;
    defender.fallDamage = Math.round(move.damage * 0.5);
    defender.isOnGround = false;
    defender.isAirborne = true;
  }

  if (defender.isBlocking && !wasPerfectBlock && attacker.hasArmor) {
    damage = Math.round(damage * 0.3);
  }

  return {
    damage,
    hitstunFrames,
    knockback,
    // Guard break conta como acerto (dano cheio, não chip) para o feedback visual
    wasBlocked: wasBlocking && !guardBroke,
    wasPerfectBlock,
    wasThrow: false,
    comboCount: attacker.comboCount,
  };
}

export function processWallBounce(defender) {
  defender.vx = defender.facing === 'right' ? -WALL_BOUNCE_KNOCKBACK : WALL_BOUNCE_KNOCKBACK;
  defender.vy = -150;
  defender.state = FighterState.HITSTUN;
  defender.hitstunTimer = 0.3;
}