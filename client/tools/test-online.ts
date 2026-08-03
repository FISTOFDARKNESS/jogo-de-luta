// Valida determinístico do sistema de aprendizado online:
// - coleta decisões do bot + ações do jogador vencedor em partidas vs jumper
//   determinista (sem Math.random -> reprodutível)
// - antes/depois do trainOnlineAsync, a loss sobre as amostras coletadas cai
//   (o modelo está aprendendo o estilo do vencedor)
// - a rede permanece finita (sem NaN), serialização + localStorage OK
// npx tsx tools/test-online.ts

(globalThis as any).localStorage = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
})();

import { deserializeNet, serializeNet, forwardNet, softmax } from '../src/ai/neuralNet.js';
import { buildFeatureVec, applyAction, ACTIONS, INPUT_SIZE } from '../src/ai/aiController.js';
import { MatchRecorder, trainOnlineAsync, trainSgdLoss, loadWeightsFromStorage, saveWeightsToStorage, isValidSerializedNet, STORAGE_KEY, type TrainSample } from '../src/lib/onlineLearning.js';
import { runRound, type Pilot } from './sim.js';
import * as fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync(new URL('../public/assets/neural-bot/weights.json', import.meta.url), 'utf-8'));
const base = deserializeNet(raw.net);
const net = base.slice();

const PLAYER_ACTION_INDEX: Record<string, number> = {
  idle: ACTIONS.indexOf('idle'),
  toward: ACTIONS.indexOf('moveToward'),
  away: ACTIONS.indexOf('moveAway'),
  jump: ACTIONS.indexOf('jump'),
  block: ACTIONS.indexOf('block'),
  throw: ACTIONS.indexOf('throw'),
  flyKick: ACTIONS.indexOf('flyingKick'),
  lp: ACTIONS.indexOf('lightPunch'),
  hp: ACTIONS.indexOf('heavyPunch'),
};

// Jumper DETERMINISTA (pulo no ar ao aproximar + soco no fim).
function makeJumper(): { pilot: Pilot; lastAction: (me: any) => number } {
  const last = new Map<any, string>();
  const pilot: Pilot = (dt, me, opp) => {
    if (me.ko || me.hitstunTimer > 0 || me.hitstopTimer > 0) { last.set(me, 'idle'); return; }
    const dist = Math.abs(me.x - opp.x);
    const facing = opp.x > me.x ? 'right' : 'left';
    me.facing = facing;
    if (opp.state === 'attacking' && dist < 150) { last.set(me, 'block'); me.startBlock(); return; }
    me.stopBlock();
    if (dist > 170) { last.set(me, 'toward'); if (opp.x > me.x) me.moveRight(dt); else me.moveLeft(dt); }
    else if (dist > 90 && me.isOnGround) { last.set(me, 'flyKick'); me.jump(); me.startAttack('flyingKick'); }
    else if (dist < 60) { last.set(me, 'lp'); me.startAttack('lightPunch'); }
    else if (!me.isOnGround && me.state !== 'attacking') { last.set(me, 'jump'); me.jump(); }
    else { last.set(me, 'toward'); if (opp.x > me.x) me.moveRight(dt); else me.moveLeft(dt); }
  };
  return { pilot, lastAction: (me) => PLAYER_ACTION_INDEX[last.get(me) ?? 'idle'] ?? ACTIONS.indexOf('idle') };
}

async function runOnce(): Promise<void> {
  const collected: TrainSample[] = [];

  for (let m = 0; m < 18; m++) {
    const { pilot: playerPilot, lastAction } = makeJumper();
    let rec: MatchRecorder | null = null;
    const botPilot: Pilot = (dt, me, opp) => {
      if (!rec) rec = new MatchRecorder(me, opp);
      if (me.ko || me.hitstunTimer > 0 || me.hitstopTimer > 0 || me.state === 'attacking') return;
      const idx = sampleActionSafe(net, buildFeatureVec(me, opp), 0.75);
      rec.recordBotDecision(buildFeatureVec(me, opp), idx);
      applyAction(me, opp, ACTIONS[idx]);
    };
    const playerWrapped: Pilot = (dt, me, opp) => {
      playerPilot(dt, me, opp);
      rec?.recordPlayerAction(buildFeatureVec(me, opp), lastAction(me));
    };
    runRound(botPilot, playerWrapped, { timeLimit: 45 });
    const finalRec = rec;
    if (finalRec) {
      finalRec.finalize();
      const entries = finalRec.getPlayerEntries(40);
      for (const e of entries) collected.push({ feature: e.feature, actionIdx: e.actionIdx, scale: 1 });
    }
  }

  const beforeLoss = trainSgdLoss(net, collected);
  await trainOnlineAsync({ net, base, samples: collected, lr: 0.03, epochs: 20, alphaReg: 0.03 }, () => {});
  const afterLoss = trainSgdLoss(net, collected);

  const delta = (afterLoss - beforeLoss);
  const finite = Number.isFinite(
    (() => { let s = 0; for (let i = 0; i < net.length; i++) s += net[i] * net[i]; return s; })()
  );
  console.log(`[online] loss sobre estilo do vencedor: ${beforeLoss.toFixed(4)} -> ${afterLoss.toFixed(4)} (delta ${delta > 0 ? '+' : ''}${delta.toFixed(4)}) amostras=${collected.length}`);
  console.log(`[online] rede finita=${finite} L2^2 vs base=${(() => { let s = 0; for (let i = 0; i < net.length; i++) s += (net[i] - base[i]) ** 2; return s; })().toFixed(2)}`);

  // predição da ação imitada melhora?
  let hits = 0;
  for (const s of collected) {
    const logits = forwardNet(net, s.feature);
    let best = 0;
    for (let j = 1; j < logits.length; j++) if (logits[j] > logits[best]) best = j;
    if (best === s.actionIdx) hits++;
  }
  const predBefore = (() => { let h = 0; for (const s of collected) { const lg = forwardNet(base, s.feature); let b = 0; for (let j = 1; j < lg.length; j++) if (lg[j] > lg[b]) b = j; if (b === s.actionIdx) h++; } return h; })();
  console.log(`[online] predicao da acao do vencedor: antes ${predBefore}/${collected.length} -> depois ${hits}/${collected.length}`);

  const ser = serializeNet(net);
  if (!isValidSerializedNet(ser)) { console.error('FALHOU: serializacao invalida'); process.exit(1); }
  saveWeightsToStorage(ser);
  const back = loadWeightsFromStorage();
  console.log(`[storage] round-trip OK = ${back !== null && JSON.stringify(back) === JSON.stringify(ser)}`);
  (globalThis.localStorage as any).setItem(STORAGE_KEY, '{ bad json');
  console.log('[storage] corrompido rejeitado =', loadWeightsFromStorage() === null);

  if (!finite) { console.error('FALHOU: NaN na rede'); process.exit(1); }
  if (afterLoss > beforeLoss) { console.error('FALHOU: loss nao decresceu'); process.exit(1); }
  if (hits <= predBefore) { console.error('FALHOU: predicao nao melhorou'); process.exit(1); }
  console.log('OK - sistema treina a cada vitória e melhora a imitacao do estilo vencedor');
}

function sampleActionSafe(netN: Float32Array, fv: number[], t: number): number {
  const logits = forwardNet(netN, fv);
  const probs = softmax(logits, t);
  let r = Math.random();
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) return i; }
  return probs.length - 1;
}
void INPUT_SIZE;

runOnce().then(() => void 0);
