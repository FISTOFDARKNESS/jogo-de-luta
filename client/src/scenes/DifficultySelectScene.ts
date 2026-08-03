import Phaser from 'phaser';
import { CRTPipeline } from '../systems/CRTPipeline.js';

export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'expert' | 'nightmare';

export interface DifficultyConfig {
  key: BotDifficulty;
  label: string;
  description: string;
  color: number;
  health: number;
  blockChance: number;
  perfectBlockChance: number;
  approachDelay: number;
  attackSpeed: number;
  airKickChance: number;
  specialChance: number;
}

export const DIFFICULTY_CONFIGS: Record<BotDifficulty, DifficultyConfig> = {
  easy: {
    key: 'easy',
    label: 'EASY',
    description: 'High health, basic blocking',
    color: 0x4a994a,
    health: 100,
    blockChance: 0.2,
    perfectBlockChance: 0.0,
    approachDelay: 0.6,
    attackSpeed: 1.0,
    airKickChance: 0.05,
    specialChance: 0.1,
  },
  normal: {
    key: 'normal',
    label: 'NORMAL',
    description: 'Standard health, occasional blocks',
    color: 0x999933,
    health: 100,
    blockChance: 0.6,
    perfectBlockChance: 0.15,
    approachDelay: 0.3,
    attackSpeed: 1.0,
    airKickChance: 0.15,
    specialChance: 0.25,
  },
  hard: {
    key: 'hard',
    label: 'HARD',
    description: 'Less health, frequent perfect blocks',
    color: 0xaa6633,
    health: 85,
    blockChance: 0.9,
    perfectBlockChance: 0.35,
    approachDelay: 0.15,
    attackSpeed: 1.2,
    airKickChance: 0.25,
    specialChance: 0.4,
  },
  expert: {
    key: 'expert',
    label: 'EXPERT',
    description: 'Low health, near-perfect block timing',
    color: 0x993333,
    health: 65,
    blockChance: 0.95,
    perfectBlockChance: 0.55,
    approachDelay: 0.1,
    attackSpeed: 1.3,
    airKickChance: 0.35,
    specialChance: 0.55,
  },
  nightmare: {
    key: 'nightmare',
    label: 'NIGHTMARE',
    description: 'MINIMUM health, NEAR-PERFECT blocking',
    color: 0x5a0000,
    health: 40,
    blockChance: 1.0,
    perfectBlockChance: 0.85,
    approachDelay: 0.05,
    attackSpeed: 1.5,
    airKickChance: 0.45,
    specialChance: 0.7,
  },
};

export class DifficultySelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'DifficultySelectScene' });
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
      'SELECT DIFFICULTY',
      {
        font: 'bold 42px Arial',
        color: '#ffcc00',
        stroke: '#000000',
        strokeThickness: 6,
        align: 'center',
      }
    );
    title.setOrigin(0.5, 0.5);

    const subtitle = this.add.text(
      this.cameras.main.centerX,
      130,
      'Higher difficulty = less bot health\nbut more frequent perfect blocks',
      {
        font: 'italic 16px Arial',
        color: '#aaaaaa',
        align: 'center',
      }
    );
    subtitle.setOrigin(0.5, 0.5);

    const difficulties: BotDifficulty[] = ['easy', 'normal', 'hard', 'expert', 'nightmare'];

    difficulties.forEach((diff, index) => {
      const config = DIFFICULTY_CONFIGS[diff];
      const y = 165 + index * 82;

      const btnBg = this.add.rectangle(
        this.cameras.main.centerX,
        y,
        400,
        70,
        config.color
      );
      btnBg.setStrokeStyle(2, 0xffcc00);
      btnBg.setInteractive({ useHandCursor: true });

      const btnText = this.add.text(
        this.cameras.main.centerX,
        y - 8,
        config.label,
        {
          font: 'bold 22px Arial',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        }
      ).setOrigin(0.5, 0.5);

      const btnDesc = this.add.text(
        this.cameras.main.centerX,
        y + 18,
        config.description,
        {
          font: '13px Arial',
          color: '#dddddd',
        }
      ).setOrigin(0.5, 0.5);

      const originalColor = config.color;

      btnBg.on('pointerover', () => {
        btnBg.setFillStyle(originalColor + 0x222222);
      });

      btnBg.on('pointerout', () => {
        btnBg.setFillStyle(originalColor);
      });

      btnBg.on('pointerdown', () => {
        this.startGame(diff);
      });
    });

    const backBtn = this.add.rectangle(
      this.cameras.main.centerX,
      705,
      200,
      40,
      0x333333
    );
    backBtn.setStrokeStyle(1, 0x888888);
    backBtn.setInteractive({ useHandCursor: true });

    const backText = this.add.text(
      this.cameras.main.centerX,
      705,
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
      this.scene.start('MenuScene');
    });
  }

  private startGame(difficulty: BotDifficulty): void {
    this.scene.start('CharacterSelectScene', { mode: 'vsBot', difficulty });
  }
}
