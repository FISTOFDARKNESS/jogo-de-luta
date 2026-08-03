import Phaser from 'phaser';
import { CRTPipeline } from '../systems/CRTPipeline.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    if (this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      if (!this.renderer.pipelines.has(CRTPipeline.KEY)) {
        this.renderer.pipelines.addPostPipeline(CRTPipeline.KEY, CRTPipeline);
      }
      this.cameras.main.setPostPipeline(CRTPipeline);
    }

    this.cameras.main.setBackgroundColor('#1a1a2e');

    const title = this.add.text(
      this.cameras.main.centerX,
      120,
      'STREET FIGHTER 2D',
      {
        font: 'bold 48px Arial',
        color: '#ffcc00',
        stroke: '#000000',
        strokeThickness: 6,
        align: 'center',
      }
    );
    title.setOrigin(0.5, 0.5);

    this.createButton(this.cameras.main.centerX, 280, '1 VS BOT (LOCAL)', () => {
      this.scene.start('DifficultySelectScene');
    });

    this.createButton(this.cameras.main.centerX, 200, 'ARCADE MODE', () => {
      this.scene.start('FightScene', { mode: 'arcade' });
    });

    this.createButton(this.cameras.main.centerX, 360, 'CHARACTER SELECT', () => {
      this.scene.start('CharacterSelectScene');
    });

    this.createButton(this.cameras.main.centerX, 440, '2 PLAYERS (SHARED KEYBOARD)', () => {
      this.scene.start('CharacterSelectScene', { mode: 'local2p' });
    });

    this.createButton(this.cameras.main.centerX, 520, '1v1 ONLINE', () => {
      this.scene.start('OnlineLobbyScene');
    });

    const controlsBox = this.add.text(
      this.cameras.main.centerX,
      630,
      'LOCAL CONTROLS:\nP1: A/D (Move), W (Jump), S (Crouch), U/I (Light/Heavy Punch), J/K (Light/Heavy Kick), L (Block), Y/O (EX), Q (Air Dash), T (Tech), R (Reversal), Enter (Wake-up)\nP2: Arrows (Move/Jump/Crouch), Numpad 1/2 (Punches), Numpad 3/4 (Kicks), Numpad 0 (Block), 5/6 (EX), 7 (Air Dash), 8 (Tech), 9 (Reversal), Numpad Enter (Wake-up)',
      { font: '14px Arial', color: '#aaaaaa', align: 'center' }
    );
    controlsBox.setOrigin(0.5, 0.5);
  }

  private createButton(x: number, y: number, text: string, callback: () => void): void {
    const btnBg = this.add.rectangle(x, y, 320, 50, 0x334466);
    btnBg.setStrokeStyle(2, 0xffcc00);
    btnBg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(x, y, text, {
      font: 'bold 18px Arial',
      color: '#ffffff',
    }).setOrigin(0.5, 0.5);

    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(0x446699);
    });

    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(0x334466);
    });

    btnBg.on('pointerdown', () => {
      callback();
    });
  }
}
