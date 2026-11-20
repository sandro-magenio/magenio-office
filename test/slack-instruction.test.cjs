/**
 * T139 g3 · Il testo del bot non deve rientrare dai delimitatori, e il messaggio IPC deve
 * trasportare la provenienza come dato.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

function carica(relativo) {
  const uscita = fs.mkdtempSync(path.join(os.tmpdir(), 't139-ins-'));
  const compilato = path.join(uscita, 'm.js');
  fs.writeFileSync(compilato, ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', src(relativo)), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText);
  return require(compilato);
}
const src = (r) => r;
const precisa = carica('src/shared/slackInstruction.ts');
const preambolo = carica('src/shared/slackPreamble.ts');

const TESTO_BOT = 'Critical PHP security release, aggiornare 8.4.28';

test('notifica da un bot: l\'istruzione è solo il preambolo, e il testo compare una volta', () => {
  const autonomyPreamble = preambolo.buildTrustedBotNoticeProtocol({
    botId: 'B0A1DJMJJ2Y', channel: 'C0CGH5ARQGJ', threadTs: '1.1',
    helperPath: '/hive/reply', nodeCommand: '/hive/node', testo: TESTO_BOT,
  });
  const istruzione = precisa.buildGodInstruction({
    autonomyPreamble, text: TESTO_BOT, fromTrustedBot: 'B0A1DJMJJ2Y',
  });
  assert.strictEqual(istruzione, autonomyPreamble, 'il testo grezzo non si riaccoda');
  const occorrenze = istruzione.split(TESTO_BOT).length - 1;
  assert.strictEqual(occorrenze, 1, 'il testo compare una volta sola: ' + occorrenze);
  const apre = istruzione.indexOf('<<<NOTIFICA');
  const chiude = istruzione.indexOf('NOTIFICA>>>');
  assert.ok(istruzione.indexOf(TESTO_BOT) > apre && istruzione.indexOf(TESTO_BOT) < chiude,
    'e sta fra i delimitatori');
});

test('richiesta da una persona: preambolo più testo, come oggi', () => {
  assert.strictEqual(precisa.buildGodInstruction({ autonomyPreamble: '[P] ', text: 'ciao' }), '[P] ciao');
});

test('senza preambolo non c\'è istruzione', () => {
  assert.strictEqual(precisa.buildGodInstruction({ text: 'ciao' }), undefined);
});

test('il messaggio IPC porta fromTrustedBot e i file', () => {
  const msg = precisa.buildSlackIpcMessage({
    text: TESTO_BOT, channel: 'C', ts: '1.1', thread_ts: '1.1',
    fromTrustedBot: 'B0A1DJMJJ2Y', files: [{ path: '/x' }], buildPreamble: () => '[PRE]',
  });
  assert.strictEqual(msg.fromTrustedBot, 'B0A1DJMJJ2Y');
  assert.strictEqual(msg.autonomyPreamble, '[PRE]');
  assert.strictEqual(msg.text, TESTO_BOT, 'il testo resta per titolo e descrizione della scheda');
  assert.deepStrictEqual(msg.files, [{ path: '/x' }]);
});

test('un messaggio umano non porta fromTrustedBot', () => {
  const msg = precisa.buildSlackIpcMessage({
    text: 'ciao', channel: 'C', ts: '1.1', thread_ts: '1.1', buildPreamble: () => '[PRE]',
  });
  assert.strictEqual(msg.fromTrustedBot, undefined);
});
