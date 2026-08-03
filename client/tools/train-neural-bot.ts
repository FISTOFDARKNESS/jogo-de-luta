// Treinamento offline do bot neural (evolução auto-play com TensorFlow.js? Não:
// genomas são MLPs puras; o runtime usa tfjs). Rode a partir da pasta client:
//   node tools/train-neural-bot.js [generations]
// Saída: client/public/assets/neural-bot/weights.json

import { createRandomNet, mutateNet, serializeNet } from '../src/ai/neuralNet.js';
import { runRound, NeuralPilot, ScriptedPilot, type Pilot } from './sim.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const GENERATIONS = parseInt(process.argv[2] ?? '80');
const POP = 64;
const TRAIN_TEMP = 0.8;
const EVAL_TEMP = 0.25;
const ROUND_TIME = 45;

function neuralPilot(net: Float32Array, temperature: number): Pilot {
  const p = new NeuralPilot(net, temperature);
  return (dt, me, opp) => p.step(dt, me, opp);
}

function scriptedPilot(diff: 'easy' | 'normal' | 'hard' | 'expert' | 'nightmare'): Pilot {
  const p = new ScriptedPilot(diff);
  return (dt, me, opp) => p.step(dt, me, opp);
}

interface ActionStats {
  distinct: Set<string>;
  decisions: number;
  maxStreak: number;
  jumps: number;
  airFrames: number;
  frames: number;
}

// Envolve um piloto contando as ações escolhidas por luta. Usado para
// pressionar o fitness contra políticas degeneradas (ex.: spam de mortal).
function withActionStats(pilot: Pilot): { pilot: Pilot; stats: ActionStats } {
  const stats: ActionStats = { distinct: new Set(), decisions: 0, maxStreak: 0, jumps: 0, airFrames: 0, frames: 0 };
  let lastAction: string | null = null;
  let streak = 0;
  const wrapped: Pilot = (dt, me, opp) => {
    stats.frames++;
    if (!me.isOnGround) stats.airFrames++;
    const wasGrounded = me.isOnGround;
    const before = me.state;
    pilot(dt, me, opp);
    const after = me.state;
    // Salto aplicado: saiu do chão na mesma decisão (sem dano)
    if (wasGrounded && !me.isOnGround && me.hitstunTimer === 0) {
      stats.jumps++;
    }
    if (before !== after && me.attackType) {
      const action = me.attackType;
      stats.distinct.add(action);
      stats.decisions++;
      streak = action === lastAction ? streak + 1 : 1;
      lastAction = action;
      if (streak > stats.maxStreak) stats.maxStreak = streak;
    }
  };
  return { pilot: wrapped, stats };
}

function diversityBonus(stats: ActionStats): number {
  let bonus = Math.min(0.6, stats.distinct.size * 0.06);
  bonus += stats.decisions > 5 ? 0.15 : 0;
  if (stats.maxStreak > 10) bonus -= 0.4;
  return bonus;
}

// Penaliza pulos excessivos e tempo no ar: o bot só deve pular quando compensa.
function jumpPenalty(stats: ActionStats): number {
  const jumps = -0.5 * Math.max(0, stats.jumps - 6);
  const airRatio = stats.frames > 0 ? stats.airFrames / stats.frames : 0;
  const air = -1.0 * Math.max(0, airRatio - 0.25);
  return jumps + air;
}

function fightFitness(pilotA: Pilot, pilotB: Pilot): [number, number] {
  const sa = withActionStats(pilotA);
  const sb = withActionStats(pilotB);
  const r = runRound(sa.pilot, sb.pilot, { timeLimit: ROUND_TIME });
  const aLost = 100 - r.leftHealth;
  const bLost = 100 - r.rightHealth;
  // Vitória vale 1.5, empate 0.25; bônus por rodada sem tomar dano;
  // dano dado - dano sofrido empurra o fitness (defesa importa).
  const fa =
    (r.winner === 'left' ? 1.5 : r.winner === 'draw' ? 0.25 : 0) +
    (aLost === 0 ? 0.5 : 0) +
    (bLost - aLost) / 150 +
    diversityBonus(sa.stats) +
    jumpPenalty(sa.stats);
  const fb =
    (r.winner === 'right' ? 1.5 : r.winner === 'draw' ? 0.25 : 0) +
    (bLost === 0 ? 0.5 : 0) +
    (aLost - bLost) / 150 +
    diversityBonus(sb.stats) +
    jumpPenalty(sb.stats);
  return [fa, fb];
}

function evaluateVsScripted(net: Float32Array, diff: 'easy' | 'normal' | 'hard' | 'expert' | 'nightmare', rounds = 10): number {
  let wins = 0;
  for (let i = 0; i < rounds; i++) {
    const r = runRound(neuralPilot(net, EVAL_TEMP), scriptedPilot(diff), { timeLimit: ROUND_TIME });
    if (r.winner === 'left') wins += 1;
    else if (r.winner === 'draw') wins += 0.5;
  }
  return wins / rounds;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main(): Promise<void> {
  console.log(`Treinando MLP neural-bot: pop=${POP}, geracoes=${GENERATIONS}`);
  const t0 = Date.now();

  let pop: Float32Array[] = Array.from({ length: POP }, () => createRandomNet());
  let best: Float32Array = pop[0].slice();
  let bestFitness = -Infinity;
  let bestGen = 0;
  let order: number[] = Array.from({ length: POP }, (_, i) => i);

  for (let gen = 0; gen < GENERATIONS; gen++) {
    const sigma = Math.max(0.02, 0.15 * Math.pow(0.97, gen));
    const fitness = new Float32Array(POP);
    const opponents = shuffle(Array.from({ length: POP }, (_, i) => i));

    // Rounds 0-1: auto-play (pares aleatórios); round 2: vs scripted hard; round 3: vs scripted nightmare
    for (let round = 0; round < 4; round++) {
      if (round === 2 || round === 3) {
        const diff = round === 2 ? 'hard' : 'nightmare';
        for (let i = 0; i < POP; i++) {
          const [fa, fb] = fightFitness(neuralPilot(pop[i], TRAIN_TEMP), scriptedPilot(diff));
          fitness[i] += fa;
        }
      } else {
        shuffle(opponents);
        for (let i = 0; i + 1 < POP; i += 2) {
          const a = opponents[i];
          const b = opponents[i + 1];
          const [fa, fb] = fightFitness(neuralPilot(pop[a], TRAIN_TEMP), neuralPilot(pop[b], TRAIN_TEMP));
          fitness[a] += fa;
          fitness[b] += fb;
        }
      }
    }

    order = Array.from({ length: POP }, (_, i) => i).sort((x, y) => fitness[y] - fitness[x]);

    if (fitness[order[0]] > bestFitness) {
      bestFitness = fitness[order[0]];
      best = pop[order[0]].slice();
      bestGen = gen;
    }

    const elites = order.slice(0, 16);
    const newPop: Float32Array[] = [];
    for (const e of elites) newPop.push(pop[e].slice());
    while (newPop.length < POP) {
      const parent = pop[elites[Math.floor(Math.random() * elites.length)]];
      newPop.push(mutateNet(parent, sigma));
    }
    pop = newPop;

    if (gen % 10 === 0 || gen === GENERATIONS - 1) {
      const wr = evaluateVsScripted(best, 'nightmare', 20);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(
        `[gen ${gen}] fitness=${bestFitness.toFixed(3)} (gen ${bestGen}) vsNightmare=${(wr * 100).toFixed(0)}% | ${elapsed}s`
      );
      if (wr >= 0.85) {
        console.log('Atingiu 85%+ de vitoria contra NIGHTMARE scripted. Parando cedo.');
        break;
      }
    }
  }

  // Playoff final: entre os elites da última geração + o best-so-far, escolhe
  // o mais consistente contra o scripted nightmare (menos loteria que só fitness).
  console.log('\nPlayoff entre elites (30 rodadas vs nightmare cada):');
  const candidates = [best, ...order.slice(0, 4).map((i) => pop[i])];
  let champion = best;
  let championWr = -1;
  for (let ci = 0; ci < candidates.length; ci++) {
    const wr = evaluateVsScripted(candidates[ci], 'nightmare', 30);
    console.log(`  elite ${ci}: ${(wr * 100).toFixed(0)}%`);
    if (wr > championWr) {
      championWr = wr;
      champion = candidates[ci];
    }
  }
  best = champion.slice();

  console.log(`\nCampeao: ${(championWr * 100).toFixed(0)}% vs nightmare scripted`);

  // Validação final: melhor de 3 rodadas contra o bot scripted nightmare
  console.log('Validacao final (melhor de 3, 5 lutas):');
  for (let match = 0; match < 5; match++) {
    let score = 0;
    for (let i = 0; i < 3; i++) {
      const r = runRound(neuralPilot(best, EVAL_TEMP), scriptedPilot('nightmare'), { timeLimit: ROUND_TIME });
      if (r.winner === 'left') score++;
    }
    console.log(`  luta ${match + 1}: ${score}/3 rodadas`);
  }
  console.log('\nWinrate vs outras dificuldades scripted (20 rodadas cada):');
  for (const diff of ['normal', 'hard', 'expert'] as const) {
    const wr = evaluateVsScripted(best, diff, 20);
    console.log(`  vs ${diff}: ${(wr * 100).toFixed(0)}%`);
  }

  const dir = path.join(process.cwd(), 'public', 'assets', 'neural-bot');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'weights.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      meta: {
        trainedAt: new Date().toISOString(),
        generations: bestGen,
        inputSize: 30,
        hidden1: 96,
        hidden2: 48,
        outputs: 16,
      },
      net: serializeNet(best),
    })
  );
  console.log(`\nModelo salvo em ${file} (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});