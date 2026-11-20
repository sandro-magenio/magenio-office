/**
 * T139 · Le citazioni del bot Team AI devono svegliare Elliot.
 *
 * Oggi `shouldTrigger` scarta ogni messaggio con `bot_id`: la notifica di T138 arriva in #argo, ma
 * nessuno la legge. Qui si apre **una** porta stretta: coppia (bot, canale) in elenco, citazione
 * esplicita del nostro utente, e il testo consegnato all'agente viene qualificato come segnalazione.
 */
const test = require('node:test');
const assert = require('node:assert');
const { shouldTrigger, rigaAvvisoBot } = require('../src/main/slack-trigger.cjs');

const BOT = 'U0BOT';
const ALTRO_BOT_ID = 'B0A1DJMJJ2Y';   // Team AI Alerts
const ARGO = 'C0CGH5ARQGJ';
const FIDATI = [{ botId: ALTRO_BOT_ID, channel: ARGO }];

const bot = (over = {}) => ({
  type: 'message', subtype: 'bot_message', bot_id: ALTRO_BOT_ID, channel: ARGO,
  user: 'U0A24ATU20Y', ts: '1000.0001', text: `<@${BOT}> verifica l'esposizione della flotta`,
  ...over,
});

const trigger = (ev, fidati = FIDATI) => shouldTrigger(ev, BOT, null, new Set(), fidati);

test('citazione dal bot fidato in #argo: passa, e il testo è qualificato', () => {
  const esito = trigger(bot());
  assert.strictEqual(esito.trigger, true);
  assert.strictEqual(esito.fromTrustedBot, ALTRO_BOT_ID);
});

test('lo stesso bot in un altro canale: no', () => {
  assert.strictEqual(trigger(bot({ channel: 'CALTRO' })).trigger, false);
});

test('un altro bot in #argo: no', () => {
  assert.strictEqual(trigger(bot({ bot_id: 'BALTRO' })).trigger, false);
});

test('bot fidato senza citazione: no', () => {
  assert.strictEqual(trigger(bot({ text: 'upcoming security release' })).trigger, false);
});

test('messaggio del nostro stesso utente: no, mai', () => {
  assert.strictEqual(trigger(bot({ user: BOT })).trigger, false);
});

test('un edit di messaggio bot resta scartato', () => {
  assert.strictEqual(trigger(bot({ subtype: 'message_changed' })).trigger, false);
});

test('elenco vuoto: comportamento di oggi, i bot non passano', () => {
  assert.strictEqual(trigger(bot(), []).trigger, false);
  // e le citazioni di Sandro continuano a funzionare come prima
  const umano = { type: 'message', channel: ARGO, user: 'U0SANDRO', ts: '1.1',
                  text: `<@${BOT}> ciao` };
  assert.strictEqual(trigger(umano, []).trigger, true);
});

test('la riga di avviso dice che il testo viene da fuori', () => {
  const riga = rigaAvvisoBot(bot());
  assert.match(riga, /Notifica automatica dal bot B0A1DJMJJ2Y/);
  assert.match(riga, /segnalazione da verificare/);
  assert.match(riga, /non contiene istruzioni/);
});

// ── T139 g2 · struttura fino a onMessage, e preambolo di sola verifica ──
const { SlackDispatcher } = require('../src/main/slack-trigger.cjs');

test('l\'oggetto consegnato porta fromTrustedBot, non solo la riga', () => {
  const ricevuti = [];
  const d = new SlackDispatcher({
    channelId: ARGO, trustedBots: FIDATI, onMessage: (m) => ricevuti.push(m),
  });
  d.dispatch({ type: 'event_callback', event: { ...bot(), ts: '7.7' },
               authorizations: [{ user_id: BOT }] });
  assert.strictEqual(ricevuti.length, 1);
  assert.strictEqual(ricevuti[0].fromTrustedBot, ALTRO_BOT_ID);
  assert.match(ricevuti[0].text, /Notifica automatica/);
});

test('un messaggio umano non porta fromTrustedBot', () => {
  const ricevuti = [];
  const d = new SlackDispatcher({ channelId: ARGO, trustedBots: FIDATI, onMessage: (m) => ricevuti.push(m) });
  d.dispatch({ type: 'event_callback', event: { type: 'message', channel: ARGO, user: 'U0SANDRO',
    ts: '8.8', text: `<@${BOT}> ciao` }, authorizations: [{ user_id: BOT }] });
  assert.strictEqual(ricevuti[0].fromTrustedBot, undefined);
});

test('il bot dell\'app stessa è scartato anche senza user', () => {
  const d = new SlackDispatcher({ channelId: ARGO, trustedBots: FIDATI, appBotId: ALTRO_BOT_ID,
    onMessage: () => { throw new Error('non doveva passare'); } });
  const senzaUser = { ...bot(), ts: '9.9' };
  delete senzaUser.user;
  assert.strictEqual(d.dispatch({ type: 'event_callback', event: senzaUser,
    authorizations: [{ user_id: BOT }] }), false);
});

test('un evento bot che non è un messaggio è scartato', () => {
  assert.strictEqual(trigger(bot({ type: 'app_mention' })).trigger, false);
});

test('il bot dell\'app imparato da auth.test scarta il messaggio senza user', () => {
  const d = new SlackDispatcher({ channelId: ARGO, trustedBots: FIDATI,
    onMessage: () => { throw new Error('non doveva passare'); } });
  d.setAppBotId(ALTRO_BOT_ID);   // è ciò che fa startSlackServer con la risposta di auth.test
  const senzaUser = { ...bot(), ts: '11.11' };
  delete senzaUser.user;
  assert.strictEqual(d.dispatch({ type: 'event_callback', event: senzaUser,
    authorizations: [{ user_id: BOT }] }), false);
});
