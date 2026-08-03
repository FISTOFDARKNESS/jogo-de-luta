import Phaser from 'phaser';

export class VFXManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  createHitSpark(x: number, y: number, isPerfectBlock: boolean = false): void {
    const color = isPerfectBlock ? 0x00ffff : 0xffaa00;
    const particleCount = isPerfectBlock ? 20 : 12;

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 150 + 50;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      const p = this.scene.add.rectangle(x, y, 4, 4, color);
      
      this.scene.tweens.add({
        targets: p,
        x: x + vx * 0.2,
        y: y + vy * 0.2,
        alpha: 0,
        scale: 0.2,
        duration: 250,
        onComplete: () => p.destroy()
      });
    }

    if (isPerfectBlock) {
      this.showFloatingText(x, y - 30, 'PERFECT!', '#00ffff');
    }
  }

  createFlyingKickImpact(x: number, y: number): void {
    this.triggerScreenShake(0.03, 220);
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 220 + 60;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const color = Math.random() < 0.5 ? 0xff8800 : 0xffffff;

      const p = this.scene.add.rectangle(x, y, 5, 5, color);
      this.scene.tweens.add({
        targets: p,
        x: x + vx * 0.25,
        y: y + vy * 0.25,
        alpha: 0,
        scale: 0.2,
        duration: 300,
        onComplete: () => p.destroy()
      });
    }

    const ring = this.scene.add.circle(x, y, 8, 0xffffff, 0.8);
    this.scene.tweens.add({
      targets: ring,
      scale: 5,
      alpha: 0,
      duration: 300,
      onComplete: () => ring.destroy()
    });
  }

  createAttackTrail(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      const p = this.scene.add.rectangle(x, y - 20 + i * 8, 6, 6, 0xff6600);
      p.setAlpha(0.8);
      this.scene.tweens.add({
        targets: p,
        x: x + (Math.random() - 0.5) * 40,
        y: y - 40 + i * 8,
        alpha: 0,
        scale: 0.3,
        duration: 200,
        onComplete: () => p.destroy()
      });
    }
  }

  triggerScreenShake(intensity: number = 0.015, duration: number = 150): void {
    this.scene.cameras.main.shake(duration, intensity);
  }

  triggerScreenFlash(color: number = 0xffffff, duration: number = 100): void {
    this.scene.cameras.main.flash(duration, (color >> 16) & 255, (color >> 8) & 255, color & 255);
  }

  triggerSlowMoKO(onComplete?: () => void): void {
    this.scene.time.timeScale = 0.2;
    this.triggerScreenShake(0.03, 300);
    this.triggerScreenFlash(0xff0000, 200);

    this.scene.time.delayedCall(400, () => {
      this.scene.time.timeScale = 1.0;
      if (onComplete) onComplete();
    });
  }

  showFloatingText(x: number, y: number, text: string, colorHex: string = '#ffffff'): void {
    const txt = this.scene.add.text(x, y, text, {
      font: 'bold 24px Arial',
      color: colorHex,
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5, 0.5);

    this.scene.tweens.add({
      targets: txt,
      y: y - 40,
      alpha: 0,
      duration: 600,
      onComplete: () => txt.destroy()
    });
  }
}
