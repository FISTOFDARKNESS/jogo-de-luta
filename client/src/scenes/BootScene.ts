import Phaser from 'phaser';
import { connectSocket, sendPing } from '../network/socketClient';

export class BootScene extends Phaser.Scene {
  private statusText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1a2e');

    const title = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY - 60,
      'Jogo de Luta 2D',
      {
        font: '48px Arial',
        color: '#ffffff',
        align: 'center',
      }
    );
    title.setOrigin(0.5, 0.5);

    this.statusText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY + 20,
      'Conectando ao servidor...',
      {
        font: '20px Arial',
        color: '#aaaaaa',
        align: 'center',
      }
    );
    this.statusText.setOrigin(0.5, 0.5);

    this.testConnection();
  }

  private async testConnection(): Promise<void> {
    try {
      const socket = connectSocket();

      socket.on('connect', async () => {
        console.log('[BootScene] WebSocket conectado ao servidor');

        if (this.statusText) {
          this.statusText.setText('Enviando ping...');
        }

        const timestamp = await sendPing();
        console.log('[BootScene] Recebido pong do servidor, timestamp:', timestamp);

        if (this.statusText) {
          this.statusText.setText('Conexão OK — Ping/Pong bem-sucedido');
          this.statusText.setColor('#00ff00');
        }
      });
    } catch (error) {
      console.error('[BootScene] Erro na conexão:', error);

      if (this.statusText) {
        this.statusText.setText('Erro na conexão');
        this.statusText.setColor('#ff0000');
      }
    }
  }
}