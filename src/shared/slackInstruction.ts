/**
 * T139 g3 · L'istruzione che arriva a god, e la scelta che la rende sicura.
 *
 * Per una richiesta umana l'istruzione è preambolo + testo. Per una notifica da un bot il preambolo
 * **contiene già** il testo fra i delimitatori: riaccodarlo lo farebbe rientrare fuori dai delimitatori,
 * dove sembrerebbe una istruzione. Qui la regola sta in una funzione pura, così vale in ogni punto.
 */

export interface GodInstructionInput {
  autonomyPreamble?: string;
  text: string;
  fromTrustedBot?: string;
}

export function buildGodInstruction(input: GodInstructionInput): string | undefined {
  if (!input.autonomyPreamble) return undefined;
  // Il testo del bot è già dentro il preambolo, fra i delimitatori: non si riaccoda.
  if (input.fromTrustedBot) return input.autonomyPreamble;
  return `${input.autonomyPreamble}${input.text}`;
}

export interface SlackIpcMessage {
  text: string;
  channel: string;
  ts: string;
  thread_ts: string;
  autonomyPreamble: string;
  fromTrustedBot?: string;
  files?: unknown[];
}

export interface SlackIpcInput {
  text: string;
  channel: string;
  ts: string;
  thread_ts: string;
  fromTrustedBot?: string;
  files?: unknown[];
  buildPreamble: () => string;
}

/**
 * Il messaggio che il main manda al renderer. `text` resta per il titolo e la descrizione della
 * scheda; la provenienza viaggia come campo strutturato, non come frase nel testo.
 */
export function buildSlackIpcMessage(input: SlackIpcInput): SlackIpcMessage {
  const msg: SlackIpcMessage = {
    text: input.text,
    channel: input.channel,
    ts: input.ts,
    thread_ts: input.thread_ts,
    autonomyPreamble: input.buildPreamble(),
  };
  if (input.fromTrustedBot) msg.fromTrustedBot = input.fromTrustedBot;
  if (input.files && input.files.length > 0) msg.files = input.files;
  return msg;
}
