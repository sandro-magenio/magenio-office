/**
 * T139 g4 · I due collegamenti del main, letti nel sorgente.
 *
 * Trenton ha mostrato che due mutazioni restavano verdi: la provenienza non passata al costruttore del
 * messaggio, e il bot dell'app non consegnato al filtro dopo `auth.test`. Sono il confine di sicurezza
 * della scheda, e un test che legge il sorgente li vede anche quando il codice compila.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');

/** Il blocco di `onMessage` che costruisce il messaggio per il renderer. */
function bloccoIpc() {
  const inizio = main.indexOf('const ipcMsg = buildSlackIpcMessage({');
  assert.notStrictEqual(inizio, -1, 'buildSlackIpcMessage deve essere chiamata da onMessage');
  return main.slice(inizio, main.indexOf('\n    });', inizio));
}

test('onMessage passa la provenienza al costruttore del messaggio', () => {
  const blocco = bloccoIpc();
  // La prima occorrenza è quella che costruisce il messaggio: deve essere il campo del messaggio,
  // non un valore inventato. La seconda guida la scelta del preambolo.
  const occorrenze = blocco.match(/fromTrustedBot:\s*[^,\n]+/g) || [];
  assert.deepStrictEqual(occorrenze,
    ['fromTrustedBot: m.fromTrustedBot', 'fromTrustedBot: m.fromTrustedBot'],
    'entrambe devono venire dal messaggio ricevuto');
  assert.ok(blocco.indexOf('fromTrustedBot:') < blocco.indexOf('files:'),
    'la provenienza precede i file: è un argomento del costruttore, non un dettaglio interno');
});

test('dopo auth.test il bot dell\'app arriva al filtro', () => {
  const inizio = main.indexOf("fetch('https://slack.com/api/auth.test'");
  assert.notStrictEqual(inizio, -1, 'auth.test deve essere chiamata');
  const dopo = main.slice(inizio, inizio + 800);
  assert.match(dopo, /slackServer\.setAppBotId\(corpo\.bot_id\)/,
    'senza questo, l\'anti-loop sul bot dell\'app non è attivo');
});
