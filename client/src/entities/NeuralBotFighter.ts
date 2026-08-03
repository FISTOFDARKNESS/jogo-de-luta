import { buildFeatureVec, applyAction, ACTIONS, INPUT_SIZE } from '../ai/aiController.js';
import { deserializeNet, forwardNet, sampleAction, serializeNet, getTfjsModel, softmax, type SerializedNet } from '../ai/neuralNet.js';
import { loadWeightsFromStorage, saveWeightsToStorage } from '../lib/onlineLearning.js';
import * as tf from '@tensorflow/tfjs';

export interface NeuralBotConfig {
  temperature: number;
  interval: number;
  onDecision?: (feature: number[], actionIdx: number) => void;
}

export const DEFAULT_NEURAL_CONFIG: NeuralBotConfig = {
  temperature: 0.7,
  interval: 0.09,
};

// Bot neural: mesma interface de BotFighter, mas as ações vêm de uma MLP
// treinada offline (auto-play evolutivo). O runtime tenta inferir com
// TensorFlow.js (model.predict); se a checagem de integridade detectar
// divergência com o forward JS de referência, cai para o JS puro.
export class NeuralBotFighter {
  private net: Float32Array = new Float32Array(0);
  private baseNet: Float32Array = new Float32Array(0);
  private serialized: SerializedNet | null = null;
  private timer: number = Math.random() * 0.03;
  private config: NeuralBotConfig;
  private useTfjs = false;

  constructor(
    private fighter: any,
    private opponent: any,
    difficulty: string,
    config?: Partial<NeuralBotConfig>
  ) {
    void difficulty;
    this.config = { ...DEFAULT_NEURAL_CONFIG, ...(config ?? {}) };
  }

  // Carrega os pesos: primeiro do localStorage (aprendizado de vitórias
  // anteriores), senão do JSON do bundle. Retorna null se não puder ativar.
  static async load(
    weightsUrl: string,
    fighter: any,
    opponent: any,
    difficulty: string,
    config?: Partial<NeuralBotConfig>
  ): Promise<NeuralBotFighter | null> {
    try {
      let data = loadWeightsFromStorage();
      if (!data) {
        const res = await fetch(weightsUrl);
        if (!res.ok) throw new Error(`weights ${weightsUrl} -> HTTP ${res.status}`);
        const payload = await res.json();
        data = payload.net as SerializedNet;
      }
      if (!data || !Array.isArray(data.w1) || data.w1.length !== INPUT_SIZE * 96) {
        throw new Error('formato de pesos inesperado');
      }
      const bot = new NeuralBotFighter(fighter, opponent, difficulty, config);
      bot.net = deserializeNet(data);
      bot.baseNet = bot.net.slice();
      bot.serialized = data;
      bot.useTfjs = await bot.verifyTfjsBackend();
      return bot;
    } catch (err: any) {
      console.warn('[NeuralBotFighter] falha ao carregar pesos:', err.message);
      return null;
    }
  }

  getNet(): Float32Array {
    return this.net;
  }

  getBaseNet(): Float32Array {
    return this.baseNet;
  }

  getSerialized(): SerializedNet | null {
    return this.serialized;
  }

  // Atualiza os pesos (usado ao fim do treino online) e sincroniza o modelo tfjs.
  setNet(net: Float32Array): void {
    this.net = net;
    this.serialized = serializeNet(net);
  }

  saveToStorage(): void {
    if (this.serialized) saveWeightsToStorage(this.serialized);
  }

  // Valida o backend tfjs: infere 5 vetores aleatórios pelos dois caminhos e
  // compara os logits. tfjs só é usado se bater com a referência JS.
  private async verifyTfjsBackend(): Promise<boolean> {
    try {
      if (!this.serialized) return false;
      getTfjsModel(this.serialized);
      await tf.ready();
      for (let t = 0; t < 5; t++) {
        const vec = Array.from({ length: INPUT_SIZE }, () => Math.random() * 2 - 1);
        const js = forwardNet(this.net, vec);
        const tfLogits = Array.from(
          (getTfjsModel(this.serialized).predict(tf.tensor2d([vec], [1, INPUT_SIZE])) as tf.Tensor).dataSync()
        );
        for (let a = 0; a < js.length; a++) {
          if (Math.abs(js[a] - tfLogits[a]) > 1e-2) {
            console.warn('[NeuralBotFighter] backend tfjs divergiu; usando inferência JS.');
            return false;
          }
        }
      }
      return true;
    } catch (err: any) {
      console.warn('[NeuralBotFighter] tfjs indisponível; usando inferência JS.');
      return false;
    }
  }

  update(dt: number): void {
    if (this.net.length === 0 || !this.fighter || !this.opponent) return;
    if (this.fighter.ko || this.fighter.hitstunTimer > 0 || this.fighter.hitstopTimer > 0) return;

    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.config.interval;

    const vec = buildFeatureVec(this.fighter, this.opponent);
    let idx: number;
    if (this.useTfjs && this.serialized) {
      const logits = Array.from(
        (getTfjsModel(this.serialized).predict(tf.tensor2d([vec], [1, INPUT_SIZE])) as tf.Tensor).dataSync()
      );
      idx = sampleIndex(softmax(Array.from(logits), this.config.temperature));
    } else {
      idx = sampleAction(this.net, vec, this.config.temperature);
    }
    this.config.onDecision?.(vec, idx);
    applyAction(this.fighter, this.opponent, ACTIONS[idx]);
  }
}

function sampleIndex(probs: number[]): number {
  let r = Math.random();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return i;
  }
  return probs.length - 1;
}