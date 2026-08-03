import * as tf from '@tensorflow/tfjs';
import { INPUT_SIZE, ACTION_COUNT } from './aiController.js';

// MLP: 30 entradas -> 96 (tanh) -> 48 (relu) -> 16 logits (ações).
// O treinamento usa a versão pura em JS (rápida, sem overhead de backend);
// no runtime do jogo o NeuralBotFighter reconstrói a MESMA arquitetura como
// um modelo TensorFlow.js (tf.layers) e infere com model.predict().
//
// Layout plano do genoma: [W1(30*96) b1(96) W2(96*48) b2(48) W3(48*16) b3(16)]

export const L1 = 96;
export const L2 = 48;
export const OUT = ACTION_COUNT;

export const NET_SIZE = INPUT_SIZE * L1 + L1 + L1 * L2 + L2 + L2 * OUT + OUT;

export const OFFSET = {
  w1: 0,
  b1: INPUT_SIZE * L1,
  w2: INPUT_SIZE * L1 + L1,
  b2: INPUT_SIZE * L1 + L1 + L1 * L2,
  w3: INPUT_SIZE * L1 + L1 + L1 * L2 + L2,
  b3: INPUT_SIZE * L1 + L1 + L1 * L2 + L2 + L2 * OUT,
};

export function createRandomNet(rng: () => number = Math.random): Float32Array {
  const net = new Float32Array(NET_SIZE);
  for (let i = 0; i < net.length; i++) {
    net[i] = (rng() * 2 - 1) * 0.3;
  }
  return net;
}

// Forward pass puro (sem softmax): retorna os logits por ação.
export function forwardNet(net: Float32Array, vec: number[]): number[] {
  const { w1, b1, w2, b2, w3, b3 } = OFFSET;

  const h1 = new Float32Array(L1);
  for (let j = 0; j < L1; j++) {
    let s = net[b1 + j];
    const row = w1 + j * INPUT_SIZE;
    for (let i = 0; i < INPUT_SIZE; i++) s += net[row + i] * vec[i];
    h1[j] = Math.tanh(s);
  }

  const h2 = new Float32Array(L2);
  for (let j = 0; j < L2; j++) {
    let s = net[b2 + j];
    const row = w2 + j * L1;
    for (let i = 0; i < L1; i++) s += net[row + i] * h1[i];
    h2[j] = Math.max(0, s); // relu
  }

  const logits = new Array<number>(OUT);
  for (let j = 0; j < OUT; j++) {
    let s = net[b3 + j];
    const row = w3 + j * L2;
    for (let i = 0; i < L2; i++) s += net[row + i] * h2[i];
    logits[j] = s;
  }
  return logits;
}

export function softmax(logits: number[], temperature = 1): number[] {
  let max = -Infinity;
  for (const l of logits) if (l > max) max = l;
  const exps = logits.map((l) => Math.exp((l - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

// Amostra uma ação pela distribuição softmax (temperatura controla agressividade).
export function sampleAction(net: Float32Array, vec: number[], temperature = 1, rng: () => number = Math.random): number {
  const probs = softmax(forwardNet(net, vec), temperature);
  let r = rng();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return i;
  }
  return probs.length - 1;
}

export function mutateNet(net: Float32Array, sigma: number, rng: () => number = Math.random): Float32Array {
  const copy = new Float32Array(net);
  for (let i = 0; i < copy.length; i++) {
    copy[i] += gaussian(rng) * sigma;
  }
  return copy;
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SerializedNet {
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number[];
  w3: number[];
  b3: number[];
}

export function serializeNet(net: Float32Array): SerializedNet {
  const { w1, b1, w2, b2, w3, b3 } = OFFSET;
  const out: SerializedNet = {
    w1: Array.from(net.slice(w1, w1 + INPUT_SIZE * L1)),
    b1: Array.from(net.slice(b1, b1 + L1)),
    w2: Array.from(net.slice(w2, w2 + L1 * L2)),
    b2: Array.from(net.slice(b2, b2 + L2)),
    w3: Array.from(net.slice(w3, w3 + L2 * OUT)),
    b3: Array.from(net.slice(b3, b3 + OUT)),
  };
  return out;
}

export function deserializeNet(data: SerializedNet): Float32Array {
  const net = new Float32Array(NET_SIZE);
  const { w1, b1, w2, b2, w3, b3 } = OFFSET;
  net.set(data.w1, w1);
  net.set(data.b1, b1);
  net.set(data.w2, w2);
  net.set(data.b2, b2);
  net.set(data.w3, w3);
  net.set(data.b3, b3);
  return net;
}

// ---------------------------------------------------------------------------
// Runtime: modelo TensorFlow.js equivalente, para inferência no navegador.
// ---------------------------------------------------------------------------

let cachedModel: tf.LayersModel | null = null;

export function getTfjsModel(data: SerializedNet): tf.LayersModel {
  if (cachedModel) {
    cachedModel.setWeights([
      tf.tensor2d(data.w1, [INPUT_SIZE, L1]),
      tf.tensor1d(data.b1),
      tf.tensor2d(data.w2, [L1, L2]),
      tf.tensor1d(data.b2),
      tf.tensor2d(data.w3, [L2, OUT]),
      tf.tensor1d(data.b3),
    ]);
    return cachedModel;
  }
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: L1, activation: 'tanh', inputShape: [INPUT_SIZE] }));
  model.add(tf.layers.dense({ units: L2, activation: 'relu' }));
  model.add(tf.layers.dense({ units: OUT }));
  model.setWeights([
    tf.tensor2d(data.w1, [INPUT_SIZE, L1]),
    tf.tensor1d(data.b1),
    tf.tensor2d(data.w2, [L1, L2]),
    tf.tensor1d(data.b2),
    tf.tensor2d(data.w3, [L2, OUT]),
    tf.tensor1d(data.b3),
  ]);
  cachedModel = model;
  return model;
}

export async function predictWithTfjs(data: SerializedNet, vec: number[]): Promise<number[]> {
  const model = getTfjsModel(data);
  const input = tf.tensor2d([vec], [1, INPUT_SIZE]);
  const output = model.predict(input) as tf.Tensor;
  const logits = Array.from(await output.data());
  input.dispose();
  output.dispose();
  return logits;
}