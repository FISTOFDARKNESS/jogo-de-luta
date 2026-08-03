import Phaser from 'phaser';
import { Fighter, FighterState, FighterSide } from '@shared/game/fighter.js';
import { RiggedCharacter } from './RiggedCharacter.js';

const CLASS_SCALE: Record<string, number> = {
  balanced: 1.0,
  berserker: 1.07,
  tank: 1.15,
};

export class FighterEntity extends Phaser.GameObjects.Container {
  private fighter: Fighter;
  private riggedCharacter: RiggedCharacter;
  private healthBarBg: Phaser.GameObjects.Rectangle;
  private healthBarFg: Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private comboText: Phaser.GameObjects.Text;
  private comboCount: number = 0;
  private comboTimer: number = 0;
  private catchupHealth: number = 100;
  private catchupDelay: number = 0;
  private scoreStars: Phaser.GameObjects.Rectangle[] = [];
  private wasKo: boolean = false;
  private lastFacing: number = 1;

  constructor(scene: Phaser.Scene, fighter: Fighter, playerColor?: number) {
    super(scene, fighter.x, fighter.y);

    this.fighter = fighter;
    this.lastFacing = fighter.facing === FighterSide.RIGHT ? 1 : -1;
    this.riggedCharacter = new RiggedCharacter(scene, 0, 0, this.lastFacing, {
      baseColor: playerColor ?? fighter.baseColor ?? 0xff4444,
      bodyScale: CLASS_SCALE[fighter.fighterClass] ?? 1,
    });
    this.add(this.riggedCharacter);

    this.healthBarBg = scene.add.rectangle(0, -104, 50, 6, 0x333333);
    this.healthBarBg.setOrigin(0.5, 0);
    this.add(this.healthBarBg);

    this.healthBarFg = scene.add.rectangle(0, -104, 50, 6, 0x00ff00);
    this.healthBarFg.setOrigin(0.5, 0);
    this.add(this.healthBarFg);

    this.nameText = scene.add.text(0, -119, fighter.className ?? fighter.id.toUpperCase(), {
      font: 'bold 12px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.nameText.setOrigin(0.5, 0);
    this.add(this.nameText);

    this.comboText = scene.add.text(0, -134, '', {
      font: 'bold 16px Arial',
      color: '#ffcc00',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.comboText.setOrigin(0.5, 0);
    this.comboText.setVisible(false);
    this.add(this.comboText);

    for (let i = 0; i < 3; i++) {
      const star = scene.add.rectangle(-12 + i * 12, -92, 8, 8, 0x333333);
      star.setOrigin(0.5, 0.5);
      this.scoreStars.push(star);
      this.add(star);
    }
  }

  update(dt: number): void {
    this.setX(this.fighter.x);
    this.setY(this.fighter.y);

    const desiredFacing = this.fighter.facing === FighterSide.RIGHT ? 1 : -1;
    if (desiredFacing !== this.lastFacing) {
      this.lastFacing = desiredFacing;
      this.riggedCharacter.turnToFacing(desiredFacing, 0.12);
    } else if (!this.riggedCharacter.isTurning()) {
      this.riggedCharacter.setFacing(desiredFacing);
    }

    this.updateAnimation();

    if (this.fighter.hitstopTimer <= 0) {
      this.riggedCharacter.update(dt);
    }

    this.updateHealthBar();
    this.updateComboText(dt);
    this.updateCatchupHealth(dt);
  }

  private attackAnimation(attackType: string | null): { name: string; speed: number } {
    switch (attackType) {
      case 'lightPunch':
        return { name: 'punchRight', speed: 1.8 };
      case 'heavyPunch':
        return { name: 'punchLeft', speed: 1.3 };
      case 'exLightPunch':
        return { name: 'punchRight', speed: 2.1 };
      case 'exHeavyPunch':
        return { name: 'punchLeft', speed: 1.6 };
      case 'lightKick':
        return { name: 'kickRight', speed: 1.7 };
      case 'heavyKick':
        return { name: 'kickLeft', speed: 1.3 };
      case 'flyingKick':
        return { name: 'flyingKick', speed: 1 };
      case 'mortal':
        return { name: 'mortal', speed: 1 };
      case 'throw':
        return { name: 'punchRight', speed: 1.5 };
      case 'airPunch':
        return { name: 'punchRight', speed: 1.8 };
      case 'airHeavyPunch':
        return { name: 'punchLeft', speed: 1.5 };
      default:
        return { name: 'punchRight', speed: 1.6 };
    }
  }

  private updateAnimation(): void {
    if (this.fighter.ko && !this.wasKo) {
      this.wasKo = true;
      this.riggedCharacter.playOneShot('ko', 1, { hold: true });
    } else if (!this.fighter.ko && this.wasKo) {
      this.wasKo = false;
    }
    if (this.wasKo) return;

    const state = this.fighter.state;

    switch (state) {
      case FighterState.IDLE:
        this.riggedCharacter.playAnimation('idle', 1);
        break;

      case FighterState.WALKING:
        this.riggedCharacter.playAnimation('walk', 1.25);
        break;

      case FighterState.JUMPING:
        this.riggedCharacter.playAnimation('jump', 1);
        break;

      case FighterState.CROUCHING:
        this.riggedCharacter.playAnimation('crouch', 1);
        break;

      case FighterState.ATTACKING: {
        const anim = this.attackAnimation(this.fighter.attackType);
        this.riggedCharacter.playAnimation(anim.name, anim.speed);
        break;
      }

      case FighterState.BLOCKING:
        this.riggedCharacter.playAnimation('block', 1);
        break;

      case FighterState.HITSTUN:
        this.riggedCharacter.playOneShot('hitstun', 1);
        break;
    }
  }

  onBlockHit(wasPerfect: boolean): void {
    if (this.fighter.ko) return;
    if (wasPerfect) {
      this.riggedCharacter.playOneShot('perfectBlock', 1);
    } else {
      this.riggedCharacter.playOneShot('blockHit', 1);
    }
  }

  getRig(): RiggedCharacter {
    return this.riggedCharacter;
  }

  private updateHealthBar(): void {
    const maxHp = this.fighter.maxHealth ?? 100;
    const ratio = Math.max(0, this.fighter.health / maxHp);
    this.healthBarFg.setScale(ratio, 1);

    if (ratio <= 0.3) {
      this.healthBarFg.setFillStyle(0xff2222);
    } else if (ratio <= 0.6) {
      this.healthBarFg.setFillStyle(0xffaa00);
    } else {
      this.healthBarFg.setFillStyle(0x00ff66);
    }
  }

  private updateComboText(dt: number): void {
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) {
      this.comboText.setVisible(false);
      this.comboCount = 0;
    }
  }

  showCombo(count: number): void {
    this.comboCount = count;
    this.comboTimer = 1.5;
    this.comboText.setText(count > 1 ? `${count} HITS!` : '');
    this.comboText.setVisible(count > 1);
    this.comboText.setScale(1.5);
    this.scene.tweens.add({
      targets: this.comboText,
      scaleX: 1,
      scaleY: 1,
      duration: 200,
    });
  }

  private updateCatchupHealth(dt: number): void {
    if (this.catchupDelay > 0) {
      this.catchupDelay -= dt;
    } else if (this.catchupHealth > this.fighter.health) {
      this.catchupHealth = Math.max(this.fighter.health, this.catchupHealth - dt * 35);
    }
  }

  setCatchupHealth(health: number): void {
    this.catchupHealth = health;
  }

  getCatchupHealth(): number {
    return this.catchupHealth;
  }

  setCatchupDelay(delay: number): void {
    this.catchupDelay = delay;
  }

  getCatchupDelay(): number {
    return this.catchupDelay;
  }

  setFlash(color: number, duration: number): void {
    this.riggedCharacter.setFlash(color, duration);
  }
}
