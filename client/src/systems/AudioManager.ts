import Phaser from 'phaser';

export class AudioManager {
  private scene: Phaser.Scene;
  private masterVolume: number = 0.5;
  private bgmVolume: number = 0.3;
  private sfxVolume: number = 0.7;
  private bgmKey: string | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
  }

  setBGMVolume(v: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, v));
  }

  setSFXVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
  }

  playSFX(key: string): void {
    try {
      this.scene.sound.play(key, { volume: this.sfxVolume * this.masterVolume });
    } catch (e) {
      // Sound not loaded, silently ignore
    }
  }

  playBGM(key: string, loop: boolean = true): void {
    if (this.bgmKey === key) return;
    this.stopBGM();
    this.bgmKey = key;
    try {
      this.scene.sound.play(key, { volume: this.bgmVolume * this.masterVolume, loop });
    } catch (e) {
      // Sound not loaded, silently ignore
    }
  }

  stopBGM(): void {
    if (this.bgmKey) {
      try {
        (this.scene.sound as any).stop(this.bgmKey);
      } catch (e) {
        // Ignore
      }
      this.bgmKey = null;
    }
  }

  mute(): void {
    this.masterVolume = 0;
  }

  unmute(): void {
    this.masterVolume = 0.5;
  }
}
