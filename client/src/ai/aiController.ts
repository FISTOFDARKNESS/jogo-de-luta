import { FighterState } from '@shared/game/fighter.js';

// Controle do bot neural: vetor de features (entrada da MLP), conjunto de ações
// e aplicação da ação escolhida no Fighter. Usado TANTO no treinamento offline
// (tools/train-neural-bot.ts) quanto no runtime do jogo (NeuralBotFighter).

export const INPUT_SIZE = 30;

export const ACTIONS = [
  'idle',
  'moveToward',
  'moveAway',
  'jump',
  'crouch',
  'block',
  'lightPunch',
  'lightKick',
  'heavyPunch',
  'heavyKick',
  'throw',
  'flyingKick',
  'airDash',
  'mortal',
  'exReversal',
  'techWake',
] as const;

export const ACTION_COUNT = ACTIONS.length;

const STATE_INDEX: Record<string, number> = {
  idle: 0,
  walking: 1,
  jumping: 2,
  crouching: 3,
  attacking: 4,
  blocking: 5,
  hitstun: 6,
  ko: 7,
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Features normalizadas (todas em [~-1,1] ou [0,1]) descrevendo o estado do par.
export function buildFeatureVec(me: any, opp: any): number[] {
  const f = new Array(INPUT_SIZE).fill(0);
  const meState = STATE_INDEX[me.state] ?? 0;
  const oppState = STATE_INDEX[opp.state] ?? 0;
  f[meState] = 1;
  f[8 + oppState] = 1;

  let i = 16;
  const relX = opp.x - me.x;
  f[i++] = Math.max(-1, Math.min(1, relX / 400));
  f[i++] = clamp01(Math.abs(relX) / 400);
  f[i++] = Math.max(-1, Math.min(1, (opp.y - me.y) / 400));
  f[i++] = clamp01(me.health / me.maxHealth);
  f[i++] = clamp01(opp.health / opp.maxHealth);
  f[i++] = clamp01(me.superMeter / 100);
  f[i++] = clamp01(opp.superMeter / 100);
  f[i++] = clamp01(me.posture / me.maxPosture);
  f[i++] = clamp01(opp.posture / opp.maxPosture);
  f[i++] = clamp01(me.cooldownTimer / 0.6);
  f[i++] = clamp01(opp.cooldownTimer / 0.6);
  f[i++] = clamp01(me.specialCooldown / 10);
  f[i++] = clamp01(opp.specialCooldown / 10);
  const facingOpp = (me.facing === 'right' && relX > 0) || (me.facing === 'left' && relX < 0);
  f[i++] = facingOpp ? 1 : 0;
  f[i++] = opp.isOnGround ? 0 : 1; // oponente no ar
  return f;
}

// Aplica a ação escolhida no Fighter, respeitando os mesmos guardas do Fighter.
export function applyAction(me: any, opp: any, action: string): void {
  if (me.ko || me.hitstunTimer > 0 || me.hitstopTimer > 0) return;

  // Soltar agachamento ao trocar de ação (exceto a própria ação crouch)
  if (action !== 'crouch' && me.isCrouching) me.crouchEnd();

  // Ignorar inputs durante golpe (a animação/estado resolve sozinho)
  if (me.state === 'attacking') {
    me.stopHorizontal();
    return;
  }

  switch (action) {
    case 'idle':
      me.stopHorizontal();
      if (me.isBlocking) me.stopBlock();
      break;

    case 'moveToward': {
      me.stopBlock();
      if (opp.x > me.x) me.moveRight(0.016);
      else me.moveLeft(0.016);
      break;
    }

    case 'moveAway': {
      me.stopBlock();
      if (opp.x > me.x) me.moveLeft(0.016);
      else me.moveRight(0.016);
      break;
    }

    case 'jump':
      me.stopBlock();
      me.jump();
      break;

    case 'crouch':
      me.stopBlock();
      me.crouchStart();
      break;

    case 'block':
      if (!me.isBlocking) me.startBlock();
      break;

    case 'lightPunch':
      me.stopBlock();
      me.startAttack('lightPunch');
      break;

    case 'lightKick':
      me.stopBlock();
      me.startAttack('lightKick');
      break;

    case 'heavyPunch':
      me.stopBlock();
      me.startAttack('heavyPunch');
      break;

    case 'heavyKick':
      me.stopBlock();
      me.startAttack('heavyKick');
      break;

    case 'throw':
      me.stopBlock();
      me.stopHorizontal();
      me.startAttack('throw');
      break;

    case 'flyingKick': {
      me.stopBlock();
      me.facing = opp.x >= me.x ? 'right' : 'left';
      if (me.isOnGround) {
        if (me.cooldownTimer <= 0) {
          me.jump();
          me.startAttack('flyingKick');
        } else {
          me.stopHorizontal();
        }
      } else {
        me.startAttack('flyingKick');
      }
      break;
    }

    case 'airDash':
      me.airDash();
      break;

    case 'mortal': {
      me.stopBlock();
      me.facing = opp.x >= me.x ? 'right' : 'left';
      if (me.specialCooldown > 0) {
        me.stopHorizontal();
        break;
      }
      if (me.isOnGround) {
        if (me.cooldownTimer <= 0) {
          me.jump();
          me.startAttack('mortal');
        } else {
          me.stopHorizontal();
        }
      } else {
        me.startAttack('mortal');
      }
      break;
    }

    case 'exReversal':
      me.stopBlock();
      me.reversal('heavyPunch');
      break;

    case 'techWake': {
      if (me.isOnGround) {
        if (me.wakeUpTimer > 0) me.wakeUpAttack();
        else me.stopHorizontal();
      } else {
        me.tech();
      }
      break;
    }

    default:
      break;
  }
}

export { FighterState };