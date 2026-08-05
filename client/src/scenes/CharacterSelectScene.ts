import Phaser from 'phaser';
import { CRTPipeline } from '../systems/CRTPipeline.js';
import { BotDifficulty } from './DifficultySelectScene.js';
import { RiggedCharacter } from '../entities/RiggedCharacter.js';

export type FighterClass = 'balanced' | 'berserker' | 'tank';

export const FIGHTER_CLASS_NAMES: Record<FighterClass, string> = {
  balanced: 'BALANCED',
  berserker: 'BERSERKER',
  tank: 'TANK',
};

export const FIGHTER_CLASS_INFO: Record<FighterClass, { desc: string; color: number; stats: string }> = {
  balanced: { desc: 'All-rounder. Balanced stats.', color: 0xcc2222, stats: 'HP: ★★★★☆  ATK: ★★★★☆  SPD: ★★★★☆' },
  berserker: { desc: 'Fast and powerful. Low health.', color: 0x880000, stats: 'HP: ★★★☆☆  ATK: ★★★★★  SPD: ★★★★★' },
  tank: { desc: 'High health. Slow but durable.', color: 0x4a4a4a, stats: 'HP: ★★★★★  ATK: ★★★☆☆  SPD: ★★★☆☆' },
};

export type StageId = 'neonDojo' | 'volcanicTemple' | 'cyberpunkCity' | 'forestDojo';

export interface StageConfig {
  id: StageId;
  name: string;
  desc: string;
  colorBg: number;
  colorBorder: number;
}

export const STAGES_CONFIG: StageConfig[] = [
  { id: 'neonDojo', name: 'NEON DOJO', desc: 'Cyberpunk city rooftop under glowing signs.', colorBg: 0x131924, colorBorder: 0x00ffff },
  { id: 'volcanicTemple', name: 'VOLCANIC TEMPLE', desc: 'Ancient fire shrine with bubbling lava.', colorBg: 0x220502, colorBorder: 0xff3300 },
  { id: 'cyberpunkCity', name: 'CYBERPUNK ROOFTOP', desc: 'Rainy high-tech skyscraper rooftops.', colorBg: 0x0c121e, colorBorder: 0x00aaff },
  { id: 'forestDojo', name: 'FOREST DOJO', desc: 'Traditional dojo at sunset with sakura petals.', colorBg: 0x241421, colorBorder: 0xff77aa }
];

export class CharacterSelectScene extends Phaser.Scene {
  private pendingData: { mode?: string; difficulty?: BotDifficulty } = {};
  private p1Class: FighterClass | null = null;
  private p2Class: FighterClass | null = null;
  private isTwoPlayer: boolean = false;
  
  private currentSelectionPhase: 'character' | 'stage' = 'character';

  // Live Previews
  private p1Preview: RiggedCharacter | null = null;
  private p2Preview: RiggedCharacter | null = null;

  // UI Groups
  private characterSelectUI: Phaser.GameObjects.Group | null = null;
  private stageSelectUI: Phaser.GameObjects.Group | null = null;
  
  private titleText: Phaser.GameObjects.Text | null = null;
  private p1StatusText: Phaser.GameObjects.Text | null = null;
  private p2StatusText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'CharacterSelectScene' });
  }

  init(data?: { mode?: string; difficulty?: BotDifficulty }): void {
    this.pendingData = data || {};
    this.isTwoPlayer = data?.mode === 'local2p';
    this.p1Class = null;
    this.p2Class = null;
    this.currentSelectionPhase = 'character';
  }

  create(): void {
    if (this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      if (!this.renderer.pipelines.has(CRTPipeline.KEY)) {
        this.renderer.pipelines.addPostPipeline(CRTPipeline.KEY, CRTPipeline);
      }
      this.cameras.main.setPostPipeline(CRTPipeline);
    }

    this.cameras.main.setBackgroundColor('#10101e');
    
    this.characterSelectUI = this.add.group();
    this.stageSelectUI = this.add.group();

    this.titleText = this.add.text(
      this.cameras.main.centerX,
      50,
      this.isTwoPlayer ? 'P1 CHOOSE YOUR FIGHTER' : 'CHOOSE YOUR FIGHTER',
      {
        font: 'bold 40px Impact, Arial Black, sans-serif',
        color: '#ffcc00',
        stroke: '#000000',
        strokeThickness: 6,
        align: 'center',
      }
    ).setOrigin(0.5, 0.5);
    this.characterSelectUI.add(this.titleText);

    // Decorator borders
    const bgFrame = this.add.graphics();
    bgFrame.lineStyle(2, 0xffcc00, 0.25);
    bgFrame.strokeRect(20, 20, this.scale.width - 40, this.scale.height - 40);
    this.characterSelectUI.add(bgFrame);

    this.p1StatusText = this.add.text(220, 110, 'P1: SELECTING...', {
      font: 'bold 20px Impact, sans-serif',
      color: '#ff6666',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5, 0.5);
    this.characterSelectUI.add(this.p1StatusText);

    this.p2StatusText = this.add.text(1060, 110, this.isTwoPlayer ? 'P2: WAITING...' : 'BOT: BALANCED', {
      font: 'bold 20px Impact, sans-serif',
      color: '#6666ff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5, 0.5);
    this.characterSelectUI.add(this.p2StatusText);

    // Create the character preview spaces
    this.updateP1Preview('balanced');
    this.p1Preview?.setVisible(false);
    
    if (this.isTwoPlayer) {
      this.updateP2Preview('balanced');
      this.p2Preview?.setVisible(false);
    } else {
      this.updateP2Preview('balanced');
    }

    // Render classes buttons
    const classes: FighterClass[] = ['balanced', 'berserker', 'tank'];
    classes.forEach((cls, index) => {
      const info = FIGHTER_CLASS_INFO[cls];
      const y = 200 + index * 140;

      // Card Background
      const btnBg = this.add.rectangle(
        this.cameras.main.centerX,
        y,
        340,
        110,
        info.color
      ).setOrigin(0.5, 0.5);
      btnBg.setStrokeStyle(3, 0xffcc00);
      btnBg.setInteractive({ useHandCursor: true });
      this.characterSelectUI?.add(btnBg);

      const btnText = this.add.text(
        this.cameras.main.centerX,
        y - 25,
        FIGHTER_CLASS_NAMES[cls],
        {
          font: 'bold 26px Impact, Arial Black, sans-serif',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4,
        }
      ).setOrigin(0.5, 0.5);
      this.characterSelectUI?.add(btnText);

      const btnDesc = this.add.text(
        this.cameras.main.centerX,
        y + 8,
        info.desc,
        { font: '13px Arial', color: '#dddddd', align: 'center' }
      ).setOrigin(0.5, 0.5);
      this.characterSelectUI?.add(btnDesc);

      const btnStats = this.add.text(
        this.cameras.main.centerX,
        y + 30,
        info.stats,
        { font: 'bold 12px Courier New, monospace', color: '#ffcc00', align: 'center' }
      ).setOrigin(0.5, 0.5);
      this.characterSelectUI?.add(btnStats);

      btnBg.on('pointerover', () => {
        btnBg.setStrokeStyle(3, 0xffff00);
        btnBg.setScale(1.04);
        
        // Update previews on hover
        if (!this.p1Class) {
          this.updateP1Preview(cls);
        } else if (this.isTwoPlayer && !this.p2Class) {
          this.updateP2Preview(cls);
        }
      });

      btnBg.on('pointerout', () => {
        btnBg.setStrokeStyle(3, 0xffcc00);
        btnBg.setScale(1.0);
      });

      btnBg.on('pointerdown', () => {
        this.selectClass(cls);
      });
    });

    // Back Button
    const backBtn = this.add.rectangle(
      this.cameras.main.centerX,
      630,
      200,
      40,
      0x333333
    );
    backBtn.setStrokeStyle(1.5, 0x888888);
    backBtn.setInteractive({ useHandCursor: true });
    this.characterSelectUI.add(backBtn);

    const backText = this.add.text(
      this.cameras.main.centerX,
      630,
      'BACK',
      { font: 'bold 16px Impact, sans-serif', color: '#cccccc' }
    ).setOrigin(0.5, 0.5);
    this.characterSelectUI.add(backText);

    backBtn.on('pointerover', () => {
      backBtn.setFillStyle(0x555555);
    });
    backBtn.on('pointerout', () => {
      backBtn.setFillStyle(0x333333);
    });
    backBtn.on('pointerdown', () => {
      if (this.currentSelectionPhase === 'character') {
        if (this.pendingData.mode) {
          this.scene.start('DifficultySelectScene', this.pendingData);
        } else {
          this.scene.start('MenuScene');
        }
      } else {
        this.switchToCharacterPhase();
      }
    });
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.p1Preview) this.p1Preview.update(dt);
    if (this.p2Preview) this.p2Preview.update(dt);
  }

  private updateP1Preview(cls: FighterClass): void {
    if (this.p1Preview) {
      this.p1Preview.destroy();
    }
    const scaleMap = { balanced: 2.1, berserker: 2.22, tank: 2.45 };
    const colorMap = { balanced: 0xff4444, berserker: 0x880000, tank: 0x4a4a4a };
    
    this.p1Preview = new RiggedCharacter(this, 220, 520, 1, {
      baseColor: colorMap[cls],
      bodyScale: scaleMap[cls]
    });
    this.p1Preview.setDepth(10);
    this.add.existing(this.p1Preview);
    this.p1Preview.playAnimation('idle', 1);
  }

  private updateP2Preview(cls: FighterClass): void {
    if (this.p2Preview) {
      this.p2Preview.destroy();
    }
    const scaleMap = { balanced: 2.1, berserker: 2.22, tank: 2.45 };
    const colorMap = { balanced: 0x4444ff, berserker: 0x000088, tank: 0x444444 };
    
    this.p2Preview = new RiggedCharacter(this, 1060, 520, -1, {
      baseColor: colorMap[cls],
      bodyScale: scaleMap[cls]
    });
    this.p2Preview.setDepth(10);
    this.add.existing(this.p2Preview);
    this.p2Preview.playAnimation('idle', 1);
  }

  private selectClass(cls: FighterClass): void {
    if (!this.p1Class) {
      this.p1Class = cls;
      this.p1StatusText?.setText(`P1: READY (${FIGHTER_CLASS_NAMES[cls]})`);
      this.p1StatusText?.setColor('#00ff66');
      this.p1Preview?.playOneShot('punchRight', 1.5);

      if (this.isTwoPlayer) {
        this.p2StatusText?.setText('P2: SELECTING...');
        this.p2StatusText?.setColor('#ff6666');
        this.titleText?.setText('P2 CHOOSE YOUR FIGHTER');
      } else {
        // In 1p mode, the bot selects balanced (or matches difficulty setup)
        // Switch to stage selection
        this.switchToStagePhase();
      }
    } else if (this.isTwoPlayer && !this.p2Class) {
      this.p2Class = cls;
      this.p2StatusText?.setText(`P2: READY (${FIGHTER_CLASS_NAMES[cls]})`);
      this.p2StatusText?.setColor('#00ff66');
      this.p2Preview?.playOneShot('kickRight', 1.5);
      
      this.time.delayedCall(400, () => {
        this.switchToStagePhase();
      });
    }
  }

  private switchToStagePhase(): void {
    this.currentSelectionPhase = 'stage';
    
    // Hide Character selection components
    this.characterSelectUI?.setVisible(false);

    // Build stage select components
    const stageTitle = this.add.text(
      this.cameras.main.centerX,
      60,
      'SELECT ARENA',
      {
        font: 'bold 42px Impact, Arial Black, sans-serif',
        color: '#ffcc00',
        stroke: '#000000',
        strokeThickness: 6,
        align: 'center',
      }
    ).setOrigin(0.5, 0.5);
    this.stageSelectUI?.add(stageTitle);

    const stageSubtitle = this.add.text(
      this.cameras.main.centerX,
      115,
      'Choose the combat zone',
      { font: 'italic 16px Arial', color: '#aaaaaa', align: 'center' }
    ).setOrigin(0.5, 0.5);
    this.stageSelectUI?.add(stageSubtitle);

    // Cards layout for stages
    const cardWidth = 260;
    const cardHeight = 340;
    const startX = this.cameras.main.centerX - (cardWidth * 1.5 + 45);

    STAGES_CONFIG.forEach((stg, index) => {
      const x = startX + index * (cardWidth + 30);
      const y = 340;

      // Border and Shadow backer
      const backer = this.add.rectangle(x, y, cardWidth + 12, cardHeight + 12, stg.colorBorder, 0.4);
      backer.setStrokeStyle(3, stg.colorBorder);
      this.stageSelectUI?.add(backer);

      // Card Face
      const card = this.add.rectangle(x, y, cardWidth, cardHeight, stg.colorBg);
      card.setInteractive({ useHandCursor: true });
      this.stageSelectUI?.add(card);

      // Mini decoration representing the stage theme
      const decorGfx = this.add.graphics();
      decorGfx.fillStyle(stg.colorBorder, 0.15);
      decorGfx.fillRoundedRect(x - cardWidth/2 + 10, y - cardHeight/2 + 10, cardWidth - 20, 140, 6);
      decorGfx.lineStyle(1.5, stg.colorBorder, 0.6);
      decorGfx.strokeRoundedRect(x - cardWidth/2 + 10, y - cardHeight/2 + 10, cardWidth - 20, 140, 6);
      this.stageSelectUI?.add(decorGfx);

      // Stage Title text
      const stgTitle = this.add.text(x, y + 10, stg.name, {
        font: 'bold 22px Impact, sans-serif',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5, 0.5);
      this.stageSelectUI?.add(stgTitle);

      // Description text
      const stgDesc = this.add.text(x, y + 70, stg.desc, {
        font: '13px Arial',
        color: '#cccccc',
        align: 'center',
        wordWrap: { width: cardWidth - 30 }
      }).setOrigin(0.5, 0);
      this.stageSelectUI?.add(stgDesc);

      // Card hover effect
      card.on('pointerover', () => {
        backer.setScale(1.05);
        card.setScale(1.05);
        decorGfx.setScale(1.05);
        stgTitle.setScale(1.05);
        stgDesc.setScale(1.05);
      });

      card.on('pointerout', () => {
        backer.setScale(1.0);
        card.setScale(1.0);
        decorGfx.setScale(1.0);
        stgTitle.setScale(1.0);
        stgDesc.setScale(1.0);
      });

      card.on('pointerdown', () => {
        this.startGame(stg.id);
      });
    });

    // Stage Back Button
    const stageBackBtn = this.add.rectangle(
      this.cameras.main.centerX,
      570,
      180,
      40,
      0x333333
    );
    stageBackBtn.setStrokeStyle(1.5, 0x888888);
    stageBackBtn.setInteractive({ useHandCursor: true });
    this.stageSelectUI?.add(stageBackBtn);

    const stageBackText = this.add.text(
      this.cameras.main.centerX,
      570,
      'BACK',
      { font: 'bold 16px Impact, sans-serif', color: '#cccccc' }
    ).setOrigin(0.5, 0.5);
    this.stageSelectUI?.add(stageBackText);

    stageBackBtn.on('pointerover', () => stageBackBtn.setFillStyle(0x555555));
    stageBackBtn.on('pointerout', () => stageBackBtn.setFillStyle(0x333333));
    stageBackBtn.on('pointerdown', () => {
      this.switchToCharacterPhase();
    });
  }

  private switchToCharacterPhase(): void {
    this.currentSelectionPhase = 'character';
    
    // Clear stage UI elements
    this.stageSelectUI?.clear(true, true);
    
    // Reset selections
    this.p1Class = null;
    this.p2Class = null;
    
    this.p1StatusText?.setText('P1: SELECTING...');
    this.p1StatusText?.setColor('#ff6666');
    
    this.p2StatusText?.setText(this.isTwoPlayer ? 'P2: WAITING...' : 'BOT: BALANCED');
    this.p2StatusText?.setColor('#6666ff');
    
    this.titleText?.setText(this.isTwoPlayer ? 'P1 CHOOSE YOUR FIGHTER' : 'CHOOSE YOUR FIGHTER');
    
    // Restore Character Select UI
    this.characterSelectUI?.setVisible(true);

    this.updateP1Preview('balanced');
    this.p1Preview?.setVisible(false);
    this.updateP2Preview('balanced');
    if (this.isTwoPlayer) {
      this.p2Preview?.setVisible(false);
    }
  }

  private startGame(stageId: StageId): void {
    // Stop previews
    this.p1Preview?.destroy();
    this.p2Preview?.destroy();

    this.scene.start('FightScene', {
      ...this.pendingData,
      fighterClassP1: this.p1Class ?? 'balanced',
      fighterClassP2: this.p2Class ?? (this.isTwoPlayer ? 'balanced' : 'balanced'),
      stageId: stageId
    });
  }
}
