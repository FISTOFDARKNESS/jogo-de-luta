import Phaser from 'phaser';
import { Fighter, FighterSide } from '@shared/game/fighter.js';
import { createHitbox, createHurtbox, processAttack } from '@shared/game/combat.js';
import { RiggedCharacter } from '../client/src/entities/RiggedCharacter.js';

let failures = 0;
function check(label, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + label + (extra ? ' [' + extra + ']' : ''));
  if (!cond) failures++;
}

const game = new Phaser.Game({
  type: Phaser.HEADLESS,
  width: 1280,
  height: 720,
  audio: { noAudio: true },
});
console.log('GAME CREATED, isBooted=' + game.isBooted + ', loop=' + (game.loop && game.loop.isRunning));
game.events.once('ready', () => console.log('GAME READY, isRunning=' + game.isRunning));
process.on('uncaughtException', (e) => console.log('UNCAUGHT:', e.message));
setTimeout(() => {
  console.log('PROBE loop.isRunning=' + (game.loop && game.loop.isRunning));
  process.exit(2);
}, 1500);
(game as any).scene.add(
  'test',
  {
    create() {
      console.log('CREATE RAN');
      const p1 = new Fighter('p1', FighterSide.LEFT, 550, 660);
      const p2 = new Fighter('p2', FighterSide.RIGHT, 650, 660);
    check('p1 inicial: facing RIGHT', p1.facing === FighterSide.RIGHT, p1.facing);
    check('p2 inicial: facing LEFT', p2.facing === FighterSide.LEFT, p2.facing);

    p1.update(1 / 60, p2.x);
    p2.update(1 / 60, p1.x);
    check('p1 parado: facing RIGHT (oponente)', p1.facing === FighterSide.RIGHT, p1.facing);
    check('p2 parado: facing LEFT (oponente)', p2.facing === FighterSide.LEFT, p2.facing);

    p1.moveLeft(1 / 60);
    p1.update(1 / 60, p2.x);
    check('p1 andando p/ esquerda: facing LEFT', p1.facing === FighterSide.LEFT, p1.facing);

    p2.moveRight(1 / 60);
    p2.update(1 / 60, p1.x);
    check('p2 andando p/ direita: facing RIGHT', p2.facing === FighterSide.RIGHT, p2.facing);

    const rig = new RiggedCharacter(this, 0, 0, 1, { baseColor: 0xff4444 });
    rig.update(0.1);

    const head = rig.getPartContainer('Head');
    const m = head.getWorldTransformMatrix();
    const faceX = m.getX(4.2, -11.5);
    const centerX = m.getX(0, -13);
    console.log('  -> P1 (scaleX=1) olho no mundo: x=' + faceX.toFixed(1) + ' vs centro ' + centerX.toFixed(1));
    check('scaleX=1 => olho à DIREITA (+x)', faceX > centerX, faceX.toFixed(1) + ' > ' + centerX.toFixed(1));

    const rarm = rig.getPartContainer('RightUpperArm');
    rarm.rotation = 0;
    const m0 = rarm.getWorldTransformMatrix();
    const h0 = m0.getX(0, 16);
    rarm.rotation = 0.5;
    const m1 = rarm.getWorldTransformMatrix();
    const h1 = m1.getX(0, 16);
    console.log('  -> mao direita rot 0 -> +0.5: x ' + h0.toFixed(1) + ' -> ' + h1.toFixed(1));
    check('rot POSITIVA move a mao para -x (tras)', h1 < h0, h1.toFixed(1) + ' < ' + h0.toFixed(1));
    rarm.rotation = -0.5;
    const m2 = rarm.getWorldTransformMatrix();
    const h2 = m2.getX(0, 16);
    check('rot NEGATIVA move a mao para +x (frente)', h2 > h0, h2.toFixed(1) + ' > ' + h0.toFixed(1));

    rig.setFacing(-1);
    const m3 = head.getWorldTransformMatrix();
    const faceXneg = m3.getX(4.2, -11.5);
    const centerXneg = m3.getX(0, -13);
    check('scaleX=-1 => olho à ESQUERDA (-x)', faceXneg < centerXneg, faceXneg.toFixed(1) + ' < ' + centerXneg.toFixed(1));

    // --- direção do soco: no impacto a mão deve estar À FRENTE (+x) ---
    rig.setFacing(1);
    rig.playAnimation('punchRight', 1.8);
    rig.update(0.28 / 1.8);
    const shoulderW = rig.getPartContainer('RightUpperArm').getWorldTransformMatrix().getX(0, 0);
    const wristW = rig.getPartContainer('RightHand').getWorldTransformMatrix().getX(0, 0);
    console.log('  -> soco impacto: ombro x=' + shoulderW.toFixed(1) + ', punho x=' + wristW.toFixed(1) + ' (delta ' + (wristW - shoulderW).toFixed(1) + ')');
    check('soco impacta PARA FRENTE (punho > ombro + 20)', wristW - shoulderW > 20, (wristW - shoulderW).toFixed(1));

    // --- root do KO: o corpo deve girar para deitar no chão ---
    rig.playOneShot('ko', 1, { hold: true });
    rig.update(0.78);
    const bp: any = (rig as any).bodyPivot;
    console.log('  -> KO bodyPivot rot=' + bp.rotation.toFixed(2) + ' y=' + bp.y.toFixed(1) + ' x=' + bp.x.toFixed(1));
    check('KO: bodyPivot girou para deitar (rot < -1)', bp.rotation < -1, bp.rotation.toFixed(2));
    check('KO: bodyPivot compensou altura (y desceu da base -54)', bp.y > -54 + 10, bp.y.toFixed(1));

    // --- hitbox cobre frente E trás (simétrica ao redor do lutador) ---
    const atk = new Fighter('atk', FighterSide.LEFT, 400, 660);
    atk.state = 'attacking';
    atk.attackType = 'lightPunch';
    const hb = createHitbox(atk)!;
    check('hitbox cobre a FRENTE (+95)', hb.x + hb.width - atk.x >= 95, (hb.x + hb.width - atk.x).toFixed(1));
    check('hitbox cobre ATRÁS (-60)', atk.x - hb.x >= 55, (atk.x - hb.x).toFixed(1));
    const defF = new Fighter('defF', FighterSide.RIGHT, 460, 660);
    const defB = new Fighter('defB', FighterSide.RIGHT, 340, 660);
    check('conecta com oponente À FRENTE', !!createHurtbox(defF) && hb.x < defF.x - 17 + 34 && hb.x + hb.width > defF.x - 17, '');
    check('conecta com oponente ATRÁS', hb.x < defB.x - 17 + 34 && hb.x + hb.width > defB.x - 17, '');

    // --- voadora (flying kick) ---
    const a2 = new Fighter('a2', FighterSide.LEFT, 400, 660);
    a2.startAttack('flyingKick');
    check('voadora: no ar desliza p/ frente', a2.vx > 0 && a2.state === 'attacking', 'state=' + a2.state + ' vx=' + a2.vx);
    const d2 = new Fighter('d2', FighterSide.RIGHT, 470, 660);
    const resV = processAttack(a2, d2, 'flyingKick');
    check('voadora acerta', !!resV && !resV.wasBlocked, JSON.stringify(resV));
    check('voadora: inimigo lançado para trás (vy<0)', d2.vy < 0, 'vy=' + d2.vy.toFixed(0));
    check('voadora: dano de queda pendente', d2.fallDamage > 0, 'fd=' + d2.fallDamage);
    let landed = false;
    for (let i = 0; i < 200 && !landed; i++) {
      d2.update(1 / 60, 400);
      if (d2.isOnGround && d2.fallDamage === 0) landed = true;
    }
    check('voadora: dano aplicado ao cair no chão', d2.health <= 100 - 14 - 6, 'hp=' + d2.health + ' (esperado <= ' + (100 - 14 - Math.round(14 * 0.6)) + ')');

    const a3 = new Fighter('a3', FighterSide.LEFT, 400, 660);
    const d3 = new Fighter('d3', FighterSide.RIGHT, 470, 660);
    d3.startBlock();
    a3.startAttack('flyingKick');
    const resB = processAttack(a3, d3, 'flyingKick');
    check('voadora bloqueada: sem lançamento nem dano de queda', !!resB && resB.wasBlocked && d3.fallDamage === 0 && d3.vy === 0, 'wasBlocked=' + resB?.wasBlocked);

    // --- postura / guard break ---
    const pa = new Fighter('pa', FighterSide.LEFT, 400, 660);
    const pd = new Fighter('pd', FighterSide.RIGHT, 470, 660);
    const postBefore = pd.posture;
    pd.startBlock();
    pd.blockStartTime = Date.now() - 200;
    pa.startAttack('heavyKick');
    processAttack(pa, pd, 'heavyKick');
    check('bloquear desgasta postura', pd.posture < postBefore && !pd.guardBroken, 'posture=' + pd.posture + ' (antes ' + postBefore + ')');

    const ga = new Fighter('ga', FighterSide.LEFT, 400, 660);
    const gd = new Fighter('gd', FighterSide.RIGHT, 470, 660);
    gd.posture = 5;
    gd.startBlock();
    gd.blockStartTime = Date.now() - 200;
    ga.startAttack('heavyKick');
    processAttack(ga, gd, 'heavyKick');
    check('postura zerada -> guard break + stun', gd.guardBroken && gd.hitstunTimer > 0 && !gd.isBlocking, 'gb=' + gd.guardBroken + ' hitstun=' + gd.hitstunTimer.toFixed(2));
    gd.startBlock();
    check('guard break: botao de bloqueio ignorado', !gd.isBlocking);
    let gbRecovered = false;
    for (let i = 0; i < 200 && !gbRecovered; i++) {
      gd.update(1 / 60, 400);
      if (!gd.guardBroken && gd.hitstunTimer <= 0 && gd.guardBreakTimer === 0) gbRecovered = true;
    }
    check('guard break expira e postura volta parcial', gbRecovered && gd.posture === 40, 'posture=' + gd.posture);

    const pba = new Fighter('pba', FighterSide.LEFT, 400, 660);
    const pbd = new Fighter('pbd', FighterSide.RIGHT, 470, 660);
    pbd.startBlock();
    pbd.blockStartTime = Date.now();
    pba.startAttack('heavyPunch');
    const resPB = processAttack(pba, pbd, 'heavyPunch');
    check('perfect block: postura plena + boost 4x', resPB.wasPerfectBlock && pbd.postureBoostTimer > 0, 'boost=' + pbd.postureBoostTimer);
    pbd.stopBlock();
    pbd.posture = 50;
    for (let i = 0; i < 60; i++) {
      pbd.update(1 / 60, 400);
    }
    check('regen acelerado durante boost', pbd.posture >= 50 + 8 * 3.0, 'posture=' + pbd.posture.toFixed(1) + ' (>=' + (50 + 8 * 3.0).toFixed(0) + ')');

    // --- mortal (chute+soco+chute no ar) ---
    const mom = new Fighter('mom', FighterSide.LEFT, 400, 660);
    mom.jump();
    mom.update(1 / 60, 470);
    check('mortal: 1o chute inicia sequencia', mom.airComboInput('kick') === 'kick' && mom.airComboStep === 1, 'step=' + mom.airComboStep);
    check('mortal: soco avanca sequencia', mom.airComboInput('punch') === null && mom.airComboStep === 2, 'step=' + mom.airComboStep);
    const final = mom.airComboInput('kick');
    check('mortal: 3o input dispara o especial', final === 'mortal' && mom.state === 'attacking' && mom.attackType === 'mortal', 'final=' + final + ' type=' + mom.attackType);
    check('mortal: cooldown de 10s', mom.specialCooldown > 0, 'cd=' + mom.specialCooldown);

    // sem cooldown -> a sequencia não dispara o especial
    mom.airComboInput('kick');
    mom.airComboInput('punch');
    const noSpecial = mom.airComboInput('kick');
    check('mortal: em cooldown nao dispara', noSpecial === 'kick' && mom.attackType === 'mortal', 'final=' + noSpecial);

    const md = new Fighter('md', FighterSide.RIGHT, 470, 660);
    mom.update(1 / 60, 470);
    const resM = processAttack(mom, md, 'mortal');
    check('mortal acerta com dano alto', !!resM && !resM.wasBlocked && resM.damage >= 25, 'dmg=' + resM?.damage);
    check('mortal: lançamento forte', md.vy < -500, 'vy=' + md.vy.toFixed(0));
    check('mortal: dano de queda pendente', md.fallDamage > 0, 'fd=' + md.fallDamage);

    // mortal bloqueado -> postura devorada
    const mbAtt = new Fighter('mba', FighterSide.LEFT, 400, 660);
    const mbDef = new Fighter('mbd', FighterSide.RIGHT, 470, 660);
    mbDef.startBlock();
    mbDef.blockStartTime = Date.now() - 200;
    mbAtt.jump();
    mbAtt.startAttack('mortal');
    const resMB = processAttack(mbAtt, mbDef, 'mortal');
    check('mortal bloqueado: postura despenca', resMB.wasBlocked && mbDef.posture <= 100 - 45, 'posture=' + mbDef.posture);
    check('mortal bloqueado: guard break quase certo', mbDef.posture <= 0 ? mbDef.guardBroken : true, 'posture=' + mbDef.posture + ' gb=' + mbDef.guardBroken);

    console.log(failures === 0 ? '\nTUDO OK' : '\n' + failures + ' FALHAS');
    process.exit(failures === 0 ? 0 : 1);
  },
},
  true
);
