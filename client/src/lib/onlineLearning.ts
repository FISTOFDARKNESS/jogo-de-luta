import { INPUT_SIZE, ACTION_COUNT } from '../ai/aiController.js';
import {
  deserializeNet,
  serializeNet,
  NET_SIZE,
  OFFSET,
  L1,
  L2,
  OUT,
  type SerializedNet,
} from '../ai/neuralNet.js';

// Aprendizado online do bot neural (depois de cada vitória do jogador):
// - imitação: o bot aprende (estado -> ação) a partir das ações do jogador
//   na partida vencida (target = one-hot da ação, scale = 1);
// - reforço: as decisões do próprio bot são reforçadas pela vantagem
//   (dano dado - dano sofrido) acumulada entre as decisões (scale pode ser
//   negativo = penaliza).
// Backprop 100% em JS (sem tfjs): MLP 30-96(tanh)-48(relu)-16(softmax).

export interface TrainSample {
  feature: number[];
  actionIdx: number;
  scale: number;
}

// ---------------------------------------------------------------------------
// SGD (um exemplo por vez) com regularização em direção ao baseline.
// ---------------------------------------------------------------------------

export function trainSgd(
  net: Float32Array,
  base: Float32Array,
  samples: TrainSample[],
  lr: number,
  alphaReg: number,
  maxGradNorm: number = 5,
): number {
  const grad = new Float32Array(NET_SIZE);
  const h1 = new Float32Array(L1);
  const h2 = new Float32Array(L2);
  const dh1 = new Float32Array(L1);
  const dh2 = new Float32Array(L2);
  const logits = new Array<number>(OUT);
  const probs = new Array<number>(OUT);
  const dLogits = new Array<number>(OUT);
  const { w1, b1, w2, b2, w3, b3 } = OFFSET;

  let totalLoss = 0;

  for (const s of samples) {
    const x = s.feature;
    const target = s.actionIdx;

    // Forward
    for (let j = 0; j < L1; j++) {
      let acc = net[b1 + j];
      const row = w1 + j * INPUT_SIZE;
      for (let i = 0; i < INPUT_SIZE; i++) acc += net[row + i] * x[i];
      h1[j] = Math.tanh(acc);
    }
    for (let j = 0; j < L2; j++) {
      let acc = net[b2 + j];
      const row = w2 + j * L1;
      for (let i = 0; i < L1; i++) acc += net[row + i] * h1[i];
      h2[j] = acc > 0 ? acc : 0;
    }
    for (let j = 0; j < OUT; j++) {
      let acc = net[b3 + j];
      const row = w3 + j * L2;
      for (let i = 0; i < L2; i++) acc += net[row + i] * h2[i];
      logits[j] = acc;
    }

    let max = -Infinity;
    for (const l of logits) if (l > max) max = l;
    let sum = 0;
    for (let j = 0; j < OUT; j++) {
      probs[j] = Math.exp(logits[j] - max);
      sum += probs[j];
    }
    for (let j = 0; j < OUT; j++) probs[j] /= sum;

    totalLoss += -s.scale * Math.log(Math.max(1e-7, probs[target]));

    for (let j = 0; j < OUT; j++) dLogits[j] = s.scale * (probs[j] - (j === target ? 1 : 0));

    // Backward (gradientes zerados por exemplo)
    grad.fill(0);

    for (let j = 0; j < OUT; j++) {
      const d = dLogits[j];
      grad[b3 + j] += d;
      const row = w3 + j * L2;
      for (let i = 0; i < L2; i++) grad[row + i] += d * h2[i];
    }
    dh2.fill(0);
    for (let i = 0; i < L2; i++) {
      let acc = 0;
      for (let j = 0; j < OUT; j++) acc += dLogits[j] * net[w3 + j * L2 + i];
      dh2[i] = acc * (h2[i] > 0 ? 1 : 0);
    }
    for (let j = 0; j < L2; j++) {
      const d = dh2[j];
      grad[b2 + j] += d;
      const row = w2 + j * L1;
      for (let i = 0; i < L1; i++) grad[row + i] += d * h1[i];
    }
    dh1.fill(0);
    for (let i = 0; i < L1; i++) {
      let acc = 0;
      for (let j = 0; j < L2; j++) acc += dh2[j] * net[w2 + j * L1 + i];
      dh1[i] = acc * (1 - h1[i] * h1[i]);
    }
    for (let j = 0; j < L1; j++) {
      const d = dh1[j];
      grad[b1 + j] += d;
      const row = w1 + j * INPUT_SIZE;
      for (let i = 0; i < INPUT_SIZE; i++) grad[row + i] += d * x[i];
    }

    // Atualização com regularização (não deixa divergir do baseline).
    // Clipping por norma L2 evita explosão numérica com amostras de reforço.
    let gNorm = 0;
    for (let i = 0; i < NET_SIZE; i++) gNorm += grad[i] * grad[i];
    gNorm = Math.sqrt(gNorm);
    const clip = gNorm > maxGradNorm ? maxGradNorm / gNorm : 1;
    for (let i = 0; i < NET_SIZE; i++) {
      if (!Number.isFinite(grad[i]) || !Number.isFinite(net[i])) continue;
      net[i] -= lr * (grad[i] * clip + alphaReg * (net[i] - base[i]));
    }
  }

  return samples.length > 0 ? totalLoss / samples.length : 0;
}

// ---------------------------------------------------------------------------
// Treino async em chunks (não trava o frame do jogo).
// ---------------------------------------------------------------------------

export interface TrainOnlineParams {
  net: Float32Array;
  base: Float32Array;
  samples: TrainSample[];
  lr: number;
  epochs: number;
  alphaReg: number;
  chunkSamples?: number;
}

export async function trainOnlineAsync(
  params: TrainOnlineParams,
  onProgress?: (epoch: number, loss: number) => void
): Promise<void> {
  const { net, base, samples, lr, epochs, alphaReg } = params;
  const chunk = params.chunkSamples ?? 32;
  if (samples.length === 0) return;

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let start = 0; start < samples.length; start += chunk) {
      const end = Math.min(start + chunk, samples.length);
      trainSgd(net, base, samples.slice(start, end), lr, alphaReg);
      await new Promise((r) => setTimeout(r, 0));
    }
    const loss = trainSgdLoss(net, samples);
    onProgress?.(epoch, loss);
  }
}

export function trainSgdLoss(net: Float32Array, samples: TrainSample[]): number {
  let total = 0;
  for (const s of samples) {
    const logits = forwardLogits(net, s.feature);
    let max = -Infinity;
    for (const l of logits) if (l > max) max = l;
    let sum = 0;
    const p = logits.map((l) => {
      const e = Math.exp(l - max);
      sum += e;
      return e;
    });
    const prob = p[s.actionIdx] / sum;
    total += -s.scale * Math.log(Math.max(1e-7, prob));
  }
  return samples.length > 0 ? total / samples.length : 0;
}

function forwardLogits(net: Float32Array, x: number[]): number[] {
  const { w1, b1, w2, b2, w3, b3 } = OFFSET;
  const h1 = new Float32Array(L1);
  for (let j = 0; j < L1; j++) {
    let acc = net[b1 + j];
    const row = w1 + j * INPUT_SIZE;
    for (let i = 0; i < INPUT_SIZE; i++) acc += net[row + i] * x[i];
    h1[j] = Math.tanh(acc);
  }
  const h2 = new Float32Array(L2);
  for (let j = 0; j < L2; j++) {
    let acc = net[b2 + j];
    const row = w2 + j * L1;
    for (let i = 0; i < L1; i++) acc += net[row + i] * h1[i];
    h2[j] = acc > 0 ? acc : 0;
  }
  const logits = new Array<number>(OUT);
  for (let j = 0; j < OUT; j++) {
    let acc = net[b3 + j];
    const row = w3 + j * L2;
    for (let i = 0; i < L2; i++) acc += net[row + i] * h2[i];
    logits[j] = acc;
  }
  return logits;
}

// ---------------------------------------------------------------------------
// Gravação da partida (decisões do bot + ações do jogador vencedor).
// ---------------------------------------------------------------------------

// Espelha um vetor de features do referencial de um lutador para o do outro
// (relX/relY trocam de sinal, me<->opp são trocados, facing inverte).
// Necessário para imitação: a ação do jogador vencedor, registrada em seu
// ponto de vista, deve se tornar um alvo no ponto de vista do bot.
export function mirrorFeature(fv: number[]): number[] {
  const f = fv.slice();
  // estados: me (0..7) <-> opp (8..15)
  const meStates = fv.slice(0, 8);
  const oppStates = fv.slice(8, 16);
  for (let i = 0; i < 8; i++) {
    f[i] = oppStates[i];
    f[8 + i] = meStates[i];
  }
  f[16] = -fv[16]; // relX
  f[18] = -fv[18]; // relY
  [f[19], f[20]] = [fv[20], fv[19]]; // health
  [f[21], f[22]] = [fv[22], fv[21]]; // super
  [f[23], f[24]] = [fv[24], fv[23]]; // posture
  [f[25], f[26]] = [fv[26], fv[25]]; // cooldown
  [f[27], f[28]] = [fv[28], fv[27]]; // special
  f[29] = fv[29] ? 0 : 1; // facingOpp
  return f;
}

export class MatchRecorder {
  private botEntries: { feature: number[]; actionIdx: number; reward: number }[] = [];
  private playerEntries: { feature: number[]; actionIdx: number }[] = [];
  private botHealth: number;
  private oppHealth: number;
  private lastPlayerAction = { idx: -1, at: -Infinity };
  private playerDedupeMs = 120;

  constructor(
    private bot: any,
    private player: any,
    private now: () => number = () => Date.now()
  ) {
    this.botHealth = bot.health;
    this.oppHealth = player.health;
  }

  get size(): number {
    return this.botEntries.length + this.playerEntries.length;
  }

  getPlayerEntries(max = 300): { feature: number[]; actionIdx: number }[] {
    const step = Math.max(1, Math.ceil(this.playerEntries.length / max));
    const out: { feature: number[]; actionIdx: number }[] = [];
    for (let i = 0; i < this.playerEntries.length; i += step) out.push(this.playerEntries[i]);
    return out;
  }

  // Chamado a cada decisão do bot (antes de aplicar a ação).
  recordBotDecision(feature: number[], actionIdx: number): void {
    const n = this.bot.health;
    const o = this.player.health;
    if (this.botEntries.length > 0) {
      const prev = this.botEntries[this.botEntries.length - 1];
      prev.reward = this.oppHealth - o - (this.botHealth - n);
    }
    this.botHealth = n;
    this.oppHealth = o;
    this.botEntries.push({ feature: feature.slice(), actionIdx, reward: 0 });
  }

  // Chamado a cada input relevante do jogador (o que venceu). A feature é
  // espelhada para o referencial do bot antes de guardar (imitação correta).
  recordPlayerAction(feature: number[], actionIdx: number): void {
    if (this.player.ko || this.player.hitstunTimer > 0) return;
    const nowMs = this.now();
    if (nowMs - this.lastPlayerAction.at < this.playerDedupeMs && this.lastPlayerAction.idx === actionIdx) return;
    this.lastPlayerAction = { idx: actionIdx, at: nowMs };
    this.playerEntries.push({ feature: mirrorFeature(feature), actionIdx });
  }

  // Fecha a recompensa da última decisão (fim da partida/rodada).
  finalize(): void {
    const n = this.bot.health;
    const o = this.player.health;
    if (this.botEntries.length > 0) {
      const prev = this.botEntries[this.botEntries.length - 1];
      prev.reward = this.oppHealth - o - (this.botHealth - n);
    }
    this.botHealth = n;
    this.oppHealth = o;
  }

  buildSamples(opts?: { gamma?: number; maxBot?: number; maxPlayer?: number; rewardCap?: number }): TrainSample[] {
    const gamma = opts?.gamma ?? 0.95;
    const rewardCap = opts?.rewardCap ?? 2;
    const out: TrainSample[] = [];

    const rewards = this.botEntries.map((e) => e.reward);
    let G = 0;
    const returns = new Array<number>(rewards.length);
    for (let i = rewards.length - 1; i >= 0; i--) {
      G = rewards[i] + gamma * G;
      returns[i] = Math.max(-rewardCap, Math.min(rewardCap, G));
    }
    const botStep = Math.max(1, Math.ceil(returns.length / (opts?.maxBot ?? 500)));
    for (let i = 0; i < returns.length; i += botStep) {
      out.push({ feature: this.botEntries[i].feature, actionIdx: this.botEntries[i].actionIdx, scale: returns[i] });
    }

    const playerStep = Math.max(1, Math.ceil(this.playerEntries.length / (opts?.maxPlayer ?? 300)));
    for (let i = 0; i < this.playerEntries.length; i += playerStep) {
      out.push({ feature: this.playerEntries[i].feature, actionIdx: this.playerEntries[i].actionIdx, scale: 1 });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Persistência em localStorage (navegador).
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'neuralBotWeights_v1';

export function loadWeightsFromStorage(): SerializedNet | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!isValidSerializedNet(data)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveWeightsToStorage(serialized: SerializedNet): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!isValidSerializedNet(serialized)) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // quota/privacidade: falha silenciosa, o jogo continua com pesos em memória
  }
}

export function isValidSerializedNet(data: unknown): data is SerializedNet {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.w1) || d.w1.length !== INPUT_SIZE * L1) return false;
  if (!Array.isArray(d.b1) || d.b1.length !== L1) return false;
  if (!Array.isArray(d.w2) || d.w2.length !== L1 * L2) return false;
  if (!Array.isArray(d.b2) || d.b2.length !== L2) return false;
  if (!Array.isArray(d.w3) || d.w3.length !== L2 * OUT) return false;
  if (!Array.isArray(d.b3) || d.b3.length !== OUT) return false;
  return true;
}

export { deserializeNet, serializeNet, NET_SIZE, ACTION_COUNT };
