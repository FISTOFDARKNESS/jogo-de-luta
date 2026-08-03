import { deserializeNet } from '../src/ai/neuralNet.js';
import { runRound, NeuralPilot, ScriptedPilot, type Pilot } from './sim.js';
import * as fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync(new URL('../public/assets/neural-bot/weights.json', import.meta.url), 'utf-8'));
const net = deserializeNet(raw.net);

const TEMP = parseFloat(process.argv[2] ?? '0.25');

function neuralPilotOnce(net: Float32Array): Pilot {
  const p = new NeuralPilot(net, TEMP);
  return (dt, me, opp) => p.step(dt, me, opp);
}

function scriptedOnce(diff: any): Pilot {
  const p = new ScriptedPilot(diff);
  return (dt, me, opp) => p.step(dt, me, opp);
}

let wins = 0, draws = 0, losses = 0;
let totalMyDmg = 0, totalOppDmg = 0;
for (let i = 0; i < 60; i++) {
  const r = runRound(neuralPilotOnce(net), scriptedOnce('nightmare'), { timeLimit: 45 });
  if (r.winner === 'left') wins++;
  else if (r.winner === 'draw') draws++;
  else losses++;
  totalMyDmg += 100 - r.leftHealth;
  totalOppDmg += 100 - r.rightHealth;
}
console.log(`vs nightmare (60 lutas): W=${wins} D=${draws} L=${losses} (${((wins + draws * 0.5) / 60).toFixed(2)})`);
console.log(`dano medio meu=${(totalMyDmg / 60).toFixed(1)} opp=${(totalOppDmg / 60).toFixed(1)}`);

for (const diff of ['easy', 'normal', 'hard', 'expert', 'nightmare'] as const) {
  let w = 0, d = 0, l = 0;
  for (let i = 0; i < 30; i++) {
    const r = runRound(neuralPilotOnce(net), scriptedOnce(diff), { timeLimit: 45 });
    if (r.winner === 'left') w++; else if (r.winner === 'draw') d++; else l++;
  }
  console.log(`vs ${diff} (30): W=${w} D=${d} L=${l} (${((w + d * 0.5) / 30).toFixed(2)})`);
}