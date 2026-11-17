/** T100/N3: la chiave con cui il pannello ricarica lo stato «token impostato».
 *  Deve cambiare quando cambia l'ELENCO degli agenti, non solo i progetti: se un
 *  agente esce dalla lista il suo segreto viene cancellato, e al rientro il
 *  pannello mostrerebbe «impostato» un token che non esiste piu'. */
export interface AgentRowsSource {
  [id: string]: { projects?: Record<string, { agents?: string[] }> } | undefined;
}

export const agentTokenRows = (defaults: AgentRowsSource | undefined): string[] =>
  Object.entries(defaults ?? {}).flatMap(([id, entry]) =>
    Object.entries(entry?.projects ?? {}).flatMap(([project, pe]) =>
      (pe.agents ?? []).map((agentId) => `${id}:${project}:${agentId}`))).sort();

export const agentTokenRowsKey = (defaults: AgentRowsSource | undefined): string =>
  agentTokenRows(defaults).join('\n');
