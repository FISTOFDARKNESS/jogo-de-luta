import Phaser from 'phaser';

export class VFXManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  createHitSpark(x: number, y: number, isPerfectBlock: boolean = false): void {
    const color = isPerfectBlock ? 0x00ffff : 0xffaa00;
    const particleCount = isPerfectBlock ? 28 : 16;

    // Shockwave ring
    const ring = this.scene.add.circle(x, y, 6, color, 0.85);
    this.scene.tweens.add({
      targets: ring,
      scale: isPerfectBlock ? 6 : 4,
      alpha: 0,
      duration: isPerfectBlock ? 240 : 180,
      onComplete: () => ring.destroy()
    });

    // Dynamic sparks
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 200 + (isPerfectBlock ? 120 : 60);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = Math.random() * 5 + 3;

      const p = this.scene.add.rectangle(x, y, size, size, color);
      p.setRotation(angle);
      
      this.scene.tweens.add({
        targets: p,
        x: x + vx * 0.25,
        y: y + vy * 0.25,
        alpha: 0,
        scale: 0.1,
        duration: Math.random() * 150 + 200,
        onComplete: () => p.destroy()
      });
    }

    if (isPerfectBlock) {
      this.createPerfectBlockFlash(x, y);
      this.showFloatingText(x, y - 30, 'PERFECT!', '#00ffff');
    }
  }

  createFlyingKickImpact(x: number, y: number): void {
    this.triggerScreenShake(0.025, 200);
    
    // Impact rings
    for (let i = 0; i < 2; i++) {
      const ring = this.scene.add.circle(x, y, 10, 0xffffff, 0.7 - i * 0.25);
      this.scene.tweens.add({
        targets: ring,
        scale: 5 + i * 3,
        alpha: 0,
        duration: 250 + i * 80,
        onComplete: () => ring.destroy()
      });
    }

    // Impact sparks
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 240 + 70;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const color = Math.random() < 0.5 ? 0xffbb00 : 0xffffff;
      const size = Math.random() * 6 + 3;

      const p = this.scene.add.rectangle(x, y, size, size, color);
      p.setRotation(angle);
      
      this.scene.tweens.add({
        targets: p,
        x: x + vx * 0.3,
        y: y + vy * 0.3,
        alpha: 0,
        scale: 0.1,
        duration: Math.random() * 200 + 250,
        onComplete: () => p.destroy()
      });
    }
  }

  createAttackTrail(x: number, y: number, color: number = 0xff6600): void {
    for (let i = 0; i < 6; i++) {
      const p = this.scene.add.rectangle(x, y - 20 + i * 8, 7, 7, color);
      p.setAlpha(0.85);
      this.scene.tweens.add({
        targets: p,
        x: x + (Math.random() - 0.5) * 50,
        y: y - 40 + i * 8,
        alpha: 0,
        scale: 0.2,
        duration: 180,
        onComplete: () => p.destroy()
      });
    }
  }

  createDustTrail(x: number, y: number): void {
    const particleCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < particleCount; i++) {
      const vx = (Math.random() - 0.5) * 80;
      const vy = -Math.random() * 30 - 10;
      const radius = Math.random() * 4 + 3;
      const p = this.scene.add.circle(x, y - 2, radius, 0xdddddd, 0.4);
      
      this.scene.tweens.add({
        targets: p,
        x: x + vx * 0.25,
        y: y + vy * 0.25,
        scale: 1.8,
        alpha: 0,
        duration: Math.random() * 150 + 250,
        onComplete: () => p.destroy()
      });
    }
  }

  createEXAura(x: number, y: number, color: number = 0x00ffff): void {
    const particleCount = 2;
    for (let i = 0; i < particleCount; i++) {
      const px = x + (Math.random() - 0.5) * 36;
      const py = y - Math.random() * 45;
      const radius = Math.random() * 5 + 3;
      const p = this.scene.add.circle(px, py, radius, color, 0.55);
      
      this.scene.tweens.add({
        targets: p,
        y: py - 55,
        x: px + (Math.random() - 0.5) * 12,
        alpha: 0,
        scale: 0.1,
        duration: Math.random() * 250 + 350,
        onComplete: () => p.destroy()
      });
    }
  }

  createGuardBreakShards(x: number, y: number): void {
    const shardCount = 16;
    const color = 0xffd700; // Gold shards
    for (let i = 0; i < shardCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 250 + 60;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      const w = Math.random() * 6 + 3;
      const h = Math.random() * 6 + 3;
      const p = this.scene.add.rectangle(x, y - 20, w, h, color, 0.85);
      p.setRotation(Math.random() * Math.PI);
      
      this.scene.tweens.add({
        targets: p,
        x: x + vx * 0.3,
        y: y - 20 + vy * 0.3,
        rotation: p.rotation + (Math.random() > 0.5 ? 2.5 : -2.5),
        alpha: 0,
        scale: 0.1,
        duration: Math.random() * 200 + 350,
        onComplete: () => p.destroy()
      });
    }
  }

  createPerfectBlockFlash(x: number, y: number): void {
    // Two expanding shockwaves
    for (let i = 0; i < 2; i++) {
      const ring = this.scene.add.circle(x, y, 10, 0x00ffff, 0.7 - i * 0.25);
      this.scene.tweens.add({
        targets: ring,
        scale: 7 + i * 4,
        alpha: 0,
        duration: 220 + i * 80,
        onComplete: () => ring.destroy()
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
      font: 'bold 24px Impact, Arial Black',
      color: colorHex,
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5, 0.5);

    this.scene.tweens.add({
      targets: txt,
      y: y - 50,
      alpha: 0,
      duration: 600,
      onComplete: () => txt.destroy()
    });
  }
}
