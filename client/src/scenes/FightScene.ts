import Phaser from 'phaser';
import { Fighter } from '@shared/game/fighter.js';
import { FighterState, FighterSide } from '@shared/game/fighter.js';
import { GAME_WIDTH, GAME_HEIGHT, GROUND_Y, ROUND_TIME, TICK_RATE } from '@shared/game/constants.js';
import { processAttack, processWallBounce, createHitbox, createHurtbox } from '@shared/game/combat.js';
import { RoundManager, RoundState } from '@shared/game/rounds.js';
import { FighterEntity } from '../entities/FighterEntity.js';
import { VFXManager } from '../systems/VFXManager.js';
import { BotFighter } from '../entities/BotFighter.js';
import { NeuralBotFighter } from '../entities/NeuralBotFighter.js';
import { ACTIONS, buildFeatureVec } from '../ai/aiController.js';
import { MatchRecorder, trainOnlineAsync } from '../lib/onlineLearning.js';
import { CRTPipeline } from '../systems/CRTPipeline.js';
import { BotDifficulty, DIFFICULTY_CONFIGS, DifficultyConfig } from './DifficultySelectScene.js';
import { FighterClass } from './CharacterSelectScene.js';
import { OnlineInputState, getSocket, sendGameInput } from '../network/socketClient.js';

export class FightScene extends Phaser.Scene {
  private player1: Fighter | null = null;
  private player2: Fighter | null = null;
  private player1Entity: FighterEntity | null = null;
  private player2Entity: FighterEntity | null = null;
  private p1Keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private p2Keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private roundManager: RoundManager = new RoundManager();
  private vfxManager: VFXManager | null = null;
  private bot: BotFighter | NeuralBotFighter | null = null;
  private isVsBot: boolean = false;
  private isNeuralBot: boolean = false;
  private neuralBot: NeuralBotFighter | null = null;
  private recorder: MatchRecorder | null = null;
  private isOnline: boolean = false;
  private onlineRoomId: string = '';
  private isHost: boolean = true;
  private remoteInput: OnlineInputState | null = null;
  private prevRemoteInput: OnlineInputState | null = null;
  private lastLocalInput: OnlineInputState | null = null;
  private socketCleanupFns: Array<() => void> = [];
  private opponentLeftText: Phaser.GameObjects.Text | null = null;
  private fighterClassP1: FighterClass = 'balanced';
  private fighterClassP2: FighterClass = 'balanced';
  private botDifficulty: BotDifficulty = 'normal';
  private botConfig: DifficultyConfig = DIFFICULTY_CONFIGS.normal;
  private stageId: string = 'neonDojo';

  // Parallax Background & Particles
  private bgDynamicGraphics: Phaser.GameObjects.Graphics | null = null;
  private stars: Array<{ x: number; y: number; size: number; phase: number; speed: number }> = [];
  private clouds: Array<{ x: number; y: number; w: number; h: number; speed: number }> = [];
  private buildings: Array<{
    x: number;
    width: number;
    height: number;
    color: number;
    windows: Array<{ x: number; y: number; lit: boolean; timer: number }>;
  }> = [];
  private neonSign: Phaser.GameObjects.Text | null = null;
  private crowd: Array<{ x: number; baseY: number; phase: number; jumpOffset: number }> = [];
  private crowdExcitement: number = 0;

  // Stage Particles
  private lavaBubbles: Array<{ x: number; y: number; r: number; speed: number; maxH: number }> = [];
  private rainDrops: Array<{ x: number; y: number; length: number; speedY: number; speedX: number }> = [];
  private rainSplashes: Array<{ x: number; y: number; r: number; maxR: number; alpha: number }> = [];
  private sakuraPetals: Array<{ x: number; y: number; sizeW: number; sizeH: number; speedY: number; speedX: number; angle: number; angleSpeed: number; phase: number }> = [];

  // HUD
  private p1HealthBar: Phaser.GameObjects.Rectangle | null = null;
  private p2HealthBar: Phaser.GameObjects.Rectangle | null = null;
  private p1PostureBar: Phaser.GameObjects.Rectangle | null = null;
  private p2PostureBar: Phaser.GameObjects.Rectangle | null = null;
  private p1MeterBar: Phaser.GameObjects.Rectangle | null = null;
  private p2MeterBar: Phaser.GameObjects.Rectangle | null = null;
  private p1SpecialText: Phaser.GameObjects.Text | null = null;
  private p2SpecialText: Phaser.GameObjects.Text | null = null;
  private p1CatchupBar: Phaser.GameObjects.Rectangle | null = null;
  private p2CatchupBar: Phaser.GameObjects.Rectangle | null = null;
  private p1ScoreStars: Phaser.GameObjects.Star[] = [];
  private p2ScoreStars: Phaser.GameObjects.Star[] = [];
  private p1ComboCount: number = 0;
  private p2ComboCount: number = 0;
  private p1ComboText: Phaser.GameObjects.Text | null = null;
  private p2ComboText: Phaser.GameObjects.Text | null = null;
  private lastCountdownInt: number = 4;
  private p1CatchupHealth: number = 100;
  private p2CatchupHealth: number = 100;
  private p1CatchupDelay: number = 0;
  private p2CatchupDelay: number = 0;
  private lastSecondTime: number = 0;

  // Debug Hitboxes/Hurtboxes
  private debugGraphics: Phaser.GameObjects.Graphics | null = null;
  private isDebugMode: boolean = false;
  private debugKey: Phaser.Input.Keyboard.Key | null = null;
  private pauseKey: Phaser.Input.Keyboard.Key | null = null;

  private timerText: Phaser.GameObjects.Text | null = null;
  private p1HealthText: Phaser.GameObjects.Text | null = null;
  private p2HealthText: Phaser.GameObjects.Text | null = null;
  private countdownText: Phaser.GameObjects.Text | null = null;
  private roundInfoText: Phaser.GameObjects.Text | null = null;
  private p1ScoreText: Phaser.GameObjects.Text | null = null;
  private p2ScoreText: Phaser.GameObjects.Text | null = null;
  private roundTransitionText: Phaser.GameObjects.Text | null = null;
  private victoryText: Phaser.GameObjects.Text | null = null;
  private victorySubText: Phaser.GameObjects.Text | null = null;
  private pauseText: Phaser.GameObjects.Text | null = null;
  private isPaused: boolean = false;


  constructor() {
    super({ key: 'FightScene' });
  }

  init(data: { mode?: string; difficulty?: BotDifficulty; fighterClassP1?: FighterClass; fighterClassP2?: FighterClass; onlineRoomId?: string; isHost?: boolean; stageId?: string }): void {
    this.isVsBot = data?.mode === 'vsBot' || data?.mode === 'arcade';
    this.isNeuralBot = data?.mode === 'arcade';
    this.isOnline = data?.mode === 'online';
    this.onlineRoomId = data?.onlineRoomId ?? '';
    this.isHost = data?.isHost ?? true;
    this.botDifficulty = data?.difficulty ?? 'normal';
    this.botConfig = DIFFICULTY_CONFIGS[this.botDifficulty];
    this.fighterClassP1 = data?.fighterClassP1 ?? 'balanced';
    this.fighterClassP2 = data?.fighterClassP2 ?? this.fighterClassP1;

    // Configuração do mapa/estágio
    this.stageId = data?.stageId ?? 'neonDojo';
    if (this.isOnline && !data?.stageId) {
      const roomId = data?.onlineRoomId ?? 'ROOM';
      const sum = roomId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const stages = ['neonDojo', 'volcanicTemple', 'cyberpunkCity', 'forestDojo'];
      this.stageId = stages[sum % stages.length];
    } else if (!data?.stageId) {
      const stages = ['neonDojo', 'volcanicTemple', 'cyberpunkCity', 'forestDojo'];
      this.stageId = stages[Math.floor(Math.random() * stages.length)];
    }

    this.roundManager.reset();
  }

  create(): void {
    if (this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      if (!this.renderer.pipelines.has(CRTPipeline.KEY)) {
        this.renderer.pipelines.addPostPipeline(CRTPipeline.KEY, CRTPipeline);
      }
      this.cameras.main.setPostPipeline(CRTPipeline);
    }

    this.vfxManager = new VFXManager(this);
    this.createArena();
    this.createFighters();

    if (this.isVsBot && this.player2 && this.player1) {
      if (this.isNeuralBot) {
        // Placeholder imediato; troca pela rede assim que os pesos chegarem.
        this.bot = new BotFighter(this.player2, this.player1, 'hard');
        const recorder = new MatchRecorder(this.player2, this.player1, () => this.time.now);
        this.recorder = recorder;
        NeuralBotFighter.load('assets/neural-bot/weights.json', this.player2, this.player1, 'arcade', {
          temperature: 0.75,
          onDecision: (feature, actionIdx) => recorder.recordBotDecision(feature, actionIdx),
        }).then((neuralBot) => {
          if (neuralBot) {
            this.bot = neuralBot;
            this.neuralBot = neuralBot;
          }
        });
      } else {
        this.bot = new BotFighter(this.player2, this.player1, this.botDifficulty, this.botConfig);
      }
      this.player2.health = this.botConfig.health;
    }

    if (this.isOnline) {
      this.setupOnline();
    }

    this.createInput();
    this.createHUD();
    this.debugGraphics = this.add.graphics();

    // Round transition overlay
    this.roundTransitionText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      "",
      { font: "bold 60px Arial", color: "#ffcc00", stroke: "#000000", strokeThickness: 8, align: "center" }
    ).setOrigin(0.5, 0.5).setVisible(false);

    // Victory overlay
    this.victoryText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY - 50,
      "",
      { font: "bold 72px Arial", color: "#ffcc00", stroke: "#000000", strokeThickness: 8, align: "center" }
    ).setOrigin(0.5, 0.5).setVisible(false);

    this.victorySubText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY + 30,
      "",
      { font: "bold 24px Arial", color: "#ffffff", stroke: "#000000", strokeThickness: 4, align: "center" }
    ).setOrigin(0.5, 0.5).setVisible(false);

    // Pause overlay
    this.pauseText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      "PAUSED",
      { font: "bold 48px Arial", color: "#ffffff", stroke: "#000000", strokeThickness: 6, align: "center" }
    ).setOrigin(0.5, 0.5).setVisible(false);

    this.startCountdown();
  }

  private createArena(): void {
    const staticBg = this.add.graphics();
    const groundHeight = GAME_HEIGHT - GROUND_Y;

    // Reinicia vetores de partículas
    this.lavaBubbles = [];
    this.rainDrops = [];
    this.rainSplashes = [];
    this.sakuraPetals = [];
    this.stars = [];
    this.clouds = [];
    this.buildings = [];
    if (this.neonSign) {
      this.neonSign.destroy();
      this.neonSign = null;
    }

    // Inicializa o Graphics Dinâmico
    this.bgDynamicGraphics = this.add.graphics();

    if (this.stageId === 'neonDojo') {
      // 1. Céu noturno com gradiente estilo dojo/arena urbana
      for (let y = 0; y < GROUND_Y; y += 4) {
        const ratio = y / GROUND_Y;
        const r = Math.floor(12 + ratio * 24);
        const g = Math.floor(10 + ratio * 15);
        const b = Math.floor(35 + ratio * 45);
        const color = (r << 16) | (g << 8) | b;
        staticBg.fillStyle(color, 1);
        staticBg.fillRect(0, y, GAME_WIDTH, 4);
      }

      // Lua e brilho no fundo
      staticBg.fillStyle(0xffffdd, 0.95);
      staticBg.fillCircle(GAME_WIDTH - 240, 120, 40);
      staticBg.fillStyle(0xffffdd, 0.12);
      staticBg.fillCircle(GAME_WIDTH - 240, 120, 65);

      // Inicializa Estrelas
      for (let i = 0; i < 45; i++) {
        this.stars.push({
          x: Math.random() * GAME_WIDTH,
          y: Math.random() * (GROUND_Y - 220),
          size: Math.random() * 2 + 1,
          phase: Math.random() * Math.PI * 2,
          speed: 1.5 + Math.random() * 3
        });
      }

      // Inicializa Nuvens
      for (let i = 0; i < 5; i++) {
        this.clouds.push({
          x: Math.random() * GAME_WIDTH,
          y: 40 + Math.random() * 110,
          w: 90 + Math.random() * 80,
          h: 25 + Math.random() * 15,
          speed: 4 + Math.random() * 8
        });
      }

      // Inicializa Skyline (Prédios detalhados com janelas)
      let bx = -20;
      while (bx < GAME_WIDTH + 50) {
        const w = 90 + Math.random() * 100;
        const h = 180 + Math.random() * 140;
        const color = 0x090d16 + Math.floor(Math.random() * 4) * 0x010101;
        
        const windows = [];
        const cols = Math.floor(w / 18) - 1;
        const rows = Math.floor(h / 24) - 2;
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            windows.push({
              x: 10 + c * 18,
              y: h - (32 + r * 24),
              lit: Math.random() > 0.65,
              timer: Math.random() * 4
            });
          }
        }
        this.buildings.push({ x: bx, width: w, height: h, color, windows });
        bx += w - 15;
      }

      // Letreiro Neon
      this.neonSign = this.add.text(GAME_WIDTH / 2, 120, 'NEON DOJO', {
        font: '900 48px Impact, Arial Black, sans-serif',
        color: '#ff0077',
        align: 'center',
        stroke: '#ff0077',
        strokeThickness: 3
      }).setOrigin(0.5, 0.5);
      this.neonSign.setShadow(0, 0, '#ff0077', 20, true, true);

      // Solo do ringue (estático)
      staticBg.fillStyle(0x131924, 1);
      staticBg.fillRect(0, GROUND_Y, GAME_WIDTH, groundHeight);

      // Placa do solo com padrão de tablado
      staticBg.fillStyle(0x1a2333, 1);
      for (let x = 0; x < GAME_WIDTH; x += 80) {
        staticBg.fillRect(x, GROUND_Y, 2, groundHeight);
      }

      // Refletores de arena nas laterais (estáticos)
      staticBg.fillStyle(0x232d3d, 1);
      staticBg.fillRect(60, GROUND_Y - 260, 12, 260);
      staticBg.fillRect(GAME_WIDTH - 72, GROUND_Y - 260, 12, 260);

      // Holofotes de luz brilhante
      staticBg.fillStyle(0xffd700, 0.12);
      staticBg.fillTriangle(66, GROUND_Y - 250, 0, GROUND_Y, 200, GROUND_Y);
      staticBg.fillTriangle(GAME_WIDTH - 66, GROUND_Y - 250, GAME_WIDTH - 200, GROUND_Y, GAME_WIDTH, GROUND_Y);

      // Bordas neon amarela/ciano do ringue tatami
      staticBg.fillStyle(0x00ffff, 0.8);
      staticBg.fillRect(0, GROUND_Y - 2, GAME_WIDTH, 4);

    } else if (this.stageId === 'volcanicTemple') {
      // Céu vermelho escuro / gradiente de fumaça
      for (let y = 0; y < GROUND_Y; y += 4) {
        const ratio = y / GROUND_Y;
        const r = Math.floor(35 - ratio * 15);
        const g = Math.floor(5 + ratio * 10);
        const b = Math.floor(2 + ratio * 2);
        const color = (r << 16) | (g << 8) | b;
        staticBg.fillStyle(color, 1);
        staticBg.fillRect(0, y, GAME_WIDTH, 4);
      }

      // Montanhas vulcânicas ao fundo
      staticBg.fillStyle(0x0e0604, 1);
      staticBg.beginPath();
      staticBg.moveTo(-50, GROUND_Y);
      staticBg.lineTo(250, GROUND_Y - 250);
      staticBg.lineTo(350, GROUND_Y - 220);
      staticBg.lineTo(550, GROUND_Y - 320);
      staticBg.lineTo(750, GROUND_Y - 140);
      staticBg.lineTo(950, GROUND_Y - 280);
      staticBg.lineTo(1200, GROUND_Y - 180);
      staticBg.lineTo(GAME_WIDTH + 50, GROUND_Y);
      staticBg.closePath();
      staticBg.fillPath();

      // Linhas de lava brilhando nas encostas
      staticBg.lineStyle(3, 0xff3300, 0.85);
      staticBg.lineBetween(550, GROUND_Y - 320, 520, GROUND_Y - 200);
      staticBg.lineBetween(520, GROUND_Y - 200, 560, GROUND_Y - 100);
      staticBg.lineBetween(250, GROUND_Y - 250, 290, GROUND_Y - 140);

      // Pilares de pedra antigos
      staticBg.fillStyle(0x19100e, 1);
      staticBg.fillRect(120, GROUND_Y - 340, 45, 340);
      staticBg.fillRect(100, GROUND_Y - 355, 85, 15);
      staticBg.fillRect(110, GROUND_Y - 20, 65, 20);

      staticBg.fillRect(GAME_WIDTH - 165, GROUND_Y - 340, 45, 340);
      staticBg.fillRect(GAME_WIDTH - 185, GROUND_Y - 355, 85, 15);
      staticBg.fillRect(GAME_WIDTH - 175, GROUND_Y - 20, 65, 20);

      // Chão de rocha basáltica
      staticBg.fillStyle(0x1f1917, 1);
      staticBg.fillRect(0, GROUND_Y, GAME_WIDTH, groundHeight);

      // Rachaduras de magma no chão
      staticBg.fillStyle(0xcc2200, 0.95);
      for (let x = 0; x < GAME_WIDTH; x += 120) {
        staticBg.fillRect(x + 20, GROUND_Y + 15, 75, 10);
      }

      // Inicializa cinzas vulcânicas flutuando
      for (let i = 0; i < 40; i++) {
        this.stars.push({
          x: Math.random() * GAME_WIDTH,
          y: Math.random() * GROUND_Y,
          size: Math.random() * 3 + 1.5,
          phase: Math.random() * Math.PI * 2,
          speed: 40 + Math.random() * 60
        });
      }

      // Inicializa bolhas de lava no chão
      for (let i = 0; i < 8; i++) {
        this.lavaBubbles.push({
          x: 100 + Math.random() * (GAME_WIDTH - 200),
          y: GROUND_Y + 15,
          r: Math.random() * 3 + 2,
          speed: Math.random() * 10 + 5,
          maxH: GROUND_Y + 5 - Math.random() * 12
        });
      }

    } else if (this.stageId === 'cyberpunkCity') {
      // Céu escuro de tempestade cian/azul
      for (let y = 0; y < GROUND_Y; y += 4) {
        const ratio = y / GROUND_Y;
        const r = Math.floor(5 + ratio * 8);
        const g = Math.floor(8 + ratio * 15);
        const b = Math.floor(18 + ratio * 20);
        const color = (r << 16) | (g << 8) | b;
        staticBg.fillStyle(color, 1);
        staticBg.fillRect(0, y, GAME_WIDTH, 4);
      }

      // Silhueta de arranha-céus cinza-escuro com propagandas
      staticBg.fillStyle(0x0b101d, 1);
      staticBg.fillRect(80, GROUND_Y - 420, 180, 420);
      staticBg.fillRect(360, GROUND_Y - 320, 160, 320);
      staticBg.fillRect(820, GROUND_Y - 380, 220, 380);
      staticBg.fillRect(GAME_WIDTH - 200, GROUND_Y - 460, 180, 460);

      // Chão metálico com rebites
      staticBg.fillStyle(0x23272d, 1);
      staticBg.fillRect(0, GROUND_Y, GAME_WIDTH, groundHeight);
      
      staticBg.fillStyle(0x191c20, 1);
      for (let x = 0; x < GAME_WIDTH; x += 160) {
        staticBg.fillRect(x, GROUND_Y, 4, groundHeight);
        for (let ry = GROUND_Y + 10; ry < GAME_HEIGHT; ry += 15) {
          staticBg.fillCircle(x + 12, ry, 2);
          staticBg.fillCircle(x - 8, ry, 2);
        }
      }
      staticBg.fillRect(0, GROUND_Y + 30, GAME_WIDTH, 3);

      // Inicializa chuva
      for (let i = 0; i < 90; i++) {
        this.rainDrops.push({
          x: Math.random() * GAME_WIDTH,
          y: Math.random() * GAME_HEIGHT,
          length: Math.random() * 25 + 15,
          speedY: 700 + Math.random() * 300,
          speedX: -80 - Math.random() * 40
        });
      }

      // Inicializa nuvens
      for (let i = 0; i < 6; i++) {
        this.clouds.push({
          x: Math.random() * GAME_WIDTH,
          y: 30 + Math.random() * 120,
          w: 120 + Math.random() * 100,
          h: 30 + Math.random() * 20,
          speed: 8 + Math.random() * 12
        });
      }

    } else if (this.stageId === 'forestDojo') {
      // Céu do pôr-do-sol de violeta a laranja
      for (let y = 0; y < GROUND_Y; y += 4) {
        const ratio = y / GROUND_Y;
        const r = Math.floor(45 + ratio * 160);
        const g = Math.floor(15 + ratio * 65);
        const b = Math.floor(55 - ratio * 15);
        const color = (r << 16) | (g << 8) | b;
        staticBg.fillStyle(color, 1);
        staticBg.fillRect(0, y, GAME_WIDTH, 4);
      }

      // Sol poente vermelho
      staticBg.fillStyle(0xcc3300, 0.85);
      staticBg.fillCircle(380, GROUND_Y - 90, 110);
      staticBg.fillStyle(0xffaa00, 0.25);
      staticBg.fillCircle(380, GROUND_Y - 90, 135);

      // Montanhas distantes silhueta
      staticBg.fillStyle(0x2d1729, 1);
      staticBg.beginPath();
      staticBg.moveTo(-50, GROUND_Y);
      staticBg.lineTo(150, GROUND_Y - 140);
      staticBg.lineTo(380, GROUND_Y - 90);
      staticBg.lineTo(650, GROUND_Y - 180);
      staticBg.lineTo(900, GROUND_Y - 120);
      staticBg.lineTo(GAME_WIDTH + 50, GROUND_Y);
      staticBg.closePath();
      staticBg.fillPath();

      // Cerca de bambu
      staticBg.fillStyle(0x190c17, 1);
      for (let x = 30; x < GAME_WIDTH; x += 110) {
        staticBg.fillRect(x, GROUND_Y - 80, 8, 80);
        staticBg.fillRect(x - 20, GROUND_Y - 60, 50, 4);
        staticBg.fillRect(x - 20, GROUND_Y - 30, 50, 4);
      }

      // Árvores silhueta
      staticBg.fillStyle(0x150913, 1);
      staticBg.beginPath();
      staticBg.moveTo(-30, GROUND_Y);
      staticBg.lineTo(40, GROUND_Y - 260);
      staticBg.lineTo(110, GROUND_Y);
      staticBg.closePath();
      staticBg.fillPath();

      staticBg.beginPath();
      staticBg.moveTo(50, GROUND_Y);
      staticBg.lineTo(120, GROUND_Y - 200);
      staticBg.lineTo(210, GROUND_Y);
      staticBg.closePath();
      staticBg.fillPath();

      staticBg.beginPath();
      staticBg.moveTo(GAME_WIDTH - 180, GROUND_Y);
      staticBg.lineTo(GAME_WIDTH - 90, GROUND_Y - 240);
      staticBg.lineTo(GAME_WIDTH + 20, GROUND_Y);
      staticBg.closePath();
      staticBg.fillPath();

      // Chão de tablado de madeira
      staticBg.fillStyle(0x352125, 1);
      staticBg.fillRect(0, GROUND_Y, GAME_WIDTH, groundHeight);
      
      staticBg.fillStyle(0x28191c, 1);
      for (let y = GROUND_Y; y < GAME_HEIGHT; y += 12) {
        staticBg.fillRect(0, y, GAME_WIDTH, 2);
      }

      // Inicializa pétalas de sakura
      for (let i = 0; i < 30; i++) {
        this.sakuraPetals.push({
          x: Math.random() * GAME_WIDTH,
          y: Math.random() * GROUND_Y,
          sizeW: Math.random() * 5 + 4,
          sizeH: Math.random() * 3 + 2,
          speedY: 45 + Math.random() * 35,
          speedX: -25 - Math.random() * 25,
          angle: Math.random() * Math.PI,
          angleSpeed: Math.random() * 1.5 + 0.5,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    // Inicializa Plateia
    this.crowd = [];
    for (let x = 20; x < GAME_WIDTH; x += 36) {
      this.crowd.push({
        x: x + (Math.random() - 0.5) * 8,
        baseY: GROUND_Y,
        phase: Math.random() * Math.PI * 2,
        jumpOffset: 0
      });
    }
    this.crowdExcitement = 0;

    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  private createFighters(): void {
    this.player1 = new Fighter('p1', FighterSide.LEFT, 550, GROUND_Y, this.fighterClassP1);
    this.player2 = new Fighter('p2', FighterSide.RIGHT, 650, GROUND_Y, this.fighterClassP2);

    this.player1Entity = new FighterEntity(this, this.player1, 0xff4444);
    this.player2Entity = new FighterEntity(this, this.player2, 0x4444ff);

    this.add.existing(this.player1Entity);
    this.add.existing(this.player2Entity);
  }

  private createInput(): void {
    const kb = this.input.keyboard!;
    this.p1Keys = {
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      lightPunch: kb.addKey(Phaser.Input.Keyboard.KeyCodes.U),
      heavyPunch: kb.addKey(Phaser.Input.Keyboard.KeyCodes.I),
      lightKick: kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      heavyKick: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      block: kb.addKey(Phaser.Input.Keyboard.KeyCodes.L),
      exLight: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Y),
      exHeavy: kb.addKey(Phaser.Input.Keyboard.KeyCodes.O),
      airDash: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      tech: kb.addKey(Phaser.Input.Keyboard.KeyCodes.T),
      reversal: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      wakeUp: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
    };

    this.p2Keys = {
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      lightPunch: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE),
      heavyPunch: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO),
      lightKick: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE),
      heavyKick: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR),
      block: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO),
      exLight: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_FIVE),
      exHeavy: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_SIX),
      airDash: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_SEVEN),
      tech: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_EIGHT),
      reversal: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_NINE),
      wakeUp: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
    };

    this.debugKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.H);
    this.pauseKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  private createHUD(): void {
    // 1. Cronômetro digital com fundo preto semitransparente e moldura dourada
    const timerBg = this.add.rectangle(GAME_WIDTH / 2, 44, 90, 56, 0x0b111e, 0.85);
    timerBg.setStrokeStyle(3, 0xd9b64a);

    this.timerText = this.add.text(
      GAME_WIDTH / 2,
      44,
      `${Math.ceil(this.roundManager.timer)}`,
      { font: 'bold 38px Courier New, monospace', color: '#ffd700', align: 'center' }
    ).setOrigin(0.5, 0.5);

    // 2. Nomes dos Jogadores com efeitos de sombra e fonte arcade
    const p1Label = this.add.text(50, 4, 'PLAYER 1', {
      font: '900 18px Impact, Arial Black, sans-serif',
      color: '#ff3333',
      stroke: '#000000',
      strokeThickness: 3
    });
    p1Label.setShadow(0, 0, '#ff3333', 10, true, true);

    const p2LabelText = this.isVsBot ? 'BOT' : (this.isOnline ? 'OPPONENT' : 'PLAYER 2');
    const p2Label = this.add.text(GAME_WIDTH - 50, 4, p2LabelText, {
      font: '900 18px Impact, Arial Black, sans-serif',
      color: '#3388ff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(1, 0);
    p2Label.setShadow(0, 0, '#3388ff', 10, true, true);

    // 3. Barra de Vida Player 1 (Esquerda para Direita)
    const barWidth = 470;
    const barHeight = 24;

    // Moldura metálica P1 HP
    const p1HealthBorder = this.add.graphics();
    p1HealthBorder.lineStyle(3, 0xd9b64a, 0.85);
    p1HealthBorder.fillStyle(0x0e1118, 1);
    p1HealthBorder.fillRoundedRect(46, 26, barWidth + 8, barHeight + 8, 4);
    p1HealthBorder.strokeRoundedRect(46, 26, barWidth + 8, barHeight + 8, 4);

    const p1BarBg = this.add.rectangle(50, 30, barWidth, barHeight, 0x222222).setOrigin(0, 0);
    this.p1CatchupBar = this.add.rectangle(50, 30, barWidth, barHeight, 0xcc2222).setOrigin(0, 0);
    this.p1HealthBar = this.add.rectangle(50, 30, barWidth, barHeight, 0x00ff66).setOrigin(0, 0);

    // 4. Barra de Vida Player 2 (Direita para Esquerda)
    // Moldura metálica P2 HP
    const p2HealthBorder = this.add.graphics();
    p2HealthBorder.lineStyle(3, 0xd9b64a, 0.85);
    p2HealthBorder.fillStyle(0x0e1118, 1);
    p2HealthBorder.fillRoundedRect(GAME_WIDTH - 50 - barWidth - 4, 26, barWidth + 8, barHeight + 8, 4);
    p2HealthBorder.strokeRoundedRect(GAME_WIDTH - 50 - barWidth - 4, 26, barWidth + 8, barHeight + 8, 4);

    const p2BarBg = this.add.rectangle(GAME_WIDTH - 50, 30, barWidth, barHeight, 0x222222).setOrigin(1, 0);
    this.p2CatchupBar = this.add.rectangle(GAME_WIDTH - 50, 30, barWidth, barHeight, 0xcc2222).setOrigin(1, 0);
    this.p2HealthBar = this.add.rectangle(GAME_WIDTH - 50, 30, barWidth, barHeight, 0x00ff66).setOrigin(1, 0);

    // 4b. Sub-molduras para Postura e Super
    const postWidth = 470;
    const postHeight = 8;

    const p1SubBorder = this.add.graphics();
    p1SubBorder.lineStyle(1.5, 0x4c515d, 0.6);
    p1SubBorder.fillStyle(0x0e1118, 0.95);
    p1SubBorder.fillRoundedRect(47, 59, postWidth + 6, 23, 2);
    p1SubBorder.strokeRoundedRect(47, 59, postWidth + 6, 23, 2);

    const p2SubBorder = this.add.graphics();
    p2SubBorder.lineStyle(1.5, 0x4c515d, 0.6);
    p2SubBorder.fillStyle(0x0e1118, 0.95);
    p2SubBorder.fillRoundedRect(GAME_WIDTH - 50 - postWidth - 3, 59, postWidth + 6, 23, 2);
    p2SubBorder.strokeRoundedRect(GAME_WIDTH - 50 - postWidth - 3, 59, postWidth + 6, 23, 2);

    // Barras de Postura
    this.p1PostureBar = this.add.rectangle(50, 62, postWidth, postHeight, 0xffcc00).setOrigin(0, 0);
    this.p2PostureBar = this.add.rectangle(GAME_WIDTH - 50, 62, postWidth, postHeight, 0xffcc00).setOrigin(1, 0);

    // Barras de Super
    this.p1MeterBar = this.add.rectangle(50, 73, postWidth, 6, 0x00bbff).setOrigin(0, 0);
    this.p2MeterBar = this.add.rectangle(GAME_WIDTH - 50, 73, postWidth, 6, 0x00bbff).setOrigin(1, 0);

    // 5. Estrelas de Vitória
    this.p1ScoreStars = [];
    for (let i = 0; i < 3; i++) {
      const star = this.add.star(60 + i * 24, 94, 5, 6, 11, 0x333333);
      this.p1ScoreStars.push(star);
    }

    this.p2ScoreStars = [];
    for (let i = 0; i < 3; i++) {
      const star = this.add.star(GAME_WIDTH - 60 - i * 24, 94, 5, 6, 11, 0x333333);
      this.p2ScoreStars.push(star);
    }

    // 5b. Indicador do especial (MORTAL)
    this.p1SpecialText = this.add.text(50, 108, '', { font: '900 13px Arial', color: '#ffcc00' });
    this.p2SpecialText = this.add.text(GAME_WIDTH - 50, 108, '', { font: '900 13px Arial', color: '#ffcc00' }).setOrigin(1, 0);

    // 6. Contador de Combos
    this.p1ComboText = this.add.text(120, 125, '', {
      font: 'italic 900 44px Impact, Arial Black',
      color: '#ffcc00',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5, 0.5).setVisible(false);

    this.p2ComboText = this.add.text(GAME_WIDTH - 120, 125, '', {
      font: 'italic 900 44px Impact, Arial Black',
      color: '#ffcc00',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5, 0.5).setVisible(false);

    // 7. Texto do Anunciador
    this.countdownText = this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 - 40,
      '',
      { font: '900 80px Impact, Arial Black', color: '#ffcc00', stroke: '#000000', strokeThickness: 10, align: 'center' }
    ).setOrigin(0.5, 0.5).setVisible(false);
  }

  private startCountdown(): void {
    this.roundManager.startRound();
    this.lastCountdownInt = 4;
    
    // Reset combo counters
    this.p1ComboCount = 0;
    this.p2ComboCount = 0;
    this.p1ComboText?.setVisible(false);
    this.p2ComboText?.setVisible(false);

    // Reset health catchup
    if (this.player1 && this.player2) {
      this.p1CatchupHealth = this.player1.health;
      this.p2CatchupHealth = this.player2.health;
      this.p1CatchupBar?.setScale(this.p1CatchupHealth / (this.player1?.maxHealth ?? 100), 1);
      this.p2CatchupBar?.setScale(this.p2CatchupHealth / (this.player2?.maxHealth ?? 100), 1);
    }
  }

  private drawDynamicBackground(time: number, dt: number): void {
    const g = this.bgDynamicGraphics;
    if (!g) return;
    g.clear();

    if (this.stageId === 'neonDojo') {
      // 1. Estrelas piscando
      for (const star of this.stars) {
        const alpha = 0.4 + Math.sin(time * 0.002 * star.speed + star.phase) * 0.4;
        g.fillStyle(0xffffff, alpha);
        g.fillRect(star.x, star.y, star.size, star.size);
      }

      // 2. Nuvens flutuando com velocidade horizontal
      g.fillStyle(0xffffff, 0.06);
      for (const cloud of this.clouds) {
        cloud.x += cloud.speed * dt;
        if (cloud.x > GAME_WIDTH + cloud.w) {
          cloud.x = -cloud.w;
        }
        g.fillRoundedRect(cloud.x, cloud.y, cloud.w, cloud.h, cloud.h / 2);
      }

      // 3. Silhuetas urbanas (skyline) e janelas piscando
      for (const b of this.buildings) {
        g.fillStyle(b.color, 1);
        g.fillRect(b.x, GROUND_Y - b.height, b.width, b.height);

        // Renderiza as janelas do predio
        for (const w of b.windows) {
          w.timer -= dt;
          if (w.timer <= 0) {
            w.lit = Math.random() > 0.7;
            w.timer = 1 + Math.random() * 5;
          }
          if (w.lit) {
            g.fillStyle(0xffd700, 0.7); // Janela amarela acesa
            g.fillRect(b.x + w.x, GROUND_Y - b.height + w.y, 4, 6);
          }
        }
      }

      // 4. Letreiro Neon Flicker
      if (this.neonSign) {
        const r = Math.random();
        if (r < 0.04) {
          this.neonSign.setAlpha(0.15);
        } else if (r < 0.12) {
          this.neonSign.setAlpha(0.65);
        } else {
          this.neonSign.setAlpha(0.95 + Math.sin(time * 0.04) * 0.05);
        }
      }

    } else if (this.stageId === 'volcanicTemple') {
      // 1. Cinzas flutuando para cima
      for (const cinder of this.stars) {
        cinder.y -= cinder.speed * dt;
        cinder.x += Math.sin(time * 0.003 + cinder.phase) * 1.5;

        if (cinder.y < -10) {
          cinder.y = GROUND_Y;
          cinder.x = Math.random() * GAME_WIDTH;
        }
        
        const alpha = 0.5 + Math.sin(time * 0.005 + cinder.phase) * 0.35;
        g.fillStyle(0xff5500, alpha);
        g.fillRect(cinder.x, cinder.y, cinder.size, cinder.size);
      }

      // 2. Bolhas de lava borbulhando
      for (const bubble of this.lavaBubbles) {
        bubble.y -= bubble.speed * dt;
        if (bubble.y <= bubble.maxH) {
          g.fillStyle(0xffaa00, 0.85);
          g.fillCircle(bubble.x, bubble.y, bubble.r * 1.7);
          
          bubble.x = 100 + Math.random() * (GAME_WIDTH - 200);
          bubble.y = GROUND_Y + 15;
          bubble.r = Math.random() * 3 + 2;
          bubble.speed = Math.random() * 12 + 6;
          bubble.maxH = GROUND_Y + 5 - Math.random() * 12;
        } else {
          g.fillStyle(0xff2200, 0.9);
          g.fillCircle(bubble.x, bubble.y, bubble.r);
          g.fillStyle(0xffd700, 0.95);
          g.fillCircle(bubble.x, bubble.y, bubble.r * 0.45);
        }
      }

    } else if (this.stageId === 'cyberpunkCity') {
      // 1. Nuvens sob tempestade
      g.fillStyle(0xffffff, 0.03);
      for (const cloud of this.clouds) {
        cloud.x += cloud.speed * dt;
        if (cloud.x > GAME_WIDTH + cloud.w) {
          cloud.x = -cloud.w;
        }
        g.fillRoundedRect(cloud.x, cloud.y, cloud.w, cloud.h, cloud.h / 2);
      }

      // 2. Outdoors piscando
      const p1Color = (Math.random() > 0.05) ? 0xff0055 : 0x330011;
      const p2Color = (Math.random() > 0.08) ? 0x00ffff : 0x003333;
      g.fillStyle(p1Color, 0.4);
      g.fillRect(100, GROUND_Y - 380, 140, 80);
      g.fillStyle(p2Color, 0.4);
      g.fillRect(860, GROUND_Y - 340, 140, 160);

      // 3. Pingos de chuva caindo rápidos e inclinados
      g.lineStyle(1.5, 0x88aaff, 0.4);
      for (const drop of this.rainDrops) {
        drop.x += drop.speedX * dt;
        drop.y += drop.speedY * dt;

        if (drop.y > GROUND_Y) {
          this.rainSplashes.push({
            x: drop.x,
            y: GROUND_Y + Math.random() * (GAME_HEIGHT - GROUND_Y),
            r: 2,
            maxR: Math.random() * 6 + 4,
            alpha: 0.65
          });
          drop.x = Math.random() * GAME_WIDTH;
          drop.y = -20;
        } else {
          g.beginPath();
          g.moveTo(drop.x, drop.y);
          g.lineTo(drop.x + drop.speedX * 0.015, drop.y + drop.speedY * 0.015);
          g.strokePath();
        }
      }

      // 4. Respingos no chão metálico
      for (let i = this.rainSplashes.length - 1; i >= 0; i--) {
        const splash = this.rainSplashes[i];
        splash.r += dt * 32;
        splash.alpha -= dt * 3.8;
        if (splash.alpha <= 0) {
          this.rainSplashes.splice(i, 1);
        } else {
          g.lineStyle(1.0, 0xaaccff, splash.alpha);
          g.strokeEllipse(splash.x, splash.y, splash.r, splash.r * 0.3);
        }
      }

    } else if (this.stageId === 'forestDojo') {
      // Pétalas de Sakura flutuando e oscilando
      for (const petal of this.sakuraPetals) {
        petal.y += petal.speedY * dt;
        petal.x += (petal.speedX + Math.sin(time * 0.0025 + petal.phase) * 16) * dt;
        petal.angle += petal.angleSpeed * dt;

        if (petal.y > GROUND_Y + 40 || petal.x < -10) {
          petal.y = -10;
          petal.x = Math.random() * (GAME_WIDTH + 80);
          petal.angle = Math.random() * Math.PI;
        }

        g.fillStyle(0xffb7c5, 0.8);
        g.beginPath();
        const cx = petal.x;
        const cy = petal.y;
        const w = petal.sizeW;
        const h = petal.sizeH;
        const cos = Math.cos(petal.angle);
        const sin = Math.sin(petal.angle);

        const x1 = cx - w/2 * cos - h/2 * sin;
        const y1 = cy - w/2 * sin + h/2 * cos;
        const x2 = cx + w/2 * cos - h/2 * sin;
        const y2 = cy + w/2 * sin + h/2 * cos;
        const x3 = cx + w/2 * cos + h/2 * sin;
        const y3 = cy + w/2 * sin - h/2 * cos;
        const x4 = cx - w/2 * cos + h/2 * sin;
        const y4 = cy - w/2 * sin - h/2 * cos;

        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.lineTo(x3, y3);
        g.lineTo(x4, y4);
        g.closePath();
        g.fillPath();
      }
    }

    // 5. Plateia silhueta pulando
    this.crowdExcitement = Math.max(0, this.crowdExcitement - dt * 2.2);

    let crowdColor = 0x0a0f1d;
    if (this.stageId === 'volcanicTemple') crowdColor = 0x120a08;
    else if (this.stageId === 'cyberpunkCity') crowdColor = 0x090c12;
    else if (this.stageId === 'forestDojo') crowdColor = 0x180d15;

    g.fillStyle(crowdColor, 1);
    for (const person of this.crowd) {
      const normalHop = Math.max(0, Math.sin(time * 0.008 + person.phase) * 6);
      const excitedHop = this.crowdExcitement * (22 + Math.sin(time * 0.02 + person.phase) * 12);
      const hop = normalHop + excitedHop;

      const y = person.baseY - hop;

      g.fillCircle(person.x, y - 18, 6);
      g.beginPath();
      g.moveTo(person.x - 12, y);
      g.lineTo(person.x + 12, y);
      g.lineTo(person.x + 8, y - 12);
      g.lineTo(person.x - 8, y - 12);
      g.closePath();
      g.fillPath();
    }
  }

  private drawBox(fighter: Fighter | null, color: number, isHitbox: boolean): void {
    if (!fighter || !this.debugGraphics) return;
    const box = isHitbox ? createHitbox(fighter) : createHurtbox(fighter);
    if (!box) return;

    this.debugGraphics.fillStyle(color, 0.3);
    this.debugGraphics.lineStyle(1.5, color, 1);
    this.debugGraphics.fillRect(box.x, box.y, box.width, box.height);
    this.debugGraphics.strokeRect(box.x, box.y, box.width, box.height);
  }

  private showCountdownText(textStr: string): void {
    if (!this.countdownText) return;
    this.countdownText.setText(textStr);
    this.countdownText.setVisible(true);
    this.countdownText.setScale(0);
    this.countdownText.setAlpha(0);

    // Cor do anunciador: dourado para Rounds, vermelho para FIGHT!
    if (textStr === 'FIGHT!') {
      this.countdownText.setColor('#ff3333');
    } else {
      this.countdownText.setColor('#ffcc00');
    }

    this.tweens.killTweensOf(this.countdownText);

    this.tweens.add({
      targets: this.countdownText,
      scale: 1.25,
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(450, () => {
          this.tweens.add({
            targets: this.countdownText,
            scale: 2.0,
            alpha: 0,
            duration: 200,
            ease: 'Quad.easeIn'
          });
        });
      }
    });
  }

  private showKOText(textStr: string): void {
    if (!this.countdownText) return;
    this.countdownText.setText(textStr);
    this.countdownText.setVisible(true);
    this.countdownText.setScale(0);
    this.countdownText.setAlpha(0);
    this.countdownText.setColor('#ff1111');

    this.tweens.killTweensOf(this.countdownText);

    this.tweens.add({
      targets: this.countdownText,
      scale: 1.4,
      alpha: 1,
      duration: 600,
      ease: 'Bounce.easeOut'
    });
  }

  private showComboText(playerNum: number, hits: number): void {
    const text = playerNum === 1 ? this.p1ComboText : this.p2ComboText;
    if (!text) return;

    text.setText(`${hits} HITS!`);
    text.setVisible(true);
    text.setAlpha(1);
    text.setScale(1.5);

    this.tweens.killTweensOf(text);

    this.tweens.add({
      targets: text,
      scaleX: 1.0,
      scaleY: 1.0,
      duration: 150,
      ease: 'Back.easeOut'
    });
  }

  private fadeComboText(playerNum: number): void {
    const text = playerNum === 1 ? this.p1ComboText : this.p2ComboText;
    if (!text || !text.visible || text.alpha === 0) return;

    this.tweens.add({
      targets: text,
      alpha: 0,
      scale: 0.8,
      duration: 250,
      onComplete: () => {
        text.setVisible(false);
        text.setAlpha(1);
      }
    });
  }

  private handleCombo(attackerNum: number, hitResult: any): void {
    if (hitResult.wasBlocked || hitResult.wasPerfectBlock) {
      if (attackerNum === 1) this.p1ComboCount = 0;
      else this.p2ComboCount = 0;
      return;
    }

    if (attackerNum === 1) {
      this.p1ComboCount++;
      if (this.p1ComboCount > 1) {
        this.showComboText(1, this.p1ComboCount);
      }
    } else {
      this.p2ComboCount++;
      if (this.p2ComboCount > 1) {
        this.showComboText(2, this.p2ComboCount);
      }
    }
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    this.drawDynamicBackground(time, dt);

    // Toggle Debug Mode (tecla H)
    if (this.debugKey && Phaser.Input.Keyboard.JustDown(this.debugKey)) {
      this.isDebugMode = !this.isDebugMode;
    }

    // Pause toggle (ESC) - sem travar a cena para poder despausar
    if (this.pauseKey && Phaser.Input.Keyboard.JustDown(this.pauseKey)) {
      this.isPaused = !this.isPaused;
      this.pauseText?.setVisible(this.isPaused);
    }

    if (this.isPaused) return;

    // Desenhar Hitbox/Hurtbox em modo Debug
    if (this.debugGraphics) {
      this.debugGraphics.clear();
      if (this.isDebugMode) {
        this.drawBox(this.player1, 0x00ff00, false);
        this.drawBox(this.player2, 0x00ff00, false);
        this.drawBox(this.player1, 0xff0000, true);
        this.drawBox(this.player2, 0xff0000, true);
      }
    }

    // Drenar barras de dano fantasma (catchup)
    if (this.p1CatchupDelay > 0) {
      this.p1CatchupDelay -= dt;
    } else if (this.p1CatchupHealth > (this.player1?.health ?? 0)) {
      this.p1CatchupHealth = Math.max(this.player1?.health ?? 0, this.p1CatchupHealth - dt * 35);
      this.p1CatchupBar?.setScale(this.p1CatchupHealth / (this.player1?.maxHealth ?? 100), 1);
    }

    if (this.p2CatchupDelay > 0) {
      this.p2CatchupDelay -= dt;
    } else if (this.p2CatchupHealth > (this.player2?.health ?? 0)) {
      this.p2CatchupHealth = Math.max(this.player2?.health ?? 0, this.p2CatchupHealth - dt * 35);
      this.p2CatchupBar?.setScale(this.p2CatchupHealth / (this.player2?.maxHealth ?? 100), 1);
    }

    // Resetar combos se o lutador sair do hitstun
    if (this.player1 && this.player1.state !== FighterState.HITSTUN && this.p2ComboCount > 0) {
      this.fadeComboText(2);
      this.p2ComboCount = 0;
    }
    if (this.player2 && this.player2.state !== FighterState.HITSTUN && this.p1ComboCount > 0) {
      this.fadeComboText(1);
      this.p1ComboCount = 0;
    }

    // Timer pulsing effect
    const curSecond = Math.ceil(this.roundManager.timer);
    if (curSecond !== this.lastSecondTime && this.roundManager.state === RoundState.FIGHTING) {
      this.lastSecondTime = curSecond;
      this.timerText?.setScale(1.3);
      this.tweens.add({
        targets: this.timerText,
        scale: 1.0,
        duration: 200,
        ease: 'Quad.easeOut'
      });
    }

    this.roundManager.update(dt);

    if (this.roundManager.state === RoundState.COUNTDOWN) {
      const val = Math.ceil(this.roundManager.countdownValue);
      if (val !== this.lastCountdownInt) {
        this.lastCountdownInt = val;
        let txt = '';
        if (val === 3) {
          txt = this.roundManager.isLastRound ? 'FINAL ROUND' : `ROUND ${this.roundManager.roundNumber}`;
        } else if (val > 0) {
          txt = String(val);
        } else {
          txt = 'FIGHT!';
        }
        this.showCountdownText(txt);
      }
      return;
    }

    if (this.roundManager.state === RoundState.FIGHTING) {
      this.processInput();
      if (this.isVsBot && this.bot) {
        this.bot.update(dt);
      }
      this.updateFighters(dt);
      this.checkCollisions();
      this.updateHUD();
      this.checkRoundEnd();
    }
  }

  private processInput(): void {
    if (!this.player1 || !this.player2) return;

    if (this.isOnline) {
      this.processOnlineInput();
      return;
    }

    const p1 = this.player1;

    // Movimentação P1 (A/D ou Seta Esquerda/Direita no modo vsBot)
    if (this.p1Keys.left?.isDown || (this.isVsBot && this.p2Keys.left?.isDown)) {
      p1.moveLeft(1 / TICK_RATE);
    } else if (this.p1Keys.right?.isDown || (this.isVsBot && this.p2Keys.right?.isDown)) {
      p1.moveRight(1 / TICK_RATE);
    } else {
      p1.stopHorizontal();
    }

    // Pulo & Agachamento
    if (this.p1Keys.up?.isDown || (this.isVsBot && this.p2Keys.up?.isDown)) {
      p1.jump();
    }
    if (this.p1Keys.down?.isDown || (this.isVsBot && this.p2Keys.down?.isDown)) {
      p1.crouchStart();
    } else {
      p1.crouchEnd();
    }

    // Ataques P1 (U, I, J, K ou Numpad 1, 2, 3, 4 no modo vsBot)
    const lp = Phaser.Input.Keyboard.JustDown(this.p1Keys.lightPunch!) || (this.isVsBot && this.p2Keys.lightPunch && Phaser.Input.Keyboard.JustDown(this.p2Keys.lightPunch));
    const hp = Phaser.Input.Keyboard.JustDown(this.p1Keys.heavyPunch!) || (this.isVsBot && this.p2Keys.heavyPunch && Phaser.Input.Keyboard.JustDown(this.p2Keys.heavyPunch));
    const lk = Phaser.Input.Keyboard.JustDown(this.p1Keys.lightKick!) || (this.isVsBot && this.p2Keys.lightKick && Phaser.Input.Keyboard.JustDown(this.p2Keys.lightKick));
    const hk = Phaser.Input.Keyboard.JustDown(this.p1Keys.heavyKick!) || (this.isVsBot && this.p2Keys.heavyKick && Phaser.Input.Keyboard.JustDown(this.p2Keys.heavyKick));
    const blk = this.p1Keys.block?.isDown || (this.isVsBot && this.p2Keys.block?.isDown);

    if (lp) {
      if (!p1.isOnGround) {
        if (p1.airComboInput('punch') !== 'punch') p1.startAttack('airPunch');
      } else {
        p1.bufferAttack('lightPunch');
      }
    }
    if (this.p1Keys.exLight && Phaser.Input.Keyboard.JustDown(this.p1Keys.exLight) && p1.superMeter >= 25) p1.bufferAttack('exLightPunch');
    if (this.p1Keys.exHeavy && Phaser.Input.Keyboard.JustDown(this.p1Keys.exHeavy) && p1.superMeter >= 25) p1.bufferAttack('exHeavyPunch');
    if (hp) {
      if (!p1.isOnGround) {
        if (p1.airComboInput('punch') !== 'punch') p1.startAttack('airHeavyPunch');
      } else {
        p1.bufferAttack('heavyPunch');
      }
    }
    // Chute no ar: inicia a sequência do mortal (chute+soco+chute) ou a voadora
    if (lk || hk) {
      if (!p1.isOnGround) {
        const combo = p1.airComboInput('kick');
        if (combo === 'kick') p1.startAttack('flyingKick');
      } else {
        p1.bufferAttack(lk ? 'lightKick' : 'heavyKick');
      }
    }

    if (blk) p1.startBlock();
    else p1.stopBlock();

    // Agarrão: DEFESA + soco leve em alcance curto (quebra o bloqueio)
    const grab = blk && lp;
    if (grab && Math.abs(p1.x - this.player2.x) < 70) {
      p1.startAttack('throw');
    }

    // Ar-ére P1 (Q) e P2 (Numpad 7)
    if (this.p1Keys.airDash && Phaser.Input.Keyboard.JustDown(this.p1Keys.airDash)) p1.airDash();

    // Aprender com a estratégia do jogador no modo arcade (rede neural)
    if (this.isNeuralBot && this.recorder) {
      this.recordPlayerActionForLearning(p1);
    }

    // Movimentação & Ataques P2 (Apenas no modo 2 jogadores local)
    if (!this.isVsBot && this.player2) {
      const p2 = this.player2;
      if (this.p2Keys.left?.isDown) p2.moveLeft(1 / TICK_RATE);
      else if (this.p2Keys.right?.isDown) p2.moveRight(1 / TICK_RATE);
      else p2.stopHorizontal();

      if (this.p2Keys.up?.isDown) p2.jump();
      if (this.p2Keys.down?.isDown) p2.crouchStart();
      else p2.crouchEnd();

      const p2Lp = Phaser.Input.Keyboard.JustDown(this.p2Keys.lightPunch!);
      if (p2Lp) {
        if (!p2.isOnGround) {
          if (p2.airComboInput('punch') !== 'punch') p2.startAttack('airPunch');
        } else {
          p2.bufferAttack('lightPunch');
        }
      }
      if (this.p2Keys.exLight && Phaser.Input.Keyboard.JustDown(this.p2Keys.exLight) && p2.superMeter >= 25) p2.bufferAttack('exLightPunch');
      if (this.p2Keys.exHeavy && Phaser.Input.Keyboard.JustDown(this.p2Keys.exHeavy) && p2.superMeter >= 25) p2.bufferAttack('exHeavyPunch');
      const p2Hp = Phaser.Input.Keyboard.JustDown(this.p2Keys.heavyPunch!);
      if (p2Hp) {
        if (!p2.isOnGround) {
          if (p2.airComboInput('punch') !== 'punch') p2.startAttack('airHeavyPunch');
        } else {
          p2.bufferAttack('heavyPunch');
        }
      }
      const p2Lk = Phaser.Input.Keyboard.JustDown(this.p2Keys.lightKick!);
      const p2Hk = Phaser.Input.Keyboard.JustDown(this.p2Keys.heavyKick!);
      if (p2Lk || p2Hk) {
        if (!p2.isOnGround) {
          const combo = p2.airComboInput('kick');
          if (combo === 'kick') p2.startAttack('flyingKick');
        } else {
          p2.bufferAttack(p2Lk ? 'lightKick' : 'heavyKick');
        }
      }

      if (this.p2Keys.block?.isDown) p2.startBlock();
      else p2.stopBlock();

      // Agarrão P2: DEFESA + soco leve em alcance curto
      const p2Grab = !!this.p2Keys.block?.isDown && p2Lp;
      if (p2Grab && Math.abs(p2.x - p1.x) < 70) {
        p2.startAttack('throw');
      }

      // Tech P2 (Numpad 8)
      if (this.p2Keys.tech && Phaser.Input.Keyboard.JustDown(this.p2Keys.tech)) p2.tech();

      // Reversal P2 (Numpad 9)
      if (this.p2Keys.reversal && Phaser.Input.Keyboard.JustDown(this.p2Keys.reversal)) p2.reversal("lightPunch");

      // Wake-up attack P2 (Numpad Enter)
      if (this.p2Keys.wakeUp && Phaser.Input.Keyboard.JustDown(this.p2Keys.wakeUp)) p2.wakeUpAttack();
    }
  }

  private setupOnline(): void {
    const socket = getSocket();
    if (!socket) return;

    this.remoteInput = null;
    this.prevRemoteInput = null;
    this.lastLocalInput = null;

    const onInput = (data: { input: OnlineInputState }) => {
      this.prevRemoteInput = this.remoteInput ? { ...this.remoteInput } : null;
      this.remoteInput = { ...(data?.input ?? ({} as OnlineInputState)) };
    };
    const onOpponentLeft = () => {
      if (this.opponentLeftText) {
        this.opponentLeftText.setText('OPONENTE DESCONECTOU');
        this.opponentLeftText.setVisible(true);
        this.time.delayedCall(2500, () => this.scene.start('OnlineLobbyScene'));
      }
    };
    socket.on('game:input' as never, onInput as never);
    socket.on('opponent_left' as never, onOpponentLeft as never);
    this.socketCleanupFns.push(() => {
      socket.off('game:input' as never, onInput as never);
      socket.off('opponent_left' as never, onOpponentLeft as never);
    });

    this.opponentLeftText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      '',
      { font: 'bold 40px Arial', color: '#ff3333', stroke: '#000000', strokeThickness: 6, align: 'center' }
    ).setOrigin(0.5, 0.5).setVisible(false);

    this.events.once('shutdown', () => {
      this.socketCleanupFns.forEach((fn) => fn());
      this.socketCleanupFns = [];
    });
  }

  private emptyInputState(): OnlineInputState {
    return {
      left: false, right: false, up: false, down: false,
      lp: false, hp: false, lk: false, hk: false,
      blk: false, exL: false, exH: false,
      air: false, tech: false, rev: false, wake: false,
      thr: false,
    };
  }

  private edgesFrom(cur: OnlineInputState, prev: OnlineInputState | null): OnlineInputState {
    const e = this.emptyInputState();
    (Object.keys(e) as Array<keyof OnlineInputState>).forEach((k) => {
      e[k] = !!cur[k] && !(prev && prev[k]);
    });
    return e;
  }

  private processOnlineInput(): void {
    const me = this.isHost ? this.player1 : this.player2;
    const them = this.isHost ? this.player2 : this.player1;
    if (!me || !them) return;

    // Meu input: aplica localmente e envia ao oponente
    const held = this.emptyInputState();
    held.left = !!this.p1Keys.left?.isDown;
    held.right = !!this.p1Keys.right?.isDown;
    held.up = !!this.p1Keys.up?.isDown;
    held.down = !!this.p1Keys.down?.isDown;
    held.lp = !!this.p1Keys.lightPunch?.isDown;
    held.hp = !!this.p1Keys.heavyPunch?.isDown;
    held.lk = !!this.p1Keys.lightKick?.isDown;
    held.hk = !!this.p1Keys.heavyKick?.isDown;
    held.blk = !!this.p1Keys.block?.isDown;
    held.exL = !!this.p1Keys.exLight?.isDown;
    held.exH = !!this.p1Keys.exHeavy?.isDown;
    held.air = !!this.p1Keys.airDash?.isDown;
    held.tech = !!this.p1Keys.tech?.isDown;
    held.rev = !!this.p1Keys.reversal?.isDown;
    held.wake = !!this.p1Keys.wakeUp?.isDown;
    held.thr = !!this.p1Keys.block?.isDown && !!this.p1Keys.lightPunch?.isDown;

    const prevLocal = this.lastLocalInput ?? this.emptyInputState();
    this.applyInputFrame(me, held, this.edgesFrom(held, prevLocal), them.x);
    this.lastLocalInput = { ...held };
    sendGameInput(held);

    // Input remoto: aplica no lutador do oponente
    if (this.remoteInput) {
      this.applyInputFrame(them, this.remoteInput, this.edgesFrom(this.remoteInput, this.prevRemoteInput), me.x);
    }
  }

  private applyInputFrame(f: Fighter, held: OnlineInputState, edges: OnlineInputState, oppX: number): void {
    if (held.left) f.moveLeft(1 / TICK_RATE);
    else if (held.right) f.moveRight(1 / TICK_RATE);
    else f.stopHorizontal();

    if (held.up) f.jump();
    if (held.down) f.crouchStart();
    else f.crouchEnd();

    if (edges.lp) {
      if (!f.isOnGround) {
        if (f.airComboInput('punch') !== 'punch') f.startAttack('airPunch');
      } else {
        f.bufferAttack('lightPunch');
      }
    }
    if (edges.exL && f.superMeter >= 25) f.bufferAttack('exLightPunch');
    if (edges.exH && f.superMeter >= 25) f.bufferAttack('exHeavyPunch');
    if (edges.hp) {
      if (!f.isOnGround) {
        if (f.airComboInput('punch') !== 'punch') f.startAttack('airHeavyPunch');
      } else {
        f.bufferAttack('heavyPunch');
      }
    }
    if (edges.lk || edges.hk) {
      if (!f.isOnGround) {
        const combo = f.airComboInput('kick');
        if (combo === 'kick') f.startAttack('flyingKick');
      } else {
        f.bufferAttack(edges.lk ? 'lightKick' : 'heavyKick');
      }
    }

    if (held.blk) f.startBlock();
    else f.stopBlock();

    if (edges.thr && Math.abs(f.x - oppX) < 70) f.startAttack('throw');
    if (edges.air && !f.isOnGround) f.airDash();
    if (edges.tech) f.tech();
    if (edges.rev) f.reversal('lightPunch');
    if (edges.wake) f.wakeUpAttack();
  }

  private updateFighters(dt: number): void {
    if (this.isPaused) return;
    if (this.player1 && this.player2) {
      this.player1.update(dt, this.player2.x);
      this.player2.update(dt, this.player1.x);

      const overlap = this.resolveOverlap(this.player1, this.player2);
      if (overlap > 0) {
        const pushForce = overlap * 2;
        if (this.player1.x <= this.player2.x) {
          this.player1.x -= pushForce;
          this.player2.x += pushForce;
        } else {
          this.player1.x += pushForce;
          this.player2.x -= pushForce;
        }
      }

      // Poeira e Aura Visual
      if (this.vfxManager) {
        // P1 poeira se estiver andando ou no ar dash
        const p1Moving = this.player1.state === FighterState.WALKING;
        const p1Dashing = this.player1.isAirDashing;
        if ((p1Moving && Math.random() < 0.12) || p1Dashing) {
          this.vfxManager.createDustTrail(this.player1.x, this.player1.y);
        }

        // P2 poeira
        const p2Moving = this.player2.state === FighterState.WALKING;
        const p2Dashing = this.player2.isAirDashing;
        if ((p2Moving && Math.random() < 0.12) || p2Dashing) {
          this.vfxManager.createDustTrail(this.player2.x, this.player2.y);
        }

        // Partículas de EX (Ataques EX ativos ou barra 100% cheia)
        if (this.player1.state === FighterState.ATTACKING && this.player1.attackType?.startsWith('ex')) {
          this.vfxManager.createEXAura(this.player1.x, this.player1.y, 0xff7700);
        } else if (this.player1.superMeter >= 100 && Math.random() < 0.18) {
          this.vfxManager.createEXAura(this.player1.x, this.player1.y, 0xffaa00);
        }

        if (this.player2.state === FighterState.ATTACKING && this.player2.attackType?.startsWith('ex')) {
          this.vfxManager.createEXAura(this.player2.x, this.player2.y, 0x00ffff);
        } else if (this.player2.superMeter >= 100 && Math.random() < 0.18) {
          this.vfxManager.createEXAura(this.player2.x, this.player2.y, 0x00ffff);
        }
      }
    }

    if (this.player1Entity) this.player1Entity.update(dt);
    if (this.player2Entity) this.player2Entity.update(dt);
  }

  private resolveOverlap(a: any, b: any): number {
    const aLeft = a.x - 17;
    const aRight = a.x + 17;
    const bLeft = b.x - 17;
    const bRight = b.x + 17;

    if (aRight > bLeft && aLeft < bRight) {
      return Math.min(aRight - bLeft, bRight - aLeft);
    }
    return 0;
  }

  private checkCollisions(): void {
    if (!this.player1 || !this.player2) return;

    if (this.player1.state === FighterState.ATTACKING && !this.player1.attackDone) {
      const result1 = processAttack(this.player1, this.player2, this.player1.attackType);
      if (result1) {
        this.player1.attackDone = true;
        this.p2CatchupDelay = 0.55;
        this.handleCombo(1, result1);
        this.crowdExcitement = 1.0;
        this.applyHitFeedback(this.player1, this.player2, this.player2Entity, this.player1Entity, result1);
        this.checkWallBounce(this.player2, result1);

        // Slow motion on KO
        if (this.player2.ko && this.vfxManager) {
          this.vfxManager.triggerSlowMoKO();
        }

        // Trail effect on heavy attacks (P1)
        if (this.player1.attackType === 'heavyPunch' || this.player1.attackType === 'heavyKick' || this.player1.attackType === 'exHeavyPunch') {
          if (this.vfxManager) this.vfxManager.createAttackTrail(this.player1.x, this.player1.y, 0xff3300);
        }
      }
    }

    if (this.player2.state === FighterState.ATTACKING && !this.player2.attackDone) {
      const result2 = processAttack(this.player2, this.player1, this.player2.attackType);
      if (result2) {
        this.player2.attackDone = true;
        this.p1CatchupDelay = 0.55;
        this.handleCombo(2, result2);
        this.crowdExcitement = 1.0;
        this.applyHitFeedback(this.player2, this.player1, this.player1Entity, this.player2Entity, result2);
        this.checkWallBounce(this.player1, result2);

        // Slow motion on KO
        if (this.player1.ko && this.vfxManager) {
          this.vfxManager.triggerSlowMoKO();
        }

        // Trail effect on heavy attacks (P2)
        if (this.player2.attackType === 'heavyPunch' || this.player2.attackType === 'heavyKick' || this.player2.attackType === 'exHeavyPunch') {
          if (this.vfxManager) this.vfxManager.createAttackTrail(this.player2.x, this.player2.y, 0x00ccff);
        }
      }
    }
  }

  // Efeitos de um golpe que conectou: sparks, flash, shake, textos de feedback
  private applyHitFeedback(
    attacker: Fighter,
    defender: Fighter,
    defenderEntity: FighterEntity | null,
    attackerEntity: FighterEntity | null,
    result: any
  ): void {
    const hitX = (attacker.x + defender.x) / 2;
    const hitY = GROUND_Y - 40;

    if (result.wasPerfectBlock) {
      defenderEntity?.onBlockHit(true);
      attackerEntity?.setFlash(0x00ffff, 0.12);
      this.vfxManager?.showFloatingText(attacker.x, attacker.y - 110, 'PERFECT BLOCK', '#00ffff');
    } else if (result.wasBlocked) {
      defenderEntity?.onBlockHit(false);
    } else {
      defenderEntity?.setFlash(0xffffff, 0.1);
    }

    if (result.wasThrow) {
      this.vfxManager?.showFloatingText(hitX, hitY - 70, 'THROW!', '#ffaa00');
      this.vfxManager?.triggerScreenShake(0.018, 160);
    }

    if (defender.guardBroken) {
      this.vfxManager?.showFloatingText(defender.x, defender.y - 90, 'GUARD BREAK!', '#ff2222');
      this.vfxManager?.triggerScreenShake(0.025, 250);
    }

    if (this.vfxManager) {
      if (attacker.attackType === 'flyingKick') {
        this.vfxManager.createFlyingKickImpact(hitX, hitY);
      } else {
        this.vfxManager.createHitSpark(hitX, hitY, result.wasPerfectBlock);
      }
      if (result.wasPerfectBlock) {
        this.vfxManager.triggerScreenShake(0.01, 100);
        this.vfxManager.triggerScreenFlash(0x00ffff, 100);
      } else {
        this.vfxManager.triggerScreenShake(attacker.attackType === 'flyingKick' ? 0.015 : 0.008, 80);
      }
    }
  }

  // Defensor atingido perto da parede (empurrado para ela) ricocheteia
  private checkWallBounce(defender: Fighter, result: any): boolean {
    if (!defender || !result || result.wasBlocked || result.wasPerfectBlock || result.wasThrow) return false;
    const nearLeft = defender.x < 60;
    const nearRight = defender.x > GAME_WIDTH - 60;
    if (!nearLeft && !nearRight) return false;
    const pushedIntoWall = (nearRight && result.knockback > 0) || (nearLeft && result.knockback < 0);
    if (!pushedIntoWall) return false;

    processWallBounce(defender);
    this.vfxManager?.createHitSpark(defender.x, GROUND_Y - 40, false);
    this.vfxManager?.showFloatingText(defender.x, defender.y - 110, 'WALL BOUNCE', '#ff7700');
    this.vfxManager?.triggerScreenShake(0.02, 180);
    return true;
  }

  private updateHUD(): void {
    if (!this.player1 || !this.player2) return;

    // 1. Atualizar barras principais
    const p1Ratio = Math.max(0, this.player1.health / (this.player1?.maxHealth ?? 100));
    if (this.p1HealthBar) {
      this.p1HealthBar.setScale(p1Ratio, 1);
      if (p1Ratio <= 0.3) this.p1HealthBar.setFillStyle(0xff2222);
      else if (p1Ratio <= 0.6) this.p1HealthBar.setFillStyle(0xffaa00);
      else this.p1HealthBar.setFillStyle(0x00ff66);
    }

    const p2Ratio = Math.max(0, this.player2.health / (this.player2?.maxHealth ?? 100));
    if (this.p2HealthBar) {
      this.p2HealthBar.setScale(p2Ratio, 1);
      if (p2Ratio <= 0.3) this.p2HealthBar.setFillStyle(0xff2222);
      else if (p2Ratio <= 0.6) this.p2HealthBar.setFillStyle(0xffaa00);
      else this.p2HealthBar.setFillStyle(0x00ff66);
    }

    // Postura: dourada -> laranja quando baixa -> vermelho piscando se guard quebrou
    this.updatePostureBar(this.p1PostureBar, this.player1);
    this.updatePostureBar(this.p2PostureBar, this.player2);

    // Super: azul -> ciano pulsando quando cheio (EX disponível a 25)
    this.updateMeterBar(this.p1MeterBar, this.player1);
    this.updateMeterBar(this.p2MeterBar, this.player2);

    this.refreshSpecialText(this.p1SpecialText, this.player1);
    this.refreshSpecialText(this.p2SpecialText, this.player2);

    // 2. Atualizar Estrelas de Vitória
    for (let i = 0; i < 3; i++) {
      if (this.p1ScoreStars[i]) {
        if (i < this.roundManager.scores.p1) {
          this.p1ScoreStars[i].setFillStyle(0xffd700);
          this.p1ScoreStars[i].setStrokeStyle(1.5, 0xff7700);
        } else {
          this.p1ScoreStars[i].setFillStyle(0x333333);
          this.p1ScoreStars[i].setStrokeStyle(0);
        }
      }

      if (this.p2ScoreStars[i]) {
        if (i < this.roundManager.scores.p2) {
          this.p2ScoreStars[i].setFillStyle(0xffd700);
          this.p2ScoreStars[i].setStrokeStyle(1.5, 0xff7700);
        } else {
          this.p2ScoreStars[i].setFillStyle(0x333333);
          this.p2ScoreStars[i].setStrokeStyle(0);
        }
      }
    }

    // 3. Atualizar Cronômetro com pulso a cada segundo e piscar em < 10s
    if (this.timerText) {
      const remaining = Math.ceil(this.roundManager.timer);
      this.timerText.setText(String(remaining));

      if (remaining <= 10) {
        this.timerText.setColor('#ff3333');
        const flash = Math.abs(Math.sin(Date.now() * 0.01));
        this.timerText.setAlpha(0.4 + flash * 0.6);
      } else {
        this.timerText.setColor('#ffcc00');
        this.timerText.setAlpha(1);
      }
    }
  }

  private updatePostureBar(bar: Phaser.GameObjects.Rectangle | null, fighter: Fighter): void {
    if (!bar || !fighter) return;
    const ratio = Math.max(0, Math.min(1, fighter.posture / (fighter.maxPosture ?? 100)));
    bar.setScale(ratio, 1);
    if (fighter.guardBroken) {
      const flash = Math.abs(Math.sin(Date.now() * 0.02));
      bar.setFillStyle(flash > 0.5 ? 0xff2222 : 0x660000);
      bar.setAlpha(0.7 + flash * 0.3);
    } else {
      bar.setAlpha(1);
      if (ratio <= 0.25) bar.setFillStyle(0xff2222);
      else if (ratio <= 0.5) bar.setFillStyle(0xff8800);
      else bar.setFillStyle(0xffcc00);
    }
  }

  private updateMeterBar(bar: Phaser.GameObjects.Rectangle | null, fighter: Fighter): void {
    if (!bar || !fighter) return;
    const ratio = Math.max(0, Math.min(1, fighter.superMeter / (fighter.MAX_SUPER_METER ?? 100)));
    bar.setScale(ratio, 1);
    if (ratio >= 1) {
      const pulse = Math.abs(Math.sin(Date.now() * 0.015));
      // Interpolação manual entre ciano (0, 255, 255) e dourado (255, 215, 0)
      const r = Math.floor(pulse * 255);
      const g = Math.floor(255 - pulse * 40);
      const b = Math.floor(255 - pulse * 255);
      bar.setFillStyle((r << 16) | (g << 8) | b);
      bar.setAlpha(0.7 + pulse * 0.3);
    } else if (ratio >= 0.25) {
      bar.setFillStyle(0x00bbff);
      bar.setAlpha(1);
    } else {
      bar.setFillStyle(ratio > 0 ? 0x3366aa : 0x1a2b3a);
      bar.setAlpha(1);
    }
  }

  private refreshSpecialText(text: Phaser.GameObjects.Text | null, fighter: Fighter): void {
    if (!text || !fighter) return;
    if (fighter.specialCooldown > 0) {
      text.setText(`MORTAL ${Math.ceil(fighter.specialCooldown)}s`);
      text.setColor('#666666');
    } else {
      text.setText('MORTAL READY  (pular + chute, soco, chute)');
      text.setColor('#ffdd00');
    }
  }

  private checkRoundEnd(): void {
    if (!this.player1 || !this.player2) return;

    const roundResult = this.roundManager.getRoundResult(this.player1.health ?? 0, this.player2.health ?? 0);
    if (roundResult) {
      this.endRound(roundResult);
    }
  }

  // Registra a ação do jogador (quem venceu) como exemplo de imitação para o
  // bot neural, no mesmo espaço de features usado pela rede.
  private recordPlayerActionForLearning(p1: Fighter): void {
    const p2 = this.player2;
    const recorder = this.recorder;
    if (!p2 || !recorder) return;

    let idx = -1;
    const k = this.p1Keys;
    const inAir = !p1.isOnGround;

    if (Phaser.Input.Keyboard.JustDown(k.tech!) && inAir) idx = ACTIONS.indexOf('techWake');
    else if (Phaser.Input.Keyboard.JustDown(k.wakeUp!) && p1.isOnGround && p1.wakeUpTimer > 0) idx = ACTIONS.indexOf('techWake');
    else if (Phaser.Input.Keyboard.JustDown(k.reversal!) && p1.superMeter >= 25) idx = ACTIONS.indexOf('exReversal');
    else if (Phaser.Input.Keyboard.JustDown(k.airDash!) && inAir) idx = ACTIONS.indexOf('airDash');
    else if (k.up?.isDown && p1.isOnGround) idx = ACTIONS.indexOf('jump');
    else if (k.down?.isDown && p1.isOnGround) idx = ACTIONS.indexOf('crouch');
    else if (k.block?.isDown) idx = ACTIONS.indexOf('block');
    else if (Phaser.Input.Keyboard.JustDown(k.lightPunch!) && k.block?.isDown && Math.abs(p1.x - p2.x) < 70) {
      idx = ACTIONS.indexOf('throw');
    } else if (Phaser.Input.Keyboard.JustDown(k.lightPunch!)) idx = ACTIONS.indexOf('lightPunch');
    else if (Phaser.Input.Keyboard.JustDown(k.heavyPunch!)) idx = ACTIONS.indexOf('heavyPunch');
    else if (Phaser.Input.Keyboard.JustDown(k.lightKick!)) idx = ACTIONS.indexOf('lightKick');
    else if (Phaser.Input.Keyboard.JustDown(k.heavyKick!)) idx = ACTIONS.indexOf('heavyKick');
    else if (k.left?.isDown || k.right?.isDown) {
      const movingRight = !!k.right?.isDown;
      const oppToRight = p2.x > p1.x;
      const toward = oppToRight === movingRight;
      idx = ACTIONS.indexOf(toward ? 'moveToward' : 'moveAway');
    }

    if (idx >= 0) {
      recorder.recordPlayerAction(buildFeatureVec(p1, p2), idx);
    }
  }

  // Treina a rede com a experiência da partida vencida pelo jogador (imitação
  // + reforço), em segundo plano, e salva os novos pesos no localStorage.
  private trainNeuralBot(): void {
    const bot = this.neuralBot;
    const recorder = this.recorder;
    if (!bot || !recorder) return;

    recorder.finalize();
    const samples = recorder.buildSamples({ maxBot: 500, maxPlayer: 300 });
    if (samples.length === 0) return;

    console.log(`[NeuralBot] treinando com ${samples.length} amostras da vitoria...`);
    trainOnlineAsync({
      net: bot.getNet(),
      base: bot.getBaseNet(),
      samples,
      lr: 0.025,
      epochs: 8,
      alphaReg: 0.05,
    }).then(() => {
      bot.setNet(bot.getNet());
      bot.saveToStorage();
      console.log('[NeuralBot] pesos atualizados e salvos (localStorage).');
    });
  }

  private endRound(winnerResult: string): void {
    const winnerKey = winnerResult === 'double_ko' ? null : winnerResult;
    this.roundManager.endRound(winnerKey);

    const isKO = this.player1?.ko || this.player2?.ko;
    const announceText = winnerKey
      ? (isKO ? 'K.O.!' : 'TIME OVER')
      : 'DOUBLE K.O.!';

    if (isKO && this.vfxManager) {
      this.vfxManager.triggerSlowMoKO();
    }

    this.showKOText(announceText);

    this.time.delayedCall(2000, () => {
      const hasNextRound = this.roundManager.nextRound();
      if (hasNextRound && this.player1 && this.player2) {
        this.player1.reset(550, GROUND_Y);
        this.player2.reset(650, GROUND_Y);
        this.startCountdown();
      } else {
        const matchWinner = this.roundManager.getMatchResult();
        const finalMsg = matchWinner
          ? `VITORIA DO JOGADOR ${matchWinner.toUpperCase()}!`
          : 'PARTIDA EMPATADA!';

        this.showKOText(finalMsg);

        if (matchWinner === 'p1' && this.neuralBot) {
          this.trainNeuralBot();
        }

        this.time.delayedCall(3000, () => {
          this.scene.start('MenuScene');
        });
      }
    });
  }
}