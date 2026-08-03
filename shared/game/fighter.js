import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GROUND_Y,
  MOVE_SPEED,
  JUMP_FORCE,
  GRAVITY,
  AIR_TECH_COOLDOWN,
  PLAYER_MAX_HEALTH,
} from './constants';
import { MoveData } from './combat';
import { FighterState, FighterSide, AttackType } from './types';

export { FighterState, FighterSide, AttackType };

export const FIGHTER_CLASSES = {
  balanced: { name: 'BALANCED', health: 1.0, speed: 1.0, attack: 1.0, color: 0xff4444 },
  berserker: { name: 'BERSERKER', health: 0.8, speed: 1.2, attack: 1.3, color: 0x880000 },
  tank: { name: 'TANK', health: 1.4, speed: 0.8, attack: 0.9, color: 0x4a4a4a },
};

export class Fighter {
  constructor(id, side, x, y, fighterClass = 'balanced') {
    this.id = id;
    this.side = side;
    this.x = x;
    this.y = y;
    this.fighterClass = fighterClass;
    const cls = FIGHTER_CLASSES[fighterClass] || FIGHTER_CLASSES.balanced;
    this.className = cls.name;
    this.baseColor = cls.color;
    this.attackPower = cls.attack;
    this.moveSpeed = MOVE_SPEED * cls.speed;
    this.health = Math.round(PLAYER_MAX_HEALTH * cls.health);
    this.maxHealth = this.health;
    this.state = FighterState.IDLE;
    this.facing = side === FighterSide.LEFT ? FighterSide.RIGHT : FighterSide.LEFT;
    this.vx = 0;
    this.vy = 0;
    this.isOnGround = true;
    this.isCrouching = false;
    this.isBlocking = false;
    this.hitstunTimer = 0;
    this.hitstopTimer = 0;
    this.ko = false;
    this.koTimer = 0;
    this.attackType = null;
    this.attackFrame = 0;
    this.attackStartup = 0;
    this.attackActive = 0;
    this.attackRecovery = 0;
    this.attackDone = false;
    this.cooldownTimer = 0;
    this.COOLDOWN_TIME = 0.25;
    this.attackCooldown = 0.25;
    this.blockstunTimer = 0;
    this.comboCount = 0;
    this.lastHitTime = 0;
    this.inputBufferTimer = 0;
    this.bufferedAttack = null;
    this.INPUT_BUFFER_TIME = 1 / 10;
    this.hasArmor = false;
    this.superMeter = 0;
    this.MAX_SUPER_METER = 100;
    this.airDashCooldown = 0;
    this.AIR_DASH_TIME = 0.15;
    this.isAirDashing = false;
    this.isAirborne = false;
    this.airTechCooldown = 0;
    this.wakeUpTimer = 0;
    this.fallDamage = 0;
    this.posture = 100;
    this.maxPosture = 100;
    this.postureRegenRate = 8;
    this.postureBoostTimer = 0;
    this.guardBroken = false;
    this.guardBreakTimer = 0;
    this.airComboStep = 0;
    this.airComboTimer = 0;
    this.specialCooldown = 0;
    this.SPECIAL_COOLDOWN = 10;
  }

  update(dt, opponentX) {
    // Direção do personagem: acompanha o movimento (esquerda/direita);
    // ao parar, ele vira para o oponente. Não vira durante hitstun/KO.
    if (!this.ko && this.state !== FighterState.HITSTUN) {
      if (this.vx !== 0) {
        this.facing = this.vx < 0 ? FighterSide.LEFT : FighterSide.RIGHT;
      } else if (opponentX !== undefined) {
        this.facing = this.x <= opponentX ? FighterSide.RIGHT : FighterSide.LEFT;
      }
    }

    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer < 0) this.cooldownTimer = 0;
    }

    if (this.blockstunTimer > 0) {
      this.blockstunTimer -= dt;
      if (this.blockstunTimer < 0) this.blockstunTimer = 0;
    }

    if (this.wakeUpTimer > 0) {
      this.wakeUpTimer -= dt;
      if (this.wakeUpTimer < 0) this.wakeUpTimer = 0;
    }

    if (this.airDashCooldown > 0) {
      this.airDashCooldown -= dt;
      if (this.airDashCooldown < 0) this.airDashCooldown = 0;
    }

    if (this.airTechCooldown > 0) {
      this.airTechCooldown -= dt;
      if (this.airTechCooldown < 0) this.airTechCooldown = 0;
    }

    if (this.isAirDashing) {
      this.isAirDashing = false;
    }

    // Cooldown do especial (mortal)
    if (this.specialCooldown > 0) {
      this.specialCooldown -= dt;
      if (this.specialCooldown < 0) this.specialCooldown = 0;
    }

    // Sequência do mortal (chute+soco+chute no ar): expira se passar tempo ou tocar o chão
    if (this.airComboTimer > 0) {
      this.airComboTimer -= dt;
      if (this.airComboTimer <= 0) {
        this.airComboTimer = 0;
        this.airComboStep = 0;
      }
    }
    if (this.isOnGround) {
      this.airComboStep = 0;
    }

    // Postura: guard break em andamento -> sem defesa; ao acabar, volta com postura parcial
    if (this.guardBreakTimer > 0) {
      this.guardBreakTimer -= dt;
      this.isBlocking = false;
      if (this.guardBreakTimer <= 0) {
        this.guardBreakTimer = 0;
        this.guardBroken = false;
        this.posture = 40;
      }
    } else if (!this.ko && this.hitstunTimer <= 0 && !this.isBlocking) {
      // Recuperação lenta; perfect block acelera (postureBoostTimer ativo)
      const regenMult = this.postureBoostTimer > 0 ? 4 : 1;
      this.posture = Math.min(this.maxPosture, this.posture + this.postureRegenRate * regenMult * dt);
      if (this.postureBoostTimer > 0) {
        this.postureBoostTimer -= dt;
        if (this.postureBoostTimer < 0) this.postureBoostTimer = 0;
      }
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      if (this.hitstopTimer < 0) this.hitstopTimer = 0;
      return;
    }

    if (this.inputBufferTimer > 0) {
      this.inputBufferTimer -= dt;
      if (this.inputBufferTimer <= 0) {
        this.inputBufferTimer = 0;
        if (this.bufferedAttack && (this.state === FighterState.IDLE || this.state === FighterState.BLOCKING) && this.cooldownTimer <= 0) {
          this.startAttack(this.bufferedAttack);
          this.bufferedAttack = null;
        }
      }
    }

    if (this.ko) {
      this.state = FighterState.KO;
      this.koTimer -= dt;
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
      }
      return;
    }

    if (this.state === FighterState.HITSTUN) {
      this.hitstunTimer -= dt;
      if (this.wakeUpTimer > 0) {
        this.wakeUpTimer -= dt;
        if (this.wakeUpTimer < 0) this.wakeUpTimer = 0;
      }

      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      this.x += this.vx * dt;

      if (!this.isOnGround && this.fallDamage > 0) {
        const fallDmg = this.fallDamage;
        this.fallDamage = 0;
        this.health = Math.max(0, this.health - fallDmg);
        if (this.health <= 0) {
          this.health = 0;
          this.ko = true;
          this.koTimer = 2;
        }
      }
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
        this.isOnGround = true;
        this.isAirborne = false;
        if (this.ko) {
          this.wakeUpTimer = 0.5;
        } else if (this.wakeUpTimer <= 0) {
          // Quick rise: quem cai pode levantar antes do hitstun acabar
          this.wakeUpTimer = 0.5;
        }
      } else {
        this.isOnGround = false;
        this.isAirborne = true;
      }

      if (this.x < 0) { this.x = 0; this.vx = 0; }
      if (this.x > GAME_WIDTH) { this.x = GAME_WIDTH; this.vx = 0; }

      if (this.hitstunTimer <= 0) {
        this.hitstunTimer = 0;
        this.vx *= 0.3;
        this.comboCount = 0;
        this.state = FighterState.IDLE;
      }
      return;
    }

    if (this.state === FighterState.ATTACKING) {
      this.attackFrame += dt * 60;

      const totalFrames = this.attackStartup + this.attackActive + this.attackRecovery;
      const isInActive = this.attackFrame >= this.attackStartup && this.attackFrame < this.attackStartup + this.attackActive;
      this.hasArmor = isInActive;

      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      this.x += this.vx * dt;

      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
        this.isOnGround = true;
        this.isAirborne = false;
      } else {
        this.isOnGround = false;
        this.isAirborne = true;
      }

      if (this.x < 0) { this.x = 0; this.vx = 0; }
      if (this.x > GAME_WIDTH) { this.x = GAME_WIDTH; this.vx = 0; }

      if (this.attackFrame >= totalFrames) {
        this.state = FighterState.IDLE;
        this.attackDone = true;
        this.cooldownTimer = this.attackCooldown;
        this.hasArmor = false;
        if (this.attackType === 'flyingKick') this.vx = 0;
      }
      return;
    }

    if (this.isCrouching) {
      this.state = FighterState.CROUCHING;
    } else if (this.vx !== 0) {
      this.state = FighterState.WALKING;
    } else if (!this.isOnGround) {
      this.state = FighterState.JUMPING;
    } else {
      this.state = FighterState.IDLE;
    }

    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    this.x += this.vx * dt;

    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      this.vy = 0;
      this.isOnGround = true;
      this.airTechCooldown = 0;
    } else {
      this.isOnGround = false;
    }

    if (this.x < 0) {
      this.x = 0;
      this.vx = 0;
    }
    if (this.x > GAME_WIDTH) {
      this.x = GAME_WIDTH;
      this.vx = 0;
    }
  }

  moveLeft(dt) {
    if (this.ko || this.hitstunTimer > 0) return;
    if (this.hitstopTimer > 0) return;
    if (this.blockstunTimer > 0) return;
    this.vx = -this.moveSpeed;
    this.facing = FighterSide.LEFT;
  }

  moveRight(dt) {
    if (this.ko || this.hitstunTimer > 0) return;
    if (this.hitstopTimer > 0) return;
    if (this.blockstunTimer > 0) return;
    this.vx = this.moveSpeed;
    this.facing = FighterSide.RIGHT;
  }

  stopHorizontal() {
    this.vx = 0;
  }

  jump() {
    if (this.ko || this.hitstunTimer > 0) return;
    if (this.hitstopTimer > 0) return;
    if (this.blockstunTimer > 0) return;
    if (this.isOnGround && !this.isCrouching) {
      this.vy = JUMP_FORCE;
      this.isOnGround = false;
    }
  }

  crouchStart() {
    if (this.ko || this.hitstunTimer > 0) return;
    if (this.hitstopTimer > 0) return;
    if (this.blockstunTimer > 0) return;
    if (this.isOnGround) {
      this.isCrouching = true;
    }
  }

  crouchEnd() {
    this.isCrouching = false;
  }

  startAttack(attackType) {
    if (this.ko || this.hitstunTimer > 0) return;
    if (this.hitstopTimer > 0) return;
    if (this.blockstunTimer > 0) return;
    if (this.cooldownTimer > 0) return;
    if (this.state === FighterState.ATTACKING) {
      const totalFrames = this.attackStartup + this.attackActive + this.attackRecovery;
      if (this.attackFrame < this.attackStartup + this.attackActive) return;
    }

    this.bufferedAttack = null;
    this.inputBufferTimer = 0;

    const move = MoveData[attackType];
    if (!move) return;

    this.state = FighterState.ATTACKING;
    this.attackType = attackType;
    this.attackFrame = 0;
    this.attackStartup = move.startup;
    this.attackActive = move.active;
    this.attackRecovery = move.recovery;
    this.attackDone = false;
    this.attackCooldown = move.cooldown ?? 0.25;

    // Voadora: "deita" no ar e desliza para frente (mantém o impulso do pulo)
    if (attackType === 'flyingKick') {
      this.vx = (this.facing === FighterSide.RIGHT ? 1 : -1) * this.moveSpeed * 1.7;
      this.isOnGround = false;
      this.isAirborne = true;
      this.isCrouching = false;
    }

    // Mortal: giro no ar em direção ao oponente; cooldown de 10s
    if (attackType === 'mortal') {
      this.vx = (this.facing === FighterSide.RIGHT ? 1 : -1) * this.moveSpeed * 2.0;
      this.isOnGround = false;
      this.isAirborne = true;
      this.isCrouching = false;
      this.specialCooldown = this.SPECIAL_COOLDOWN;
    }
  }

  // Sequência do mortal: no ar, chute -> soco -> chute
  // Retorna 'mortal' (disparou), 'kick' (continue com a voadora),
  // 'punch' (passo 2 da sequência) ou 'none'.
  airComboInput(type) {
    if (type === 'kick') {
      if (this.airComboStep === 2) {
        if (this.specialCooldown > 0 || this.ko) {
          this.airComboStep = 0;
          this.airComboTimer = 0;
          return 'kick';
        }
        if (this.state === FighterState.ATTACKING) {
          const totalFrames = this.attackStartup + this.attackActive + this.attackRecovery;
          if (this.attackFrame < this.attackStartup + this.attackActive) {
            // Sem cancelamento ainda: mantém o combo vivo para o próximo chute
            this.airComboStep = 2;
            this.airComboTimer = 0.6;
            return 'none';
          }
        }
        this.airComboStep = 0;
        this.airComboTimer = 0;
        // O cooldown da voadora não pode comer o mortal
        this.cooldownTimer = 0;
        this.startAttack('mortal');
        return 'mortal';
      }
      if (this.airComboStep !== 1) this.airComboStep = 1;
      this.airComboTimer = 0.6;
      return 'kick';
    }
    if (this.airComboStep === 1) {
      this.airComboStep = 2;
      this.airComboTimer = 0.6;
      return 'punch';
    }
    return 'none';
  }

  startBlock() {
    if (this.ko || this.hitstunTimer > 0) return;
    if (this.hitstopTimer > 0) return;
    if (this.blockstunTimer > 0) return;
    if (this.cooldownTimer > 0) return;
    if (this.guardBroken) return;
    if (!this.isBlocking) {
      this.blockStartTime = Date.now();
    }
    this.isBlocking = true;
    this.state = FighterState.BLOCKING;
  }

  stopBlock() {
    this.isBlocking = false;
    this.blockStartTime = null;
    if (this.state === FighterState.BLOCKING && this.hitstunTimer <= 0 && !this.ko) {
      this.state = FighterState.IDLE;
      this.cooldownTimer = this.COOLDOWN_TIME;
    }
  }

  bufferAttack(attackType) {
    if (this.ko || this.hitstunTimer > 0) return;
    this.bufferedAttack = attackType;
    this.inputBufferTimer = this.INPUT_BUFFER_TIME;
  }

  airDash() {
    if (this.ko || this.hitstunTimer > 0) return;
    if (this.blockstunTimer > 0) return;
    if (!this.isAirborne || this.airDashCooldown > 0) return;
    this.isAirDashing = true;
    this.airDashCooldown = this.AIR_DASH_TIME;
    this.vx = this.facing === FighterSide.RIGHT ? MOVE_SPEED * 1.5 : -MOVE_SPEED * 1.5;
    this.vy = 0;
  }

  tech() {
    if (this.ko || this.hitstunTimer > 0) return;
    if (this.blockstunTimer > 0) return;
    if (this.isOnGround) return;
    if (this.airTechCooldown > 0) return;
    this.airTechCooldown = AIR_TECH_COOLDOWN;
    this.vy = JUMP_FORCE * 0.6;
    this.isOnGround = false;
    this.hitstunTimer = 0;
    this.state = FighterState.JUMPING;
  }

  wakeUpAttack() {
    if (this.ko || this.hitstunTimer > 0) return;
    if (this.blockstunTimer > 0) return;
    if (!this.isOnGround || this.wakeUpTimer <= 0) return;
    this.wakeUpTimer = 0;
    this.startAttack('lightPunch');
  }

  reversal(attackType) {
    if (this.ko || this.hitstunTimer > 0) return;
    if (this.superMeter < 25) return;
    this.superMeter -= 25;
    this.hasArmor = true;
    this.startAttack(attackType);
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - Math.round(amount));
    if (this.health <= 0) {
      this.health = 0;
      this.ko = true;
      this.koTimer = 2;
      this.state = FighterState.KO;
      this.vx = 0;
      this.vy = 0;
    }
  }

  reset(x, y) {
    const cls = FIGHTER_CLASSES[this.fighterClass] || FIGHTER_CLASSES.balanced;
    this.x = x;
    this.y = y;
    this.health = Math.round(PLAYER_MAX_HEALTH * cls.health);
    this.maxHealth = this.health;
    this.state = FighterState.IDLE;
    this.ko = false;
    this.koTimer = 0;
    this.hitstunTimer = 0;
    this.hitstopTimer = 0;
    this.vx = 0;
    this.vy = 0;
    this.isOnGround = true;
    this.isCrouching = false;
    this.isBlocking = false;
    this.attackType = null;
    this.attackFrame = 0;
    this.attackDone = false;
    this.cooldownTimer = 0;
    this.attackCooldown = 0.25;
    this.blockstunTimer = 0;
    this.comboCount = 0;
    this.inputBufferTimer = 0;
    this.bufferedAttack = null;
    this.hasArmor = false;
    this.superMeter = 0;
    this.airDashCooldown = 0;
    this.isAirDashing = false;
    this.isAirborne = false;
    this.wakeUpTimer = 0;
    this.fallDamage = 0;
    this.posture = this.maxPosture;
    this.postureBoostTimer = 0;
    this.guardBroken = false;
    this.guardBreakTimer = 0;
    this.airComboStep = 0;
    this.airComboTimer = 0;
    this.specialCooldown = 0;
  }
}