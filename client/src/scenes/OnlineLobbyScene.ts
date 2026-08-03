import Phaser from 'phaser';
import { connectSocket, createRoom, joinRoom, readyUp, startRoom, leaveRoom } from '../network/socketClient';

interface RoomPlayer {
  id: string;
  ready: boolean;
}

export class OnlineLobbyScene extends Phaser.Scene {
  private myId: string = '';
  private isHost: boolean = false;
  private inRoom: boolean = false;
  private roomCode: string = '';
  private players: RoomPlayer[] = [];

  private statusText: Phaser.GameObjects.Text | null = null;
  private roomPanel: Phaser.GameObjects.Rectangle | null = null;
  private roomCodeText: Phaser.GameObjects.Text | null = null;
  private playersText: Phaser.GameObjects.Text | null = null;
  private menuGroup: any[] = [];
  private readyButton: Phaser.GameObjects.Rectangle | null = null;
  private readyButtonText: Phaser.GameObjects.Text | null = null;
  private startButton: Phaser.GameObjects.Rectangle | null = null;
  private startButtonText: Phaser.GameObjects.Text | null = null;
  private meReady: boolean = false;
  private socketCleanup: Array<() => void> = [];

  constructor() {
    super({ key: 'OnlineLobbyScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#14142a');
    this.players = [];
    this.meReady = false;
    this.inRoom = false;
    this.isHost = false;

    const title = this.add.text(this.cameras.main.centerX, 90, 'ONLINE — ROOM ID', {
      font: 'bold 44px Arial',
      color: '#ffcc00',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5, 0.5);

    this.statusText = this.add.text(this.cameras.main.centerX, 160, 'Conectando...', {
      font: '18px Arial',
      color: '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5, 0.5);

    this.menuGroup = [];
    this.menuGroup.push(this.createButton(this.cameras.main.centerX, 280, 'CRIAR SALA', () => createRoom()));
    this.menuGroup.push(this.createButton(this.cameras.main.centerX, 350, 'ENTRAR EM SALA (digite o código)', () => this.promptJoin()));
    this.menuGroup.push(this.createButton(this.cameras.main.centerX, 420, 'VOLTAR', () => this.scene.start('MenuScene')));

    // Painel da sala (oculto até criar/entrar)
    this.roomPanel = this.add.rectangle(this.cameras.main.centerX, 300, 560, 300, 0x223355, 0.9);
    this.roomPanel.setStrokeStyle(2, 0xffcc00).setVisible(false);

    this.roomCodeText = this.add.text(this.cameras.main.centerX, 180, '', {
      font: 'bold 40px Courier New, monospace',
      color: '#ffcc00',
      align: 'center',
    }).setOrigin(0.5, 0.5).setVisible(false);

    this.playersText = this.add.text(this.cameras.main.centerX, 250, '', {
      font: '20px Arial',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0.5).setVisible(false);

    const socket = connectSocket();

    const on = (event: string, fn: (data: any) => void) => {
      socket.on(event as never, fn as never);
      this.socketCleanup.push(() => socket.off(event as never, fn as never));
    };

    on('connect', () => {
      this.myId = socket.id ?? '';
      this.setStatus('Conectado! Crie ou entre em uma sala.');
    });
    on('room:created', (d) => this.onEnterRoom(d, true));
    on('room:joined', (d) => this.onEnterRoom(d, false));
    on('room:update', (d) => this.onRoomUpdate(d));
    on('room:started', (d) => this.onStarted(d));
    on('room:error', (d) => this.setStatus('Erro: ' + (d?.message ?? 'desconhecido')));
    on('room:closed', () => this.onLeftRoom('A sala foi fechada.'));
    on('opponent_left', () => this.onLeftRoom('O oponente saiu da sala.'));

    this.events.once('shutdown', () => {
      this.socketCleanup.forEach((fn) => fn());
      this.socketCleanup = [];
    });
  }

  private createButton(x: number, y: number, text: string, callback: () => void): Phaser.GameObjects.Rectangle {
    const btn = this.add.rectangle(x, y, 380, 50, 0x334466);
    btn.setStrokeStyle(2, 0xffcc00);
    btn.setInteractive({ useHandCursor: true });
    const label = this.add.text(x, y, text, { font: 'bold 18px Arial', color: '#ffffff' }).setOrigin(0.5, 0.5);
    btn.on('pointerover', () => btn.setFillStyle(0x446699));
    btn.on('pointerout', () => btn.setFillStyle(0x334466));
    btn.on('pointerdown', () => callback());
    return btn;
  }

  private promptJoin(): void {
    const code = window.prompt('Digite o código da sala (ex: AB12CD):', '');
    if (code && code.trim()) {
      joinRoom(code.trim());
      this.setStatus('Entrando na sala ' + code.trim().toUpperCase() + '...');
    }
  }

  private setStatus(msg: string): void {
    if (this.statusText) this.statusText.setText(msg);
  }

  private onEnterRoom(data: any, host: boolean): void {
    this.isHost = host;
    this.inRoom = true;
    this.meReady = false;
    this.roomCode = data.roomId;
    this.players = data.players ?? [];
    this.renderRoom();
  }

  private onRoomUpdate(data: any): void {
    if (!this.inRoom) return;
    this.players = data.players ?? [];
    this.renderRoom();
  }

  private onStarted(data: any): void {
    this.scene.start('FightScene', {
      mode: 'online',
      roomId: data.roomId,
      isHost: this.isHost,
    });
  }

  private onLeftRoom(msg: string): void {
    this.inRoom = false;
    this.players = [];
    leaveRoom();
    this.setStatus(msg);
    this.renderMenu();
  }

  private renderMenu(): void {
    this.roomPanel?.setVisible(false);
    this.roomCodeText?.setVisible(false);
    this.playersText?.setVisible(false);
    if (this.readyButton) {
      this.readyButton.destroy();
      this.readyButtonText?.destroy();
      this.readyButton = null;
      this.readyButtonText = null;
    }
    if (this.startButton) {
      this.startButton.destroy();
      this.startButtonText?.destroy();
      this.startButton = null;
      this.startButtonText = null;
    }
    this.menuGroup.forEach((o) => o.setVisible(true));
  }

  private renderRoom(): void {
    this.menuGroup.forEach((o) => o.setVisible(false));
    this.roomPanel?.setVisible(true);
    this.roomCodeText?.setVisible(true);
    this.playersText?.setVisible(true);

    if (this.roomCodeText) {
      this.roomCodeText.setText('SALA: ' + this.roomCode + '   (clique p/ copiar)');
      this.roomCodeText.setInteractive({ useHandCursor: true });
      this.roomCodeText.off('pointerdown');
      this.roomCodeText.on('pointerdown', () => {
        try {
          navigator.clipboard?.writeText(this.roomCode);
        } catch {
          window.prompt('Copie o código da sala:', this.roomCode);
        }
      });
    }

    const me = this.players.find((p) => p.id === this.myId);
    if (me) this.meReady = me.ready;

    if (this.playersText) {
      const lines = this.players.map((p, i) => {
        const isMe = p.id === this.myId;
        const name = isMe ? (i === 0 ? 'VOCÊ (HOST)' : 'VOCÊ') : (i === 0 ? 'HOST' : 'OPONENTE');
        const ready = p.ready ? 'PRONTO ✓' : 'AGUARDANDO...';
        return `${name}: ${ready}`;
      });
      this.playersText.setText(lines.join('\n\n'));
    }

    // Botão PRONTO (ambos) e COMEÇAR (só host)
    if (!this.readyButton) {
      const rb = this.createButton(this.cameras.main.centerX, 360, '', () => readyUp());
      const rbText = this.add.text(this.cameras.main.centerX, 360, '', {
        font: 'bold 18px Arial',
        color: '#ffffff',
      }).setOrigin(0.5, 0.5);
      this.readyButton = rb;
      this.readyButtonText = rbText;
    }
    const readyLabel = this.meReady ? 'PRONTO ✓' : 'PRONTO';
    this.readyButtonText!.setText(readyLabel);
    this.readyButton.setFillStyle(this.meReady ? 0x2a6e2a : 0x334466);

    const canStart = this.isHost && this.players.length === 2 && this.players.every((p) => p.ready);
    if (!this.startButton) {
      const sb = this.createButton(this.cameras.main.centerX, 430, '', () => startRoom());
      const sbText = this.add.text(this.cameras.main.centerX, 430, '', {
        font: 'bold 18px Arial',
        color: '#ffffff',
      }).setOrigin(0.5, 0.5);
      this.startButton = sb;
      this.startButtonText = sbText;
    }
    this.startButtonText!.setText(this.isHost ? 'COMEÇAR LUTA' : 'AGUARDANDO HOST...');
    this.startButton.setFillStyle(this.isHost ? (canStart ? 0xcc8800 : 0x556688) : 0x223355);

    this.setStatus(this.isHost
      ? 'Compartilhe o código da sala com seu oponente.'
      : 'Você entrou na sala. Aperte PRONTO.');
  }
}
