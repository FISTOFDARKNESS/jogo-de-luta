import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { DifficultySelectScene } from './scenes/DifficultySelectScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { FightScene } from './scenes/FightScene';
import { OnlineLobbyScene } from './scenes/OnlineLobbyScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#1a1a2e',
  parent: 'game-container',
  scene: [MenuScene, DifficultySelectScene, CharacterSelectScene, FightScene, OnlineLobbyScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);