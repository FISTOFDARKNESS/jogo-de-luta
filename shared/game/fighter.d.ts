export enum FighterState {
  IDLE = 'idle',
  WALKING = 'walking',
  JUMPING = 'jumping',
  CROUCHING = 'crouching',
  ATTACKING = 'attacking',
  BLOCKING = 'blocking',
  HITSTUN = 'hitstun',
  KO = 'ko',
}

export enum FighterSide {
  LEFT = 'left',
  RIGHT = 'right',
}

export enum AttackType {
  LIGHT_PUNCH = 'lightPunch',
  HEAVY_PUNCH = 'heavyPunch',
  LIGHT_KICK = 'lightKick',
  HEAVY_KICK = 'heavyKick',
}

export interface MoveInfo {
  damage: number;
  startup: number;
  active: number;
  recovery: number;
  type: string;
  throw?: boolean;
  cooldown?: number;
}

export class Fighter {
  id: string;
  side: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  fighterClass: string;
  className: string;
  baseColor: number;
  attackPower: number;
  moveSpeed: number;
  state: string;
  facing: string;
  vx: number;
  vy: number;
  isOnGround: boolean;
  isCrouching: boolean;
  isBlocking: boolean;
  blockStartTime: number | null;
  hitstunTimer: number;
  hitstopTimer: number;
  ko: boolean;
  koTimer: number;
  attackType: string | null;
  attackFrame: number;
  attackStartup: number;
  attackActive: number;
  attackRecovery: number;
  attackDone: boolean;
  cooldownTimer: number;
  COOLDOWN_TIME: number;
  attackCooldown: number;
  blockstunTimer: number;
  comboCount: number;
  lastHitTime: number;
  hasArmor: boolean;
  superMeter: number;
  MAX_SUPER_METER: number;
  airDashCooldown: number;
  AIR_DASH_TIME: number;
  isAirDashing: boolean;
  isAirborne: boolean;
  wakeUpTimer: number;
  hasArmor: boolean;
  superMeter: number;
  MAX_SUPER_METER: number;
  airDashCooldown: number;
  AIR_DASH_TIME: number;
  isAirDashing: boolean;
  isAirborne: boolean;
  airTechCooldown: number;
  wakeUpTimer: number;
  fallDamage: number;
  posture: number;
  maxPosture: number;
  postureRegenRate: number;
  postureBoostTimer: number;
  guardBroken: boolean;
  guardBreakTimer: number;
  airComboStep: number;
  airComboTimer: number;
  specialCooldown: number;
  SPECIAL_COOLDOWN: number;

  constructor(id: string, side: string, x: number, y: number, fighterClass?: string);
  update(dt: number, opponentX?: number): void;
  moveLeft(dt: number): void;
  moveRight(dt: number): void;
  stopHorizontal(): void;
  jump(): void;
  crouchStart(): void;
  crouchEnd(): void;
  startAttack(attackType: string): void;
  bufferAttack(attackType: string): void;
  startBlock(): void;
  airDash(): void;
  tech(): void;
  wakeUpAttack(): void;
  reversal(attackType: string): void;
  stopBlock(): void;
  airComboInput(type: string): string | null;
  airDash(): void;
  tech(): void;
  wakeUpAttack(): void;
  reversal(attackType: string): void;
  takeDamage(amount: number): void;
  reset(x: number, y: number): void;
}
