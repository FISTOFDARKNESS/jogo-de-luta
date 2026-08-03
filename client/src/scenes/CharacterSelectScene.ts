import Phaser from 'phaser';
import { CRTPipeline } from '../systems/CRTPipeline.js';
import { BotDifficulty } from './DifficultySelectScene.js';

export type FighterClass = 'balanced' | 'berserker' | 'tank';

export const FIGHTER_CLASS_NAMES: Record<FighterClass, string> = {
  balanced: 'BALANCED',
  berserker: 'BERSERKER',
  tank: 'TANK',
};

export const FIGHTER_CLASS_INFO: Record<FighterClass, { desc: string; color: number }> = {
  balanced: { desc: 'All-rounder. Balanced stats.', color: 0xff4444 },
  berserker: { desc: 'Fast and powerful. Low health.', color: 0x880000 },
  tank: { desc: 'High health. Slow but durable.', color: 0x4a4a4a },
};

export class CharacterSelectScene extends Phaser.Scene {
  private pendingData: { mode?: string; difficulty?: BotDifficulty } = {};
  private p1Class: FighterClass | null = null;
  private p2Class: FighterClass | null = null;
  private isTwoPlayer: boolean = false;

  constructor() {
    super({ key: 'CharacterSelectScene' });
  }

  init(data?: { mode?: string; difficulty?: BotDifficulty }): void {
    this.pendingData = data || {};
    this.isTwoPlayer = data?.mode === 'local2p';
    this.p1Class = null;
    this.p2Class = null;
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
      80,
      this.isTwoPlayer ? 'SELECT FIGHTERS' : 'SELECT FIGHTER',
      {
        font: 'bold 42px Arial',
        color: '#ffcc00',
        stroke: '#000000',
        strokeThickness: 6,
        align: 'center',
      }
    );
    title.setOrigin(0.5, 0.5);

    if (this.isTwoPlayer) {
      const p1Label = this.add.text(
        this.cameras.main.centerX - 250,
        140,
        'P1 SELECT',
        { font: 'bold 18px Arial', color: '#ff6666', stroke: '#000000', strokeThickness: 3 }
      ).setOrigin(0.5, 0.5);

      const p2Label = this.add.text(
        this.cameras.main.centerX + 250,
        140,
        'P2 SELECT',
        { font: 'bold 18px Arial', color: '#6666ff', stroke: '#000000', strokeThickness: 3 }
      ).setOrigin(0.5, 0.5);

      p1Label.setAlpha(this.p1Class ? 0.4 : 1);
      p2Label.setAlpha(this.p2Class ? 0.4 : 1);
    }

    const classes: FighterClass[] = ['balanced', 'berserker', 'tank'];

    classes.forEach((cls, index) => {
      const info = FIGHTER_CLASS_INFO[cls];
      const y = 250 + index * 160;

      const btnBg = this.add.rectangle(
        this.cameras.main.centerX,
        y,
        360,
        120,
        info.color
      );
      btnBg.setStrokeStyle(3, 0xffcc00);
      btnBg.setInteractive({ useHandCursor: true });

      const btnText = this.add.text(
        this.cameras.main.centerX,
        y - 20,
        FIGHTER_CLASS_NAMES[cls],
        {
          font: 'bold 28px Arial',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4,
        }
      ).setOrigin(0.5, 0.5);

      const btnDesc = this.add.text(
        this.cameras.main.centerX,
        y + 15,
        info.desc,
        {
          font: '14px Arial',
          color: '#dddddd',
          align: 'center',
        }
      ).setOrigin(0.5, 0.5);

      btnBg.on('pointerover', () => {
        btnBg.setStrokeStyle(3, 0xffff00);
        btnBg.setAlpha(0.8);
      });

      btnBg.on('pointerout', () => {
        btnBg.setStrokeStyle(3, 0xffcc00);
        btnBg.setAlpha(1);
      });

      btnBg.on('pointerdown', () => {
        this.selectClass(cls);
      });
    });

    const backBtn = this.add.rectangle(
      this.cameras.main.centerX,
      650,
      200,
      40,
      0x333333
    );
    backBtn.setStrokeStyle(1, 0x888888);
    backBtn.setInteractive({ useHandCursor: true });

    const backText = this.add.text(
      this.cameras.main.centerX,
      650,
      'BACK',
      {
        font: 'bold 16px Arial',
        color: '#cccccc',
      }
    ).setOrigin(0.5, 0.5);

    backBtn.on('pointerover', () => {
      backBtn.setFillStyle(0x555555);
    });

    backBtn.on('pointerout', () => {
      backBtn.setFillStyle(0x333333);
    });

    backBtn.on('pointerdown', () => {
      if (this.pendingData.mode) {
        this.scene.start('DifficultySelectScene', this.pendingData);
      } else {
        this.scene.start('MenuScene');
      }
    });
  }

  private selectClass(cls: FighterClass): void {
    if (this.isTwoPlayer) {
      if (!this.p1Class) {
        this.p1Class = cls;
      } else if (!this.p2Class) {
        this.p2Class = cls;
        this.startGame(this.p1Class, this.p2Class);
        return;
      }
    } else {
      this.startGame(cls, cls);
      return;
    }
  }

  private startGame(p1Class: FighterClass, p2Class: FighterClass): void {
    this.scene.start('FightScene', {
      ...this.pendingData,
      fighterClassP1: p1Class,
      fighterClassP2: p2Class,
    });
  }
}
