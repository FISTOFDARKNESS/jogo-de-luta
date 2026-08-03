import { deserializeNet, forwardNet, OFFSET, L1, L2, OUT } from '../src/ai/neuralNet.js';
import { INPUT_SIZE } from '../src/ai/aiController.js';
import * as tf from '@tensorflow/tfjs';
import * as fs from 'node:fs';
import * as path from 'node:path';

async function main(): Promise<void> {
  await tf.ready();
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'assets', 'neural-bot', 'weights.json'), 'utf-8'));
  const net = deserializeNet(raw.net);
  const { w1, b1, w2, b2, w3, b3 } = OFFSET;

  // Modelo tfjs com ops explícitas (sem layers/setWeights)
  const k1 = tf.tensor2d(Array.from(net.slice(w1, w1 + INPUT_SIZE * L1)), [INPUT_SIZE, L1]);
  const bi1 = tf.tensor1d(Array.from(net.slice(b1, b1 + L1)));
  const k2 = tf.tensor2d(Array.from(net.slice(w2, w2 + L1 * L2)), [L1, L2]);
  const bi2 = tf.tensor1d(Array.from(net.slice(b2, b2 + L2)));
  const k3 = tf.tensor2d(Array.from(net.slice(w3, w3 + L2 * OUT)), [L2, OUT]);
  const bi3 = tf.tensor1d(Array.from(net.slice(b3, b3 + OUT)));

  function predictOps(vec: number[]): number[] {
    const x = tf.tensor2d([vec], [1, INPUT_SIZE]);
    const h1 = tf.tanh(tf.add(tf.matMul(x, k1), bi1));
    const h2 = tf.relu(tf.add(tf.matMul(h1, k2), bi2));
    const logits = tf.add(tf.matMul(h2, k3), bi3);
    const out = Array.from((logits as tf.Tensor).dataSync() as Float32Array);
    x.dispose(); h1.dispose(); h2.dispose(); logits.dispose();
    return out;
  }

  let maxDelta = 0;
  let mismatched = 0;
  for (let t = 0; t < 5000; t++) {
    const vec: number[] = [];
    for (let i = 0; i < INPUT_SIZE; i++) vec.push(Math.random() * 2 - 1);
    const js = forwardNet(net, vec);
    const ops = predictOps(vec);
    for (let a = 0; a < js.length; a++) {
      const d = Math.abs(js[a] - ops[a]);
      if (d > maxDelta) maxDelta = d;
      if (Math.sign(js[a]) !== Math.sign(ops[a]) && Math.abs(js[a] - ops[a]) > 1e-3) mismatched++;
    }
  }
  console.log('paridade OPS vs JS | max |delta| logits:', maxDelta.toExponential(2));
  console.log('logits inconsistentes (delta>1e-3 com sinais opostos):', mismatched);
}

main().catch((err) => { console.error(err); process.exit(1); });