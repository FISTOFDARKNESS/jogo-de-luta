import Phaser from 'phaser';

// ============================================================================
// Tipos do esqueleto R15 (15 partes conectadas em hierarquia de ossos)
// ============================================================================

export interface RigPose {
  rotation?: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
}

export interface RigKeyframe {
  /** tempo em segundos */
  time: number;
  /** poses por nome de parte (rotação/posição relativas ao pai) */
  parts?: Record<string, RigPose>;
  /** pose do pivô corporal (usado para tumba no KO) */
  root?: RigPose;
}

export interface RigAnimation {
  name: string;
  loop: boolean;
  duration: number;
  keyframes: RigKeyframe[];
}

export interface FighterPalette {
  skin: number;
  skinShade: number;
  skinDark: number;
  shirt: number;
  shirtShade: number;
  shirtDark: number;
  shorts: number;
  shortsDark: number;
  gloves: number;
  shoes: number;
  shoesDark: number;
  sole: number;
  hair: number;
  hairDark: number;
  belt: number;
  beltBuckle: number;
  band: number;
  outline: number;
}

// ============================================================================
// Utilidades de cor
// ============================================================================

function darken(color: number, k: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * (1 - k));
  const g = Math.floor(((color >> 8) & 0xff) * (1 - k));
  const b = Math.floor((color & 0xff) * (1 - k));
  return (r << 16) | (g << 8) | b;
}

function lighten(color: number, k: number): number {
  const r = Math.floor(((color >> 16) & 0xff) + (255 - ((color >> 16) & 0xff)) * k);
  const g = Math.floor(((color >> 8) & 0xff) + (255 - ((color >> 8) & 0xff)) * k);
  const b = Math.floor((color & 0xff) + (255 - (color & 0xff)) * k);
  return (r << 16) | (g << 8) | b;
}

// ============================================================================
// Posições base das partes no espaço do corpo (pivô no quadril = 0,0; y+ p/ baixo)
// ============================================================================

const BASE_POS: Record<string, { x: number; y: number }> = {
  LowerTorso: { x: 0, y: -2 },
  UpperTorso: { x: 0, y: -12 },
  Head: { x: 0, y: -26 },
  LeftUpperArm: { x: -17.5, y: -30 },
  LeftLowerArm: { x: 0, y: 16 },
  LeftHand: { x: 0, y: 14 },
  RightUpperArm: { x: 17.5, y: -30 },
  RightLowerArm: { x: 0, y: 16 },
  RightHand: { x: 0, y: 14 },
  LeftUpperLeg: { x: -8, y: 0 },
  LeftLowerLeg: { x: 0, y: 27 },
  LeftFoot: { x: 0, y: 27 },
  RightUpperLeg: { x: 8, y: 0 },
  RightLowerLeg: { x: 0, y: 27 },
  RightFoot: { x: 0, y: 27 },
};

/** Pose de guarda (também é o repouso e o frame final das animações) */
const GUARD_POSE: Record<string, RigPose> = {
  LowerTorso: { rotation: 0.03, y: -2 },
  UpperTorso: { rotation: -0.02 },
  Head: { rotation: 0.02 },
  LeftUpperArm: { rotation: 0.52 },
  LeftLowerArm: { rotation: 1.0 },
  LeftHand: { rotation: 0.5 },
  RightUpperArm: { rotation: 0.55 },
  RightLowerArm: { rotation: 1.05 },
  RightHand: { rotation: 0.5 },
  LeftUpperLeg: { rotation: -0.06 },
  LeftLowerLeg: { rotation: 0.1 },
  LeftFoot: { rotation: -0.04 },
  RightUpperLeg: { rotation: 0.06 },
  RightLowerLeg: { rotation: -0.1 },
  RightFoot: { rotation: 0.04 },
};

const PIVOT_Y = -54;

// Inverte horizontalmente uma keyframe: troca o sinal das rotações para que o
// golpe avance para +x (frente do lutador). x/y de translação são mantidos.
function mirrorKf(kf: RigKeyframe): RigKeyframe {
  const parts: Record<string, RigPose> = {};
  for (const [name, pose] of Object.entries(kf.parts ?? {})) {
    parts[name] = {
      ...pose,
      rotation: pose.rotation !== undefined ? -pose.rotation : undefined,
    };
  }
  const root: RigPose | undefined = kf.root
    ? {
        ...kf.root,
        rotation: kf.root.rotation !== undefined ? -kf.root.rotation : undefined,
      }
    : undefined;
  return { time: kf.time, parts, root };
}

// ============================================================================
// Handle público para controlar uma única parte do corpo (ex.: mover só a mão)
// ============================================================================

export class RigPartHandle {
  constructor(private rig: RiggedCharacter, readonly name: string) {}

  setRotation(rotation: number): this {
    this.rig.setPartPose(this.name, { rotation });
    return this;
  }

  setPosition(x: number, y: number): this {
    this.rig.setPartPose(this.name, { x, y });
    return this;
  }

  setScale(sx: number, sy: number): this {
    this.rig.setPartPose(this.name, { scaleX: sx, scaleY: sy });
    return this;
  }

  setColor(color: number): this {
    this.rig.setPartColor(this.name, color);
    return this;
  }

  rotateTo(rotation: number, duration: number = 0.2, ease: string = 'Quad.easeOut'): this {
    this.rig.tweenPart(this.name, { rotation }, duration, ease);
    return this;
  }

  moveTo(x: number, y: number, duration: number = 0.2, ease: string = 'Quad.easeOut'): this {
    this.rig.tweenPart(this.name, { x, y }, duration, ease);
    return this;
  }

  scaleTo(sx: number, sy: number, duration: number = 0.2, ease: string = 'Quad.easeOut'): this {
    this.rig.tweenPart(this.name, { scaleX: sx, scaleY: sy }, duration, ease);
    return this;
  }

  get rotation(): number {
    return this.rig.getPartContainer(this.name).rotation;
  }

  get position(): { x: number; y: number } {
    const c = this.rig.getPartContainer(this.name);
    return { x: c.x, y: c.y };
  }

  /** libera a parte para voltar a ser controlada pelas animações */
  release(): this {
    this.rig.releasePart(this.name);
    return this;
  }
}

// ============================================================================
// Classe principal: esqueleto humanoid R15 com hierarquia real (linkage)
// ============================================================================

export class RiggedCharacter extends Phaser.GameObjects.Container {
  private parts: Map<string, Phaser.GameObjects.Container> = new Map();
  private partGfx: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private partColorKey: Map<string, keyof FighterPalette> = new Map();
  private partDraws: Map<string, (g: Phaser.GameObjects.Graphics, p: FighterPalette) => void> = new Map();
  private bodyPivot: Phaser.GameObjects.Container;
  private pivotBaseY: number = PIVOT_Y;

  private palette: FighterPalette;

  private anims: Map<string, RigAnimation> = new Map();
  private loopAnim: { anim: RigAnimation; speed: number } | null = null;
  private loopTime: number = 0;
  private pendingLoop: { anim: RigAnimation; speed: number } | null = null;
  private oneShot: { anim: RigAnimation; speed: number; time: number; onComplete?: () => void } | null = null;
  private heldPose: { anim: RigAnimation; time: number } | null = null;
  private recentOneShot: { name: string; finishedAt: number } | null = null;

  private curPose: Map<string, Required<RigPose>> = new Map();
  private overrides: Set<string> = new Set();

  private bodyScale: number = 1;
  private facing: number = 1;
  private turning: boolean = false;

  private flashTimer: number = 0;
  private flashDuration: number = 1;
  private flashColor: number = 0xffffff;
  private flashOverlay: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    facing: number = 1,
    options: { baseColor?: number; bodyScale?: number } = {}
  ) {
    super(scene, x, y);
    this.facing = facing;
    this.bodyScale = options.bodyScale ?? 1;
    this.palette = this.buildPalette(options.baseColor ?? 0xff4444);

    this.bodyPivot = this.scene.add.container(0, this.pivotBaseY);
    this.add(this.bodyPivot);

    this.createRig();
    this.createAnimations();
    this.initCurPose();

    this.flashOverlay = this.scene.add.graphics();
    this.flashOverlay.setBlendMode(Phaser.BlendModes.ADD);
    this.flashOverlay.setVisible(false);
    this.add(this.flashOverlay);

    this.setFacing(facing);
  }

  // --------------------------------------------------------------------------
  // Paleta de cores do lutador
  // --------------------------------------------------------------------------

  private buildPalette(baseColor: number): FighterPalette {
    return {
      skin: 0xffcf9f,
      skinShade: 0xf2b483,
      skinDark: 0xd68f5c,
      shirt: baseColor,
      shirtShade: darken(baseColor, 0.14),
      shirtDark: darken(baseColor, 0.4),
      shorts: darken(baseColor, 0.35),
      shortsDark: darken(baseColor, 0.55),
      gloves: darken(baseColor, 0.22),
      shoes: 0x22252e,
      shoesDark: 0x13151b,
      sole: 0x4c515d,
      hair: 0x2a1d12,
      hairDark: 0x170f08,
      belt: 0x1a1c21,
      beltBuckle: 0xd9b64a,
      band: lighten(baseColor, 0.35),
      outline: 0x241a12,
    };
  }

  // --------------------------------------------------------------------------
  // Construção do esqueleto (15 partes + hierarquia de ossos)
  // --------------------------------------------------------------------------

  private addPart(
    name: string,
    parent: string | null,
    draw: (g: Phaser.GameObjects.Graphics, p: FighterPalette) => void,
    colorKey: keyof FighterPalette
  ): Phaser.GameObjects.Container {
    const base = BASE_POS[name];
    const container = this.scene.add.container(base.x, base.y);
    const gfx = this.scene.add.graphics();
    draw(gfx, this.palette);
    container.add(gfx);
    (parent ? this.parts.get(parent)! : this.bodyPivot).add(container);
    this.parts.set(name, container);
    this.partGfx.set(name, gfx);
    this.partColorKey.set(name, colorKey);
    this.partDraws.set(name, draw);
    return container;
  }

  private createRig(): void {
    // --- Membro esquerdo (fica atrás do corpo) ---
    this.addPart('LeftUpperLeg', null, this.drawUpperLeg, 'shorts');
    this.addPart('LeftLowerLeg', 'LeftUpperLeg', this.drawLowerLeg, 'skin');
    this.addPart('LeftFoot', 'LeftLowerLeg', this.drawFoot, 'shoes');

    this.addPart('LeftUpperArm', null, this.drawUpperArm, 'shirt');
    this.addPart('LeftLowerArm', 'LeftUpperArm', this.drawLowerArm, 'skin');
    this.addPart('LeftHand', 'LeftLowerArm', this.drawHand, 'gloves');

    // --- Tronco ---
    this.addPart('LowerTorso', null, this.drawLowerTorso, 'shorts');
    this.addPart('UpperTorso', 'LowerTorso', this.drawUpperTorso, 'shirt');
    this.addPart('Head', 'UpperTorso', this.drawHead, 'skin');

    // --- Membro direito (fica na frente do corpo) ---
    this.addPart('RightUpperArm', 'UpperTorso', this.drawUpperArm, 'shirt');
    this.addPart('RightLowerArm', 'RightUpperArm', this.drawLowerArm, 'skin');
    this.addPart('RightHand', 'RightLowerArm', this.drawHand, 'gloves');

    this.addPart('RightUpperLeg', null, this.drawUpperLeg, 'shorts');
    this.addPart('RightLowerLeg', 'RightUpperLeg', this.drawLowerLeg, 'skin');
    this.addPart('RightFoot', 'RightLowerLeg', this.drawFoot, 'shoes');
  }

  // --- Utilitário de desenho: membro com sombreamento e contorno ---

  private limb(
    g: Phaser.GameObjects.Graphics,
    p: FighterPalette,
    x: number,
    y0: number,
    len: number,
    w: number,
    base: number,
    light: number,
    dark: number
  ): void {
    g.fillStyle(base, 1);
    g.fillRoundedRect(x - w / 2, y0, w, len, w / 2);
    g.fillStyle(light, 1);
    g.fillRoundedRect(x - w / 2 + 1, y0 + 1.5, w * 0.3, len - 3, 1.5);
    g.fillStyle(dark, 1);
    g.fillRoundedRect(x + w / 2 - 1 - w * 0.26, y0 + 1.5, w * 0.26, len - 3, 1.5);
    g.lineStyle(1.2, p.outline, 1);
    g.strokeRoundedRect(x - w / 2, y0, w, len, w / 2);
  }

  // --- Desenho detalhado de cada parte (pivô = articulação em 0,0) ---

  private drawLowerTorso = (g: Phaser.GameObjects.Graphics, p: FighterPalette): void => {
    g.fillStyle(p.shorts, 1);
    g.fillRoundedRect(-13, -2, 26, 12, 4);
    g.fillStyle(p.shortsDark, 1);
    g.fillRoundedRect(-13, -2, 26, 5, 4);
    g.fillStyle(p.belt, 1);
    g.fillRect(-13, -1, 26, 3);
    g.fillStyle(p.beltBuckle, 1);
    g.fillRect(-2.5, -1, 5, 3);
    g.fillStyle(p.shortsDark, 1);
    g.fillRect(-9, 6, 3.5, 4);
    g.fillRect(5.5, 6, 3.5, 4);
    g.lineStyle(1.2, p.outline, 1);
    g.strokeRoundedRect(-13, -2, 26, 12, 4);
  };

  private drawUpperTorso = (g: Phaser.GameObjects.Graphics, p: FighterPalette): void => {
    g.fillStyle(p.skin, 1);
    g.fillRoundedRect(-4, -30, 8, 6, 2);
    g.fillStyle(p.shirt, 1);
    g.fillRoundedRect(-13, -26, 26, 26, 6);
    g.fillStyle(p.shirtShade, 1);
    g.fillEllipse(-7, -17, 9, 11);
    g.fillEllipse(7, -17, 9, 11);
    g.fillStyle(p.shirtDark, 1);
    g.fillRoundedRect(-4, -26, 8, 26, 3);
    g.fillStyle(p.shirtShade, 1);
    g.fillRect(-4, -12, 8, 1.6);
    g.fillRect(-4, -8, 8, 1.6);
    g.fillRect(-4, -4, 8, 1.6);
    g.fillStyle(p.shirtShade, 1);
    g.fillCircle(-17, -27, 6);
    g.fillCircle(17, -27, 6);
    g.lineStyle(1.2, p.outline, 1);
    g.strokeCircle(-17, -27, 6);
    g.strokeCircle(17, -27, 6);
    g.strokeRoundedRect(-13, -26, 26, 26, 6);
  };

  private drawHead = (g: Phaser.GameObjects.Graphics, p: FighterPalette): void => {
    g.fillStyle(p.skinShade, 1);
    g.fillCircle(0, 0, 3.5);
    g.lineStyle(1, p.outline, 1);
    g.strokeCircle(0, 0, 3.5);

    g.fillStyle(p.skin, 1);
    g.fillCircle(0, -13, 9.5);
    g.fillStyle(p.skin, 1);
    g.fillRoundedRect(-7, -16, 14, 11, 4.5);

    g.fillStyle(0xffffff, 0.12);
    g.fillRoundedRect(2, -19, 5, 9, 2.5);

    g.fillStyle(p.skinShade, 1);
    g.fillCircle(-8.5, -10, 2.4);

    g.fillStyle(p.hair, 1);
    g.arc(0, -13, 10, Math.PI, Math.PI * 2, false, 10);
    g.fillRoundedRect(-10.5, -19, 8, 12, 3);
    g.fillRoundedRect(-8.5, -19.5, 16, 3, 1.5);

    g.fillStyle(p.band, 1);
    g.fillRoundedRect(-9.5, -16.5, 18, 3.8, 2);
    g.fillCircle(-9.8, -14.6, 2.2);
    g.lineStyle(1.1, p.outline, 1);
    g.lineBetween(-12.5, -14, -16, -11);
    g.lineBetween(-12, -13.2, -15.5, -9);

    g.fillStyle(0xffffff, 1);
    g.fillEllipse(4.2, -11.5, 4.8, 3.6);
    g.fillStyle(0x20242e, 1);
    g.fillCircle(5.8, -11.5, 1.5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6.3, -12.1, 0.55);

    g.lineStyle(1.7, p.hairDark, 1);
    g.lineBetween(0.8, -14.3, 8.2, -14.0);

    g.lineStyle(1.3, p.outline, 1);
    g.lineBetween(3.2, -3.6, 8.6, -3.9);

    g.fillStyle(0xff7f6a, 0.5);
    g.fillCircle(8.6, -7.4, 2.2);

    g.lineStyle(1.2, p.outline, 1);
    g.strokeCircle(0, -13, 9.5);
    g.strokeRoundedRect(-7, -16, 14, 11, 4.5);
  };

  private drawUpperArm = (g: Phaser.GameObjects.Graphics, p: FighterPalette): void => {
    this.limb(g, p, 0, 0, 16, 8, p.shirt, lighten(p.shirt, 0.2), p.shirtDark);
    g.fillStyle(p.skinShade, 1);
    g.fillCircle(0, 16, 3.2);
    g.fillStyle(p.shirtShade, 1);
    g.fillCircle(0, 0, 5.5);
    g.lineStyle(1.2, p.outline, 1);
    g.strokeCircle(0, 0, 5.5);
  };

  private drawLowerArm = (g: Phaser.GameObjects.Graphics, p: FighterPalette): void => {
    this.limb(g, p, 0, 0, 14, 7, p.skin, lighten(p.skin, 0.1), p.skinDark);
    g.fillStyle(p.gloves, 1);
    g.fillRoundedRect(-4.5, 11, 9, 4, 2);
    g.lineStyle(1.1, p.outline, 1);
    g.strokeRoundedRect(-4.5, 11, 9, 4, 2);
  };

  private drawHand = (g: Phaser.GameObjects.Graphics, p: FighterPalette): void => {
    g.fillStyle(p.skin, 1);
    g.fillRoundedRect(-4.5, -7, 9, 7, 3);
    g.fillStyle(p.skinDark, 1);
    g.fillRect(-3.3, -6.5, 1.6, 4);
    g.fillRect(-0.9, -6.5, 1.6, 4);
    g.fillRect(1.5, -6.5, 1.6, 4);
    g.fillStyle(p.skinShade, 1);
    g.fillCircle(-5.2, -4, 2.6);
    g.fillStyle(p.gloves, 1);
    g.fillRoundedRect(-4.5, -7.5, 9, 2.2, 1.5);
    g.lineStyle(1.1, p.outline, 1);
    g.strokeRoundedRect(-4.5, -7, 9, 7, 3);
  };

  private drawUpperLeg = (g: Phaser.GameObjects.Graphics, p: FighterPalette): void => {
    this.limb(g, p, 0, 0, 27, 11, p.shorts, lighten(p.shorts, 0.22), p.shortsDark);
    g.fillStyle(p.skinShade, 1);
    g.fillCircle(0, 27, 3.4);
    g.lineStyle(1.1, p.outline, 1);
    g.strokeCircle(0, 27, 3.4);
  };

  private drawLowerLeg = (g: Phaser.GameObjects.Graphics, p: FighterPalette): void => {
    this.limb(g, p, 0, 0, 27, 10, p.skin, lighten(p.skin, 0.08), p.skinDark);
    g.fillStyle(p.skinShade, 1);
    g.fillCircle(0, 27, 3);
    g.lineStyle(1, p.outline, 1);
    g.strokeCircle(0, 27, 3);
  };

  private drawFoot = (g: Phaser.GameObjects.Graphics, p: FighterPalette): void => {
    g.fillStyle(p.shoes, 1);
    g.fillRoundedRect(-6, -7.5, 13, 7.5, 3.5);
    g.fillStyle(p.sole, 1);
    g.fillRect(-7, 0, 15, 2);
    g.fillStyle(p.shoesDark, 1);
    g.fillRoundedRect(2.5, -7.5, 6, 7.5, 3);
    g.lineStyle(1.1, p.shoesDark, 1);
    g.lineBetween(-0.5, -4.5, 6, -4.5);
    g.lineBetween(-0.5, -2.5, 6, -2.5);
    g.fillStyle(p.shoesDark, 1);
    g.fillRoundedRect(-5, -8, 11, 2.5, 1.5);
    g.lineStyle(1.2, p.outline, 1);
    g.strokeRoundedRect(-6, -7.5, 13, 7.5, 3.5);
  };

  // --------------------------------------------------------------------------
  // Poses
  // --------------------------------------------------------------------------

  private initCurPose(): void {
    const names = Object.keys(BASE_POS);
    names.forEach((name) => {
      const base = BASE_POS[name];
      const guard = GUARD_POSE[name] ?? {};
      this.curPose.set(name, {
        rotation: guard.rotation ?? 0,
        x: base.x,
        y: base.y,
        scaleX: guard.scaleX ?? 1,
        scaleY: guard.scaleY ?? 1,
      });
    });
    this.curPose.set('root', { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1 });
  }

  private applyBasePose(): void {
    this.applyRootPose({ rotation: 0, x: 0, y: 0 });
    Object.entries(GUARD_POSE).forEach(([name, pose]) => {
      if (this.overrides.has(name)) return;
      const c = this.parts.get(name);
      if (!c) return;
      c.rotation = pose.rotation ?? c.rotation;
      c.x = BASE_POS[name].x;
      c.y = BASE_POS[name].y;
      c.setScale(pose.scaleX ?? 1, pose.scaleY ?? 1);
      const cur = this.curPose.get(name)!;
      cur.rotation = c.rotation;
      cur.x = c.x;
      cur.y = c.y;
      cur.scaleX = c.scaleX;
      cur.scaleY = c.scaleY;
    });
  }

  private applyRootPose(pose: RigPose): void {
    this.bodyPivot.rotation = pose.rotation ?? 0;
    this.bodyPivot.x = pose.x ?? 0;
    this.bodyPivot.y = this.pivotBaseY + (pose.y ?? 0);
  }

  private samplePose(anim: RigAnimation, time: number): Record<string, RigPose> {
    const kfs = anim.keyframes;
    const out: Record<string, RigPose> = {};
    if (kfs.length === 0) return out;

    const t = Phaser.Math.Clamp(time, 0, anim.duration);
    let prev = kfs[0];
    let next = kfs[kfs.length - 1];
    for (let i = 0; i < kfs.length; i++) {
      if (kfs[i].time <= t) prev = kfs[i];
      if (kfs[i].time >= t) {
        next = kfs[i];
        break;
      }
    }
    const span = next.time - prev.time;
    const f = span > 0 ? (t - prev.time) / span : 0;

    const names = new Set<string>([
      ...Object.keys(prev.parts ?? {}),
      ...Object.keys(next.parts ?? {}),
    ]);
    names.forEach((name) => {
      const cur = this.curPose.get(name);
      const a = prev.parts?.[name] ?? cur ?? {};
      const b = next.parts?.[name] ?? a;
      out[name] = {
        rotation: Phaser.Math.Linear(a.rotation ?? cur?.rotation ?? 0, b.rotation ?? a.rotation ?? cur?.rotation ?? 0, f),
        x: Phaser.Math.Linear(a.x ?? cur?.x ?? BASE_POS[name]?.x ?? 0, b.x ?? a.x ?? cur?.x ?? BASE_POS[name]?.x ?? 0, f),
        y: Phaser.Math.Linear(a.y ?? cur?.y ?? BASE_POS[name]?.y ?? 0, b.y ?? a.y ?? cur?.y ?? BASE_POS[name]?.y ?? 0, f),
        scaleX: Phaser.Math.Linear(a.scaleX ?? cur?.scaleX ?? 1, b.scaleX ?? a.scaleX ?? cur?.scaleX ?? 1, f),
        scaleY: Phaser.Math.Linear(a.scaleY ?? cur?.scaleY ?? 1, b.scaleY ?? a.scaleY ?? cur?.scaleY ?? 1, f),
      };
    });

    const ra = prev.root ?? { rotation: 0, x: 0, y: 0 };
    const rb = next.root ?? ra;
    out['root'] = {
      rotation: Phaser.Math.Linear(ra.rotation ?? 0, rb.rotation ?? ra.rotation ?? 0, f),
      x: Phaser.Math.Linear(ra.x ?? 0, rb.x ?? ra.x ?? 0, f),
      y: Phaser.Math.Linear(ra.y ?? 0, rb.y ?? ra.y ?? 0, f),
    };
    return out;
  }

  private applySample(anim: RigAnimation, time: number): void {
    const pose = this.samplePose(anim, time);

    const root = pose['root'];
    if (root) {
      this.applyRootPose(root);
      const cur = this.curPose.get('root')!;
      cur.rotation = this.bodyPivot.rotation;
      cur.x = this.bodyPivot.x;
      cur.y = this.bodyPivot.y;
    }

    Object.entries(pose).forEach(([name, partPose]) => {
      if (name === 'root') return;
      if (this.overrides.has(name)) return;
      const c = this.parts.get(name);
      if (!c) return;
      c.rotation = partPose.rotation ?? c.rotation;
      c.x = partPose.x ?? c.x;
      c.y = partPose.y ?? c.y;
      c.setScale(partPose.scaleX ?? c.scaleX, partPose.scaleY ?? c.scaleY);
      const cur = this.curPose.get(name)!;
      cur.rotation = c.rotation;
      cur.x = c.x;
      cur.y = c.y;
      cur.scaleX = c.scaleX;
      cur.scaleY = c.scaleY;
    });
  }

  // --------------------------------------------------------------------------
  // Animação
  // --------------------------------------------------------------------------

  playAnimation(name: string, speed: number = 1): void {
    const anim = this.anims.get(name);
    if (!anim) return;

    if (this.oneShot) {
      this.pendingLoop = { anim, speed };
      return;
    }
    if (this.loopAnim && this.loopAnim.anim.name === name && this.loopAnim.speed === speed) {
      return;
    }
    this.heldPose = null;
    this.loopAnim = { anim, speed };
    this.loopTime = 0;
  }

  /**
   * Executa uma animação única (ex.: blockHit, perfectBlock, hitstun, ko).
   * Ao terminar, retoma o loop anterior (ou o pendingLoop definido durante a animação).
   */
  playOneShot(
    name: string,
    speed: number = 1,
    options: { hold?: boolean; onComplete?: () => void } = {}
  ): boolean {
    const anim = this.anims.get(name);
    if (!anim) return false;

    if (this.oneShot && this.oneShot.anim.name === name) return false;
    const now = this.scene.time.now;
    if (this.recentOneShot && this.recentOneShot.name === name && now - this.recentOneShot.finishedAt < 200) {
      return false;
    }

    this.heldPose = null;
    this.oneShot = {
      anim,
      speed,
      time: 0,
      onComplete: () => {
        options.onComplete?.();
        if (options.hold) {
          this.heldPose = { anim, time: anim.duration };
        }
      },
    };
    return true;
  }

  stopAnimation(): void {
    this.loopAnim = null;
    this.oneShot = null;
    this.heldPose = null;
    this.pendingLoop = null;
    this.applyBasePose();
  }

  update(dt: number): void {
    const now = this.scene.time.now;

    if (this.oneShot) {
      const o = this.oneShot;
      o.time += dt * o.speed;
      if (o.time >= o.anim.duration) {
        this.recentOneShot = { name: o.anim.name, finishedAt: now };
        const cb = o.onComplete;
        this.oneShot = null;
        if (this.pendingLoop) {
          this.loopAnim = this.pendingLoop;
          this.loopTime = 0;
          this.pendingLoop = null;
        }
        cb?.();
        if (this.heldPose) {
          this.applySample(this.heldPose.anim, this.heldPose.time);
        } else if (this.loopAnim) {
          this.applySample(this.loopAnim.anim, this.loopTime);
        } else {
          this.applyBasePose();
        }
      } else {
        this.applySample(o.anim, o.time);
      }
      this.updateFlash(dt);
      return;
    }

    if (this.heldPose) {
      this.applySample(this.heldPose.anim, this.heldPose.time);
      this.updateFlash(dt);
      return;
    }

    if (this.loopAnim) {
      const la = this.loopAnim;
      this.loopTime += dt * la.speed;
      if (la.anim.loop) {
        this.loopTime %= la.anim.duration;
      } else if (this.loopTime >= la.anim.duration) {
        this.loopTime = la.anim.duration;
        this.loopAnim = null;
      }
      this.applySample(la.anim, this.loopTime);
    } else {
      this.applyBasePose();
    }

    this.updateFlash(dt);
  }

  private updateFlash(dt: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const alpha = Math.max(0, (this.flashTimer / this.flashDuration)) * 0.55;
      this.flashOverlay.clear();
      this.flashOverlay.setVisible(true);
      this.flashOverlay.fillStyle(this.flashColor, alpha);
      this.flashOverlay.fillRoundedRect(-62, -118, 124, 122, 10);
      if (this.flashTimer <= 0) {
        this.flashOverlay.clear();
        this.flashOverlay.setVisible(false);
      }
    }
  }

  setFlash(color: number, duration: number): void {
    this.flashTimer = duration;
    this.flashDuration = duration;
    this.flashColor = color;
  }

  setFacing(facing: number): void {
    this.facing = facing;
    this.setScale(facing * this.bodyScale, this.bodyScale);
  }

  /**
   * Gira o personagem até a nova direção (animação de giro, não instantânea).
   */
  turnToFacing(facing: number, duration: number = 0.12): void {
    if (facing === this.facing && !this.turning) return;
    this.scene.tweens.killTweensOf(this);
    this.turning = true;
    this.scene.tweens.add({
      targets: this,
      scaleX: facing * this.bodyScale,
      duration: duration * 1000,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.facing = facing;
        this.turning = false;
      },
    });
  }

  isTurning(): boolean {
    return this.turning;
  }

  // --------------------------------------------------------------------------
  // Controle esquelético individual (ligação: mover só uma parte, etc.)
  // --------------------------------------------------------------------------

  getPart(name: string): RigPartHandle {
    return new RigPartHandle(this, name);
  }

  getPartContainer(name: string): Phaser.GameObjects.Container {
    const c = this.parts.get(name);
    if (!c) throw new Error(`Parte desconhecida: ${name}`);
    return c;
  }

  setPartPose(name: string, pose: RigPose): void {
    if (name === 'root') {
      this.applyRootPose(pose);
      return;
    }
    const c = this.parts.get(name);
    if (!c) return;
    if (pose.rotation !== undefined) c.rotation = pose.rotation;
    if (pose.x !== undefined) c.x = pose.x;
    if (pose.y !== undefined) c.y = pose.y;
    if (pose.scaleX !== undefined || pose.scaleY !== undefined) {
      c.setScale(pose.scaleX ?? c.scaleX, pose.scaleY ?? c.scaleY);
    }
    this.overrides.add(name);
  }

  setPartColor(name: string, color: number): void {
    const key = this.partColorKey.get(name);
    if (!key) return;
    this.palette[key] = color;
    const gfx = this.partGfx.get(name);
    const draw = this.partDraws.get(name);
    if (gfx && draw) {
      gfx.clear();
      draw(gfx, this.palette);
    }
  }

  tweenPart(
    name: string,
    props: { rotation?: number; x?: number; y?: number; scaleX?: number; scaleY?: number },
    duration: number = 0.2,
    ease: string = 'Quad.easeOut',
    onComplete?: () => void
  ): void {
    const c = this.parts.get(name);
    if (!c) return;
    this.overrides.add(name);
    this.scene.tweens.add({
      targets: c,
      rotation: props.rotation,
      x: props.x,
      y: props.y,
      scaleX: props.scaleX,
      scaleY: props.scaleY,
      duration: Math.max(1, duration * 1000),
      ease,
      onComplete,
    });
  }

  releasePart(name: string): void {
    this.overrides.delete(name);
  }

  releaseAllParts(): void {
    this.overrides.clear();
  }

  // --------------------------------------------------------------------------
  // Definição das animações (keyframes em segundos, movimento sequencial)
  // --------------------------------------------------------------------------

  private kf(time: number, parts: Record<string, RigPose>, root?: RigPose): RigKeyframe {
    if (root) {
      return { time, parts, root };
    }
    const r = parts.root;
    if (r) {
      const rest: Record<string, RigPose> = { ...parts };
      delete rest.root;
      return { time, parts: rest, root: r };
    }
    return { time, parts };
  }

  private createAnimations(): void {
    this.anims.set('idle', {
      name: 'idle',
      loop: true,
      duration: 1.6,
      keyframes: [
        this.kf(0, { ...GUARD_POSE }),
        this.kf(0.8, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.05, y: -4 },
          UpperTorso: { rotation: -0.045 },
          Head: { rotation: 0.05 },
          RightUpperArm: { rotation: 0.52 },
          RightLowerArm: { rotation: 1.08 },
          RightHand: { rotation: 0.52 },
          LeftUpperArm: { rotation: 0.47 },
          LeftLowerArm: { rotation: 1.02 },
          LeftHand: { rotation: 0.47 },
          LeftUpperLeg: { rotation: -0.07 },
          LeftLowerLeg: { rotation: 0.12 },
          RightUpperLeg: { rotation: 0.07 },
          RightLowerLeg: { rotation: -0.12 },
        }),
        this.kf(1.6, { ...GUARD_POSE }),
      ],
    });

    this.anims.set('walk', {
      name: 'walk',
      loop: true,
      duration: 0.85,
      keyframes: [
        this.kf(0, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.06, y: -2 },
          UpperTorso: { rotation: -0.06 },
          Head: { rotation: 0.03 },
          RightUpperLeg: { rotation: 0.55 },
          RightLowerLeg: { rotation: -0.5 },
          RightFoot: { rotation: -0.12 },
          LeftUpperLeg: { rotation: -0.45 },
          LeftLowerLeg: { rotation: 0.35 },
          LeftUpperArm: { rotation: 0.3 },
          LeftLowerArm: { rotation: 0.25 },
          LeftHand: { rotation: 0.1 },
          RightUpperArm: { rotation: -0.25 },
          RightLowerArm: { rotation: 0.15 },
          RightHand: { rotation: -0.05 },
        }),
        this.kf(0.425, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0, y: -1 },
          UpperTorso: { rotation: 0 },
          RightUpperLeg: { rotation: 0.1 },
          RightLowerLeg: { rotation: 0.05 },
          LeftUpperLeg: { rotation: -0.1 },
          LeftLowerLeg: { rotation: -0.05 },
          LeftUpperArm: { rotation: 0.45 },
          LeftLowerArm: { rotation: 0.6 },
          RightUpperArm: { rotation: 0.15 },
          RightLowerArm: { rotation: 0.6 },
        }),
        this.kf(0.85, {
          ...GUARD_POSE,
          LowerTorso: { rotation: -0.06, y: -2 },
          UpperTorso: { rotation: 0.06 },
          Head: { rotation: -0.03 },
          LeftUpperLeg: { rotation: 0.5 },
          LeftLowerLeg: { rotation: -0.45 },
          LeftFoot: { rotation: -0.1 },
          RightUpperLeg: { rotation: -0.4 },
          RightLowerLeg: { rotation: 0.3 },
          RightUpperArm: { rotation: 0.32 },
          RightLowerArm: { rotation: 0.3 },
          RightHand: { rotation: 0.12 },
          LeftUpperArm: { rotation: -0.2 },
          LeftLowerArm: { rotation: 0.12 },
          LeftHand: { rotation: -0.05 },
        }),
      ],
    });

    this.anims.set('jump', {
      name: 'jump',
      loop: true,
      duration: 0.7,
      keyframes: [
        this.kf(0, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.05, y: -4 },
          UpperTorso: { rotation: -0.05 },
          Head: { rotation: -0.02 },
          RightUpperLeg: { rotation: 0.5 },
          RightLowerLeg: { rotation: 0.7 },
          RightFoot: { rotation: -0.4 },
          LeftUpperLeg: { rotation: 0.45 },
          LeftLowerLeg: { rotation: 0.65 },
          LeftFoot: { rotation: -0.35 },
          RightUpperArm: { rotation: 0.95 },
          RightLowerArm: { rotation: 0.9 },
          RightHand: { rotation: 0.5 },
          LeftUpperArm: { rotation: 0.9 },
          LeftLowerArm: { rotation: 0.85 },
          LeftHand: { rotation: 0.45 },
        }),
        this.kf(0.35, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.02, y: -5 },
          RightUpperLeg: { rotation: 0.55 },
          RightLowerLeg: { rotation: 0.75 },
          RightFoot: { rotation: -0.35 },
          LeftUpperLeg: { rotation: 0.4 },
          LeftLowerLeg: { rotation: 0.6 },
          LeftFoot: { rotation: -0.3 },
          RightUpperArm: { rotation: 0.9 },
          RightLowerArm: { rotation: 0.85 },
          LeftUpperArm: { rotation: 0.95 },
          LeftLowerArm: { rotation: 0.9 },
        }),
        this.kf(0.7, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.05, y: -4 },
          RightUpperLeg: { rotation: 0.5 },
          RightLowerLeg: { rotation: 0.7 },
          RightFoot: { rotation: -0.4 },
          LeftUpperLeg: { rotation: 0.45 },
          LeftLowerLeg: { rotation: 0.65 },
          LeftFoot: { rotation: -0.35 },
          RightUpperArm: { rotation: 0.95 },
          RightLowerArm: { rotation: 0.9 },
          LeftUpperArm: { rotation: 0.9 },
          LeftLowerArm: { rotation: 0.85 },
        }),
      ],
    });

    this.anims.set('crouch', {
      name: 'crouch',
      loop: true,
      duration: 1.2,
      keyframes: [
        this.kf(0, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.1, y: -6 },
          UpperTorso: { rotation: 0.16 },
          Head: { rotation: 0.06 },
          RightUpperLeg: { rotation: 0.85 },
          RightLowerLeg: { rotation: 0.95 },
          RightFoot: { rotation: 0.08 },
          LeftUpperLeg: { rotation: 0.8 },
          LeftLowerLeg: { rotation: 0.9 },
          LeftFoot: { rotation: 0.06 },
          RightUpperArm: { rotation: 0.6 },
          RightLowerArm: { rotation: 1.2 },
          RightHand: { rotation: 0.6 },
          LeftUpperArm: { rotation: 0.55 },
          LeftLowerArm: { rotation: 1.15 },
          LeftHand: { rotation: 0.55 },
        }),
        this.kf(0.6, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.08, y: -5 },
          UpperTorso: { rotation: 0.14 },
          RightUpperLeg: { rotation: 0.82 },
          RightLowerLeg: { rotation: 0.92 },
          LeftUpperLeg: { rotation: 0.77 },
          LeftLowerLeg: { rotation: 0.87 },
        }),
        this.kf(1.2, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.1, y: -6 },
          UpperTorso: { rotation: 0.16 },
          Head: { rotation: 0.06 },
          RightUpperLeg: { rotation: 0.85 },
          RightLowerLeg: { rotation: 0.95 },
          RightFoot: { rotation: 0.08 },
          LeftUpperLeg: { rotation: 0.8 },
          LeftLowerLeg: { rotation: 0.9 },
          LeftFoot: { rotation: 0.06 },
          RightUpperArm: { rotation: 0.6 },
          RightLowerArm: { rotation: 1.2 },
          RightHand: { rotation: 0.6 },
          LeftUpperArm: { rotation: 0.55 },
          LeftLowerArm: { rotation: 1.15 },
          LeftHand: { rotation: 0.55 },
        }),
      ],
    });

    this.anims.set('punchRight', {
      name: 'punchRight',
      loop: false,
      duration: 0.6,
      keyframes: [
        this.kf(0, { ...GUARD_POSE }),
        // preparo: puxa o braço pra trás e gira o tronco
        this.kf(0.1, {
          ...GUARD_POSE,
          root: { x: 2, y: -1 },
          LowerTorso: { rotation: 0.08, y: -2 },
          UpperTorso: { rotation: -0.1 },
          Head: { rotation: -0.05 },
          RightUpperArm: { rotation: -0.75 },
          RightLowerArm: { rotation: -0.5 },
          RightHand: { rotation: -0.3 },
          LeftUpperArm: { rotation: 0.35 },
          LeftLowerArm: { rotation: 0.8 },
          LeftHand: { rotation: 0.4 },
          RightUpperLeg: { rotation: 0.08 },
          RightLowerLeg: { rotation: -0.1 },
          LeftUpperLeg: { rotation: -0.02 },
          LeftLowerLeg: { rotation: 0.05 },
        }),
        // coice máximo
        this.kf(0.2, {
          ...GUARD_POSE,
          root: { x: 3, y: -2 },
          LowerTorso: { rotation: 0.1, y: -2 },
          UpperTorso: { rotation: -0.14 },
          Head: { rotation: -0.06 },
          RightUpperArm: { rotation: -0.95 },
          RightLowerArm: { rotation: -0.62 },
          RightHand: { rotation: -0.4 },
          LeftUpperArm: { rotation: 0.38 },
          LeftLowerArm: { rotation: 0.85 },
        }),
        // impacto: braço estende em sequência (ombro -> cotovelo -> punho)
        this.kf(0.28, {
          ...GUARD_POSE,
          root: { x: 8 },
          LowerTorso: { rotation: -0.02, y: -2 },
          UpperTorso: { rotation: 0.05 },
          Head: { rotation: 0.02 },
          RightUpperArm: { rotation: 1.62 },
          RightLowerArm: { rotation: 0.3 },
          RightHand: { rotation: 0.35 },
          LeftUpperArm: { rotation: 0.4 },
          LeftLowerArm: { rotation: 0.9 },
          LeftHand: { rotation: 0.45 },
          RightUpperLeg: { rotation: 0.1 },
          RightLowerLeg: { rotation: -0.12 },
          LeftUpperLeg: { rotation: -0.12 },
          LeftLowerLeg: { rotation: 0.14 },
        }),
        // overshoot breve
        this.kf(0.34, {
          ...GUARD_POSE,
          root: { x: 7 },
          RightUpperArm: { rotation: 1.58 },
          RightLowerArm: { rotation: 0.26 },
          RightHand: { rotation: 0.3 },
          LowerTorso: { rotation: 0.01 },
        }),
        // recuperação
        this.kf(0.48, {
          ...GUARD_POSE,
          root: { x: 4 },
          LowerTorso: { rotation: 0.05, y: -2 },
          UpperTorso: { rotation: -0.03 },
          Head: { rotation: 0.02 },
          RightUpperArm: { rotation: 0.1 },
          RightLowerArm: { rotation: 0.5 },
          RightHand: { rotation: 0.25 },
        }),
        this.kf(0.6, { ...GUARD_POSE }),
      ].map(mirrorKf),
    });

    this.anims.set('punchLeft', {
      name: 'punchLeft',
      loop: false,
      duration: 0.65,
      keyframes: [
        this.kf(0, { ...GUARD_POSE }),
        this.kf(0.11, {
          ...GUARD_POSE,
          root: { x: 2, y: -1 },
          LowerTorso: { rotation: -0.08, y: -2 },
          UpperTorso: { rotation: 0.1 },
          Head: { rotation: 0.05 },
          LeftUpperArm: { rotation: -0.85 },
          LeftLowerArm: { rotation: -0.55 },
          LeftHand: { rotation: -0.35 },
          RightUpperArm: { rotation: 0.3 },
          RightLowerArm: { rotation: 0.75 },
          RightHand: { rotation: 0.4 },
          RightUpperLeg: { rotation: 0.08 },
          RightLowerLeg: { rotation: -0.1 },
          LeftUpperLeg: { rotation: -0.02 },
          LeftLowerLeg: { rotation: 0.05 },
        }),
        this.kf(0.22, {
          ...GUARD_POSE,
          root: { x: 3, y: -2 },
          LowerTorso: { rotation: -0.1, y: -2 },
          UpperTorso: { rotation: 0.14 },
          Head: { rotation: 0.06 },
          LeftUpperArm: { rotation: -1.05 },
          LeftLowerArm: { rotation: -0.7 },
          LeftHand: { rotation: -0.45 },
          RightUpperArm: { rotation: 0.33 },
          RightLowerArm: { rotation: 0.8 },
        }),
        this.kf(0.3, {
          ...GUARD_POSE,
          root: { x: 8 },
          LowerTorso: { rotation: 0.02, y: -2 },
          UpperTorso: { rotation: -0.05 },
          Head: { rotation: -0.02 },
          LeftUpperArm: { rotation: 1.7 },
          LeftLowerArm: { rotation: 0.32 },
          LeftHand: { rotation: 0.35 },
          RightUpperArm: { rotation: 0.4 },
          RightLowerArm: { rotation: 0.92 },
          RightHand: { rotation: 0.45 },
          RightUpperLeg: { rotation: 0.1 },
          RightLowerLeg: { rotation: -0.12 },
          LeftUpperLeg: { rotation: -0.12 },
          LeftLowerLeg: { rotation: 0.14 },
        }),
        this.kf(0.36, {
          ...GUARD_POSE,
          root: { x: 7 },
          LeftUpperArm: { rotation: 1.66 },
          LeftLowerArm: { rotation: 0.28 },
          LeftHand: { rotation: 0.3 },
        }),
        this.kf(0.52, {
          ...GUARD_POSE,
          root: { x: 4 },
          LowerTorso: { rotation: -0.05, y: -2 },
          UpperTorso: { rotation: 0.03 },
          LeftUpperArm: { rotation: 0.15 },
          LeftLowerArm: { rotation: 0.55 },
          LeftHand: { rotation: 0.25 },
        }),
        this.kf(0.65, { ...GUARD_POSE }),
      ].map(mirrorKf),
    });

    this.anims.set('kickRight', {
      name: 'kickRight',
      loop: false,
      duration: 0.7,
      keyframes: [
        this.kf(0, { ...GUARD_POSE }),
        // preparo: joelho sobe, peso vai pra trás
        this.kf(0.12, {
          ...GUARD_POSE,
          root: { x: -2, y: -2 },
          LowerTorso: { rotation: 0.08, y: -2 },
          UpperTorso: { rotation: 0.12 },
          Head: { rotation: 0.04 },
          RightUpperLeg: { rotation: 1.25 },
          RightLowerLeg: { rotation: 0.65 },
          RightFoot: { rotation: -0.5 },
          LeftUpperLeg: { rotation: -0.15 },
          LeftLowerLeg: { rotation: 0.2 },
          LeftFoot: { rotation: 0.05 },
          RightUpperArm: { rotation: -0.35 },
          RightLowerArm: { rotation: 0.3 },
          RightHand: { rotation: 0.15 },
          LeftUpperArm: { rotation: -0.4 },
          LeftLowerArm: { rotation: 0.35 },
          LeftHand: { rotation: 0.2 },
        }),
        // extensão: coxa -> canela -> pé (chicotada)
        this.kf(0.24, {
          ...GUARD_POSE,
          root: { x: 6, y: -3 },
          LowerTorso: { rotation: 0.06, y: -2 },
          UpperTorso: { rotation: 0.18 },
          Head: { rotation: 0.06 },
          RightUpperLeg: { rotation: 1.95 },
          RightLowerLeg: { rotation: -0.45 },
          RightFoot: { rotation: -0.15 },
          LeftUpperLeg: { rotation: -0.2 },
          LeftLowerLeg: { rotation: 0.25 },
          LeftFoot: { rotation: 0.06 },
          RightUpperArm: { rotation: -0.6 },
          RightLowerArm: { rotation: 0.45 },
          RightHand: { rotation: 0.25 },
          LeftUpperArm: { rotation: -0.7 },
          LeftLowerArm: { rotation: 0.5 },
          LeftHand: { rotation: 0.3 },
        }),
        this.kf(0.32, {
          ...GUARD_POSE,
          root: { x: 5, y: -2 },
          RightUpperLeg: { rotation: 1.85 },
          RightLowerLeg: { rotation: -0.4 },
          RightFoot: { rotation: -0.1 },
          UpperTorso: { rotation: 0.16 },
        }),
        // recuperação
        this.kf(0.52, {
          ...GUARD_POSE,
          root: { x: 2, y: -1 },
          LowerTorso: { rotation: 0.04 },
          UpperTorso: { rotation: 0.05 },
          RightUpperLeg: { rotation: 0.4 },
          RightLowerLeg: { rotation: 0.3 },
          RightFoot: { rotation: -0.05 },
          RightUpperArm: { rotation: -0.1 },
          RightLowerArm: { rotation: 0.6 },
        }),
        this.kf(0.7, { ...GUARD_POSE }),
      ].map(mirrorKf),
    });

    this.anims.set('kickLeft', {
      name: 'kickLeft',
      loop: false,
      duration: 0.75,
      keyframes: [
        this.kf(0, { ...GUARD_POSE }),
        this.kf(0.13, {
          ...GUARD_POSE,
          root: { x: -2, y: -2 },
          LowerTorso: { rotation: -0.08, y: -2 },
          UpperTorso: { rotation: -0.12 },
          Head: { rotation: -0.04 },
          LeftUpperLeg: { rotation: 1.35 },
          LeftLowerLeg: { rotation: 0.7 },
          LeftFoot: { rotation: -0.55 },
          RightUpperLeg: { rotation: -0.15 },
          RightLowerLeg: { rotation: 0.2 },
          RightFoot: { rotation: 0.05 },
          RightUpperArm: { rotation: -0.35 },
          RightLowerArm: { rotation: 0.3 },
          RightHand: { rotation: 0.15 },
          LeftUpperArm: { rotation: -0.4 },
          LeftLowerArm: { rotation: 0.35 },
          LeftHand: { rotation: 0.2 },
        }),
        this.kf(0.26, {
          ...GUARD_POSE,
          root: { x: 6, y: -3 },
          LowerTorso: { rotation: -0.06, y: -2 },
          UpperTorso: { rotation: -0.18 },
          Head: { rotation: -0.06 },
          LeftUpperLeg: { rotation: 2.05 },
          LeftLowerLeg: { rotation: -0.5 },
          LeftFoot: { rotation: -0.18 },
          RightUpperLeg: { rotation: -0.2 },
          RightLowerLeg: { rotation: 0.25 },
          RightFoot: { rotation: 0.06 },
          RightUpperArm: { rotation: -0.6 },
          RightLowerArm: { rotation: 0.45 },
          RightHand: { rotation: 0.25 },
          LeftUpperArm: { rotation: -0.7 },
          LeftLowerArm: { rotation: 0.5 },
          LeftHand: { rotation: 0.3 },
        }),
        this.kf(0.34, {
          ...GUARD_POSE,
          root: { x: 5, y: -2 },
          LeftUpperLeg: { rotation: 1.95 },
          LeftLowerLeg: { rotation: -0.45 },
          LeftFoot: { rotation: -0.12 },
          UpperTorso: { rotation: -0.16 },
        }),
        this.kf(0.55, {
          ...GUARD_POSE,
          root: { x: 2, y: -1 },
          LowerTorso: { rotation: -0.04 },
          UpperTorso: { rotation: -0.05 },
          LeftUpperLeg: { rotation: 0.45 },
          LeftLowerLeg: { rotation: 0.32 },
          LeftFoot: { rotation: -0.05 },
          LeftUpperArm: { rotation: -0.1 },
          LeftLowerArm: { rotation: 0.6 },
        }),
        this.kf(0.75, { ...GUARD_POSE }),
      ].map(mirrorKf),
    });

    // Voadora: corpo "deitado" no ar, perna esticada para frente, braços para trás
    this.anims.set('flyingKick', {
      name: 'flyingKick',
      loop: true,
      duration: 0.44,
      keyframes: [
        this.kf(0, {
          ...GUARD_POSE,
          root: { rotation: -0.2, x: 4, y: -6 },
          LowerTorso: { rotation: 0.1, y: -2 },
          UpperTorso: { rotation: 0.15 },
          Head: { rotation: -0.28 },
          RightUpperLeg: { rotation: -1.3 },
          RightLowerLeg: { rotation: -0.1 },
          RightFoot: { rotation: -0.08 },
          LeftUpperLeg: { rotation: 0.75 },
          LeftLowerLeg: { rotation: -0.4 },
          LeftFoot: { rotation: 0.12 },
          RightUpperArm: { rotation: 0.7 },
          RightLowerArm: { rotation: 0.45 },
          RightHand: { rotation: 0.2 },
          LeftUpperArm: { rotation: 0.6 },
          LeftLowerArm: { rotation: 0.4 },
          LeftHand: { rotation: 0.15 },
        }),
        this.kf(0.12, {
          ...GUARD_POSE,
          root: { rotation: -0.45, x: 10, y: -10 },
          LowerTorso: { rotation: 0.08, y: -2 },
          UpperTorso: { rotation: 0.12 },
          Head: { rotation: -0.32 },
          RightUpperLeg: { rotation: -1.45 },
          RightLowerLeg: { rotation: -0.15 },
          RightFoot: { rotation: -0.1 },
          LeftUpperLeg: { rotation: 0.85 },
          LeftLowerLeg: { rotation: -0.45 },
          LeftFoot: { rotation: 0.15 },
          RightUpperArm: { rotation: 0.75 },
          RightLowerArm: { rotation: 0.5 },
          RightHand: { rotation: 0.25 },
          LeftUpperArm: { rotation: 0.65 },
          LeftLowerArm: { rotation: 0.45 },
          LeftHand: { rotation: 0.2 },
        }),
        this.kf(0.28, {
          ...GUARD_POSE,
          root: { rotation: -0.5, x: 14, y: -8 },
          LowerTorso: { rotation: 0.1, y: -2 },
          UpperTorso: { rotation: 0.14 },
          Head: { rotation: -0.3 },
          RightUpperLeg: { rotation: -1.4 },
          RightLowerLeg: { rotation: -0.12 },
          RightFoot: { rotation: -0.08 },
          LeftUpperLeg: { rotation: 0.8 },
          LeftLowerLeg: { rotation: -0.42 },
          LeftFoot: { rotation: 0.13 },
          RightUpperArm: { rotation: 0.72 },
          RightLowerArm: { rotation: 0.48 },
          RightHand: { rotation: 0.22 },
          LeftUpperArm: { rotation: 0.62 },
          LeftLowerArm: { rotation: 0.42 },
          LeftHand: { rotation: 0.18 },
        }),
        this.kf(0.44, {
          ...GUARD_POSE,
          root: { rotation: -0.2, x: 4, y: -6 },
          LowerTorso: { rotation: 0.1, y: -2 },
          UpperTorso: { rotation: 0.15 },
          Head: { rotation: -0.28 },
          RightUpperLeg: { rotation: -1.3 },
          RightLowerLeg: { rotation: -0.1 },
          RightFoot: { rotation: -0.08 },
          LeftUpperLeg: { rotation: 0.75 },
          LeftLowerLeg: { rotation: -0.4 },
          LeftFoot: { rotation: 0.12 },
          RightUpperArm: { rotation: 0.7 },
          RightLowerArm: { rotation: 0.45 },
          RightHand: { rotation: 0.2 },
          LeftUpperArm: { rotation: 0.6 },
          LeftLowerArm: { rotation: 0.4 },
          LeftHand: { rotation: 0.15 },
        }),
      ],
    });

    // Mortal: giro completo no ar, pernas estendidas (acerta a cabeça)
    this.anims.set('mortal', {
      name: 'mortal',
      loop: true,
      duration: 0.55,
      keyframes: [
        this.kf(0, {
          ...GUARD_POSE,
          root: { rotation: 0, x: 6, y: -12 },
          UpperTorso: { rotation: 0.2 },
          Head: { rotation: -0.15 },
          RightUpperLeg: { rotation: -1.4 },
          RightLowerLeg: { rotation: -0.1 },
          RightFoot: { rotation: -0.05 },
          LeftUpperLeg: { rotation: 0.7 },
          LeftLowerLeg: { rotation: -0.35 },
          LeftFoot: { rotation: 0.1 },
          RightUpperArm: { rotation: 0.8 },
          RightLowerArm: { rotation: 0.7 },
          RightHand: { rotation: 0.3 },
          LeftUpperArm: { rotation: 0.6 },
          LeftLowerArm: { rotation: 0.9 },
          LeftHand: { rotation: 0.35 },
        }),
        this.kf(0.13, {
          ...GUARD_POSE,
          root: { rotation: 1.57, x: 14, y: -14 },
          Head: { rotation: -0.1 },
          RightUpperLeg: { rotation: -1.55 },
          RightLowerLeg: { rotation: -0.15 },
          RightFoot: { rotation: -0.08 },
          LeftUpperLeg: { rotation: -1.55 },
          LeftLowerLeg: { rotation: -0.1 },
          LeftFoot: { rotation: -0.05 },
          RightUpperArm: { rotation: 0.9 },
          RightLowerArm: { rotation: 0.5 },
          RightHand: { rotation: 0.2 },
          LeftUpperArm: { rotation: 0.9 },
          LeftLowerArm: { rotation: 0.5 },
          LeftHand: { rotation: 0.2 },
        }),
        this.kf(0.26, {
          ...GUARD_POSE,
          root: { rotation: 3.14, x: 10, y: -18 },
          Head: { rotation: -0.1 },
          RightUpperLeg: { rotation: -1.5 },
          RightLowerLeg: { rotation: -0.12 },
          RightFoot: { rotation: -0.06 },
          LeftUpperLeg: { rotation: -1.5 },
          LeftLowerLeg: { rotation: -0.12 },
          LeftFoot: { rotation: -0.06 },
          RightUpperArm: { rotation: 0.85 },
          RightLowerArm: { rotation: 0.55 },
          RightHand: { rotation: 0.25 },
          LeftUpperArm: { rotation: 0.85 },
          LeftLowerArm: { rotation: 0.55 },
          LeftHand: { rotation: 0.25 },
        }),
        this.kf(0.39, {
          ...GUARD_POSE,
          root: { rotation: 4.71, x: 14, y: -14 },
          Head: { rotation: -0.1 },
          RightUpperLeg: { rotation: -1.55 },
          RightLowerLeg: { rotation: -0.15 },
          RightFoot: { rotation: -0.08 },
          LeftUpperLeg: { rotation: -1.55 },
          LeftLowerLeg: { rotation: -0.1 },
          LeftFoot: { rotation: -0.05 },
          RightUpperArm: { rotation: 0.9 },
          RightLowerArm: { rotation: 0.5 },
          RightHand: { rotation: 0.2 },
          LeftUpperArm: { rotation: 0.9 },
          LeftLowerArm: { rotation: 0.5 },
          LeftHand: { rotation: 0.2 },
        }),
        this.kf(0.55, {
          ...GUARD_POSE,
          root: { rotation: 6.28, x: 6, y: -12 },
          UpperTorso: { rotation: 0.2 },
          Head: { rotation: -0.15 },
          RightUpperLeg: { rotation: -1.4 },
          RightLowerLeg: { rotation: -0.1 },
          RightFoot: { rotation: -0.05 },
          LeftUpperLeg: { rotation: 0.7 },
          LeftLowerLeg: { rotation: -0.35 },
          LeftFoot: { rotation: 0.1 },
          RightUpperArm: { rotation: 0.8 },
          RightLowerArm: { rotation: 0.7 },
          RightHand: { rotation: 0.3 },
          LeftUpperArm: { rotation: 0.6 },
          LeftLowerArm: { rotation: 0.9 },
          LeftHand: { rotation: 0.35 },
        }),
      ].map(mirrorKf),
    });

    this.anims.set('block', {
      name: 'block',
      loop: true,
      duration: 1.1,
      keyframes: [
        this.kf(0, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.05, y: -2 },
          UpperTorso: { rotation: -0.06 },
          Head: { rotation: 0.04 },
          RightUpperArm: { rotation: 0.62 },
          RightLowerArm: { rotation: 1.18 },
          RightHand: { rotation: 0.6 },
          LeftUpperArm: { rotation: 0.58 },
          LeftLowerArm: { rotation: 1.14 },
          LeftHand: { rotation: 0.58 },
          RightUpperLeg: { rotation: 0.16 },
          RightLowerLeg: { rotation: -0.2 },
          LeftUpperLeg: { rotation: 0.14 },
          LeftLowerLeg: { rotation: -0.16 },
        }),
        this.kf(0.55, {
          ...GUARD_POSE,
          root: { x: 1 },
          LowerTorso: { rotation: 0.04, y: -2 },
          UpperTorso: { rotation: -0.05 },
          RightUpperArm: { rotation: 0.66 },
          RightLowerArm: { rotation: 1.22 },
          RightHand: { rotation: 0.63 },
          LeftUpperArm: { rotation: 0.61 },
          LeftLowerArm: { rotation: 1.18 },
          LeftHand: { rotation: 0.6 },
        }),
        this.kf(1.1, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.05, y: -2 },
          UpperTorso: { rotation: -0.06 },
          Head: { rotation: 0.04 },
          RightUpperArm: { rotation: 0.62 },
          RightLowerArm: { rotation: 1.18 },
          RightHand: { rotation: 0.6 },
          LeftUpperArm: { rotation: 0.58 },
          LeftLowerArm: { rotation: 1.14 },
          LeftHand: { rotation: 0.58 },
          RightUpperLeg: { rotation: 0.16 },
          RightLowerLeg: { rotation: -0.2 },
          LeftUpperLeg: { rotation: 0.14 },
          LeftLowerLeg: { rotation: -0.16 },
        }),
      ],
    });

    this.anims.set('blockHit', {
      name: 'blockHit',
      loop: false,
      duration: 0.4,
      keyframes: [
        this.kf(0, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.05, y: -2 },
          UpperTorso: { rotation: -0.06 },
          Head: { rotation: 0.04 },
          RightUpperArm: { rotation: 0.62 },
          RightLowerArm: { rotation: 1.18 },
          RightHand: { rotation: 0.6 },
          LeftUpperArm: { rotation: 0.58 },
          LeftLowerArm: { rotation: 1.14 },
          LeftHand: { rotation: 0.58 },
          RightUpperLeg: { rotation: 0.16 },
          RightLowerLeg: { rotation: -0.2 },
          LeftUpperLeg: { rotation: 0.14 },
          LeftLowerLeg: { rotation: -0.16 },
        }),
        // impacto: cabeça vai pra trás, braços são empurrados, joelhos absorvem
        this.kf(0.08, {
          ...GUARD_POSE,
          root: { x: -6 },
          LowerTorso: { rotation: 0.1, y: -2 },
          UpperTorso: { rotation: 0.1 },
          Head: { rotation: -0.16 },
          RightUpperArm: { rotation: -0.15 },
          RightLowerArm: { rotation: 0.55 },
          RightHand: { rotation: 0.25 },
          LeftUpperArm: { rotation: -0.18 },
          LeftLowerArm: { rotation: 0.5 },
          LeftHand: { rotation: 0.2 },
          RightUpperLeg: { rotation: 0.2 },
          RightLowerLeg: { rotation: -0.26 },
          LeftUpperLeg: { rotation: 0.18 },
          LeftLowerLeg: { rotation: -0.22 },
        }),
        this.kf(0.14, {
          ...GUARD_POSE,
          root: { x: -8 },
          UpperTorso: { rotation: 0.12 },
          Head: { rotation: -0.2 },
          RightUpperArm: { rotation: -0.3 },
          RightLowerArm: { rotation: 0.3 },
          RightHand: { rotation: 0.1 },
          LeftUpperArm: { rotation: -0.33 },
          LeftLowerArm: { rotation: 0.25 },
          LeftHand: { rotation: 0.05 },
        }),
        // volta pra guarda
        this.kf(0.26, {
          ...GUARD_POSE,
          root: { x: -2 },
          LowerTorso: { rotation: 0.05 },
          UpperTorso: { rotation: -0.04 },
          Head: { rotation: -0.04 },
          RightUpperArm: { rotation: 0.5 },
          RightLowerArm: { rotation: 1.0 },
          RightHand: { rotation: 0.5 },
          LeftUpperArm: { rotation: 0.45 },
          LeftLowerArm: { rotation: 0.95 },
          LeftHand: { rotation: 0.45 },
        }),
        this.kf(0.4, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.05, y: -2 },
          UpperTorso: { rotation: -0.06 },
          Head: { rotation: 0.04 },
          RightUpperArm: { rotation: 0.62 },
          RightLowerArm: { rotation: 1.18 },
          RightHand: { rotation: 0.6 },
          LeftUpperArm: { rotation: 0.58 },
          LeftLowerArm: { rotation: 1.14 },
          LeftHand: { rotation: 0.58 },
          RightUpperLeg: { rotation: 0.16 },
          RightLowerLeg: { rotation: -0.2 },
          LeftUpperLeg: { rotation: 0.14 },
          LeftLowerLeg: { rotation: -0.16 },
        }),
      ],
    });

    this.anims.set('perfectBlock', {
      name: 'perfectBlock',
      loop: false,
      duration: 0.45,
      keyframes: [
        this.kf(0, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.05, y: -2 },
          UpperTorso: { rotation: -0.06 },
          Head: { rotation: 0.04 },
          RightUpperArm: { rotation: 0.62 },
          RightLowerArm: { rotation: 1.18 },
          RightHand: { rotation: 0.6 },
          LeftUpperArm: { rotation: 0.58 },
          LeftLowerArm: { rotation: 1.14 },
          LeftHand: { rotation: 0.58 },
          RightUpperLeg: { rotation: 0.16 },
          RightLowerLeg: { rotation: -0.2 },
          LeftUpperLeg: { rotation: 0.14 },
          LeftLowerLeg: { rotation: -0.16 },
        }),
        // reação perfeita: guarda firme à frente, corpo ereto, braços pulsando
        this.kf(0.08, {
          ...GUARD_POSE,
          root: { x: 4 },
          LowerTorso: { rotation: 0.02, y: -2 },
          UpperTorso: { rotation: -0.02 },
          Head: { rotation: 0.01 },
          RightUpperArm: { rotation: 0.95, scaleX: 1.3, scaleY: 1.3 },
          RightLowerArm: { rotation: 1.45, scaleX: 1.3, scaleY: 1.3 },
          RightHand: { rotation: 0.75, scaleX: 1.3, scaleY: 1.3 },
          LeftUpperArm: { rotation: 0.9, scaleX: 1.3, scaleY: 1.3 },
          LeftLowerArm: { rotation: 1.4, scaleX: 1.3, scaleY: 1.3 },
          LeftHand: { rotation: 0.7, scaleX: 1.3, scaleY: 1.3 },
          RightUpperLeg: { rotation: 0.12 },
          RightLowerLeg: { rotation: -0.16 },
          LeftUpperLeg: { rotation: 0.1 },
          LeftLowerLeg: { rotation: -0.12 },
        }),
        this.kf(0.18, {
          ...GUARD_POSE,
          root: { x: 5 },
          RightUpperArm: { rotation: 0.92, scaleX: 1.35, scaleY: 1.35 },
          RightLowerArm: { rotation: 1.42, scaleX: 1.35, scaleY: 1.35 },
          RightHand: { rotation: 0.72, scaleX: 1.35, scaleY: 1.35 },
          LeftUpperArm: { rotation: 0.87, scaleX: 1.35, scaleY: 1.35 },
          LeftLowerArm: { rotation: 1.37, scaleX: 1.35, scaleY: 1.35 },
          LeftHand: { rotation: 0.67, scaleX: 1.35, scaleY: 1.35 },
        }),
        this.kf(0.3, {
          ...GUARD_POSE,
          root: { x: 2 },
          RightUpperArm: { rotation: 0.7, scaleX: 1.05, scaleY: 1.05 },
          RightLowerArm: { rotation: 1.25, scaleX: 1.05, scaleY: 1.05 },
          RightHand: { rotation: 0.65, scaleX: 1.05, scaleY: 1.05 },
          LeftUpperArm: { rotation: 0.65, scaleX: 1.05, scaleY: 1.05 },
          LeftLowerArm: { rotation: 1.2, scaleX: 1.05, scaleY: 1.05 },
          LeftHand: { rotation: 0.6, scaleX: 1.05, scaleY: 1.05 },
        }),
        this.kf(0.45, {
          ...GUARD_POSE,
          LowerTorso: { rotation: 0.05, y: -2 },
          UpperTorso: { rotation: -0.06 },
          Head: { rotation: 0.04 },
          RightUpperArm: { rotation: 0.62 },
          RightLowerArm: { rotation: 1.18 },
          RightHand: { rotation: 0.6 },
          LeftUpperArm: { rotation: 0.58 },
          LeftLowerArm: { rotation: 1.14 },
          LeftHand: { rotation: 0.58 },
          RightUpperLeg: { rotation: 0.16 },
          RightLowerLeg: { rotation: -0.2 },
          LeftUpperLeg: { rotation: 0.14 },
          LeftLowerLeg: { rotation: -0.16 },
        }),
      ],
    });

    this.anims.set('hitstun', {
      name: 'hitstun',
      loop: false,
      duration: 0.8,
      keyframes: [
        this.kf(0, { ...GUARD_POSE }),
        // impacto: cabeça estala pra trás primeiro, depois tronco
        this.kf(0.08, {
          ...GUARD_POSE,
          root: { x: -7 },
          LowerTorso: { rotation: 0.08, y: -2 },
          UpperTorso: { rotation: 0.14 },
          Head: { rotation: -0.28 },
          RightUpperArm: { rotation: -0.55 },
          RightLowerArm: { rotation: 0.4 },
          RightHand: { rotation: 0.15 },
          LeftUpperArm: { rotation: -0.6 },
          LeftLowerArm: { rotation: 0.45 },
          LeftHand: { rotation: 0.2 },
          RightUpperLeg: { rotation: 0.2 },
          RightLowerLeg: { rotation: -0.3 },
          LeftUpperLeg: { rotation: 0.18 },
          LeftLowerLeg: { rotation: -0.26 },
        }),
        // máximo recuo: braços voam pra trás
        this.kf(0.16, {
          ...GUARD_POSE,
          root: { x: -10 },
          LowerTorso: { rotation: 0.12, y: -2 },
          UpperTorso: { rotation: 0.18 },
          Head: { rotation: -0.35 },
          RightUpperArm: { rotation: -0.9 },
          RightLowerArm: { rotation: -0.2 },
          RightHand: { rotation: -0.1 },
          LeftUpperArm: { rotation: -0.85 },
          LeftLowerArm: { rotation: -0.25 },
          LeftHand: { rotation: -0.15 },
          RightUpperLeg: { rotation: 0.3 },
          RightLowerLeg: { rotation: -0.4 },
          LeftUpperLeg: { rotation: 0.25 },
          LeftLowerLeg: { rotation: -0.35 },
        }),
        // tropeço: dá um passo pra trás
        this.kf(0.35, {
          ...GUARD_POSE,
          root: { x: -12 },
          LowerTorso: { rotation: 0.05, y: -1 },
          UpperTorso: { rotation: 0.1 },
          Head: { rotation: -0.15 },
          RightUpperArm: { rotation: -0.5 },
          RightLowerArm: { rotation: 0.2 },
          RightHand: { rotation: 0.05 },
          LeftUpperArm: { rotation: -0.45 },
          LeftLowerArm: { rotation: 0.15 },
          RightUpperLeg: { rotation: 0.35 },
          RightLowerLeg: { rotation: -0.4 },
          LeftUpperLeg: { rotation: -0.1 },
          LeftLowerLeg: { rotation: 0.1 },
        }),
        // se recompõe
        this.kf(0.55, {
          ...GUARD_POSE,
          root: { x: -6 },
          LowerTorso: { rotation: 0.04 },
          UpperTorso: { rotation: 0.05 },
          Head: { rotation: -0.05 },
          RightUpperArm: { rotation: 0.1 },
          RightLowerArm: { rotation: 0.6 },
          RightHand: { rotation: 0.3 },
          LeftUpperArm: { rotation: 0.05 },
          LeftLowerArm: { rotation: 0.55 },
        }),
        this.kf(0.8, { ...GUARD_POSE }),
      ],
    });

    // KO: lançado pra trás, cai no chão e fica caído
    this.anims.set('ko', {
      name: 'ko',
      loop: false,
      duration: 1.35,
      keyframes: [
        this.kf(0, { ...GUARD_POSE }),
        // golpe: recuo e começa a tombar
        this.kf(0.05, {
          ...GUARD_POSE,
          root: { rotation: -0.12, y: -4 },
          LowerTorso: { rotation: 0.1, y: -2 },
          UpperTorso: { rotation: 0.15 },
          Head: { rotation: -0.3 },
          RightUpperArm: { rotation: -0.9 },
          RightLowerArm: { rotation: -0.6 },
          RightHand: { rotation: -0.4 },
          LeftUpperArm: { rotation: -0.95 },
          LeftLowerArm: { rotation: -0.5 },
          LeftHand: { rotation: -0.35 },
          RightUpperLeg: { rotation: 0.3 },
          RightLowerLeg: { rotation: -0.35 },
          LeftUpperLeg: { rotation: 0.28 },
          LeftLowerLeg: { rotation: -0.3 },
        }),
        // lançamento: corpo vai pra trás e pra cima
        this.kf(0.18, {
          ...GUARD_POSE,
          root: { rotation: -0.5, y: -18, x: 6 },
          LowerTorso: { rotation: 0.05, y: -2 },
          UpperTorso: { rotation: 0.08 },
          Head: { rotation: -0.15 },
          RightUpperArm: { rotation: -1.3 },
          RightLowerArm: { rotation: -0.9 },
          RightHand: { rotation: -0.6 },
          LeftUpperArm: { rotation: -1.35 },
          LeftLowerArm: { rotation: -0.95 },
          LeftHand: { rotation: -0.6 },
          RightUpperLeg: { rotation: 0.6 },
          RightLowerLeg: { rotation: -0.5 },
          LeftUpperLeg: { rotation: 0.55 },
          LeftLowerLeg: { rotation: -0.45 },
        }),
        // voo: corpo girando, membros soltos
        this.kf(0.4, {
          ...GUARD_POSE,
          root: { rotation: -0.95, y: -22, x: 10 },
          LowerTorso: { rotation: 0.02, y: -2 },
          UpperTorso: { rotation: 0.03 },
          Head: { rotation: 0.05 },
          RightUpperArm: { rotation: -1.5 },
          RightLowerArm: { rotation: -1.2 },
          RightHand: { rotation: -0.8 },
          LeftUpperArm: { rotation: -1.55 },
          LeftLowerArm: { rotation: -1.15 },
          LeftHand: { rotation: -0.75 },
          RightUpperLeg: { rotation: 0.75 },
          RightLowerLeg: { rotation: -0.6 },
          LeftUpperLeg: { rotation: 0.7 },
          LeftLowerLeg: { rotation: -0.55 },
        }),
        // queda
        this.kf(0.62, {
          ...GUARD_POSE,
          root: { rotation: -1.25, y: -12, x: 8 },
          LowerTorso: { rotation: 0.02 },
          Head: { rotation: 0.03 },
          RightUpperArm: { rotation: -1.4 },
          RightLowerArm: { rotation: -1.1 },
          LeftUpperArm: { rotation: -1.45 },
          LeftLowerArm: { rotation: -1.05 },
          RightUpperLeg: { rotation: 0.7 },
          RightLowerLeg: { rotation: -0.55 },
          LeftUpperLeg: { rotation: 0.65 },
          LeftLowerLeg: { rotation: -0.5 },
        }),
        // impacto no chão: corpo achatado no chão, mole
        this.kf(0.78, {
          ...GUARD_POSE,
          root: { rotation: -1.5, y: 30, x: 4 },
          LowerTorso: { rotation: 0.02, y: -2 },
          UpperTorso: { rotation: 0.01 },
          Head: { rotation: -0.05 },
          RightUpperArm: { rotation: -0.6 },
          RightLowerArm: { rotation: -0.9 },
          RightHand: { rotation: -0.5 },
          LeftUpperArm: { rotation: -0.65 },
          LeftLowerArm: { rotation: -0.85 },
          LeftHand: { rotation: -0.45 },
          RightUpperLeg: { rotation: 0.45 },
          RightLowerLeg: { rotation: -0.4 },
          LeftUpperLeg: { rotation: 0.4 },
          LeftLowerLeg: { rotation: -0.35 },
        }),
        // pequeno quique
        this.kf(1.0, {
          ...GUARD_POSE,
          root: { rotation: -1.53, y: 36, x: 3 },
        }),
        // assenta de vez: caído no chão
        this.kf(1.35, {
          ...GUARD_POSE,
          root: { rotation: -1.55, y: 40, x: 2 },
          LowerTorso: { rotation: 0.01, y: -2 },
          UpperTorso: { rotation: 0.0 },
          Head: { rotation: 0.02 },
          RightUpperArm: { rotation: -0.55 },
          RightLowerArm: { rotation: -0.85 },
          RightHand: { rotation: -0.45 },
          LeftUpperArm: { rotation: -0.6 },
          LeftLowerArm: { rotation: -0.8 },
          LeftHand: { rotation: -0.4 },
          RightUpperLeg: { rotation: 0.4 },
          RightLowerLeg: { rotation: -0.35 },
          LeftUpperLeg: { rotation: 0.35 },
          LeftLowerLeg: { rotation: -0.3 },
        }),
      ],
    });
  }
}
